export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type BodyPart = 'upper' | 'lower';
export type LoadEstimate = 'light' | 'moderate' | 'heavy';

/** A free-exercise-db record, slimmed to what the engine needs. */
export interface ExerciseRecord {
  id: string;               // e.g. 'Leg_Press'
  name: string;             // e.g. 'Leg Press'
  primaryMuscles: string[]; // e.g. ['quadriceps']
  secondaryMuscles: string[];
  equipment: string | null; // e.g. 'machine'
  bodyPart: BodyPart;       // derived from primaryMuscles
}

export interface RoutineExercise {
  exerciseId: string;
  name: string;
  sets: number;
  repRange: [number, number];
}

export interface ComputedRoutine {
  targetMuscle: string;          // the Korean term the user entered
  exercises: RoutineExercise[];  // every entry's machine is in the user's list
}

/** Most recent logged session for one exercise (uniform reps per set, per logs schema). */
export interface SessionLog {
  weight_kg: number;
  reps: number;   // reps achieved per set
  sets: number;
}

export type ProgressionBasis = 'progressed' | 'hold' | 'deload' | 'cold-start';

export interface Prescription {
  exerciseId: string;
  weight_kg: number | null;  // null only for cold-start (no history)
  sets: number;
  repTarget: number;         // reps to aim for this session
  basis: ProgressionBasis;
  note: string;              // Korean one-liner, code-authored (never cited)
}

export interface ComputedProgression {
  prescriptions: Prescription[];
}

/** Citations live here in Plan 2; ships as [] in Plan 1. */
export interface Explanation {
  claim: string;
  chunk_ids: string[];
}

export interface MachineMiss {
  input: string;  // the raw machine name the user typed that didn't map
}

export interface CoachResponse {
  routine: ComputedRoutine;
  progression: ComputedProgression;
  explanations: Explanation[];  // [] in Plan 1
  misses: MachineMiss[];        // unmapped machine names, surfaced not dropped
}

export interface CoachInput {
  machines: string[];      // raw machine names as the user types them
  targetMuscle: string;    // Korean term, e.g. '가슴'
  experience: Experience;
  estimate?: LoadEstimate; // used only for cold-start exercises
}
