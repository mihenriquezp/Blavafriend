-- Blavafriend database schema.
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to re-run: every object is created with "if not exists" / "or replace".

-------------------------------------------------------------------------------
-- Admins and access control
-------------------------------------------------------------------------------

-- Admin emails (lower case). Add yourself after running this file:
--   insert into public.app_admins (email) values ('you@college.ox.ac.uk');
create table if not exists public.app_admins (
  email text primary key check (email = lower(email))
);

-- Extra non-Oxford emails allowed to sign in (e.g. for testing).
create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email))
);

alter table public.app_admins enable row level security;
alter table public.allowed_emails enable row level security;
-- No policies: only the dashboard / service role can read or write these.

create or replace function public.is_allowed_email(p_email text)
returns boolean
language sql stable security definer set search_path = public
as $$
  -- Only Oxford username addresses (e.g. abcd1234@ox.ac.uk): one per person, so nobody
  -- ends up with two accounts via their name@college.ox.ac.uk alias.
  select lower(trim(p_email)) ~ '^[a-z]+[0-9]+@ox\.ac\.uk$'
      or exists (select 1 from public.allowed_emails where email = lower(p_email));
$$;

create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and public.is_allowed_email(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.app_admins where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Reject sign-ups from non-Oxford emails at the source.
create or replace function public.enforce_oxford_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.email is null or not public.is_allowed_email(new.email) then
    raise exception 'Blavafriend only accepts Oxford username emails, like abcd1234@ox.ac.uk';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_oxford_email on auth.users;
create trigger enforce_oxford_email
  before insert on auth.users
  for each row execute function public.enforce_oxford_email();

-------------------------------------------------------------------------------
-- Students (the shared directory)
-------------------------------------------------------------------------------

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 120),
  age smallint check (age between 16 and 99),
  country_residence text,
  country_origin text,
  job_title text check (char_length(job_title) <= 200),
  college text,
  family_status text check (family_status in ('none', 'partner', 'family', 'partner_family')),
  policy_interests text[] not null default '{}',
  hobbies text[] not null default '{}',
  languages text[] not null default '{}',
  bio text check (char_length(bio) <= 1000),
  photo_url text,
  linkedin text,
  instagram text,
  x_handle text,
  whatsapp text,
  nickname text check (char_length(nickname) <= 40),
  gender text check (gender in ('woman', 'man', 'non_binary', 'other', 'prefer_not_say')),
  undergrad_fields text[] not null default '{}',
  role text not null default 'student' check (role in ('student', 'faculty')),
  birth_day smallint check (birth_day between 1 and 31),
  birth_month smallint check (birth_month between 1 and 12),
  birth_year smallint check (birth_year between 1930 and 2015),
  user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Columns added after the first release (safe to re-run).
alter table public.students add column if not exists nickname text check (char_length(nickname) <= 40);
alter table public.students add column if not exists gender text
  check (gender in ('woman', 'man', 'non_binary', 'other', 'prefer_not_say'));
alter table public.students add column if not exists undergrad_fields text[] not null default '{}';
-- 'faculty' = faculty or staff: listed in People but left out of every statistic.
alter table public.students add column if not exists role text not null default 'student'
  check (role in ('student', 'faculty'));
-- Birthday: day and month (shown in the app); the year is optional and never shown.
alter table public.students add column if not exists birth_day smallint check (birth_day between 1 and 31);
alter table public.students add column if not exists birth_month smallint check (birth_month between 1 and 12);
alter table public.students add column if not exists birth_year smallint check (birth_year between 1930 and 2015);

alter table public.students enable row level security;

drop policy if exists "members read students" on public.students;
create policy "members read students" on public.students
  for select using (public.is_member());

drop policy if exists "owner or admin updates student" on public.students;
create policy "owner or admin updates student" on public.students
  for update using (public.is_member() and (user_id = auth.uid() or public.is_admin()))
  with check (public.is_member() and (user_id = auth.uid() or public.is_admin()));

drop policy if exists "admin inserts students" on public.students;
create policy "admin inserts students" on public.students
  for insert with check (public.is_admin());

drop policy if exists "admin deletes students" on public.students;
create policy "admin deletes students" on public.students
  for delete using (public.is_admin());

-- Non-admins cannot change who owns a profile; keep updated_at fresh.
create or replace function public.students_before_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Only guards requests from app users; the dashboard (and deleting a user,
  -- which unlinks their profile) runs without an app login and must pass.
  if new.user_id is distinct from old.user_id
     and auth.uid() is not null
     and not public.is_admin()
     and current_setting('blavafriend.claiming', true) is distinct from 'on' then
    raise exception 'Only an admin can change profile ownership';
  end if;
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin can change whether someone is a student or faculty/staff';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists students_before_update on public.students;
create trigger students_before_update
  before update on public.students
  for each row execute function public.students_before_update();

-- "This is me": link the signed-in user to an unclaimed profile.
create or replace function public.claim_student(p_student_id uuid)
returns public.students
language plpgsql security definer set search_path = public
as $$
declare
  result public.students;
begin
  if not public.is_member() then
    raise exception 'Not allowed';
  end if;
  if exists (select 1 from public.students where user_id = auth.uid()) then
    raise exception 'You have already claimed a profile';
  end if;
  perform set_config('blavafriend.claiming', 'on', true);
  update public.students set user_id = auth.uid()
    where id = p_student_id and user_id is null
    returning * into result;
  perform set_config('blavafriend.claiming', 'off', true);
  if result.id is null then
    raise exception 'This profile has already been claimed. If it is yours, contact the admin.';
  end if;
  return result;
end;
$$;

