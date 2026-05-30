'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/store/use-session-store';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useSessionStore((s) => s.token);

  useEffect(() => {
    if (!token) {
      router.replace('/login');
    }
  }, [token, router]);

  if (!token) return null;

  return <>{children}</>;
}
