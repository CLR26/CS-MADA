-- Additive first step toward the customer query lifecycle domain.
-- Keeps demandes/demande_events intact so the current client and rollback remain usable.
-- Review production schema/data/auth mappings before applying outside a disposable project.

create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('CS-MADA', 'MADA-OPS')),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.teams (key, name) values
  ('CS-MADA', 'CS-MADA'), ('MADA-OPS', 'Madagascar Operations')
on conflict (key) do nothing;

create table if not exists public.team_memberships (
  team_id uuid not null references public.teams(id) on delete restrict,
  agent_id uuid not null references public.agents(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (team_id, agent_id)
);

-- Existing agents are internal. Preserve all as CS-MADA members; role text may additionally
-- identify operational members, but must be reviewed before authorizing production access.
insert into public.team_memberships (team_id, agent_id)
select t.id, a.id from public.teams t cross join public.agents a
where t.key = 'CS-MADA'
on conflict do nothing;
insert into public.team_memberships (team_id, agent_id)
select t.id, a.id from public.teams t cross join public.agents a
where t.key = 'MADA-OPS' and lower(coalesce(a.role, '')) like '%opération%'
   or t.key = 'MADA-OPS' and lower(coalesce(a.role, '')) like '%operation%'
   or t.key = 'MADA-OPS' and lower(coalesce(a.role, '')) like '%ops%'
   or t.key = 'MADA-OPS' and lower(a.name) in ('fania','jerry','ando')
on conflict do nothing;

create table if not exists public.case_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0
);
insert into public.case_categories (key, name, sort_order) values
 ('delivery', 'Delivery', 10), ('payment_link', 'Payment link', 20),
 ('parcel_update', 'Parcel update/status', 30), ('urgent_request', 'Urgent requests', 40)
on conflict (key) do nothing;

create table if not exists public.carriers (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0
);
insert into public.carriers (key, name, sort_order) values
 ('aramex', 'Aramex', 10), ('speedaf', 'Speedaf', 20),
 ('other', 'Other', 30), ('unknown', 'Unknown', 40)
on conflict (key) do nothing;

create table if not exists public.routing_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  priority integer not null default 100,
  channel text check (channel is null or channel in ('WhatsApp', 'E-mail')),
  carrier_id uuid references public.carriers(id) on delete restrict,
  escalation_tier smallint check (escalation_tier is null or escalation_tier in (1, 2)),
  destination_team_id uuid references public.teams(id) on delete restrict,
  external_destination text check (external_destination is null or external_destination = 'SEZ-OPS'),
  assignee_agent_id uuid references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (destination_team_id is not null and external_destination is not null))
);

-- Preserve all current rows under their existing IDs while introducing separate ownership fields.
alter table public.demandes add column if not exists case_reference text;
alter table public.demandes add column if not exists category_id uuid references public.case_categories(id) on delete restrict;
alter table public.demandes add column if not exists carrier_id uuid references public.carriers(id) on delete restrict;
alter table public.demandes add column if not exists priority text not null default 'normal'
  check (priority in ('low', 'normal', 'high', 'urgent'));
alter table public.demandes add column if not exists case_owner_id uuid references public.agents(id) on delete set null;
alter table public.demandes add column if not exists current_team_id uuid references public.teams(id) on delete restrict;
alter table public.demandes add column if not exists current_assignee_id uuid references public.agents(id) on delete set null;
alter table public.demandes add column if not exists current_status text
  check (current_status is null or current_status in ('New', 'In progress', 'Waiting on Customer', 'Waiting on Operations', 'Waiting on External Operations', 'Resolved', 'Closed'));
alter table public.demandes add column if not exists current_escalation_tier smallint not null default 0
  check (current_escalation_tier in (0, 1, 2));
alter table public.demandes add column if not exists next_customer_update_at timestamptz;
alter table public.demandes add column if not exists last_customer_update_at timestamptz;
alter table public.demandes add column if not exists tier1_response_due_at timestamptz;
alter table public.demandes add column if not exists tier2_followup_due_at timestamptz;
alter table public.demandes add column if not exists resolution_due_at timestamptz;
alter table public.demandes add column if not exists closed_at timestamptz;

