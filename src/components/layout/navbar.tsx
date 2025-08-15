'use client';
import { useUser } from '@/lib/useUser';

export default function Navbar() {
  const { user, loading } = useUser();

  return (
    <header className="w-full h-14 border-b flex items-center justify-between px-4">
      <div className="font-semibold">MediFlow</div>

      <div className="flex items-center gap-3">
        {loading ? (
          <span className="text-sm opacity-70">Cargando…</span>
        ) : user ? (
          <>
            <span className="text-sm">{user.email}</span>
            <span className="text-xs px-2 py-1 rounded-full border">
              {user.role}
            </span>
          </>
        ) : (
          <span className="text-sm">No autenticado</span>
        )}
      </div>
    </header>
  );
}
