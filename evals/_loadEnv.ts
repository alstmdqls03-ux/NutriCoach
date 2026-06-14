import { readFileSync } from 'node:fs';

/**
 * Minimal .env.local loader for standalone tsx scripts (Next loads it for the
 * app, but a bare `tsx evals/*.ts` process does not). Only sets keys that are
 * not already in process.env. No dependency on dotenv.
 */
export function loadEnvLocal(): void {
  let txt: string;
  try {
    txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  } catch {
    return; // no .env.local — rely on the ambient environment
  }
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key]) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
