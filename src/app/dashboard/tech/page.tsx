'use client';

import RequireRole from '@/components/auth/RequireRole';
import { db } from '@/lib/firebase';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
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

export default function TechDashboard() {
  const { user, loading } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasksThisWeek, setTasksThisWeek] = useState(0);
  const [criticalAlerts, setCriticalAlerts] = useState(0);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;

    const fetchData = async () => {
      const projSnap = await getDocs(collection(db, 'projects'));

      const projList: Project[] = [];
      let totalTasksThisWeek = 0;
      let totalCritical = 0;

      const now = new Date();
      const weekAhead = new Date();
      weekAhead.setDate(now.getDate() + 7);

      for (const docSnap of projSnap.docs) {
        const projData = docSnap.data() as Project;

        let phaseName = 'Sin fase asignada';
        let completedTasks = 0;
        let totalTasksProject = 0;

        const phasesSnap = await getDocs(collection(db, `projects/${docSnap.id}/phases`));

        if (!phasesSnap.empty) {
          const activePhase = phasesSnap.docs.find(p => p.data().status === 'in_progress');
          if (activePhase) {
            phaseName = activePhase.data().name;
          } else {
            phaseName = phasesSnap.docs[0].data().name;
          }

          for (const phaseDoc of phasesSnap.docs) {
            const tasksSnap = await getDocs(collection(db, `projects/${docSnap.id}/phases/${phaseDoc.id}/tasks`));
            tasksSnap.forEach(taskDoc => {
              const t = taskDoc.data() as any;
              totalTasksProject++;

              if (t.status === 'completed') completedTasks += 1;
              else if (t.status === 'in_progress') completedTasks += 0.5;

              if (t.dueDate instanceof Timestamp) {
                const due = t.dueDate.toDate();
                if (due >= now && due <= weekAhead) {
                  totalTasksThisWeek++;
                }
                if (t.priority === 'high' && due < now && t.status !== 'completed') {
                  totalCritical++;
                }
              }
            });
          }
        }

        const progress =
          totalTasksProject > 0
            ? Math.round((completedTasks / totalTasksProject) * 100)
            : 0;

        projList.push({
          id: docSnap.id,
          name: projData.name,
          managerId: projData.managerId,
          phase: phaseName,
          progress
        });
      }

      setProjects(projList);
      setTasksThisWeek(totalTasksThisWeek);
      setCriticalAlerts(totalCritical);
    };

    fetchData();
  }, [user, loading]);

  return (
    <RequireRole allowed={['technician']}>
      <div className="p-6 space-y-8">
        <h1 className="text-2xl font-bold mb-4">Resumen</h1>

        {/* Métricas principales */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[`${projects.length} PROYECTOS ACTIVOS`, `${tasksThisWeek} TAREAS ESTA SEMANA`, `${criticalAlerts} ALERTAS CRÍTICAS`].map(
            (txt, i) => (
              <div
                key={i}
                className="p-4 bg-white rounded-xl text-center font-semibold shadow hover:shadow-md transition"
              >
                {txt}
              </div>
            )
          )}
        </div>

        <h2 className="text-xl font-bold">Proyectos Activos</h2>

        {/* Lista de proyectos */}
        <div className="space-y-4">
          {projects.map(p => {
            const hovered = hoverId === p.id;
            return (
              <div
                key={p.id}
                onMouseEnter={() => setHoverId(p.id)}
                onMouseLeave={() => setHoverId(null)}
                className={`p-4 bg-white rounded-xl cursor-pointer transition
                  ${hovered ? 'shadow-lg -translate-y-0.5' : 'shadow'}
                `}
              >
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold">{p.name}</h3>
                  <span className="text-sm text-slate-600">{p.progress}%</span>
                </div>

                {/* Barra de progreso */}
                <div className="h-2 bg-gray-200 rounded mt-2 mb-3 overflow-hidden">
                  <div
                    className="h-2 bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                    style={{ width: `${p.progress}%` }}
                  />
                </div>

                <div className="flex justify-between text-sm text-slate-600">
                  <span>
                    Fase: <strong className="text-slate-800">{p.phase}</strong>
                  </span>
                </div>

                <div className="flex justify-end mt-3">
                  <button
                    onClick={() => router.push(`/dashboard/projects/${p.id}`)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 shadow hover:brightness-105 transition"
                  >
                    Ver detalle
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* TECH: sin botones extra */}
      </div>
    </RequireRole>
  );
}
