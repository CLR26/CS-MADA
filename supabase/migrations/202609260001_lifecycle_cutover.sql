-- Complete the lifecycle cutover after 202609250001_lifecycle_domain.sql.
-- Existing cases and events remain in place; writes move to audited RPCs.

create table if not exists public.routing_rule_assignees (
  routing_rule_id uuid not null references public.routing_rules(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete restrict,
  sort_order integer not null default 0,
  primary key (routing_rule_id, agent_id)
);
alter table public.routing_rule_assignees enable row level security;

alter table public.agents add column if not exists is_admin boolean not null default false;

create or replace function public.lifecycle_is_internal()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists(select 1 from public.agents a where a.user_id=auth.uid() and a.active)
$$;
create or replace function public.lifecycle_is_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists(select 1 from public.agents a where a.user_id=auth.uid() and a.active and a.is_admin)
$$;

-- Seed rules by channel and carrier. The assignee roster is data and can be edited by admins.
do $$
declare cs uuid; ops uuid; whatsapp_id uuid; email_id uuid; aramex_id uuid; speedaf_id uuid; other_id uuid;
begin
  select id into cs from public.teams where key='CS-MADA';
  select id into ops from public.teams where key='MADA-OPS';
  select id into whatsapp_id from public.routing_rules where name='CS intake · WhatsApp';
  if whatsapp_id is null then
    insert into public.routing_rules(name,channel,destination_team_id,priority)
    values('CS intake · WhatsApp','WhatsApp',cs,10) returning id into whatsapp_id;
  end if;
  select id into email_id from public.routing_rules where name='CS intake · Email';
  if email_id is null then
    insert into public.routing_rules(name,channel,destination_team_id,priority)
    values('CS intake · Email','E-mail',cs,10) returning id into email_id;
  end if;
  select id into aramex_id from public.routing_rules where name='Tier 1 · Aramex';
  if aramex_id is null then
    insert into public.routing_rules(name,carrier_id,escalation_tier,destination_team_id,priority)
    select 'Tier 1 · Aramex',id,1,ops,10 from public.carriers where key='aramex' returning id into aramex_id;
  end if;
  select id into speedaf_id from public.routing_rules where name='Tier 1 · Speedaf';
  if speedaf_id is null then
    insert into public.routing_rules(name,carrier_id,escalation_tier,destination_team_id,priority)
    select 'Tier 1 · Speedaf',id,1,ops,10 from public.carriers where key='speedaf' returning id into speedaf_id;
  end if;
  select id into other_id from public.routing_rules where name='Tier 1 · Other carriers';
  if other_id is null then
    insert into public.routing_rules(name,escalation_tier,destination_team_id,priority)
    values('Tier 1 · Other carriers',1,ops,100) returning id into other_id;
  end if;
  -- Channel owners match the configured primary_channel, with known-name fallback.
  insert into public.routing_rule_assignees(routing_rule_id,agent_id,sort_order)
  select whatsapp_id,a.id,0 from public.agents a where a.active and (lower(a.name)='rojo' or a.primary_channel='WhatsApp')
  order by case when lower(a.name)='rojo' then 0 else 1 end,a.name limit 1
  on conflict do nothing;
  insert into public.routing_rule_assignees(routing_rule_id,agent_id,sort_order)
  select email_id,a.id,0 from public.agents a where a.active and (lower(a.name)='fania' or a.primary_channel='E-mail')
  order by case when lower(a.name)='fania' then 0 else 1 end,a.name limit 1
  on conflict do nothing;
  -- Carrier pools are preconfigured from roster names; administrators can change membership.
  insert into public.routing_rule_assignees(routing_rule_id,agent_id,sort_order)
  select aramex_id,a.id,row_number() over(order by case when lower(a.name)='jerry' then 0 else 1 end,a.name)::integer
  from public.agents a join public.team_memberships m on m.agent_id=a.id and m.active
  join public.teams t on t.id=m.team_id and t.key='MADA-OPS'
  where a.active and lower(a.name) in ('jerry','ando') on conflict do nothing;
  insert into public.routing_rule_assignees(routing_rule_id,agent_id,sort_order)
  select speedaf_id,a.id,0 from public.agents a join public.team_memberships m on m.agent_id=a.id and m.active
  join public.teams t on t.id=m.team_id and t.key='MADA-OPS'
  where a.active and lower(a.name)='fania' on conflict do nothing;
  -- Keep each configured route actionable when a deployment uses a different roster.
  if not exists(select 1 from public.routing_rule_assignees where routing_rule_id=aramex_id) then
    insert into public.routing_rule_assignees(routing_rule_id,agent_id,sort_order)
    select aramex_id,a.id,0 from public.agents a join public.team_memberships m on m.agent_id=a.id and m.active
    join public.teams t on t.id=m.team_id and t.key='MADA-OPS' where a.active order by a.name limit 1 on conflict do nothing;
  end if;
  if not exists(select 1 from public.routing_rule_assignees where routing_rule_id=speedaf_id) then
    insert into public.routing_rule_assignees(routing_rule_id,agent_id,sort_order)
    select speedaf_id,a.id,0 from public.agents a join public.team_memberships m on m.agent_id=a.id and m.active
    join public.teams t on t.id=m.team_id and t.key='MADA-OPS' where a.active order by a.name limit 1 on conflict do nothing;
  end if;
  if not exists(select 1 from public.routing_rule_assignees where routing_rule_id=other_id) then
    insert into public.routing_rule_assignees(routing_rule_id,agent_id,sort_order)
    select other_id,a.id,0 from public.agents a join public.team_memberships m on m.agent_id=a.id and m.active
    join public.teams t on t.id=m.team_id and t.key='MADA-OPS' where a.active order by a.name limit 1 on conflict do nothing;
  end if;
end $$;

create or replace function public.lifecycle_pick_assignee(p_rule_id uuid, p_team_id uuid)
returns uuid language sql stable security definer set search_path=public as $$
  select ra.agent_id from public.routing_rule_assignees ra
  join public.agents a on a.id=ra.agent_id and a.active
  join public.team_memberships m on m.agent_id=a.id and m.active and m.team_id=p_team_id
  where ra.routing_rule_id=p_rule_id
  order by ra.sort_order,ra.agent_id limit 1
$$;

create or replace function public.lifecycle_suggest_tier1_assignee(p_case_id uuid)
returns uuid language plpgsql stable security definer set search_path=public as $$
declare carrier uuid; rule_id uuid; team_id uuid; suggestion uuid;
begin
  if not public.lifecycle_is_internal() then raise exception 'Active internal agent required' using errcode='42501'; end if;
  select d.carrier_id into carrier from public.demandes d where d.id=p_case_id;
  if not found then raise exception 'Case not found' using errcode='P0002'; end if;
  select r.id,r.destination_team_id into rule_id,team_id from public.routing_rules r
  where r.active and r.escalation_tier=1 and r.destination_team_id is not null
    and (r.carrier_id=carrier or r.carrier_id is null)
  order by (r.carrier_id is null),r.priority,r.id limit 1;
  if rule_id is null then return null; end if;
  suggestion:=public.lifecycle_pick_assignee(rule_id,team_id);
  return suggestion;
end $$;

create or replace function public.lifecycle_escalate_tier1(
  p_case_id uuid,p_reason text,p_requested_action text,p_handoff_note text,p_assignee_id uuid,p_due_at timestamptz
) returns uuid language plpgsql security definer set search_path=public,auth as $$
declare actor uuid; cs_team uuid; ops_team uuid; carrier uuid; escalation_id uuid; current_team uuid;
begin
  actor:=public.lifecycle_actor_id(); cs_team:=public.lifecycle_require_team(actor,'CS-MADA');
  ops_team:=public.lifecycle_require_team(p_assignee_id,'MADA-OPS');
  select current_team_id,carrier_id into current_team,carrier from public.demandes where id=p_case_id for update;
  if not found then raise exception 'Case not found' using errcode='P0002'; end if;
  if current_team<>cs_team then raise exception 'Tier 1 escalation must start from CS-MADA'; end if;
  if nullif(trim(p_reason),'') is null or nullif(trim(p_requested_action),'') is null then raise exception 'Reason and requested action are required'; end if;
  if p_due_at is null then raise exception 'Tier 1 response deadline is required'; end if;
  if exists(select 1 from public.case_escalations where case_id=p_case_id and resolved_at is null and returned_to_cs_at is null) then raise exception 'An active escalation already exists'; end if;
  insert into public.case_escalations(case_id,tier,escalation_type,source_team_id,destination_team_id,destination_assignee_id,
    reason,issue_summary,handoff_note,requested_action,priority,due_at,created_by)
  select p_case_id,1,'internal',cs_team,ops_team,p_assignee_id,p_reason,d.query,p_handoff_note,p_requested_action,d.priority,p_due_at,actor
  from public.demandes d where d.id=p_case_id returning id into escalation_id;
  update public.demandes set current_team_id=ops_team,current_assignee_id=p_assignee_id,responsible_id=p_assignee_id,
    current_status='Waiting on Operations',status='Escalated',current_escalation_tier=1,current_stage='Opérations',tier1_response_due_at=p_due_at where id=p_case_id;
  perform public.lifecycle_add_event(p_case_id,escalation_id,actor,'tier1_escalated','Case escalated to MADA-OPS — Tier 1.',
    jsonb_build_object('reason',p_reason,'requested_action',p_requested_action,'assignee_id',p_assignee_id,'due_at',p_due_at,'carrier_id',carrier));
  insert into public.notifications(recipient_id,request_id,type,priority,title,body,deduplication_key)
  values(p_assignee_id,p_case_id,'ASSIGNED_TO_ME','normal','New Tier 1 escalation','A case was assigned to you in MADA-OPS.','T1:'||escalation_id::text||':'||p_assignee_id::text)
  on conflict(recipient_id,deduplication_key) do nothing;
  return escalation_id;
end $$;

create or replace function public.lifecycle_create_case(p_case jsonb)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare actor uuid; v_team_id uuid; rule_id uuid; assignee uuid; case_id uuid; v_channel text; cat uuid; carrier uuid; due_at timestamptz;
begin
  actor:=public.lifecycle_actor_id();
  v_channel:=coalesce(p_case->>'initial_channel','WhatsApp');
  if v_channel not in ('WhatsApp','E-mail') then raise exception 'Unsupported customer channel'; end if;
  if nullif(trim(p_case->>'customer_name'),'') is null or nullif(trim(p_case->>'query'),'') is null then raise exception 'Customer and query are required'; end if;
  select r.id into rule_id from public.routing_rules r where r.active and r.channel=v_channel
    and escalation_tier is null and carrier_id is null and destination_team_id is not null
    order by r.priority,r.id limit 1;
  if rule_id is null then raise exception 'No active intake routing rule for %',v_channel; end if;
  select r.destination_team_id into v_team_id from public.routing_rules r where r.id=rule_id;
  assignee:=public.lifecycle_pick_assignee(rule_id,v_team_id);
  if assignee is null then raise exception 'Intake routing rule has no active assignee'; end if;
  perform public.lifecycle_require_team(actor,'CS-MADA');
  if not exists(select 1 from public.team_memberships m where m.team_id=v_team_id and m.agent_id=actor and m.active) then
    raise exception 'Case creation is restricted to CS-MADA';
  end if;
  cat:=nullif(p_case->>'category_id','')::uuid;
  carrier:=nullif(p_case->>'carrier_id','')::uuid;
  due_at:=nullif(p_case->>'customer_feedback_due_at','')::timestamptz;
  if due_at is null then raise exception 'Next customer update deadline is required'; end if;
  insert into public.demandes(customer_name,phone,email,tracking_number,initial_channel,current_stage,status,owner_id,responsible_id,
    customer_feedback_due_at,next_customer_update_at,next_action,query,category_id,carrier_id,priority,case_owner_id,current_team_id,current_assignee_id,current_status)
  values(trim(p_case->>'customer_name'),nullif(trim(p_case->>'phone'),''),nullif(trim(p_case->>'email'),''),nullif(trim(p_case->>'tracking_number'),''),v_channel,
    case when v_channel='E-mail' then 'CS E-mail' else 'CS WhatsApp' end,'Open',assignee,assignee,due_at,due_at,nullif(trim(p_case->>'next_action'),''),trim(p_case->>'query'),cat,carrier,
    coalesce(nullif(p_case->>'priority',''),'normal'),assignee,v_team_id,assignee,'New') returning id into case_id;
  perform public.lifecycle_add_event(case_id,null,actor,'case_created','Customer query received via '||v_channel||'.',jsonb_build_object('channel',v_channel,'routing_rule_id',rule_id,'assignee_id',assignee));
  insert into public.notifications(recipient_id,request_id,type,priority,title,body,deduplication_key)
  values(assignee,case_id,'ASSIGNED_TO_ME','normal','New customer query','A new case was routed to you.','CASE-CREATED:'||case_id::text)
  on conflict(recipient_id,deduplication_key) do nothing;
  return case_id;
end $$;

create or replace function public.lifecycle_update_case(p_case_id uuid,p_changes jsonb)
returns void language plpgsql security definer set search_path=public,auth as $$
declare actor uuid; d public.demandes%rowtype; k text; before_value text; after_value text;
begin
  actor:=public.lifecycle_actor_id();
  if not exists(select 1 from public.team_memberships m join public.teams t on t.id=m.team_id where m.agent_id=actor and m.active and t.active and t.key in ('CS-MADA','MADA-OPS')) then raise exception 'Internal team membership required' using errcode='42501'; end if;
  select * into d from public.demandes where id=p_case_id for update;
  if not found then raise exception 'Case not found' using errcode='P0002'; end if;
  if p_changes - array['category_id','carrier_id','priority','case_owner_id','current_assignee_id','customer_feedback_due_at','next_action','customer_name','phone','email','tracking_number','query']::text[] <> '{}'::jsonb then
    raise exception 'Unsupported case field in update';
  end if;
  if p_changes ? 'case_owner_id' and not exists(
    select 1 from public.team_memberships m join public.teams t on t.id=m.team_id join public.agents a on a.id=m.agent_id
    where a.id=nullif(p_changes->>'case_owner_id','')::uuid and a.active and m.active and t.active and t.key='CS-MADA'
  ) then raise exception 'Case owner must be an active CS-MADA member'; end if;
  if p_changes ? 'current_assignee_id' and (nullif(p_changes->>'current_assignee_id','') is null or not exists(
    select 1 from public.team_memberships m join public.teams t on t.id=m.team_id join public.agents a on a.id=m.agent_id
    where a.id=(p_changes->>'current_assignee_id')::uuid and a.active and m.active and t.active and t.id=d.current_team_id
  )) then raise exception 'Assignee must be an active member of the current team'; end if;
  update public.demandes set
    category_id=case when p_changes ? 'category_id' then nullif(p_changes->>'category_id','')::uuid else category_id end,
    carrier_id=case when p_changes ? 'carrier_id' then nullif(p_changes->>'carrier_id','')::uuid else carrier_id end,
    priority=case when p_changes ? 'priority' then p_changes->>'priority' else priority end,
    owner_id=case when p_changes ? 'case_owner_id' then nullif(p_changes->>'case_owner_id','')::uuid else owner_id end,
    case_owner_id=case when p_changes ? 'case_owner_id' then nullif(p_changes->>'case_owner_id','')::uuid else case_owner_id end,
    responsible_id=case when p_changes ? 'current_assignee_id' then nullif(p_changes->>'current_assignee_id','')::uuid else responsible_id end,
    current_assignee_id=case when p_changes ? 'current_assignee_id' then nullif(p_changes->>'current_assignee_id','')::uuid else current_assignee_id end,
    customer_feedback_due_at=case when p_changes ? 'customer_feedback_due_at' then nullif(p_changes->>'customer_feedback_due_at','')::timestamptz else customer_feedback_due_at end,
    next_customer_update_at=case when p_changes ? 'customer_feedback_due_at' then nullif(p_changes->>'customer_feedback_due_at','')::timestamptz else next_customer_update_at end,
    next_action=case when p_changes ? 'next_action' then nullif(p_changes->>'next_action','') else next_action end,
    customer_name=case when p_changes ? 'customer_name' then p_changes->>'customer_name' else customer_name end,
    phone=case when p_changes ? 'phone' then nullif(p_changes->>'phone','') else phone end,
    email=case when p_changes ? 'email' then nullif(p_changes->>'email','') else email end,
    tracking_number=case when p_changes ? 'tracking_number' then nullif(p_changes->>'tracking_number','') else tracking_number end,
    query=case when p_changes ? 'query' then p_changes->>'query' else query end
  where id=p_case_id;
  foreach k in array array['category_id','carrier_id','priority','case_owner_id','current_assignee_id','customer_feedback_due_at','next_action','customer_name','phone','email','tracking_number','query'] loop
    if p_changes ? k then
      before_value:=to_jsonb(d)->>k; after_value:=p_changes->>k;
      if before_value is distinct from after_value then
        perform public.lifecycle_add_event(p_case_id,null,actor,'field_changed',replace(k,'_',' ')||' updated.',jsonb_build_object('field',k,'from',before_value,'to',after_value));
      end if;
    end if;
  end loop;
end $$;

-- Keep last activity accurate for all typed domain events, including server-side RPC writes.
create or replace function public.lifecycle_touch_case_activity()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.demandes set updated_at=greatest(updated_at,new.occurred_at) where id=new.case_id;
  return new;
end $$;
drop trigger if exists case_events_touch_case on public.case_events;
create trigger case_events_touch_case after insert on public.case_events for each row execute function public.lifecycle_touch_case_activity();

-- Durable deadline notifications run in the database even when nobody has the workspace open.
create or replace function public.lifecycle_notify_due_deadlines()
returns integer language plpgsql security definer set search_path=public as $$
declare generated integer:=0; added integer:=0;
begin
  if not exists(select 1 from public.agents a where a.user_id=auth.uid() and a.active)
     and session_user not in ('postgres','supabase_admin') then raise exception 'Active internal agent required' using errcode='42501'; end if;
  with due as (
    select d.id case_id,d.next_customer_update_at due_at,d.case_owner_id owner_id,d.current_assignee_id assignee_id,
      case when d.next_customer_update_at < now() then 'OVERDUE' else 'DUE_SOON' end notification_type,
      case when d.next_customer_update_at < now() then 'high' else 'normal' end notification_priority
    from public.demandes d where d.current_status not in ('Resolved','Closed')
      and d.next_customer_update_at < now()+interval '30 minutes'
  ), recipients as (
    select distinct due.*,x.agent_id from due cross join lateral unnest(array[due.owner_id,due.assignee_id]) as x(agent_id)
    where x.agent_id is not null
  ), inserted as (
    insert into public.notifications(recipient_id,request_id,type,priority,title,body,deduplication_key)
    select agent_id,case_id,notification_type,notification_priority,
      case when notification_type='OVERDUE' then 'Customer update overdue' else 'Customer update due soon' end,
      case when notification_type='OVERDUE' then 'A promised customer update is overdue.' else 'A customer update is due within 30 minutes.' end,
      notification_type||':'||case_id::text||':'||due_at::text
    from recipients on conflict(recipient_id,deduplication_key) do nothing returning 1
  ) select count(*) into generated from inserted;
  with pending as (
    select e.id escalation_id,e.case_id,e.tier,e.due_at,
      case when e.due_at<now() then 'OVERDUE' else 'DUE_SOON' end notification_type,
      case when e.due_at<now() then 'high' else 'normal' end notification_priority,
      e.destination_assignee_id,e.internal_followup_owner_id,d.case_owner_id
    from public.case_escalations e join public.demandes d on d.id=e.case_id
    where e.resolved_at is null and e.due_at is not null and e.due_at<now()+interval '30 minutes'
  ), recipients as (
    select distinct pending.*,x.agent_id from pending cross join lateral unnest(array[
      case when tier=1 then destination_assignee_id else internal_followup_owner_id end,case_owner_id
    ]) as x(agent_id) where x.agent_id is not null
  ), inserted as (
    insert into public.notifications(recipient_id,request_id,type,priority,title,body,deduplication_key)
    select agent_id,case_id,notification_type,notification_priority,
      case when tier=1 then 'Tier 1 response deadline' else 'SEZ-OPS follow-up deadline' end,
      case when notification_type='OVERDUE' then 'The internal escalation deadline has passed.' else 'The internal escalation deadline is approaching.' end,
      'ESCALATION-'||tier::text||':'||escalation_id::text||':'||notification_type
    from recipients on conflict(recipient_id,deduplication_key) do nothing returning 1
  ) select count(*) into added from inserted;
  generated:=generated+added;
  return generated;
end $$;
revoke all on function public.lifecycle_notify_due_deadlines() from public,anon;
grant execute on function public.lifecycle_notify_due_deadlines() to authenticated;

do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if not exists(select 1 from cron.job where jobname='cs-mada-customer-deadline-notifications') then
      perform cron.schedule('cs-mada-customer-deadline-notifications','*/5 * * * *','select public.lifecycle_notify_due_deadlines()');
    end if;
  end if;
exception when duplicate_object then null; when insufficient_privilege then null; when undefined_table then null;
end $$;

create or replace function public.lifecycle_add_internal_note(p_case_id uuid,p_content text)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare actor uuid; event_id uuid;
begin
  actor:=public.lifecycle_actor_id();
  if not exists(select 1 from public.team_memberships m join public.teams t on t.id=m.team_id where m.agent_id=actor and m.active and t.active and t.key in ('CS-MADA','MADA-OPS')) then raise exception 'Internal team membership required' using errcode='42501'; end if;
  if nullif(trim(p_content),'') is null then raise exception 'Note cannot be empty'; end if;
  event_id:=public.lifecycle_add_event(p_case_id,null,actor,'internal_note',trim(p_content),'{}'::jsonb);
  update public.demandes set updated_at=now() where id=p_case_id;
  return event_id;
end $$;

create or replace function public.lifecycle_ack_tier1(p_escalation_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
declare actor uuid; case_id uuid;
begin
  actor:=public.lifecycle_actor_id(); perform public.lifecycle_require_team(actor,'MADA-OPS');
  update public.case_escalations set acknowledged_at=coalesce(acknowledged_at,now()),status='Acknowledged',updated_at=now()
  where id=p_escalation_id and tier=1 and resolved_at is null and destination_team_id=(select id from public.teams where key='MADA-OPS')
  returning case_escalations.case_id into case_id;
  if case_id is null then raise exception 'Open Tier 1 escalation not found' using errcode='P0002'; end if;
  perform public.lifecycle_add_event(case_id,p_escalation_id,actor,'tier1_acknowledged','MADA-OPS acknowledged the Tier 1 escalation.','{}'::jsonb);
end $$;

-- A Tier 2 handoff closes the active Tier 1 work item while preserving both escalation records.
create or replace function public.lifecycle_escalate_tier2(
  p_case_id uuid,p_reason text,p_requested_action text,p_information_sent text,p_followup_owner_id uuid,p_due_at timestamptz,p_external_reference text default null
) returns uuid language plpgsql security definer set search_path=public,auth as $$
declare actor uuid; ops_team uuid; cs_team uuid; escalation_id uuid; owner_name text; prior_tier1 uuid; case_owner uuid;
begin
  actor:=public.lifecycle_actor_id(); ops_team:=public.lifecycle_require_team(actor,'MADA-OPS');
  perform public.lifecycle_require_team(p_followup_owner_id,'MADA-OPS');
  select current_team_id,case_owner_id into cs_team,case_owner from public.demandes where id=p_case_id for update;
  if not found then raise exception 'Case not found' using errcode='P0002'; end if;
  if cs_team<>ops_team then raise exception 'Tier 2 handoff must be initiated from MADA-OPS'; end if;
  if nullif(trim(p_reason),'') is null or nullif(trim(p_requested_action),'') is null then raise exception 'Reason and requested action are required'; end if;
  if p_due_at is null then raise exception 'Next SEZ-OPS follow-up deadline is required'; end if;
  if exists(select 1 from public.case_escalations where case_id=p_case_id and tier=2 and resolved_at is null) then raise exception 'An active Tier 2 handoff already exists'; end if;
  select id into prior_tier1 from public.case_escalations where case_id=p_case_id and tier=1 and resolved_at is null order by opened_at desc limit 1 for update;
  if prior_tier1 is null and not exists(select 1 from public.case_escalations where case_id=p_case_id and tier=1 and resolved_at is not null) then
    raise exception 'A Tier 1 escalation is required before Tier 2';
  end if;
  if prior_tier1 is not null then
    update public.case_escalations set status='Escalated to Tier 2',resolved_at=now(),response_at=coalesce(response_at,now()),updated_at=now() where id=prior_tier1;
  end if;
  select name into owner_name from public.agents where id=p_followup_owner_id;
  insert into public.case_escalations(case_id,tier,escalation_type,source_team_id,external_destination,internal_followup_owner_id,
    reason,issue_summary,requested_action,information_sent,external_reference,priority,status,sent_at,due_at,created_by)
  select p_case_id,2,'external',ops_team,'SEZ-OPS',p_followup_owner_id,p_reason,d.query,p_requested_action,p_information_sent,p_external_reference,d.priority,'Awaiting SEZ-OPS',now(),p_due_at,actor
  from public.demandes d where d.id=p_case_id returning id into escalation_id;
  update public.demandes set current_team_id=ops_team,current_assignee_id=p_followup_owner_id,responsible_id=p_followup_owner_id,
    current_status='Waiting on External Operations',status='Waiting',current_escalation_tier=2,tier2_followup_due_at=p_due_at,next_action='Follow up with SEZ-OPS'
  where id=p_case_id;
  if prior_tier1 is not null then
    perform public.lifecycle_add_event(p_case_id,prior_tier1,actor,'tier1_escalated_to_tier2','MADA-OPS escalated the case to the external Tier 2 handoff.',jsonb_build_object('tier2_escalation_id',escalation_id));
  end if;
  perform public.lifecycle_add_event(p_case_id,escalation_id,actor,'tier2_external_sent','External handoff sent to SEZ-OPS. Internal follow-up owner: '||coalesce(owner_name,'assigned agent')||'.',
    jsonb_build_object('destination','SEZ-OPS','followup_owner_id',p_followup_owner_id,'due_at',p_due_at,'external_reference',p_external_reference,'case_owner_id',case_owner));
  insert into public.notifications(recipient_id,request_id,type,priority,title,body,deduplication_key)
  values(p_followup_owner_id,p_case_id,'ACTION_REQUIRED','high','SEZ-OPS follow-up required','Follow up on the external handoff by '||p_due_at::text,'T2:'||escalation_id::text)
  on conflict(recipient_id,deduplication_key) do nothing;
  if case_owner is not null and case_owner<>p_followup_owner_id then
    insert into public.notifications(recipient_id,request_id,type,priority,title,body,deduplication_key)
    values(case_owner,p_case_id,'ACTION_REQUIRED','normal','Case sent to SEZ-OPS','MADA-OPS created an external follow-up; the customer owner remains accountable.','T2-OWNER:'||escalation_id::text)
    on conflict(recipient_id,deduplication_key) do nothing;
  end if;
  return escalation_id;
end $$;

-- Authenticated users may read cases, but case mutations and immutable audit events use RPCs.
do $$ declare p record; begin
  for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('demandes','demande_events') loop
    execute format('drop policy if exists %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;
create policy lifecycle_cases_read on public.demandes for select to authenticated using (public.lifecycle_is_internal());
create policy lifecycle_events_read on public.demande_events for select to authenticated using (public.lifecycle_is_internal());
drop policy if exists agents_read on public.agents;
drop policy if exists agents_manage on public.agents;
drop policy if exists lifecycle_agents_read on public.agents;
drop policy if exists lifecycle_agents_admin on public.agents;
create policy lifecycle_agents_read on public.agents for select to authenticated using (public.lifecycle_is_internal());
create policy lifecycle_agents_admin on public.agents for all to authenticated using (public.lifecycle_is_admin()) with check (public.lifecycle_is_admin());
drop policy if exists routing_assignees_read on public.routing_rule_assignees;
drop policy if exists routing_assignees_admin on public.routing_rule_assignees;
create policy routing_assignees_read on public.routing_rule_assignees for select to authenticated using (public.lifecycle_is_internal());
create policy routing_assignees_admin on public.routing_rule_assignees for all to authenticated using (public.lifecycle_is_admin()) with check (public.lifecycle_is_admin());
drop policy if exists lifecycle_routing_admin on public.routing_rules;
create policy lifecycle_routing_admin on public.routing_rules for all to authenticated using (public.lifecycle_is_admin()) with check (public.lifecycle_is_admin());
drop policy if exists lifecycle_memberships_admin on public.team_memberships;
create policy lifecycle_memberships_admin on public.team_memberships for all to authenticated using (public.lifecycle_is_admin()) with check (public.lifecycle_is_admin());
drop policy if exists lifecycle_categories_admin on public.case_categories;
create policy lifecycle_categories_admin on public.case_categories for all to authenticated using (public.lifecycle_is_admin()) with check (public.lifecycle_is_admin());
drop policy if exists lifecycle_carriers_admin on public.carriers;
create policy lifecycle_carriers_admin on public.carriers for all to authenticated using (public.lifecycle_is_admin()) with check (public.lifecycle_is_admin());

revoke insert,update,delete on public.demandes,public.demande_events,public.agents from anon,authenticated;
grant select on public.demandes,public.demande_events,public.agents,public.routing_rule_assignees to authenticated;
grant insert,update,delete on public.agents to authenticated;
grant select,insert,update,delete on public.routing_rules,public.routing_rule_assignees,public.team_memberships,public.case_categories,public.carriers to authenticated;

revoke all on function public.lifecycle_is_internal() from public;
revoke all on function public.lifecycle_is_admin() from public;
revoke all on function public.lifecycle_pick_assignee(uuid,uuid) from public;
revoke all on function public.lifecycle_suggest_tier1_assignee(uuid) from public;
revoke all on function public.lifecycle_create_case(jsonb) from public;
revoke all on function public.lifecycle_update_case(uuid,jsonb) from public;
revoke all on function public.lifecycle_add_internal_note(uuid,text) from public;
revoke all on function public.lifecycle_ack_tier1(uuid) from public;
revoke all on function public.lifecycle_touch_case_activity() from public;
grant execute on function public.lifecycle_is_internal() to authenticated;
grant execute on function public.lifecycle_is_admin() to authenticated;
grant execute on function public.lifecycle_create_case(jsonb) to authenticated;
grant execute on function public.lifecycle_update_case(uuid,jsonb) to authenticated;
grant execute on function public.lifecycle_add_internal_note(uuid,text) to authenticated;
grant execute on function public.lifecycle_ack_tier1(uuid) to authenticated;
grant execute on function public.lifecycle_suggest_tier1_assignee(uuid) to authenticated;

create index if not exists idx_routing_rule_assignees_pick on public.routing_rule_assignees(routing_rule_id,sort_order);
create index if not exists idx_demandes_current_assignee_status on public.demandes(current_assignee_id,current_status,updated_at desc);
