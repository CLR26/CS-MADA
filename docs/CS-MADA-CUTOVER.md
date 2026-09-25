# CS-MADA Lifecycle Cutover

## Current rollout state

- Production branch: `main` (Cloudflare Pages).
- The user confirmed that `202609250001_lifecycle_domain.sql` has been applied. This confirmation has not been independently checked against Supabase.
- `202609260001_lifecycle_cutover.sql` is the follow-up migration. The application checks for `routing_rule_assignees` before enabling its new RPC write path, so publishing the app first leaves the current workspace behavior in place until this migration is applied.
- No production Supabase connection, Cloudflare deployment status, or local Supabase CLI/`psql` was available during this change.

## Apply and verify

1. Publish the application commit to `main` and confirm the Cloudflare Pages deployment completes.
2. In the Supabase SQL editor for the production project, review and apply `supabase/migrations/202609260001_lifecycle_cutover.sql` after `202609250001_lifecycle_domain.sql`.
3. Review `agents`, `team_memberships`, and `routing_rule_assignees`. The migration seeds channel owners by the configured primary channel (preferring Rojo/Fania by name) and Tier 1 pools by name, with active internal-member fallbacks so a route remains actionable. Confirm these choices match the live roster.
4. Grant `agents.is_admin = true` to the intended internal administrator from a trusted database session. The application intentionally cannot grant itself admin rights. Routing rules, rule assignees, team memberships, categories, and carriers are then protected by admin RLS and can be maintained in Supabase.
5. Run `supabase/tests/lifecycle_scenarios.sql` against a disposable/staging project after applying migrations. It opens a transaction and rolls back its test cases. The project needs active auth-linked CS-MADA and MADA-OPS agents and non-empty carrier routing pools.
6. Verify live realtime case updates and that at least one customer deadline produces an `OVERDUE` notification while the browser is closed. The migration schedules pg_cron when available; authenticated internal sessions also invoke the same deduplicated server-side function every five minutes.

## Rollback notes

The follow-up migration preserves the `demandes` and `demande_events` tables and all existing rows. Its direct client write revocation is paired with SECURITY DEFINER RPCs used by the updated application. If rolling back the app, restore authenticated insert/update permissions and the earlier legacy RLS policies before relying on the previous client. Do not drop lifecycle tables or case columns as part of an app rollback.

## Important boundary

SEZ-OPS remains only the external destination stored on a Tier 2 escalation. `team_memberships` and routing pools contain internal CS-MADA/MADA-OPS users only. Every external handoff keeps an internal follow-up owner.
