'use client';

import { ReactNode } from 'react';
import { useUser, Role } from '@/lib/useUser';

type Props = {
  allowed: Role[];
  children: ReactNode;
};

export default function RequireRole({ allowed, children }: Props) {
  const { user, loading } = useUser();

  if (loading) {
    return (
      <div className="p-4 text-sm text-gray-500">
        Cargando…
      </div>
    );
  }

  // No logueado
  if (!user) {
    return (
      <div className="p-4 text-red-600">
        Debes iniciar sesión.
      </div>
    );
  }

  // Rol no permitido
  if (!allowed.includes(user.role)) {
    return (
      <div className="p-4 text-red-600">
        No tienes permisos para ver esta página. (Tu rol: {user.role})
      </div>
    );
  }

  return <>{children}</>;
}
