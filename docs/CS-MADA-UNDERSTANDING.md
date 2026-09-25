# CS-MADA Workspace: Current System Understanding

**Review date:** 25 September 2026
**Scope:** Static review of the repository. No live Supabase connection or production rows were inspected.

## 1. Current architecture

- Single-page React 18 application built with Vite 5 and JavaScript ES modules.
- `src/main.jsx` mounts `App` under React StrictMode. There is no router, global state library, backend API, or server-side application layer.
- `src/App.jsx` owns authentication state, requests, agents, timeline events, notifications, filtering, mutation handlers, and realtime subscriptions. It directly calls Supabase JS.
- UI is split among `SpreadsheetGrid`, `DetailPanel`, `NewQueryModal`, `NotificationCenter`, `Login`, and small UI primitives. Styling is global CSS in `src/index.css`, `src/styles/base.css`, and design tokens.
- `public/sw.js` handles browser push display and click navigation. Push delivery is described as future server-side work; this repository has no Edge Function or other push sender.
- Configuration is through `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optionally `VITE_VAPID_PUBLIC_KEY`.

## 2. Current data model

The checked-in schema and migration define:

- `agents`: auth user link, name, one text `role`, optional primary contact channel, active flag.
- `demandes`: customer contact and query, tracking number, initial channel, `current_stage`, `status`, `owner_id`, `responsible_id`, customer feedback deadline, next action, and timestamps.
- `demande_events`: case-linked entries with author snapshot, optional agent, channel, free-form kind/content, JSON metadata, and timestamp.
- `notifications`, `notification_preferences`, `webpush_subscriptions`.

There are no first-class category, carrier, internal team, team membership, escalation, external handoff, operational response, or saved-view tables. `current_stage` partly encodes channel and destination, and status partly encodes wait/escalation state.

## 3. Current workflows

- Sign-in uses Supabase password authentication. The workspace loads all `demandes` and `agents` visible under RLS.
- New requests are inserted with stage inferred from channel. `owner_id` is set to the signed-in agent; `responsible_id` comes from the form or defaults to that agent.
- Users can edit status, stage, owner, responsible, customer-feedback due time, and next action directly in the detail panel. Stage changes are not escalation workflow actions and have no associated escalation record.
- Timeline entries are added from one generic composer with Internal, WhatsApp, or E-mail channel options. Their `kind` distinguishes a few system changes, but internal notes, customer updates, and operations responses are not consistently separate domain actions.
- A case may be deleted permanently from the UI, cascading its timeline and notifications.
- Customer deadline timers update in the browser every minute. The app upserts due/overdue notifications for the current agent and suppresses them for resolved cases.

## 4. Current UI

- Header search, new-request action, notification center, summary metrics, filters, sortable-by-deadline list, and selected-case side panel.
- Desktop case table shows deadline, customer/tracking, query, stage, owner, responsible, status, and activity. Small screens switch to cards and a full-screen detail panel.
- The current interface is an operational spreadsheet with a detail drawer, not a set of named actionable queues. Search omits explicit category/carrier/external-reference fields because those fields do not exist.

## 5. Current permissions

- Sign-in is required by the UI.
- Schema enables RLS, but `agents_manage`, `demandes_all_authenticated`, and `events_all_authenticated` grant all authenticated users broad read/write access. The client does not implement team-scoped roles or authorization checks.
- Notification, preference, and push-subscription policies are scoped to the agent linked to `auth.uid()`.
- No database policy distinguishes CS-MADA, MADA-OPS, or admin privileges. There is correctly no SEZ-OPS account model, but external handoff is also not modeled.

## 6. Current realtime behavior

- One Supabase Realtime channel listens for notification inserts/updates, all `demandes` changes, agent changes, and timeline inserts for the currently selected case.
- Changes to requests merge by `updated_at`; selecting a case triggers an ordered timeline reload.
- Database triggers bump `demandes.updated_at` when an event is inserted. The app removes deleted rows and surfaces a toast on channel failure.
- Realtime publication membership is not declared in the reviewed SQL; the deployed Supabase publication configuration must be checked before relying on these subscriptions.

## 7. Current notification system

- SQL triggers generate notifications for new requests, assignment/stage/status changes, next-action changes, and operations replies inferred from role text or event metadata.
- The browser subscribes to the current agent's notification rows and supports unread/read state, preferences, optional sound/browser notifications, and service-worker registration.
- Due and overdue notifications are generated client-side only while an authenticated agent is active in the app. There is no scheduled server job in this repository, so an offline workspace cannot guarantee deadline notifications.
- Push subscription capture exists; a delivery function is absent.

## 8. Existing problems against the target operating model

- `owner_id` and `responsible_id` approximate Case Owner and Current Assignee, but Current Team is conflated with `current_stage` and role/channel text.
- The database has no category or carrier dimension, which prevents the required routing and reporting.
- Escalation is a mutable stage/status change; it has no durable record of tier, handoff, assignee, deadlines, response, return, or repeated escalation history.
- Tier 2 external destination, external status, and internal follow-up owner cannot be represented.
- Generic activity entry does not reliably distinguish internal notes, operations responses, external responses, and customer communication.
- Status values omit Waiting on Customer, Waiting on Operations, Waiting on External Operations, and Closed as separate lifecycle states.
- Role text and primary channel cannot model a person belonging to multiple internal teams or configurable routing pools.
- Broad authenticated-user RLS does not meet the requested database-level role enforcement.
- Some legacy fields are dropped by the current checked-in migration after copying values; this migration is not evidence that production data has been inspected.

## 9. Proposed domain model

See [CS-MADA-DOMAIN.md](./CS-MADA-DOMAIN.md). The target keeps customer relationship owner, internal team, internal assignee, escalation tier, external destination, and internal external-follow-up owner separate. `case_escalations` stores every escalation instance. `case_events` stores append-only audit entries with actor/team snapshots and typed metadata. Routing and memberships are persisted as configuration. SEZ-OPS remains an external destination string/reference, never an application team or user.

## 10. Migration strategy

Use an additive, staged migration rather than a destructive rename or table replacement:

1. Before production DDL, take/verify a recoverable backup and inspect actual table definitions, constraints, triggers, policies, publication membership, row counts, and representative data for `demandes`, `agents`, `demande_events`, notification tables, auth links, and any legacy columns.
2. Add internal `teams`, `team_memberships`, category/carrier reference data, `routing_rules`, escalation, and typed event structures. Add new case fields alongside legacy columns first.
3. Backfill from `demandes`: preserve UUIDs and created/updated/resolved times; map `owner_id` to case owner; map `responsible_id` to current assignee; infer only the internal team where unambiguous from `current_stage` and agent role/channel; map existing feedback deadline to customer-update deadline; map channel and query/contact fields directly.
4. Treat historical `Escalated`/`Opérations` rows as legacy operational state. Create a marked legacy escalation snapshot only where evidence supports it; do not invent tier, carrier, destination, due time, or response. Preserve every existing `demande_events` row and its original timestamp, author snapshot, content, and metadata.
5. Create validation queries and compare source/destination case and event counts, IDs, and key fields before switching reads/writes. Keep compatibility views or dual-write only for a bounded rollout if required.
6. Move mutations to database functions or similarly enforceable transactions that update case state, create escalation/event records, and enqueue notifications atomically. Add restrictive role/team RLS and append-only event policies only after mapping real auth users to internal agents and memberships.
7. Switch the UI after backfill and policy verification. Retain old tables/columns until rollback and reconciliation windows close; then remove legacy fields in a separate reviewed migration.

The live Supabase data, auth roster, deployed policies, and publication configuration are not available from this repository review. Those facts must be checked before choosing a production backfill or applying schema changes.

## 11. UX architecture

- Queue navigation around My Work, New, CS-MADA, Waiting on Customer, MADA-OPS, Tier 1 Escalations, External / SEZ-OPS, Customer Updates Due, Overdue, Resolved, and Closed.
- Case list rows expose priority, reference, customer, channel, category, carrier, current team, tier, assignee, external state, status, next customer-update deadline, and last activity.
- Case detail begins with customer and query, then an ownership strip (Case Owner, Current Team, Current Assignee), independent customer/operations/external deadlines, explicit escalation panels, next action, typed composers, and immutable timeline.
- Tier 2 presents SEZ-OPS as external destination and a separate required internal follow-up owner. No SEZ-OPS login, queue, or assignment selector.
- Use deliberate escalation/return/response actions; do not make workflow transitions a free-form stage edit.

## 12. Risks and open verification items

- Existing production rows may use legacy columns or unexpected enum values not represented by the checked-in SQL.
- Agent names, role strings, channel ownership, and auth UUID links require operational confirmation before seeded routing rules or memberships are backfilled.
- Multiple historical handoffs cannot be reconstructed from only the current stage/status; event text may provide partial evidence but should remain explicitly uncertain.
- Tightening RLS before every user has a valid internal membership could lock out legitimate users; leaving current policies in place would fail the target security model.
- Browser-only deadline notifications are not dependable while users are offline; a scheduled server-side notifier is needed for production guarantees.
- Concurrent updates and realtime events can race; transactional server-side workflow functions and idempotent event/notification keys are needed.
- Time display currently relies on browser locale/timezone. The target should explicitly use canonical timestamptz storage and named Madagascar/Seychelles display zones.

## 13. Work completed in this repository pass

- Added this current-system review and the target domain model in `docs/CS-MADA-DOMAIN.md`.
- Added an additive lifecycle migration that retains the legacy tables, backfills separated owner/assignee/team/status/deadline fields, and introduces internal teams, membership, category/carrier catalogs, routing-rule storage, escalation records, typed customer updates, external-response records, and read-only internal access to the new records.
- Added category, carrier, and priority intake/detail controls plus list columns, category/carrier filters, and case-reference display.
- Added transactional RPCs for Tier 1 escalation/return, Tier 2 external handoff/response/completion, customer updates, resolution, and reopening. Added panel actions, escalation history, typed lifecycle timeline events, and internal notifications for handoff/response ownership changes.
- Built the Vite production bundle successfully.

This remains a staged cutover. The current app still reads legacy case and generic timeline tables for its main queue; the new workflow actions depend on applying the lifecycle migration. Configurable routing administration, a complete named-queue navigation, full role-scoped access on legacy case tables, immutable event enforcement for privileged database owners, scheduled deadline notifications, deployment data reconciliation, and the requested automated workflow scenarios remain before production adoption. The migration has not been applied. Do not apply it until the live-schema/data/auth checks above are complete.
