'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/lib/useUser';
import { db } from '@/lib/firebase';
import {
  doc, getDoc, collection, getDocs,
} from 'firebase/firestore';

// Helpers de tipos
type Subtask = { id: string; name: string; status?: string; assignedTo?: string; };
type Task = { id: string; name: string; status?: string; assignedTo?: string; subtasks: Subtask[]; progress: number; };
type Phase = { id: string; name: string; status?: string; responsibleId?: string; tasks: Task[]; progress: number; };
type Project = { id: string; name: string; managerId?: string; progress: number; };

// Ponderación de estados
const statusWeight = (s?: string) => {
  if (!s) return 0;
  const v = s.toLowerCase();
  if (v === 'completed') return 1;
  if (v === 'in_progress') return 0.5;
  return 0;
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

  // ------- Cargar rol del usuario actual desde Firestore -------
  useEffect(() => {
    if (loading) return;
    (async () => {
      if (!user) { router.push('/'); return; }
      const snap = await getDoc(doc(db, 'users', user.uid));
      const r = snap.exists() ? (snap.data().role as string) : '';
      // viewer no accede
      if (r === 'viewer') { router.push('/dashboard'); return; }
      setRole(r);
    })();
  }, [loading, user, router]);

  // ------- Resolver displayName/email por UID con caché -------
  const getUserName = async (uid?: string | null) => {
    if (!uid) return 'Sin asignar';
    if (nameCache.has(uid)) return nameCache.get(uid)!;
    const uSnap = await getDoc(doc(db, 'users', uid));
    const name = uSnap.exists()
      ? (uSnap.data().displayName || uSnap.data().email || uid)
      : uid;
    setNameCache(prev => new Map(prev).set(uid, name));
    return name;
  };

  // ------- Cargar proyecto + fases + tareas + subtareas -------
  useEffect(() => {
    if (!projectId) return;

    (async () => {
      setBusy(true);
      try {
        // Proyecto
        const pRef = doc(db, 'projects', projectId);
        const pSnap = await getDoc(pRef);
        if (!pSnap.exists()) { router.push('/dashboard'); return; }
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
            const subList: Subtask[] = stSnap.docs.map(s => ({
              id: s.id, ...(s.data() as any),
            }));

            // Progreso de la tarea
            let tProgress = 0;
            if (subList.length > 0) {
              const sum = subList.reduce((acc, s) => acc + statusWeight(s.status), 0);
              tProgress = Math.round((sum / subList.length) * 100);
            } else {
              tProgress = Math.round(statusWeight(tData.status) * 100);
            }

            taskList.push({
              id: t.id,
              name: tData.name,
              status: tData.status,
              assignedTo: tData.assignedTo,
              subtasks: subList,
              progress: tProgress,
            });
          }

          // Progreso de la fase: media de tareas (si no hay, usar su propio estado)
          const phaseProgress = taskList.length > 0
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

        // Progreso del proyecto: media de fases
        const projectProgress = phaseList.length > 0
          ? Math.round(phaseList.reduce((acc, ph) => acc + (ph.progress || 0), 0) / phaseList.length)
          : 0;

        setProject({ ...baseProject, progress: projectProgress });

        // Pre-resolver nombres que ya conocemos (manager y responsables)
        const prefetchUIDs = new Set<string>();
        if (baseProject.managerId) prefetchUIDs.add(baseProject.managerId);
        phaseList.forEach(ph => { if (ph.responsibleId) prefetchUIDs.add(ph.responsibleId); });
        await Promise.all([...prefetchUIDs].map(uid => getUserName(uid)));

        setPhases(phaseList);
      } finally {
        setBusy(false);
      }
    })();
  }, [projectId]); // eslint-disable-line

  const canEdit = useMemo(() => role === 'project_manager', [role]);
  const canSee = useMemo(() => role === 'admin' || role === 'project_manager' || role === 'technician', [role]);

  if (busy || !canSee || !project) return <div className="p-6">Cargando…</div>;

  const managerName = nameCache.get(project.managerId || '') || 'Sin asignar';

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-sm text-gray-500">Responsable: {managerName}</p>
        </div>

        <div className="flex gap-2">
          {canEdit && (
            <>
              <button className="px-3 py-1 bg-blue-600 text-white rounded">+ Crear tarea</button>
              <button className="px-3 py-1 bg-yellow-500 text-white rounded">Asignar responsable</button>
            </>
          )}
          <button className="px-3 py-1 bg-purple-600 text-white rounded">Cronograma</button>
        </div>
      </div>

      {/* Progreso del proyecto */}
      <div className="bg-white shadow p-4 rounded">
        <div className="flex justify-between text-sm mb-1">
          <span>Progreso del proyecto</span>
          <span>{project.progress}%</span>
        </div>
        <div className="w-full bg-gray-200 h-2 rounded">
          <div className="bg-green-500 h-2 rounded" style={{ width: `${project.progress}%` }} />
        </div>
      </div>

      {/* Fases */}
      {phases.map(phase => {
        const phaseResp = nameCache.get(phase.responsibleId || '') || 'Sin asignar';
        return (
          <div key={phase.id} className="bg-white shadow p-4 rounded space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">{phase.name}</h2>
              <span>{phase.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 h-2 rounded">
              <div className="bg-blue-500 h-2 rounded" style={{ width: `${phase.progress}%` }} />
            </div>
            <p className="text-sm text-gray-500">Responsable: {phaseResp}</p>

            {/* Tareas */}
            {phase.tasks.map(task => {
              const tRespUid = task.assignedTo || '';
              const tResp = nameCache.get(tRespUid) || 'Sin asignar';
              // Si no está en caché, dispara una resolución en segundo plano
              if (tRespUid && !nameCache.has(tRespUid)) getUserName(tRespUid);

              return (
                <div key={task.id} className="ml-4 border-l pl-4 space-y-1">
                  <div className="flex justify-between items-center">
                    <div className="font-medium">{task.name}</div>
                    <div className="text-sm">{task.progress}%</div>
                  </div>
                  <p className="text-sm text-gray-500">Responsable: {tResp}</p>

                  {/* Subtareas */}
                  {task.subtasks.map(st => {
                    const stRespUid = st.assignedTo || '';
                    const stResp = nameCache.get(stRespUid) || 'Sin asignar';
                    if (stRespUid && !nameCache.has(stRespUid)) getUserName(stRespUid);

                    return (
                      <div key={st.id} className="ml-4 border-l pl-4">
                        <div className="flex justify-between items-center">
                          <span>{st.name}</span>
                          <span>{st.status === 'completed' ? '✅' : st.status === 'in_progress' ? '⏳' : '—'}</span>
                        </div>
                        <p className="text-sm text-gray-500">Responsable: {stResp}</p>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
