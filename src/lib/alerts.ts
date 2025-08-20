// lib/alerts.ts
'use client';

import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, Timestamp } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

export type Role = 'admin'|'project_manager'|'technician'|'viewer'|'';

type Subtask = { id: string; name: string; status?: string; assignedTo?: string; dueDate?: Timestamp | null; tags?: string[]; updatedAt?: Timestamp | null; };
type Task = {
  id: string; name: string; status?: string; assignedTo?: string;
  dueDate?: Timestamp | null; priority?: 'low'|'med'|'high';
  tags?: string[]; isMilestone?: boolean; updatedAt?: Timestamp | null;
  subtasks: Subtask[];
};
type Phase = { id: string; name: string; status?: string; tasks: Task[]; };
type Project = { id: string; name: string };

export type AlertType = 'overdue'|'due_soon'|'unassigned'|'inconsistency';
export type Severity = 'critical'|'warning'|'info';

export type Alert = {
  key: string;
  type: AlertType;
  severity: Severity;
  projectId: string;
  projectName: string;
  phaseId?: string;
  taskId?: string;
  subtaskId?: string;
  title: string;
  message: string;
  entityUrl: string;
  dueAt?: Date | null;
  createdAt: Date;
};

const toDate = (t?: Timestamp | null) => (t ? t.toDate() : null);
const fmt = (d: Date) => d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
const isMilestone = (t: Task) => !!t.isMilestone || (t.tags || []).map(s => s.toLowerCase()).includes('hito');

const SLA_BY_PRIORITY: Record<'high'|'med'|'low', number> = { high: 3, med: 7, low: 14 };

// ------- local storage (ack/snooze) -------
const ACK_KEY = 'mf_alerts_ack';
const SNOOZE_KEY = 'mf_alerts_snooze';
const getMap = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };
const setMap = (k: string, v: Record<string, any>) => localStorage.setItem(k, JSON.stringify(v));
export const ackAlertLocal = (key: string) => { const m = getMap(ACK_KEY); m[key] = Date.now(); setMap(ACK_KEY, m); };
export const snoozeAlertLocal = (key: string, until: Date) => { const m = getMap(SNOOZE_KEY); m[key] = until.getTime(); setMap(SNOOZE_KEY, m); };
const isAck = (k: string) => !!getMap(ACK_KEY)[k];
const isSnoozed = (k: string) => { const v = getMap(SNOOZE_KEY)[k]; return v && Date.now() < Number(v); };

// ------- carga proyecto -------
async function loadProject(projectId: string): Promise<{project: Project; phases: Phase[]}> {
  const pSnap = await getDoc(doc(db, 'projects', projectId));
  if (!pSnap.exists()) throw new Error('Project not found');

  const project: Project = { id: pSnap.id, name: (pSnap.data() as any).name || 'Proyecto' };
  const phSnap = await getDocs(collection(db, `projects/${projectId}/phases`));

  const phases: Phase[] = [];
  for (const ph of phSnap.docs) {
    const tSnap = await getDocs(collection(db, `projects/${projectId}/phases/${ph.id}/tasks`));
    const tasks: Task[] = [];

    for (const t of tSnap.docs) {
      const td = t.data() as any;
      const stSnap = await getDocs(collection(db, `projects/${projectId}/phases/${ph.id}/tasks/${t.id}/subtasks`));
      const subtasks: Subtask[] = stSnap.docs.map(s => ({ id: s.id, ...(s.data() as any) }));
      tasks.push({
        id: t.id,
        name: td.name,
        status: td.status,
        assignedTo: td.assignedTo || '',
        dueDate: td.dueDate || null,
        priority: td.priority || 'med',
        tags: td.tags || [],
        isMilestone: !!td.isMilestone,
        updatedAt: td.updatedAt || null,
        subtasks,
      });
    }

    phases.push({ id: ph.id, name: (ph.data() as any).name, status: (ph.data() as any).status, tasks });
  }

  return { project, phases };
}

// ------- reglas -------
function affectsUser(uid: string, role: Role, t: Task): boolean {
  if (role === 'project_manager') return true;
  if (!uid) return false;
  if (t.assignedTo === uid) return true;
  if (t.subtasks?.some(st => st.assignedTo === uid)) return true;
  return false;
}

