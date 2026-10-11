-- Role access checks for Phase 1.
-- Run locally with: supabase test db
--
-- These tests create their own people and roll back. They do not depend on seed.sql.

begin;

select plan(26);

insert into public.households (id, name, address, directory_visible) values
  ('c1111111-1111-4111-8111-111111111111', 'Test Member Home', '1 Test Street', true),
  ('c2222222-2222-4222-8222-222222222222', 'Test Other Home', '2 Test Street', true),
  ('c3333333-3333-4333-8333-333333333333', 'Test Private Home', '3 Test Street', false);

insert into public.household_admin_notes (household_id, notes) values
  ('c1111111-1111-4111-8111-111111111111', 'weekday afternoon visits');

insert into public.people (
  id, household_id, first_name, last_name, email, mobile_phone, directory_fields_visible
) values
  (
    'd1111111-1111-4111-8111-111111111111',
    'c1111111-1111-4111-8111-111111111111',
    'Mary', 'Member', 'test.member@example.com', '704-555-0101',
    '{"email": true, "mobile_phone": true, "home_phone": true, "photo": true, "birthdate": false}'
  ),
  (
    'd2222222-2222-4222-8222-222222222222',
    'c2222222-2222-4222-8222-222222222222',
    'Owen', 'Hidden', 'test.hidden@example.com', '704-555-0199',
    '{"email": true, "mobile_phone": false, "home_phone": true, "photo": true, "birthdate": false}'
  ),
  (
    'd3333333-3333-4333-8333-333333333333',
    'c3333333-3333-4333-8333-333333333333',
    'Paula', 'Private', 'test.private@example.com', '704-555-0141',
    '{"email": false, "mobile_phone": false, "home_phone": false, "photo": false, "birthdate": false}'
  ),
  (
    'd4444444-4444-4444-8444-444444444444',
    'c1111111-1111-4111-8111-111111111111',
    'Adam', 'Admin', 'test.admin@example.com', '704-555-0121',
    '{"email": true, "mobile_phone": true, "home_phone": true, "photo": true, "birthdate": false}'
  ),
  (
    'd5555555-5555-4555-8555-555555555555',
    'c2222222-2222-4222-8222-222222222222',
    'Alice', 'Alerts', 'test.alerts@example.com', '704-555-0131',
    '{"email": true, "mobile_phone": true, "home_phone": true, "photo": true, "birthdate": false}'
  ),
  (
    'd6666666-6666-4666-8666-666666666666',
    'c1111111-1111-4111-8111-111111111111',
    'Sam', 'Super', 'test.super@example.com', '704-555-0161',
    '{"email": true, "mobile_phone": true, "home_phone": true, "photo": true, "birthdate": false}'
  ),
  (
    'd7777777-7777-4777-8777-777777777777',
    'c2222222-2222-4222-8222-222222222222',
    'Uma', 'Unlinked', 'test.unlinked@example.com', null,
    '{"email": true, "mobile_phone": true, "home_phone": true, "photo": true, "birthdate": false}'
  );

select throws_ok(
  $$select tests.create_supabase_user('stranger.test@example.com', 'LocalDev-1847')$$,
  'Holly Springs member accounts are by invitation only.',
  'public signups are rejected'
);

select tests.create_supabase_user('test.member@example.com', 'LocalDev-1847');
select tests.create_supabase_user('test.hidden@example.com', 'LocalDev-1847');
select tests.create_supabase_user('test.admin@example.com', 'LocalDev-1847');
select tests.create_supabase_user('test.alerts@example.com', 'LocalDev-1847');
select tests.create_supabase_user('test.super@example.com', 'LocalDev-1847');
select tests.create_supabase_user('test.unlinked@example.com', 'LocalDev-1847');

update public.people
set user_id = null
where email = 'test.unlinked@example.com';

insert into public.person_roles (person_id, role_id)
select p.id, r.id
from public.people p
join public.roles r on r.key = 'member'
where p.email in (
  'test.member@example.com',
  'test.admin@example.com',
  'test.alerts@example.com',
  'test.super@example.com'
);

insert into public.person_roles (person_id, role_id)
select p.id, r.id
from public.people p
join public.roles r on r.key = 'admin'
where p.email = 'test.admin@example.com';

insert into public.person_roles (person_id, role_id)
select p.id, r.id
from public.people p
join public.roles r on r.key = 'alert_sender'
where p.email = 'test.alerts@example.com';

insert into public.person_roles (person_id, role_id)
select p.id, r.id
from public.people p
join public.roles r on r.key = 'super_admin'
where p.email = 'test.super@example.com';

select is(
  (
    select user_id = tests.get_supabase_uid('test.member@example.com')
    from public.people
    where email = 'test.member@example.com'
  ),
  true,
  'a new login links to the matching person'
);

set local role anon;

