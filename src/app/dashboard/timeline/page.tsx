'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { useUser } from '@/lib/useUser';
import { collection, doc, getDoc, getDocs, Timestamp } from 'firebase/firestore';

/* ----------------------------- Tipado mínimo ----------------------------- */
type Role = 'admin'|'project_manager'|'technician'|'viewer'|'';
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
  tags?: string[];
  isMilestone?: boolean;
};

/* --------------------------------- Utils --------------------------------- */
const toDate = (t?: Timestamp | null) => (t ? t.toDate() : undefined);
const fmtShort = (d: Date) => d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
const fmtLong  = (d?: Date) => d ? d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** Rango a partir de un conjunto de fechas con saneado y “extensión mínima” */
function rangeOf(dates: Array<Date | undefined>) {
  const ms = dates.filter(Boolean).map(d => (d as Date).getTime());
  if (!ms.length) {
    const today = new Date();
    const in30 = new Date(today); in30.setDate(today.getDate() + 30);
    return { min: today, max: in30 };
  }
  const min = new Date(Math.min(...ms));
  const max = new Date(Math.max(...ms));
  if (min.getTime() === max.getTime()) {
    const plus7 = new Date(max); plus7.setDate(plus7.getDate() + 7);
    return { min, max: plus7 };
  }
  return { min, max };
}

/** Coloca elementos en carriles para evitar solapes (interval graph greedy) */
function placeInLanes<T extends { start?: Date; end?: Date }>(items: T[]) {
  const sorted = items
    .slice()
    .sort((a, b) => (a.start?.getTime() ?? a.end?.getTime() ?? 0) - (b.start?.getTime() ?? b.end?.getTime() ?? 0));
  const laneEnds: number[] = [];
  const withLane = sorted.map((t) => {
    const s = t.start ?? t.end ?? new Date(0);
    const e = t.end ?? t.start ?? s;
    const sMs = s.getTime(); const eMs = e.getTime();
    let lane = laneEnds.findIndex((end) => end <= sMs);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = Math.max(eMs, laneEnds[lane] ?? -Infinity);
    return { ...t, lane };
  });
  return { items: withLane, laneCount: laneEnds.length };
}

/** Normaliza una tarea: calcula intervalos y detecta hito */
function normalizeTask(d: TaskDoc, phaseStart?: Date, phaseEnd?: Date) {
  const tagMilestone =
    d.isMilestone === true ||
    (d.tags || []).some(t => ['hito', 'milestone', 'milestones'].includes(t.toLowerCase().trim()));

  const s = toDate(d.startDate);
  const e = toDate(d.dueDate);
  const c = toDate(d.createdAt);

  let start: Date | undefined = s ?? c ?? phaseStart;
  let end: Date | undefined   = e ?? (s ? s : undefined);
  if (!end && start && phaseEnd) end = phaseEnd;

  // Si está marcado como hito, lo convertimos a diamante en un instante representativo
  if (tagMilestone) {
    const at =
      e ?? s ?? (phaseStart && phaseEnd
        ? new Date((phaseStart.getTime() + phaseEnd.getTime()) / 2)
        : start ?? end);
    start = at; end = at;
  }

  // Si la duración real es < 1 día, lo tratamos como hito visual
  const isMilestone = !!(start && end && Math.abs(end.getTime() - start.getTime()) < 24 * 60 * 60 * 1000);

  return { start, end, isMilestone };
}

