'use client';
import { usePathname, useRouter } from 'next/navigation';

const TABS = [{ href: '/log', label: '기록' }, { href: '/coach', label: '코치' }];

// Token-with-fallback: dark + lime under .bloom-theme (e.g. /coach); the light
// fallbacks preserve the current look on un-themed pages (e.g. /log).
export default function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <nav style={{
      display: 'flex', maxWidth: 600, margin: '0 auto', position: 'sticky', bottom: 0,
      borderTop: '1px solid var(--hair, #eee)',
      background: 'color-mix(in srgb, var(--bg, #ffffff) 86%, transparent)',
      backdropFilter: 'blur(18px) saturate(150%)', WebkitBackdropFilter: 'blur(18px) saturate(150%)',
    }}>
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <button key={t.href} onClick={() => router.push(t.href)} style={{
            flex: 1, padding: 16, border: 'none', background: 'none', cursor: 'pointer', fontSize: 14,
            fontWeight: active ? 700 : 500,
            color: active ? 'var(--accent, #0070f3)' : 'var(--text-2, #666)', letterSpacing: 0.1,
          }}>{t.label}</button>
        );
      })}
    </nav>
  );
}
