'use client';

import { useEffect, useMemo, useState } from 'react';
import { Timestamp, addDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type UserLite = {
  uid: string;
  displayName?: string;
  email?: string;
  role?: string;
  tags?: string[];
};
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

// utilidad
const norm = (s: string) => s.toLowerCase().trim();
const roleWeight: Record<string, number> = { technician: 0, admin: 1, project_manager: 2, viewer: 3 };

export default function CreateTaskModal({
  open, onClose, projectId, phases, defaultPhaseId, onCreated,
}: Props) {
  const [phaseOptions, setPhaseOptions] = useState<PhaseLite[]>(phases);
  const [phaseId, setPhaseId] = useState(defaultPhaseId || phases[0]?.id);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<typeof STATUS[number]['value']>('todo');
  const [assignee, setAssignee] = useState<string>('');
  const [priority, setPriority] = useState<typeof PRIORITY[number]['value']>('med');
  const [dueDate, setDueDate] = useState<string>('');

  // TAGS - nueva UI
  const [users, setUsers] = useState<UserLite[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [manualAssignee, setManualAssignee] = useState(false);

  // Hito
  const [isMilestone, setIsMilestone] = useState<boolean>(false);

  const [saving, setSaving] = useState(false);

  // Crear fase inline
  const [creatingPhase, setCreatingPhase] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [newPhaseDesc, setNewPhaseDesc] = useState('');
  const [creatingPhaseBusy, setCreatingPhaseBusy] = useState(false);

  // cargar users + tags
  useEffect(() => {
    if (!open) return;
    setPhaseOptions(phases);
    setPhaseId(defaultPhaseId || phases[0]?.id);
    (async () => {
      const snap = await getDocs(collection(db, 'users'));
      const items: UserLite[] = snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) }));
      setUsers(items);

      const tagSet = new Set<string>();
      items.forEach(u => (u.tags || []).forEach(t => tagSet.add(norm(t))));
 
      tagSet.delete('hito');
      setAvailableTags(Array.from(tagSet).sort());
    })();
  }, [open, defaultPhaseId, phases]);

  const canSave = useMemo(() => name.trim().length > 2 && !!phaseId, [name, phaseId]);


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
    if (!manualAssignee && recommendation?.uid) {
      setAssignee(recommendation.uid);
    }
  }, [recommendation, manualAssignee]);

  
  const handleCreatePhase = async () => {
    const n = newPhaseName.trim();
    if (!n) return;
    setCreatingPhaseBusy(true);
    try {
      const ref = await addDoc(collection(db, `projects/${projectId}/phases`), {
        name: n,
        description: newPhaseDesc.trim() || '',
        status: 'not_started',
        responsibleId: null,
        startDate: null,
        endDate: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const newPhase = { id: ref.id, name: n } as PhaseLite;
      setPhaseOptions(prev => [...prev, newPhase]);
      setPhaseId(ref.id);
      setNewPhaseName('');
      setNewPhaseDesc('');
      setCreatingPhase(false);
    } finally {
      setCreatingPhaseBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const due = dueDate ? Timestamp.fromDate(new Date(dueDate)) : null;

      const tags = [
        ...selectedTags,
        ...(isMilestone ? ['hito'] : []),
      ];

      const payload: any = {
        name: name.trim(),
        status,
        assignedTo: assignee || null,
        priority,
        dueDate: due,
        tags,
        isMilestone,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const ref = await addDoc(collection(db, `projects/${projectId}/phases/${phaseId}/tasks`), payload);

      onCreated?.({
        phaseId,
        task: {
          id: ref.id,
          name: payload.name,
          status: payload.status || undefined,
          assignedTo: payload.assignedTo || undefined,
          progress:
            payload.status === 'completed' ? 100 :
            payload.status === 'in_progress' ? 50 : 0,
          subtasks: [],
        },
      });

      onClose();
      setName('');
      setStatus('todo');
      setAssignee('');
      setPriority('med');
      setDueDate('');
      setSelectedTags([]);
      setIsMilestone(false);
      setManualAssignee(false);
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

          <div>
            <div className="flex items-center justify-between">
              <label className="mb-1 block text-sm text-slate-600">Fase</label>
              {!creatingPhase && (
                <button type="button" onClick={() => setCreatingPhase(true)} className="text-xs text-blue-600 hover:underline">
                  + Nueva fase
                </button>
              )}
            </div>

            <select
              value={phaseId}
              onChange={e => setPhaseId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {phaseOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {creatingPhase && (
              <div className="mt-3 rounded-lg border border-slate-200 p-3">
                <div className="text-xs font-medium mb-2 text-slate-600">Crear fase rápida</div>
                <input
                  value={newPhaseName}
                  onChange={e => setNewPhaseName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Nombre de la fase"
                />
                <textarea
                  value={newPhaseDesc}
                  onChange={e => setNewPhaseDesc(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Descripción (opcional)"
                  rows={2}
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCreatePhase}
                    disabled={!newPhaseName.trim() || creatingPhaseBusy}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {creatingPhaseBusy ? 'Creando…' : 'Crear fase'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCreatingPhase(false); setNewPhaseName(''); setNewPhaseDesc(''); }}
                    className="rounded-lg border px-3 py-1.5 text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>


          <div>
            <label className="mb-1 block text-sm text-slate-600">Nombre</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Ej. Integración firmware del sensor"
            />
          </div>


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
                      onChange={() => {
                        setSelectedTags(prev => checked ? prev.filter(x => x !== t) : [...prev, t]);
                      }}
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
                    <span>Sugerido: <strong>{recommendation.name}</strong> ({recommendation.score}/{recommendation.max} coincidencias)</span>
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
              <option value="">Sin asignar</option>
              {users.map(u => (
                <option key={u.uid} value={u.uid}>
                  {(u.displayName || u.email || u.uid) + (u.role ? ` · ${u.role}` : '')}
                </option>
              ))}
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

    
          <div className="flex items-center gap-2">
            <input
              id="isMilestone"
              type="checkbox"
              checked={isMilestone}
              onChange={(e) => setIsMilestone(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="isMilestone" className="text-sm text-slate-700">
              Marcar como hito (se mostrará como diamante en el cronograma)
            </label>
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