/* --------------------------------- Page ---------------------------------- */
export default function TimelinePage() {
  const router = useRouter();
  const search = useSearchParams();
  const { user, loading: authLoading } = useUser();

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

  // Rol del usuario (para botón de edición)
  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      const snap = await getDoc(doc(db, 'users', user.uid));
      setRole((snap.exists() ? (snap.data().role as Role) : '') || '');
    })();
  }, [authLoading, user]);

  // Proyectos y selección inicial (URL ?projectId=… respetada)
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

  // Carga de fases y tareas
  useEffect(() => {
    (async () => {
      if (!selectedId) return;
      setBusy(true);
      try {
        const phSnap = await getDocs(collection(db, `projects/${selectedId}/phases`));
        const result: typeof rows = [];

        for (const ph of phSnap.docs) {
          const phData = ph.data() as PhaseDoc;

          // 1) Leer tareas
          const tSnap = await getDocs(collection(db, `projects/${selectedId}/phases/${ph.id}/tasks`));
          const rawTasks = tSnap.docs.map(t => ({ id: t.id, data: t.data() as TaskDoc }));

          // Rango de fase (con fallback a tareas)
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

          // 2) Normalizar y evitar solapes
          const norm = rawTasks.map(({ id, data }) => {
            const n = normalizeTask(data, phaseStart!, phaseEnd!);
            return { id, name: data.name, ...n };
          });
          const { items: placed, laneCount } = placeInLanes(norm);

          // Rango final con las barras ya colocadas
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

  // Escala global y utilidades de posicionamiento
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

  // Hoy (marca visual si está dentro del rango)
  const today = new Date();
  const showToday = today >= start && today <= end;
  const todayPct = clamp(toPct(today));

  const projectName = useMemo(() => projects.find(p => p.id === selectedId)?.name ?? '—', [projects, selectedId]);
  const canEdit = role === 'project_manager';

  // Layout
  const phaseBaseH = 44;
  const laneH = 16;
  const laneGap = 6;
  const tasksTop = 12;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cronograma</h1>
          <p className="text-slate-600 text-sm">
            {busy ? 'Cargando…' : (
              <>
                Proyecto: <span className="font-medium text-slate-700">{projectName}</span>
                {' · '}
                {fmtLong(start)} — {fmtLong(end)}
              </>
            )}
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
          <span className="inline-block h-2 w-6 rounded bg-slate-300" aria-hidden /> Fase
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2 w-6 rounded bg-fuchsia-500" aria-hidden /> Tarea
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rotate-45 bg-emerald-500" aria-hidden /> Hito
        </div>
      </div>

      {/* Timeline */}
      <div className="overflow-x-auto rounded border bg-white">
        {/* Cabecera pegajosa con rango y marca de hoy */}
        <div className="sticky top-0 z-10 border-b bg-slate-50 px-4 py-2 text-xs text-slate-600">
          <div className="flex items-center justify-between">
            <div>{fmtShort(start)} — {fmtShort(end)}</div>
            {showToday && (
              <div className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
                Hoy
              </div>
            )}
          </div>
        </div>

        <div className="min-w-[980px] p-4">
          {/* Skeleton de carga */}
          {busy && (
            <div className="space-y-4">
              {[0,1].map(i => (
                <div key={i} className="animate-pulse">
                  <div className="mb-2 h-4 w-60 rounded bg-slate-200" />
                  <div className="h-20 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          )}

          {!busy && rows.map(row => {
            const phBar = bar(row.start, row.end);
            const totalHeight = phaseBaseH + (row.laneCount > 0 ? tasksTop + row.laneCount * (laneH + laneGap) : 0);

            return (
              <section key={row.id} className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-medium">{row.name}</h2>
                  <div className="text-xs text-slate-500">
                    {fmtLong(row.start)} · {fmtLong(row.end)}
                  </div>
                </div>

                <div className="relative rounded bg-slate-100" style={{ height: totalHeight }}>
                  {/* Rejilla sutil */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-40 [background-image:repeating-linear-gradient(to_right,transparent_0,transparent_47px,#e5e7eb_48px),repeating-linear-gradient(to_bottom,transparent_0,transparent_15px,#e5e7eb_16px)]"
                    aria-hidden
                  />
                  {/* Marca de hoy */}
                  {showToday && (
                    <div
                      className="absolute inset-y-0 w-px bg-rose-500/70"
                      style={{ left: `${todayPct}%` }}
                      aria-hidden
                    />
                  )}

                  {/* FASE */}
                  <div
                    className="absolute top-2 h-4 rounded bg-slate-300"
                    style={{ left: `${phBar.left}%`, width: `${phBar.width}%` }}
                    title={`${row.name}: ${fmtLong(row.start)} — ${fmtLong(row.end)}`}
                    aria-label={`Fase ${row.name}`}
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
                          title={`${t.name} · Hito · ${fmtLong(t.start)}`}
                          aria-label={`${t.name} (hito)`}
                        />
                      );
                    }

                    return (
                      <div
                        key={t.id}
                        className="absolute rounded bg-fuchsia-500/90 hover:bg-fuchsia-600 transition"
                        style={{ top, left: `${tb.left}%`, width: `${tb.width}%`, height: laneH }}
                        title={`${t.name}: ${fmtLong(t.start)} — ${fmtLong(t.end)}`}
                        aria-label={t.name}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}

          {!busy && rows.length === 0 && (
            <div className="rounded border border-dashed p-8 text-center text-sm text-slate-500">
              Este proyecto no tiene datos de cronograma todavía.
            </div>
          )}
        </div>
      </div>

      {role !== 'project_manager' && (
        <p className="text-xs text-slate-500">
          Vista de solo lectura. La edición del cronograma está limitada a Project Manager.
        </p>
      )}
    </div>
  );
}
