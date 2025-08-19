'use client';

import { useEffect, useMemo, useState } from 'react';
import RequireRole from '@/components/auth/RequireRole';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { pdf } from '@react-pdf/renderer';
import ProjectReport, {
  ProjectReportData,
  ReportPhase,
  ReportTask,
  ReportSubtask,
  CriticalItem,
  WorkloadRow,
  ReportSections,
  MilestoneItem,
} from '@/components/pdf/ProjectReport';

type ProjectOpt = { id: string; name: string; managerId?: string };

const fmt = (d?: Date) =>
  d ? d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' }) : undefined;

const toDate = (v: any): Date | undefined => {
  if (!v) return undefined;
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(+d) ? undefined : d;
  }
  if (typeof v === 'number') return new Date(v);
  return undefined;
};

const normStatus = (s?: string): 'todo' | 'in_progress' | 'completed' => {
  if (!s) return 'todo';
  const val = s.toLowerCase();
  if (val === 'completed' || val === 'done') return 'completed';
  if (val === 'in_progress' || val === 'doing' || val === 'progress') return 'in_progress';
  // mapea not_started / pending / todo -> 'todo'
  return 'todo';
};

const statusWeight = (s?: string) =>
  normStatus(s) === 'completed' ? 1 : normStatus(s) === 'in_progress' ? 0.5 : 0;

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  const [sections, setSections] = useState<ReportSections>({
    summary: true,
    risks: true,
    milestones: true,
    workload: true,
    costs: false,
  });

  const toggleSection = (key: keyof ReportSections) =>
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // Cargar proyectos + usuarios (manager names)
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const projSnap = await getDocs(collection(db, 'projects'));
      const list: ProjectOpt[] = [];
      const uids = new Set<string>();
      projSnap.forEach((p) => {
        const d = p.data() as any;
        list.push({ id: p.id, name: d.name || p.id, managerId: d.managerId });
        if (d.managerId) uids.add(d.managerId);
      });

      const nameMap = new Map<string, string>();
      for (const uid of uids) {
        const u = await getDoc(doc(db, 'users', uid));
        if (u.exists()) {
          const d = u.data() as any;
          nameMap.set(uid, d.displayName || d.email || uid);
        }
      }
      setUserNames(nameMap);
      setProjects(list);
      if (list.length && !selected) setSelected(list[0].id);
      setLoading(false);
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selected),
    [projects, selected]
  );

  const generate = async () => {
    if (!selectedProject) return;

    // 1) Cargar documento de proyecto
    const projRef = doc(db, 'projects', selectedProject.id);
    const projSnap = await getDoc(projRef);
    if (!projSnap.exists()) return;
    const projData = projSnap.data() as any;

    const now = new Date();
    const weekAhead = new Date(now);
    weekAhead.setDate(now.getDate() + 7);
    const monthAhead = new Date(now);
    monthAhead.setDate(now.getDate() + 30);

    const nameCache = new Map(userNames);
    const nameOf = async (uid?: string) => {
      if (!uid) return 'Sin asignar';
      if (nameCache.has(uid)) return nameCache.get(uid)!;
      const u = await getDoc(doc(db, 'users', uid));
      const d = u.exists() ? (u.data() as any) : null;
      const val = d?.displayName || d?.email || uid;
      nameCache.set(uid, val);
      return val;
    };

    const critical: CriticalItem[] = [];
    const milestones: MilestoneItem[] = [];
    const workloadCounter: Record<string, number> = {};
    const phases: ReportPhase[] = [];

    // --------- CAMINO A: Datos EMBEBIDOS (como en tu projects.json) ---------
    if (Array.isArray(projData?.phases) && projData.phases.length > 0) {
      for (const ph of projData.phases) {
        const phTasks: ReportTask[] = [];
        let tasksForProgress = 0;
        let tasksProgressAcc = 0;

        for (const t of ph.tasks || []) {
          const subs: ReportSubtask[] = [];
          let subProgressAcc = 0;

          for (const s of t.subtasks || []) {
            const sDue = toDate(s.dueDate);
            const sAssignedName = await nameOf(s.assignedTo);
            const sStatus = normStatus(s.status);

            const st: ReportSubtask = {
              id: s.id,
              name: s.name,
              status: sStatus,
              assignedToName: sAssignedName,
              dueDate: fmt(sDue),
            };
            subs.push(st);
            subProgressAcc += statusWeight(sStatus);

            // críticos (7d) y workload
            const sDone = sStatus === 'completed';
            if (sDue) {
              if (!sDone && sDue < now) {
                critical.push({
                  type: 'Subtarea',
                  name: s.name,
                  assignedToName: sAssignedName,
                  dueDate: fmt(sDue)!,
                  severity: 'Atrasada',
                });
              } else if (!sDone && sDue >= now && sDue <= weekAhead) {
                critical.push({
                  type: 'Subtarea',
                  name: s.name,
                  assignedToName: sAssignedName,
                  dueDate: fmt(sDue)!,
                  severity: 'Próxima (7d)',
                });
              }
              // hitos (30 días)
              if (!sDone && sDue >= now && sDue <= monthAhead) {
                milestones.push({
                  type: 'Subtarea',
                  name: s.name,
                  dueDate: fmt(sDue)!,
                  assignedToName: sAssignedName,
                  phaseName: ph.name,
                });
              }
            }
            if (s.assignedTo) workloadCounter[s.assignedTo] = (workloadCounter[s.assignedTo] || 0) + 1;
          }

          const tStatus = normStatus(t.status);
          const tDue = toDate(t.dueDate);
          const tAssignedName = await nameOf(t.assignedTo);

          const byTaskStatus = Math.round(statusWeight(tStatus) * 100);
          const bySubs = subs.length ? Math.round((subProgressAcc / subs.length) * 100) : byTaskStatus;
          const tProgress = Math.max(byTaskStatus, bySubs);

          const task: ReportTask = {
            id: t.id,
            name: t.name,
            status: tStatus,
            assignedToName: tAssignedName,
            dueDate: fmt(tDue),
            progress: tProgress,
            subtasks: subs,
          };
          phTasks.push(task);

          tasksForProgress += 1;
          tasksProgressAcc += tProgress;

          // críticos de tarea (7d), hitos (30d) y workload
          const tDone = tStatus === 'completed';
          if (tDue) {
            if (!tDone && tDue < now) {
              critical.push({
                type: 'Tarea',
                name: t.name,
                assignedToName: tAssignedName,
                dueDate: fmt(tDue)!,
                severity: 'Atrasada',
              });
            } else if (!tDone && tDue >= now && tDue <= weekAhead) {
              critical.push({
                type: 'Tarea',
                name: t.name,
                assignedToName: tAssignedName,
                dueDate: fmt(tDue)!,
                severity: 'Próxima (7d)',
              });
            }
            if (!tDone && tDue >= now && tDue <= monthAhead) {
              milestones.push({
                type: 'Tarea',
                name: t.name,
                dueDate: fmt(tDue)!,
                assignedToName: tAssignedName,
                phaseName: ph.name,
              });
            }
          }
          if (t.assignedTo) workloadCounter[t.assignedTo] = (workloadCounter[t.assignedTo] || 0) + 1;
        }

        const phaseProgress =
          tasksForProgress > 0
            ? Math.round(tasksProgressAcc / tasksForProgress)
            : Math.round(statusWeight(ph.status) * 100);

        const phase: ReportPhase = {
          id: ph.id,
          name: ph.name,
          status: normStatus(ph.status),
          progress: phaseProgress,
          responsibleName: ph.responsibleId ? await nameOf(ph.responsibleId) : undefined,
          tasks: phTasks,
        };
        phases.push(phase);
      }
    } else {
      // --------- CAMINO B: Subcolecciones Firestore (lo que tenías) ---------
      const phasesSnap = await getDocs(collection(db, `projects/${selectedProject.id}/phases`));
      for (const ph of phasesSnap.docs) {
        const phData = ph.data() as any;

        const tasksSnap = await getDocs(collection(db, `projects/${selectedProject.id}/phases/${ph.id}/tasks`));
        const phTasks: ReportTask[] = [];
        let tasksForProgress = 0;
        let tasksProgressAcc = 0;

        for (const t of tasksSnap.docs) {
          const tData = t.data() as any;
          const subsSnap = await getDocs(collection(db, `projects/${selectedProject.id}/phases/${ph.id}/tasks/${t.id}/subtasks`));
          const subs: ReportSubtask[] = [];
          let subProgressAcc = 0;

          for (const s of subsSnap.docs) {
            const sd = s.data() as any;
            const sDue = toDate(sd.dueDate);
            const sStatus = normStatus(sd.status);
            const sAssignedName = await nameOf(sd.assignedTo);

            const st: ReportSubtask = {
              id: s.id,
              name: sd.name,
              status: sStatus,
              assignedToName: sAssignedName,
              dueDate: fmt(sDue),
            };
            subs.push(st);
            subProgressAcc += statusWeight(sStatus);

            const sDone = sStatus === 'completed';
            if (sDue) {
              if (!sDone && sDue < now) {
                critical.push({
                  type: 'Subtarea',
                  name: sd.name,
                  assignedToName: sAssignedName,
                  dueDate: fmt(sDue)!,
                  severity: 'Atrasada',
                });
              } else if (!sDone && sDue >= now && sDue <= weekAhead) {
                critical.push({
                  type: 'Subtarea',
                  name: sd.name,
                  assignedToName: sAssignedName,
                  dueDate: fmt(sDue)!,
                  severity: 'Próxima (7d)',
                });
              }
              if (!sDone && sDue >= now && sDue <= monthAhead) {
                milestones.push({
                  type: 'Subtarea',
                  name: sd.name,
                  dueDate: fmt(sDue)!,
                  assignedToName: sAssignedName,
                  phaseName: phData.name,
                });
              }
            }
            if (sd.assignedTo) workloadCounter[sd.assignedTo] = (workloadCounter[sd.assignedTo] || 0) + 1;
          }

          const tStatus = normStatus(tData.status);
          const tDue = toDate(tData.dueDate);
          const tAssignedName = await nameOf(tData.assignedTo);

          const byTaskStatus = Math.round(statusWeight(tStatus) * 100);
          const bySubs = subs.length ? Math.round((subProgressAcc / subs.length) * 100) : byTaskStatus;
          const tProgress = Math.max(byTaskStatus, bySubs);

          const task: ReportTask = {
            id: t.id,
            name: tData.name,
            status: tStatus,
            assignedToName: tAssignedName,
            dueDate: fmt(tDue),
            progress: tProgress,
            subtasks: subs,
          };
          phTasks.push(task);

          tasksForProgress += 1;
          tasksProgressAcc += tProgress;

          const tDone = tStatus === 'completed';
          if (tDue) {
            if (!tDone && tDue < now) {
              critical.push({
                type: 'Tarea',
                name: tData.name,
                assignedToName: tAssignedName,
                dueDate: fmt(tDue)!,
                severity: 'Atrasada',
              });
            } else if (!tDone && tDue >= now && tDue <= weekAhead) {
              critical.push({
                type: 'Tarea',
                name: tData.name,
                assignedToName: tAssignedName,
                dueDate: fmt(tDue)!,
                severity: 'Próxima (7d)',
              });
            }
            if (!tDone && tDue >= now && tDue <= monthAhead) {
              milestones.push({
                type: 'Tarea',
                name: tData.name,
                dueDate: fmt(tDue)!,
                assignedToName: tAssignedName,
                phaseName: phData.name,
              });
            }
          }
          if (tData.assignedTo) workloadCounter[tData.assignedTo] = (workloadCounter[tData.assignedTo] || 0) + 1;
        }

        const phaseProgress =
          tasksForProgress > 0
            ? Math.round(tasksProgressAcc / tasksForProgress)
            : Math.round(statusWeight(phData.status) * 100);

        const phase: ReportPhase = {
          id: ph.id,
          name: phData.name,
          status: normStatus(phData.status),
          progress: phaseProgress,
          responsibleName: phData.responsibleId ? await nameOf(phData.responsibleId) : undefined,
          tasks: phTasks,
        };
        phases.push(phase);
      }
    }

    // progreso global
    const overall =
      phases.length > 0
        ? Math.round(phases.reduce((acc, p) => acc + (p.progress || 0), 0) / phases.length)
        : 0;

    // workload -> array con nombres
    const workloadRows: WorkloadRow[] = await Promise.all(
      Object.entries(workloadCounter).map(async ([uid, count]) => ({
        name: await nameOf(uid),
        count,
      }))
    );
    workloadRows.sort((a, b) => b.count - a.count);

    // ordenar críticos: Atrasadas primero
    critical.sort((a, b) => (a.severity === 'Atrasada' && b.severity !== 'Atrasada' ? -1 : 1));

    // ordenar hitos por fecha asc
    milestones.sort((a, b) => {
      // dd/mm/aaaa -> aaaa-mm-dd para comparar
      const parse = (s: string) => {
        const [dd, mm, yyyy] = s.split('/');
        return new Date(`${yyyy}-${mm}-${dd}`).getTime();
      };
      return parse(a.dueDate) - parse(b.dueDate);
    });

    const report: ProjectReportData = {
      projectName: selectedProject.name,
      managerName: selectedProject.managerId ? userNames.get(selectedProject.managerId) || '' : undefined,
      generatedAt: fmt(new Date())!,
      overallProgress: overall,
      phases,
      critical,
      workload: workloadRows,
      milestones,
    };

    const blob = await pdf(<ProjectReport data={report} sections={sections} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_${report.projectName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-6">Cargando…</div>;

  return (
    <RequireRole allowed={['project_manager', 'admin']}>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Reportes</h1>

        {/* Selección proyecto */}
        <div className="flex items-center gap-3">
          <select className="border rounded px-3 py-2" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Checkboxes para secciones */}
        <div className="space-y-2">
          <label><input type="checkbox" checked={sections.summary} onChange={() => toggleSection('summary')} /> Resumen ejecutivo</label>
          <label><input type="checkbox" checked={sections.risks} onChange={() => toggleSection('risks')} /> Riesgos y alertas</label>
          <label><input type="checkbox" checked={sections.milestones} onChange={() => toggleSection('milestones')} /> Próximos hitos</label>
          <label><input type="checkbox" checked={sections.workload} onChange={() => toggleSection('workload')} /> Carga de trabajo</label>
          <label><input type="checkbox" checked={sections.costs} onChange={() => toggleSection('costs')} disabled /> Costes (próximamente)</label>
        </div>

        <button
          onClick={generate}
          className="px-4 py-2 rounded bg-yellow-500 text-white hover:bg-yellow-600"
          disabled={!selectedProject}
        >
          Generar PDF
        </button>
      </div>
    </RequireRole>
  );
}
