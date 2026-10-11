-- Phase 1 foundation for the Holly Springs member portal.
--
-- Tables in this migration:
--   roles, households, household_admin_notes, people,
--   contact_preferences, person_roles, invites, audit_log
--
-- Later migrations (do not add those tables here):
--   Phase 2  alerts, alert_deliveries
--   Phase 3  children_profiles, child_guardians, emergency_contacts,
--            classrooms, checkins, checkin_notes
--   Phase 4  events, volunteer_opportunities, volunteer_signups, volunteer_requests
--   Phase 5  prayer_requests, prayer_responses, prayer_updates
--            plus the public prayer Edge Function
--   Phase 6  chat_channels, chat_messages, chat_reports
--   Phase 7  push_subscriptions
--   Later    giving and reimbursements
--
-- Directory reads go through directory_households(), which removes fields a
-- person has chosen to hide. The people table itself is only readable inside
-- your own household (or by an admin), so a hidden phone number is not sitting
-- in a row the browser can request.
--
-- Pastoral notes live in household_admin_notes, not on households, so a
-- household member cannot read them through the API.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

insert into public.roles (key, label, description) values
  ('super_admin', 'Super Admin', 'Everything, including who the admins are.'),
  ('admin', 'Admin', 'Directory, households, events, alerts, and moderation.'),
  ('alert_sender', 'Alert Sender', 'Send phone-tree alerts without full admin access.'),
  ('childrens_ministry_lead', 'Children''s Ministry Lead', 'All children''s records, classrooms, and attendance.'),
  ('proctor', 'Proctor', 'Check children in and out, and see children currently in the room.'),
  ('treasurer', 'Treasurer', 'Giving reports and reimbursements, when those are added.'),
  ('member', 'Member', 'Directory, events, prayer, and your own household.');

-- ---------------------------------------------------------------------------
-- Households and people
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  primary_phone text,
  directory_visible boolean not null default true,
  show_address boolean not null default true,
  show_primary_phone boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint households_name_not_blank check (length(btrim(name)) > 0)
);

