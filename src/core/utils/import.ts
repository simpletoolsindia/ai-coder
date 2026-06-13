import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

const cache = new Map<string, unknown>();

export async function dynamicImport(specifier: string, pluginId: string): Promise<unknown> {
  const resolved = resolveSpecifier(specifier, pluginId);
  if (cache.has(resolved)) return cache.get(resolved);
  const mod = await import(pathToFileURL(resolved).href);
  cache.set(resolved, mod);
  return mod;
}

export function clearImportCache(): void {
  cache.clear();
}

function resolveSpecifier(specifier: string, pluginId: string): string {
  if (isAbsolute(specifier)) {
    if (!existsSync(specifier)) {
      throw new Error(`Plugin "${pluginId}" entry not found: ${specifier}`);
    }
    return specifier;
  }
  // Try relative to CWD
  const fromCwd = resolve(process.cwd(), specifier);
  if (existsSync(fromCwd)) return fromCwd;
  // Try relative to the standard plugins directory
  const fromPlugins = resolve(process.cwd(), 'src', 'plugins', pluginId, 'index.ts');
  if (existsSync(fromPlugins)) return fromPlugins;
  const fromPluginsJs = resolve(process.cwd(), 'src', 'plugins', pluginId, 'index.js');
  if (existsSync(fromPluginsJs)) return fromPluginsJs;
  throw new Error(`Plugin "${pluginId}" entry could not be resolved: ${specifier}`);
}
