-- CS-MADA: remap the four existing Supabase Auth users to the current agents.
-- Run this in the Supabase SQL Editor. Existing auth UUIDs are preserved so
-- existing demande assignments and timeline authors remain linked.
-- Default mapping for the three legacy aliases is a proposal; edit the rows
-- below if diary/elicia/liliane belong to different people.

begin;

create temp table cs_mada_agent_identity_map (
  old_email text primary key,
  agent_name text not null,
  new_email text not null unique,
  agent_role text not null,
  primary_channel text
) on commit drop;

insert into cs_mada_agent_identity_map (old_email, agent_name, new_email, agent_role, primary_channel) values
  ('rojo@suivi.com',    'Rojo',   'rojo@suivi.com',   'CS WhatsApp',      'WhatsApp'),
  ('diary@suivi.com',   'Fania',  'fania@suivi.com',  'CS & Opérations',  null),
  ('elicia@suivi.com',  'Ando',   'ando@suivi.com',   'Opérations',       null),
  ('liliane@suivi.com', 'Jerry',  'jerry@suivi.com',  'Opérations',       null);

do $$
declare
  found_users integer;
  conflicting_email text;
begin
  select count(*) into found_users
  from cs_mada_agent_identity_map m
  join auth.users u on lower(u.email) = m.old_email;

  if found_users <> 4 then
    raise exception 'Expected exactly 4 source accounts (rojo, diary, elicia, liliane) at @suivi.com; found %.', found_users;
  end if;

  select m.new_email into conflicting_email
  from cs_mada_agent_identity_map m
  join auth.users target_user on lower(target_user.email) = m.new_email
  left join auth.users source_user on lower(source_user.email) = m.old_email
  where source_user.id is distinct from target_user.id
  limit 1;

  if conflicting_email is not null then
    raise exception 'Target email % already belongs to a different Auth account. Resolve that account before running this script.', conflicting_email;
  end if;
end $$;

-- Change each Auth login and reset the shared test password to 1234.
update auth.users u
set email = m.new_email,
    encrypted_password = crypt('1234', gen_salt('bf')),
    email_confirmed_at = coalesce(u.email_confirmed_at, now()),
    raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('name', m.agent_name, 'full_name', m.agent_name),
    updated_at = now()
from cs_mada_agent_identity_map m
where lower(u.email) = m.old_email;

-- Keep the email identity metadata in sync with auth.users.
update auth.identities i
set identity_data = coalesce(i.identity_data, '{}'::jsonb)
      || jsonb_build_object('email', m.new_email, 'name', m.agent_name)
from auth.users u
join cs_mada_agent_identity_map m on lower(u.email) = m.new_email
where i.user_id = u.id and i.provider = 'email';

-- Reuse an existing same-name agent row when it is not linked yet. This avoids
-- creating a second Ando/Fania/etc. if the roster already has those agents.
with candidates as (
  select a.id, u.id as user_id,
    row_number() over (partition by lower(trim(a.name)) order by a.created_at, a.id) as position
  from public.agents a
  join cs_mada_agent_identity_map m on lower(trim(a.name)) = lower(m.agent_name)
  join auth.users u on lower(u.email) = m.new_email
  where a.user_id is null
    and not exists (select 1 from public.agents linked where linked.user_id = u.id)
)
update public.agents a set user_id = candidates.user_id
from candidates where candidates.id = a.id and candidates.position = 1;

-- Rename already-linked agent rows first. This preserves request ownership,
-- responsibility, and event-author references through the existing agent IDs.
update public.agents a
set name = m.agent_name,
    role = m.agent_role,
    primary_channel = m.primary_channel,
    active = true,
    updated_at = now()
from auth.users u
join cs_mada_agent_identity_map m on lower(u.email) = m.new_email
where a.user_id = u.id;

-- If an Auth account had no linked agent row, create one and link it.
insert into public.agents (user_id, name, role, primary_channel, active)
select u.id, m.agent_name, m.agent_role, m.primary_channel, true
from auth.users u
join cs_mada_agent_identity_map m on lower(u.email) = m.new_email
where not exists (select 1 from public.agents a where a.user_id = u.id)
on conflict (user_id) do update set
  name = excluded.name,
  role = excluded.role,
  primary_channel = excluded.primary_channel,
  active = true,
  updated_at = now();

-- Retire only unused placeholder agents seeded by the original schema.
update public.agents a
set active = false, updated_at = now()
where a.name in ('Agent 1', 'Agent 2', 'Agent 3', 'Agent 4')
  and a.user_id is null
  and not exists (
    select 1 from public.demandes d
    where d.status <> 'Resolved' and (d.owner_id = a.id or d.responsible_id = a.id)
  );

-- Show the final accounts and agent links in the SQL Editor results.
select a.name, a.role, a.primary_channel, u.email, a.user_id
from public.agents a
join auth.users u on u.id = a.user_id
where lower(u.email) in ('rojo@suivi.com', 'fania@suivi.com', 'ando@suivi.com', 'jerry@suivi.com')
order by case a.name when 'Rojo' then 1 when 'Fania' then 2 when 'Ando' then 3 when 'Jerry' then 4 else 5 end;

commit;
