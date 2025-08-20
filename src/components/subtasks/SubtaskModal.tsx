'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  addDoc, collection, doc, getDocs, serverTimestamp, updateDoc,
} from 'firebase/firestore';

type UserLite = { uid: string; displayName?: string; email?: string; role?: string; tags?: string[] };

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  phaseId: string;
  taskId: string;
  initial?: { id?: string; name?: string; status?: string; assignedTo?: string; dueDate?: string; tags?: string[] };
  onSaved?: () => void;
};

const STATUS = [
  { value: 'todo',        label: 'Pendiente' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'completed',   label: 'Completada' },
] as const;

const norm = (s: string) => s.toLowerCase().trim();
const roleWeight: Record<string, number> = { technician: 0, admin: 1, project_manager: 2, viewer: 3 };

export default function SubtaskModal({
  open, onClose, projectId, phaseId, taskId, initial, onSaved,
}: Props) {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(initial?.name || '');
  const [status, setStatus] = useState<string>(initial?.status || 'todo');
  const [assignee, setAssignee] = useState<string>(initial?.assignedTo || '');
  const [dueDate, setDueDate] = useState<string>(initial?.dueDate || '');

  // TAGS selector
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>(initial?.tags?.map(norm) || []);
  const [manualAssignee, setManualAssignee] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name || '');
    setStatus(initial?.status || 'todo');
    setAssignee(initial?.assignedTo || '');
    setDueDate(initial?.dueDate || '');
    setSelectedTags(initial?.tags?.map(norm) || []);
    (async () => {
      const snap = await getDocs(collection(db, 'users'));
      const items = snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) })) as UserLite[];
      setUsers(items);

      const tagSet = new Set<string>();
      items.forEach(u => (u.tags || []).forEach(t => tagSet.add(norm(t))));
      setAvailableTags(Array.from(tagSet).sort());
    })();
  }, [open, initial]);

  const canSave = useMemo(() => name.trim().length > 1, [name]);

  // recomendación
  const recommendation = useMemo(() => {
    if (selectedTags.length === 0 || users.length === 0) return null;
    const scored = users.map(u => {
      const uTags = (u.tags || []).map(norm);
      const score = selectedTags.reduce((acc, t) => acc + (uTags.includes(t) ? 1 : 0), 0);
      return { uid: u.uid, name: u.displayName || u.email || u.uid, role: u.role || '', score };
    });
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (roleWeight[a.role] ?? 9) - (roleWeight[b.role] ?? 9);
    });
    const top = scored[0];
    if (!top || top.score === 0) return null;
    return { ...top, max: selectedTags.length };
  }, [selectedTags, users]);

  useEffect(() => {
    if (!manualAssignee && recommendation?.uid) setAssignee(recommendation.uid);
  }, [recommendation, manualAssignee]);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const base = {
        name: name.trim(),
        status,
        assignedTo: assignee || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        tags: selectedTags,                          // ← guardamos tags
        updatedAt: serverTimestamp(),
      };

      const colPath = `projects/${projectId}/phases/${phaseId}/tasks/${taskId}/subtasks`;
      if (initial?.id) {
        await updateDoc(doc(db, colPath, initial.id!), base as any);
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

          {/* Competencias requeridas (tags) */}
          <div>
            <label className="mb-1 block text-sm text-slate-600">Competencias requeridas</label>
            <div className="flex flex-wrap gap-2">
              {availableTags.map(t => {
                const checked = selectedTags.includes(t);
                return (
                  <label key={t} className={`cursor-pointer select-none rounded-full border px-3 py-1 text-xs ${checked ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300'}`}>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={() => setSelectedTags(prev => checked ? prev.filter(x => x !== t) : [...prev, t])}
                    />
                    {t}
                  </label>
                );
              })}
              {availableTags.length === 0 && (
                <div className="text-xs text-slate-500">No hay etiquetas definidas en usuarios.</div>
              )}
            </div>

            <div className="mt-2 text-xs text-slate-600">
              {recommendation
                ? (
                  <div className="flex items-center gap-2">
                    <span>Sugerido: <strong>{recommendation.name}</strong> ({recommendation.score}/{recommendation.max})</span>
                    <button
                      type="button"
                      className="rounded border px-2 py-0.5 hover:bg-slate-50"
                      onClick={() => { setAssignee(recommendation.uid); setManualAssignee(false); }}
                    >
                      Asignar sugerido
                    </button>
                  </div>
                )
                : <span>No hay sugerencias para la selección actual.</span>}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-600">Responsable</label>
            <select
              value={assignee}
              onChange={e => { setAssignee(e.target.value); setManualAssignee(true); }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">— Sin asignar —</option>
              {users.map(u => (
                <option key={u.uid} value={u.uid}>
                  {(u.displayName || u.email || u.uid) + (u.role ? ` · ${u.role}` : '')}
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
