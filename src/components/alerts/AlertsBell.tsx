// components/alerts/AlertsBell.tsx
'use client';

import { useState } from 'react';
import { Role, useAlerts } from '@/lib/alerts';
import AlertsDrawer from './AlertsDrawer';

type Props = {
  scope: 'project'|'global';
  projectId?: string;
  uid: string;
  role: Role;
};

export default function AlertsBell({ scope, projectId, uid, role }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { alerts, loading, critical } = useAlerts(scope, { projectId, uid, role, refreshKey });
  const [open, setOpen] = useState(false);

  if (role === 'viewer') return null;
  const total = alerts.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative rounded-full p-2 hover:bg-slate-100"
        title="Ver alertas"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-700" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a6 6 0 00-6 6v2.586l-.707.707A1 1 0 006 14h12a1 1 0 00.707-1.707L18 10.586V8a6 6 0 00-6-6z" />
          <path d="M8 16a4 4 0 008 0H8z" />
        </svg>
        {!loading && total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-slate-700 text-white text-[10px] flex items-center justify-center">
            {total}
          </span>
        )}
        {!loading && critical > 0 && (
          <span className="absolute -top-1 right-4 h-2 w-2 rounded-full bg-red-600" />
        )}
      </button>

      <AlertsDrawer
        open={open}
        onClose={() => setOpen(false)}
        alerts={alerts}
        onChanged={() => setRefreshKey(k => k + 1)}  
      />
    </>
  );
}
