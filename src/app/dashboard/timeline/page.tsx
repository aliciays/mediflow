'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { useUser } from '@/lib/useUser';
import { collection, doc, getDoc, getDocs, Timestamp } from 'firebase/firestore';

type ProjectLite = { id: string; name: string };

type PhaseDoc = {
  name: string;
  startDate?: Timestamp | null;
  endDate?: Timestamp | null;
  status?: string;
};

type TaskDoc = {
  name: string;
  status?: 'todo'|'in_progress'|'completed';
  startDate?: Timestamp | null;
  dueDate?: Timestamp | null;
  createdAt?: Timestamp | null;
  assignedTo?: string | null;
  tags?: string[];            // ← para 'hito'/'milestone'
  isMilestone?: boolean;      // ← marcado explícito
};

type Role = 'admin'|'project_manager'|'technician'|'viewer'|'';

const fmt = (d: Date) => d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
const toDate = (t?: Timestamp | null) => (t ? t.toDate() : undefined);

function rangeOf(dates: Array<Date | undefined>) {
  const ms = dates.filter(Boolean).map(d => (d as Date).getTime());
  if (!ms.length) {
    const today = new Date(); const in30 = new Date(today); in30.setDate(today.getDate() + 30);
    return { min: today, max: in30 };
  }
  const min = new Date(Math.min(...ms));
  const max = new Date(Math.max(...ms));
  if (min.getTime() === max.getTime()) { const plus7 = new Date(max); plus7.setDate(plus7.getDate() + 7); return { min, max: plus7 }; }
  return { min, max };
}

/** Coloca elementos en carriles para evitar solapes */
function placeInLanes<T extends { start?: Date; end?: Date }>(items: T[]) {
  const sorted = items.slice().sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0));
  const laneEnds: number[] = [];
  const withLane = sorted.map((t) => {
    const sMs = (t.start ?? t.end ?? new Date(0)).getTime();
    const eMs = (t.end ?? t.start ?? new Date(0)).getTime();
    let lane = laneEnds.findIndex((end) => end <= sMs);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = Math.max(eMs, laneEnds[lane] ?? -Infinity);
    return { ...t, lane };
  });
  return { items: withLane, laneCount: laneEnds.length };
}

/** Normaliza una tarea con fallbacks + detección de hito */
function normalizeTask(d: TaskDoc, phaseStart?: Date, phaseEnd?: Date) {
  // ¿Marcado explícito como hito?
  const taggedMilestone =
    d.isMilestone === true ||
    (d.tags || []).some(t => {
      const x = t.toLowerCase().trim();
      return x === 'hito' || x === 'milestone';
    });

  const s = toDate(d.startDate);
  const e = toDate(d.dueDate);
  const c = toDate(d.createdAt);

  // Fallbacks para barras
  let start: Date | undefined = s ?? c ?? phaseStart;
  let end: Date | undefined = e ?? (s ? s : undefined);
  if (!end && start && phaseEnd) end = phaseEnd;

  // Hito por duración real
  let isMilestone = false;
  if (start && end) {
    const dur = Math.abs(end.getTime() - start.getTime());
    if (dur < 24 * 60 * 60 * 1000) isMilestone = true; // < 1 día
  }

  // Si está marcado como hito, forzamos diamante:
  if (taggedMilestone) {
    // preferimos dueDate; si no, startDate; si no, centro de fase
    const at =
      e ?? s ?? (phaseStart && phaseEnd
        ? new Date((phaseStart.getTime() + phaseEnd.getTime()) / 2)
        : start ?? end);
    start = at;
    end = at;
    isMilestone = true;
  }

  return { start, end, isMilestone };
}

