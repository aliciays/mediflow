// src/lib/nav.ts
import type { Role } from '@/lib/useUser';

export function getNavByRole(role: Role | null | undefined) {
  if (role === 'project_manager') {
    return [
      { label: 'Inicio',     href: '/dashboard/pm' },
      { label: 'Tareas',     href: '/tasks' },     // PM ve TODAS las tareas
      { label: 'Analytics',  href: '/analytics' },
      { label: 'Reportes',   href: '/reports' },
    ];
  }
  if (role === 'admin') {
    return [
      { label: 'Inicio',     href: '/dashboard/admin' },
      { label: 'Mis tareas', href: '/my-tasks' },  // Admin ve SOLO sus tareas
      { label: 'Reportes',   href: '/reports' },
    ];
  }
  if (role === 'technician') {
    return [
      { label: 'General',    href: '/dashboard/tech' },
      { label: 'Mis tareas', href: '/my-tasks' },  // Tech ve SOLO sus tareas
    ];
  }
  return [{ label: 'Inicio', href: '/' }];
}
