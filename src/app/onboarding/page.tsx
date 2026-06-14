import './bloom.css';
import { Hanken_Grotesk } from 'next/font/google';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

// Variable font — supports the design's 400–800 weights (incl. 750).
const hanken = Hanken_Grotesk({ subsets: ['latin'], display: 'swap' });

export default function OnboardingPage() {
  return (
    <div className={`bloom ${hanken.className}`} style={{ fontFamily: hanken.style.fontFamily }}>
      <div className="bloom-screen">
        <OnboardingFlow />
      </div>
    </div>
  );
}
