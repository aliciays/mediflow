'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useUser } from '@/lib/useUser';

export default function Header() {
  const { user } = useUser();

  // Nombre a mostrar (ajusta a tus campos reales si usas otro)
  const displayName =
    (user as any)?.displayName ||
    (user as any)?.name ||
    ((user as any)?.role === 'project_manager' ? 'Laura García'
      : (user as any)?.role === 'admin' ? 'Admin'
      : (user as any)?.role === 'technician' ? 'Técnico'
      : 'Usuario');

  // Avatar (si no existe el archivo, de momento no pasa nada; lo añadimos luego)
  const avatarSrc =
    (user as any)?.photoURL ||
    ((user as any)?.role === 'project_manager' ? '/avatars/laura.jpg'
      : (user as any)?.role === 'admin' ? '/avatars/admin.jpg'
      : (user as any)?.role === 'technician' ? '/avatars/tech.jpg'
      : '/avatars/default.jpg');

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        {/* Logo + marca */}
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/mediflow-logo.svg"
            alt="MediFlow"
            width={28}
            height={28}
            className="h-7 w-7"
            priority
          />
          <span className="text-sm font-semibold tracking-wide text-slate-900">
            MediFlow
          </span>
        </Link>

        {/* Perfil (nombre + avatar) */}
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-700 sm:block">{displayName}</span>
          <Image
            src={avatarSrc}
            alt={displayName}
            width={32}
            height={32}
            className="h-8 w-8 rounded-full ring-1 ring-slate-200 object-cover"
          />
        </div>
      </div>
    </header>
  );
}
