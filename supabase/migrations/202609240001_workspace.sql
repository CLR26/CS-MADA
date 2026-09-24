-- CS-MADA customer support workspace
-- Safe to run on a fresh project or once over the previous CS-MADA schema.
create extension if not exists pgcrypto;

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  role text not null,
  primary_channel text check (primary_channel in ('WhatsApp', 'E-mail')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.demandes (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text,
  email text,
  tracking_number text,
  initial_channel text not null default 'WhatsApp' check (initial_channel in ('WhatsApp', 'E-mail')),
  current_stage text not null default 'CS WhatsApp' check (current_stage in ('CS WhatsApp', 'CS E-mail', 'Opérations')),
  status text not null default 'Open' check (status in ('Open', 'In progress', 'Waiting', 'Escalated', 'Resolved')),
  owner_id uuid references public.agents(id) on delete set null,
  responsible_id uuid references public.agents(id) on delete set null,
  customer_feedback_due_at timestamptz,
  next_action text,
  query text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Add new fields first so the legacy values can be carried forward.
alter table public.demandes add column if not exists customer_name text;
alter table public.demandes add column if not exists phone text;
alter table public.demandes add column if not exists email text;
alter table public.demandes add column if not exists tracking_number text;
alter table public.demandes add column if not exists initial_channel text default 'WhatsApp';
alter table public.demandes add column if not exists current_stage text default 'CS WhatsApp';
alter table public.demandes add column if not exists status text default 'Open';
alter table public.demandes add column if not exists owner_id uuid references public.agents(id) on delete set null;
alter table public.demandes add column if not exists responsible_id uuid references public.agents(id) on delete set null;
alter table public.demandes add column if not exists customer_feedback_due_at timestamptz;
alter table public.demandes add column if not exists next_action text;
alter table public.demandes add column if not exists query text;
alter table public.demandes add column if not exists created_at timestamptz default now();
alter table public.demandes add column if not exists updated_at timestamptz default now();
alter table public.demandes add column if not exists resolved_at timestamptz;

-- Remove the former trigger before migrating/dropping the fields it references.
drop trigger if exists trg_demandes_last_update on public.demandes;
drop function if exists public.set_last_update_at();

-- Carry forward values from the former model without deleting any requests.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='demandes' and column_name='channel') then
    execute 'update public.demandes set initial_channel = case when channel = ''E-mail'' then ''E-mail'' else ''WhatsApp'' end where initial_channel is null or initial_channel = ''WhatsApp''';
    execute 'update public.demandes set current_stage = ''CS E-mail'' where channel = ''E-mail'' and current_stage = ''CS WhatsApp''';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='demandes' and column_name='follow_up_at') then
    execute 'update public.demandes set customer_feedback_due_at = follow_up_at where customer_feedback_due_at is null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='demandes' and column_name='client_ref') then
    execute 'update public.demandes set customer_name = coalesce(customer_name, client_ref) where customer_name is null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='demandes' and column_name='situation') then
    execute 'update public.demandes set query = coalesce(query, situation) where query is null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='demandes' and column_name='objet') then
    execute 'update public.demandes set query = coalesce(query, objet) where query is null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='demandes' and column_name='last_update_at') then
    execute 'update public.demandes set updated_at = coalesce(last_update_at, created_at, now())';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='demandes' and column_name='created_by') then
    execute 'update public.demandes d set owner_id = a.id, responsible_id = a.id from public.agents a where a.user_id = d.created_by and d.owner_id is null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='demandes' and column_name='waiting_on') then
    execute $m$
      update public.demandes set status = case
        when resolved_at is not null then 'Resolved'
        when waiting_on::text = 'departement' then 'Escalated'
        when waiting_on::text = 'client' then 'Waiting'
        when waiting_on::text = 'nous' then 'In progress'
        else status end
      where status is null or status = 'Open'
    $m$;
  end if;
end $$;

update public.demandes set customer_name = coalesce(customer_name, 'Client inconnu'), query = coalesce(query, 'Demande historique') where customer_name is null or query is null;
update public.demandes set initial_channel = coalesce(initial_channel, 'WhatsApp'), current_stage = coalesce(current_stage, case when initial_channel = 'E-mail' then 'CS E-mail' else 'CS WhatsApp' end), status = coalesce(status, 'Open'), updated_at = coalesce(updated_at, created_at, now());
alter table public.demandes alter column customer_name set not null;
alter table public.demandes alter column query set not null;
alter table public.demandes alter column initial_channel set default 'WhatsApp';
alter table public.demandes alter column initial_channel set not null;
alter table public.demandes alter column current_stage set default 'CS WhatsApp';
alter table public.demandes alter column current_stage set not null;
alter table public.demandes alter column status set default 'Open';
alter table public.demandes alter column status set not null;
alter table public.demandes alter column created_at set default now();
alter table public.demandes alter column created_at set not null;
alter table public.demandes alter column updated_at set default now();
alter table public.demandes alter column updated_at set not null;

