'use client';

import RequireRole from '@/components/auth/RequireRole';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, Timestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useUser } from '@/lib/useUser';
import { useRouter } from 'next/navigation';

type Project = {
  id: string;
  name: string;
  progress: number;
  phase: string;
  managerId: string;
};

export default function AdminDashboard() {
  const { user, loading } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasksThisWeek, setTasksThisWeek] = useState(0);
  const [criticalAlerts, setCriticalAlerts] = useState(0);
  const [hoverId, setHoverId] = useState<string | null>(null); // UI hover
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;

    const fetchData = async () => {
      const q = query(collection(db, 'projects'));
      const projSnap = await getDocs(q);

      const projList: Project[] = [];
      let totalTasksThisWeek = 0;
      let totalCritical = 0;

      const now = new Date();
      const weekAhead = new Date();
      weekAhead.setDate(now.getDate() + 7);

      for (const docSnap of projSnap.docs) {
        const projData = docSnap.data() as any;

        let phaseName = 'Sin fase asignada';
        let completedTasks = 0;
        let totalTasksProject = 0;

        const phasesSnap = await getDocs(collection(db, `projects/${docSnap.id}/phases`));

        if (!phasesSnap.empty) {
          const activePhase = phasesSnap.docs.find(p => p.data().status === 'in_progress');
          if (activePhase) phaseName = activePhase.data().name;
          else phaseName = phasesSnap.docs[0].data().name;

          for (const phaseDoc of phasesSnap.docs) {
            const tasksSnap = await getDocs(collection(db, `projects/${docSnap.id}/phases/${phaseDoc.id}/tasks`));
            tasksSnap.forEach(taskDoc => {
              const t = taskDoc.data() as any;
              totalTasksProject++;

              if (t.status === 'completed') completedTasks += 1;
              else if (t.status === 'in_progress') completedTasks += 0.5;

              if (t.dueDate instanceof Timestamp) {
                const due = t.dueDate.toDate();
                if (due >= now && due <= weekAhead) totalTasksThisWeek++;
                if (t.priority === 'high' && due < now && t.status !== 'completed') totalCritical++;
              }
            });
          }
        }

        const progress =
          totalTasksProject > 0 ? Math.round((completedTasks / totalTasksProject) * 100) : 0;

        projList.push({
          id: docSnap.id,
          name: projData.name,
          managerId: projData.managerId,
          phase: phaseName,
          progress,
        });
      }

      setProjects(projList);
      setTasksThisWeek(totalTasksThisWeek);
      setCriticalAlerts(totalCritical);
    };

    fetchData();
  }, [user, loading]);

  return (
  <RequireRole allowed={['admin']}>
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold mb-4">Resumen</h1>

      {/* Métricos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[`${projects.length} PROYECTOS ACTIVOS`, `${tasksThisWeek} TAREAS ESTA SEMANA`, `${criticalAlerts} ALERTAS CRÍTICAS`].map(
          (txt, i) => (
            <div
              key={i}
              className="p-4 text-center font-bold tracking-wide bg-white border border-slate-200 rounded-2xl shadow-[0_6px_16px_rgba(2,6,23,.05)]"
            >
              {txt}
            </div>
          )
        )}
      </div>

      <h2 className="text-xl font-bold">Proyectos Activos</h2>

      <div className="space-y-4">
        {projects.map((p) => {
          const hovered = hoverId === p.id;
          return (
            <div
              key={p.id}
              onMouseEnter={() => setHoverId(p.id)}
              onMouseLeave={() => setHoverId(null)}
              className={[
                "p-4 bg-white border border-slate-200 rounded-2xl transition",
                hovered
                  ? "shadow-[0_14px_30px_rgba(2,6,23,.08)] -translate-y-0.5"
                  : "shadow-[0_8px_18px_rgba(2,6,23,.04)]",
              ].join(" ")}
            >
              {/* Header */}
              <div className="flex justify-between items-start">
                <h3 className="font-semibold text-[16px]">{p.name}</h3>
                <span className="text-[14px] text-slate-700">{p.progress}%</span>
              </div>

              {/* Progreso */}
              <div className="h-2 mt-2 mb-3 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-blue-500 to-blue-600"
                  style={{ width: `${p.progress}%` }}
                />
              </div>

              {/* Meta */}
              <div className="flex justify-between text-sm text-slate-600">
                <span>
                  Fase: <strong className="text-slate-900">{p.phase}</strong>
                </span>
              </div>

              {/* CTA */}
              <div className="mt-3">
                <button
                  onClick={() => router.push(`/dashboard/projects/${p.id}`)}
                  title="Ver detalle del proyecto"
                  className="
                    inline-flex items-center gap-2
                    h-10 px-4
                    rounded-xl
                    text-white font-semibold
                    bg-gradient-to-br from-blue-600 to-blue-700
                    shadow-[0_8px_18px_rgba(37,99,235,.25)]
                    transition transform
                    hover:brightness-110 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(37,99,235,.32)]
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2
                  "
                >
                  Ver detalle
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M13.172 12l-4.95-4.95 1.414-1.414L16 12l-6.364 6.364-1.414-1.414z" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>


      
      <button
            onClick={() => router.push('/reports')}
            className="h-12 w-full rounded-xl bg-white text-slate-800 font-semibold
                      border border-slate-300 shadow-sm
                      transition hover:bg-slate-50
                      focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-slate-300 focus-visible:ring-offset-2"
          >
            Generar reporte
          </button>
      </div>

  </RequireRole>
);


}
