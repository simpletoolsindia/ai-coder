import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { dynamicImport, clearImportCache } from '../../src/core/utils/import.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ai-by-dynimport-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  clearImportCache();
});

describe('dynamicImport', () => {
  it('imports a file by absolute path', async () => {
    const target = join(dir, 'mod.js');
    await fs.writeFile(target, 'export const value = 42;');
    const mod = (await dynamicImport(target, 'test')) as { value: number };
    expect(mod.value).toBe(42);
  });

  it('caches modules', async () => {
    const target = join(dir, 'mod.js');
    await fs.writeFile(target, 'export const v = 1;');
    const a = await dynamicImport(target, 'a');
    const b = await dynamicImport(target, 'a');
    expect(a).toBe(b);
  });

  it('throws for missing file', async () => {
    await expect(dynamicImport(join(dir, 'missing.js'), 'x')).rejects.toThrow();
  });
});
