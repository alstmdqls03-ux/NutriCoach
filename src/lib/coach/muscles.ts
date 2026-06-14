// Korean target term -> free-exercise-db primaryMuscle values.
// Values MUST exist in the dataset's muscle vocabulary (see Task 2 verify step).
const TARGET_MUSCLE_ALIASES: Record<string, string[]> = {
  '가슴': ['chest'],
  '등': ['lats', 'middle back', 'lower back', 'traps'],
  '어깨': ['shoulders'],
  '이두': ['biceps'],
  '삼두': ['triceps'],
  '팔': ['biceps', 'triceps', 'forearms'],
  '하체': ['quadriceps', 'hamstrings', 'glutes', 'calves'],
  '다리': ['quadriceps', 'hamstrings', 'glutes', 'calves'],
  '허벅지': ['quadriceps', 'hamstrings'],
  '둔근': ['glutes'],
  '엉덩이': ['glutes'],
  '햄스트링': ['hamstrings'],
  '종아리': ['calves'],
  '복근': ['abdominals'],
  '코어': ['abdominals'],
};

/** Korean target term -> list of dataset muscle names. [] when unrecognized. */
export function resolveTargetMuscle(korean: string): string[] {
  const key = korean.trim().replace(/\s+/g, ' ');
  return TARGET_MUSCLE_ALIASES[key] ?? [];
}
