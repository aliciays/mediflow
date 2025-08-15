'use client';
import RequireRole from '@/components/auth/RequireRole';

export default function ViewerDashboard() {
  return (
    <RequireRole allowed={['admin','viewer','project_manager','technician']}>
      <div className="p-4">
        <h1 className="text-xl font-semibold">Dashboard — Viewer</h1>
        <p>Vista de solo lectura.</p>
      </div>
    </RequireRole>
  );
}
