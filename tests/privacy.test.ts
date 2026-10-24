import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const migration = await readFile(new URL('../supabase/migrations/202610220001_privacy_boundaries.sql', import.meta.url), 'utf8')
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const sid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const marker = '-- Privacy migration (kept identical to the versioned migration, without transaction wrappers).\n'
const setup = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create schema storage;
  create table auth.users (id uuid primary key, email text, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create table storage.buckets (id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
  $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
  alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
`

test('schema bootstrap carries the identical transactional privacy migration', async () => {
  assert.equal(schema.split(marker)[1], migration.split('begin;\n')[1])
  const db = new PGlite()
  try { await db.exec(setup); await db.exec(schema); await db.exec(schema) } finally { await db.close() }
})

test('privacy boundaries on an upgraded database with fictional accounts', async (t) => {
  const db = new PGlite()
  const login = async (n: number | null, role = 'authenticated') => {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claims',$2,false)",
      [n ? uid(n) : '', JSON.stringify(n ? { sub: uid(n), email: `fixture${n}@ox.ac.uk` } : {})])
    await db.exec(`set role ${role}`)
  }
  const one = async (sql: string) => (await db.query<Record<string, any>>(sql)).rows[0]
  try {
    await db.exec(setup)
    // Start with legacy public years, then apply the actual deployment migration.
    await db.exec(schema.split(marker)[0] + 'commit;')
    await db.exec(`
      insert into auth.users(id,email) values
        ('${uid(1)}','fixture1@ox.ac.uk'), ('${uid(2)}','fixture2@ox.ac.uk'),
        ('${uid(3)}','fixture3@ox.ac.uk'), ('${uid(4)}','fixture4@ox.ac.uk');
      insert into public.app_admins values ('fixture4@ox.ac.uk');
      insert into public.students(id,full_name,user_id,birth_year) values
        ('${sid(1)}','Fictional A','${uid(1)}',1990),
        ('${sid(2)}','Fictional B','${uid(2)}',1991),
        ('${sid(3)}','Fictional unclaimed',null,1992),
        ('${sid(4)}','Fictional admin','${uid(4)}',1993);
    `)
    await db.exec(migration)
    await db.exec(migration)
    await t.test('migrates without loss; anon, peers and admins cannot read other years', async () => {
      assert.equal((await one('select count(*)::int n from student_private')).n, 4)
      await login(null, 'anon')
      await assert.rejects(db.query('select * from student_private'), /permission denied/)
      await login(1)
      assert.deepEqual((await db.query('select birth_year from student_private')).rows, [{ birth_year: 1990 }])
      assert.equal((await one(`select birth_year from students where id='${sid(2)}'`)).birth_year, null)
      await login(4)
      assert.deepEqual((await db.query('select birth_year from student_private')).rows, [{ birth_year: 1993 }])
      await assert.rejects(db.query(`update students set birth_year=1998 where id='${sid(2)}'`), /Only the profile owner/)
      await assert.rejects(db.query(`select update_student_profile('${sid(2)}','{"birth_year":1998}')`), /Only the profile owner/)
      // Admins retain permission to edit shared fields, not the private year.
      assert.equal((await one(`select update_student_profile('${sid(2)}','{"bio":"Public bio"}') s`)).s.birth_year, null)
    })
    await t.test('cached legacy profile saves stay usable without exposing or clearing private years', async () => {
      await login(1)
      await db.query(`update students set birth_year=1994,bio='Legacy save' where id='${sid(1)}'`)
      assert.equal((await one('select birth_year from student_private')).birth_year, 1994)
      assert.equal((await one(`select birth_year from students where id='${sid(1)}'`)).birth_year, null)
      await db.query(`update students set birth_year=null,bio='Another legacy save' where id='${sid(1)}'`)
      assert.equal((await one('select birth_year from student_private')).birth_year, 1994)
      await assert.rejects(db.query(`update students set birth_year=1800,bio='Invalid' where id='${sid(1)}'`), /check constraint/)
      assert.equal((await one(`select bio from students where id='${sid(1)}'`)).bio, 'Another legacy save')
      await login(2)
      assert.deepEqual((await db.query(`select * from student_private where student_id='${sid(1)}'`)).rows, [])
    })
    await t.test('owner writes atomically; invalid/forged fields and peers are rejected', async () => {
      await login(1)
      const result = await one(`select update_student_profile('${sid(1)}','{"birth_year":1995,"bio":"Updated"}') s`)
      assert.equal(result.s.birth_year, 1995)
      await assert.rejects(db.query(`select update_student_profile('${sid(1)}','{"birth_year":1996,"full_name":""}')`), /check constraint/)
      assert.equal((await one('select birth_year from student_private')).birth_year, 1995)
      await assert.rejects(db.query(`select update_student_profile('${sid(1)}','{"user_id":"${uid(2)}"}')`), /Unsupported profile field/)
      await assert.rejects(db.query(`select update_student_profile('${sid(2)}','{"bio":"forged"}')`), /Not allowed/)
      assert.equal((await one(`select update_student_profile('${sid(1)}','{"birth_year":null}') s`)).s.birth_year, null)
      await login(3)
      await db.query(`select claim_student('${sid(3)}')`)
      assert.equal((await one('select birth_year from student_private')).birth_year, 1992)
    })
    await t.test('existing accounts are opted out and their rating changes do not enter shared output', async () => {
      await login(1)
      const initial = (await one('select cohort_overview() data')).data
      assert.equal(initial.consent_version, '2026-10-23.v1')
      assert.equal(initial.students, 0)
      await login(2)
      await db.query(`insert into relationships(student_id,level,note) values ('${sid(1)}',4,'Private B note')`)
      await login(1)
      for (const level of [4, 0, 3, 1, 2]) {
        await db.query(`insert into relationships(student_id,level) values ('${sid(2)}',${level})
          on conflict(owner_id,student_id) do update set level=excluded.level`)
        assert.deepEqual((await one(`select cohort_overview('{"United Kingdom":"one-person-group"}') data`)).data, initial)
      }
      await login(2)
      await db.query(`update relationships set level=0 where student_id='${sid(1)}'`)
      await login(1)
      assert.deepEqual((await one('select cohort_overview() data')).data, initial)
      assert.equal((await db.query(`select * from relationships where owner_id='${uid(2)}'`)).rows.length, 0)
      assert.ok((await db.query('select * from relationship_events')).rows.length > 0) // own Stats still works
    })
    await t.test('only the account can opt in, with the current notice and a server timestamp', async () => {
      await login(null, 'anon')
      await assert.rejects(db.query("select set_cohort_consent(true,'2026-10-23.v1')"), /permission denied/)
      await login(1)
      assert.equal((await one('select get_cohort_consent() c')).c.enabled, false)
      await assert.rejects(db.query("select set_cohort_consent(true,'outdated')"), /notice has changed/)
      await assert.rejects(db.query(`insert into cohort_consents(user_id,enabled,notice_version) values ('${uid(2)}',true,'2026-10-23.v1')`), /permission denied/)
      const choice = (await one("select set_cohort_consent(true,'2026-10-23.v1') c")).c
      assert.equal(choice.enabled, true)
      assert.ok(choice.updated_at)
      assert.equal((await one('select cohort_overview() data')).data.students, 1)
      assert.equal((await one('select cohort_overview() data')).data.pairs.met, 0)
      await login(4)
      assert.equal((await db.query('select * from cohort_consents')).rows.length, 0)
      await assert.rejects(db.query(`update cohort_consents set enabled=true where user_id='${uid(2)}'`), /permission denied/)
    })
    await t.test('consenting pairs retain live statistics and disclosed inference; outsiders never contribute', async () => {
      await login(2)
      await db.query("select set_cohort_consent(true,'2026-10-23.v1')")
      await db.query(`update relationships set level=4 where student_id='${sid(1)}'`)
      await login(1)
      const normalize = (data: Record<string, any>) => ({ ...data, me: data.me === null ? null : 'me', edges: data.edges.map((edge: number[]) => edge[2]).sort() })
      const initial = (await one('select cohort_overview() data')).data
      assert.equal(initial.students, 2)
      assert.equal(initial.pairs.friends, 1)
      assert.ok(initial.weekly.length > 0)
      // Consent accepts this inference: raising my level to 4 does not add a
      // second pair when the other participant already marked me as a friend.
      await db.query(`update relationships set level=4 where student_id='${sid(2)}'`)
      assert.equal((await one('select cohort_overview() data')).data.pairs.friends, 1)
      const shared = normalize((await one('select cohort_overview() data')).data)
      await login(3)
      await db.query(`insert into relationships(student_id,level,note) values ('${sid(1)}',4,'Excluded participant note')`)
      await login(null, 'postgres')
      await db.query(`update relationship_events set created_at='2000-01-01' where owner_id='${uid(3)}'`)
      await login(1)
      await db.query(`insert into relationships(student_id,level) values ('${sid(3)}',4)`)
      // This also checks the weekly series start date: excluded history cannot
      // change its length even if it predates all consenting participants.
      assert.deepEqual(normalize((await one(`select cohort_overview('{"Example":"singleton"}') data`)).data), shared)
      assert.equal((await db.query(`select * from relationships where owner_id='${uid(2)}'`)).rows.length, 0)
      assert.ok(!JSON.stringify(shared).includes('Excluded participant note'))
    })
    await t.test('withdrawing or changing notice version excludes connections and history, not personal records', async () => {
      await login(2)
      const records = (await db.query('select * from relationships')).rows
      const history = (await db.query('select * from relationship_events')).rows
      // Withdrawal remains possible even from an older client notice version.
      assert.equal((await one("select set_cohort_consent(false,'old-version') c")).c.enabled, false)
      const without = (await one('select cohort_overview() data')).data
      assert.equal(without.students, 1)
      assert.deepEqual(without.pairs, { met: 0, great: 0, friends: 0 })
      assert.deepEqual(without.edges, [])
      assert.deepEqual(without.weekly, [])
      assert.deepEqual((await db.query('select * from relationships')).rows, records)
      assert.deepEqual((await db.query('select * from relationship_events')).rows, history)
      await db.query("select set_cohort_consent(true,'2026-10-23.v1')")
      await login(null, 'postgres')
      await db.query(`update cohort_consents set notice_version='expired' where user_id='${uid(2)}'`)
      await login(2)
      assert.equal((await one('select get_cohort_consent() c')).c.enabled, false)
      assert.equal((await one('select cohort_overview() data')).data.students, 1)
      await db.query("select set_cohort_consent(true,'2026-10-23.v1')")
    })
    await t.test('deletion RPCs are service-only and direct profile deletion is blocked', async () => {
      for (const actor of [null, 1, 4]) {
        await login(actor, actor ? 'authenticated' : 'anon')
        await assert.rejects(db.query(`select prepare_account_deletion('${sid(1)}','${uid(4)}')`), /permission denied/)
        await assert.rejects(db.query(`select * from account_deletion_objects('${sid(1)}')`), /permission denied/)
        await assert.rejects(db.query(`select finish_account_deletion('${sid(1)}')`), /permission denied/)
        await assert.rejects(db.query(`delete from students where id='${sid(1)}'`), /permission denied/)
      }
      await login(null, 'service_role')
      await assert.rejects(db.query(`select prepare_account_deletion('${sid(1)}','${uid(2)}')`), /Only admins/)
      await assert.rejects(db.query(`select prepare_account_deletion('${sid(4)}','${uid(4)}')`), /Remove the admin role/)
    })
    await t.test('pending erasure blocks writes/uploads and retains all old/owned file paths for retry', async () => {
      await login(null, 'postgres')
      await db.exec(`
        insert into storage.objects(bucket_id,name,owner_id) values
          ('photos','${sid(1)}/old.jpg','${uid(4)}'),
          ('photos','${sid(1)}/current.jpg','${uid(1)}'),
          ('event-photos','${uid(1)}/unused.jpg',null),
          ('photos','legacy/owned.jpg','${uid(1)}'),
          ('photos','${sid(2)}/keep.jpg','${uid(2)}');
      `)
      await login(null, 'service_role')
      const job = (await one(`select prepare_account_deletion('${sid(1)}','${uid(4)}') job`)).job
      assert.equal(job.user_id, uid(1))
      assert.deepEqual((await one(`select prepare_account_deletion('${sid(1)}','${uid(4)}') job`)).job, job)
      assert.equal((await db.query(`select * from account_deletion_objects('${sid(1)}')`)).rows.length, 4)
      await assert.rejects(db.query(`select finish_account_deletion('${sid(1)}')`), /Storage cleanup incomplete/)
      await login(4)
      assert.equal((await db.query('select * from admin_pending_deletions()')).rows.length, 1)
      await login(2)
      await assert.rejects(db.query('select * from admin_pending_deletions()'), /Only admins/)
      await login(1)
      assert.equal((await one('select is_member() ok')).ok, false)
      await assert.rejects(db.query("select set_cohort_consent(true,'2026-10-23.v1')"), /Not allowed/)
      await assert.rejects(db.query(`insert into relationships(student_id,level) values ('${sid(3)}',2)`), /row-level security/)
      await assert.rejects(db.query(`insert into storage.objects(bucket_id,name,owner_id) values ('event-photos','${uid(1)}/new.jpg','${uid(1)}')`), /row-level security/)
      await login(4)
      await assert.rejects(db.query(`update students set user_id=null where id='${sid(1)}'`), /deletion in progress/)
      await assert.rejects(db.query(`insert into storage.objects(bucket_id,name,owner_id) values ('photos','${sid(1)}/new.jpg','${uid(4)}')`), /row-level security/)
    })
    await t.test('Auth hard deletion cascades both sides and all user-owned foreign keys', async () => {
      await login(null, 'postgres')
      await db.exec(`
        insert into allowed_emails(email) values ('fixture1@ox.ac.uk');
        insert into custom_tags(kind,label,created_by) values ('hobby','Fictional private tag','${uid(1)}');
        insert into tools(id,title,html,created_by) values ('${sid(10)}','Synthetic tool','<p>fixture</p>','${uid(4)}');
        insert into tool_data(user_id,tool_id,data,saved_at) values ('${uid(1)}','${sid(10)}','{"private":"fixture"}',now());
        insert into coffee_auto(user_id) values ('${uid(1)}');
        insert into coffee_entries(round,user_id,joining) values ('2026-10-25','${uid(1)}',true);
        insert into coffee_rounds(round,people,groups) values ('2026-10-18',2,1);
        insert into coffee_matches(round,grp,student_id) values ('2026-10-18',1,'${sid(1)}');
        insert into cal_events(id,title,starts_at,created_by) values ('${sid(11)}','Synthetic event',now(),'${uid(1)}');
        insert into cal_rsvps(event_id,user_id,status) values ('${sid(11)}','${uid(2)}','going');
      `)
      // This models successful Storage API removal, not production SQL deletion.
      await db.exec(`delete from storage.objects where id in (
        select o.id from storage.objects o join account_deletion_objects('${sid(1)}') d using(bucket_id,name)
      )`)
      await login(null, 'service_role')
      await assert.rejects(db.query(`select finish_account_deletion('${sid(1)}')`), /Auth deletion incomplete/)
      await login(null, 'postgres')
      const fks = (await db.query<{ table_name: string; col: string; confdeltype: string }>(`
        select c.conrelid::regclass::text table_name, a.attname col, c.confdeltype
        from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
        where c.contype='f' and c.confrelid='auth.users'::regclass and c.connamespace='public'::regnamespace
      `)).rows
      assert.ok(fks.length >= 20)
      for (const fk of fks) assert.equal(fk.confdeltype, 'c', `${fk.table_name} must cascade`)
      await db.exec(`delete from auth.users where id='${uid(1)}'`)
      for (const fk of fks) assert.equal((await one(`select count(*)::int n from ${fk.table_name} where ${fk.col}='${uid(1)}'`)).n, 0)
      for (const table of ['students', 'student_private', 'relationships', 'relationship_events', 'coffee_matches']) {
        const column = table === 'students' ? 'id' : 'student_id'
        assert.equal((await one(`select count(*)::int n from ${table} where ${column}='${sid(1)}'`)).n, 0, table)
      }
      assert.equal((await one(`select count(*)::int n from cal_rsvps where event_id='${sid(11)}'`)).n, 0)
      await login(null, 'service_role')
      // Simulate a request interrupted after Auth deletion: the durable ID remains.
      assert.equal((await one(`select prepare_account_deletion('${sid(1)}','${uid(4)}') job`)).job.user_id, uid(1))
      await db.query(`select finish_account_deletion('${sid(1)}')`)
      await db.query(`select finish_account_deletion('${sid(1)}')`)
      assert.equal((await one(`select prepare_account_deletion('${sid(1)}','${uid(4)}') job`)).job, null)
      await login(1)
      assert.equal((await one('select is_member() ok')).ok, false)
      await assert.rejects(db.query(`select create_my_student('Stale token')`), /Not allowed/)
      await login(null, 'postgres')
      assert.equal((await one('select count(*)::int n from account_deletions')).n, 0)
      assert.equal((await one("select count(*)::int n from allowed_emails where email='fixture1@ox.ac.uk'")).n, 0)
      assert.equal((await one('select count(*)::int n from storage.objects')).n, 1)
      assert.equal((await one(`select count(*)::int n from auth.users where id='${uid(2)}'`)).n, 1)
    })
    await t.test('unclaimed profiles can be fully removed without an Auth account', async () => {
      await login(null, 'postgres')
      await db.exec(`insert into students(id,full_name) values ('${sid(20)}','Unclaimed fixture')`)
      await login(null, 'service_role')
      assert.equal((await one(`select prepare_account_deletion('${sid(20)}','${uid(4)}') job`)).job.user_id, null)
      await db.query(`select finish_account_deletion('${sid(20)}')`)
      await login(null, 'postgres')
      assert.equal((await one(`select count(*)::int n from students where id='${sid(20)}'`)).n, 0)
    })
  } finally { await db.close() }
})
