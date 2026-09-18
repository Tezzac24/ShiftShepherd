import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const NAME = '20260917124856_add_rota_push_delivery.sql';
const ACCEPTANCE_FIX = '20260917180127_fix_invitation_acceptance_role_conflict_target.sql';
const CHAT_READ_FIX = '20260917223118_fix_chat_read_cursor_conflict_target.sql';
const ANNOUNCEMENT_PUSH = '20260917110331_add_announcement_push_delivery.sql';
const FOUNDATION = '20260710234443_add_push_delivery_foundation.sql';

function text(path: string): string {
  return readFileSync(path, 'utf8');
}

function functionSql(sql: string, name: string): string {
  const marker = new RegExp(`create(?: or replace)? function public\\.${name}\\b`, 'i');
  const match = marker.exec(sql);
  if (!match) throw new Error(`Missing function ${name}`);
  const end = sql.indexOf('\n$$;', match.index);
  if (end < 0) throw new Error(`Unterminated function ${name}`);
  return sql.slice(match.index, end + 4).toLowerCase();
}

// Static SQL contract checks only: they pin the migration text that will be
// deployed, not a live PostgreSQL execution of it.
describe('rota push delivery migration contract', () => {
  const migration = text(join(MIGRATIONS, NAME));
  const normalized = migration.toLowerCase();
  const tracker = functionSql(migration, 'track_rota_entry_details_change');

  it('stays immediately before the invitation acceptance fix and preserves all 35 earlier migrations byte-for-byte', () => {
    const files = readdirSync(MIGRATIONS).filter((file) => file.endsWith('.sql')).sort();
    expect(files).toHaveLength(38);
    expect(files.at(-1)).toBe(CHAT_READ_FIX);
    expect(files.at(-2)).toBe(ACCEPTANCE_FIX);
    expect(files.at(-3)).toBe(NAME);
    expect(files.at(-4)).toBe(ANNOUNCEMENT_PUSH);
    const historical = files.filter((file) => file < NAME);
    const hash = createHash('sha256');
    for (const file of historical) {
      hash.update(file);
      hash.update('\0');
      hash.update(text(join(MIGRATIONS, file)));
      hash.update('\0');
    }
    expect(historical).toHaveLength(35);
    expect(hash.digest('hex').toUpperCase()).toBe(
      'D3FCE9E49C59060C33142FC0A31A06A1E60B604750131062F692668016902046',
    );
  });

  it('runs as one transaction', () => {
    expect(normalized.trim().startsWith('-- ====')).toBe(true);
    expect(normalized).toMatch(/\nbegin;\n/);
    expect(normalized.trim().endsWith('commit;')).toBe(true);
  });

  it('adds a nullable, paired change marker to rota_entries without touching existing rows', () => {
    expect(normalized).toContain(
      'alter table public.rota_entries\n  add column details_change_id uuid,\n  add column details_changed_at timestamptz;',
    );
    // Nullable, no default, no backfill: existing entries keep null markers.
    expect(normalized).not.toMatch(/details_change(_id|d_at)\s+\w+\s+(not null|default)/);
    expect(normalized).toContain(
      'add constraint rota_entries_details_change_marker_check\n  check ((details_change_id is null) = (details_changed_at is null));',
    );
    expect(normalized).not.toMatch(/^(insert into|update|delete from) /m);
  });

  it('maintains the marker in an invoker trigger that clients can neither forge nor replay', () => {
    expect(tracker).toContain('returns trigger');
    expect(tracker).toContain('language plpgsql');
    expect(tracker).toContain("set search_path = ''");
    // Rewrites NEW only: no table access, so it needs no definer rights.
    expect(tracker).not.toContain('security definer');
    expect(tracker).not.toMatch(/\b(from|join|into)\s+public\./);
    // Insert always starts with no marker, whatever the client sent.
    expect(tracker).toMatch(
      /if tg_op = 'insert' then\s+new\.details_change_id := null;\s+new\.details_changed_at := null;/,
    );
    // Exactly the member-visible details (and cancellation status) count.
    expect(tracker).toContain(
      'elsif (new.title, new.date, new.time, new.notes, new.status)\n        is distinct from (old.title, old.date, old.time, old.notes, old.status) then',
    );
    expect(tracker).toMatch(
      /new\.details_change_id := gen_random_uuid\(\);\s+new\.details_changed_at := now\(\);/,
    );
    // Any other update keeps the previous marker, so a client-supplied value is discarded.
    expect(tracker).toMatch(
      /else\s+new\.details_change_id := old\.details_change_id;\s+new\.details_changed_at := old\.details_changed_at;/,
    );
    expect(normalized).toContain(
      'revoke all on function public.track_rota_entry_details_change()\n  from public, anon, authenticated;',
    );
    // Fires for every insert/update (not only when detail columns are named),
    // so a marker-only update is normalised too.
    expect(normalized).toContain(
      'create trigger rota_entries_track_details_change\n  before insert or update on public.rota_entries\n  for each row execute function public.track_rota_entry_details_change();',
    );
    expect(normalized.match(/create trigger/g)).toHaveLength(1);
    expect(normalized.match(/create (or replace )?function/g)).toHaveLength(1);
  });

  it('widens the ledger event_type check to exactly the chat, announcement, and two rota kinds', () => {
    expect(normalized).toContain(
      'alter table public.push_notification_deliveries\n  drop constraint push_notification_deliveries_event_type_check;',
    );
    expect(normalized).toContain(
      "alter table public.push_notification_deliveries\n  add constraint push_notification_deliveries_event_type_check\n  check (event_type in ('chat_message', 'announcement', 'rota_assignment', 'rota_entry_change'));",
    );
    // Events and availability reminders are not opened up.
    expect(normalized).not.toMatch(/'(event|event_reminder|availability|availability_reminder)'/);
    // The idempotency arbiter and the status check are untouched.
    expect(normalized).not.toContain('idempotency_idx');
    expect(normalized).not.toContain('status_check');
    expect(normalized).not.toMatch(/drop index|create (unique )?index/);
  });

  it('grants only read access on rota entries and assignments, and only to service_role', () => {
    expect(normalized).toContain('grant select on table public.rota_entries to service_role;');
    expect(normalized).toContain('grant select on table public.rota_assignments to service_role;');
    const grants = normalized.match(/^grant .*$/gm) ?? [];
    expect(grants).toHaveLength(2);
    for (const grant of grants) {
      expect(grant).toMatch(
        /^grant select on table public\.(rota_entries|rota_assignments) to service_role;$/,
      );
    }
    expect(normalized).not.toMatch(/^grant .* to (anon|authenticated|public)\b/m);
    expect(normalized).not.toMatch(/grant (insert|update|delete|all)/);
    expect(normalized).not.toContain('availability_responses');
  });

  it('adds no policies, RLS changes, definer functions, dropped objects, or other altered tables', () => {
    expect(normalized).not.toMatch(/create policy|drop policy|alter policy/);
    expect(normalized).not.toMatch(/row level security/);
    expect(normalized).not.toMatch(/security definer/);
    expect(normalized).not.toMatch(/drop trigger|drop function/);
    expect(normalized).not.toMatch(/\bdrop (table|column)\b/);
    expect(normalized).not.toMatch(/pg_net|pg_cron|net\.http/);
    const altered = normalized.match(/alter table public\.\w+/g) ?? [];
    expect(new Set(altered)).toEqual(
      new Set(['alter table public.rota_entries', 'alter table public.push_notification_deliveries']),
    );
  });

  it('builds on the unchanged delivery foundation and announcement widening', () => {
    const foundation = text(join(MIGRATIONS, FOUNDATION)).toLowerCase();
    expect(foundation).toContain(
      'create unique index push_notification_deliveries_idempotency_idx\n  on public.push_notification_deliveries\n    (event_type, event_id, recipient_user_id, push_token_id)\n  nulls not distinct;',
    );
    expect(foundation).toContain(
      'revoke all on table public.push_notification_deliveries from authenticated;',
    );
    const announcement = text(join(MIGRATIONS, ANNOUNCEMENT_PUSH)).toLowerCase();
    expect(announcement).toContain("check (event_type in ('chat_message', 'announcement'));");
  });
});