-- Initial roster; names and assignments are editable data, never UI constants.
insert into public.agents (name, role, primary_channel)
select seed.name, seed.role, seed.primary_channel from (values
  ('Agent 1', 'CS', 'WhatsApp'), ('Agent 2', 'CS', 'E-mail'),
  ('Agent 3', 'Opérations', null), ('Agent 4', 'Opérations', null)
) as seed(name, role, primary_channel)
where not exists (select 1 from public.agents);

create table if not exists public.demande_events (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null references public.demandes(id) on delete cascade,
  author_id uuid references public.agents(id) on delete set null,
  author_name text not null,
  channel text not null default 'Internal' check (channel in ('WhatsApp', 'E-mail', 'Internal', 'System')),
  kind text not null default 'note',
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Durable, per-agent attention signals. Browser push can later consume this table
-- through a server-side Edge Function without exposing VAPID secrets to clients.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.agents(id) on delete cascade,
  request_id uuid references public.demandes(id) on delete cascade,
  type text not null check (type in ('NEW_REQUEST','ASSIGNED_TO_ME','TRANSFERRED_TO_MY_QUEUE','STATUS_CHANGED','STAGE_CHANGED','DUE_SOON','OVERDUE','NEW_OPERATION_REPLY','ACTION_REQUIRED')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  deduplication_key text,
  unique (recipient_id, deduplication_key)
);
create index if not exists idx_notifications_recipient_unread on public.notifications (recipient_id, created_at desc) where read_at is null;
create table if not exists public.notification_preferences (
  agent_id uuid primary key references public.agents(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.webpush_subscriptions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  unique (agent_id, endpoint)
);

create or replace function public.notify_request_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target public.agents%rowtype;
  notification_type text;
  notification_title text;
  notification_body text;
  priority_value text := 'normal';
  key_value text;
  request_label text;
begin
  request_label := coalesce(nullif(new.tracking_number, ''), left(new.id::text, 8));
  if tg_op = 'INSERT' then
    for target in
      select a.* from public.agents a where a.active and (
        (new.current_stage = 'CS WhatsApp' and a.primary_channel = 'WhatsApp') or
        (new.current_stage = 'CS E-mail' and a.primary_channel = 'E-mail') or
        (new.current_stage = 'Opérations' and a.id = new.responsible_id))
        and a.id is distinct from new.owner_id
    loop
      insert into public.notifications(recipient_id, request_id, type, priority, title, body, deduplication_key)
      values (target.id, new.id, 'NEW_REQUEST', 'normal', 'Nouvelle demande ' || new.initial_channel,
        'Nouvelle demande — #' || request_label, 'NEW_REQUEST:' || new.id::text || ':' || target.id::text)
      on conflict (recipient_id, deduplication_key) do nothing;
    end loop;
    if new.responsible_id is not null and new.responsible_id is distinct from new.owner_id then
      insert into public.notifications(recipient_id, request_id, type, priority, title, body, deduplication_key)
      values (new.responsible_id, new.id, 'ASSIGNED_TO_ME', 'normal', 'Demande assignée', 'Tu es responsable de #' || request_label,
        'ASSIGNED_TO_ME:' || new.id::text || ':' || new.responsible_id::text)
      on conflict (recipient_id, deduplication_key) do nothing;
    end if;
    if nullif(trim(new.next_action), '') is not null and new.responsible_id is not null then
      insert into public.notifications(recipient_id, request_id, type, priority, title, body, deduplication_key)
      values (new.responsible_id, new.id, 'ACTION_REQUIRED', 'normal', 'Action requise', new.next_action,
        'ACTION_REQUIRED:' || new.id::text || ':' || md5(new.next_action) || ':' || new.responsible_id::text)
      on conflict (recipient_id, deduplication_key) do nothing;
    end if;
    return new;
  end if;

  if new.responsible_id is distinct from old.responsible_id and new.responsible_id is not null then
    insert into public.notifications(recipient_id, request_id, type, priority, title, body, deduplication_key)
    values (new.responsible_id, new.id, 'ASSIGNED_TO_ME', 'normal', 'Demande assignée', 'Tu es maintenant responsable de #' || request_label,
      'ASSIGNED_TO_ME:' || new.id::text || ':' || new.responsible_id::text || ':' || extract(epoch from now())::bigint)
    on conflict (recipient_id, deduplication_key) do nothing;
  end if;
  if new.current_stage is distinct from old.current_stage then
    for target in select a.* from public.agents a where a.active and (
      (new.current_stage = 'CS WhatsApp' and a.primary_channel = 'WhatsApp') or
      (new.current_stage = 'CS E-mail' and a.primary_channel = 'E-mail') or
      (new.current_stage = 'Opérations' and a.id = new.responsible_id))
    loop
      if target.id is distinct from new.owner_id then
        notification_type := case when new.current_stage = 'Opérations' then 'TRANSFERRED_TO_MY_QUEUE' else 'STAGE_CHANGED' end;
        insert into public.notifications(recipient_id, request_id, type, priority, title, body, deduplication_key)
        values (target.id, new.id, notification_type, 'normal', 'Nouvelle demande dans ' || new.current_stage,
          'Nouvelle demande dans ' || new.current_stage || ' — #' || request_label,
          'STAGE_CHANGED:' || new.id::text || ':' || new.current_stage || ':' || target.id::text)
        on conflict (recipient_id, deduplication_key) do nothing;
      end if;
    end loop;
  end if;
  if new.status is distinct from old.status and new.status <> 'Resolved' then
    for target in select distinct a.* from public.agents a where a.id in (new.responsible_id, new.owner_id) and a.active
    loop
      insert into public.notifications(recipient_id, request_id, type, priority, title, body, deduplication_key)
      values (target.id, new.id, 'STATUS_CHANGED', 'normal', 'Statut modifié', '#' || request_label || ' est maintenant « ' || new.status || ' »',
        'STATUS_CHANGED:' || new.id::text || ':' || coalesce(new.updated_at::text, now()::text) || ':' || target.id::text)
      on conflict (recipient_id, deduplication_key) do nothing;
    end loop;
  end if;
  if new.next_action is distinct from old.next_action and nullif(trim(new.next_action), '') is not null and new.responsible_id is not null then
    insert into public.notifications(recipient_id, request_id, type, priority, title, body, deduplication_key)
    values (new.responsible_id, new.id, 'ACTION_REQUIRED', 'normal', 'Action requise', new.next_action,
      'ACTION_REQUIRED:' || new.id::text || ':' || md5(new.next_action) || ':' || new.responsible_id::text)
    on conflict (recipient_id, deduplication_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists demandes_notification_change on public.demandes;
create trigger demandes_notification_change after insert or update of responsible_id, current_stage, status, next_action on public.demandes for each row execute function public.notify_request_change();

create or replace function public.notify_operation_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare req public.demandes%rowtype; target_id uuid; author_role text;
begin
  if new.channel not in ('Internal', 'System') or new.author_id is null then return new; end if;
  select * into req from public.demandes where id = new.demande_id;
  select a.role into author_role from public.agents a where a.id = new.author_id;
  if coalesce(position('Opérations' in author_role) > 0, false) = false
    and coalesce((new.metadata->>'origin') = 'operations', false) = false then return new; end if;
  target_id := coalesce(req.owner_id, req.responsible_id);
  if target_id is not null and target_id is distinct from new.author_id then
    insert into public.notifications(recipient_id, request_id, type, priority, title, body, deduplication_key)
    values (target_id, req.id, 'NEW_OPERATION_REPLY', 'normal', 'Réponse des opérations', 'Les opérations ont répondu — #' || coalesce(nullif(req.tracking_number,''), left(req.id::text,8)), 'NEW_OPERATION_REPLY:' || new.id::text)
    on conflict (recipient_id, deduplication_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists demande_event_notify_operations on public.demande_events;
create trigger demande_event_notify_operations after insert on public.demande_events for each row execute function public.notify_operation_reply();
alter table public.demande_events add column if not exists author_id uuid references public.agents(id) on delete set null;
-- Older installations may have created the timeline without a channel field.
alter table public.demande_events add column if not exists channel text not null default 'Internal';
alter table public.demande_events add column if not exists metadata jsonb;
-- Event kinds and channels remain extensible across workflow revisions.
alter table public.demande_events drop constraint if exists demande_events_kind_check;
alter table public.demande_events drop constraint if exists demande_events_channel_check;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='demandes_initial_channel_check') then
    alter table public.demandes add constraint demandes_initial_channel_check check (initial_channel in ('WhatsApp', 'E-mail'));
  end if;
  if not exists (select 1 from pg_constraint where conname='demandes_current_stage_check') then
    alter table public.demandes add constraint demandes_current_stage_check check (current_stage in ('CS WhatsApp', 'CS E-mail', 'Opérations'));
  end if;
  if not exists (select 1 from pg_constraint where conname='demandes_status_check') then
    alter table public.demandes add constraint demandes_status_check check (status in ('Open', 'In progress', 'Waiting', 'Escalated', 'Resolved'));
  end if;
end $$;

-- Legacy actor was auth.users; author_name remains as the display snapshot.
-- Preserve existing timeline rows. The old author column is dropped below after
-- the new nullable agent reference has been added.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='demande_events' and column_name='author') then
    execute 'update public.demande_events set author_name = coalesce(author_name, ''Équipe CS'')';
    execute 'update public.demande_events e set author_id = a.id from public.agents a where a.user_id = e.author and e.author_id is null';
  end if;
end $$;

-- Preserve the original creator in the timeline before dropping legacy creator columns.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='demandes' and column_name='created_by_name') then
    execute $m$
      insert into public.demande_events (demande_id, author_id, author_name, channel, kind, content, created_at)
      select d.id, d.owner_id, coalesce(d.created_by_name, 'Import historique'), 'System', 'created',
        'Demande créée (historique).', d.created_at
      from public.demandes d
      where not exists (select 1 from public.demande_events e where e.demande_id=d.id and e.kind='created')
    $m$;
  end if;
end $$;

create index if not exists idx_demandes_due_active on public.demandes (customer_feedback_due_at) where status <> 'Resolved';
create index if not exists idx_demandes_stage_status on public.demandes (current_stage, status);
create index if not exists idx_demandes_responsible on public.demandes (responsible_id, status);
create index if not exists idx_demandes_owner on public.demandes (owner_id);
create index if not exists idx_demandes_tracking on public.demandes (tracking_number);
create index if not exists idx_events_dossier_time on public.demande_events (demande_id, created_at);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists demandes_touch_updated_at on public.demandes;
create trigger demandes_touch_updated_at before update on public.demandes for each row execute function public.touch_updated_at();
drop trigger if exists agents_touch_updated_at on public.agents;
create trigger agents_touch_updated_at before update on public.agents for each row execute function public.touch_updated_at();

create or replace function public.bump_demand_updated_at_from_event()
returns trigger language plpgsql as $$ begin update public.demandes set updated_at = now() where id = new.demande_id; return new; end $$;
drop trigger if exists demande_event_bump_updated_at on public.demande_events;
create trigger demande_event_bump_updated_at after insert on public.demande_events for each row execute function public.bump_demand_updated_at_from_event();

alter table public.agents enable row level security;
alter table public.demandes enable row level security;
alter table public.demande_events enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.webpush_subscriptions enable row level security;
drop policy if exists "Authenticated users read all queries" on public.demandes;
drop policy if exists "Authenticated users insert queries" on public.demandes;
drop policy if exists "Authenticated users update queries" on public.demandes;
drop policy if exists "Authenticated users delete queries" on public.demandes;
drop policy if exists agents_read on public.agents;
drop policy if exists agents_manage on public.agents;
drop policy if exists demandes_all_authenticated on public.demandes;
drop policy if exists events_all_authenticated on public.demande_events;
create policy agents_read on public.agents for select to authenticated using (true);
create policy agents_manage on public.agents for all to authenticated using (true) with check (true);
create policy demandes_all_authenticated on public.demandes for all to authenticated using (true) with check (true);
create policy events_all_authenticated on public.demande_events for all to authenticated using (true) with check (true);
drop policy if exists notifications_read_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_insert_own on public.notifications;
create policy notifications_read_own on public.notifications for select to authenticated using (exists (select 1 from public.agents a where a.id = recipient_id and a.user_id = auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated using (exists (select 1 from public.agents a where a.id = recipient_id and a.user_id = auth.uid())) with check (exists (select 1 from public.agents a where a.id = recipient_id and a.user_id = auth.uid()));
create policy notifications_insert_own on public.notifications for insert to authenticated with check (exists (select 1 from public.agents a where a.id = recipient_id and a.user_id = auth.uid()));
drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences for all to authenticated using (exists (select 1 from public.agents a where a.id = agent_id and a.user_id = auth.uid())) with check (exists (select 1 from public.agents a where a.id = agent_id and a.user_id = auth.uid()));
drop policy if exists webpush_subscriptions_own on public.webpush_subscriptions;
create policy webpush_subscriptions_own on public.webpush_subscriptions for all to authenticated using (exists (select 1 from public.agents a where a.id = agent_id and a.user_id = auth.uid())) with check (exists (select 1 from public.agents a where a.id = agent_id and a.user_id = auth.uid()));

-- Legacy duplicates are removed only after values have been copied to the new model.
alter table public.demandes drop column if exists client_ref;
alter table public.demandes drop column if exists objet;
alter table public.demandes drop column if exists situation;
alter table public.demandes drop column if exists channel;
alter table public.demandes drop column if exists follow_up_at;
alter table public.demandes drop column if exists last_update_at;
alter table public.demandes drop column if exists created_by;
alter table public.demandes drop column if exists created_by_name;
alter table public.demandes drop column if exists waiting_on;
alter table public.demande_events drop column if exists author;

-- Realtime publication may not exist or may already include one of these tables.
do $$ begin
  alter publication supabase_realtime add table public.demandes;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.demande_events;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.agents;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;