-- "I'm not on the list": create a new profile owned by the signed-in user.
create or replace function public.create_my_student(p_full_name text)
returns public.students
language plpgsql security definer set search_path = public
as $$
declare
  result public.students;
begin
  if not public.is_member() then
    raise exception 'Not allowed';
  end if;
  if exists (select 1 from public.students where user_id = auth.uid()) then
    raise exception 'You have already claimed a profile';
  end if;
  insert into public.students (full_name, user_id)
    values (trim(p_full_name), auth.uid())
    returning * into result;
  return result;
end;
$$;

-------------------------------------------------------------------------------
-- Relationships (PRIVATE: each row is only visible to its owner)
-------------------------------------------------------------------------------

create table if not exists public.relationships (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  level smallint not null default 0 check (level between 0 and 4),
  starred boolean not null default false,
  note text check (char_length(note) <= 4000),
  updated_at timestamptz not null default now(),
  primary key (owner_id, student_id)
);

alter table public.relationships enable row level security;

drop policy if exists "owner manages own relationships" on public.relationships;
create policy "owner manages own relationships" on public.relationships
  for all using (owner_id = auth.uid() and public.is_member())
  with check (owner_id = auth.uid() and public.is_member());

create table if not exists public.relationship_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  from_level smallint not null,
  to_level smallint not null,
  created_at timestamptz not null default now()
);

create index if not exists relationship_events_owner_idx
  on public.relationship_events (owner_id, created_at);

alter table public.relationship_events enable row level security;

drop policy if exists "owner reads own events" on public.relationship_events;
create policy "owner reads own events" on public.relationship_events
  for select using (owner_id = auth.uid());
-- No insert policy: events are written only by the trigger below.

create or replace function public.relationships_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists relationships_touch on public.relationships;
create trigger relationships_touch
  before update on public.relationships
  for each row execute function public.relationships_touch();

-- Runs AFTER the row passed its RLS checks, so only the owner's own changes are logged.
create or replace function public.relationships_log_level()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  old_level smallint := case when tg_op = 'INSERT' then 0 else old.level end;
begin
  if new.level <> old_level then
    insert into public.relationship_events (owner_id, student_id, from_level, to_level)
      values (new.owner_id, new.student_id, old_level, new.level);
  end if;
  return null;
end;
$$;

drop trigger if exists relationships_log_level on public.relationships;
create trigger relationships_log_level
  after insert or update of level on public.relationships
  for each row execute function public.relationships_log_level();

-------------------------------------------------------------------------------
-- Custom tags ("Other…" hobbies, languages and degrees added by students)
-------------------------------------------------------------------------------

create table if not exists public.custom_tags (
  kind text not null,
  label text not null check (char_length(label) between 1 and 40),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (kind, label)
);

alter table public.custom_tags drop constraint if exists custom_tags_kind_check;
alter table public.custom_tags add constraint custom_tags_kind_check check (kind in ('hobby', 'language', 'degree'));

alter table public.custom_tags enable row level security;

drop policy if exists "members read tags" on public.custom_tags;
create policy "members read tags" on public.custom_tags
  for select using (public.is_member());

drop policy if exists "members add tags" on public.custom_tags;
create policy "members add tags" on public.custom_tags
  for insert with check (public.is_member() and created_by = auth.uid());

drop policy if exists "admin deletes tags" on public.custom_tags;
create policy "admin deletes tags" on public.custom_tags
  for delete using (public.is_admin());

-------------------------------------------------------------------------------
-- Profile photos (Storage bucket "photos")
-------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Files live at photos/<student_id>/<random>.jpg
drop policy if exists "owner or admin uploads photo" on storage.objects;
create policy "owner or admin uploads photo" on storage.objects
  for insert with check (
    bucket_id = 'photos' and public.is_member() and (
      public.is_admin() or exists (
        select 1 from public.students s
        where s.id::text = (storage.foldername(name))[1] and s.user_id = auth.uid()
      )
    )
  );

drop policy if exists "owner or admin deletes photo" on storage.objects;
create policy "owner or admin deletes photo" on storage.objects
  for delete using (
    bucket_id = 'photos' and public.is_member() and (
      public.is_admin() or exists (
        select 1 from public.students s
        where s.id::text = (storage.foldername(name))[1] and s.user_id = auth.uid()
      )
    )
  );

