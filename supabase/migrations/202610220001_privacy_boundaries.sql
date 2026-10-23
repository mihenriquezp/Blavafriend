-- Apply as the database owner. Transactional and safe to re-run.
begin;

-- Keep the legacy public column permanently empty, including for old clients.
-- The private value follows the profile; only its current owner can access it.
create table if not exists public.student_private (
  student_id uuid primary key references public.students(id) on delete cascade,
  birth_year smallint check (birth_year between 1930 and 2015)
);
alter table public.student_private enable row level security;
insert into public.student_private(student_id, birth_year)
  select id, birth_year from public.students where birth_year is not null
  on conflict (student_id) do nothing;
update public.students set birth_year = null where birth_year is not null;
alter table public.students drop constraint if exists students_birth_year_private;
alter table public.students add constraint students_birth_year_private check (birth_year is null);
drop policy if exists "owner manages private profile" on public.student_private;
create policy "owner manages private profile" on public.student_private
  for all to authenticated
  using (public.is_member() and exists (
    select 1 from public.students s where s.id = student_id and s.user_id = auth.uid()
  ))
  with check (public.is_member() and exists (
    select 1 from public.students s where s.id = student_id and s.user_id = auth.uid()
  ));
revoke all on public.student_private from anon;
grant select, insert, update, delete on public.student_private to authenticated;

-- One transaction for the public profile and its optional private year.
-- SECURITY INVOKER keeps the same RLS/role protections as ordinary updates.
create or replace function public.update_student_profile(p_id uuid, p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare
  old_student public.students;
  updated public.students;
  private_year smallint;
begin
  if not public.is_member() or jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'Not allowed';
  end if;
  select * into old_student from public.students where id = p_id for update;
  if old_student.id is null or not (old_student.user_id = auth.uid() or public.is_admin())
     or (old_student.user_id is null and not public.is_admin()) then
    raise exception 'Not allowed';
  end if;
  if exists (select 1 from jsonb_object_keys(p_patch) k where k <> all (array['full_name','age','country_residence','country_origin','job_title','college','family_status','policy_interests','hobbies','languages','bio','photo_url','linkedin','instagram','x_handle','whatsapp','nickname','gender','undergrad_fields','role','birth_day','birth_month','birth_year'])) then
    raise exception 'Unsupported profile field';
  end if;
  if p_patch ? 'birth_year' then
    if old_student.user_id is distinct from auth.uid() then
      raise exception 'Only the profile owner can edit the birth year';
    end if;
    insert into public.student_private(student_id, birth_year)
      values (p_id, (p_patch ->> 'birth_year')::smallint)
      on conflict (student_id) do update set birth_year = excluded.birth_year;
  end if;
  updated := jsonb_populate_record(old_student, p_patch - 'birth_year');
  update public.students set
    full_name = updated.full_name,
    age = updated.age,
    country_residence = updated.country_residence,
    country_origin = updated.country_origin,
    job_title = updated.job_title,
    college = updated.college,
    family_status = updated.family_status,
    policy_interests = updated.policy_interests,
    hobbies = updated.hobbies,
    languages = updated.languages,
    bio = updated.bio,
    photo_url = updated.photo_url,
    linkedin = updated.linkedin,
    instagram = updated.instagram,
    x_handle = updated.x_handle,
    whatsapp = updated.whatsapp,
    nickname = updated.nickname,
    gender = updated.gender,
    undergrad_fields = updated.undergrad_fields,
    role = updated.role,
    birth_day = updated.birth_day,
    birth_month = updated.birth_month
    where id = p_id returning * into updated;
  select birth_year into private_year from public.student_private where student_id = p_id;
  return to_jsonb(updated) || jsonb_build_object('birth_year', private_year);
end;
$$;
revoke all on function public.update_student_profile(uuid,jsonb) from public, anon;
grant execute on function public.update_student_profile(uuid,jsonb) to authenticated;

-- Cohort sharing is voluntary. No existing account is opted in by migration.
create table if not exists public.cohort_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null,
  notice_version text not null,
  updated_at timestamptz not null default now()
);
alter table public.cohort_consents enable row level security;
revoke all on public.cohort_consents from public, anon, authenticated;
grant select on public.cohort_consents to authenticated;
drop policy if exists "owner reads cohort consent" on public.cohort_consents;
create policy "owner reads cohort consent" on public.cohort_consents
  for select to authenticated using (user_id = auth.uid() and public.is_member());

