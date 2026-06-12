'use client';
import { usePathname, useRouter } from 'next/navigation';

const TABS = [{ href: '/log', label: '기록' }, { href: '/coach', label: '코치' }];

export default function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <nav style={{
      display: 'flex', maxWidth: 600, margin: '0 auto',
      borderTop: '1px solid #eee', position: 'sticky', bottom: 0, background: '#fff',
    }}>
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <button key={t.href} onClick={() => router.push(t.href)}
            style={{
              flex: 1, padding: 14, border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 15, fontWeight: active ? 700 : 400, color: active ? '#0070f3' : '#666',
            }}>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
