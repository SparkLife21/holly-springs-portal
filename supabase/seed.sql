-- Local sample data only. Every person here is fictional.
-- Password for every sample login: LocalDev-1847
--
-- Run with: supabase db reset
-- Do not run this against the live church project.

set search_path = public, extensions, auth;

insert into public.households (
  id, name, address, primary_phone, directory_visible, show_address, show_primary_phone
) values
  (
    'a1111111-1111-4111-8111-111111111111',
    'Shepherd',
    '100 Church Hill Road, Harmony, NC 28634',
    '704-555-0100',
    true, true, true
  ),
  (
    'a2222222-2222-4222-8222-222222222222',
    'Whitaker',
    '42 Maple Lane, Harmony, NC 28634',
    '704-555-0110',
    true, true, true
  ),
  (
    'a3333333-3333-4333-8333-333333333333',
    'Brooks',
    '18 Oak Street, Harmony, NC 28634',
    '704-555-0120',
    true, true, true
  ),
  (
    'a4444444-4444-4444-8444-444444444444',
    'Nguyen',
    '7 River Road, Harmony, NC 28634',
    '704-555-0130',
    true, true, false
  ),
  (
    'a5555555-5555-4555-8555-555555555555',
    'Alvarez',
    '15 Cedar Court, Harmony, NC 28634',
    '704-555-0140',
    false, false, false
  ),
  (
    'a6666666-6666-4666-8666-666666666666',
    'Porter',
    '90 Pine Street, Harmony, NC 28634',
    '704-555-0150',
    true, true, true
  );

insert into public.household_admin_notes (household_id, notes) values
  (
    'a1111111-1111-4111-8111-111111111111',
    'Prefers weekday afternoon visits. This note is for pastors only.'
  );

insert into public.people (
  id, household_id, first_name, last_name, preferred_name,
  birthdate, is_child, email, mobile_phone, home_phone, directory_visible, directory_fields_visible
) values
  (
    'b1111111-1111-4111-8111-111111111111',
    'a1111111-1111-4111-8111-111111111111',
    'James', 'Shepherd', null,
    '1975-03-12', false, 'james.shepherd@example.com', '704-555-0101', null, true,
    '{"email": true, "mobile_phone": true, "home_phone": true, "photo": true, "birthdate": false}'
  ),
  (
    'b1111111-1111-4111-8111-111111111112',
    'a1111111-1111-4111-8111-111111111111',
    'Ruth', 'Shepherd', null,
    '1978-07-02', false, 'ruth.shepherd@example.com', '704-555-0102', null, true,
    '{"email": true, "mobile_phone": true, "home_phone": true, "photo": true, "birthdate": false}'
  ),
  (
    'b2222222-2222-4222-8222-222222222221',
    'a2222222-2222-4222-8222-222222222222',
    'Eleanor', 'Whitaker', null,
    '1948-11-20', false, null, null, '704-555-0110', true,
    '{"email": false, "mobile_phone": false, "home_phone": true, "photo": true, "birthdate": false}'
  ),
  (
    'b2222222-2222-4222-8222-222222222222',
    'a2222222-2222-4222-8222-222222222222',
    'Thomas', 'Whitaker', null,
    '1972-01-09', false, 'thomas.whitaker@example.com', '704-555-0111', null, true,
    '{"email": true, "mobile_phone": true, "home_phone": true, "photo": true, "birthdate": false}'
  ),
  (
    'b3333333-3333-4333-8333-333333333331',
    'a3333333-3333-4333-8333-333333333333',
    'Daniel', 'Brooks', null,
    '1984-05-18', false, 'daniel.brooks@example.com', '704-555-0121', null, true,
    '{"email": true, "mobile_phone": true, "home_phone": true, "photo": true, "birthdate": false}'
  ),
  (
    'b3333333-3333-4333-8333-333333333332',
    'a3333333-3333-4333-8333-333333333333',
    'Hannah', 'Brooks', null,
    '1986-09-30', false, 'hannah.brooks@example.com', '704-555-0122', null, true,
    '{"email": false, "mobile_phone": true, "home_phone": true, "photo": true, "birthdate": false}'
  ),
  (
    'b3333333-3333-4333-8333-333333333333',
    'a3333333-3333-4333-8333-333333333333',
    'Lily', 'Brooks', null,
    '2022-04-03', true, null, null, null, true,
    '{"email": false, "mobile_phone": false, "home_phone": false, "photo": true, "birthdate": false}'
  ),
  (
    'b3333333-3333-4333-8333-333333333334',
    'a3333333-3333-4333-8333-333333333333',
    'Caleb', 'Brooks', null,
    '2018-09-12', true, null, null, null, true,
    '{"email": false, "mobile_phone": false, "home_phone": false, "photo": true, "birthdate": false}'
  ),
  (
    'b4444444-4444-4444-8444-444444444441',
    'a4444444-4444-4444-8444-444444444444',
    'Grace', 'Nguyen', null,
    '1990-02-14', false, 'grace.nguyen@example.com', '704-555-0131', null, true,
    '{"email": true, "mobile_phone": true, "home_phone": true, "photo": true, "birthdate": false}'
  ),
  (
    'b4444444-4444-4444-8444-444444444442',
    'a4444444-4444-4444-8444-444444444444',
    'Paul', 'Nguyen', null,
    '1988-12-01', false, null, '704-555-0132', null, true,
    '{"email": false, "mobile_phone": true, "home_phone": false, "photo": true, "birthdate": false}'
  ),
  (
    'b5555555-5555-4555-8555-555555555551',
    'a5555555-5555-4555-8555-555555555555',
    'Maria', 'Alvarez', null,
    '1969-06-22', false, null, '704-555-0141', null, false,
    '{"email": false, "mobile_phone": false, "home_phone": false, "photo": false, "birthdate": false}'
  ),
  (
    'b6666666-6666-4666-8666-666666666661',
    'a6666666-6666-4666-8666-666666666666',
    'Helen', 'Porter', null,
    '1952-08-08', false, 'helen.porter@example.com', '704-555-0151', '704-555-0150', true,
    '{"email": true, "mobile_phone": false, "home_phone": true, "photo": true, "birthdate": false}'
  );

