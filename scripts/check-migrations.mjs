#!/usr/bin/env node
/**
 * Local sanity check over supabase/migrations — no Supabase connection, no
 * credentials, nothing mutated. This is a CI-safe guard against filename
 * mistakes (duplicate version prefixes, malformed names, misordered
 * timestamps); it does NOT replace `npx supabase migration list`, which
 * stays the manual, authenticated way to verify local/remote alignment.
 *
 * Accepted filenames:
 *   - legacy short prefixes:  001_initial_schema.sql … 006_*.sql
 *   - timestamped migrations: 20260709093129_descriptive_name.sql
 *     (14-digit UTC timestamp from `supabase migration new`)
 */
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'supabase',
  'migrations',
);

const LEGACY_RE = /^(\d{3})_[a-z0-9_]+\.sql$/;
const TIMESTAMP_RE = /^(\d{14})_[a-z0-9_]+\.sql$/;

const errors = [];
// Sort explicitly — the CLI applies migrations in lexicographic version
// order, and readdir order is platform-dependent.
const files = readdirSync(migrationsDir)
  .filter((name) => !name.startsWith('.'))
  .sort();

const seenVersions = new Map();
for (const name of files) {
  const match = TIMESTAMP_RE.exec(name) ?? LEGACY_RE.exec(name);
  if (!match) {
    errors.push(
      `Unexpected migration filename "${name}" — use \`supabase migration new <descriptive_name>\` and keep the generated name.`,
    );
    continue;
  }
  const version = match[1];
  if (seenVersions.has(version)) {
    errors.push(
      `Duplicate migration version "${version}": "${seenVersions.get(version)}" and "${name}".`,
    );
  } else {
    seenVersions.set(version, name);
  }
}

if (files.length === 0) {
  errors.push(`No migrations found in ${migrationsDir}.`);
}

if (errors.length > 0) {
  console.error('Migration filename check FAILED:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Migration filename check passed (${files.length} migrations).`);