update public.demandes d set
  case_reference = coalesce(d.case_reference, 'CS-' || upper(substr(replace(d.id::text, '-', ''), 1, 12))),
  case_owner_id = coalesce(d.case_owner_id, d.owner_id),
  current_assignee_id = coalesce(d.current_assignee_id, d.responsible_id),
  current_team_id = coalesce(d.current_team_id, t.id),
  current_status = coalesce(d.current_status, case
    when d.status = 'Resolved' then 'Resolved'
    when d.status = 'Waiting' then 'Waiting on Customer'
    when d.current_stage = 'Opérations' then 'Waiting on Operations'
    when d.status = 'Escalated' then 'Waiting on Operations'
    when d.status = 'Open' then 'New'
    else 'In progress' end),
  next_customer_update_at = coalesce(d.next_customer_update_at, d.customer_feedback_due_at)
from public.teams t
where t.key = case when d.current_stage = 'Opérations' then 'MADA-OPS' else 'CS-MADA' end
  and (d.case_reference is null or d.case_owner_id is null or d.current_assignee_id is null
    or d.current_team_id is null or d.current_status is null
    or (d.customer_feedback_due_at is not null and d.next_customer_update_at is null));

alter table public.demandes alter column current_status set default 'New';
update public.demandes set current_status = 'New' where current_status is null;
alter table public.demandes alter column current_status set not null;
create unique index if not exists idx_demandes_case_reference on public.demandes(case_reference);
create index if not exists idx_demandes_lifecycle_queue on public.demandes(current_team_id, current_status, current_assignee_id);
create index if not exists idx_demandes_customer_update_due on public.demandes(next_customer_update_at) where current_status not in ('Resolved', 'Closed');
create index if not exists idx_demandes_category_carrier on public.demandes(category_id, carrier_id);

-- Keep the legacy client usable during the additive rollout while establishing the new
-- ownership fields and stable reference for newly-created cases.
create or replace function public.sync_lifecycle_case_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.case_reference := coalesce(new.case_reference, 'CS-' || upper(substr(replace(new.id::text, '-', ''), 1, 12)));
    new.case_owner_id := coalesce(new.case_owner_id, new.owner_id);
    new.owner_id := coalesce(new.owner_id, new.case_owner_id);
    new.current_assignee_id := coalesce(new.current_assignee_id, new.responsible_id);
    new.responsible_id := coalesce(new.responsible_id, new.current_assignee_id);
    if new.current_team_id is null then
      select id into new.current_team_id from public.teams where key = 'CS-MADA';
    end if;
    new.current_status := coalesce(new.current_status, case
      when new.status = 'Resolved' then 'Resolved'
      when new.status = 'Waiting' then 'Waiting on Customer'
      when new.status = 'Escalated' or new.current_stage = 'Opérations' then 'Waiting on Operations'
      when new.status = 'Open' then 'New'
      else 'In progress' end);
    new.next_customer_update_at := coalesce(new.next_customer_update_at, new.customer_feedback_due_at);
    return new;
  end if;
  if new.owner_id is distinct from old.owner_id then new.case_owner_id := new.owner_id;
  elsif new.case_owner_id is distinct from old.case_owner_id then new.owner_id := new.case_owner_id; end if;
  if new.responsible_id is distinct from old.responsible_id then new.current_assignee_id := new.responsible_id;
  elsif new.current_assignee_id is distinct from old.current_assignee_id then new.responsible_id := new.current_assignee_id; end if;
  if new.current_stage is distinct from old.current_stage then
    select id into new.current_team_id from public.teams where key = case when new.current_stage = 'Opérations' then 'MADA-OPS' else 'CS-MADA' end;
  end if;
  if new.status is distinct from old.status and new.current_status is not distinct from old.current_status then
    new.current_status := case when new.status = 'Resolved' then 'Resolved'
      when new.status = 'Waiting' then 'Waiting on Customer'
      when new.status = 'Escalated' then 'Waiting on Operations'
      when new.status = 'Open' then 'New' else 'In progress' end;
  elsif new.current_status is distinct from old.current_status and new.status is not distinct from old.status then
    new.status := case when new.current_status='New' then 'Open' when new.current_status='Waiting on Customer' then 'Waiting'
      when new.current_status in ('Waiting on Operations','Waiting on External Operations') then 'Escalated'
      when new.current_status in ('Resolved','Closed') then 'Resolved' else 'In progress' end;
  end if;
  if new.customer_feedback_due_at is distinct from old.customer_feedback_due_at then
    new.next_customer_update_at := new.customer_feedback_due_at;
  elsif new.next_customer_update_at is distinct from old.next_customer_update_at then
    new.customer_feedback_due_at := new.next_customer_update_at;
  end if;
  return new;
