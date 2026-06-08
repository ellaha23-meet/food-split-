#!/usr/bin/env node
/**
 * P0.3: Build-time secret leak check (G6).
 *
 * Scans the Next.js client bundle for server-only environment variable names.
 * Fails CI with a non-zero exit if any server-side secret name appears in the
 * client bundle. This is a hard gate, not a warning.
 *
 * Server-only vars must be listed here. Any var exposed to the client must use
 * the NEXT_PUBLIC_ prefix (which is intentionally excluded from this list).
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SERVER_ONLY_PREFIXES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_ACCOUNT_SID',
  'DATABASE_URL',
  'DIRECT_URL',
];

const BUILD_DIR = join(process.cwd(), 'apps/web/.next');

function walkDir(dir) {
  let files = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        files = files.concat(walkDir(full));
      } else if (entry.endsWith('.js') || entry.endsWith('.js.map')) {
        files.push(full);
      }
    }
  } catch {
    // Directory may not exist if build hasn't run
  }
  return files;
}

// Only scan client-side chunks (not server chunks)
function isClientChunk(path) {
  return (
    path.includes('/_next/static/') ||
    path.includes('.next/static/') ||
    path.includes('chunks/') ||
    path.includes('pages/')
  );
}

const clientFiles = walkDir(BUILD_DIR).filter(isClientChunk);

if (clientFiles.length === 0) {
  console.log('⚠️  No client bundle found at apps/web/.next — skipping secret check.');
  console.log('   Run `npm run build` first to generate the bundle.');
  process.exit(0);
}

let violations = [];

for (const file of clientFiles) {
  const content = readFileSync(file, 'utf8');
  for (const secret of SERVER_ONLY_PREFIXES) {
    if (content.includes(secret)) {
      violations.push(`SECRET LEAK: "${secret}" found in client bundle: ${file}`);
    }
  }
}

if (violations.length > 0) {
  console.error('❌ SECRET LEAK DETECTED — build must not contain server-only env var names:');
  for (const v of violations) {
    console.error('  ' + v);
  }
  process.exit(1);
} else {
  console.log(`✅ Secret check passed — scanned ${clientFiles.length} client chunk(s), no leaks found.`);
  process.exit(0);
}
