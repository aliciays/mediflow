'use client';
import { useEffect } from 'react';
import { useUser } from '@/lib/useUser';
import { useRouter } from 'next/navigation';

export default function DashboardEntry() {
  const { user, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }

    const target =
      user.role === 'admin'            ? '/dashboard/admin' :
      user.role === 'project_manager'  ? '/dashboard/pm' :
      user.role === 'technician'       ? '/dashboard/tech' :
                                         '/dashboard/viewer';

    router.replace(target);
  }, [loading, user, router]);

  return <div className="p-4">Cargando tu dashboard…</div>;
}
