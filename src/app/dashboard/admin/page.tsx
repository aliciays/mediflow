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
                style={{
                  padding: '16px',
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  boxShadow: '0 6px 16px rgba(2,6,23,.05)',
                  textAlign: 'center',
                  fontWeight: 700,
                  letterSpacing: '.3px',
                }}
              >
                {txt}
              </div>
            )
          )}
        </div>

        <h2 className="text-xl font-bold">Proyectos Activos</h2>

        <div className="space-y-4">
          {projects.map(p => {
            const hovered = hoverId === p.id;
            return (
              <div
                key={p.id}
                onMouseEnter={() => setHoverId(p.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{
                  padding: '16px',
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  boxShadow: hovered
                    ? '0 14px 30px rgba(2,6,23,.08)'
                    : '0 8px 18px rgba(2,6,23,.04)',
                  transition: 'box-shadow .2s ease, transform .2s ease',
                  transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
                }}
              >
                {/* Header */}
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold" style={{ fontSize: 16 }}>{p.name}</h3>
                  <span style={{ fontSize: 14, color: '#334155' }}>{p.progress}%</span>
                </div>

                {/* Progreso */}
                <div style={{ height: 10, background: '#e5e7eb', borderRadius: 9999, overflow: 'hidden', marginTop: 8, marginBottom: 12 }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${p.progress}%`,
                      background: 'linear-gradient(90deg,#3b82f6,#2563eb)',
                      borderRadius: 9999,
                      transition: 'width .4s ease',
                    }}
                  />
                </div>

                {/* Meta info */}
                <div className="flex justify-between text-sm" style={{ color: '#475569' }}>
                  <span>Fase: <strong style={{ color: '#111827' }}>{p.phase}</strong></span>
                </div>

                {/* CTA */}
                <div className="flex justify-between items-center mt-3">
                  <button
                    onClick={() => router.push(`/dashboard/projects/${p.id}`)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 14px',
                      border: 'none',
                      borderRadius: 10,
                      background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
                      color: '#fff',
                      fontWeight: 600,
                      cursor: 'pointer',                        // 👈 mano al pasar
                      boxShadow: '0 8px 18px rgba(37,99,235,.25)',
                      transition: 'transform .15s ease, filter .15s ease, box-shadow .15s ease',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.filter = 'brightness(1.07)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 12px 24px rgba(37,99,235,.32)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.filter = 'brightness(1)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 8px 18px rgba(37,99,235,.25)';
                    }}
                    title="Ver detalle del proyecto"
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

        {/* CTA reports */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
          <button
            onClick={() => router.push('/reports')}
            style={{
              flex: 1,
              height: '48px',
              border: 'none',
              borderRadius: '12px',
              background: 'linear-gradient(135deg,#f59e0b,#d97706)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '16px',
              cursor: 'pointer',
              boxShadow: '0 10px 20px rgba(0,0,0,.15)',
              transition: 'transform .15s ease, filter .15s ease',
            }}
            onMouseOver={(e) => { e.currentTarget.style.filter = 'brightness(1.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseOut={(e) => { e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            Generar reporte
          </button>
        </div>
      </div>
    </RequireRole>
  );
}
