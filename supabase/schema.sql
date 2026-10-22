-- Blavafriend database schema.
begin;
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
    -- Totals only: who offers or books a formal is never shown here.
    'formals', jsonb_build_object(
      'upcoming', (select count(*) from public.formal_slots where day >= public.london_today()),
      'seats', (select coalesce(sum(capacity), 0) from public.formal_slots where day >= public.london_today()),
      'booked', (
        select count(*) from public.formal_bookings b
        join public.formal_slots f on f.id = b.slot_id where f.day >= public.london_today()
      ),
      'total_bookings', (select count(*) from public.formal_bookings)
    ),
    'study', jsonb_build_object(
      'upcoming', (select count(*) from public.study_sessions where day >= public.london_today()),
      'joins', (
        select count(*) from public.study_joins j
        join public.study_sessions x on x.id = j.session_id where x.day >= public.london_today()
      ),
      'total_joins', (select count(*) from public.study_joins)
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

-- Engagement: is it the same few people every time, or many people now and
-- then? Counts only, by group; no names, no per-person rows. Students only
-- (faculty and admins are left out). "Active" = opened the app or did something.
create or replace function public.admin_engagement()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  result jsonb;
  today date := public.london_today();
  this_week date := date_trunc('week', public.london_today())::date;
begin
  if not public.is_admin() then
    raise exception 'Only admins can see usage stats';
  end if;

  with
  people as (
    select s.user_id
    from public.students s join auth.users u on u.id = s.user_id
    where s.role = 'student' and lower(u.email) not in (select email from public.app_admins)
  ),
  activity as (
    select a.user_id, a.day
    from (
      select user_id, day from public.app_visits
      union select owner_id, (created_at at time zone 'Europe/London')::date from public.relationship_events
      union select created_by, (created_at at time zone 'Europe/London')::date from public.cal_events
      union select created_by, (created_at at time zone 'Europe/London')::date from public.notices
      union select user_id, (created_at at time zone 'Europe/London')::date from public.cal_rsvps
      union select user_id, (created_at at time zone 'Europe/London')::date from public.coffee_entries
    ) a
    join people p on p.user_id = a.user_id
  ),
  -- Last 28 days per person.
  recent as (
    select p.user_id, count(distinct a.day) as days
    from people p left join activity a on a.user_id = p.user_id and a.day > today - 28
    group by p.user_id
  ),
  seg as (
    select user_id, days,
           case when days >= 8 then 'core' when days >= 3 then 'regular' when days >= 1 then 'occasional'
                else 'dormant' end as segment
    from recent
  ),
  -- What each person did in the last 28 days (beyond opening the app).
  feats as (
    select owner_id as user_id, 'levels' as f from public.relationship_events where created_at > now() - interval '28 days'
    union select user_id, 'coffee' from public.coffee_entries where joining and created_at > now() - interval '28 days'
    union select user_id, 'tools' from public.tool_sessions where started_at > now() - interval '28 days'
    union select user_id, 'newsletter' from public.newsletter_views where day > today - 28
    union select user_id, 'events' from public.cal_rsvps where created_at > now() - interval '28 days'
    union select guest, 'formals' from public.formal_bookings where created_at > now() - interval '28 days'
    union select host, 'formals' from public.formal_slots where created_at > now() - interval '28 days'
    union select member, 'study' from public.study_joins where created_at > now() - interval '28 days'
    union select host, 'study' from public.study_sessions where created_at > now() - interval '28 days'
  ),
  ranked as (
    select days, row_number() over (order by days desc) as rn, count(*) over () as n
    from recent where days > 0
  ),
  -- Last 8 weeks (Monday to Sunday, Oxford time); the last one is this week so far.
  weeks as (select this_week - 7 * i as w from generate_series(0, 7) i),
  wact as (
    select user_id, date_trunc('week', day)::date as w, count(*) as days from activity group by 1, 2
  ),
  first_seen as (select user_id, min(day) as first_day from activity group by 1)
  select jsonb_build_object(
    'cohort', (select count(*) from public.students where role = 'student'),
    'joined', (select count(*) from people),
    'segments', (
      select jsonb_agg(jsonb_build_object(
        'key', k.key,
        'n', (select count(*) from seg where seg.segment = k.key),
        'days', (select coalesce(sum(days), 0) from seg where seg.segment = k.key),
        'features', (
          select coalesce(jsonb_object_agg(f, n), '{}'::jsonb) from (
            select feats.f, count(distinct feats.user_id) as n
            from feats join seg on seg.user_id = feats.user_id
            where seg.segment = k.key group by feats.f
          ) x
        )
      ) order by k.ord)
      from (values ('core', 1), ('regular', 2), ('occasional', 3), ('dormant', 4)) k(key, ord)
    ),
    'histogram', (
      select jsonb_agg(jsonb_build_object('label', b.label, 'n', (select count(*) from recent r where r.days between b.lo and b.hi)) order by b.lo)
      from (values ('0', 0, 0), ('1', 1, 1), ('2–3', 2, 3), ('4–7', 4, 7), ('8–14', 8, 14), ('15+', 15, 28)) b(label, lo, hi)
    ),
    'concentration', (
      select jsonb_build_object(
        'active', coalesce(max(n), 0),
        'total_days', coalesce(sum(days), 0),
        'top20_people', coalesce(ceil(max(n) * 0.2), 0),
        'top20_days', coalesce(sum(days) filter (where rn <= ceil(n * 0.2)), 0)
      ) from ranked
    ),
    'weeks', (
      select jsonb_agg(jsonb_build_object(
        'week', wk.w,
        'active', (select count(*) from wact a where a.w = wk.w),
        'person_days', (select coalesce(sum(a.days), 0) from wact a where a.w = wk.w),
        'returning', (
          select count(*) from wact a
          where a.w = wk.w and exists (select 1 from wact b where b.user_id = a.user_id and b.w = wk.w - 7)
        ),
        'new', (
          select count(*) from wact a join first_seen f on f.user_id = a.user_id
          where a.w = wk.w and f.first_day >= wk.w
        )
      ) order by wk.w)
      from weeks wk
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

-------------------------------------------------------------------------------
-- Formals: seats offered at college formal dinners, booked by classmates
-------------------------------------------------------------------------------
-- A host offers N seats at their college's formal (day, time, price). Others
-- book a seat like an appointment; no money goes through the app, the guest
-- pays the host directly. Everyone sees what is on offer and how many seats are
-- left; only the host and that formal's guests see who is going.

create table if not exists public.formal_slots (
  id uuid primary key default gen_random_uuid(),
  host uuid not null default auth.uid() references auth.users (id) on delete cascade,
  college text not null check (char_length(college) between 1 and 60),
  day date not null,
  at time not null,
  -- Per seat, in pounds. 0 = free (the host treats).
  price numeric(6, 2) not null default 0 check (price between 0 and 500),
  capacity int not null check (capacity between 1 and 10),
  notes text check (char_length(notes) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists formal_slots_day on public.formal_slots (day);

create table if not exists public.formal_bookings (
  slot_id uuid not null references public.formal_slots (id) on delete cascade,
  guest uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (slot_id, guest)
);

alter table public.formal_slots enable row level security;
alter table public.formal_bookings enable row level security;

drop policy if exists "members read formals" on public.formal_slots;
create policy "members read formals" on public.formal_slots
  for select using (public.is_member());

drop policy if exists "hosts add formals" on public.formal_slots;
create policy "hosts add formals" on public.formal_slots
  for insert with check (host = auth.uid() and public.is_member() and day >= public.london_today());

drop policy if exists "hosts edit formals" on public.formal_slots;
create policy "hosts edit formals" on public.formal_slots
  for update using (host = auth.uid()) with check (host = auth.uid() and day >= public.london_today());

drop policy if exists "hosts or admins delete formals" on public.formal_slots;
create policy "hosts or admins delete formals" on public.formal_slots
  for delete using (host = auth.uid() or public.is_admin());

-- Bookings: no direct writes (formal_book / formal_cancel check the rules);
-- you can read your own, and the host can read theirs.
drop policy if exists "guest or host reads booking" on public.formal_bookings;
create policy "guest or host reads booking" on public.formal_bookings
  for select using (
    guest = auth.uid()
    or exists (select 1 from public.formal_slots s where s.id = slot_id and s.host = auth.uid())
  );

-- A host can't cut the seats below the number already booked.
create or replace function public.formal_slots_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.capacity < (select count(*) from public.formal_bookings where slot_id = new.id) then
    raise exception 'Some of these seats are already booked: you can''t offer fewer than that.';
  end if;
  return new;
end;
$$;

drop trigger if exists formal_slots_guard on public.formal_slots;
create trigger formal_slots_guard before update on public.formal_slots
  for each row execute function public.formal_slots_guard();

-- Upcoming formals with seats taken, and (for the host and that formal's
-- guests only) who is going.
create or replace function public.formal_board()
returns jsonb
language sql stable security definer set search_path = public
as $$
  with s as (
    select f.*,
           (select count(*) from public.formal_bookings b where b.slot_id = f.id) as taken,
           exists (select 1 from public.formal_bookings b where b.slot_id = f.id and b.guest = auth.uid()) as booked
    from public.formal_slots f
    where (f.day + f.at) at time zone 'Europe/London' > now()
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'host', s.host,
    'college', s.college,
    'day', s.day,
    'time', to_char(s.at, 'HH24:MI'),
    'price', s.price,
    'capacity', s.capacity,
    'notes', s.notes,
    'taken', s.taken,
    'mine', s.host = auth.uid(),
    'booked', s.booked,
    'guests', case when s.host = auth.uid() or s.booked then coalesce((
      select jsonb_agg(b.guest order by b.created_at) from public.formal_bookings b where b.slot_id = s.id
    ), '[]'::jsonb) else '[]'::jsonb end
  ) order by s.day, s.at), '[]'::jsonb)
  from s
  where public.is_member();
$$;

-- Book one seat. Locks the formal so two people can't take the last seat.
create or replace function public.formal_book(p_slot uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  f public.formal_slots;
begin
  if not public.is_member() then
    raise exception 'Not allowed';
  end if;
  select * into f from public.formal_slots where id = p_slot for update;
  if not found then
    raise exception 'This formal is no longer offered.';
  end if;
  if f.host = auth.uid() then
    raise exception 'You can''t book a seat at your own formal.';
  end if;
  if (f.day + f.at) at time zone 'Europe/London' <= now() then
    raise exception 'This formal has already started.';
  end if;
  if exists (select 1 from public.formal_bookings where slot_id = p_slot and guest = auth.uid()) then
    return;
  end if;
  if (select count(*) from public.formal_bookings where slot_id = p_slot) >= f.capacity then
    raise exception 'Sorry, the last seat was just taken.';
  end if;
  insert into public.formal_bookings (slot_id, guest) values (p_slot, auth.uid());
end;
$$;

-- Cancel your own seat, or (as the host) take a guest off your formal.
create or replace function public.formal_cancel(p_slot uuid, p_guest uuid default null)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  if p_guest is null or p_guest = auth.uid() then
    delete from public.formal_bookings where slot_id = p_slot and guest = auth.uid();
  elsif exists (select 1 from public.formal_slots where id = p_slot and host = auth.uid()) then
    delete from public.formal_bookings where slot_id = p_slot and guest = p_guest;
  else
    raise exception 'Not allowed';
  end if;
end;
$$;

-------------------------------------------------------------------------------
-- Study: classes, help requests and study groups between classmates
-------------------------------------------------------------------------------
-- Someone posts a session (subject, topic, day, time, length, places) of one
-- kind: 'teach' (I'll give a class), 'need' (I'm looking for a tutor; places =
-- how many helpers, extra = how many classmates stuck on the same thing can
-- join too) or 'study' (study together). Others join it like an appointment. Everyone sees what is on and how many places are left; only the
-- host and the people in it see who joined.

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  host uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('teach', 'need', 'study')),
  subject text not null check (char_length(subject) between 1 and 40),
  topic text check (char_length(topic) <= 120),
  day date not null,
  at time not null,
  minutes int not null default 60 check (minutes between 15 and 240),
  capacity int not null check (capacity between 1 and 20),
  place text check (char_length(place) <= 120),
  notes text check (char_length(notes) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists study_sessions_day on public.study_sessions (day);
-- Languages the session can be given in.
alter table public.study_sessions
  add column if not exists languages text[] not null default '{English}'
  check (cardinality(languages) between 1 and 6);

-- For a 'need': how many classmates can join too, besides the helpers.
alter table public.study_sessions
  add column if not exists extra int not null default 0 check (extra between 0 and 19);

create table if not exists public.study_joins (
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  member uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, member)
);
-- On a 'need', true = came to help, false = joined to get help too. Joins made
-- before this existed were all helpers.
alter table public.study_joins add column if not exists helper boolean;
update public.study_joins j set helper = (s.kind = 'need')
  from public.study_sessions s where s.id = j.session_id and j.helper is null;
alter table public.study_joins alter column helper set default false;
alter table public.study_joins alter column helper set not null;

alter table public.study_sessions enable row level security;
alter table public.study_joins enable row level security;

drop policy if exists "members read study sessions" on public.study_sessions;
create policy "members read study sessions" on public.study_sessions
  for select using (public.is_member());

drop policy if exists "hosts add study sessions" on public.study_sessions;
create policy "hosts add study sessions" on public.study_sessions
  for insert with check (host = auth.uid() and public.is_member() and day >= public.london_today());

drop policy if exists "hosts edit study sessions" on public.study_sessions;
create policy "hosts edit study sessions" on public.study_sessions
  for update using (host = auth.uid()) with check (host = auth.uid() and day >= public.london_today());

drop policy if exists "hosts or admins delete study sessions" on public.study_sessions;
create policy "hosts or admins delete study sessions" on public.study_sessions
  for delete using (host = auth.uid() or public.is_admin());

-- Joins: written only through study_join / study_leave.
drop policy if exists "member or host reads join" on public.study_joins;
create policy "member or host reads join" on public.study_joins
  for select using (
    member = auth.uid()
    or exists (select 1 from public.study_sessions s where s.id = session_id and s.host = auth.uid())
  );

create or replace function public.study_sessions_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.kind <> old.kind then
    raise exception 'The kind of a post can''t change.';
  end if;
  if new.capacity < (select count(*) from public.study_joins where session_id = new.id and (helper or new.kind <> 'need'))
     or new.extra < (select count(*) from public.study_joins where session_id = new.id and not helper and new.kind = 'need') then
    raise exception 'Some people have already joined: you can''t offer fewer places than that.';
  end if;
  return new;
end;
$$;

drop trigger if exists study_sessions_guard on public.study_sessions;
create trigger study_sessions_guard before update on public.study_sessions
  for each row execute function public.study_sessions_guard();

create or replace function public.study_board()
returns jsonb
language sql stable security definer set search_path = public
as $$
  with s as (
    select x.*,
           (select count(*) from public.study_joins j where j.session_id = x.id and (j.helper or x.kind <> 'need')) as taken,
           (select count(*) from public.study_joins j where j.session_id = x.id and not j.helper and x.kind = 'need') as extra_taken,
           (select case when j.helper then 'help' else 'join' end from public.study_joins j
            where j.session_id = x.id and j.member = auth.uid()) as my_role
    from public.study_sessions x
    where (x.day + x.at) at time zone 'Europe/London' > now()
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'host', s.host,
    'kind', s.kind,
    'subject', s.subject,
    'topic', s.topic,
    'day', s.day,
    'time', to_char(s.at, 'HH24:MI'),
    'minutes', s.minutes,
    'languages', s.languages,
    'capacity', s.capacity,
    'extra', s.extra,
    'extra_taken', s.extra_taken,
    'place', s.place,
    'notes', s.notes,
    'taken', s.taken,
    'mine', s.host = auth.uid(),
    'joined', s.my_role is not null,
    'my_role', s.my_role,
    'members', case when s.host = auth.uid() or s.my_role is not null then coalesce((
      select jsonb_agg(j.member order by j.created_at) from public.study_joins j where j.session_id = s.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'helpers', case when s.kind = 'need' and (s.host = auth.uid() or s.my_role is not null) then coalesce((
      select jsonb_agg(j.member order by j.created_at) from public.study_joins j where j.session_id = s.id and j.helper
    ), '[]'::jsonb) else '[]'::jsonb end
  ) order by s.day, s.at), '[]'::jsonb)
  from s
  where public.is_member();
$$;

-- p_help: on a 'need', true = I'll help, false = I'll join to get help too
-- (left out = help, as before). Ignored for other kinds.
drop function if exists public.study_join(uuid);
create or replace function public.study_join(p_session uuid, p_help boolean default null)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  x public.study_sessions;
  help boolean;
begin
  if not public.is_member() then
    raise exception 'Not allowed';
  end if;
  select * into x from public.study_sessions where id = p_session for update;
  if not found then
    raise exception 'This session is no longer on.';
  end if;
  if x.host = auth.uid() then
    raise exception 'This is your own session.';
  end if;
  if (x.day + x.at) at time zone 'Europe/London' <= now() then
    raise exception 'This session has already started.';
  end if;
  if exists (select 1 from public.study_joins where session_id = p_session and member = auth.uid()) then
    return;
  end if;
  help := x.kind = 'need' and coalesce(p_help, true);
  if x.kind = 'need' and not help then
    if (select count(*) from public.study_joins where session_id = p_session and not helper) >= x.extra then
      raise exception 'Sorry, there''s no room for more classmates in this one.';
    end if;
  elsif (select count(*) from public.study_joins where session_id = p_session and (helper or x.kind <> 'need')) >= x.capacity then
    raise exception '%', case when help then 'Someone is already helping with this one.'
                              else 'Sorry, the last place was just taken.' end;
  end if;
  insert into public.study_joins (session_id, member, helper) values (p_session, auth.uid(), help);
end;
$$;

-- Leave a session, or (as the host) take someone off it.
create or replace function public.study_leave(p_session uuid, p_member uuid default null)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  if p_member is null or p_member = auth.uid() then
    delete from public.study_joins where session_id = p_session and member = auth.uid();
  elsif exists (select 1 from public.study_sessions where id = p_session and host = auth.uid()) then
    delete from public.study_joins where session_id = p_session and member = p_member;
  else
    raise exception 'Not allowed';
  end if;
end;
$$;

-- Make the API see new or changed functions right away.
notify pgrst, 'reload schema';

-- Privacy migration (kept identical to the versioned migration, without transaction wrappers).

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

-- No shared output may depend on private ratings, even indirectly. Retain the
-- old JSON keys as empty values for older clients, never as live aggregates.
create or replace function public.cohort_overview(p_continents jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_member() then raise exception 'Not allowed'; end if;
  return (select jsonb_build_object(
    'students', count(*), 'claimed', count(user_id),
    'relationships_available', false,
    'trackers', 0, 'pairs', jsonb_build_object('met',0,'great',0,'friends',0),
    'me', null, 'edges', '[]'::jsonb, 'weekly', '[]'::jsonb,
    'groups', '[]'::jsonb, 'mixing', '[]'::jsonb
  ) from public.students where role <> 'faculty');
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
