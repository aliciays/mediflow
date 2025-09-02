'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { useUser } from '@/lib/useUser';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
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
  priority?: 'low' | 'medium' | 'high';
};

type GroupMode = 'project' | 'assignee';
type StatusFilter = Array<'todo' | 'in_progress'>;
type DueFilter = 'all' | 'week' | 'overdue' | 'no_date';

const fmt = (d?: Date) =>
  d ? d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Sin fecha';


function getDueFlag(d?: Date): 'overdue' | 'week' | 'future' | 'no_date' {
  if (!d) return 'no_date';
  const now = new Date();
  const weekAhead = new Date();
  weekAhead.setDate(now.getDate() + 7);
  if (d < now) return 'overdue';
  if (d >= now && d <= weekAhead) return 'week';
  return 'future';
}

export default function PMTasksPage() {
  const { user, loading } = useUser();
  const router = useRouter();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [nameCache, setNameCache] = useState<Map<string, string>>(new Map());

  
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(['todo', 'in_progress']);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all'); 
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState<'dateAsc' | 'dateDesc' | 'priority'>('dateAsc');
  const [groupBy, setGroupBy] = useState<GroupMode>('project');

  const getUserName = async (uid?: string) => {
    if (!uid) return 'Sin asignar';
    if (nameCache.has(uid)) return nameCache.get(uid)!;
    const snap = await getDoc(doc(db, 'users', uid));
    const name = snap.exists()
      ? snap.data().displayName || snap.data().email || uid
      : uid;
    setNameCache((prev) => new Map(prev).set(uid, name));
    return name;
  };


  useEffect(() => {
    if (!user) return;

    const loadAll = async () => {
      const projSnap = await getDocs(collection(db, 'projects'));
      const projList: { id: string; name: string }[] = [];
      const allTasks: TaskItem[] = [];

      for (const proj of projSnap.docs) {
        const pdata = proj.data() as any;
        projList.push({ id: proj.id, name: pdata?.name || proj.id });

        const phasesSnap = await getDocs(collection(db, `projects/${proj.id}/phases`));
        for (const ph of phasesSnap.docs) {
          const tasksSnap = await getDocs(collection(db, `projects/${proj.id}/phases/${ph.id}/tasks`));
          for (const t of tasksSnap.docs) {
            const td = t.data() as any;
            allTasks.push({
              id: t.id,
              type: 'task',
              name: td.name,
              projectId: proj.id,
              projectName: pdata?.name || proj.id,
              phaseId: ph.id,
              taskId: t.id,
              assignedTo: td.assignedTo,
              dueDate: td.dueDate instanceof Timestamp ? td.dueDate.toDate() : undefined,
              status: td.status,
              priority: td.priority,
            });

            const subsSnap = await getDocs(
              collection(db, `projects/${proj.id}/phases/${ph.id}/tasks/${t.id}/subtasks`)
            );
            for (const s of subsSnap.docs) {
              const sd = s.data() as any;
              allTasks.push({
                id: s.id,
                type: 'subtask',
                name: sd.name,
                projectId: proj.id,
                projectName: pdata?.name || proj.id,
                phaseId: ph.id,
                taskId: t.id,
                assignedTo: sd.assignedTo,
                dueDate: sd.dueDate instanceof Timestamp ? sd.dueDate.toDate() : undefined,
                status: sd.status,
                priority: sd.priority,
              });
            }
          }
        }
      }


      const uids = new Set(allTasks.map((t) => t.assignedTo).filter(Boolean) as string[]);
      await Promise.all([...uids].map((uid) => getUserName(uid)));

      setProjects(projList);
      setTasks(allTasks);
    };

    loadAll();
  }, [user]);

  const assigneeOptions = useMemo(() => {
    const uids = new Set(tasks.map((t) => t.assignedTo || 'unassigned'));
    const arr = [...uids].map((uid) => ({
      value: uid as string,
      label: uid === 'unassigned' ? 'Sin asignar' : nameCache.get(uid as string) || 'Cargando…',
    }));
   
    return arr.sort((a, b) => a.label.localeCompare(b.label));
  }, [tasks, nameCache]);


  const filtered = useMemo(() => {
    let list = tasks.filter((t) => t.status !== 'completed'); 


    list = list.filter((t) => t.status === 'todo' || t.status === 'in_progress' ? statusFilter.includes(t.status) : false);


    if (selectedProject !== 'all') {
      list = list.filter((t) => t.projectId === selectedProject);
    }


    const now = new Date();
    const weekAhead = new Date();
    weekAhead.setDate(now.getDate() + 7);

    if (dueFilter === 'week') {
      list = list.filter((t) => t.dueDate && t.dueDate >= now && t.dueDate <= weekAhead);
    } else if (dueFilter === 'overdue') {
      list = list.filter((t) => t.dueDate && t.dueDate < now);
    } else if (dueFilter === 'no_date') {
      list = list.filter((t) => !t.dueDate);
    }


    if (assigneeFilter !== 'all') {
      if (assigneeFilter === 'unassigned') list = list.filter((t) => !t.assignedTo);
      else list = list.filter((t) => t.assignedTo === assigneeFilter);
    }


    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(needle) || t.projectName.toLowerCase().includes(needle));
    }

    const prioRank = { high: 0, medium: 1, low: 2 } as const;
    list.sort((a, b) => {
      if (sortBy === 'priority') {
        const pa = a.priority ?? 'medium';
        const pb = b.priority ?? 'medium';
        if (prioRank[pa] !== prioRank[pb]) return prioRank[pa] - prioRank[pb];
    
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.getTime() - b.dueDate.getTime();
      }
      if (sortBy === 'dateAsc') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.getTime() - b.dueDate.getTime();
      } else {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return b.dueDate.getTime() - a.dueDate.getTime();
      }
    });

    return list;
  }, [tasks, statusFilter, selectedProject, dueFilter, assigneeFilter, q, sortBy]);


  const grouped = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    const keyFn =
      groupBy === 'project'
        ? (t: TaskItem) => `${t.projectId}:::${t.projectName}`
        : (t: TaskItem) => `${t.assignedTo || 'unassigned'}:::${t.assignedTo ? nameCache.get(t.assignedTo) || '...' : 'Sin asignar'}`;

    for (const t of filtered) {
      const key = keyFn(t);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }


    const arr = [...map.entries()].map(([k, items]) => {
      const [id, label] = k.split(':::');
      return { id, label, items };
    });
    arr.sort((a, b) => a.label.localeCompare(b.label));
    return arr;
  }, [filtered, groupBy, nameCache]);

  const toggleStatusFilter = (value: 'todo' | 'in_progress') => {
    setStatusFilter((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  };

  const handleStatusChange = async (t: TaskItem, next: 'todo' | 'in_progress' | 'completed') => {
    const basePath = `projects/${t.projectId}/phases/${t.phaseId}/tasks/${t.taskId}`;
    const ref =
      t.type === 'task' ? doc(db, basePath) : doc(db, `${basePath}/subtasks/${t.id}`);

    await updateDoc(ref, { status: next });

    if (next === 'completed') {
      setTasks((prev) => prev.filter((x) => !(x.id === t.id && x.type === t.type)));
    } else {
      setTasks((prev) =>
        prev.map((x) => (x.id === t.id && x.type === t.type ? { ...x, status: next } : x))
      );
    }
  };

  const exportCSV = () => {
    const header = ['Proyecto', 'Tipo', 'Nombre', 'Responsable', 'Fecha límite', 'Estado', 'Prioridad'];
    const lines = [header.join(',')];
    filtered.forEach((t) => {
      const resp =
        t.assignedTo ? nameCache.get(t.assignedTo) || t.assignedTo : 'Sin asignar';
      lines.push(
        [
          `"${t.projectName.replace(/"/g, '""')}"`,
          t.type === 'subtask' ? 'Subtarea' : 'Tarea',
          `"${t.name.replace(/"/g, '""')}"`,
          `"${resp.replace(/"/g, '""')}"`,
          fmt(t.dueDate),
          t.status,
          t.priority || '',
        ].join(',')
      );
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tareas_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-6">Cargando…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-end gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Todas las tareas</h1>
        <div className="ml-auto flex items-center gap-2 flex-wrap">

          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
            title="Proyecto"
          >
            <option value="all">Todos los proyectos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>


          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
            title="Responsable"
          >
            <option value="all">Todos los responsables</option>
            {assigneeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>


          <select
            value={dueFilter}
            onChange={(e) => setDueFilter(e.target.value as DueFilter)}
            className="border rounded px-3 py-2 text-sm"
            title="Fecha límite"
          >
            <option value="all">Todas las fechas</option>
            <option value="week">Próximos 7 días</option>
            <option value="overdue">Atrasadas</option>
            <option value="no_date">Sin fecha</option>
          </select>

     
          <div className="flex items-center gap-1 text-sm">
            <label className="px-2 py-1 rounded border cursor-pointer select-none">
              <input
                type="checkbox"
                className="mr-1 align-middle"
                checked={statusFilter.includes('todo')}
                onChange={() => toggleStatusFilter('todo')}
              />
              Pendiente
            </label>
            <label className="px-2 py-1 rounded border cursor-pointer select-none">
              <input
                type="checkbox"
                className="mr-1 align-middle"
                checked={statusFilter.includes('in_progress')}
                onChange={() => toggleStatusFilter('in_progress')}
              />
              En progreso
            </label>
          </div>


          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="border rounded px-3 py-2 text-sm"
            title="Orden"
          >
            <option value="dateAsc">Fecha ↑</option>
            <option value="dateDesc">Fecha ↓</option>
            <option value="priority">Prioridad</option>
          </select>

          <div className="flex rounded border overflow-hidden text-sm">
            <button
              className={`px-3 py-2 ${groupBy === 'project' ? 'bg-slate-800 text-white' : 'bg-white'}`}
              onClick={() => setGroupBy('project')}
              title="Agrupar por proyecto"
            >
              Proyecto
            </button>
            <button
              className={`px-3 py-2 ${groupBy === 'assignee' ? 'bg-slate-800 text-white' : 'bg-white'}`}
              onClick={() => setGroupBy('assignee')}
              title="Agrupar por responsable"
            >
              Responsable
            </button>
          </div>


          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className="border rounded px-3 py-2 text-sm w-48"
          />

          <button onClick={exportCSV} className="px-3 py-2 rounded bg-slate-800 text-white text-sm">
            Exportar CSV
          </button>
        </div>
      </div>


      <div className="flex items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Atrasada</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> Próxima (7d)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-400" /> Sin fecha</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-sky-500" /> Futuro</span>
      </div>


      <div className="space-y-4">
        {grouped.map((group) => (
          <GroupBlock
            key={group.id}
            title={`${group.label} · ${group.items.length}`}
            onGoProject={
              groupBy === 'project'
                ? () => router.push(`/dashboard/projects/${group.id}`)
                : undefined
            }
          >
            {group.items.map((t) => {
              const flag = getDueFlag(t.dueDate);
              const dot =
                flag === 'overdue'
                  ? 'bg-red-500'
                  : flag === 'week'
                  ? 'bg-amber-500'
                  : flag === 'no_date'
                  ? 'bg-slate-400'
                  : 'bg-sky-500';
              const resp = t.assignedTo
                ? nameCache.get(t.assignedTo) || 'Cargando…'
                : 'Sin asignar';

              return (
                <div
                  key={`${t.type}-${t.id}`}
                  className={`flex justify-between items-center p-3 rounded border ${
                    t.type === 'subtask' ? 'bg-gray-50 ml-6' : 'bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <StatusPill
                          value={t.status}
                          onChange={(next) =>
                            handleStatusChange(t, next as 'todo' | 'in_progress' | 'completed')
                          }
                        />
                        <span className="font-medium">
                          {t.type === 'subtask' ? `↳ ${t.name}` : t.name}
                        </span>
                        {t.priority && (
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded border ${
                              t.priority === 'high'
                                ? 'border-red-500 text-red-600'
                                : t.priority === 'medium'
                                ? 'border-amber-500 text-amber-600'
                                : 'border-slate-400 text-slate-600'
                            }`}
                            title="Prioridad"
                          >
                            {t.priority}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        Proyecto: <span className="font-medium">{t.projectName}</span>
                        {' · '}
                        <span className="italic">{t.type === 'subtask' ? 'Subtarea' : 'Tarea'}</span>
                        {' · '}
                        Responsable: {resp}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-sm text-slate-700">{fmt(t.dueDate)}</div>
                    <button
                      className="text-xs px-2 py-1 rounded border hover:bg-slate-50"
                      onClick={() => router.push(`/dashboard/projects/${t.projectId}`)}
                    >
                      Ir al proyecto
                    </button>
                  </div>
                </div>
              );
            })}
          </GroupBlock>
        ))}

        {grouped.length === 0 && (
          <div className="p-10 text-center text-slate-500 border rounded bg-white">
            No hay tareas para mostrar. Prueba a limpiar filtros o cambiar la agrupación.
          </div>
        )}
      </div>
    </div>
  );
}

// ——— Subcomponente de agrupación colapsable ———
function GroupBlock({
  title,
  children,
  onGoProject,
}: {
  title: string;
  children: React.ReactNode;
  onGoProject?: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded border bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50">
        <button className="text-left font-medium" onClick={() => setOpen((v) => !v)}>
          {open ? '▾' : '▸'} {title}
        </button>
        {onGoProject && (
          <button className="text-xs px-2 py-1 rounded border hover:bg-white" onClick={onGoProject}>
            Ir al proyecto
          </button>
        )}
      </div>
      {open && <div className="p-3 space-y-2">{children}</div>}
    </div>
  );
}
