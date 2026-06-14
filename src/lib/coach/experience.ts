import type { Experience } from './types';

/** Map the onboarding activity level to a routine experience default. */
export function experienceFromActivity(activity: string | null | undefined): Experience {
  switch (activity) {
    case 'very': return 'advanced';
    case 'moderate': return 'intermediate';
    default: return 'beginner'; // 'start', 'light', null/undefined
  }
}