create or replace function public.cohort_notice_version()
returns text language sql immutable set search_path = public
as $$ select '2026-10-23.v1'::text $$;

create or replace function public.get_cohort_consent()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare choice public.cohort_consents;
begin
  if not public.is_member() then raise exception 'Not allowed'; end if;
  select * into choice from public.cohort_consents where user_id = auth.uid();
  return jsonb_build_object(
    'enabled', coalesce(choice.enabled and choice.notice_version = public.cohort_notice_version(), false),
    'version', public.cohort_notice_version(), 'updated_at', choice.updated_at
  );
end;
$$;

create or replace function public.set_cohort_consent(p_enabled boolean, p_version text)
returns jsonb language plpgsql volatile security definer set search_path = public
as $$
begin
  if not public.is_member() or p_enabled is null then raise exception 'Not allowed'; end if;
  if p_enabled and p_version is distinct from public.cohort_notice_version() then
    raise exception 'The sharing notice has changed. Refresh the app before agreeing.';
  end if;
  insert into public.cohort_consents(user_id,enabled,notice_version,updated_at)
    values (auth.uid(),p_enabled,public.cohort_notice_version(),now())
    on conflict (user_id) do update set enabled = excluded.enabled,
      notice_version = excluded.notice_version, updated_at = excluded.updated_at;
  return public.get_cohort_consent();
end;
$$;
revoke all on function public.get_cohort_consent() from public, anon;
revoke all on function public.set_cohort_consent(boolean,text) from public, anon;
grant execute on function public.get_cohort_consent() to authenticated;
grant execute on function public.set_cohort_consent(boolean,text) to authenticated;

