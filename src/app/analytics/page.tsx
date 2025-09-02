'use client';

import { useEffect, useMemo, useState } from 'react';
import RequireRole from '@/components/auth/RequireRole';
import { db } from '@/lib/firebase';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import {
  ResponsiveContainer,
  BarChart,
  XAxis,
  YAxis,
  Bar,
  CartesianGrid,
  Legend,
  Tooltip,
  LabelList,
} from 'recharts';

type TaskDoc = {
  name: string;
  status?: 'todo'|'in_progress'|'completed';
  assignedTo?: string;
  dueDate?: Timestamp;
  priority?: 'low'|'medium'|'high';
};
type KPI = {
  projectId: string;
  projectName: string;
  progress: number;
  overdueTasks: number;   
  dueSoonTasks: number;   
  unassigned: number;     
  highCritical: number;   
  workload: Record<string, number>; 
};

type CriticalRow = {
  projectId: string;
  projectName: string;
  itemType: 'Tarea' | 'Subtarea';
  name: string;
  assignedToName: string;
  assignedTo?: string;
  dueDate: Date;
  status: 'Atrasada' | 'Próxima (7d)';
  priority?: 'low'|'medium'|'high';
};


const fmtDate = (d: Date) =>
  d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });

const withinRange = (ts: Timestamp | undefined, days: number | 'all') => {
  if (!ts || days === 'all') return true;
  const when = ts.toDate();
  const since = new Date();
  since.setDate(since.getDate() - days);
  return when >= since;
};


const ValueLabel = (props: any) => {
  const { x, y, value } = props;
  if (!value) return null;
  return (
    <text x={x} y={(y ?? 0) - 6} textAnchor="middle" fontSize={12} fill="#334155">
      {value}
    </text>
  );
};


const MultiLineTick = (props: any) => {
  const { x, y, payload } = props;
  const words = String(payload.value).split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = (line ? line + ' ' : '') + w;
    if (test.length > 14) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const dyStart = -4 * (lines.length - 1);
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill="#334155" fontSize={12}>
        {lines.map((ln, i) => (
          <tspan key={i} x={0} dy={i === 0 ? dyStart : 14}>{ln}</tspan>
        ))}
      </text>
    </g>
  );
};

const LegendChip: React.FC<{ color: string }> = ({ color }) => (
  <span className="inline-block w-2.5 h-2.5 rounded-sm align-middle mr-1" style={{ background: color }} />
);
const CriticalLegend = () => (
  <div className="flex gap-6 text-sm text-slate-700">
    <span><LegendChip color="#ef4444" />Atrasadas</span>
    <span><LegendChip color="#f59e0b" />Próximas (7d)</span>
  </div>
);


