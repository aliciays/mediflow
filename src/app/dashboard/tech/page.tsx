'use client';
import RequireRole from '@/components/auth/RequireRole';

export default function TechDashboard() {
  return (
    <RequireRole allowed={['admin','technician']}>
      <div className="p-4">
        <h1 className="text-xl font-semibold">Dashboard — Técnico</h1>
        <p>Mis tareas y actualizaciones rápidas.</p>
      </div>
    </RequireRole>
  );
}
