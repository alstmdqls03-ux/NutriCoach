// Bloom line icons (24px grid, currentColor), reproduced from the design handoff.
import type { ReactNode } from 'react';

function Svg({ size, children, vb = 24 }: { size: number; children: ReactNode; vb?: number }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} fill="none"
      xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      {children}
    </svg>
  );
}
const S = {
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const, fill: 'none',
};

type IP = { size?: number };

export const IconBack = ({ size = 24 }: IP) => <Svg size={size}><path d="M15 5l-7 7 7 7" {...S} /></Svg>;
export const IconCheck = ({ size = 24 }: IP) => <Svg size={size}><path d="M5 12.5l4.5 4.5L19 7" {...S} /></Svg>;
export const IconArrow = ({ size = 24 }: IP) => <Svg size={size}><g {...S}><path d="M5 12h13" /><path d="M12 6l6 6-6 6" /></g></Svg>;
export const IconMail = ({ size = 24 }: IP) => <Svg size={size}><g {...S}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 7.5l8 5 8-5" /></g></Svg>;
export const IconFlame = ({ size = 24 }: IP) => <Svg size={size}><path d="M12 3c1 3 4 4 4 8a4 4 0 01-8 0c0-1.2.4-2 1-2.8C8.6 9.8 9 11 10.2 11 9 8.5 10.5 5.5 12 3z" {...S} /></Svg>;
export const IconDumbbell = ({ size = 24 }: IP) => <Svg size={size}><g {...S}><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" /></g></Svg>;
export const IconHeart = ({ size = 24 }: IP) => <Svg size={size}><g {...S}><path d="M12 20s-7-4.6-7-9.4A3.6 3.6 0 0112 7.5a3.6 3.6 0 017 3.1C19 15.4 12 20 12 20z" /><path d="M5 12.5h3l1.5-3 2 5 1.5-2h4" /></g></Svg>;
export const IconWind = ({ size = 24 }: IP) => <Svg size={size}><g {...S}><path d="M3 8h9a2.5 2.5 0 10-2.5-2.5" /><path d="M3 12h13a2.5 2.5 0 11-2.5 2.5" /><path d="M3 16h7" /></g></Svg>;
export const IconLeaf = ({ size = 24 }: IP) => <Svg size={size}><g {...S}><path d="M5 19c0-7 5-12 14-13-1 9-6 14-13 13z" /><path d="M9 16c2-3 4-5 7-6.5" /></g></Svg>;
export const IconBowl = ({ size = 24 }: IP) => <Svg size={size}><g {...S}><path d="M4 11h16a8 8 0 01-16 0z" /><path d="M9 7c0-1 .8-2 1.5-2.5M13 7c0-1.2 1-2 2-2.5" /></g></Svg>;
export const IconBell = ({ size = 24 }: IP) => <Svg size={size}><g {...S}><path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 004 0" /></g></Svg>;

export const IconApple = ({ size = 22 }: IP) => (
  <Svg size={size}>
    <path d="M16.4 12.8c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.7 2.3-1.6 2.8-.4 6.9 1.1 9.2.8 1.1 1.6 2.3 2.8 2.3 1.1 0 1.5-.7 2.9-.7 1.3 0 1.7.7 2.9.7 1.2 0 1.9-1.1 2.7-2.2.8-1.2 1.2-2.4 1.2-2.5-.1 0-2.3-.9-2.3-3.4zM14.1 6c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.7-.9 2.7 1 .1 2-.5 2.6-1.2z" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconGoogle = ({ size = 20 }: IP) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
    <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#E6E1D7" />
    <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0012 22z" fill="#9E988C" />
    <path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 000 9.2L6.4 14z" fill="#6E695F" />
    <path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.9 14.7 2 12 2A10 10 0 003.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1z" fill="#C8C2B6" />
  </svg>
);

export const IconBloomMark = ({ size = 56 }: IP) => (
  <Svg size={size}>
    <path d="M12 21c5-3 8-6.5 8-10.5A4.2 4.2 0 0012 7a4.2 4.2 0 00-8 3.5C4 14.5 7 18 12 21z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M5.5 12.5H9l1.6-3.2 2.2 6 1.6-2.8H19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
