// components/alerts/AlertsDrawer.tsx
'use client';

import { Alert, ackAlertLocal, snoozeAlertLocal } from '@/lib/alerts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  alerts: Alert[];
  onChanged?: () => void;
};

const sevCls: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  warning:  'bg-amber-100 text-amber-800 border-amber-200',
  info:     'bg-slate-100 text-slate-700 border-slate-200',
};

export default function AlertsDrawer({ open, onClose, alerts, onChanged }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Alert[]>(alerts);


  useEffect(() => {
    if (!open) return;
    setItems(alerts);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [open, alerts]);

  if (!open) return null;

  const removeItem = (key: string) => setItems(prev => prev.filter(a => a.key !== key));

  const handleAck = (k: string) => {
    ackAlertLocal(k);
    removeItem(k);
    onChanged?.();
  };

  const handleSnooze = (k: string, days: number) => {
    const until = new Date(); until.setDate(until.getDate() + days);
    snoozeAlertLocal(k, until);
    removeItem(k);
    onChanged?.();
  };

  const handleOpen = (url: string) => {
    router.push(url);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[999] flex">

      <div className="flex-1 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />

  
      <div className="h-screen w-[560px] max-w-[85vw] bg-white shadow-2xl border-l flex flex-col">

        <div className="shrink-0 flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">Alertas</h3>
          <button onClick={onClose} className="text-slate-600 hover:bg-slate-100 rounded px-2 py-1">
            Cerrar
          </button>
        </div>


        <div className="grow overflow-y-auto p-4">
          {items.length === 0 && (
            <div className="text-sm text-slate-500 px-2 py-8 text-center">Sin alertas abiertas 🎉</div>
          )}

          <div className="space-y-3 pb-8">
            {items.map(a => (
              <div key={a.key} className={`rounded border p-3 ${sevCls[a.severity]}`}>
                <div className="text-sm font-medium">{a.title}</div>
                <div className="text-xs opacity-80">{a.message}</div>
                <div className="mt-1 text-xs opacity-70">
                  Proyecto: <span className="font-medium">{a.projectName}</span>
                  {a.dueAt && <> · Vence: {new Date(a.dueAt).toLocaleDateString('es-ES')}</>}
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded bg-blue-600 text-white text-xs px-2 py-1 hover:bg-blue-700"
                    onClick={() => handleOpen(a.entityUrl)}
                  >
                    Abrir
                  </button>
                  <button
                    type="button"
                    className="rounded border text-xs px-2 py-1 hover:bg-slate-50"
                    onClick={() => handleAck(a.key)}
                  >
                    Reconocer
                  </button>
                  <button
                    type="button"
                    className="rounded border text-xs px-2 py-1 hover:bg-slate-50"
                    onClick={() => handleSnooze(a.key, 3)}
                  >
                    Posponer 3 días
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