update public.contact_preferences
set alert_by_email = true
where person_id in (
  'b1111111-1111-4111-8111-111111111111',
  'b3333333-3333-4333-8333-333333333331'
);

update public.contact_preferences
set alert_by_text = true,
    sms_consent_at = now()
where person_id in (
  'b2222222-2222-4222-8222-222222222222',
  'b4444444-4444-4444-8444-444444444441'
);

create or replace function public._seed_login(login_email text, login_password text)
returns void
language plpgsql
set search_path = public, extensions, auth
as $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    uid,
    'authenticated',
    'authenticated',
    login_email,
    crypt(login_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    uid,
    jsonb_build_object('sub', uid::text, 'email', login_email),
    'email',
    uid::text,
    now(),
    now(),
    now()
  );
end;
$$;

select public._seed_login('james.shepherd@example.com', 'LocalDev-1847');
select public._seed_login('ruth.shepherd@example.com', 'LocalDev-1847');
select public._seed_login('thomas.whitaker@example.com', 'LocalDev-1847');
select public._seed_login('daniel.brooks@example.com', 'LocalDev-1847');
select public._seed_login('hannah.brooks@example.com', 'LocalDev-1847');
select public._seed_login('grace.nguyen@example.com', 'LocalDev-1847');
select public._seed_login('helen.porter@example.com', 'LocalDev-1847');

drop function public._seed_login(text, text);

insert into public.person_roles (person_id, role_id)
select p.id, r.id
from public.people p
join public.roles r on r.key = 'member'
where p.email in (
  'james.shepherd@example.com',
  'ruth.shepherd@example.com',
  'thomas.whitaker@example.com',
  'daniel.brooks@example.com',
  'hannah.brooks@example.com',
  'grace.nguyen@example.com',
  'helen.porter@example.com'
);

insert into public.person_roles (person_id, role_id)
select p.id, r.id
from public.people p
join public.roles r on r.key = 'super_admin'
where p.email = 'james.shepherd@example.com';

insert into public.person_roles (person_id, role_id)
select p.id, r.id
from public.people p
join public.roles r on r.key = 'admin'
where p.email = 'daniel.brooks@example.com';

insert into public.person_roles (person_id, role_id)
select p.id, r.id
from public.people p
join public.roles r on r.key = 'alert_sender'
where p.email = 'grace.nguyen@example.com';
