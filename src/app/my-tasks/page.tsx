'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/useUser';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, Timestamp, updateDoc } from 'firebase/firestore';
import StatusPill from '@/components/ui/StatusPill';

type TaskItem = {
  id: string;
  type: 'task' | 'subtask';
  name: string;
  projectId: string;
  projectName: string;
  phaseId: string;
  taskId: string;
  assignedTo?: string;
  dueDate?: Date;
  status: 'todo' | 'in_progress' | 'completed';
};

export default function MyTasksPage() {
  const { user, loading } = useUser();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [filterDue, setFilterDue] = useState<string>('all');
  const router = useRouter();

  useEffect(() => {
    if (!user) return;

    const loadAll = async () => {
      const projSnap = await getDocs(collection(db, 'projects'));
      const allTasks: TaskItem[] = [];
      const projList: { id: string; name: string }[] = [];

      for (const proj of projSnap.docs) {
        const projData = proj.data();
        projList.push({ id: proj.id, name: projData.name });

        const phasesSnap = await getDocs(collection(db, `projects/${proj.id}/phases`));
        for (const ph of phasesSnap.docs) {
          const tasksSnap = await getDocs(collection(db, `projects/${proj.id}/phases/${ph.id}/tasks`));
          for (const t of tasksSnap.docs) {
            const tData = t.data();

            if (tData.assignedTo === user?.uid) {
              allTasks.push({
                id: t.id,
                type: 'task',
                name: tData.name,
                projectId: proj.id,
                projectName: projData.name,
                phaseId: ph.id,
                taskId: t.id,
                assignedTo: tData.assignedTo,
                dueDate: tData.dueDate instanceof Timestamp ? tData.dueDate.toDate() : undefined,
                status: tData.status,
              });
            }

            const subsSnap = await getDocs(collection(db, `projects/${proj.id}/phases/${ph.id}/tasks/${t.id}/subtasks`));
            for (const s of subsSnap.docs) {
              const sData = s.data();
              if (sData.assignedTo === user?.uid) {
                allTasks.push({
                  id: s.id,
                  type: 'subtask',
                  name: sData.name,
                  projectId: proj.id,
                  projectName: projData.name,
                  phaseId: ph.id,
                  taskId: t.id,
                  assignedTo: sData.assignedTo,
                  dueDate: sData.dueDate instanceof Timestamp ? sData.dueDate.toDate() : undefined,
                  status: sData.status,
                });
              }
            }
          }
        }
      }

      setProjects(projList);
      setTasks(allTasks);
    };

    loadAll();
  }, [user]);

  const filteredTasks = useMemo(() => {
    let result = tasks.filter(t => t.status === 'todo' || t.status === 'in_progress');

    if (selectedProject !== 'all') result = result.filter(t => t.projectId === selectedProject);

    const now = new Date();
    if (filterDue === 'week') {
      const weekAhead = new Date();
      weekAhead.setDate(now.getDate() + 7);
      result = result.filter(t => t.dueDate && t.dueDate <= weekAhead && t.dueDate >= now);
    } else if (filterDue === 'overdue') {
      result = result.filter(t => t.dueDate && t.dueDate < now);
    }

    result.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.getTime() - b.dueDate.getTime();
    });

    return result;
  }, [tasks, selectedProject, filterDue]);

  if (loading) return <div className="p-6">Cargando…</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Mis tareas</h1>

      {/* filtros */}
      <div className="flex gap-4">
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className="border rounded p-2">
          <option value="all">Todos los proyectos</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select value={filterDue} onChange={e => setFilterDue(e.target.value)} className="border rounded p-2">
          <option value="all">Todas las fechas</option>
          <option value="week">Próximos 7 días</option>
          <option value="overdue">Atrasadas</option>
        </select>
      </div>

      {/* lista */}
      <div className="space-y-2">
        {filteredTasks.map(t => (
          <div
            key={`${t.type}-${t.id}`}
            className={`flex justify-between items-center p-3 rounded shadow ${
              t.type === 'subtask' ? 'bg-gray-50 ml-6 border-l-4 border-blue-300' : 'bg-white'
            }`}
          >
            <div>
              <StatusPill
                value={t.status}
                onChange={async (next) => {
                  const basePath = `projects/${t.projectId}/phases/${t.phaseId}/tasks/${t.taskId}`;
                  const ref = t.type === 'task'
                    ? doc(db, basePath)
                    : doc(db, `${basePath}/subtasks/${t.id}`);

                  await updateDoc(ref, { status: next });

                  if (next === 'completed') {
                    setTasks(prev => prev.filter(x => !(x.id === t.id && x.type === t.type)));
                  } else {
                    setTasks(prev => prev.map(x => x.id === t.id && x.type === t.type ? { ...x, status: next } : x));
                  }
                }}
              />
              <span className="font-medium ml-2">
                {t.type === 'subtask' ? `↳ ${t.name}` : t.name}
              </span>
              <div className="text-xs text-gray-500">Proyecto: {t.projectName}</div>
              <div className="text-xs text-gray-400 italic">{t.type === 'subtask' ? 'Subtarea' : 'Tarea'}</div>
            </div>
            <div className="text-sm text-gray-600">{t.dueDate ? t.dueDate.toLocaleDateString() : 'Sin fecha'}</div>
          </div>
        ))}
        {filteredTasks.length === 0 && <div className="text-gray-500">No tienes tareas asignadas.</div>}
      </div>
    </div>
  );
}
