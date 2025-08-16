'use client';

import { useEffect, useMemo, useState } from 'react';
import { Timestamp, addDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type UserLite = { uid: string; displayName?: string; email?: string; role?: string; };
type PhaseLite = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  phases: PhaseLite[];
  defaultPhaseId?: string;
  onCreated?: (args: {
    phaseId: string;
    task: {
      id: string;
      name: string;
      status?: string;
      assignedTo?: string;
      progress: number;
      subtasks: any[];
    };
  }) => void;
};

const STATUS = [
  { value: 'todo', label: 'Pendiente' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'completed', label: 'Completada' },
] as const;

const PRIORITY = [
  { value: 'low', label: 'Baja' },
  { value: 'med', label: 'Media' },
  { value: 'high', label: 'Alta' },
] as const;

export default function CreateTaskModal({
  open, onClose, projectId, phases, defaultPhaseId, onCreated,
}: Props) {
  const [phaseId, setPhaseId] = useState(defaultPhaseId || phases[0]?.id);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<typeof STATUS[number]['value']>('todo');
  const [assignee, setAssignee] = useState<string>('');
  const [priority, setPriority] = useState<typeof PRIORITY[number]['value']>('med');
  const [dueDate, setDueDate] = useState<string>(''); // yyyy-mm-dd
  const [tagsText, setTagsText] = useState<string>(''); // coma-separado
  const [users, setUsers] = useState<UserLite[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhaseId(defaultPhaseId || phases[0]?.id);
    (async () => {
      // Cargar usuarios para el selector de responsables
      const snap = await getDocs(collection(db, 'users'));
      const items: UserLite[] = snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) }));
      setUsers(items);
    })();
  }, [open, defaultPhaseId, phases]);

  const canSave = useMemo(() => name.trim().length > 2 && !!phaseId, [name, phaseId]);

  const handleCreate = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const due = dueDate ? Timestamp.fromDate(new Date(dueDate)) : null;
      const tags = tagsText
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      const payload = {
        name: name.trim(),
        status,
        assignedTo: assignee || null,
        priority,
        dueDate: due,
        tags,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const ref = await addDoc(collection(db, `projects/${projectId}/phases/${phaseId}/tasks`), payload);

      // Devolvemos un objeto compatible con tu UI actual
      onCreated?.({
        phaseId,
        task: {
          id: ref.id,
          name: payload.name,
          status: payload.status || undefined,
          assignedTo: payload.assignedTo || undefined,
          progress: payload.status === 'completed' ? 100 : payload.status === 'in_progress' ? 50 : 0,
          subtasks: [],
        },
      });

      onClose();
      // Limpiar formulario mínimo
      setName('');
      setStatus('todo');
      setAssignee('');
      setPriority('med');
      setDueDate('');
      setTagsText('');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-base font-semibold">Crear nueva tarea</h3>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">Cerrar</button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {/* Fase */}
          <div>
            <label className="mb-1 block text-sm text-slate-600">Fase</label>
            <select
              value={phaseId}
              onChange={e => setPhaseId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {phases.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Nombre */}
          <div>
            <label className="mb-1 block text-sm text-slate-600">Nombre</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Ej. Integración firmware del sensor"
            />
          </div>

          {/* Estado y Prioridad */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">Estado</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Prioridad</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as any)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {PRIORITY.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Responsable */}
          <div>
            <label className="mb-1 block text-sm text-slate-600">Responsable</label>
            <select
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Sin asignar</option>
              {users.map(u => (
                <option key={u.uid} value={u.uid}>
                  {u.displayName || u.email || u.uid}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha límite */}
          <div>
            <label className="mb-1 block text-sm text-slate-600">Fecha límite</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-sm text-slate-600">Etiquetas (separadas por comas)</label>
            <input
              value={tagsText}
              onChange={e => setTagsText(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="electrónica, firmware, pruebas"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">Cancelar</button>
          <button
            onClick={handleCreate}
            disabled={!canSave || saving}
            className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
}