-------------------------------------------------------------------------------
-- Cohort view (anonymous aggregates only)
-------------------------------------------------------------------------------
-- Everyone's levels feed a cohort-wide picture, without exposing who rated whom.
-- Only students count: faculty/staff and any ratings to or from them are left out.
--   * only totals, weekly totals, an unnamed network and group-level mixing;
--   * node numbers are shuffled on every call, so nodes can't be tracked over time;
--   * the caller's own node only shows ties the caller created, so nobody can
--     learn that someone else rated them;
--   * groups (continents) with fewer than 5 people are left out of the mixing.
-- A pair "has met" if either person rated the other >= 1; its level is the higher
-- of the two ratings.
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
    where s.role = 'student'
  ),
  dir as (
    select o.id as rater, r.student_id as ratee, r.level
    from public.relationships r
    join public.students o on o.user_id = r.owner_id
    join public.students t on t.id = r.student_id
    where r.level > 0 and r.student_id <> o.id and o.role = 'student' and t.role = 'student'
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
  weekly as (
    select w.week::date as week, c.met, c.great
    from generate_series(
      date_trunc('week', (select min(created_at) from public.relationship_events)),
      date_trunc('week', now()),
      interval '1 week'
    ) as w(week)
    cross join lateral (
      select count(*)::int as met, count(*) filter (where pp.level >= 3)::int as great
      from (
        select max(st.level) as level
        from (
          select distinct on (e.owner_id, e.student_id) o.id as rater, e.student_id as ratee, e.to_level as level
          from public.relationship_events e
          join public.students o on o.user_id = e.owner_id
          join public.students t on t.id = e.student_id
          where e.created_at < w.week + interval '1 week' and e.student_id <> o.id
            and o.role = 'student' and t.role = 'student'
          order by e.owner_id, e.student_id, e.created_at desc
        ) st
        where st.level > 0
        group by least(st.rater, st.ratee), greatest(st.rater, st.ratee)
      ) pp
    ) c
  )
  select jsonb_build_object(
    'students', (select count(*) from people),
    'claimed', (select count(*) from public.students where user_id is not null and role = 'student'),
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

-------------------------------------------------------------------------------
-- Resources: events (with RSVPs), music recommendations and a notice board
-------------------------------------------------------------------------------
-- Visible to every member. Anyone can post; only the author or an admin can
-- edit or delete. Links must be http(s).

create table if not exists public.cal_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text check (char_length(location) <= 200),
  link text check (link ~* '^https?://'),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.cal_rsvps (
  event_id uuid not null references public.cal_events (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null check (status in ('going', 'maybe')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  spotify_id text not null check (spotify_id ~ '^[A-Za-z0-9]{22}$'),
  note text check (char_length(note) <= 200),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('event', 'deal', 'opportunity', 'housing', 'for_sale', 'other')),
  title text not null check (char_length(title) between 1 and 120),
  body text check (char_length(body) <= 2000),
  link text check (link ~* '^https?://'),
  expires_on date,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Optional event photo: only images from the app's own event-photos bucket
-- (so nobody can embed a tracking image from elsewhere).
alter table public.cal_events add column if not exists image_url text
  check (image_url ~ '^https://[^/]+/storage/v1/object/public/event-photos/[0-9a-f-]+/[0-9a-f-]+\.jpg$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-photos', 'event-photos', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- Files live at event-photos/<user_id>/<random>.jpg
drop policy if exists "members upload own event photos" on storage.objects;
create policy "members upload own event photos" on storage.objects
  for insert with check (
    bucket_id = 'event-photos' and public.is_member() and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "owner or admin deletes event photos" on storage.objects;
create policy "owner or admin deletes event photos" on storage.objects
  for delete using (
    bucket_id = 'event-photos' and public.is_member()
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

alter table public.cal_events enable row level security;
alter table public.cal_rsvps enable row level security;
alter table public.songs enable row level security;
alter table public.notices enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['cal_events', 'songs', 'notices'] loop
    execute format('drop policy if exists "members read %1$s" on public.%1$I', t);
    execute format('create policy "members read %1$s" on public.%1$I for select using (public.is_member())', t);
    execute format('drop policy if exists "members post %1$s" on public.%1$I', t);
    execute format('create policy "members post %1$s" on public.%1$I for insert with check (public.is_member() and created_by = auth.uid())', t);
    execute format('drop policy if exists "author or admin edits %1$s" on public.%1$I', t);
    execute format('create policy "author or admin edits %1$s" on public.%1$I for update using (public.is_member() and (created_by = auth.uid() or public.is_admin())) with check (public.is_member() and (created_by = auth.uid() or public.is_admin()))', t);
    execute format('drop policy if exists "author or admin deletes %1$s" on public.%1$I', t);
    execute format('create policy "author or admin deletes %1$s" on public.%1$I for delete using (public.is_member() and (created_by = auth.uid() or public.is_admin()))', t);
  end loop;
end;
$$;

drop policy if exists "members read rsvps" on public.cal_rsvps;
create policy "members read rsvps" on public.cal_rsvps
  for select using (public.is_member());

drop policy if exists "member manages own rsvp" on public.cal_rsvps;
create policy "member manages own rsvp" on public.cal_rsvps
  for all using (public.is_member() and user_id = auth.uid())
  with check (public.is_member() and user_id = auth.uid());

-------------------------------------------------------------------------------
-- Usage stats for the admin (aggregates only)
-------------------------------------------------------------------------------
-- One row per account per day the app was opened, to count active users.
-- Nothing about what people did is recorded.
create table if not exists public.app_visits (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  primary key (user_id, day)
);

alter table public.app_visits enable row level security;
-- No policies: written only through record_visit(), read only through admin_usage().

-- "Today" for the cohort, which lives on Oxford time (Supabase runs on UTC).
create or replace function public.london_today()
returns date
language sql stable
as $$ select (now() at time zone 'Europe/London')::date $$;

-- Same idea per hour (Oxford time), to see when during the day the app is used.
create table if not exists public.app_visit_hours (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  hour smallint not null check (hour between 0 and 23),
  primary key (user_id, day, hour)
);

alter table public.app_visit_hours enable row level security;
-- No policies: written only through record_visit(), read only through admin_usage().

create or replace function public.record_visit()
returns void
language sql volatile security definer set search_path = public
as $$
  insert into public.app_visits (user_id, day)
  select auth.uid(), public.london_today()
  where public.is_member()
  on conflict do nothing;
  insert into public.app_visit_hours (user_id, day, hour)
  select auth.uid(), public.london_today(), extract(hour from now() at time zone 'Europe/London')::smallint
  where public.is_member()
  on conflict do nothing;
$$;

-- Totals only: no names, no per-person activity, no individual ratings.
create or replace function public.admin_usage()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can see usage stats';
  end if;

  with
  students as (select * from public.students where role = 'student'),
  claimed as (select * from students where user_id is not null),
  -- Someone is "active" on a day if they opened the app (app_visits, recorded
  -- from this release on) or did something in it: changed a level, posted an
  -- event / song / notice or RSVP'd. This also fills in days before visits
  -- were recorded.
  activity as (
    select user_id, day from public.app_visits
    union select owner_id, (created_at at time zone 'Europe/London')::date from public.relationship_events
    union select created_by, (created_at at time zone 'Europe/London')::date from public.cal_events
    union select created_by, (created_at at time zone 'Europe/London')::date from public.songs
    union select created_by, (created_at at time zone 'Europe/London')::date from public.notices
    union select user_id, (created_at at time zone 'Europe/London')::date from public.cal_rsvps
    union select user_id, (created_at at time zone 'Europe/London')::date from public.coffee_entries
  ),
  -- Activity with a time of day (Oxford time), last 30 days: app opens per hour
  -- plus actions. Counted once per person per hour.
  hourly_activity as (
    select user_id, day, hour from public.app_visit_hours where day > london_today() - 30
    union
    select who, (at at time zone 'Europe/London')::date, extract(hour from at at time zone 'Europe/London')::smallint
    from (
      select owner_id as who, created_at as at from public.relationship_events
      union all select created_by, created_at from public.cal_events
      union all select created_by, created_at from public.songs
      union all select created_by, created_at from public.notices
      union all select user_id, created_at from public.cal_rsvps
      union all select user_id, created_at from public.coffee_entries
    ) a
    where (at at time zone 'Europe/London')::date > london_today() - 30
  ),
  days as (
    select d::date as day from generate_series(london_today() - 29, london_today(), interval '1 day') d
  )
  select jsonb_build_object(
    'cohort', (select count(*) from students),
    'accounts', (select count(*) from auth.users),
    'claimed', (select count(*) from claimed),
    'trackers', (select count(distinct r.owner_id) from public.relationships r where r.level > 0 or r.starred),
    'ratings', (select count(*) from public.relationships where level > 0),
    'stars', (select count(*) from public.relationships where starred),
    'notes', (select count(*) from public.relationships where note is not null and note <> ''),
    'active', jsonb_build_object(
      'd1', (select count(distinct user_id) from activity where day >= london_today()),
      'd7', (select count(distinct user_id) from activity where day > london_today() - 7),
      'd30', (select count(distinct user_id) from activity where day > london_today() - 30)
    ),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'active', (select count(distinct a.user_id) from activity a where a.day = d.day),
        'changes', (select count(*) from public.relationship_events e where (e.created_at at time zone 'Europe/London')::date = d.day),
        'signups', (select count(*) from auth.users u where (u.created_at at time zone 'Europe/London')::date = d.day)
      ) order by d.day)
      from days d
    ),
    'hourly', coalesce((
      select jsonb_agg(jsonb_build_object('dow', dow, 'hour', hour, 'n', n) order by dow, hour)
      from (
        select extract(isodow from day)::int as dow, hour, count(*)::int as n
        from hourly_activity
        group by 1, 2
      ) h
    ), '[]'::jsonb),
    'profiles', jsonb_build_object(
      'photo', (select count(*) from claimed where photo_url is not null),
      'birthday', (select count(*) from claimed where birth_day is not null and birth_month is not null),
      'country', (select count(*) from claimed where country_origin is not null),
      'hobbies', (select count(*) from claimed where cardinality(hobbies) > 0),
      'bio', (select count(*) from claimed where bio is not null and bio <> ''),
      'languages', (select count(*) from claimed where cardinality(languages) > 0)
    ),
    'resources', jsonb_build_object(
      'events', (select count(*) from public.cal_events),
      'upcoming_events', (select count(*) from public.cal_events where coalesce(ends_at, starts_at) >= now()),
      'rsvps', (select count(*) from public.cal_rsvps),
      'songs', (select count(*) from public.songs),
      'notices', (select count(*) from public.notices where expires_on is null or expires_on >= london_today())
    ),
    'coffee', jsonb_build_object(
      'auto', (select count(*) from public.coffee_auto),
      'next', (select count(*) from public.coffee_participants(public.coffee_open_round())),
      'last', (
        select jsonb_build_object('round', round, 'people', people, 'groups', groups)
        from public.coffee_rounds where people > 0 order by round desc limit 1
      )
    )
  ) into result;
  return result;
end;
$$;

-- One day hour by hour (Oxford time): how many different people were active in
-- each hour. Totals only, for admins.
create or replace function public.admin_day(p_day date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can see usage stats';
  end if;

  with
  acts as (
    select user_id, hour from public.app_visit_hours where day = p_day
    union
    select who, extract(hour from at at time zone 'Europe/London')::smallint
    from (
      select owner_id as who, created_at as at from public.relationship_events
      union all select created_by, created_at from public.cal_events
      union all select created_by, created_at from public.songs
      union all select created_by, created_at from public.notices
      union all select user_id, created_at from public.cal_rsvps
      union all select user_id, created_at from public.coffee_entries
    ) a
    where (at at time zone 'Europe/London')::date = p_day
  )
  select jsonb_build_object(
    'day', p_day,
    'active', (select count(distinct user_id) from acts),
    'hours', (
      select jsonb_agg(jsonb_build_object('hour', h, 'n', (select count(distinct user_id) from acts where hour = h)) order by h)
      from generate_series(0, 23) h
    )
  ) into result;
  return result;
end;
$$;

-------------------------------------------------------------------------------
-- Coffee roulette (weekly random coffee matches)
-------------------------------------------------------------------------------
-- Each week runs Monday → Sunday. Sign-ups for a round open on Monday and close
-- with the draw on Sunday at 20:00 Oxford time; the coffee happens the week
-- after. A round is identified by the date of its draw (a Sunday).
--
-- Who gets matched with whom: every possible pair gets a cost from BOTH
-- people's private levels, level(A→B)² + level(B→A)², plus 100 if they were
-- already matched in an earlier round. The draw picks the pairs with the lowest
-- total cost, so people who don't know each other go first and friends last.
-- Everyone who signs up gets matched (with an odd number, one group of three).
--
-- Privacy: the levels are only read inside the draw. Nobody (admin included)
-- sees costs or why two people were matched; each person only sees their own
-- match, and the admin only sees totals.

-- "Sign me up every week". Pauses on its own if the account hasn't opened the
-- app in the 3 weeks before a draw, so nobody gets matched with a ghost.
create table if not exists public.coffee_auto (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Explicit choice for one round: in (true) or skipping it (false). Overrides
-- coffee_auto for that round.
create table if not exists public.coffee_entries (
  round date not null check (extract(isodow from round) = 7),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  joining boolean not null,
  created_at timestamptz not null default now(),
  primary key (round, user_id)
);

create table if not exists public.coffee_rounds (
  round date primary key,
  drawn_at timestamptz not null default now(),
  people int not null,
  groups int not null
);

create table if not exists public.coffee_matches (
  round date not null references public.coffee_rounds (round) on delete cascade,
  grp int not null,
  student_id uuid not null references public.students (id) on delete cascade,
  primary key (round, student_id)
);

alter table public.coffee_auto enable row level security;
alter table public.coffee_entries enable row level security;
alter table public.coffee_rounds enable row level security;
alter table public.coffee_matches enable row level security;
-- No policies: everything goes through the functions below.

-- The round currently open for sign-ups: this week's Sunday (Oxford time).
create or replace function public.coffee_open_round()
returns date
language sql stable
as $$ select public.london_today() + (7 - extract(isodow from public.london_today()))::int $$;

create or replace function public.coffee_draw_at(p_round date)
returns timestamptz
language sql stable
as $$ select (p_round + time '20:00') at time zone 'Europe/London' $$;

-- Accounts in a round: an explicit "in", or "every week" without a skip for
-- that round and with the app opened in the 3 weeks before the draw.
create or replace function public.coffee_participants(p_round date)
returns table (user_id uuid, student_id uuid)
language sql stable security definer set search_path = public
as $$
  select s.user_id, s.id
  from public.students s
  where s.user_id is not null
    and (
      exists (select 1 from public.coffee_entries e where e.round = p_round and e.user_id = s.user_id and e.joining)
      or (
        exists (select 1 from public.coffee_auto a where a.user_id = s.user_id)
        and not exists (select 1 from public.coffee_entries e where e.round = p_round and e.user_id = s.user_id)
        and exists (select 1 from public.app_visits v where v.user_id = s.user_id and v.day > p_round - 21)
      )
    );
$$;

-- The draw. Minimum-cost matching: a greedy start (cheapest pairs first, ties
-- at random) improved by swapping partners between pairs until no swap lowers
-- the total. With an odd number of people, a placeholder joins the matching;
-- whoever lands with it joins the group where they know both people least
-- (avoiding anyone who was in a group of three in the last 4 rounds).
create or replace function public.coffee_draw(p_round date)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  uids uuid[];
  sids uuid[];
  n int;
  m int;
  lv int[];
  c int[];
  mate int[];
  rec record;
  i int; j int; a int; b int; x int; y int;
  cur int;
  improved boolean;
  sweeps int := 0;
  g int := 0;
  extra int;
  best_g int;
  best_cost int;
  recent_trio boolean[];
begin
  if exists (select 1 from public.coffee_rounds where round = p_round) then
    return;
  end if;

  select array_agg(p.user_id order by r), array_agg(p.student_id order by r)
  into uids, sids
  from (select *, random() as r from public.coffee_participants(p_round)) p;
  n := coalesce(cardinality(sids), 0);

  if n < 2 then
    insert into public.coffee_rounds (round, people, groups) values (p_round, n, 0);
    return;
  end if;

  m := n + (n % 2);  -- index m is the placeholder when n is odd
  lv := array_fill(0, array[n * n]);
  c := array_fill(0, array[m * m]);
  mate := array_fill(0, array[m]);

  -- Each person's private level for each other participant.
  for rec in
    select array_position(uids, r.owner_id) as i, array_position(sids, r.student_id) as j, r.level
    from public.relationships r
    where r.owner_id = any (uids) and r.student_id = any (sids) and r.level > 0
  loop
    if rec.i <> rec.j then
      lv[(rec.i - 1) * n + rec.j] := rec.level;
    end if;
  end loop;

  for i in 1 .. n loop
    for j in 1 .. n loop
      if i <> j then
        c[(i - 1) * m + j] := lv[(i - 1) * n + j] ^ 2 + lv[(j - 1) * n + i] ^ 2;
      end if;
    end loop;
  end loop;

  -- Already had coffee together in an earlier round.
  for rec in
    select distinct array_position(sids, x1.student_id) as i, array_position(sids, x2.student_id) as j
    from public.coffee_matches x1
    join public.coffee_matches x2 on x2.round = x1.round and x2.grp = x1.grp and x2.student_id <> x1.student_id
    where x1.round < p_round and x1.student_id = any (sids) and x2.student_id = any (sids)
  loop
    c[(rec.i - 1) * m + rec.j] := c[(rec.i - 1) * m + rec.j] + 100;
  end loop;

  if m > n then
    -- Pairing with the placeholder = being the extra person in a group of three.
    recent_trio := array_fill(false, array[n]);
    for i in 1 .. n loop
      if exists (
        select 1 from public.coffee_matches x
        where x.student_id = sids[i] and x.round >= p_round - 28 and x.round < p_round
          and (select count(*) from public.coffee_matches y where y.round = x.round and y.grp = x.grp) > 2
      ) then
        recent_trio[i] := true;
        c[(i - 1) * m + m] := 50;
        c[(m - 1) * m + i] := 50;
      end if;
    end loop;
  end if;

  -- Greedy start: cheapest pairs first, ties broken at random.
  for rec in
    select gi as i, gj as j
    from generate_series(1, m) gi, generate_series(1, m) gj
    where gi < gj
    order by c[(gi - 1) * m + gj], random()
  loop
    if mate[rec.i] = 0 and mate[rec.j] = 0 then
      mate[rec.i] := rec.j;
      mate[rec.j] := rec.i;
    end if;
  end loop;

  -- Improve: swap partners between two pairs while it lowers the total.
  loop
    improved := false;
    sweeps := sweeps + 1;
    for a in 1 .. m loop
      for x in a + 1 .. m loop
        b := mate[a];
        y := mate[x];
        continue when x = b or b < a or y < x;
        cur := c[(a - 1) * m + b] + c[(x - 1) * m + y];
        if c[(a - 1) * m + x] + c[(b - 1) * m + y] < cur then
          mate[a] := x; mate[x] := a; mate[b] := y; mate[y] := b;
          improved := true;
        elsif c[(a - 1) * m + y] + c[(b - 1) * m + x] < cur then
          mate[a] := y; mate[y] := a; mate[b] := x; mate[x] := b;
          improved := true;
        end if;
      end loop;
    end loop;
    exit when not improved or sweeps >= 100;
  end loop;

  insert into public.coffee_rounds (round, people, groups) values (p_round, n, n / 2);

  extra := case when m > n then mate[m] else 0 end;
  best_cost := null;
  for i in 1 .. n loop
    j := mate[i];
    continue when j < i or j > n or i = extra or j = extra;
    g := g + 1;
    insert into public.coffee_matches (round, grp, student_id) values (p_round, g, sids[i]), (p_round, g, sids[j]);
    if extra > 0 then
      cur := c[(extra - 1) * m + i] + c[(extra - 1) * m + j]
        + case when recent_trio[i] then 50 else 0 end + case when recent_trio[j] then 50 else 0 end;
      if best_cost is null or cur < best_cost or (cur = best_cost and random() < 0.5) then
        best_cost := cur;
        best_g := g;
      end if;
    end if;
  end loop;

  if extra > 0 then
    insert into public.coffee_matches (round, grp, student_id) values (p_round, best_g, sids[extra]);
  end if;
end;
$$;

revoke execute on function public.coffee_draw(date) from public, anon, authenticated;
revoke execute on function public.coffee_participants(date) from public, anon, authenticated;

-- Everything the Coffee tab needs, for the signed-in person only. Also runs the
-- latest draw if it is due and hasn't run yet (the first visit after Sunday
-- 20:00 triggers it, so no scheduler is needed).
create or replace function public.coffee_state()
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  open_round date := public.coffee_open_round();
  due date;
  my_student uuid;
begin
  if not public.is_member() then
    raise exception 'Not allowed';
  end if;

  due := case when now() >= public.coffee_draw_at(open_round) then open_round else open_round - 7 end;
  if not exists (select 1 from public.coffee_rounds where round = due) then
    perform pg_advisory_xact_lock(hashtext('coffee_draw'));
    perform public.coffee_draw(due);
  end if;

  select id into my_student from public.students where user_id = auth.uid();

  return jsonb_build_object(
    'open_round', open_round,
    'draw_at', public.coffee_draw_at(open_round),
    'open', now() < public.coffee_draw_at(open_round),
    'joined', exists (select 1 from public.coffee_participants(open_round) p where p.user_id = auth.uid()),
    'auto', exists (select 1 from public.coffee_auto where user_id = auth.uid()),
    'entrants', (select count(*) from public.coffee_participants(open_round)),
    'latest_round', due,
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object('round', mine.round, 'partners', (
        select coalesce(jsonb_agg(o.student_id), '[]'::jsonb)
        from public.coffee_matches o
        where o.round = mine.round and o.grp = mine.grp and o.student_id <> my_student
      )) order by mine.round desc)
      from public.coffee_matches mine
      where mine.student_id = my_student
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.coffee_join(p_join boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_member() or not exists (select 1 from public.students where user_id = auth.uid()) then
    raise exception 'Claim your profile first';
  end if;
  if now() >= public.coffee_draw_at(public.coffee_open_round()) then
    raise exception 'This week''s draw has closed. Sign-ups for next week open on Monday.';
  end if;
  insert into public.coffee_entries (round, user_id, joining)
  values (public.coffee_open_round(), auth.uid(), p_join)
  on conflict (round, user_id) do update set joining = excluded.joining, created_at = now();
  return public.coffee_state();
end;
$$;

create or replace function public.coffee_set_auto(p_on boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  open_now boolean := now() < public.coffee_draw_at(public.coffee_open_round());
begin
  if not public.is_member() or not exists (select 1 from public.students where user_id = auth.uid()) then
    raise exception 'Claim your profile first';
  end if;
  if p_on then
    insert into public.coffee_auto (user_id) values (auth.uid()) on conflict do nothing;
    -- Turning it on also signs you up for this week.
    if open_now then
      insert into public.coffee_entries (round, user_id, joining)
      values (public.coffee_open_round(), auth.uid(), true)
      on conflict (round, user_id) do update set joining = true, created_at = now();
    end if;
  else
    -- Turning it off keeps this week as it was (leave with the other button).
    if open_now and exists (select 1 from public.coffee_participants(public.coffee_open_round()) p where p.user_id = auth.uid()) then
      insert into public.coffee_entries (round, user_id, joining)
      values (public.coffee_open_round(), auth.uid(), true)
      on conflict (round, user_id) do nothing;
    end if;
    delete from public.coffee_auto where user_id = auth.uid();
  end if;
  return public.coffee_state();
end;
$$;

-------------------------------------------------------------------------------
-- Useful tools (HTML pages uploaded by admins, shown until their hide date)
-------------------------------------------------------------------------------
-- The app shows each page inside a sandboxed iframe with no access to the
-- app's origin, so a tool can't read anyone's session or data.

create table if not exists public.tools (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  description text check (char_length(description) <= 300),
  icon text not null default '🧰' check (char_length(icon) between 1 and 8),
  html text not null check (octet_length(html) <= 3000000),
  -- First day it is no longer shown (it is hidden, never deleted). Null = no end date.
  remove_on date,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Hidden by an admin: kept (same id, so people's saved data still matches) but not shown.
alter table public.tools add column if not exists hidden boolean not null default false;

alter table public.tools enable row level security;

drop policy if exists "members read current tools" on public.tools;
create policy "members read current tools" on public.tools
  for select using (
    public.is_member() and not hidden and (remove_on is null or remove_on > public.london_today())
  );

drop policy if exists "admins manage tools" on public.tools;
create policy "admins manage tools" on public.tools
  for all using (public.is_admin()) with check (public.is_admin());

-- Used to delete tools whose date had come. Tools past their date are now only
-- hidden, so this does nothing; kept so an app still calling it doesn't error.
create or replace function public.purge_expired_tools()
returns void
language sql volatile security definer set search_path = public
as $$
  select;
$$;

-- What each person saved inside a tool (stars, notes…), backed up to their
-- account so it follows them to another device or address. Only the owner can
-- read or write their own rows; admins see nothing.
create table if not exists public.tool_data (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tool_id uuid not null references public.tools (id) on delete cascade,
  data jsonb not null check (octet_length(data::text) <= 250000),
  -- When the person saved it (their device's clock): the newest copy wins.
  saved_at timestamptz not null,
  primary key (user_id, tool_id)
);

alter table public.tool_data enable row level security;

drop policy if exists "own tool data" on public.tool_data;
create policy "own tool data" on public.tool_data
  for all using (user_id = auth.uid() and public.is_member())
  with check (user_id = auth.uid() and public.is_member());

-- How tools are used: one row per visit (opened, seconds on screen, and how many
-- times the tool saved something, a sign the person actually used it).
-- Kept after a tool is removed (tool_id becomes null, the title stays).
-- No policies: written through tool_open / tool_heartbeat, read only as totals
-- through admin_tool_stats().
create table if not exists public.tool_sessions (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid references public.tools (id) on delete set null,
  tool_title text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  seconds int not null default 0 check (seconds between 0 and 14400),
  actions int not null default 0 check (actions between 0 and 100000)
);

alter table public.tool_sessions enable row level security;

create or replace function public.tool_open(p_tool uuid)
returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  sid uuid;
begin
  if not public.is_member() then
    raise exception 'Not allowed';
  end if;
  insert into public.tool_sessions (tool_id, tool_title, user_id)
  select t.id, t.title, auth.uid() from public.tools t
  where t.id = p_tool and not t.hidden and (t.remove_on is null or t.remove_on > public.london_today())
  returning id into sid;
  return sid;
end;
$$;

-- Only the visit's own account can update it, and values only go up.
create or replace function public.tool_heartbeat(p_session uuid, p_seconds int, p_actions int)
returns void
language sql volatile security definer set search_path = public
as $$
  update public.tool_sessions
  set seconds = greatest(seconds, least(greatest(p_seconds, 0), 14400)),
      actions = greatest(actions, least(greatest(p_actions, 0), 100000))
  where id = p_session and user_id = auth.uid();
$$;

-- Totals per tool for admins. Admins' own visits are left out (testing).
create or replace function public.admin_tool_stats()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can see usage stats';
  end if;

  with s as (
    select ts.*
    from public.tool_sessions ts
    join auth.users u on u.id = ts.user_id
    where lower(u.email) not in (select email from public.app_admins)
  ),
  per_person as (
    select coalesce(tool_id::text, tool_title) as k, user_id, count(*) as visits
    from s group by 1, 2
  ),
  tools as (
    select coalesce(s.tool_id::text, s.tool_title) as k,
           max(s.tool_title) as title,
           bool_or(t.id is not null and not t.hidden and (t.remove_on is null or t.remove_on > public.london_today())) as live,
           max(t.icon) as icon,
           count(*) as opens,
           count(distinct s.user_id) as people,
           count(*) filter (where s.actions > 0) as engaged,
           sum(s.seconds) as total_seconds,
           coalesce(percentile_cont(0.5) within group (order by s.seconds) filter (where s.seconds > 0), 0) as median_seconds,
           max(s.started_at) as last_open
    from s left join public.tools t on t.id = s.tool_id
    group by 1
  )
  select jsonb_build_object(
    'students', (select count(*) from public.students where role = 'student' and user_id is not null),
    'tools', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', t.title,
        'icon', coalesce(t.icon, '🧰'),
        'live', t.live,
        'opens', t.opens,
        'people', t.people,
        'returning', (select count(*) from per_person p where p.k = t.k and p.visits > 1),
        'engaged', t.engaged,
        'total_seconds', t.total_seconds,
        'median_seconds', round(t.median_seconds),
        'last_open', t.last_open,
        'daily', (
          select jsonb_agg(jsonb_build_object('day', d::date, 'opens', (
            select count(*) from s where coalesce(s.tool_id::text, s.tool_title) = t.k
              and (s.started_at at time zone 'Europe/London')::date = d::date
          )) order by d)
          from generate_series(public.london_today() - 13, public.london_today(), interval '1 day') d
        )
      ) order by t.last_open desc)
      from tools t
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-------------------------------------------------------------------------------
-- Weekly newsletter as a checklist
-------------------------------------------------------------------------------
-- Admins publish each week's newsletter as a list of items (title, short
-- summary, full detail, optional due date and link). Everyone ticks off their
-- own items; ticks are private (owner-only), like levels and notes.

create table if not exists public.newsletters (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  week_of date not null,
  intro text check (char_length(intro) <= 2000),
  -- [{id, category, title, summary, detail, due, link}]
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 200),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.newsletter_checks (
  newsletter_id uuid not null references public.newsletters (id) on delete cascade,
  item_id text not null check (char_length(item_id) between 1 and 40),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  checked_at timestamptz not null default now(),
  primary key (newsletter_id, item_id, user_id)
);

alter table public.newsletters enable row level security;
alter table public.newsletter_checks enable row level security;

drop policy if exists "members read newsletters" on public.newsletters;
create policy "members read newsletters" on public.newsletters
  for select using (public.is_member());

drop policy if exists "admins manage newsletters" on public.newsletters;
create policy "admins manage newsletters" on public.newsletters
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "owner manages own newsletter checks" on public.newsletter_checks;
create policy "owner manages own newsletter checks" on public.newsletter_checks
  for all using (public.is_member() and user_id = auth.uid())
  with check (public.is_member() and user_id = auth.uid());

-- Who opens the checklist: one row per person per newsletter per day. Read only
-- as totals through admin_newsletter_stats().
create table if not exists public.newsletter_views (
  newsletter_id uuid not null references public.newsletters (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  primary key (newsletter_id, user_id, day)
);

alter table public.newsletter_views enable row level security;
-- No policies: written by newsletter_view(), read by admin_newsletter_stats().

create or replace function public.newsletter_view(p_newsletter uuid)
returns void
language sql volatile security definer set search_path = public
as $$
  insert into public.newsletter_views (newsletter_id, user_id, day)
  select n.id, auth.uid(), public.london_today()
  from public.newsletters n
  where n.id = p_newsletter and public.is_member()
  on conflict do nothing;
$$;

-- Totals per newsletter for admins (admins' own activity left out): how many
-- opened it, how many ticked something, how far those people got, and which
-- items were ticked most and least.
create or replace function public.admin_newsletter_stats()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can see usage stats';
  end if;

  with
  admins as (
    select u.id from auth.users u where lower(u.email) in (select email from public.app_admins)
  ),
  nl as (
    select n.id, n.title, n.week_of, jsonb_array_length(n.items) as total, n.items
    from public.newsletters n
    order by n.week_of desc
    limit 8
  ),
  -- Only ticks on items that still exist in the newsletter count.
  ticks as (
    select c.newsletter_id, c.user_id, c.item_id
    from public.newsletter_checks c
    join nl on nl.id = c.newsletter_id
    where c.user_id not in (select id from admins)
      and exists (select 1 from jsonb_array_elements(nl.items) it where it->>'id' = c.item_id)
  ),
  per_person as (
    select t.newsletter_id, t.user_id, count(*)::numeric / nl.total as share
    from ticks t join nl on nl.id = t.newsletter_id
    group by t.newsletter_id, t.user_id, nl.total
  ),
  views as (
    select v.newsletter_id, count(distinct v.user_id) as viewers, count(*) as visits
    from public.newsletter_views v
    where v.user_id not in (select id from admins)
    group by v.newsletter_id
  )
  select jsonb_build_object(
    'students', (select count(*) from public.students where role = 'student' and user_id is not null),
    'newsletters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', nl.id,
        'title', nl.title,
        'week_of', nl.week_of,
        'items', nl.total,
        'viewers', coalesce(v.viewers, 0),
        'visits', coalesce(v.visits, 0),
        'tickers', (select count(*) from per_person p where p.newsletter_id = nl.id),
        'avg_share', coalesce((select round(avg(p.share) * 100) from per_person p where p.newsletter_id = nl.id), 0),
        'median_share', coalesce((
          select round(percentile_cont(0.5) within group (order by p.share)::numeric * 100)
          from per_person p where p.newsletter_id = nl.id
        ), 0),
        'complete', (select count(*) from per_person p where p.newsletter_id = nl.id and p.share >= 1),
        'buckets', jsonb_build_array(
          (select count(*) from per_person p where p.newsletter_id = nl.id and p.share <= 0.25),
          (select count(*) from per_person p where p.newsletter_id = nl.id and p.share > 0.25 and p.share <= 0.5),
          (select count(*) from per_person p where p.newsletter_id = nl.id and p.share > 0.5 and p.share <= 0.75),
          (select count(*) from per_person p where p.newsletter_id = nl.id and p.share > 0.75 and p.share < 1),
          (select count(*) from per_person p where p.newsletter_id = nl.id and p.share >= 1)
        ),
        'item_ticks', (
          select jsonb_agg(jsonb_build_object('title', it->>'title', 'ticks', (
            select count(*) from ticks t where t.newsletter_id = nl.id and t.item_id = it->>'id'
          )) order by ord)
          from jsonb_array_elements(nl.items) with ordinality as e(it, ord)
        )
      ) order by nl.week_of desc)
      from nl left join views v on v.newsletter_id = nl.id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Make the API see new or changed functions right away.
notify pgrst, 'reload schema';