export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [projectOptions, setProjectOptions] = useState<{id:string; name:string}[]>([]);
  const [userNameMap, setUserNameMap] = useState<Record<string,string>>({});


  const [selectedProject, setSelectedProject] = useState<'all'|string>('all');
  const [rangeDays, setRangeDays] = useState<30|60|90|'all'>(30);


  const [criticalRows, setCriticalRows] = useState<CriticalRow[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);


      const usersSnap = await getDocs(collection(db, 'users'));
      const uMap: Record<string,string> = {};
      usersSnap.forEach(u => {
        const d = u.data() as any;
        uMap[u.id] = d?.displayName || d?.email || u.id;
      });
      setUserNameMap(uMap);


      const projSnap = await getDocs(collection(db, 'projects'));
      const projects = projSnap.docs.map(p => ({ id: p.id, name: (p.data() as any).name || p.id }));
      setProjectOptions(projects);

      const now = new Date();
      const weekAhead = new Date();
      weekAhead.setDate(now.getDate() + 7);

      const allKPIs: KPI[] = [];
      const rows: CriticalRow[] = [];

      for (const proj of projSnap.docs) {
        const pData = proj.data() as any;
        const projectName = pData.name || proj.id;

        const phasesSnap = await getDocs(collection(db, `projects/${proj.id}/phases`));

        let totalTasks = 0;
        let completed = 0;
        let overdue = 0;
        let dueSoon = 0;
        let unassigned = 0;
        let highCritical = 0;
        const workload: Record<string, number> = {};

        for (const ph of phasesSnap.docs) {
          const tasksSnap = await getDocs(collection(db, `projects/${proj.id}/phases/${ph.id}/tasks`));
          for (const t of tasksSnap.docs) {
            const tData = t.data() as TaskDoc;
            totalTasks++;
            if (tData.status === 'completed') completed++;

            const inRange = withinRange(tData.dueDate, rangeDays);

            if (tData.assignedTo == null && tData.status !== 'completed') {
              unassigned++;
            }

            if (tData.dueDate instanceof Timestamp) {
              const due = tData.dueDate.toDate();
              const isCompleted = tData.status === 'completed';
              if (!isCompleted && due < now) {
                overdue++;
                if (tData.priority === 'high') highCritical++;
                rows.push({
                  projectId: proj.id,
                  projectName,
                  itemType: 'Tarea',
                  name: tData.name,
                  assignedToName: tData.assignedTo ? (uMap[tData.assignedTo] || tData.assignedTo) : 'Sin asignar',
                  assignedTo: tData.assignedTo,
                  dueDate: due,
                  status: 'Atrasada',
                  priority: tData.priority,
                });
              } else if (!isCompleted && due >= now && due <= weekAhead) {
                dueSoon++;
                if (tData.priority === 'high') highCritical++;
                rows.push({
                  projectId: proj.id,
                  projectName,
                  itemType: 'Tarea',
                  name: tData.name,
                  assignedToName: tData.assignedTo ? (uMap[tData.assignedTo] || tData.assignedTo) : 'Sin asignar',
                  assignedTo: tData.assignedTo,
                  dueDate: due,
                  status: 'Próxima (7d)',
                  priority: tData.priority,
                });
              }
            }

            if (inRange && tData.assignedTo) {
              workload[tData.assignedTo] = (workload[tData.assignedTo] || 0) + 1;
            }


            const subSnap = await getDocs(collection(db, `projects/${proj.id}/phases/${ph.id}/tasks/${t.id}/subtasks`));
            for (const s of subSnap.docs) {
              const sd = s.data() as any;

              if (sd?.assignedTo == null && sd?.status !== 'completed') {
                unassigned++;
              }

              if (sd?.dueDate instanceof Timestamp) {
                const due = sd.dueDate.toDate();
                const isCompleted = sd.status === 'completed';
                if (!isCompleted && due < now) {
                  overdue++;
                  if (sd.priority === 'high') highCritical++;
                  rows.push({
                    projectId: proj.id,
                    projectName,
                    itemType: 'Subtarea',
                    name: sd.name,
                    assignedToName: sd.assignedTo ? (uMap[sd.assignedTo] || sd.assignedTo) : 'Sin asignar',
                    assignedTo: sd.assignedTo,
                    dueDate: due,
                    status: 'Atrasada',
                    priority: sd.priority,
                  });
                } else if (!isCompleted && due >= now && due <= weekAhead) {
                  dueSoon++;
                  if (sd.priority === 'high') highCritical++;
                  rows.push({
                    projectId: proj.id,
                    projectName,
                    itemType: 'Subtarea',
                    name: sd.name,
                    assignedToName: sd.assignedTo ? (uMap[sd.assignedTo] || sd.assignedTo) : 'Sin asignar',
                    assignedTo: sd.assignedTo,
                    dueDate: due,
                    status: 'Próxima (7d)',
                    priority: sd.priority,
                  });
                }
              }
              if (withinRange(sd?.dueDate, rangeDays) && sd?.assignedTo) {
                workload[sd.assignedTo] = (workload[sd.assignedTo] || 0) + 1;
              }
            }
          }
        }

        allKPIs.push({
          projectId: proj.id,
          projectName,
          progress: totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0,
          overdueTasks: overdue,
          dueSoonTasks: dueSoon,
          unassigned,
          highCritical,
          workload,
        });
      }

      rows.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'Atrasada' ? -1 : 1;
        return a.dueDate.getTime() - b.dueDate.getTime();
      });

      setKpis(allKPIs);
      setCriticalRows(rows);
      setLoading(false);
    };

    load();
  }, [rangeDays]);


  const filteredKPIs = useMemo(() => {
    if (selectedProject === 'all') return kpis;
    return kpis.filter(k => k.projectId === selectedProject);
  }, [kpis, selectedProject]);

  const globalProgress = useMemo(() => {
    const list = filteredKPIs;
    if (!list.length) return 0;
    const avg = list.reduce((acc, p) => acc + p.progress, 0) / list.length;
    return Math.round(avg);
  }, [filteredKPIs]);

  const aggregated = useMemo(() => {
    const sum = filteredKPIs.reduce(
      (acc, p) => {
        acc.overdue += p.overdueTasks;
        acc.dueSoon += p.dueSoonTasks;
        acc.unassigned += p.unassigned;
        acc.highCritical += p.highCritical;
        return acc;
      },
      { overdue: 0, dueSoon: 0, unassigned: 0, highCritical: 0 }
    );
    return sum;
  }, [filteredKPIs]);

  const workloadData = useMemo(() => {
    const merged: Record<string, number> = {};
    for (const k of filteredKPIs) {
      for (const uid in k.workload) {
        merged[uid] = (merged[uid] || 0) + k.workload[uid];
      }
    }
    const arr = Object.entries(merged).map(([uid, count]) => ({
      name: userNameMap[uid] || uid,
      count,
    }));
    arr.sort((a,b)=> b.count - a.count);
    return arr;
  }, [filteredKPIs, userNameMap]);

  const filteredRows = useMemo(() => {
    if (selectedProject === 'all') return criticalRows;
    return criticalRows.filter(r => r.projectId === selectedProject);
  }, [criticalRows, selectedProject]);

  const avgOverdueDays = useMemo(() => {
    const now = Date.now();
    const overdue = filteredRows.filter(r => r.status === 'Atrasada');
    if (!overdue.length) return 0;
    const days = overdue.reduce((acc, r) => acc + Math.max(0, (now - r.dueDate.getTime()) / 86400000), 0) / overdue.length;
    return Math.round(days);
  }, [filteredRows]);


  const exportCSV = () => {
    const header = ['Proyecto','Tipo','Nombre','Responsable','Fecha límite','Estado','Prioridad'];
    const lines = [header.join(',')];
    filteredRows.forEach(r => {
      lines.push([
        `"${r.projectName.replace(/"/g,'""')}"`,
        r.itemType,
        `"${r.name.replace(/"/g,'""')}"`,
        `"${r.assignedToName.replace(/"/g,'""')}"`,
        fmtDate(r.dueDate),
        r.status,
        r.priority || '',
      ].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tareas_criticas_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-24 bg-white border border-slate-200 rounded-2xl animate-pulse" />
        <div className="h-80 bg-white border border-slate-200 rounded-2xl animate-pulse" />
        <div className="h-72 bg-white border border-slate-200 rounded-2xl animate-pulse" />
        <div className="h-64 bg-white border border-slate-200 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <RequireRole allowed={['project_manager']}>
      <div className="p-6 space-y-6">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Analytics del proyecto</h1>
            <p className="text-sm text-slate-600">Vista ejecutiva con foco en riesgos, carga y progreso</p>
          </div>

          <div className="ml-auto flex gap-3">
            <div className="relative">
              <select
                className="w-full appearance-none rounded-xl border border-slate-300 bg-white px-4 py-2.5 pr-10 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                value={selectedProject}
                onChange={(e)=>setSelectedProject(e.target.value as any)}
              >
                <option value="all">Todos los proyectos</option>
                {projectOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">▼</span>
            </div>

            <div className="relative">
              <select
                className="w-full appearance-none rounded-xl border border-slate-300 bg-white px-4 py-2.5 pr-10 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                value={String(rangeDays)}
                onChange={(e)=>{
                  const v = e.target.value === 'all' ? 'all' : Number(e.target.value) as 30|60|90;
                  setRangeDays(v);
                }}
              >
                <option value="30">Últimos 30 días</option>
                <option value="60">Últimos 60 días</option>
                <option value="90">Últimos 90 días</option>
                <option value="all">Todas las fechas</option>
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">▼</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">Progreso medio</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-slate-900">{globalProgress}%</span>
              <span className="text-xs text-slate-500">sobre selección</span>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">Atrasadas</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-3xl font-bold text-rose-600">{aggregated.overdue}</span>
              <span className="text-xs text-slate-500">tareas</span>
            </div>
            {avgOverdueDays > 0 && (
              <p className="text-xs text-slate-500 mt-1">Media retraso: <span className="font-medium text-slate-700">{avgOverdueDays} días</span></p>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">Próximas (7d)</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-3xl font-bold text-amber-600">{aggregated.dueSoon}</span>
              <span className="text-xs text-slate-500">tareas</span>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">Riesgo inmediato</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-3xl font-bold text-indigo-700">{aggregated.highCritical}</span>
              <span className="text-xs text-slate-500">alta prioridad (overdue/7d)</span>
            </div>
            {aggregated.unassigned > 0 && (
              <p className="text-xs text-slate-500 mt-1">Sin asignar: <span className="font-medium text-slate-700">{aggregated.unassigned}</span></p>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-slate-900">Tareas críticas por proyecto</h2>
            <CriticalLegend />
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart
              data={filteredKPIs.map(k => ({ ...k }))}
              margin={{ top: 10, right: 20, bottom: 30, left: 0 }}
              barGap={6}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="projectName" interval={0} height={48} tick={<MultiLineTick />} />
              <YAxis allowDecimals={false}/>
              <Tooltip
                formatter={(v: any, n: string) => [v, n === 'overdueTasks' ? 'Atrasadas' : 'Próximas (7d)']}
                labelFormatter={(_, payload) => `Proyecto: ${payload?.[0]?.payload?.projectName ?? ''}`}
              />
              <Legend />
              <Bar dataKey="overdueTasks" name="Atrasadas" fill="#ef4444" radius={[6,6,0,0]}>
                <LabelList content={<ValueLabel />} />
              </Bar>
              <Bar dataKey="dueSoonTasks" name="Próximas (7d)" fill="#f59e0b" radius={[6,6,0,0]}>
                <LabelList content={<ValueLabel />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900 mb-3">Workload por técnico (rango seleccionado)</h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={workloadData} margin={{ top: 10, right: 20, bottom: 30, left: 0 }} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" interval={0} height={48} tick={<MultiLineTick />} />
              <YAxis allowDecimals={false}/>
              <Tooltip formatter={(v: any) => [v, 'Tareas activas']} labelFormatter={(label) => `Técnico: ${label}`} />
              <Bar dataKey="count" name="Tareas activas" fill="#3b82f6" radius={[6,6,0,0]}>
                <LabelList content={<ValueLabel />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900">Tareas críticas (detalle)</h2>
            <button
              onClick={exportCSV}
              title="Exportar a CSV"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 text-white font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              Exportar CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Proyecto</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Responsable</th>
                  <th className="py-2 pr-4">Fecha límite</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Prioridad</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">
                      ¡Sin elementos críticos para la selección!
                    </td>
                  </tr>
                )}
                {filteredRows.map((r, idx) => (
                  <tr key={idx} className="border-b hover:bg-slate-50/60">
                    <td className="py-2 pr-4">{r.projectName}</td>
                    <td className="py-2 pr-4">{r.itemType}</td>
                    <td className="py-2 pr-4">{r.name}</td>
                    <td className="py-2 pr-4">{r.assignedToName}</td>
                    <td className="py-2 pr-4">{fmtDate(r.dueDate)}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          r.status === 'Atrasada'
                            ? 'inline-flex items-center rounded-md bg-rose-100 text-rose-700 px-2 py-0.5'
                            : 'inline-flex items-center rounded-md bg-amber-100 text-amber-700 px-2 py-0.5'
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {r.priority ? (
                        <span
                          className={
                            r.priority === 'high'
                              ? 'inline-flex items-center rounded-md bg-violet-100 text-violet-700 px-2 py-0.5'
                              : r.priority === 'medium'
                              ? 'inline-flex items-center rounded-md bg-sky-100 text-sky-700 px-2 py-0.5'
                              : 'inline-flex items-center rounded-md bg-slate-100 text-slate-700 px-2 py-0.5'
                          }
                        >
                          {r.priority === 'high' ? 'Alta' : r.priority === 'medium' ? 'Media' : 'Baja'}
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {workloadData.length > 0 && (
            <div className="mt-3 text-xs text-slate-500">
              Top carga:{" "}
              {workloadData.slice(0, 3).map((w, i) => (
                <span key={w.name} className="mr-2">
                  <span className="font-medium text-slate-700">{w.name}</span> ({w.count})
                  {i < Math.min(2, workloadData.length - 1) ? ',' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </RequireRole>
  );
}
