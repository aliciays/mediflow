'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  addDoc, collection, doc, getDocs, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';

type UserLite = { uid: string; displayName?: string; email?: string; role?: string };

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  phaseId: string;
  taskId: string;
  // modo edición (si viene subtaskId, cargamos valores iniciales por props)
  initial?: { id?: string; name?: string; status?: string; assignedTo?: string; dueDate?: string };
  onSaved?: () => void;
};

const STATUS = [
  { value: 'todo',        label: 'Pendiente' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'completed',   label: 'Completada' },
] as const;

export default function SubtaskModal({
  open, onClose, projectId, phaseId, taskId, initial, onSaved,
}: Props) {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(initial?.name || '');
  const [status, setStatus] = useState<string>(initial?.status || 'todo');
  const [assignee, setAssignee] = useState<string>(initial?.assignedTo || '');
  const [dueDate, setDueDate] = useState<string>(initial?.dueDate || '');

  useEffect(() => {
    if (!open) return;
    setName(initial?.name || '');
    setStatus(initial?.status || 'todo');
    setAssignee(initial?.assignedTo || '');
    setDueDate(initial?.dueDate || '');
    (async () => {
      const snap = await getDocs(collection(db, 'users'));
      setUsers(
        snap.docs.map(d => {
          const u = d.data() as any;
          return { uid: d.id, displayName: u.displayName || u.email || d.id, role: u.role };
        }),
      );
    })();
  }, [open, initial]);

  const canSave = useMemo(() => name.trim().length > 1, [name]);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const base = {
        name: name.trim(),
        status,
        assignedTo: assignee || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        updatedAt: serverTimestamp(),
      };

      const colPath = `projects/${projectId}/phases/${phaseId}/tasks/${taskId}/subtasks`;
      if (initial?.id) {
        await updateDoc(doc(db, colPath, initial.id), base as any);
      } else {
        await addDoc(collection(db, colPath), { ...base, createdAt: serverTimestamp() });
      }
      onClose();
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-base font-semibold">{initial?.id ? 'Editar subtarea' : 'Nueva subtarea'}</h3>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">Cerrar</button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div>
            <label className="mb-1 block text-sm text-slate-600">Nombre</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="p. ej. Diseñar PCB prototipo"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">Estado</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Fecha límite</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-600">Responsable</label>
            <select
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">— Sin asignar —</option>
              {users.map(u => (
                <option key={u.uid} value={u.uid}>
                  {u.displayName} {u.role ? `· ${u.role}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
