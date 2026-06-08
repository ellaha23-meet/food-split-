/**
 * Schema lint: assert no money column in the migration uses FLOAT, DOUBLE, or NUMERIC/DECIMAL.
 * G1 — Money is integer cents. This test fails CI if someone accidentally adds a float column.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const MIGRATION_DIR = join(__dirname, '../../../supabase/migrations');

function readMigrations(): string {
  const fs = require('fs') as typeof import('fs');
  const files = fs.readdirSync(MIGRATION_DIR).filter((f: string) => f.endsWith('.sql'));
  return files.map((f: string) => readFileSync(join(MIGRATION_DIR, f), 'utf8')).join('\n');
}

describe('Schema lint (G1)', () => {
  it('no money column uses FLOAT, DOUBLE PRECISION, NUMERIC, or DECIMAL', () => {
    const sql = readMigrations();

    // Extract column definitions that contain money-related names
    const moneyColumnPattern =
      /(\w*(?:cents|amount|price|total|subtotal|tab|tip|tax|discount|service)\w*)\s+(\w+)/gi;

    const violations: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = moneyColumnPattern.exec(sql)) !== null) {
      const colName = match[1] ?? '';
      const colType = (match[2] ?? '').toUpperCase();
      if (['FLOAT', 'REAL', 'DOUBLE', 'NUMERIC', 'DECIMAL', 'MONEY'].includes(colType)) {
        violations.push(`Column "${colName}" has type ${colType} — must be INTEGER (G1)`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('all tables have RLS enabled in migrations', () => {
    const sql = readMigrations();
    const tables = [
      'host_account',
      'saved_diner',
      'session',
      'line_item',
      'participant',
      'claim',
      'settlement',
      'meal_history',
    ];

    const rlsPattern = /alter table (\w+)\s+enable row level security/gi;
    const rlsTables = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = rlsPattern.exec(sql)) !== null) {
      rlsTables.add((match[1] ?? '').toLowerCase());
    }

    for (const table of tables) {
      expect(rlsTables.has(table), `Table "${table}" must have RLS enabled`).toBe(true);
    }
  });
});
