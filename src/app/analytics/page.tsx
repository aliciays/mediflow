'use client';

import { useEffect, useMemo, useState } from 'react';
import RequireRole from '@/components/auth/RequireRole';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
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

// ------------ Tipos ------------
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
  overdueTasks: number;   // Atrasadas  (rojo)
  dueSoonTasks: number;   // Próximas   (naranja)
  workload: Record<string, number>; // uid -> count
};

type CriticalRow = {
  projectId: string;
  projectName: string;
  itemType: 'Tarea' | 'Subtarea';
  name: string;
  assignedToName: string;
  dueDate: Date;
  status: string;
  priority?: string;
};

// ------------ Utils ------------
const fmtDate = (d: Date) =>
  d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });

const withinRange = (ts: Timestamp | undefined, days: number | 'all') => {
  if (!ts || days === 'all') return true;
  const when = ts.toDate();
  const since = new Date();
  since.setDate(since.getDate() - days);
  return when >= since;
};

// Abrevia nombres largos para el eje X y evita solapes
const truncate = (s: string, len = 14) => (s.length > len ? s.slice(0, len - 1) + '…' : s);

// Etiqueta de valor visible solo si > 0
const ValueLabel = (props: any) => {
  const { x, y, value } = props;
  if (!value) return null;
  return (
    <text x={x} y={(y ?? 0) - 6} textAnchor="middle" fontSize={12} fill="#334155">
      {value}
    </text>
  );
};

// Leyenda personalizada con chips de color y textos fijos (evita duplicados/confusión)
const LegendChip: React.FC<{ color: string }> = ({ color }) => (
  <span
    style={{
      display: 'inline-block',
      width: 10,
      height: 10,
      borderRadius: 2,
      background: color,
      marginRight: 6,
      verticalAlign: 'middle',
    }}
  />
);

const CriticalLegend = () => (
  <div className="flex gap-6 text-sm">
    <span><LegendChip color="#ef4444" />Atrasadas</span>
    <span><LegendChip color="#f59e0b" />Próximas (7d)</span>
  </div>
);

