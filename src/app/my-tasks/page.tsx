'use client';

import { useEffect, useState, useMemo } from 'react';
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

    // Agrupación por proyecto y orden por fecha
    result.sort((a, b) => {
      if (a.projectName !== b.projectName) return a.projectName.localeCompare(b.projectName);
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.getTime() - b.dueDate.getTime();
    });

    return result;
  }, [tasks, selectedProject, filterDue]);

  // Agrupamos por proyecto para pintar
  const groupedByProject = useMemo(() => {
    const groups: Record<string, TaskItem[]> = {};
    for (const t of filteredTasks) {
      if (!groups[t.projectId]) groups[t.projectId] = [];
      groups[t.projectId].push(t);
    }
    return groups;
  }, [filteredTasks]);

  if (loading) return <div className="p-6">Cargando…</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Mis tareas</h1>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4">
        <select
          value={selectedProject}
          onChange={e => setSelectedProject(e.target.value)}
          className="rounded border px-3 py-2 text-sm bg-white shadow-sm hover:shadow transition"
        >
          <option value="all">Todos los proyectos</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select
          value={filterDue}
          onChange={e => setFilterDue(e.target.value)}
          className="rounded border px-3 py-2 text-sm bg-white shadow-sm hover:shadow transition"
        >
          <option value="all">Todas las fechas</option>
          <option value="week">Próximos 7 días</option>
          <option value="overdue">Atrasadas</option>
        </select>
      </div>

      {/* Lista de proyectos con tareas */}
      {Object.keys(groupedByProject).length === 0 && (
        <div className="text-slate-500 text-sm text-center py-6">
          No tienes tareas asignadas.
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(groupedByProject).map(([projId, projTasks]) => (
          <div key={projId} className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-3">
              {projTasks[0].projectName}
            </h2>
            <div className="space-y-2">
              {projTasks.map(t => (
                <div
                  key={`${t.type}-${t.id}`}
                  className={`flex justify-between items-center p-3 rounded-lg shadow-sm hover:shadow-md transition ${
                    t.type === 'subtask'
                      ? 'bg-gray-50 ml-6 border-l-4 border-blue-300'
                      : 'bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center">
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
                    </div>
                    <div className="text-xs text-slate-400 italic">
                      {t.type === 'subtask' ? 'Subtarea' : 'Tarea'}
                    </div>
                  </div>
                  <div className="text-sm text-slate-600">
                    {t.dueDate ? t.dueDate.toLocaleDateString() : 'Sin fecha'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
