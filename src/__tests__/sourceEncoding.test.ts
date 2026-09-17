/**
 * Guards user-facing copy against mis-encoded text. A UTF-8 file that was
 * once re-read as Windows-1252 and saved again turns "’" into "â€™" and "…"
 * into "â€¦"; the replacement character U+FFFD marks bytes that were dropped.
 * None of these may appear in app source or in the Edge Functions, whose
 * strings reach people directly.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { ORGANISATION_MEMBERSHIP_OFFLINE_ERROR } from '../lib/supabase/services/organisationMemberships';

const ROOT = join(__dirname, '..', '..');
const SCAN_ROOTS = [join(ROOT, 'src'), join(ROOT, 'supabase', 'functions')];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
// "â€" (start of â€™ / â€¦ / â€œ / â€), "Ã" followed by a symbol byte, U+FFFD.
const MOJIBAKE = /â€|Ã[-¿’“”…˜œ]|�/;

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (SOURCE_EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
      files.push(full);
    }
  }
  return files;
}

describe('source encoding', () => {
  it('contains no mojibake or replacement characters in app or Edge Function source', () => {
    const offenders: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of listSourceFiles(root)) {
        if (file === __filename) continue;
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, index) => {
          if (MOJIBAKE.test(line)) offenders.push(`${relative(ROOT, file)}:${index + 1}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the membership fallback copy as intended UTF-8 punctuation', () => {
    expect(ORGANISATION_MEMBERSHIP_OFFLINE_ERROR).toBe(
      'We couldn’t reach the server. Please check your connection and try again.',
    );
    expect(ORGANISATION_MEMBERSHIP_OFFLINE_ERROR).not.toMatch(MOJIBAKE);
  });
});
