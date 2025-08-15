'use client';
import RequireRole from '@/components/auth/RequireRole';

export default function AdminDashboard() {
  return (
    <RequireRole allowed={['admin']}>
      <div className="p-4">
        <h1 className="text-xl font-semibold">Dashboard — Admin</h1>
        <p>Gestión del sistema y usuarios.</p>
      </div>
    </RequireRole>
  );
}