// ------------ Página ------------
export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [projectOptions, setProjectOptions] = useState<{id:string; name:string}[]>([]);
  const [userNameMap, setUserNameMap] = useState<Record<string,string>>({});

  // Filtros UI
  const [selectedProject, setSelectedProject] = useState<'all'|string>('all');
  const [rangeDays, setRangeDays] = useState<30|60|90|'all'>(30);

  // Tabla de críticas
  const [criticalRows, setCriticalRows] = useState<CriticalRow[]>([]);

  // Load everything
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Users (map para nombres)
      const usersSnap = await getDocs(collection(db, 'users'));
      const uMap: Record<string,string> = {};
      usersSnap.forEach(u => {
        const d = u.data() as any;
        uMap[u.id] = d?.displayName || d?.email || u.id;
      });
      setUserNameMap(uMap);

      // Proyectos
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
        const workload: Record<string, number> = {};

        for (const ph of phasesSnap.docs) {
          // ---- Tareas ----
          const tasksSnap = await getDocs(collection(db, `projects/${proj.id}/phases/${ph.id}/tasks`));
          for (const t of tasksSnap.docs) {
            const tData = t.data() as TaskDoc;
            totalTasks++;
            if (tData.status === 'completed') completed++;

            const inRange = withinRange(tData.dueDate, rangeDays);

            // Críticas
            if (tData.dueDate instanceof Timestamp) {
              const due = tData.dueDate.toDate();
              const isCompleted = tData.status === 'completed';
              if (!isCompleted && due < now) {
                overdue++;
                rows.push({
                  projectId: proj.id,
                  projectName,
                  itemType: 'Tarea',
                  name: tData.name,
                  assignedToName: tData.assignedTo ? (uMap[tData.assignedTo] || tData.assignedTo) : 'Sin asignar',
                  dueDate: due,
                  status: 'Atrasada',
                  priority: tData.priority,
                });
              } else if (!isCompleted && due >= now && due <= weekAhead) {
                dueSoon++;
                rows.push({
                  projectId: proj.id,
                  projectName,
                  itemType: 'Tarea',
                  name: tData.name,
                  assignedToName: tData.assignedTo ? (uMap[tData.assignedTo] || tData.assignedTo) : 'Sin asignar',
                  dueDate: due,
                  status: 'Próxima (7d)',
                  priority: tData.priority,
                });
              }
            }

            if (inRange && tData.assignedTo) {
              workload[tData.assignedTo] = (workload[tData.assignedTo] || 0) + 1;
            }

            // ---- Subtareas ----
            const subSnap = await getDocs(collection(db, `projects/${proj.id}/phases/${ph.id}/tasks/${t.id}/subtasks`));
            for (const s of subSnap.docs) {
              const sd = s.data() as any;
              if (sd?.dueDate instanceof Timestamp) {
                const due = sd.dueDate.toDate();
                const isCompleted = sd.status === 'completed';
                if (!isCompleted && due < now) {
                  overdue++;
                  rows.push({
                    projectId: proj.id,
                    projectName,
                    itemType: 'Subtarea',
                    name: sd.name,
                    assignedToName: sd.assignedTo ? (uMap[sd.assignedTo] || sd.assignedTo) : 'Sin asignar',
                    dueDate: due,
                    status: 'Atrasada',
                    priority: sd.priority,
                  });
                } else if (!isCompleted && due >= now && due <= weekAhead) {
                  dueSoon++;
                  rows.push({
                    projectId: proj.id,
                    projectName,
                    itemType: 'Subtarea',
                    name: sd.name,
                    assignedToName: sd.assignedTo ? (uMap[sd.assignedTo] || sd.assignedTo) : 'Sin asignar',
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
          workload,
        });
      }

      setKpis(allKPIs);

      // Orden tabla
      rows.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'Atrasada' ? -1 : 1;
        return a.dueDate.getTime() - b.dueDate.getTime();
      });
      setCriticalRows(rows);

      setLoading(false);
    };

    load();
  }, [rangeDays]);

  // Filtro por proyecto en gráfico/tabla
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

  // Workload agregado (con nombres)
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

  // Tabla críticas filtrada
  const filteredRows = useMemo(() => {
    if (selectedProject === 'all') return criticalRows;
    return criticalRows.filter(r => r.projectId === selectedProject);
  }, [criticalRows, selectedProject]);

  // CSV
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

  if (loading) return <div className="p-6">Cargando…</div>;

  return (
    <RequireRole allowed={['project_manager']}>
      <div className="p-6 space-y-8">
        <div className="flex items-end gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">Analytics</h1>

          <div className="ml-auto flex gap-3">
            <select
              className="rounded border px-3 py-2"
              value={selectedProject}
              onChange={(e)=>setSelectedProject(e.target.value as any)}
            >
              <option value="all">Todos los proyectos</option>
              {projectOptions.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <select
              className="rounded border px-3 py-2"
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
          </div>
        </div>

        {/* KPI principal */}
        <div className="bg-white p-4 shadow rounded">
          <h2 className="font-semibold mb-2">Progreso medio (selección)</h2>
          <p className="text-3xl">{globalProgress}%</p>
        </div>

        {/* Críticas por proyecto — gráfico mejorado */}
        <div className="bg-white p-4 shadow rounded">
          <h2 className="font-semibold mb-4">
            Tareas críticas por proyecto (atrasadas y próximas a 7 días)
          </h2>

          {/* Leyenda personalizada fija */}
          <div className="mb-2"><CriticalLegend /></div>

          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={filteredKPIs.map(k => ({
                ...k,
                shortName: truncate(k.projectName),
              }))}
              margin={{ top: 10, right: 20, bottom: 70, left: 0 }}
              barGap={6}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="shortName"
                interval={0}
                angle={-28}
                textAnchor="end"
                height={70}
              />
              <YAxis allowDecimals={false}/>
              <Tooltip
                formatter={(v: any, n: string) => [
                  v,
                  n === 'overdueTasks' ? 'Atrasadas' : 'Próximas (7d)',
                ]}
                labelFormatter={(_, payload) => {
                  const full = payload?.[0]?.payload?.projectName ?? '';
                  return `Proyecto: ${full}`;
                }}
              />
              {/* Usamos Legend solo para spacing, pero sin contenido (ya tenemos custom) */}
              <Legend content={() => null} />

              {/* Atrasadas (rojo) */}
              <Bar dataKey="overdueTasks" fill="#ef4444">
                <LabelList content={<ValueLabel />} />
              </Bar>

              {/* Próximas (naranja) */}
              <Bar dataKey="dueSoonTasks" fill="#f59e0b">
                <LabelList content={<ValueLabel />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Workload por técnico */}
        <div className="bg-white p-4 shadow rounded">
          <h2 className="font-semibold mb-4">Workload por técnico</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={workloadData}
              margin={{ top: 10, right: 20, bottom: 60, left: 0 }}
              barSize={28}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={70}/>
              <YAxis allowDecimals={false}/>
              <Tooltip formatter={(v: any) => [v, 'Tareas activas']} labelFormatter={(label) => `Técnico: ${label}`} />
              <Bar dataKey="count" name="Tareas activas" fill="#60a5fa">
                <LabelList content={<ValueLabel />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tabla de tareas críticas */}
        <div className="bg-white p-4 shadow rounded">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Tareas críticas (lista detallada)</h2>
            <button
              onClick={exportCSV}
              className="px-3 py-2 rounded bg-slate-800 text-white text-sm"
            >
              Exportar CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
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
                  <tr key={idx} className="border-b">
                    <td className="py-2 pr-4">{r.projectName}</td>
                    <td className="py-2 pr-4">{r.itemType}</td>
                    <td className="py-2 pr-4">{r.name}</td>
                    <td className="py-2 pr-4">{r.assignedToName}</td>
                    <td className="py-2 pr-4">{fmtDate(r.dueDate)}</td>
                    <td className={`py-2 pr-4 ${r.status === 'Atrasada' ? 'text-red-600' : 'text-amber-600'}`}>
                      {r.status}
                    </td>
                    <td className="py-2 pr-4">{r.priority || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </RequireRole>
  );
}
