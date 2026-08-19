-- ============================================================
-- Suivi des demandes clients — schéma minimal
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller > Run
-- ============================================================

create table demandes (
  id uuid primary key default gen_random_uuid(),

  client_ref text not null,          -- nom ou téléphone client : retrouver le dossier en cas de rappel
  objet text not null,               -- sujet en une ligne

  situation text not null,           -- état actuel du dossier (réécrit à chaque mise à jour, pas d'historique)
  waiting_on text not null check (waiting_on in ('nous','client','departement')),
  departement text,                  -- rempli uniquement si waiting_on = 'departement'

  created_by uuid not null references auth.users(id),
  created_by_name text not null,     -- copié depuis le profil agent à la création (évite une jointure)

  created_at timestamptz not null default now(),
  last_update_at timestamptz not null default now(),
  resolved_at timestamptz            -- null = en cours ; rempli = traité
);

-- last_update_at se met à jour automatiquement à chaque modification,
-- aucun code applicatif n'a besoin d'y penser.
create or replace function set_last_update_at()
returns trigger as $$
begin
  new.last_update_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_demandes_last_update
before update on demandes
for each row
execute function set_last_update_at();

-- Sécurité : les 4 agents authentifiés peuvent tout lire/écrire (vision partagée),
-- personne d'autre n'a accès.
alter table demandes enable row level security;

create policy "Agents authentifiés lisent tout"
on demandes for select
to authenticated
using (true);

create policy "Agents authentifiés créent"
on demandes for insert
to authenticated
with check (true);

create policy "Agents authentifiés modifient"
on demandes for update
to authenticated
using (true);

create policy "Agents authentifiés suppriment"
on demandes for delete
to authenticated
using (true);

-- Index utile pour la recherche par client au rappel
create index idx_demandes_client_ref on demandes using gin (to_tsvector('french', client_ref));

-- ============================================================
-- Après avoir exécuté ce script :
-- 1. Aller dans Database > Replication > activer "demandes" pour le Realtime.
-- 2. Aller dans Authentication > Users > créer les 4 comptes agents (email + mot de passe).
--    Pour chacun, dans "User Metadata" (édition du user), ajouter :
--      { "name": "Prénom Nom" }
--    Ce nom est celui qui apparaîtra comme agent traitant dans l'application.
-- ============================================================
