-- Merge duplicate CS-MADA agent rows without losing their request history.
-- Run after notification tables from schema.sql have been installed.
begin;

create temp table cs_mada_agent_merge_map (
  duplicate_id uuid primary key,
  canonical_id uuid not null
) on commit drop;

insert into cs_mada_agent_merge_map (duplicate_id, canonical_id)
with ranked as (
  select a.id, a.name, lower(trim(a.name)) as normalized_name,
    row_number() over (
      partition by lower(trim(a.name))
      order by
        case
          when lower(trim(a.name)) = 'rojo' and lower(u.email) = 'rojo@suivi.com' then 0
          when lower(trim(a.name)) = 'fania' and lower(u.email) = 'fania@suivi.com' then 0
          when lower(trim(a.name)) = 'ando' and lower(u.email) = 'ando@suivi.com' then 0
          when lower(trim(a.name)) = 'jerry' and lower(u.email) = 'jerry@suivi.com' then 0
          else 1
        end,
        case when a.user_id is not null then 0 else 1 end,
        a.created_at,
        a.id
    ) as row_number
  from public.agents a
  left join auth.users u on u.id = a.user_id
  where lower(trim(a.name)) in ('rojo', 'fania', 'ando', 'jerry')
), canonical as (
  select lower(trim(name)) as normalized_name, id as canonical_id
  from ranked where row_number = 1
)
select duplicate.id, canonical.canonical_id
from ranked duplicate
join canonical using (normalized_name)
where duplicate.row_number > 1;

do $$
declare link record;
begin
  for link in select duplicate_id, canonical_id from cs_mada_agent_merge_map loop
    update public.demandes set owner_id = link.canonical_id where owner_id = link.duplicate_id;
    update public.demandes set responsible_id = link.canonical_id where responsible_id = link.duplicate_id;
    update public.demande_events set author_id = link.canonical_id where author_id = link.duplicate_id;

    -- Preserve both agents' preferences, with the duplicate's explicit values
    -- taking precedence when the same setting exists on both rows.
    if to_regclass('public.notification_preferences') is not null then
      if exists (select 1 from public.notification_preferences where agent_id = link.duplicate_id) then
        insert into public.notification_preferences (agent_id, preferences, updated_at)
        select link.canonical_id, preferences, now()
        from public.notification_preferences where agent_id = link.duplicate_id
        on conflict (agent_id) do update set
          preferences = coalesce(public.notification_preferences.preferences, '{}'::jsonb)
            || coalesce(excluded.preferences, '{}'::jsonb),
          updated_at = now();
        delete from public.notification_preferences where agent_id = link.duplicate_id;
      end if;
    end if;

    -- Avoid unique(recipient_id, deduplication_key) conflicts while moving history.
    if to_regclass('public.notifications') is not null then
      delete from public.notifications duplicate_notification
      using public.notifications canonical_notification
      where duplicate_notification.recipient_id = link.duplicate_id
        and canonical_notification.recipient_id = link.canonical_id
        and duplicate_notification.deduplication_key is not null
        and duplicate_notification.deduplication_key = canonical_notification.deduplication_key;
      update public.notifications set recipient_id = link.canonical_id where recipient_id = link.duplicate_id;
    end if;

    -- Keep one push subscription for each endpoint on the canonical agent.
    if to_regclass('public.webpush_subscriptions') is not null then
      delete from public.webpush_subscriptions duplicate_subscription
      using public.webpush_subscriptions canonical_subscription
      where duplicate_subscription.agent_id = link.duplicate_id
        and canonical_subscription.agent_id = link.canonical_id
        and duplicate_subscription.endpoint = canonical_subscription.endpoint;
      update public.webpush_subscriptions set agent_id = link.canonical_id where agent_id = link.duplicate_id;
    end if;

    delete from public.agents where id = link.duplicate_id;
  end loop;
end $$;

-- Normalize the surviving rows to the intended identity and role.
update public.agents a set role = expected.agent_role,
  primary_channel = expected.primary_channel,
  active = true,
  updated_at = now()
from (values
  ('Rojo', 'CS WhatsApp', 'WhatsApp'),
  ('Fania', 'CS & Opérations', null),
  ('Ando', 'Opérations', null),
  ('Jerry', 'Opérations', null)
) as expected(agent_name, agent_role, primary_channel)
where lower(trim(a.name)) = lower(expected.agent_name);

select a.name, a.role, a.primary_channel, a.user_id, count(*) over (partition by lower(trim(a.name))) as rows_for_name
from public.agents a
where lower(trim(a.name)) in ('rojo', 'fania', 'ando', 'jerry')
order by a.name, a.created_at;

commit;
