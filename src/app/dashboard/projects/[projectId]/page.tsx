'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/lib/useUser';
import { db } from '@/lib/firebase';
import {
  doc, getDoc, collection, getDocs, updateDoc, deleteDoc,
} from 'firebase/firestore';

import CreateTaskModal from '@/components/modals/CreateTaskModal';
import SubtaskModal from '@/components/subtasks/SubtaskModal';

// ===== Tipos =====
type Subtask = { id: string; name: string; status?: 'todo'|'in_progress'|'completed'; assignedTo?: string };
type Task = { id: string; name: string; status?: 'todo'|'in_progress'|'completed'; assignedTo?: string; subtasks: Subtask[]; progress: number };
type Phase = { id: string; name: string; status?: 'todo'|'in_progress'|'completed'|'completed'; responsibleId?: string; tasks: Task[]; progress: number };
type Project = { id: string; name: string; managerId?: string; progress: number };

// ===== Helpers de progreso =====
const statusWeight = (s?: string) => {
  if (!s) return 0;
  const v = s.toLowerCase();
  if (v === 'completed') return 1;
  if (v === 'in_progress') return 0.5;
  return 0;
};

const recomputePhaseProgress = (tasks: Task[], phaseStatus?: string) => {
  if (tasks.length > 0) {
    const avg = tasks.reduce((acc, t) => acc + (t.progress || 0), 0) / tasks.length;
    return Math.round(avg);
  }
  return Math.round(statusWeight(phaseStatus) * 100);
};

const recomputeProjectProgress = (phases: Phase[]) => {
  if (phases.length === 0) return 0;
  const avg = phases.reduce((acc, ph) => acc + (ph.progress || 0), 0) / phases.length;
  return Math.round(avg);
};

