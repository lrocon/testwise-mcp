import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Config } from './types.js';

function resolveEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_, key: string) => process.env[key] ?? '');
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVars);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, resolveEnvVars(v)])
    );
  }
  return obj;
}

export function loadConfig(): Config {
  const configPath = resolve(process.cwd(), 'testwise.config.json');
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return resolveEnvVars(parsed) as Config;
  } catch (err) {
    throw new Error(`Falha ao carregar testwise.config.json: ${(err as Error).message}`);
  }
}
