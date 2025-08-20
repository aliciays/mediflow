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
          <div className="p-4 bg-white shadow rounded text-center">
            {projects.length} PROYECTOS ACTIVOS
          </div>
          <div className="p-4 bg-white shadow rounded text-center">
            {tasksThisWeek} TAREAS ESTA SEMANA
          </div>
          <div className="p-4 bg-white shadow rounded text-center">
            {criticalAlerts} ALERTAS CRÍTICAS
          </div>
        </div>

        {/* PROYECTOS ACTIVOS */}
        <h2 className="text-xl font-bold">Proyectos Activos</h2>
        <div className="space-y-4">
          {projects.map(p => (
            <div key={p.id} className="p-4 bg-white shadow rounded">
              <div className="flex justify-between">
                <h3 className="font-semibold">{p.name}</h3>
                <span>{p.progress}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded mt-1 mb-3">
                <div
                  className="h-2 bg-blue-500 rounded"
                  style={{ width: `${p.progress}%` }}
                />
              </div>
              <div className="flex justify-between text-sm">
                <span>Fase: {p.phase}</span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <button className="px-3 py-1 bg-blue-500 text-white rounded" onClick={() => router.push(`/dashboard/projects/${p.id}`)}>
                  Ver detalle
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* BOTONES */}
        <div style={{ display: "flex", gap: "16px", marginTop: "24px" }}>
          <button
            onClick={() => router.push('/dashboard/pm/new')}
            style={{
              flex: 1,
              height: "48px",
              border: "none",
              borderRadius: "12px",
              background: "linear-gradient(135deg,#22c55e,#16a34a)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "16px",
              cursor: "pointer",
              boxShadow: "0 10px 20px rgba(0,0,0,.15)",
            }}
            onMouseOver={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
            onMouseOut={(e) => (e.currentTarget.style.filter = "brightness(1)")}
          >
            Crear proyecto
          </button>

          <button
            onClick={() => router.push('/reports')}
            style={{
              flex: 1,
              height: "48px",
              border: "none",
              borderRadius: "12px",
              background: "linear-gradient(135deg,#f59e0b,#d97706)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "16px",
              cursor: "pointer",
              boxShadow: "0 10px 20px rgba(0,0,0,.15)",
            }}
            onMouseOver={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
            onMouseOut={(e) => (e.currentTarget.style.filter = "brightness(1)")}
          >
            Generar reporte
          </button>

          <button
            onClick={() => router.push('/analytics')}
            style={{
              flex: 1,
              height: "48px",
              border: "none",
              borderRadius: "12px",
              background: "linear-gradient(135deg,#8b5cf6,#7c3aed)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "16px",
              cursor: "pointer",
              boxShadow: "0 10px 20px rgba(0,0,0,.15)",
            }}
            onMouseOver={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
            onMouseOut={(e) => (e.currentTarget.style.filter = "brightness(1)")}
          >
            Analytics
          </button>
        </div>

      </div>
    </RequireRole>
  );
}
