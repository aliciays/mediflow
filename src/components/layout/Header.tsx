'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useUser } from '@/lib/useUser';
import { getNavByRole } from '@/lib/nav';
import { usePathname, useRouter } from 'next/navigation';
import { getAuth, signOut } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

// 👇 añade esta import
import AlertsBell from '@/components/alerts/AlertsBell';

export default function Header() {
  const { user } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const auth = getAuth();

  const isAuthed = !!user;
  const role = ((user as any)?.role || '') as 'admin'|'project_manager'|'technician'|'viewer'|'';

  // Nombre
  const displayName =
    (user as any)?.displayName ||
    (user as any)?.name ||
    (role === 'project_manager' ? 'Laura García'
      : role === 'admin' ? 'Admin'
      : role === 'technician' ? 'Técnico'
      : 'Usuario');

  // Avatar
  const avatarSrc =
    (user as any)?.photoURL ||
    (role === 'project_manager' ? '/avatars/laura.jpg'
      : role === 'admin' ? '/avatars/admin.jpg'
      : role === 'technician' ? '/avatars/tech.jpg'
      : role === 'viewer' ? '/avatars/viewer.jpg'
      : '/avatars/default.jpg');

  // Nav links según rol (solo si hay sesión)
  const nav = isAuthed ? getNavByRole(role === '' ? null : role) : [];

  // Dropdown
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const onLogout = async () => {
    await signOut(auth);
    router.replace('/');
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image src="/mediflow-logo.png" alt="MediFlow" width={28} height={28} className="h-7 w-7" priority />
          <span className="text-sm font-semibold tracking-wide text-slate-900">MediFlow</span>
        </Link>

        {/* Nav (desktop) */}
        {isAuthed && (
          <nav className="hidden md:flex items-center gap-2">
            {nav.map(({ href, label }) => {
              const active = pathname?.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    'rounded-xl px-3 py-2 text-sm transition',
                    active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Derecha: campana + usuario */}
        <div className="relative flex items-center gap-2" ref={ref}>
          {isAuthed && (
            // 👇 Campana global (muestra alertas de todos los proyectos).
            // Para campana solo del proyecto actual, usa scope="project" y pasa projectId.
            <AlertsBell scope="global" uid={user?.uid || ''} role={role} />
          )}

          {!isAuthed ? (
            <Link
              href="/login"
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Iniciar sesión
            </Link>
          ) : (
            <>
              <button
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 px-2.5 py-1.5 hover:bg-slate-50"
              >
                <span className="hidden text-sm text-slate-700 sm:block">{displayName}</span>
                <Image src={avatarSrc} alt={displayName} width={32} height={32} className="h-8 w-8 rounded-full ring-1 ring-slate-200 object-cover" />
                <svg className={`h-4 w-4 text-slate-500 transition ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.11l3.71-3.88a.75.75 0 111.08 1.04l-4.24 4.44a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" />
                </svg>
              </button>

              {open && (
                <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-2xl border bg-white shadow-lg">
                  <Link href="/settings" className="block px-3 py-2 text-sm hover:bg-slate-50" onClick={() => setOpen(false)}>
                    Settings
                  </Link>
                  <button onClick={onLogout} className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                    Cerrar sesión
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Nav (móvil) */}
      {isAuthed && (
        <div className="md:hidden border-t bg-white">
          <div className="mx-auto flex gap-2 overflow-x-auto px-4 py-2">
            {nav.map(({ href, label }) => {
              const active = pathname?.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    'whitespace-nowrap rounded-xl px-3 py-1.5 text-sm',
                    active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