-- These exact statistics intentionally remain available with informed consent.
-- Both endpoints must opt in: a consenting rater cannot publish an opted-out
-- classmate's connections. Apply the same scope to nodes, all counts and history.
create or replace function public.cohort_overview(p_continents jsonb default '{}'::jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  me uuid;
  result jsonb;
begin
  if not public.is_member() then
    raise exception 'Not allowed';
  end if;
  select id into me from public.students where user_id = auth.uid();

  with
  people as (
    select s.id,
           (row_number() over (order by random()) - 1)::int as node,
           p_continents ->> s.country_origin as continent
    from public.students s
    join public.cohort_consents consent on consent.user_id = s.user_id
    where s.role = 'student' and consent.enabled
      and consent.notice_version = public.cohort_notice_version()
      and not exists (select 1 from public.account_deletions d where d.user_id = s.user_id)
  ),
  dir as (
    select o.id as rater, r.student_id as ratee, r.level
    from public.relationships r
    join public.students o on o.user_id = r.owner_id
    join public.students t on t.id = r.student_id
    join people po on po.id = o.id
    join people pt on pt.id = t.id
    where r.level > 0 and r.student_id <> o.id
  ),
  pairs as (
    select least(rater, ratee) as a, greatest(rater, ratee) as b,
           max(level) as level,
           max(level) filter (where rater = me) as my_level
    from dir
    group by 1, 2
  ),
  edges as (
    select pa.node as i, pb.node as j,
           case when me is not null and me in (p.a, p.b) then p.my_level else p.level end as level
    from pairs p
    join people pa on pa.id = p.a
    join people pb on pb.id = p.b
    where not (me is not null and me in (p.a, p.b)) or p.my_level is not null
  ),
  groups as (
    select continent, count(*)::int as size
    from people
    where continent is not null
    group by continent
    having count(*) >= 5
  ),
  group_pairs as (
    select least(pa.continent, pb.continent) as g1, greatest(pa.continent, pb.continent) as g2,
           count(*)::int as met
    from pairs p
    join people pa on pa.id = p.a
    join people pb on pb.id = p.b
    where pa.continent is not null and pb.continent is not null
    group by 1, 2
  ),
  mixing as (
    select x.continent as g1, y.continent as g2, coalesce(gp.met, 0) as met,
           case when x.continent = y.continent then x.size * (x.size - 1) / 2 else x.size * y.size end as total
    from groups x
    join groups y on x.continent <= y.continent
    left join group_pairs gp on gp.g1 = x.continent and gp.g2 = y.continent
  ),
  eligible_history as (
    select e.*, o.id as rater from public.relationship_events e
    join public.students o on o.user_id = e.owner_id
    join people po on po.id = o.id
    join people pt on pt.id = e.student_id
    where e.student_id <> o.id
  ),
  weekly as (
    select w.week::date as week, c.met, c.great
    from generate_series(
      date_trunc('week', (select min(created_at) from eligible_history)),
      date_trunc('week', now()),
      interval '1 week'
    ) as w(week)
    cross join lateral (
      select count(*)::int as met, count(*) filter (where pp.level >= 3)::int as great
      from (
        select max(st.level) as level
        from (
          select distinct on (e.owner_id, e.student_id) e.rater, e.student_id as ratee, e.to_level as level
          from eligible_history e
          where e.created_at < w.week + interval '1 week'
          order by e.owner_id, e.student_id, e.created_at desc, e.id desc
        ) st
        where st.level > 0
        group by least(st.rater, st.ratee), greatest(st.rater, st.ratee)
      ) pp
    ) c
  )
  select jsonb_build_object(
    'consent_version', public.cohort_notice_version(),
    'students', (select count(*) from people),
    'claimed', (select count(*) from people),
    'trackers', (select count(distinct rater) from dir),
    'pairs', jsonb_build_object(
      'met', (select count(*) from pairs),
      'great', (select count(*) from pairs where level >= 3),
      'friends', (select count(*) from pairs where level = 4)
    ),
    'me', (select node from people where id = me),
    'edges', coalesce((select jsonb_agg(jsonb_build_array(i, j, level)) from edges), '[]'::jsonb),
    'weekly', coalesce((select jsonb_agg(jsonb_build_object('week', week, 'met', met, 'great', great) order by week) from weekly), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('name', continent, 'size', size) order by size desc) from groups), '[]'::jsonb),
    'mixing', coalesce((select jsonb_agg(jsonb_build_object('a', g1, 'b', g2, 'met', met, 'total', total)) from mixing), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- A durable, private retry record spans Storage and Auth API operations.
-- No foreign keys: it must survive deletion of the account and profile.
create table if not exists public.account_deletions (
  student_id uuid primary key,
  user_id uuid,
  requested_at timestamptz not null default now()
);
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from public, anon, authenticated;

-- Pending/deleted accounts must not keep using an otherwise unexpired JWT.
-- Cohort email eligibility and profile-claiming rules are unchanged.
create or replace function public.is_active_account()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from auth.users where id = auth.uid())
    and not exists (select 1 from public.account_deletions where user_id = auth.uid());
$$;
create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_active_account()
    and public.is_allowed_email(coalesce(auth.jwt() ->> 'email', ''));
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_active_account() and exists (
    select 1 from public.app_admins where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Do not allow an admin to reassign/reclaim a profile while it is being erased.
create or replace function public.guard_pending_student_deletion()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.account_deletions where student_id = new.id) then
    raise exception 'Account deletion in progress; retry deletion to finish';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_pending_student_deletion on public.students;
create trigger guard_pending_student_deletion before insert or update on public.students
  for each row execute function public.guard_pending_student_deletion();

-- Auth deletion now cascades to the directory, private year and target-side
-- records; all other user-owned app data already has ON DELETE CASCADE.
alter table public.students drop constraint if exists students_user_id_fkey;
alter table public.students add constraint students_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.custom_tags drop constraint if exists custom_tags_created_by_fkey;
alter table public.custom_tags add constraint custom_tags_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete cascade;

-- Explicit email invitations are personal data too (not covered by user_id FKs).
create or replace function public.erase_deleted_account_email()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  delete from public.allowed_emails where email = lower(old.email);
  return old;
end;
$$;
drop trigger if exists erase_deleted_account_email on auth.users;
create trigger erase_deleted_account_email before delete on auth.users
  for each row execute function public.erase_deleted_account_email();

-- An old frontend must never report success after only deleting a profile.
drop policy if exists "admin deletes students" on public.students;
revoke delete on public.students from anon, authenticated;

