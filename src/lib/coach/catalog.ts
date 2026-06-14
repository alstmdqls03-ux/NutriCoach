// Curated machine catalog for the visual picker. `label` is a DEFAULT_MACHINE_ALIASES
// key (so resolveMachine maps it); `id` is the free-exercise-db id (for the image).
export interface CatalogMachine { id: string; label: string; bodyPart: string; }

export const MACHINE_CATALOG: CatalogMachine[] = [
  { bodyPart: '가슴', label: 'Chest Press', id: 'Machine_Bench_Press' },
  { bodyPart: '가슴', label: 'Pec Deck', id: 'Butterfly' },
  { bodyPart: '가슴', label: 'Cable Crossover', id: 'Cable_Crossover' },
  { bodyPart: '등', label: 'Lat Pulldown', id: 'Wide-Grip_Lat_Pulldown' },
  { bodyPart: '등', label: 'Seated Cable Row', id: 'Seated_Cable_Rows' },
  { bodyPart: '등', label: 'T-Bar Row', id: 'Lying_T-Bar_Row' },
  { bodyPart: '등', label: 'Iso Row', id: 'Leverage_Iso_Row' },
  { bodyPart: '어깨', label: 'Shoulder Press', id: 'Leverage_Shoulder_Press' },
  { bodyPart: '어깨', label: 'Reverse Pec Deck', id: 'Reverse_Machine_Flyes' },
  { bodyPart: '어깨', label: 'Lateral Raise Machine', id: 'Cable_Seated_Lateral_Raise' },
  { bodyPart: '팔', label: 'Bicep Curl Machine', id: 'Machine_Bicep_Curl' },
  { bodyPart: '팔', label: 'Preacher Curl', id: 'Machine_Preacher_Curls' },
  { bodyPart: '팔', label: 'Tricep Extension Machine', id: 'Machine_Triceps_Extension' },
  { bodyPart: '팔', label: 'Dip Machine', id: 'Dip_Machine' },
  { bodyPart: '하체', label: 'Leg Press', id: 'Leg_Press' },
  { bodyPart: '하체', label: 'Leg Extension', id: 'Leg_Extensions' },
  { bodyPart: '하체', label: 'Hack Squat', id: 'Hack_Squat' },
  { bodyPart: '하체', label: 'Lying Leg Curl', id: 'Lying_Leg_Curls' },
  { bodyPart: '하체', label: 'Seated Leg Curl', id: 'Seated_Leg_Curl' },
  { bodyPart: '둔근·종아리', label: 'Cable Kickback', id: 'One-Legged_Cable_Kickback' },
  { bodyPart: '둔근·종아리', label: 'Seated Calf Raise', id: 'Seated_Calf_Raise' },
  { bodyPart: '둔근·종아리', label: 'Calf Press', id: 'Calf_Press' },
  { bodyPart: '코어', label: 'Ab Crunch Machine', id: 'Ab_Crunch_Machine' },
  { bodyPart: '코어', label: 'Cable Crunch', id: 'Cable_Crunch' },
];

const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
export function machineImageUrl(id: string): string {
  return `${IMG_BASE}/${id}/0.jpg`;
}

/** Catalog grouped by body part, in catalog order. */
export function catalogByBodyPart(): { bodyPart: string; machines: CatalogMachine[] }[] {
  const groups: { bodyPart: string; machines: CatalogMachine[] }[] = [];
  for (const m of MACHINE_CATALOG) {
    let g = groups.find((x) => x.bodyPart === m.bodyPart);
    if (!g) { g = { bodyPart: m.bodyPart, machines: [] }; groups.push(g); }
    g.machines.push(m);
  }
  return groups;
}
