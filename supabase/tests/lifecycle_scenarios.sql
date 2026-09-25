-- Run against a disposable Supabase project after all migrations are applied:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/lifecycle_scenarios.sql
-- The script uses configured, authenticated internal agents and rolls all case data back.
begin;
do $$
declare
  cs_agent uuid; cs_user uuid; ops_agent uuid; ops_user uuid; owner_before uuid;
  aramex_id uuid; speedaf_id uuid; route_id uuid; selected uuid;
  whatsapp_case uuid; email_case uuid; aramex_case uuid; speedaf_case uuid; tier2_case uuid;
  escalation_id uuid; response_id uuid; due_at timestamptz; event_count integer;
begin
  select a.id,a.user_id into cs_agent,cs_user from public.agents a
  join public.team_memberships m on m.agent_id=a.id and m.active
  join public.teams t on t.id=m.team_id and t.key='CS-MADA' and t.active
  where a.active and a.user_id is not null order by a.name limit 1;
  if cs_agent is null then raise exception 'Scenario setup requires an active authenticated CS-MADA agent'; end if;

  select c.id into aramex_id from public.carriers c where c.key='aramex';
  select c.id into speedaf_id from public.carriers c where c.key='speedaf';
  select r.id into route_id from public.routing_rules r where r.active and r.channel='WhatsApp' and r.escalation_tier is null and r.carrier_id is null order by r.priority limit 1;
  if route_id is null then raise exception 'Scenario setup requires an active WhatsApp intake rule'; end if;
  select public.lifecycle_pick_assignee(route_id,(select destination_team_id from public.routing_rules where id=route_id)) into selected;
  if selected is null then raise exception 'WhatsApp intake rule must have an active assignee'; end if;

  perform set_config('request.jwt.claim.sub',cs_user::text,true);
  whatsapp_case:=public.lifecycle_create_case(jsonb_build_object('customer_name','Scenario A','initial_channel','WhatsApp','query','WhatsApp route test','customer_feedback_due_at',now()+interval '4 hours'));
  if not exists(select 1 from public.demandes where id=whatsapp_case and case_owner_id=selected and current_assignee_id=selected and current_team_id=(select id from public.teams where key='CS-MADA')) then
    raise exception 'Scenario A failed: WhatsApp case was not routed to its configured CS owner';
  end if;

  select r.id into route_id from public.routing_rules r where r.active and r.channel='E-mail' and r.escalation_tier is null and r.carrier_id is null order by r.priority limit 1;
  if route_id is null then raise exception 'Scenario setup requires an active Email intake rule'; end if;
  select public.lifecycle_pick_assignee(route_id,(select destination_team_id from public.routing_rules where id=route_id)) into selected;
  if selected is null then raise exception 'Email intake rule must have an active assignee'; end if;
  email_case:=public.lifecycle_create_case(jsonb_build_object('customer_name','Scenario B','initial_channel','E-mail','query','Email route test','customer_feedback_due_at',now()+interval '4 hours'));
  if not exists(select 1 from public.demandes where id=email_case and case_owner_id=selected and current_assignee_id=selected) then
    raise exception 'Scenario B failed: Email case was not routed to its configured CS owner';
  end if;

  -- Scenarios C and D: choose the configured active pool member and confirm the Tier 1 handoff.
  select r.id into route_id from public.routing_rules r where r.active and r.escalation_tier=1 and r.carrier_id=aramex_id order by r.priority limit 1;
  select public.lifecycle_pick_assignee(route_id,(select destination_team_id from public.routing_rules where id=route_id)) into ops_agent;
  if route_id is null or ops_agent is null then raise exception 'Scenario C setup requires an Aramex Tier 1 pool'; end if;
  aramex_case:=public.lifecycle_create_case(jsonb_build_object('customer_name','Scenario C','initial_channel','WhatsApp','query','Aramex Tier 1 test','carrier_id',aramex_id,'customer_feedback_due_at',now()+interval '4 hours'));
  owner_before:=(select case_owner_id from public.demandes where id=aramex_case);
  escalation_id:=public.lifecycle_escalate_tier1(aramex_case,'Scenario C reason','Check parcel','Internal handoff',ops_agent,now()+interval '2 hours');
  if not exists(select 1 from public.demandes where id=aramex_case and case_owner_id=owner_before and current_assignee_id=ops_agent and current_escalation_tier=1 and current_status='Waiting on Operations') then
    raise exception 'Scenario C failed: Aramex Tier 1 did not preserve owner and assign MADA-OPS';
  end if;
  select user_id into ops_user from public.agents where id=ops_agent;
  if ops_user is null then raise exception 'Scenario C setup requires an authenticated Aramex pool agent'; end if;
  perform set_config('request.jwt.claim.sub',ops_user::text,true);
  perform public.lifecycle_ack_tier1(escalation_id);
  if not exists(select 1 from public.case_escalations where id=escalation_id and acknowledged_at is not null) then raise exception 'Scenario C failed: Tier 1 acknowledgement was not recorded'; end if;
  perform set_config('request.jwt.claim.sub',cs_user::text,true);
  perform public.lifecycle_return_to_cs(aramex_case,'Aramex response received',now()+interval '1 hour');
  if not exists(select 1 from public.demandes where id=aramex_case and case_owner_id=owner_before and current_team_id=(select id from public.teams where key='CS-MADA')) then
    raise exception 'Scenario E failed: Tier 1 response did not return to CS while preserving the owner';
  end if;
  if owner_before<>cs_agent and not exists(select 1 from public.notifications where request_id=aramex_case and recipient_id=owner_before and type='NEW_OPERATION_REPLY') then
    raise exception 'Scenario E failed: CS owner notification missing';
  end if;

  select r.id into route_id from public.routing_rules r where r.active and r.escalation_tier=1 and r.carrier_id=speedaf_id order by r.priority limit 1;
  select public.lifecycle_pick_assignee(route_id,(select destination_team_id from public.routing_rules where id=route_id)) into ops_agent;
  if route_id is null or ops_agent is null then raise exception 'Scenario D setup requires a Speedaf Tier 1 pool'; end if;
  speedaf_case:=public.lifecycle_create_case(jsonb_build_object('customer_name','Scenario D','initial_channel','E-mail','query','Speedaf Tier 1 test','carrier_id',speedaf_id,'customer_feedback_due_at',now()+interval '4 hours'));
  escalation_id:=public.lifecycle_escalate_tier1(speedaf_case,'Scenario D reason','Contact carrier','Speedaf handoff',ops_agent,now()+interval '2 hours');
  if not exists(select 1 from public.demandes where id=speedaf_case and current_assignee_id=ops_agent and current_team_id=(select id from public.teams where key='MADA-OPS')) then
    raise exception 'Scenario D failed: Speedaf Tier 1 did not route to its configured MADA-OPS pool';
  end if;

  -- Scenarios E to J use the Speedaf case and verify the external and customer follow-up path.
  tier2_case:=public.lifecycle_create_case(jsonb_build_object('customer_name','Scenario F','initial_channel','WhatsApp','query','SEZ-OPS handoff test','carrier_id',aramex_id,'customer_feedback_due_at',now()+interval '4 hours'));
  select r.id into route_id from public.routing_rules r where r.active and r.escalation_tier=1 and r.carrier_id=aramex_id order by r.priority limit 1;
  select public.lifecycle_pick_assignee(route_id,(select destination_team_id from public.routing_rules where id=route_id)) into ops_agent;
  select user_id into ops_user from public.agents where id=ops_agent;
  perform public.lifecycle_escalate_tier1(tier2_case,'Tier 1 prerequisite','Investigate','',ops_agent,now()+interval '2 hours');
  perform set_config('request.jwt.claim.sub',ops_user::text,true);
  perform public.lifecycle_return_to_cs(tier2_case,'Operations escalation complete',now()+interval '1 hour');
  -- Return to MADA-OPS to initiate the external Tier 2 handoff.
  perform set_config('request.jwt.claim.sub',cs_user::text,true);
  perform public.lifecycle_escalate_tier1(tier2_case,'Tier 1 prerequisite','Investigate','',ops_agent,now()+interval '2 hours');
  perform set_config('request.jwt.claim.sub',ops_user::text,true);
  escalation_id:=public.lifecycle_escalate_tier2(tier2_case,'External dependency','Confirm parcel release','Tracking and case history',ops_agent,now()+interval '3 hours','EXT-SCENARIO');
  if not exists(select 1 from public.case_escalations where id=escalation_id and external_destination='SEZ-OPS' and destination_team_id is null and internal_followup_owner_id=ops_agent and status='Awaiting SEZ-OPS') then
    raise exception 'Scenario F failed: Tier 2 must track SEZ-OPS externally and retain an internal follow-up owner';
  end if;
  if not exists(select 1 from public.demandes where id=tier2_case and current_team_id=(select id from public.teams where key='MADA-OPS') and current_escalation_tier=2 and current_status='Waiting on External Operations') then
    raise exception 'Scenario F failed: internal case ownership/state was not retained for the external dependency';
  end if;
  response_id:=public.lifecycle_record_sez_response(escalation_id,now(),'Parcel released','Call customer','["REF-SCENARIO"]'::jsonb,'Send customer update');
  if not exists(select 1 from public.external_escalation_responses where id=response_id and recorded_by=ops_agent) then raise exception 'Scenario G failed: SEZ-OPS response not recorded by the internal agent'; end if;
  if not exists(select 1 from public.case_events where case_id=tier2_case and event_type='external_response_received') then raise exception 'Scenario G failed: response timeline event missing'; end if;
  perform set_config('request.jwt.claim.sub',cs_user::text,true);
  due_at:=now()-interval '1 minute';
  perform public.lifecycle_customer_update(tier2_case,'WhatsApp','Your parcel is moving.',due_at);
  if not exists(select 1 from public.demandes where id=tier2_case and last_customer_update_at is not null and next_customer_update_at=due_at) then raise exception 'Scenario H failed: customer update timestamp/deadline not saved'; end if;
  perform public.lifecycle_notify_due_deadlines();
  if not exists(select 1 from public.notifications where request_id=tier2_case and type='OVERDUE') then raise exception 'Scenario I failed: overdue customer update notification missing'; end if;
  perform set_config('request.jwt.claim.sub',ops_user::text,true);
  perform public.lifecycle_complete_tier2(escalation_id,'External follow-up complete');
  perform set_config('request.jwt.claim.sub',cs_user::text,true);
  perform public.lifecycle_set_status(tier2_case,'Resolved','Scenario resolution');
  perform public.lifecycle_set_status(tier2_case,'Closed','Scenario closure');
  perform public.lifecycle_set_status(tier2_case,'In progress','Scenario reopen');
  if not exists(select 1 from public.demandes where id=tier2_case and current_status='In progress' and resolved_at is null) then raise exception 'Scenario J failed: case did not reopen'; end if;
  select count(*) into event_count from public.case_events where case_id=tier2_case and event_type='case_reopened';
  if event_count<>1 then raise exception 'Scenario J failed: reopen audit event missing'; end if;

  raise notice 'Lifecycle scenarios A-J passed';
end $$;
rollback;