export default function TimelinePage() {
  const router = useRouter();
  const search = useSearchParams();
  const { user, loading } = useUser();

  const [role, setRole] = useState<Role>('');
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [rows, setRows] = useState<Array<{
    id: string;
    name: string;
    start?: Date;
    end?: Date;
    tasks: Array<{ id: string; name: string; start?: Date; end?: Date; isMilestone?: boolean; lane: number }>;
    laneCount: number;
  }>>([]);
  const [busy, setBusy] = useState(true);

  // Rol (PM verá el botón "Ir al proyecto (editar)")
  useEffect(() => {
    if (loading) return;
    (async () => {
      if (!user) return;
      const snap = await getDoc(doc(db, 'users', user.uid));
      setRole((snap.exists() ? (snap.data().role as Role) : '') || '');
    })();
  }, [loading, user]);

  // Proyectos y selección inicial
  useEffect(() => {
    (async () => {
      const ps = await getDocs(collection(db, 'projects'));
      const items: ProjectLite[] = ps.docs.map(d => ({ id: d.id, name: (d.data() as any).name || 'Proyecto' }));
      setProjects(items);
      const qid = search.get('projectId');
      if (qid && items.some(p => p.id === qid)) setSelectedId(qid);
      else if (items[0]) setSelectedId(items[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cargar fases + tareas
  useEffect(() => {
    (async () => {
      if (!selectedId) return;
      setBusy(true);
      try {
        const phSnap = await getDocs(collection(db, `projects/${selectedId}/phases`));
        const result: typeof rows = [];

        for (const ph of phSnap.docs) {
          const phData = ph.data() as PhaseDoc;

          // 1ª pasada: leer tareas y deducir rango de fase si falta
          const tSnap = await getDocs(collection(db, `projects/${selectedId}/phases/${ph.id}/tasks`));
          const rawTasks = tSnap.docs.map(t => ({ id: t.id, data: t.data() as TaskDoc }));

          let phaseStart = toDate(phData.startDate);
          let phaseEnd   = toDate(phData.endDate);

          if (!phaseStart || !phaseEnd) {
            const cands: Date[] = [];
            rawTasks.forEach(({ data }) => {
              const s = toDate(data.startDate) ?? toDate(data.createdAt);
              const e = toDate(data.dueDate) ?? toDate(data.startDate);
              if (s) cands.push(s);
              if (e) cands.push(e);
            });
            const { min, max } = rangeOf(cands);
            phaseStart = phaseStart ?? min;
            phaseEnd   = phaseEnd   ?? max;
          }

          // 2ª pasada: normalizar con fallbacks/hitos
          const norm = rawTasks.map(({ id, data }) => {
            const n = normalizeTask(data, phaseStart!, phaseEnd!);
            return { id, name: data.name, ...n };
          });

          const { items: placed, laneCount } = placeInLanes(norm);

          // Rango final de fase
          const { min, max } = rangeOf([
            phaseStart, phaseEnd,
            ...placed.map(t => t.start),
            ...placed.map(t => t.end),
          ]);

          result.push({
            id: ph.id,
            name: phData.name,
            start: min,
            end: max,
            tasks: placed,
            laneCount,
          });
        }

        setRows(result);
      } finally {
        setBusy(false);
      }
    })();
  }, [selectedId]);

  // Escala global
  const { min: start, max: end } = useMemo(() => {
    const ds: Date[] = [];
    rows.forEach(r => {
      if (r.start) ds.push(r.start);
      if (r.end) ds.push(r.end);
      r.tasks.forEach(t => { if (t.start) ds.push(t.start); if (t.end) ds.push(t.end); });
    });
    return rangeOf(ds);
  }, [rows]);

  const spanMs = end.getTime() - start.getTime();
  const toPct = (d: Date) => ((d.getTime() - start.getTime()) / spanMs) * 100;
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const bar = (s?: Date, e?: Date) => {
    if (!s && !e) return { left: 0, width: 0 };
    const _s = s ?? e ?? start;
    const _e = e ?? s ?? _s;
    const left = clamp(toPct(_s));
    const width = Math.max(1, clamp(toPct(_e)) - left);
    return { left, width };
  };

  const projectName = useMemo(() => projects.find(p => p.id === selectedId)?.name ?? '—', [projects, selectedId]);
  const canEdit = role === 'project_manager';

  // Layout vertical por fase
  const phaseBaseH = 40;
  const laneH = 16;
  const laneGap = 6;
  const tasksTop = 10;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cronograma</h1>
          <p className="text-slate-600 text-sm">
            {busy ? 'Cargando…' : `Proyecto: ${projectName} · ${fmt(start)} — ${fmt(end)}`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded border px-3 py-2 text-sm"
            aria-label="Seleccionar proyecto"
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {canEdit && (
            <button
              onClick={() => router.push(`/dashboard/projects/${selectedId}`)}
              className="px-3 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              Ir al proyecto (editar)
            </button>
          )}
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-1">
          <span className="inline-block h-2 w-6 rounded bg-slate-300" /> Fase
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2 w-6 rounded bg-fuchsia-500" /> Tarea
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rotate-45 bg-emerald-500" /> Hito
        </div>
      </div>

      {/* Timeline */}
      <div className="overflow-x-auto rounded border bg-white">
        <div className="sticky top-0 z-10 border-b bg-slate-50 px-4 py-2 text-xs text-slate-600">
          {fmt(start)} — {fmt(end)}
        </div>

        <div className="min-w-[900px] p-4">
          {rows.map(row => {
            const phBar = bar(row.start, row.end);
            const totalHeight = phaseBaseH + (row.laneCount > 0 ? tasksTop + row.laneCount * (laneH + laneGap) : 0);

            return (
              <div key={row.id} className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-slate-500">
                    {row.start ? fmt(row.start) : '—'} · {row.end ? fmt(row.end) : '—'}
                  </div>
                </div>

                <div className="relative rounded bg-slate-100" style={{ height: totalHeight }}>
                  {/* FASE */}
                  <div
                    className="absolute top-2 h-4 rounded bg-slate-300"
                    style={{ left: `${phBar.left}%`, width: `${phBar.width}%` }}
                    title={`${row.name}: ${row.start ? fmt(row.start) : ''} — ${row.end ? fmt(row.end) : ''}`}
                  />

                  {/* TAREAS / HITOS */}
                  {row.tasks.map(t => {
                    const tb = bar(t.start, t.end);
                    const top = tasksTop + t.lane * (laneH + laneGap);

                    if (t.isMilestone) {
                      const center = tb.left + tb.width / 2;
                      return (
                        <div
                          key={t.id}
                          className="absolute h-3 w-3 rotate-45 bg-emerald-500 shadow"
                          style={{ top: top + 2, left: `calc(${center}% - 6px)` }}
                          title={`${t.name} · Hito · ${t.start ? fmt(t.start) : ''}`}
                          aria-label={`${t.name} (hito)`}
                        />
                      );
                    }

                    return (
                      <div
                        key={t.id}
                        className="absolute rounded bg-fuchsia-500/90 hover:bg-fuchsia-600 transition"
                        style={{ top, left: `${tb.left}%`, width: `${tb.width}%`, height: laneH }}
                        title={`${t.name}: ${t.start ? fmt(t.start) : ''} — ${t.end ? fmt(t.end) : ''}`}
                        aria-label={t.name}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {!busy && rows.length === 0 && (
            <div className="text-sm text-slate-500">Este proyecto no tiene datos de cronograma.</div>
          )}
        </div>
      </div>

      {role !== 'project_manager' && (
        <div className="text-xs text-slate-500">
          Vista de solo lectura. La edición del cronograma está limitada a Project Manager.
        </div>
      )}
    </div>
  );
}