function computeAlertsForTask(p: Project, phase: Phase, t: Task, uid: string, role: Role): Alert[] {
  const list: Alert[] = [];
  const now = new Date();
  const due = toDate(t.dueDate);
  const prio = t.priority || 'med';

  const base = {
    projectId: p.id,
    projectName: p.name,
    phaseId: phase.id,
    taskId: t.id,
    entityUrl: `/dashboard/projects/${p.id}`,
  };

  if (!affectsUser(uid, role, t)) return list;

  if (t.status !== 'completed' && due && due.getTime() < now.getTime()) {
    list.push({
      key: `overdue_task_${t.id}`,
      type: 'overdue',
      severity: 'critical',
      title: `Tarea vencida${isMilestone(t) ? ' (Hito)' : ''}`,
      message: `${t.name} — venció el ${fmt(due)}.`,
      dueAt: due,
      createdAt: now,
      ...base,
    });
  }

  if (t.status !== 'completed' && due) {
    const days = Math.ceil((due.getTime() - now.getTime()) / (24*60*60*1000));
    const windowDays = SLA_BY_PRIORITY[prio as 'low'|'med'|'high'] || 7;
    if (days >= 0 && days <= windowDays) {
      list.push({
        key: `duesoon_task_${t.id}`,
        type: 'due_soon',
        severity: (prio === 'high' && days <= 1) ? 'critical' : 'warning',
        title: `Próxima a vencer${isMilestone(t) ? ' (Hito)' : ''}`,
        message: `${t.name} — vence ${fmt(due)} (${days} días).`,
        dueAt: due,
        createdAt: now,
        ...base,
      });
    }
  }

  if (!t.assignedTo || t.assignedTo === '') {
    list.push({
      key: `unassigned_task_${t.id}`,
      type: 'unassigned',
      severity: (isMilestone(t) || prio === 'high') ? 'critical' : 'warning',
      title: `Tarea sin responsable${isMilestone(t) ? ' (Hito)' : ''}`,
      message: `${t.name} — asigna un responsable.`,
      dueAt: due || null,
      createdAt: now,
      ...base,
    });
  }

  const subOpen = (t.subtasks || []).some(st => (st.status || 'todo') !== 'completed');
  const allSubCompleted = (t.subtasks || []).length > 0 && (t.subtasks || []).every(st => (st.status || 'todo') === 'completed');

  if (t.status === 'completed' && subOpen) {
    list.push({
      key: `inconsistency_task_${t.id}_subs_open`,
      type: 'inconsistency',
      severity: 'info',
      title: 'Inconsistencia de estado',
      message: `${t.name} marcada como completada pero con subtareas pendientes.`,
      dueAt: null,
      createdAt: now,
      ...base,
    });
  } else if (t.status !== 'completed' && allSubCompleted) {
    list.push({
      key: `inconsistency_task_${t.id}_task_open`,
      type: 'inconsistency',
      severity: 'info',
      title: 'Inconsistencia de estado',
      message: `${t.name} tiene todas las subtareas completadas.`,
      dueAt: null,
      createdAt: now,
      ...base,
    });
  }

  for (const st of t.subtasks || []) {
    const sDue = toDate(st.dueDate);
    const sBase = { ...base, subtaskId: st.id, title: `Subtarea: ${st.name}` };

    if (st.assignedTo !== uid && role !== 'project_manager') continue;

    if (sDue && (!t.status || t.status !== 'completed')) {
      const days = Math.ceil((sDue.getTime() - now.getTime()) / (24*60*60*1000));
      if ((st.status || 'todo') !== 'completed' && sDue.getTime() < now.getTime()) {
        list.push({
          key: `overdue_sub_${st.id}`,
          type: 'overdue',
          severity: 'critical',
          message: `Subtarea vencida — ${fmt(sDue)}.`,
          dueAt: sDue,
          createdAt: now,
          ...sBase,
        });
      } else if (days >= 0 && days <= 7) {
        list.push({
          key: `duesoon_sub_${st.id}`,
          type: 'due_soon',
          severity: 'warning',
          message: `Subtarea vence ${fmt(sDue)} (${days} días).`,
          dueAt: sDue,
          createdAt: now,
          ...sBase,
        });
      }
    }

    if (!st.assignedTo || st.assignedTo === '') {
      list.push({
        key: `unassigned_sub_${st.id}`,
        type: 'unassigned',
        severity: 'warning',
        message: 'Subtarea sin responsable.',
        dueAt: sDue || null,
        createdAt: now,
        ...sBase,
      });
    }
  }

  return list;
}

export async function computeAlertsForProject(projectId: string, uid: string, role: Role): Promise<Alert[]> {
  const { project, phases } = await loadProject(projectId);
  const alerts: Alert[] = [];
  for (const ph of phases) for (const t of ph.tasks) alerts.push(...computeAlertsForTask(project, ph, t, uid, role));
  return alerts.filter(a => !isAck(a.key)).filter(a => !isSnoozed(a.key));
}

export async function computeAlertsForAllProjects(uid: string, role: Role): Promise<Alert[]> {
  const ps = await getDocs(collection(db, 'projects'));
  const arr: Alert[] = [];
  for (const p of ps.docs) arr.push(...await computeAlertsForProject(p.id, uid, role));
  return arr;
}

// ------ Hook (añadimos refreshKey) ------
export function useAlerts(
  scope: 'project'|'global',
  opts: { projectId?: string; uid: string; role: Role; refreshKey?: number }
) {
  const { projectId, uid, role, refreshKey = 0 } = opts;
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (role === 'viewer') { setAlerts([]); setLoading(false); return; }
      setLoading(true);
      try {
        const data = scope === 'project' && projectId
          ? await computeAlertsForProject(projectId, uid, role)
          : await computeAlertsForAllProjects(uid, role);
        if (mounted) setAlerts(data);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [scope, projectId, uid, role, refreshKey]);

  const critical = useMemo(() => alerts.filter(a => a.severity === 'critical').length, [alerts]);

  return { alerts, loading, critical, setAlerts };
}
