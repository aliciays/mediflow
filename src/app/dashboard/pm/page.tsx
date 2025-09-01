'use client';
import RequireRole from '@/components/auth/RequireRole';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
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

export default function PMDashboard() {
  const { user, loading } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasksThisWeek, setTasksThisWeek] = useState(0);
  const [criticalAlerts, setCriticalAlerts] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;

    const fetchData = async () => {
      const q = query(collection(db, 'projects'), where('managerId', '==', user.uid));
      const projSnap = await getDocs(q);

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
          // Buscar fase en progreso o primera
          const activePhase = phasesSnap.docs.find(p => p.data().status === 'in_progress');
          if (activePhase) {
            phaseName = activePhase.data().name;
          } else {
            phaseName = phasesSnap.docs[0].data().name;
          }

          // Contar tareas de todas las fases
          for (const phaseDoc of phasesSnap.docs) {
            const tasksSnap = await getDocs(collection(db, `projects/${docSnap.id}/phases/${phaseDoc.id}/tasks`));
            tasksSnap.forEach(taskDoc => {
              const t = taskDoc.data();
              totalTasksProject++;

              if (t.status === 'completed') {
                completedTasks += 1;
              } else if (t.status === 'in_progress') {
                completedTasks += 0.5;
              }

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
    <RequireRole allowed={['admin', 'project_manager']}>
      <div className="p-6 space-y-8">
        {/* RESUMEN */}
        <h1 className="text-2xl font-bold mb-4">Resumen</h1>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[`${projects.length} PROYECTOS ACTIVOS`,
            `${tasksThisWeek} TAREAS ESTA SEMANA`,
            `${criticalAlerts} ALERTAS CRÍTICAS`].map((txt, i) => (
            <div
              key={i}
              className="p-4 text-center font-semibold tracking-wide
                        bg-white border border-slate-200 rounded-xl
                        shadow-sm"
            >
              {txt}
            </div>
          ))}
        </div>

        {/* PROYECTOS ACTIVOS */}
        <h2 className="text-xl font-bold">Proyectos Activos</h2>
        <div className="space-y-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm"
            >
              <div className="flex justify-between">
                <h3 className="font-semibold">{p.name}</h3>
                <span className="text-slate-700">{p.progress}%</span>
              </div>

              {/* Progreso */}
              <div className="h-2 bg-slate-200 rounded-full mt-2 mb-3 overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${p.progress}%` }}
                />
              </div>

              <div className="flex justify-between text-sm text-slate-600">
                <span>
                  Fase: <strong className="text-slate-900">{p.phase}</strong>
                </span>
              </div>

              <div className="mt-3">
                <button
                  onClick={() => router.push(`/dashboard/projects/${p.id}`)}
                  className="inline-flex items-center h-10 px-4 rounded-lg
                            bg-blue-600 text-white font-medium
                            shadow-sm transition hover:bg-blue-700
                            focus-visible:outline-none focus-visible:ring-2
                            focus-visible:ring-blue-400 focus-visible:ring-offset-2"
                >
                  Ver detalle
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* BOTONES */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          {/* Crear proyecto (éxito sobrio) */}
          <button
            onClick={() => router.push('/dashboard/pm/new')}
            className="h-12 w-full rounded-xl bg-green-600 text-white font-semibold
                      shadow-sm transition hover:bg-green-700
                      focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-green-400 focus-visible:ring-offset-2"
          >
            Crear proyecto
          </button>

          {/* Generar reporte (secundario serio) */}
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

          {/* Analytics (primario alterno en azul) */}
          <button
            onClick={() => router.push('/analytics')}
            className="h-12 w-full rounded-xl bg-blue-600 text-white font-semibold
                      shadow-sm transition hover:bg-blue-700
                      focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-blue-400 focus-visible:ring-offset-2"
          >
            Analytics
          </button>
        </div>
      </div>
    </RequireRole>
  );
}