-- Block new uploads both by a pending account and to a pending profile (including
-- uploads by another admin). Existing Storage delete operations use service_role.
create or replace function public.erasure_storage_allowed(p_bucket text, p_name text, p_owner text)
returns boolean language sql stable security definer set search_path = public
as $$
  select not exists (select 1 from public.account_deletions d where
    d.user_id::text = p_owner
    or (p_bucket = 'photos' and split_part(p_name,'/',1) = d.student_id::text)
    or (p_bucket = 'event-photos' and split_part(p_name,'/',1) = d.user_id::text));
$$;
drop policy if exists "no storage access during erasure" on storage.objects;
create policy "no storage access during erasure" on storage.objects as restrictive
  for all to authenticated
  using (public.is_active_account() and public.erasure_storage_allowed(bucket_id,name,owner_id))
  with check (public.is_active_account() and public.erasure_storage_allowed(bucket_id,name,owner_id));

-- Recovery stays available after Auth cascades the profile out of the directory.
create or replace function public.admin_pending_deletions()
returns table(student_id uuid, requested_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Only admins can see pending deletions'; end if;
  return query select d.student_id, d.requested_at from public.account_deletions d order by d.requested_at;
end;
$$;
revoke all on function public.admin_pending_deletions() from public, anon;
grant execute on function public.admin_pending_deletions() to authenticated;

-- These RPCs are available ONLY to the Edge Function's service role.
-- p_actor is obtained from Auth.getUser(bearerToken), never from the request body.
create or replace function public.prepare_account_deletion(p_student uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  target public.students;
  job public.account_deletions;
begin
  if not exists (select 1 from auth.users u join public.app_admins a on a.email = lower(u.email)
                 where u.id = p_actor) then raise exception 'Only admins can delete accounts'; end if;
  -- Serialize retries, including after the profile has already been cascaded.
  perform pg_advisory_xact_lock(hashtextextended(p_student::text, 0));
  select * into job from public.account_deletions where student_id = p_student;
  if found then return to_jsonb(job); end if;
  select * into target from public.students where id = p_student for update;
  if not found then return null; end if;
  if target.user_id = p_actor or exists (
    select 1 from auth.users u join public.app_admins a on a.email = lower(u.email)
    where u.id = target.user_id
  ) then raise exception 'Remove the admin role before deleting this account'; end if;
  insert into public.account_deletions(student_id,user_id) values (target.id,target.user_id)
    returning * into job;
  return to_jsonb(job);
end;
$$;

-- Page from the remaining objects, not an offset: each successful API removal
-- shrinks the result. Include all objects owned by the user, plus app paths that
-- may have been uploaded on their behalf by an admin (and old unused uploads).
create or replace function public.account_deletion_objects(p_student uuid)
returns table(bucket_id text, name text)
language sql stable security definer set search_path = public
as $$
  select o.bucket_id, o.name from storage.objects o
  join public.account_deletions d on d.student_id = p_student
  where o.owner_id = d.user_id::text
    or (o.bucket_id = 'photos' and split_part(o.name,'/',1) = d.student_id::text)
    or (o.bucket_id = 'event-photos' and split_part(o.name,'/',1) = d.user_id::text)
  order by o.bucket_id, o.name limit 100;
$$;

create or replace function public.finish_account_deletion(p_student uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare job public.account_deletions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_student::text, 0));
  select * into job from public.account_deletions where student_id = p_student for update;
  if not found then
    if exists (select 1 from public.students where id = p_student) then
      raise exception 'Deletion was not prepared';
    end if;
    return;
  end if;
  if exists (select 1 from public.account_deletion_objects(p_student)) then
    raise exception 'Storage cleanup incomplete; retry deletion';
  end if;
  if exists (select 1 from auth.users where id = job.user_id) then
    raise exception 'Auth deletion incomplete; retry deletion';
  end if;
  delete from public.students where id = p_student; -- Also handles unclaimed profiles.
  delete from public.account_deletions where student_id = p_student;
end;
$$;
revoke all on function public.prepare_account_deletion(uuid,uuid) from public, anon, authenticated;
revoke all on function public.account_deletion_objects(uuid) from public, anon, authenticated;
revoke all on function public.finish_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid,uuid) to service_role;
grant execute on function public.account_deletion_objects(uuid) to service_role;
grant execute on function public.finish_account_deletion(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
