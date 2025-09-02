'use client';

import RequireRole from '@/components/auth/RequireRole';
import { db } from '@/lib/firebase';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Project = { id: string; name: string; progress: number; phase: string };

export default function ViewerDashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [inProgress, setInProgress] = useState(0);
  const [milestonesSoon, setMilestonesSoon] = useState<number>(0);
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      const projSnap = await getDocs(collection(db, 'projects'));
      const now = new Date();
      const in14 = new Date(); in14.setDate(now.getDate() + 14);

      const projList: Project[] = [];
      let tasksInProgress = 0;
      let msSoon = 0;

      for (const p of projSnap.docs) {
        let phaseName = 'Sin fase';
        let completed = 0; let total = 0;

        const phasesSnap = await getDocs(collection(db, `projects/${p.id}/phases`));
        if (!phasesSnap.empty) {
          const active = phasesSnap.docs.find(x => x.data().status === 'in_progress');
          phaseName = (active?.data().name) || phasesSnap.docs[0].data().name;

          for (const ph of phasesSnap.docs) {
            const tasksSnap = await getDocs(collection(db, `projects/${p.id}/phases/${ph.id}/tasks`));
            tasksSnap.forEach(t => {
              const td = t.data();
              total += 1;
              if (td.status === 'completed') completed += 1;
              else if (td.status === 'in_progress') { completed += 0.5; tasksInProgress += 1; }
              if (td.dueDate instanceof Timestamp) {
                const d = td.dueDate.toDate();
                if (d >= now && d <= in14) msSoon += 1; 
              }
            });
          }
        }

        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
        projList.push({ id: p.id, name: p.data().name, phase: phaseName, progress });
      }

      setProjects(projList);
      setInProgress(tasksInProgress);
      setMilestonesSoon(msSoon);
    };
    fetchData();
  }, []);

  return (
    <RequireRole allowed={['viewer']}>
      <div className="p-6 space-y-8">
        <h1 className="text-2xl font-bold">Dashboard — Viewer</h1>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-white shadow rounded text-center">{projects.length} PROYECTOS ACTIVOS</div>
          <div className="p-4 bg-white shadow rounded text-center">{inProgress} TAREAS EN CURSO</div>
          <div className="p-4 bg-white shadow rounded text-center">{milestonesSoon} HITOS PRÓXIMOS (14 días)</div>
        </div>

        <h2 className="text-xl font-bold">Proyectos</h2>
        <div className="space-y-4">
          {projects.map(p => (
            <div key={p.id} className="p-4 bg-white shadow rounded">
              <div className="flex justify-between">
                <h3 className="font-semibold">{p.name}</h3>
                <span>{p.progress}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded mt-1 mb-2">
                <div className="h-2 bg-blue-500 rounded" style={{ width: `${p.progress}%` }} />
              </div>
              <div className="text-sm text-slate-600">Fase: {p.phase}</div>
              <div className="mt-2 flex justify-end">
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "16px", marginTop: "24px" }}>
          <button
            onClick={() => router.push(`/dashboard/timeline`)}
            style={{
              flex: 1,
              height: "48px",
              border: "none",
              borderRadius: "12px",
              background: "linear-gradient(135deg,#4f46e5,#4338ca)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "16px",
              cursor: "pointer",
              boxShadow: "0 10px 20px rgba(0,0,0,.15)",
            }}
            onMouseOver={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
            onMouseOut={(e) => (e.currentTarget.style.filter = "brightness(1)")}
          >
            Ver cronograma
          </button>
         </div> 
      </div>
    </RequireRole>
  );
}
