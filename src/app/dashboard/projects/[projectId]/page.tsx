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


type Subtask = { id: string; name: string; status?: 'todo'|'in_progress'|'completed'; assignedTo?: string };
type Task = { id: string; name: string; status?: 'todo'|'in_progress'|'completed'; assignedTo?: string; subtasks: Subtask[]; progress: number };
type Phase = { id: string; name: string; status?: 'todo'|'in_progress'|'completed'; responsibleId?: string; tasks: Task[]; progress: number };
type Project = { id: string; name: string; managerId?: string; progress: number };


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


const statusLabelEs = (s?: string) =>
  s === 'completed' ? 'Completada' :
  s === 'in_progress' ? 'En progreso' : 'Pendiente';

const statusBadgeClass = (s?: string) =>
  s === 'completed' ? 'bg-green-100 text-green-700' :
  s === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
  'bg-slate-100 text-slate-700';


const taskProgressFromSubtasks = (subs: Subtask[], taskStatus?: string) => {
  const fromTask = Math.round(statusWeight(taskStatus) * 100);
  if (subs.length === 0) return fromTask;

  const sum = subs.reduce((acc, s) => acc + statusWeight(s.status), 0);
  const fromSubs = Math.round((sum / subs.length) * 100);

  return Math.max(fromTask, fromSubs);
};

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { user, loading } = useUser();

  const [role, setRole] = useState<string>('');
  const [project, setProject] = useState<Project | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [nameCache, setNameCache] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(true);


  const [showCreate, setShowCreate] = useState<boolean>(false);
  const [openSubtask, setOpenSubtask] = useState(false);
  const [ctx, setCtx] = useState<{
    phaseId: string;
    taskId: string;
    subtask?: { id?: string; name?: string; status?: string; assignedTo?: string; dueDate?: string };
  } | null>(null);


  useEffect(() => {
    if (loading) return;
    (async () => {
      if (!user) {
        router.push('/');
        return;
      }
      const snap = await getDoc(doc(db, 'users', user.uid));
      const r = snap.exists() ? (snap.data().role as string) : '';
      if (r === 'viewer') {
        router.push('/dashboard');
        return;
      }
      setRole(r);
    })();
  }, [loading, user, router]);


  const getUserName = async (uid?: string | null) => {
    if (!uid) return 'Sin asignar';
    if (nameCache.has(uid)) return nameCache.get(uid)!;
    const uSnap = await getDoc(doc(db, 'users', uid));
    const name = uSnap.exists() ? (uSnap.data().displayName || uSnap.data().email || uid) : uid;
    setNameCache(prev => new Map(prev).set(uid, name));
    return name;
  };

  const loadAll = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
    
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

 
      const phSnap = await getDocs(collection(db, `projects/${projectId}/phases`));
      const phaseList: Phase[] = [];

      for (const ph of phSnap.docs) {
        const phData = ph.data();


        const tSnap = await getDocs(collection(db, `projects/${projectId}/phases/${ph.id}/tasks`));
        const taskList: Task[] = [];

        for (const t of tSnap.docs) {
          const tData = t.data();

          const stSnap = await getDocs(collection(db, `projects/${projectId}/phases/${ph.id}/tasks/${t.id}/subtasks`));
          const subList: Subtask[] = stSnap.docs.map(s => ({ id: s.id, ...(s.data() as any) }));

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


      const projectProgress =
        phaseList.length > 0
          ? Math.round(phaseList.reduce((acc, ph) => acc + (ph.progress || 0), 0) / phaseList.length)
          : 0;

      setProject({ ...baseProject, progress: projectProgress });

      const prefetchUIDs = new Set<string>();
      if (baseProject.managerId) prefetchUIDs.add(baseProject.managerId);
      phaseList.forEach(ph => { if (ph.responsibleId) prefetchUIDs.add(ph.responsibleId); });
      await Promise.all([...prefetchUIDs].map(uid => getUserName(uid)));

      setPhases(phaseList);
    } finally {
      setBusy(false);
    }
  };


  useEffect(() => {
    loadAll();
  }, [projectId]);


  const canEdit = useMemo(() => role === 'project_manager', [role]);
  const canAddSubtask = useMemo(() => role === 'admin' || role === 'technician' || role === 'project_manager', [role]);
  const canSee = useMemo(() => role === 'admin' || role === 'project_manager' || role === 'technician', [role]);

  if (busy || !canSee || !project) return <div className="p-6">Cargando…</div>;

  const managerName = nameCache.get(project.managerId || '') || 'Sin asignar';


  const deleteSubtask = async (phaseId: string, taskId: string, subId: string) => {
    await deleteDoc(doc(db, `projects/${projectId}/phases/${phaseId}/tasks/${taskId}/subtasks/${subId}`));
    await loadAll();
  };

  return (
    <div className="p-6 space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-sm text-gray-500">Responsable: {managerName}</p>
        </div>

        <div className="flex gap-3 mt-6 items-center">

          <button
            onClick={() =>
              typeof setShowCreate === 'function'
                ? setShowCreate(true)
                : router.push('/dashboard/pm/new')
            }
            className="
              inline-flex items-center gap-2
              h-12 min-w-[170px] px-6 rounded-xl
              bg-gradient-to-r from-sky-600 to-blue-700
              text-white text-base font-semibold tracking-tight
              shadow-md hover:shadow-lg
              transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105
              focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2
            "
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M11 5a1 1 0 012 0v6h6a1 1 0 010 2h-6v6a1 1 0 01-2 0v-6H5a1 1 0 010-2h6V5z" />
            </svg>
            <span>Crear tarea</span>
          </button>


          <button
            onClick={() => router.push('/dashboard/timeline')}
            className="
              h-12 min-w-[180px] px-7 rounded-xl
              bg-gradient-to-r from-indigo-600 to-violet-700
              text-white text-base font-semibold tracking-tight
              shadow-md hover:shadow-lg
              transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105
              focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2
            "
          >
            Cronograma
          </button>
        </div>


      </div>

      <div className="rounded bg-white p-4 shadow">
        <div className="mb-1 flex justify-between text-sm">
          <span>Progreso del proyecto</span>
          <span>{project.progress}%</span>
        </div>
        <div className="h-2 w-full rounded bg-gray-200">
          <div className="h-2 rounded bg-green-500" style={{ width: `${project.progress}%` }} />
        </div>
      </div>


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


            {phase.tasks.map(task => {
              const tRespUid = task.assignedTo || '';
              const tResp = nameCache.get(tRespUid) || 'Sin asignar';
              if (tRespUid && !nameCache.has(tRespUid)) getUserName(tRespUid);

              return (
                <div key={task.id} className="ml-4 space-y-2 border-l pl-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`rounded border px-2 py-0.5 text-xs ${statusBadgeClass(task.status)}`}>
                        {statusLabelEs(task.status)}
                      </span>
                      <div className="font-medium">{task.name}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{task.progress}%</span>


                      {role === 'project_manager' && (
                        <>
                          <button
                            onClick={() => {
                              const newName = window.prompt('Nuevo nombre de la tarea:', task.name);
                              if (newName && newName.trim()) {
                                updateDoc(doc(db, `projects/${projectId}/phases/${phase.id}/tasks/${task.id}`), {
                                  name: newName.trim(),
                                }).then(loadAll);
                              }
                            }}
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


                      {(role === 'admin' || role === 'technician') && (
                        <button
                          onClick={() => {
                            setCtx({ phaseId: phase.id, taskId: task.id });
                            setOpenSubtask(true);
                          }}
                          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          + Subtarea
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-gray-500">Responsable: {tResp}</p>


                  <div className="space-y-1">
                    {task.subtasks.length === 0 && (
                      <div className="ml-4 text-xs text-slate-400">Sin subtareas</div>
                    )}

                    {task.subtasks.map(st => {
                      const stRespUid = st.assignedTo || '';
                      const stResp = nameCache.get(stRespUid) || 'Sin asignar';
                      if (stRespUid && !nameCache.has(stRespUid)) getUserName(stRespUid);

                      const dotCls =
                        st.status === 'completed'
                          ? 'bg-green-500'
                          : st.status === 'in_progress'
                          ? 'bg-yellow-400'
                          : 'bg-slate-300';

                      return (
                        <div
                          key={st.id}
                          className="ml-4 flex items-center justify-between rounded border border-slate-200 px-2 py-1"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotCls}`} />
                            <span className="text-sm">{st.name}</span>
                            <span className="text-xs text-slate-500">· {stResp}</span>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="rounded bg-slate-100 px-2 py-0.5">
                              {statusLabelEs(st.status)}
                            </span>

                            {role === 'project_manager' && (
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
                                  className="rounded px-2 py-1 hover:bg-slate-100"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => deleteSubtask(phase.id, task.id, st.id)}
                                  className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
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


      {role === 'project_manager' && (
        <CreateTaskModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          projectId={project.id}
          phases={phases.map(ph => ({ id: ph.id, name: ph.name }))}
          onCreated={loadAll}
        />
      )}


      {canAddSubtask && openSubtask && ctx && (
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
