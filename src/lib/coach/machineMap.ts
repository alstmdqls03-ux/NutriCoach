export type AliasMap = Record<string, string>; // alias -> exercise id

/** Canonical match key: trimmed, internal whitespace collapsed, lowercased. */
export function normalizeMachineName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Global seed. Expand from the founder's machine-mapping probe (spec: The Assignment).
// Every value is a real free-exercise-db id, verified against the vendored JSON.
export const DEFAULT_MACHINE_ALIASES: AliasMap = {
  // Korean aliases
  '펙덱': 'Butterfly',
  '체스트프레스': 'Machine_Bench_Press',
  '랫풀다운': 'Wide-Grip_Lat_Pulldown',
  '시티드로우': 'Seated_Cable_Rows',
  '레그프레스': 'Leg_Press',
  '레그익스텐션': 'Leg_Extensions',
  '레그컬': 'Lying_Leg_Curls',
  '숄더프레스': 'Leverage_Shoulder_Press',
  // Popular machines by body part (English names; ids verified against free-exercise-db)
  'Chest Press': 'Machine_Bench_Press',
  'Pec Deck': 'Butterfly',
  'Cable Crossover': 'Cable_Crossover',
  'Lat Pulldown': 'Wide-Grip_Lat_Pulldown',
  'Seated Cable Row': 'Seated_Cable_Rows',
  'T-Bar Row': 'Lying_T-Bar_Row',
  'Iso Row': 'Leverage_Iso_Row',
  'Shoulder Press': 'Leverage_Shoulder_Press',
  'Reverse Pec Deck': 'Reverse_Machine_Flyes',
  'Lateral Raise Machine': 'Cable_Seated_Lateral_Raise',
  'Bicep Curl Machine': 'Machine_Bicep_Curl',
  'Preacher Curl': 'Machine_Preacher_Curls',
  'Tricep Extension Machine': 'Machine_Triceps_Extension',
  'Dip Machine': 'Dip_Machine',
  'Leg Press': 'Leg_Press',
  'Leg Extension': 'Leg_Extensions',
  'Hack Squat': 'Hack_Squat',
  'Lying Leg Curl': 'Lying_Leg_Curls',
  'Seated Leg Curl': 'Seated_Leg_Curl',
  'Cable Kickback': 'One-Legged_Cable_Kickback',
  'Seated Calf Raise': 'Seated_Calf_Raise',
  'Calf Press': 'Calf_Press',
  'Ab Crunch Machine': 'Ab_Crunch_Machine',
  'Cable Crunch': 'Cable_Crunch',
};

/**
 * Resolve a raw machine name to an exercise id, or null if unmapped.
 * Aliases are matched on the normalized key. null is a signal to the caller to
 * surface a "미매핑" note — never substitute a machine the user doesn't have.
 */
export function resolveMachine(name: string, aliases: AliasMap = DEFAULT_MACHINE_ALIASES): string | null {
  const want = normalizeMachineName(name);
  for (const [alias, id] of Object.entries(aliases)) {
    if (normalizeMachineName(alias) === want) return id;
  }
  return null;
}