create table public.household_admin_notes (
  household_id uuid primary key references public.households (id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  birthdate date,
  is_child boolean not null default false,
  email text,
  mobile_phone text,
  home_phone text,
  photo_url text,
  directory_visible boolean not null default true,
  directory_fields_visible jsonb not null default jsonb_build_object(
    'email', true,
    'mobile_phone', true,
    'home_phone', true,
    'photo', true,
    'birthdate', false
  ),
  user_id uuid unique references auth.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_first_name_not_blank check (length(btrim(first_name)) > 0),
  constraint people_last_name_not_blank check (length(btrim(last_name)) > 0),
  constraint people_directory_fields_object check (jsonb_typeof(directory_fields_visible) = 'object')
);

create unique index people_email_unique
  on public.people (email)
  where email is not null and archived_at is null;

create index people_household_id_idx on public.people (household_id);
create index people_last_name_idx on public.people (last_name, first_name);
create index households_name_idx on public.households (name);

create table public.contact_preferences (
  person_id uuid primary key references public.people (id) on delete cascade,
  alert_by_call boolean not null default true,
  alert_by_text boolean not null default false,
  alert_by_email boolean not null default false,
  alert_by_push boolean not null default false,
  sms_consent_at timestamptz,
  sms_opted_out_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.person_roles (
  person_id uuid not null references public.people (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  granted_by uuid references public.people (id),
  created_at timestamptz not null default now(),
  primary key (person_id, role_id)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  person_id uuid not null references public.people (id) on delete cascade,
  invited_by uuid references public.people (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index invites_person_id_idx on public.invites (person_id);
create index invites_email_idx on public.invites (email);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.people (id),
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_action_idx on public.audit_log (action);

-- ---------------------------------------------------------------------------
-- Row preparation
-- ---------------------------------------------------------------------------

create or replace function public.prepare_person()
returns trigger
language plpgsql
as $$
begin
  if new.email is not null then
    new.email := lower(btrim(new.email));
    if new.email = '' then
      new.email := null;
    end if;
  end if;

  if new.preferred_name is not null and btrim(new.preferred_name) = '' then
    new.preferred_name := null;
  end if;

  -- Children are listed by name. Phones, email, and birthday stay off the
  -- directory until an admin or parent turns a field on.
  if tg_op = 'INSERT' and new.is_child then
    new.directory_fields_visible := jsonb_build_object(
      'email', false,
      'mobile_phone', false,
      'home_phone', false,
      'photo', coalesce((new.directory_fields_visible ->> 'photo')::boolean, true),
      'birthdate', false
    );
  end if;

  return new;
end;
$$;

create trigger people_prepare
  before insert or update on public.people
  for each row execute function public.prepare_person();

create or replace function public.create_default_contact_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.contact_preferences (person_id)
  values (new.id)
  on conflict (person_id) do nothing;
  return new;
end;
$$;

create trigger people_default_contact_preferences
  after insert on public.people
  for each row execute function public.create_default_contact_preferences();

create trigger households_set_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();

create trigger people_set_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();

create trigger contact_preferences_set_updated_at
  before update on public.contact_preferences
  for each row execute function public.set_updated_at();

create trigger household_admin_notes_set_updated_at
  before update on public.household_admin_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Identity helpers (security definer so policies do not recurse)
-- ---------------------------------------------------------------------------

create or replace function public.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.people p
  join public.households h on h.id = p.household_id
  where p.user_id = auth.uid()
    and p.archived_at is null
    and h.archived_at is null
  limit 1
$$;

create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.household_id
  from public.people p
  join public.households h on h.id = p.household_id
  where p.user_id = auth.uid()
    and p.archived_at is null
    and h.archived_at is null
  limit 1
$$;

create or replace function public.has_role(role_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.person_roles pr
    join public.roles r on r.id = pr.role_id
    where pr.person_id = public.current_person_id()
      and r.key = role_key
  )
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('super_admin')
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('super_admin') or public.has_role('admin')
$$;

-- ---------------------------------------------------------------------------
-- Column guards
-- A household member may correct contact details and directory sharing.
-- Names, birthdays, archive flags, and which login is linked stay with admins.
-- When nobody is signed in (seed data, SQL editor, service role), allow the write.
-- ---------------------------------------------------------------------------

create or replace function public.protect_household_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.name is distinct from old.name
     or new.archived_at is distinct from old.archived_at
     or new.created_at is distinct from old.created_at
     or new.id is distinct from old.id
  then
    raise exception 'Please ask an admin to change the household name.';
  end if;

  if new.id is distinct from public.current_household_id() then
    raise exception 'You can only update your own household.';
  end if;

  return new;
end;
$$;

create trigger households_protect_update
  before update on public.households
  for each row execute function public.protect_household_update();

create or replace function public.protect_person_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  -- A person may attach their own new login when the email matches.
  -- They cannot point a record at someone else's login.
  if new.user_id is distinct from old.user_id then
    if not (
      old.user_id is null
      and new.user_id = auth.uid()
      and new.email = lower(coalesce(auth.jwt() ->> 'email', ''))
    ) then
      raise exception 'Please ask an admin to change who can sign in for this person.';
    end if;
  end if;

  if new.household_id is distinct from old.household_id
     or new.first_name is distinct from old.first_name
     or new.last_name is distinct from old.last_name
     or new.birthdate is distinct from old.birthdate
     or new.is_child is distinct from old.is_child
     or new.archived_at is distinct from old.archived_at
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Please ask an admin to change a name, birthday, or household.';
  end if;

  if new.household_id is distinct from public.current_household_id() then
    raise exception 'You can only update people in your own household.';
  end if;

  return new;
end;
$$;

create trigger people_protect_update
  before update on public.people
  for each row execute function public.protect_person_update();

create or replace function public.protect_contact_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_person_id();
begin
  if auth.uid() is null then
    return new;
  end if;

  if old.sms_opted_out_at is not null and new.sms_opted_out_at is null then
    raise exception 'Text opt-out stays in place until the person texts START.';
  end if;

  if old.sms_opted_out_at is not null and new.alert_by_text then
    raise exception 'This person opted out by texting STOP. Texts stay off until they text START.';
  end if;

  if not public.is_admin() then
    if not exists (
      select 1
      from public.people p
      where p.id = new.person_id
        and p.household_id = public.current_household_id()
    ) then
      raise exception 'You can only update contact preferences in your own household.';
    end if;

    if new.sms_consent_at is distinct from old.sms_consent_at
       or new.sms_opted_out_at is distinct from old.sms_opted_out_at
    then
      if actor is distinct from new.person_id then
        raise exception 'Only that person or an admin can change text-message consent.';
      end if;
    end if;
  end if;

  if new.alert_by_text and new.sms_consent_at is null then
    if public.is_admin() or actor = new.person_id then
      new.sms_consent_at := now();
    else
      raise exception 'Texts stay off until that person agrees to receive them.';
    end if;
  end if;

  return new;
end;
$$;

create trigger contact_preferences_protect
  before update on public.contact_preferences
  for each row execute function public.protect_contact_preferences();

-- ---------------------------------------------------------------------------
-- Invite-only accounts
-- A login can be created only when it matches one unlinked person, or an
-- open invite. This still applies if public sign-up is switched on by mistake.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_invite_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  match_count integer;
begin
  select count(*)
  into match_count
  from public.people
  where email = lower(new.email)
    and archived_at is null
    and user_id is null;

  if match_count = 1 then
    return new;
  end if;

  if exists (
    select 1
    from public.invites
    where email = lower(new.email)
      and accepted_at is null
      and expires_at > now()
  ) then
    return new;
  end if;

  raise exception 'Holly Springs member accounts are by invitation only.';
end;
$$;

create trigger auth_users_invite_only
  before insert on auth.users
  for each row execute function public.enforce_invite_only();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched uuid;
  match_count integer;
begin
  select count(*)
  into match_count
  from public.people
  where email = lower(new.email)
    and archived_at is null
    and user_id is null;

  if match_count = 1 then
    select id
    into matched
    from public.people
    where email = lower(new.email)
      and archived_at is null
      and user_id is null;

    update public.people
    set user_id = new.id
    where id = matched;

    update public.invites
    set accepted_at = now()
    where email = lower(new.email)
      and accepted_at is null;
  end if;

  return new;
end;
$$;

create trigger auth_users_link_person
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Profile, directory, and admin actions
-- ---------------------------------------------------------------------------

create or replace function public.link_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  email_claim text := lower(coalesce(auth.jwt() ->> 'email', ''));
  match_count integer;
begin
  if auth.uid() is null or email_claim = '' then
    return;
  end if;

  if exists (select 1 from public.people where user_id = auth.uid()) then
    return;
  end if;

  select count(*)
  into match_count
  from public.people
  where email = email_claim
    and user_id is null
    and archived_at is null;

  if match_count = 1 then
    update public.people
    set user_id = auth.uid()
    where email = email_claim
      and user_id is null
      and archived_at is null;

    update public.invites
    set accepted_at = now()
    where email = email_claim
      and accepted_at is null;
  end if;
end;
$$;

create or replace function public.current_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  person_row public.people%rowtype;
  household_row public.households%rowtype;
  role_keys text[];
begin
  if auth.uid() is null then
    return null;
  end if;

  select *
  into person_row
  from public.people
  where user_id = auth.uid()
  order by archived_at nulls first
  limit 1;

  if not found then
    return jsonb_build_object('linked', false, 'reason', 'unlinked');
  end if;

  select *
  into household_row
  from public.households
  where id = person_row.household_id;

  if person_row.archived_at is not null or household_row.archived_at is not null then
    return jsonb_build_object('linked', false, 'reason', 'archived');
  end if;

  select coalesce(array_agg(r.key order by r.key), '{}')
  into role_keys
  from public.person_roles pr
  join public.roles r on r.id = pr.role_id
  where pr.person_id = person_row.id;

  return jsonb_build_object(
    'linked', true,
    'person_id', person_row.id,
    'household_id', person_row.household_id,
    'household_name', household_row.name,
    'first_name', person_row.first_name,
    'last_name', person_row.last_name,
    'preferred_name', person_row.preferred_name,
    'email', person_row.email,
    'is_child', person_row.is_child,
    'roles', to_jsonb(role_keys)
  );
end;
$$;

create or replace function public.directory_households(search text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid;
  viewer_household uuid;
  viewer_admin boolean;
  needle text;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Please sign in.';
  end if;

  viewer := public.current_person_id();
  if viewer is null then
    raise exception 'Your login is not connected to a household yet.';
  end if;

  viewer_household := public.current_household_id();
  viewer_admin := public.is_admin();

  needle := left(btrim(coalesce(search, '')), 80);
  needle := replace(needle, '\', '\\');
  needle := replace(needle, '%', '\%');
  needle := replace(needle, '_', '\_');

  select coalesce(
    jsonb_agg((entry - 'sort_name') order by entry ->> 'sort_name'),
    '[]'::jsonb
  )
  into result
  from (
    select jsonb_build_object(
      'id', h.id,
      'name', h.name,
      'sort_name', lower(h.name),
      'address', case
        when viewer_admin or h.id = viewer_household or h.show_address then nullif(btrim(h.address), '')
        else null
      end,
      'primary_phone', case
        when viewer_admin or h.id = viewer_household or h.show_primary_phone then nullif(btrim(h.primary_phone), '')
        else null
      end,
      'in_directory', h.directory_visible,
      'is_own_household', h.id = viewer_household,
      'members', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'first_name', p.first_name,
            'last_name', p.last_name,
            'preferred_name', p.preferred_name,
            'is_child', p.is_child,
            'in_directory', p.directory_visible,
            'email', case
              when viewer_admin or p.household_id = viewer_household
                or coalesce((p.directory_fields_visible ->> 'email')::boolean, false)
              then p.email else null
            end,
            'mobile_phone', case
              when viewer_admin or p.household_id = viewer_household
                or coalesce((p.directory_fields_visible ->> 'mobile_phone')::boolean, false)
              then p.mobile_phone else null
            end,
            'home_phone', case
              when viewer_admin or p.household_id = viewer_household
                or coalesce((p.directory_fields_visible ->> 'home_phone')::boolean, false)
              then p.home_phone else null
            end,
            'photo_url', case
              when viewer_admin or p.household_id = viewer_household
                or coalesce((p.directory_fields_visible ->> 'photo')::boolean, false)
              then p.photo_url else null
            end,
            'birthdate', case
              when viewer_admin or p.household_id = viewer_household
                or coalesce((p.directory_fields_visible ->> 'birthdate')::boolean, false)
              then p.birthdate else null
            end,
            'sharing', case
              when viewer_admin then jsonb_build_object(
                'email', coalesce((p.directory_fields_visible ->> 'email')::boolean, false),
                'mobile_phone', coalesce((p.directory_fields_visible ->> 'mobile_phone')::boolean, false),
                'home_phone', coalesce((p.directory_fields_visible ->> 'home_phone')::boolean, false),
                'photo', coalesce((p.directory_fields_visible ->> 'photo')::boolean, false),
                'birthdate', coalesce((p.directory_fields_visible ->> 'birthdate')::boolean, false)
              )
              else null
            end
          )
          order by p.is_child, lower(p.last_name), lower(p.first_name)
        ), '[]'::jsonb)
        from public.people p
        where p.household_id = h.id
          and p.archived_at is null
          and (
            viewer_admin
            or p.household_id = viewer_household
            or p.directory_visible
          )
      )
    ) as entry
    from public.households h
    where h.archived_at is null
      and (
        viewer_admin
        or h.id = viewer_household
        or h.directory_visible
      )
      and (
        needle = ''
        or h.name ilike '%' || needle || '%' escape '\'
        or exists (
          select 1
          from public.people p
          where p.household_id = h.id
            and p.archived_at is null
            and (
              viewer_admin
              or p.household_id = viewer_household
              or (h.directory_visible and p.directory_visible)
            )
            and (
              p.first_name ilike '%' || needle || '%' escape '\'
              or p.last_name ilike '%' || needle || '%' escape '\'
              or coalesce(p.preferred_name, '') ilike '%' || needle || '%' escape '\'
            )
        )
      )
  ) listed;

  return result;
end;
$$;

create or replace function public.set_person_roles(target_person uuid, role_keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := public.current_person_id();
  next_keys text[];
begin
  if caller is null or not public.is_admin() then
    raise exception 'Only an admin can change roles.';
  end if;

  if not exists (select 1 from public.people where id = target_person) then
    raise exception 'That person is not in the directory.';
  end if;

  select coalesce(array_agg(distinct r.key order by r.key), '{}'::text[])
  into next_keys
  from unnest(coalesce(role_keys, array[]::text[])) as requested (key)
  join public.roles r on r.key = requested.key;

  if not public.is_super_admin() and exists (
    select 1
    from public.person_roles pr
    join public.roles r on r.id = pr.role_id
    where pr.person_id = target_person
      and r.key in ('super_admin', 'admin')
  ) then
    raise exception 'Only a super admin can change roles for an admin.';
  end if;

  if not public.is_super_admin() then
    if exists (
      select r.key
      from public.person_roles pr
      join public.roles r on r.id = pr.role_id
      where pr.person_id = target_person
        and r.key in ('super_admin', 'admin')
      except
      select unnest(next_keys)
    ) or exists (
      select 1
      from unnest(next_keys) as requested (key)
      where requested.key in ('super_admin', 'admin')
        and not exists (
          select 1
          from public.person_roles pr
          join public.roles r on r.id = pr.role_id
          where pr.person_id = target_person
            and r.key = requested.key
        )
    ) then
      raise exception 'Only a super admin can grant or remove Admin and Super Admin.';
    end if;
  end if;

  if exists (
    select 1
    from public.person_roles pr
    join public.roles r on r.id = pr.role_id
    where pr.person_id = target_person
      and r.key = 'super_admin'
  ) and not ('super_admin' = any (next_keys)) then
    if (
      select count(*)
      from public.person_roles pr
      join public.roles r on r.id = pr.role_id
      where r.key = 'super_admin'
    ) <= 1 then
      raise exception 'The church needs at least one Super Admin.';
    end if;
  end if;

  delete from public.person_roles
  where person_id = target_person
    and role_id not in (
      select id from public.roles where key = any (next_keys)
    );

  insert into public.person_roles (person_id, role_id, granted_by)
  select target_person, r.id, caller
  from public.roles r
  where r.key = any (next_keys)
  on conflict (person_id, role_id) do nothing;

  insert into public.audit_log (actor_id, action, target_table, target_id, metadata)
  values (
    caller,
    'roles_updated',
    'person_roles',
    target_person,
    jsonb_build_object('roles', next_keys)
  );
end;
$$;

create or replace function public.archive_household(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can archive a household.';
  end if;

  update public.households
  set archived_at = now()
  where id = target
    and archived_at is null;

  insert into public.audit_log (actor_id, action, target_table, target_id)
  values (public.current_person_id(), 'household_archived', 'households', target);
end;
$$;

create or replace function public.restore_household(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can restore a household.';
  end if;

  update public.households
  set archived_at = null
  where id = target;

  insert into public.audit_log (actor_id, action, target_table, target_id)
  values (public.current_person_id(), 'household_restored', 'households', target);
end;
$$;

create or replace function public.archive_person(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can archive a person.';
  end if;

  update public.people
  set archived_at = now()
  where id = target
    and archived_at is null;

  insert into public.audit_log (actor_id, action, target_table, target_id)
  values (public.current_person_id(), 'person_archived', 'people', target);
end;
$$;

create or replace function public.restore_person(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can restore a person.';
  end if;

  update public.people
  set archived_at = null
  where id = target;

  insert into public.audit_log (actor_id, action, target_table, target_id)
  values (public.current_person_id(), 'person_restored', 'people', target);
end;
$$;

create or replace function public.merge_households(keep_id uuid, drop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  keep_notes text;
  drop_notes text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can combine households.';
  end if;

  if keep_id = drop_id then
    raise exception 'Choose two different households.';
  end if;

  if not exists (select 1 from public.households where id = keep_id and archived_at is null)
     or not exists (select 1 from public.households where id = drop_id and archived_at is null)
  then
    raise exception 'Both households need to be active before they can be combined.';
  end if;

  select notes into keep_notes from public.household_admin_notes where household_id = keep_id;
  select notes into drop_notes from public.household_admin_notes where household_id = drop_id;

  update public.people
  set household_id = keep_id
  where household_id = drop_id;

  insert into public.household_admin_notes (household_id, notes)
  values (
    keep_id,
    coalesce(
      concat_ws(
        E'\n\n',
        nullif(btrim(coalesce(keep_notes, '')), ''),
        nullif(btrim(coalesce(drop_notes, '')), '')
      ),
      ''
    )
  )
  on conflict (household_id) do update
  set notes = excluded.notes;

  update public.households
  set archived_at = now()
  where id = drop_id;

  insert into public.audit_log (actor_id, action, target_table, target_id, metadata)
  values (
    public.current_person_id(),
    'households_merged',
    'households',
    keep_id,
    jsonb_build_object('dropped_household_id', drop_id)
  );
end;
$$;

create or replace function public.record_directory_export()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can export the directory.';
  end if;

  insert into public.audit_log (actor_id, action, target_table, metadata)
  values (
    public.current_person_id(),
    'directory_exported',
    'people',
    jsonb_build_object('at', now())
  );
end;
$$;

create or replace function public.record_directory_import(
  inserted_households integer,
  inserted_people integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can import the directory.';
  end if;

  insert into public.audit_log (actor_id, action, target_table, metadata)
  values (
    public.current_person_id(),
    'directory_imported',
    'people',
    jsonb_build_object(
      'inserted_households', inserted_households,
      'inserted_people', inserted_people
    )
  );
end;
$$;

-- Run once from the Supabase SQL editor after you create the first login.
-- Not granted to signed-in members. Postgres (the SQL editor) can still run it.
create or replace function public.bootstrap_first_super_admin(
  admin_email text,
  admin_first_name text,
  admin_last_name text,
  admin_household_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  hid uuid;
  pid uuid;
begin
  if exists (
    select 1
    from public.person_roles pr
    join public.roles r on r.id = pr.role_id
    where r.key = 'super_admin'
  ) then
    raise exception 'A Super Admin already exists. Use the roles page instead.';
  end if;

  select id
  into uid
  from auth.users
  where lower(email) = lower(admin_email);

  if uid is null then
    raise exception 'Create the login in Supabase Authentication first, then run this again.';
  end if;

  if exists (select 1 from public.people where user_id = uid) then
    select id into pid from public.people where user_id = uid;
  else
    insert into public.households (name)
    values (admin_household_name)
    returning id into hid;

    insert into public.people (household_id, first_name, last_name, email, user_id)
    values (hid, admin_first_name, admin_last_name, lower(admin_email), uid)
    returning id into pid;
  end if;

  insert into public.person_roles (person_id, role_id)
  select pid, id
  from public.roles
  where key in ('super_admin', 'member')
  on conflict (person_id, role_id) do nothing;

  insert into public.audit_log (actor_id, action, target_table, target_id)
  values (pid, 'super_admin_bootstrapped', 'people', pid);

  return pid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.roles enable row level security;
alter table public.households enable row level security;
alter table public.household_admin_notes enable row level security;
alter table public.people enable row level security;
alter table public.contact_preferences enable row level security;
alter table public.person_roles enable row level security;
alter table public.invites enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.roles from anon, authenticated;
revoke all on public.households from anon, authenticated;
revoke all on public.household_admin_notes from anon, authenticated;
revoke all on public.people from anon, authenticated;
revoke all on public.contact_preferences from anon, authenticated;
revoke all on public.person_roles from anon, authenticated;
revoke all on public.invites from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;

grant select on public.roles to authenticated;
grant select, insert, update on public.households to authenticated;
grant select, insert, update on public.household_admin_notes to authenticated;
grant select, insert, update on public.people to authenticated;
grant select, update on public.contact_preferences to authenticated;
grant select on public.person_roles to authenticated;
grant select on public.invites to authenticated;
grant select on public.audit_log to authenticated;

create policy roles_select_linked
  on public.roles
  for select
  to authenticated
  using (public.current_person_id() is not null);

create policy households_select
  on public.households
  for select
  to authenticated
  using (
    public.is_admin()
    or (archived_at is null and id = public.current_household_id())
  );

create policy households_insert
  on public.households
  for insert
  to authenticated
  with check (public.is_admin());

create policy households_update
  on public.households
  for update
  to authenticated
  using (
    public.is_admin()
    or (archived_at is null and id = public.current_household_id())
  )
  with check (
    public.is_admin()
    or (archived_at is null and id = public.current_household_id())
  );

create policy household_notes_admin
  on public.household_admin_notes
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy people_select
  on public.people
  for select
  to authenticated
  using (
    public.is_admin()
    or (
      archived_at is null
      and household_id = public.current_household_id()
    )
  );

create policy people_insert
  on public.people
  for insert
  to authenticated
  with check (public.is_admin());

create policy people_update
  on public.people
  for update
  to authenticated
  using (
    public.is_admin()
    or (
      archived_at is null
      and household_id = public.current_household_id()
    )
  )
  with check (
    public.is_admin()
    or (
      archived_at is null
      and household_id = public.current_household_id()
    )
  );

create policy contact_preferences_select
  on public.contact_preferences
  for select
  to authenticated
  using (
    public.is_admin()
    or person_id in (
      select id
      from public.people
      where household_id = public.current_household_id()
        and archived_at is null
    )
  );

create policy contact_preferences_update
  on public.contact_preferences
  for update
  to authenticated
  using (
    public.is_admin()
    or person_id in (
      select id
      from public.people
      where household_id = public.current_household_id()
        and archived_at is null
    )
  )
  with check (
    public.is_admin()
    or person_id in (
      select id
      from public.people
      where household_id = public.current_household_id()
        and archived_at is null
    )
  );

create policy person_roles_select
  on public.person_roles
  for select
  to authenticated
  using (
    public.is_admin()
    or person_id = public.current_person_id()
  );

create policy invites_select_admin
  on public.invites
  for select
  to authenticated
  using (public.is_admin());

create policy audit_log_select_admin
  on public.audit_log
  for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Function privileges
-- PostgREST exposes every public function that the caller may execute.
-- ---------------------------------------------------------------------------

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.prepare_person() from public, anon, authenticated;
revoke all on function public.create_default_contact_preferences() from public, anon, authenticated;
revoke all on function public.protect_household_update() from public, anon, authenticated;
revoke all on function public.protect_person_update() from public, anon, authenticated;
revoke all on function public.protect_contact_preferences() from public, anon, authenticated;
revoke all on function public.enforce_invite_only() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

revoke all on function public.current_person_id() from public, anon;
revoke all on function public.current_household_id() from public, anon;
revoke all on function public.has_role(text) from public, anon;
revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.link_my_account() from public, anon;
revoke all on function public.current_profile() from public, anon;
revoke all on function public.directory_households(text) from public, anon;
revoke all on function public.set_person_roles(uuid, text[]) from public, anon;
revoke all on function public.archive_household(uuid) from public, anon;
revoke all on function public.restore_household(uuid) from public, anon;
revoke all on function public.archive_person(uuid) from public, anon;
revoke all on function public.restore_person(uuid) from public, anon;
revoke all on function public.merge_households(uuid, uuid) from public, anon;
revoke all on function public.record_directory_export() from public, anon;
revoke all on function public.record_directory_import(integer, integer) from public, anon;
revoke all on function public.bootstrap_first_super_admin(text, text, text, text) from public, anon, authenticated;

grant execute on function public.current_person_id() to authenticated;
grant execute on function public.current_household_id() to authenticated;
grant execute on function public.has_role(text) to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.link_my_account() to authenticated;
grant execute on function public.current_profile() to authenticated;
grant execute on function public.directory_households(text) to authenticated;
grant execute on function public.set_person_roles(uuid, text[]) to authenticated;
grant execute on function public.archive_household(uuid) to authenticated;
grant execute on function public.restore_household(uuid) to authenticated;
grant execute on function public.archive_person(uuid) to authenticated;
grant execute on function public.restore_person(uuid) to authenticated;
grant execute on function public.merge_households(uuid, uuid) to authenticated;
grant execute on function public.record_directory_export() to authenticated;
grant execute on function public.record_directory_import(integer, integer) to authenticated;

-- The invite Edge Function uses the service role to record invites and audit rows.
grant select, insert, update, delete on
  public.roles,
  public.households,
  public.household_admin_notes,
  public.people,
  public.contact_preferences,
  public.person_roles,
  public.invites,
  public.audit_log
to service_role;