end $$;
drop trigger if exists demandes_sync_lifecycle_fields on public.demandes;
create trigger demandes_sync_lifecycle_fields before insert or update on public.demandes
for each row execute function public.sync_lifecycle_case_fields();

create table if not exists public.case_escalations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.demandes(id) on delete restrict,
  tier smallint not null check (tier in (1, 2)),
  escalation_type text not null check (escalation_type in ('internal', 'external')),
  source_team_id uuid not null references public.teams(id) on delete restrict,
  destination_team_id uuid references public.teams(id) on delete restrict,
  external_destination text check (external_destination is null or external_destination = 'SEZ-OPS'),
  destination_assignee_id uuid references public.agents(id) on delete set null,
  internal_followup_owner_id uuid references public.agents(id) on delete set null,
  reason text not null,
  issue_summary text,
  handoff_note text,
  requested_action text not null,
  information_sent text,
  external_reference text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'Open',
  opened_at timestamptz not null default now(),
  sent_at timestamptz,
  acknowledged_at timestamptz,
  response_at timestamptz,
  resolved_at timestamptz,
  due_at timestamptz,
  returned_to_cs_at timestamptz,
  created_by uuid references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((tier = 1 and escalation_type = 'internal' and destination_team_id is not null and external_destination is null)
      or (tier = 2 and escalation_type = 'external' and destination_team_id is null and external_destination = 'SEZ-OPS' and internal_followup_owner_id is not null))
);
create index if not exists idx_case_escalations_case_time on public.case_escalations(case_id, opened_at desc);
create index if not exists idx_case_escalations_open_due on public.case_escalations(status, due_at) where resolved_at is null;

create table if not exists public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.demandes(id) on delete restrict,
  escalation_id uuid references public.case_escalations(id) on delete restrict,
  actor_id uuid references public.agents(id) on delete set null,
  actor_name text not null,
  actor_team_key text,
  event_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_case_events_case_time on public.case_events(case_id, occurred_at);

