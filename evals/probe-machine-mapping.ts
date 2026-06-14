/**
 * Probe 1 — Machine-mapping coverage (spec: The Assignment, P2).
 *
 * Reads your real gym's machine names from evals/gym-machines.txt (one per line,
 * `#` comments allowed), runs each through the SAME resolveMachine the app uses,
 * and reports how many map cleanly vs. need a Korean alias. If >15-20% miss,
 * expanding DEFAULT_MACHINE_ALIASES (or registering aliases in-app) is the first
 * real build for the RAG layer, not an afterthought.
 *
 * Run:  npm run probe:mapping
 */
import { readFileSync } from 'node:fs';
import { resolveMachine } from '../src/lib/coach/machineMap';
import { loadExercises, getExerciseById } from '../src/lib/coach/exercises';

function readLines(path: string): string[] {
  let txt: string;
  try {
    txt = readFileSync(new URL(path, import.meta.url), 'utf8');
  } catch {
    console.error(`Could not read ${path}. Fill it with your gym's machine names, one per line.`);
    process.exit(1);
  }
  return txt
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function main() {
  const machines = readLines('./gym-machines.txt');
  if (machines.length === 0) {
    console.error('No machines listed in evals/gym-machines.txt (every line was blank or a comment).');
    process.exit(1);
  }
  const dataset = loadExercises();

  const mapped: { name: string; id: string; exercise: string }[] = [];
  const missed: string[] = [];

  for (const name of machines) {
    const id = resolveMachine(name);
    if (id) {
      const rec = getExerciseById(dataset, id);
      mapped.push({ name, id, exercise: rec?.name ?? '(id not in dataset!)' });
    } else {
      missed.push(name);
    }
  }

  console.log('\n=== Machine-mapping coverage ===\n');
  console.log('MAPPED:');
  for (const m of mapped) console.log(`  ✅ ${m.name}  ->  ${m.id}  (${m.exercise})`);
  console.log('\nMISSED (need a Korean alias):');
  for (const name of missed) console.log(`  ❌ ${name}`);

  const total = machines.length;
  const missPct = (missed.length / total) * 100;
  console.log(`\nTotal: ${total}   Mapped: ${mapped.length}   Missed: ${missed.length}   Miss rate: ${missPct.toFixed(0)}%`);

  if (missPct > 20) {
    console.log('\n⚠️  >20% miss — the machine-mapping layer is the first real build. Expand the alias seed or register aliases in-app before relying on the RAG demo.');
  } else if (missPct > 0) {
    console.log('\n→ Some misses. Add the missed names to DEFAULT_MACHINE_ALIASES (src/lib/coach/machineMap.ts) or register them in-app (별칭 등록).');
  } else {
    console.log('\n✅ Full coverage for this list.');
  }
}

main();