select throws_ok(
  $$select id from public.people$$,
  '42501',
  'permission denied for table people',
  'anonymous visitors cannot read people'
);

reset role;

select tests.authenticate_as('test.member@example.com');

select isnt_empty(
  $$select id from public.people where email = 'test.member@example.com'$$,
  'a member can read their own record'
);

select is_empty(
  $$select id from public.people where email = 'test.hidden@example.com'$$,
  'a member cannot read another household from the people table'
);

select ok(
  position('704-555-0199' in public.directory_households('')::text) = 0,
  'hidden mobile numbers are left out of the directory'
);

select ok(
  position('Test Private Home' in public.directory_households('')::text) = 0,
  'private households are left out of the directory'
);

select ok(
  position('weekday afternoon' in public.directory_households('')::text) = 0,
  'pastoral notes are not included in the directory'
);

select ok(
  position('Test Other Home' in public.directory_households('Other')::text) > 0,
  'search finds a household by name'
);

select is_empty(
  $$select * from public.household_admin_notes$$,
  'members cannot read pastoral notes'
);

select throws_ok(
  $$insert into public.households (name) values ('Nope Household')$$,
  'new row violates row-level security policy for table "households"',
  'members cannot add households'
);

select tests.authenticate_as('test.alerts@example.com');

select throws_ok(
  $$insert into public.households (name) values ('Nope Household')$$,
  'new row violates row-level security policy for table "households"',
  'alert senders cannot add households'
);

select tests.authenticate_as('test.admin@example.com');

select lives_ok(
  $$insert into public.households (name) values ('Admin Added Household')$$,
  'an admin can add a household'
);

select ok(
  position('704-555-0199' in public.directory_households('')::text) > 0,
  'admins can see numbers a member chose to hide'
);

select ok(
  position('Test Private Home' in public.directory_households('')::text) > 0,
  'admins can see private households'
);

select isnt_empty(
  $$select notes from public.household_admin_notes where notes like '%weekday afternoon%'$$,
  'admins can read pastoral notes'
);

select tests.authenticate_as('test.member@example.com');

update public.people
set mobile_phone = '704-555-0108'
where email = 'test.member@example.com';

select is(
  (select mobile_phone from public.people where email = 'test.member@example.com'),
  '704-555-0108',
  'a member can update their own mobile phone'
);

update public.people
set mobile_phone = '704-555-0000'
where email = 'test.hidden@example.com';

select tests.clear_authentication();

select is(
  (select mobile_phone from public.people where email = 'test.hidden@example.com'),
  '704-555-0199',
  'a member cannot change another household phone'
);

select tests.authenticate_as('test.member@example.com');

select throws_ok(
  $$update public.households set name = 'Renamed Home' where name = 'Test Member Home'$$,
  'Please ask an admin to change the household name.',
  'a member cannot rename the household'
);

select throws_ok(
  $$select public.set_person_roles(
    (select id from public.people where email = 'test.member@example.com'),
    array['member', 'admin']
  )$$,
  'Only an admin can change roles.',
  'a member cannot change roles'
);

select throws_ok(
  $$select public.record_directory_export()$$,
  'Only an admin can export the directory.',
  'a member cannot export the directory'
);

select tests.authenticate_as('test.admin@example.com');

select throws_ok(
  $$select public.set_person_roles(
    (select id from public.people where email = 'test.member@example.com'),
    array['member', 'super_admin']
  )$$,
  'Only a super admin can grant or remove Admin and Super Admin.',
  'an admin cannot grant super admin'
);

select lives_ok(
  $$select public.record_directory_export()$$,
  'an admin can record a directory export'
);

select ok(
  (select count(*) from public.audit_log where action = 'directory_exported') >= 1,
  'a directory export is written to the audit log'
);

select tests.authenticate_as('test.super@example.com');

select lives_ok(
  $$select public.set_person_roles(
    (select id from public.people where email = 'test.alerts@example.com'),
    array['member', 'admin', 'alert_sender']
  )$$,
  'a super admin can grant admin'
);

select tests.authenticate_as('test.unlinked@example.com');

select throws_ok(
  $$select public.directory_households('')$$,
  'Your login is not connected to a household yet.',
  'an unlinked login cannot open the directory'
);

select tests.clear_authentication();

delete from public.person_roles
where role_id = (select id from public.roles where key = 'super_admin');

insert into public.person_roles (person_id, role_id)
select p.id, r.id
from public.people p
join public.roles r on r.key = 'super_admin'
where p.email = 'test.super@example.com';

select tests.authenticate_as('test.super@example.com');

select throws_ok(
  $$select public.set_person_roles(
    (select id from public.people where email = 'test.super@example.com'),
    array['member']
  )$$,
  'The church needs at least one Super Admin.',
  'the last super admin cannot be removed'
);

select * from finish();

rollback;