create table if not exists public.customer_updates (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.demandes(id) on delete restrict,
  channel text not null check (channel in ('WhatsApp', 'E-mail')),
  author_id uuid references public.agents(id) on delete set null,
  content text not null,
  sent_at timestamptz not null default now(),
  next_update_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_customer_updates_case_time on public.customer_updates(case_id, sent_at desc);

create table if not exists public.external_escalation_responses (
  id uuid primary key default gen_random_uuid(),
  escalation_id uuid not null references public.case_escalations(id) on delete restrict,
  received_at timestamptz not null,
  recorded_by uuid references public.agents(id) on delete set null,
  response_content text not null,
  operational_instructions text,
  external_references jsonb not null default '[]'::jsonb,
  next_action text,
  created_at timestamptz not null default now()
);

-- Structured events are append-only for authenticated application roles.
alter table public.case_escalations enable row level security;
alter table public.case_events enable row level security;
alter table public.customer_updates enable row level security;
alter table public.external_escalation_responses enable row level security;
alter table public.routing_rules enable row level security;
alter table public.team_memberships enable row level security;
alter table public.teams enable row level security;
alter table public.case_categories enable row level security;
alter table public.carriers enable row level security;

drop policy if exists lifecycle_teams_read on public.teams;
create policy lifecycle_teams_read on public.teams for select to authenticated using (
  exists (select 1 from public.agents a where a.user_id = auth.uid() and a.active)
);
drop policy if exists lifecycle_memberships_read on public.team_memberships;
create policy lifecycle_memberships_read on public.team_memberships for select to authenticated using (
  exists (select 1 from public.agents a where a.user_id = auth.uid() and a.active)
);
drop policy if exists lifecycle_categories_read on public.case_categories;
create policy lifecycle_categories_read on public.case_categories for select to authenticated using (true);
drop policy if exists lifecycle_carriers_read on public.carriers;
create policy lifecycle_carriers_read on public.carriers for select to authenticated using (true);
drop policy if exists lifecycle_routing_rules_read on public.routing_rules;
create policy lifecycle_routing_rules_read on public.routing_rules for select to authenticated using (
  exists (select 1 from public.agents a where a.user_id = auth.uid() and a.active)
);

-- New domain records are readable only to authenticated, active internal agents.
-- Writes will be exposed through validated workflow RPCs in the application cutover migration.
drop policy if exists case_escalations_internal_read on public.case_escalations;
create policy case_escalations_internal_read on public.case_escalations for select to authenticated using (
  exists (select 1 from public.agents a where a.user_id = auth.uid() and a.active)
);
drop policy if exists case_events_internal_read on public.case_events;
create policy case_events_internal_read on public.case_events for select to authenticated using (
  exists (select 1 from public.agents a where a.user_id = auth.uid() and a.active)
);
drop policy if exists customer_updates_internal_read on public.customer_updates;
create policy customer_updates_internal_read on public.customer_updates for select to authenticated using (
  exists (select 1 from public.agents a where a.user_id = auth.uid() and a.active)
);
drop policy if exists external_responses_internal_read on public.external_escalation_responses;
create policy external_responses_internal_read on public.external_escalation_responses for select to authenticated using (
  exists (select 1 from public.agents a where a.user_id = auth.uid() and a.active)
);

-- Realtime is added idempotently when Supabase Realtime is installed.
do $$ begin alter publication supabase_realtime add table public.case_escalations;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.case_events;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.customer_updates;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.external_escalation_responses;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- Atomic workflow operations. The browser may read domain records, but transitions go through
-- these functions so case state, escalation instances, typed responses and audit events commit together.
create or replace function public.lifecycle_actor_id()
returns uuid language plpgsql stable security definer set search_path = public, auth as $$
declare result uuid;
begin
  select id into result from public.agents where user_id = auth.uid() and active;
  if result is null then raise exception 'Active internal agent required' using errcode = '42501'; end if;
  return result;
end $$;

create or replace function public.lifecycle_require_team(p_agent uuid, p_team_key text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare result uuid;
begin
  select t.id into result from public.teams t join public.team_memberships m on m.team_id = t.id
  where t.key = p_team_key and t.active and m.active and m.agent_id = p_agent;
  if result is null then raise exception 'Required internal team membership missing' using errcode = '42501'; end if;
  return result;
end $$;

create or replace function public.lifecycle_add_event(
  p_case_id uuid, p_escalation_id uuid, p_actor uuid, p_event_type text, p_message text, p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare event_id uuid; actor_name text; actor_team text;
begin
  select name into actor_name from public.agents where id = p_actor;
  select t.key into actor_team from public.team_memberships m join public.teams t on t.id=m.team_id
    where m.agent_id=p_actor and m.active and t.active order by t.key limit 1;
  insert into public.case_events(case_id, escalation_id, actor_id, actor_name, actor_team_key, event_type, message, metadata)
  values (p_case_id, p_escalation_id, p_actor, coalesce(actor_name, 'Internal system'), actor_team, p_event_type, p_message, coalesce(p_metadata, '{}'::jsonb))
  returning id into event_id;
  return event_id;
end $$;

create or replace function public.lifecycle_escalate_tier1(
  p_case_id uuid, p_reason text, p_requested_action text, p_handoff_note text, p_assignee_id uuid, p_due_at timestamptz
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare actor uuid; cs_team uuid; ops_team uuid; carrier uuid; assigned uuid; escalation_id uuid; label text;
begin
  actor := public.lifecycle_actor_id();
  cs_team := public.lifecycle_require_team(actor, 'CS-MADA');
  ops_team := public.lifecycle_require_team(coalesce(p_assignee_id, actor), 'MADA-OPS');
  select tracking_number into label from public.demandes where id=p_case_id for update;
  if not found then raise exception 'Case not found' using errcode='P0002'; end if;
  if nullif(trim(p_reason), '') is null or nullif(trim(p_requested_action), '') is null then raise exception 'Reason and requested action are required'; end if;
  if p_due_at is null then raise exception 'Tier 1 response deadline is required'; end if;
  if exists(select 1 from public.case_escalations where case_id=p_case_id and resolved_at is null and returned_to_cs_at is null) then raise exception 'An active escalation already exists'; end if;
  select carrier_id into carrier from public.demandes where id=p_case_id;
  insert into public.case_escalations(case_id,tier,escalation_type,source_team_id,destination_team_id,destination_assignee_id,
    reason,issue_summary,handoff_note,requested_action,priority,due_at,created_by)
  select p_case_id,1,'internal',cs_team,ops_team,p_assignee_id,p_reason,d.query,p_handoff_note,p_requested_action,d.priority,p_due_at,actor
    from public.demandes d where d.id=p_case_id returning id into escalation_id;
  update public.demandes set current_team_id=ops_team,current_assignee_id=p_assignee_id,responsible_id=p_assignee_id,
    current_status='Waiting on Operations',status='Escalated',current_escalation_tier=1,current_stage='Opérations',tier1_response_due_at=p_due_at
    where id=p_case_id;
  perform public.lifecycle_add_event(p_case_id,escalation_id,actor,'tier1_escalated',
    'Case escalated to MADA-OPS — Tier 1.',jsonb_build_object('reason',p_reason,'requested_action',p_requested_action,'assignee_id',p_assignee_id,'due_at',p_due_at,'carrier_id',carrier));
  if p_assignee_id is not null then
    insert into public.notifications(recipient_id,request_id,type,priority,title,body,deduplication_key)
    values(p_assignee_id,p_case_id,'ASSIGNED_TO_ME','normal','New Tier 1 escalation','A case was assigned to you in MADA-OPS.', 'T1:'||escalation_id::text||':'||p_assignee_id::text)
    on conflict(recipient_id,deduplication_key) do nothing;
  end if;
  return escalation_id;
end $$;

create or replace function public.lifecycle_return_to_cs(p_case_id uuid, p_response text, p_next_customer_update_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare actor uuid; cs_team uuid; escalation_id uuid; owner_id uuid;
begin
  actor:=public.lifecycle_actor_id(); perform public.lifecycle_require_team(actor,'MADA-OPS');
  select id into cs_team from public.teams where key='CS-MADA';
  select case_owner_id into owner_id from public.demandes where id=p_case_id for update;
  if not found then raise exception 'Case not found' using errcode='P0002'; end if;
  select id into escalation_id from public.case_escalations where case_id=p_case_id and tier=1 and resolved_at is null order by opened_at desc limit 1 for update;
  if escalation_id is null then raise exception 'No open Tier 1 escalation' using errcode='P0002'; end if;
  update public.case_escalations set response_at=now(),resolved_at=now(),returned_to_cs_at=now(),status='Returned to CS-MADA',updated_at=now() where id=escalation_id;
  update public.demandes set current_team_id=cs_team,current_assignee_id=owner_id,responsible_id=owner_id,current_status='In progress',
    status='In progress',current_escalation_tier=0,current_stage=case when initial_channel='E-mail' then 'CS E-mail' else 'CS WhatsApp' end,
    tier1_response_due_at=null,next_customer_update_at=coalesce(p_next_customer_update_at,next_customer_update_at),
    customer_feedback_due_at=coalesce(p_next_customer_update_at,customer_feedback_due_at) where id=p_case_id;
  perform public.lifecycle_add_event(p_case_id,escalation_id,actor,'tier1_response',coalesce(nullif(trim(p_response),''),'Operations response received.'),'{}'::jsonb);
  perform public.lifecycle_add_event(p_case_id,escalation_id,actor,'returned_to_cs','Case returned to CS-MADA for customer follow-up.',jsonb_build_object('case_owner_id',owner_id));
  if owner_id is not null and owner_id<>actor then
    insert into public.notifications(recipient_id,request_id,type,priority,title,body,deduplication_key)
    values(owner_id,p_case_id,'NEW_OPERATION_REPLY','normal','MADA-OPS response received','The case was returned to CS-MADA.','T1-RETURN:'||escalation_id::text)
    on conflict(recipient_id,deduplication_key) do nothing;
  end if;
  return escalation_id;
end $$;

create or replace function public.lifecycle_escalate_tier2(
  p_case_id uuid,p_reason text,p_requested_action text,p_information_sent text,p_followup_owner_id uuid,p_due_at timestamptz,p_external_reference text default null
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare actor uuid; ops_team uuid; escalation_id uuid; owner_name text;
begin
  actor:=public.lifecycle_actor_id(); ops_team:=public.lifecycle_require_team(actor,'MADA-OPS');
  perform public.lifecycle_require_team(p_followup_owner_id,'MADA-OPS');
  perform 1 from public.demandes where id=p_case_id for update;
  if not found then raise exception 'Case not found' using errcode='P0002'; end if;
  if nullif(trim(p_reason),'') is null or nullif(trim(p_requested_action),'') is null then raise exception 'Reason and requested action are required'; end if;
  if p_due_at is null then raise exception 'Next SEZ-OPS follow-up deadline is required'; end if;
  if exists(select 1 from public.case_escalations where case_id=p_case_id and resolved_at is null and returned_to_cs_at is null) then raise exception 'An active escalation already exists'; end if;
  select name into owner_name from public.agents where id=p_followup_owner_id;
  insert into public.case_escalations(case_id,tier,escalation_type,source_team_id,external_destination,internal_followup_owner_id,
    reason,issue_summary,requested_action,information_sent,external_reference,priority,status,sent_at,due_at,created_by)
  select p_case_id,2,'external',ops_team,'SEZ-OPS',p_followup_owner_id,p_reason,d.query,p_requested_action,p_information_sent,p_external_reference,d.priority,'Awaiting SEZ-OPS',now(),p_due_at,actor
  from public.demandes d where d.id=p_case_id returning id into escalation_id;
  update public.demandes set current_team_id=ops_team,current_assignee_id=p_followup_owner_id,responsible_id=p_followup_owner_id,
    current_status='Waiting on External Operations',status='Waiting',current_escalation_tier=2,tier2_followup_due_at=p_due_at,next_action='Follow up with SEZ-OPS'
    where id=p_case_id;
  perform public.lifecycle_add_event(p_case_id,escalation_id,actor,'tier2_external_sent','External handoff sent to SEZ-OPS. Internal follow-up owner: '||coalesce(owner_name,'assigned agent')||'.',
    jsonb_build_object('destination','SEZ-OPS','followup_owner_id',p_followup_owner_id,'due_at',p_due_at,'external_reference',p_external_reference));
  insert into public.notifications(recipient_id,request_id,type,priority,title,body,deduplication_key)
  values(p_followup_owner_id,p_case_id,'ACTION_REQUIRED','high','SEZ-OPS follow-up required','Follow up on the external handoff by '||coalesce(p_due_at::text,'the scheduled deadline'), 'T2:'||escalation_id::text)
  on conflict(recipient_id,deduplication_key) do nothing;
  return escalation_id;
end $$;

create or replace function public.lifecycle_record_sez_response(
  p_escalation_id uuid,p_received_at timestamptz,p_response text,p_instructions text,p_references jsonb,p_next_action text
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare actor uuid; case_key uuid; followup_owner uuid; response_id uuid;
begin
  actor:=public.lifecycle_actor_id();
  select case_id,internal_followup_owner_id into case_key,followup_owner from public.case_escalations where id=p_escalation_id and tier=2 and escalation_type='external' for update;
  if case_key is null then raise exception 'External escalation not found' using errcode='P0002'; end if;
  if actor<>followup_owner then perform public.lifecycle_require_team(actor,'MADA-OPS'); end if;
  if nullif(trim(p_response),'') is null then raise exception 'Response content is required'; end if;
  insert into public.external_escalation_responses(escalation_id,received_at,recorded_by,response_content,operational_instructions,external_references,next_action)
  values(p_escalation_id,coalesce(p_received_at,now()),actor,p_response,p_instructions,coalesce(p_references,'[]'::jsonb),p_next_action) returning id into response_id;
  update public.case_escalations set response_at=coalesce(p_received_at,now()),status='Response received',updated_at=now() where id=p_escalation_id;
  update public.demandes set current_status='In progress',status='In progress',next_action=coalesce(p_next_action,'Review SEZ-OPS response') where id=case_key;
  perform public.lifecycle_add_event(case_key,p_escalation_id,actor,'external_response_received','SEZ-OPS response recorded by an internal user.',jsonb_build_object('response_id',response_id,'received_at',coalesce(p_received_at,now())));
  select case_owner_id into followup_owner from public.demandes where id=case_key;
  if followup_owner is not null and followup_owner<>actor then
    insert into public.notifications(recipient_id,request_id,type,priority,title,body,deduplication_key)
    values(followup_owner,case_key,'NEW_OPERATION_REPLY','normal','SEZ-OPS response recorded','An internal user recorded an external response.','T2-RESPONSE:'||response_id::text)
    on conflict(recipient_id,deduplication_key) do nothing;
  end if;
  return response_id;
end $$;

create or replace function public.lifecycle_customer_update(
  p_case_id uuid,p_channel text,p_content text,p_next_update_at timestamptz
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare actor uuid; owner_id uuid; update_id uuid;
begin
  actor:=public.lifecycle_actor_id(); perform public.lifecycle_require_team(actor,'CS-MADA');
  select case_owner_id into owner_id from public.demandes where id=p_case_id for update;
  if not found then raise exception 'Case not found' using errcode='P0002'; end if;
  if actor<>owner_id then perform public.lifecycle_require_team(actor,'CS-MADA'); end if;
  if p_channel not in ('WhatsApp','E-mail') or nullif(trim(p_content),'') is null then raise exception 'Valid channel and customer message are required'; end if;
  if p_next_update_at is null then raise exception 'Next customer update deadline is required'; end if;
  insert into public.customer_updates(case_id,channel,author_id,content,next_update_at) values(p_case_id,p_channel,actor,p_content,p_next_update_at) returning id into update_id;
  update public.demandes set last_customer_update_at=now(),next_customer_update_at=p_next_update_at,customer_feedback_due_at=p_next_update_at where id=p_case_id;
  perform public.lifecycle_add_event(p_case_id,null,actor,'customer_update_sent','Customer update logged via '||p_channel||'.',jsonb_build_object('customer_update_id',update_id,'next_update_at',p_next_update_at));
  return update_id;
end $$;

create or replace function public.lifecycle_set_status(p_case_id uuid,p_status text,p_summary text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare actor uuid; owner_id uuid; previous_status text;
begin
  actor:=public.lifecycle_actor_id();
  if p_status not in ('Resolved','Closed','In progress','Waiting on Customer') then raise exception 'Unsupported lifecycle status'; end if;
  select case_owner_id,current_status into owner_id,previous_status from public.demandes where id=p_case_id for update;
  if not found then raise exception 'Case not found' using errcode='P0002'; end if;
  if actor<>owner_id and not exists(select 1 from public.team_memberships m join public.teams t on t.id=m.team_id where m.agent_id=actor and m.active and t.active and t.key in ('CS-MADA','MADA-OPS')) then
    raise exception 'Internal team membership required' using errcode='42501'; end if;
  if p_status in ('Resolved','Closed') and exists(select 1 from public.case_escalations where case_id=p_case_id and resolved_at is null and returned_to_cs_at is null) then
    if not exists(select 1 from public.team_memberships m join public.teams t on t.id=m.team_id where m.agent_id=actor and m.active and t.key='MADA-OPS') then
      raise exception 'Resolve or return the active escalation first';
    end if;
    update public.case_escalations set status='Resolved',resolved_at=now(),updated_at=now() where case_id=p_case_id and resolved_at is null and returned_to_cs_at is null;
  end if;
  update public.demandes set current_status=p_status,status=case when p_status='Resolved' then 'Resolved' when p_status='Closed' then 'Resolved' when p_status='Waiting on Customer' then 'Waiting' else 'In progress' end,
    resolved_at=case when p_status in ('Resolved','Closed') then coalesce(resolved_at,now()) when p_status in ('In progress','Waiting on Customer') then null else resolved_at end,
    closed_at=case when p_status='Closed' then now() when p_status='In progress' then null else closed_at end
    where id=p_case_id;
  perform public.lifecycle_add_event(p_case_id,null,actor,case when p_status='Resolved' then 'case_resolved' when p_status='Closed' then 'case_closed' when previous_status in ('Resolved','Closed') then 'case_reopened' else 'status_changed' end,
    'Case status changed to '||p_status||'.'||case when nullif(trim(p_summary),'') is not null then ' '||p_summary else '' end,jsonb_build_object('from',previous_status,'to',p_status));
end $$;

create or replace function public.lifecycle_complete_tier2(p_escalation_id uuid,p_result text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare actor uuid; case_key uuid; owner_id uuid; cs_team uuid;
begin
  actor:=public.lifecycle_actor_id(); perform public.lifecycle_require_team(actor,'MADA-OPS');
  select case_id into case_key from public.case_escalations where id=p_escalation_id and tier=2 and resolved_at is null for update;
  if case_key is null then raise exception 'Open Tier 2 escalation not found' using errcode='P0002'; end if;
  if nullif(trim(p_result),'') is null then raise exception 'Follow-up result is required'; end if;
  select case_owner_id into owner_id from public.demandes where id=case_key for update;
  select id into cs_team from public.teams where key='CS-MADA';
  update public.case_escalations set status='Returned to CS-MADA',resolved_at=now(),returned_to_cs_at=now(),updated_at=now() where id=p_escalation_id;
  update public.demandes set current_team_id=cs_team,current_assignee_id=owner_id,responsible_id=owner_id,current_status='In progress',status='In progress',
    current_escalation_tier=0,current_stage=case when initial_channel='E-mail' then 'CS E-mail' else 'CS WhatsApp' end,tier2_followup_due_at=null,next_action=null where id=case_key;
  perform public.lifecycle_add_event(case_key,p_escalation_id,actor,'tier2_returned_to_cs','Tier 2 follow-up completed; case returned to CS-MADA.',jsonb_build_object('result',p_result));
  return p_escalation_id;
end $$;

revoke all on function public.lifecycle_actor_id() from public;
revoke all on function public.lifecycle_require_team(uuid,text) from public;
revoke all on function public.lifecycle_add_event(uuid,uuid,uuid,text,text,jsonb) from public;
revoke all on function public.lifecycle_escalate_tier1(uuid,text,text,text,uuid,timestamptz) from public;
revoke all on function public.lifecycle_return_to_cs(uuid,text,timestamptz) from public;
revoke all on function public.lifecycle_escalate_tier2(uuid,text,text,text,uuid,timestamptz,text) from public;
revoke all on function public.lifecycle_record_sez_response(uuid,timestamptz,text,text,jsonb,text) from public;
revoke all on function public.lifecycle_customer_update(uuid,text,text,timestamptz) from public;
revoke all on function public.lifecycle_set_status(uuid,text,text) from public;
revoke all on function public.lifecycle_complete_tier2(uuid,text) from public;
grant execute on function public.lifecycle_escalate_tier1(uuid,text,text,text,uuid,timestamptz) to authenticated;
grant execute on function public.lifecycle_return_to_cs(uuid,text,timestamptz) to authenticated;
grant execute on function public.lifecycle_escalate_tier2(uuid,text,text,text,uuid,timestamptz,text) to authenticated;
grant execute on function public.lifecycle_record_sez_response(uuid,timestamptz,text,text,jsonb,text) to authenticated;
grant execute on function public.lifecycle_customer_update(uuid,text,text,timestamptz) to authenticated;
grant execute on function public.lifecycle_set_status(uuid,text,text) to authenticated;
grant execute on function public.lifecycle_complete_tier2(uuid,text) to authenticated;