// Progreso de una tarea a partir de subtareas
const taskProgressFromSubtasks = (subs: Subtask[], fallbackStatus?: string) => {
  if (subs.length === 0) return Math.round(statusWeight(fallbackStatus) * 100);
  const sum = subs.reduce((acc, s) => acc + statusWeight(s.status), 0);
  return Math.round((sum / subs.length) * 100);
};

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { user, loading } = useUser();

  const [role, setRole] = useState<string>(''); // rol desde Firestore
  const [project, setProject] = useState<Project | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [nameCache, setNameCache] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(true);

  // UI: modales
  const [showCreate, setShowCreate] = useState<boolean>(false);
  const [openSubtask, setOpenSubtask] = useState(false);
  const [ctx, setCtx] = useState<{
    phaseId: string;
    taskId: string;
    subtask?: { id?: string; name?: string; status?: string; assignedTo?: string; dueDate?: string };
  } | null>(null);

  // ------- Cargar rol del usuario actual desde Firestore -------
  useEffect(() => {
    if (loading) return;
    (async () => {
      if (!user) {
        router.push('/');
        return;
      }
      const snap = await getDoc(doc(db, 'users', user.uid));
      const r = snap.exists() ? (snap.data().role as string) : '';
      // viewer no accede
      if (r === 'viewer') {
        router.push('/dashboard');
        return;
      }
      setRole(r);
    })();
  }, [loading, user, router]);

  // ------- Resolver displayName/email por UID con caché -------
  const getUserName = async (uid?: string | null) => {
    if (!uid) return 'Sin asignar';
    if (nameCache.has(uid)) return nameCache.get(uid)!;
    const uSnap = await getDoc(doc(db, 'users', uid));
    const name = uSnap.exists() ? (uSnap.data().displayName || uSnap.data().email || uid) : uid;
    setNameCache(prev => new Map(prev).set(uid, name));
    return name;
  };

  // ------- Cargar proyecto + fases + tareas + subtareas (extraído a función) -------
  const loadAll = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      // Proyecto
      const pRef = doc(db, 'projects', projectId);
      const pSnap = await getDoc(pRef);
      if (!pSnap.exists()) {
        router.push('/dashboard');
        return;
      }
      const pData = pSnap.data();

      const baseProject: Project = {
        id: pSnap.id,
        name: pData.name,
        managerId: pData.managerId,
        progress: 0,
      };

      // Fases
      const phSnap = await getDocs(collection(db, `projects/${projectId}/phases`));
      const phaseList: Phase[] = [];

      for (const ph of phSnap.docs) {
        const phData = ph.data();

        // Tareas
        const tSnap = await getDocs(collection(db, `projects/${projectId}/phases/${ph.id}/tasks`));
        const taskList: Task[] = [];

        for (const t of tSnap.docs) {
          const tData = t.data();

          // Subtareas
          const stSnap = await getDocs(collection(db, `projects/${projectId}/phases/${ph.id}/tasks/${t.id}/subtasks`));
          const subList: Subtask[] = stSnap.docs.map(s => ({ id: s.id, ...(s.data() as any) }));

          // Progreso de la tarea
          const tProgress = taskProgressFromSubtasks(subList, tData.status);

          taskList.push({
            id: t.id,
            name: tData.name,
            status: tData.status,
            assignedTo: tData.assignedTo,
            subtasks: subList,
            progress: tProgress,
          });
        }

        // Progreso de la fase
        const phaseProgress =
          taskList.length > 0
            ? Math.round(taskList.reduce((acc, t) => acc + (t.progress || 0), 0) / taskList.length)
            : Math.round(statusWeight(phData.status) * 100);

        phaseList.push({
          id: ph.id,
          name: phData.name,
          status: phData.status,
          responsibleId: phData.responsibleId,
          tasks: taskList,
          progress: phaseProgress,
        });
      }

      // Progreso del proyecto
      const projectProgress =
        phaseList.length > 0
          ? Math.round(phaseList.reduce((acc, ph) => acc + (ph.progress || 0), 0) / phaseList.length)
          : 0;

      setProject({ ...baseProject, progress: projectProgress });

      // Pre-resolver nombres
      const prefetchUIDs = new Set<string>();
      if (baseProject.managerId) prefetchUIDs.add(baseProject.managerId);
      phaseList.forEach(ph => { if (ph.responsibleId) prefetchUIDs.add(ph.responsibleId); });
      await Promise.all([...prefetchUIDs].map(uid => getUserName(uid)));

      setPhases(phaseList);
    } finally {
      setBusy(false);
    }
  };

  // Carga inicial / recargas
  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const canEdit = useMemo(() => role === 'project_manager', [role]);
  const canSee = useMemo(() => role === 'admin' || role === 'project_manager' || role === 'technician', [role]);

  if (busy || !canSee || !project) return <div className="p-6">Cargando…</div>;

  const managerName = nameCache.get(project.managerId || '') || 'Sin asignar';

  // ===== Acciones rápidas de subtareas =====
  const toggleSubtaskStatus = async (phaseId: string, taskId: string, sub: Subtask) => {
    const next: 'todo'|'in_progress'|'completed' =
      sub.status === 'completed' ? 'todo'
      : sub.status === 'in_progress' ? 'completed'
      : 'in_progress';
    await updateDoc(doc(db, `projects/${projectId}/phases/${phaseId}/tasks/${taskId}/subtasks/${sub.id}`), {
      status: next,
    });
    await loadAll();
  };

  const deleteSubtask = async (phaseId: string, taskId: string, subId: string) => {
    await deleteDoc(doc(db, `projects/${projectId}/phases/${phaseId}/tasks/${taskId}/subtasks/${subId}`));
    await loadAll();
  };

  // ===== Editar tarea (quick edit) =====
  const editTaskQuick = async (phaseId: string, task: Task) => {
    const newName = window.prompt('Nuevo nombre de la tarea:', task.name);
    if (newName === null) return; // cancel
    const newStatus = (window.prompt('Estado (todo | in_progress | completed):', task.status || 'todo') || '').trim() as Task['status'];
    if (!['todo','in_progress','completed',''].includes(newStatus || '')) {
      alert('Estado no válido.');
      return;
    }
    await updateDoc(doc(db, `projects/${projectId}/phases/${phaseId}/tasks/${task.id}`), {
      name: newName.trim() || task.name,
      status: newStatus || task.status || 'todo',
    });
    await loadAll();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-sm text-gray-500">Responsable: {managerName}</p>
        </div>

        <div className="flex gap-2">
          {canEdit && (
            <>
              <button
                onClick={() => setShowCreate(true)}
                className="rounded bg-blue-600 px-3 py-1 text-white"
              >
                + Crear tarea
              </button>
              <button className="rounded bg-yellow-500 px-3 py-1 text-white">
                Asignar responsable
              </button>
            </>
          )}
          <button className="rounded bg-purple-600 px-3 py-1 text-white">Cronograma</button>
        </div>
      </div>

      {/* Progreso del proyecto */}
      <div className="rounded bg-white p-4 shadow">
        <div className="mb-1 flex justify-between text-sm">
          <span>Progreso del proyecto</span>
          <span>{project.progress}%</span>
        </div>
        <div className="h-2 w-full rounded bg-gray-200">
          <div className="h-2 rounded bg-green-500" style={{ width: `${project.progress}%` }} />
        </div>
      </div>

      {/* Fases */}
      {phases.map(phase => {
        const phaseResp = nameCache.get(phase.responsibleId || '') || 'Sin asignar';
        return (
          <div key={phase.id} className="space-y-3 rounded bg-white p-4 shadow">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{phase.name}</h2>
              <span>{phase.progress}%</span>
            </div>
            <div className="h-2 w-full rounded bg-gray-200">
              <div className="h-2 rounded bg-blue-500" style={{ width: `${phase.progress}%` }} />
            </div>
            <p className="text-sm text-gray-500">Responsable: {phaseResp}</p>

            {/* Tareas */}
            {phase.tasks.map(task => {
              const tRespUid = task.assignedTo || '';
              const tResp = nameCache.get(tRespUid) || 'Sin asignar';
              if (tRespUid && !nameCache.has(tRespUid)) getUserName(tRespUid);

              const stateBadge =
                task.status === 'completed' ? 'bg-green-100 text-green-700'
                : task.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700'
                : 'bg-slate-100 text-slate-700';

              return (
                <div key={task.id} className="ml-4 space-y-2 border-l pl-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${stateBadge}`}>
                        {task.status || 'todo'}
                      </span>
                      <div className="font-medium">{task.name}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{task.progress}%</span>
                      {canEdit && (
                        <>
                          <button
                            onClick={() => editTaskQuick(phase.id, task)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => {
                              setCtx({ phaseId: phase.id, taskId: task.id });
                              setOpenSubtask(true);
                            }}
                            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                          >
                            + Subtarea
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-gray-500">Responsable: {tResp}</p>

                  {/* Subtareas (checklist) */}
                  <div className="space-y-1">
                    {task.subtasks.length === 0 && (
                      <div className="ml-4 text-xs text-slate-400">Sin subtareas</div>
                    )}

                    {task.subtasks.map(st => {
                      const stRespUid = st.assignedTo || '';
                      const stResp = nameCache.get(stRespUid) || 'Sin asignar';
                      if (stRespUid && !nameCache.has(stRespUid)) getUserName(stRespUid);

                      const isDone = st.status === 'completed';
                      const isProg = st.status === 'in_progress';

                      return (
                        <div key={st.id} className="ml-4 flex items-center justify-between rounded border border-slate-200 px-2 py-1">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleSubtaskStatus(phase.id, task.id, st)}
                              className={`h-4 w-4 rounded border ${
                                isDone ? 'bg-green-500 border-green-500' :
                                isProg ? 'bg-yellow-400 border-yellow-400' : 'border-slate-300'
                              }`}
                              title="Cambiar estado"
                            />
                            <span className={`text-sm ${isDone ? 'line-through text-slate-400' : ''}`}>
                              {st.name}
                            </span>
                            <span className="text-xs text-slate-500">· {stResp}</span>
                          </div>

                          <div className="flex items-center gap-1">
                            {canEdit && (
                              <>
                                <button
                                  onClick={() => {
                                    setCtx({
                                      phaseId: phase.id,
                                      taskId: task.id,
                                      subtask: {
                                        id: st.id,
                                        name: st.name,
                                        status: st.status,
                                        assignedTo: st.assignedTo,
                                      },
                                    });
                                    setOpenSubtask(true);
                                  }}
                                  className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => deleteSubtask(phase.id, task.id, st.id)}
                                  className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                                >
                                  Borrar
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Modal Crear Tarea */}
      {canEdit && (
        <CreateTaskModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          projectId={project.id}
          phases={phases.map(ph => ({ id: ph.id, name: ph.name }))}
          onCreated={loadAll}
        />
      )}

      {/* Modal Subtarea (crear/editar) */}
      {canEdit && openSubtask && ctx && (
        <SubtaskModal
          open={openSubtask}
          onClose={() => setOpenSubtask(false)}
          projectId={project.id}
          phaseId={ctx.phaseId}
          taskId={ctx.taskId}
          initial={ctx.subtask}
          onSaved={loadAll}
        />
      )}
    </div>
  );
}
