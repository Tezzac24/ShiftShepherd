import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const NAME = '20260917110331_add_announcement_push_delivery.sql';
const FOUNDATION = '20260710234443_add_push_delivery_foundation.sql';

function text(path: string): string {
  return readFileSync(path, 'utf8');
}

// Static SQL contract checks only: they pin the migration text that will be
// deployed, not a live PostgreSQL execution of it.
describe('announcement push delivery migration contract', () => {
  const migration = text(join(MIGRATIONS, NAME));
  const normalized = migration.toLowerCase();

  it('stays immediately before the rota push delivery migration and preserves all 34 earlier migrations byte-for-byte', () => {
    const files = readdirSync(MIGRATIONS).filter((file) => file.endsWith('.sql')).sort();
    expect(files).toHaveLength(36);
    expect(files.at(-1)).toBe('20260917124856_add_rota_push_delivery.sql');
    expect(files.at(-2)).toBe(NAME);
    expect(files.at(-3)).toBe('20260917093926_add_team_creation_idempotency.sql');
    const historical = files.filter((file) => file < NAME);
    const hash = createHash('sha256');
    for (const file of historical) {
      hash.update(file);
      hash.update('\0');
      hash.update(text(join(MIGRATIONS, file)));
      hash.update('\0');
    }
    expect(historical).toHaveLength(34);
    expect(hash.digest('hex').toUpperCase()).toBe(
      '0A358A16451AA2DCB2DBD3DF3BD826A419A442A78661B836456371420409F017',
    );
  });

  it('runs as one transaction', () => {
    expect(normalized.trim().startsWith('-- ====')).toBe(true);
    expect(normalized).toMatch(/\nbegin;\n/);
    expect(normalized.trim().endsWith('commit;')).toBe(true);
  });

  it('widens the ledger event_type check to exactly chat_message and announcement', () => {
    expect(normalized).toContain(
      'alter table public.push_notification_deliveries\n  drop constraint push_notification_deliveries_event_type_check;',
    );
    expect(normalized).toContain(
      "alter table public.push_notification_deliveries\n  add constraint push_notification_deliveries_event_type_check\n  check (event_type in ('chat_message', 'announcement'));",
    );
    // No other event kinds are opened up ahead of their delivery slices.
    expect(normalized).not.toMatch(/'(event|rota|availability|rota_update|event_reminder)'/);
    // The idempotency arbiter and the status check are untouched.
    expect(normalized).not.toContain('idempotency_idx');
    expect(normalized).not.toContain('status_check');
    expect(normalized).not.toMatch(/drop index|create (unique )?index/);
  });

  it('grants only read access on announcements and organisations, and only to service_role', () => {
    expect(normalized).toContain('grant select on table public.announcements to service_role;');
    expect(normalized).toContain('grant select on table public.organisations to service_role;');
    const grants = normalized.match(/^grant .*$/gm) ?? [];
    expect(grants).toHaveLength(2);
    for (const grant of grants) {
      expect(grant).toMatch(/^grant select on table public\.(announcements|organisations) to service_role;$/);
    }
    expect(normalized).not.toMatch(/to (anon|authenticated|public)\b/);
    expect(normalized).not.toMatch(/grant (insert|update|delete|all)/);
  });

  it('adds no functions, policies, triggers, RLS changes, or data mutations', () => {
    expect(normalized).not.toMatch(/create (or replace )?function/);
    expect(normalized).not.toMatch(/create policy|drop policy|alter policy/);
    expect(normalized).not.toMatch(/create trigger|drop trigger/);
    expect(normalized).not.toMatch(/row level security/);
    expect(normalized).not.toMatch(/security definer/);
    expect(normalized).not.toMatch(/^(insert into|update|delete from) /m);
    expect(normalized).not.toMatch(/\bdrop (table|column)\b/);
    // Only the ledger table is altered; every other table is read-only here.
    const altered = normalized.match(/alter table public\.\w+/g) ?? [];
    expect(new Set(altered)).toEqual(new Set(['alter table public.push_notification_deliveries']));
  });

  it('builds on the unchanged delivery foundation (ledger, idempotency index, service-role boundary)', () => {
    const foundation = text(join(MIGRATIONS, FOUNDATION)).toLowerCase();
    expect(foundation).toContain("check (event_type in ('chat_message'))");
    expect(foundation).toContain(
      'create unique index push_notification_deliveries_idempotency_idx\n  on public.push_notification_deliveries\n    (event_type, event_id, recipient_user_id, push_token_id)\n  nulls not distinct;',
    );
    expect(foundation).toContain(
      'revoke all on table public.push_notification_deliveries from authenticated;',
    );
    expect(foundation).toContain(
      'grant select, insert, update on table public.push_notification_deliveries to service_role;',
    );
  });
});
