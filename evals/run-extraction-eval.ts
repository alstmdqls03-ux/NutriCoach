import { readFileSync } from 'node:fs';
import { getLLM } from '../src/lib/llm';
import { toolDefinitions } from '../src/lib/tools/definitions';

interface Case { text: string; expect: Record<string, unknown> & { tool: string } }

function coreFieldsMatch(expected: Record<string, unknown>, got: Record<string, unknown>): boolean {
  // For log_workout: exercise (substring ok), weight_kg, reps, sets must match.
  const keys = Object.keys(expected).filter((k) => k !== 'tool');
  return keys.every((k) => {
    if (k === 'exercise') {
      return String(got.exercise ?? '').includes(String(expected.exercise)) ||
             String(expected.exercise).includes(String(got.exercise ?? ''));
    }
    if (['bed_time', 'wake_time'].includes(k)) {
      return String(got[k] ?? '').includes(String(expected[k])); // time-of-day substring
    }
    return got[k] === expected[k];
  });
}

async function main() {
  const cases: Case[] = JSON.parse(readFileSync(new URL('./extraction-utterances.json', import.meta.url), 'utf8'));
  const llm = getLLM();
  let pass = 0;
  for (const c of cases) {
    const res = await llm.chat(
      [{ role: 'system', content: '운동/수면이면 적절한 tool을 호출하라. 조회 요청이면 query_logs.' },
       { role: 'user', content: c.text }],
      toolDefinitions,
    );
    const call = res.toolCalls[0];
    const ok = !!call && call.name === c.expect.tool && coreFieldsMatch(c.expect, call.arguments);
    if (ok) pass++;
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${c.text} -> ${call?.name ?? 'none'}`);
  }
  const rate = pass / cases.length;
  console.log(`\nAccuracy: ${pass}/${cases.length} = ${(rate * 100).toFixed(1)}%`);
  if (rate < 0.9) { console.error('BELOW 90% GATE'); process.exit(1); }
}
main();
