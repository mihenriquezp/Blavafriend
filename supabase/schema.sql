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
  user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
-- Custom tags ("Other…" hobbies and languages added by students)
-------------------------------------------------------------------------------

create table if not exists public.custom_tags (
  kind text not null check (kind in ('hobby', 'language')),
  label text not null check (char_length(label) between 1 and 40),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (kind, label)
);

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
