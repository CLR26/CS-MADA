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

-- Carry forward values from the former model without deleting any requests.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='demandes' and column_name='channel') then
    execute 'update public.demandes set initial_channel = case when channel = ''E-mail'' then ''E-mail'' else ''WhatsApp'' end where initial_channel is null or initial_channel = ''WhatsApp''';
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
end $$;

update public.demandes set customer_name = coalesce(customer_name, 'Client inconnu'), query = coalesce(query, 'Demande historique') where customer_name is null or query is null;
update public.demandes set current_stage = 'CS E-mail' where initial_channel = 'E-mail' and current_stage = 'CS WhatsApp';
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
where not exists (select 1 from public.agents a where a.name = seed.name);

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
alter table public.demande_events add column if not exists author_id uuid references public.agents(id) on delete set null;
alter table public.demande_events add column if not exists metadata jsonb;

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

-- Legacy duplicates are removed only after values have been copied to the new model.
alter table public.demandes drop column if exists client_ref;
alter table public.demandes drop column if exists objet;
alter table public.demandes drop column if exists situation;
alter table public.demandes drop column if exists channel;
alter table public.demandes drop column if exists follow_up_at;
alter table public.demandes drop column if exists last_update_at;
alter table public.demandes drop column if exists created_by;
alter table public.demandes drop column if exists created_by_name;
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
