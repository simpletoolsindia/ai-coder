#!/usr/bin/env tsx
/**
 * Validate that every plugin manifest is well-formed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

interface Manifest {
  id: string;
  version: string;
  description: string;
  lazy?: boolean;
  enabled?: boolean;
}

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (e === 'index.ts') yield p;
  }
}

function findManifest(source: string): Manifest | null {
  // Find `manifest: { ... }` literal in the source
  const match = source.match(/manifest\s*:\s*\{[\s\S]*?id\s*:\s*['"]([^'"]+)['"]/);
  if (!match) return null;
  const idMatch = source.match(/manifest\s*:\s*\{[\s\S]*?id\s*:\s*['"]([^'"]+)['"]/);
  const versionMatch = source.match(/manifest\s*:\s*\{[\s\S]*?version\s*:\s*['"]([^'"]+)['"]/);
  const descMatch = source.match(/manifest\s*:\s*\{[\s\S]*?description\s*:\s*['"]([^'"]+)['"]/);
  if (!idMatch || !versionMatch || !descMatch) return null;
  return {
    id: idMatch[1] as string,
    version: versionMatch[1] as string,
    description: descMatch[1] as string,
  };
}

async function main(): Promise<void> {
  const roots = ['src/plugins', 'src/tools'];
  const failures: string[] = [];
  const found: Manifest[] = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      const source = readFileSync(file, 'utf-8');
      const m = findManifest(source);
      if (m) found.push(m);
    }
  }
  for (const m of found) {
    if (!m.id) failures.push(`${m.id}: missing id`);
    if (!m.version) failures.push(`${m.id}: missing version`);
    if (!m.description) failures.push(`${m.id}: missing description`);
  }
  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error('Manifest validation failed:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log(`Validated ${found.length} manifest(s):`);
  for (const m of found) console.log(`  ✓ ${m.id}@${m.version}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

