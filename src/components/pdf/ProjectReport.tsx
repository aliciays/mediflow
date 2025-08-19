// src/components/pdf/ProjectReport.tsx
// No 'use client' aquí

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer';

// ---------- Tipos ----------
export type ReportSubtask = {
  id: string;
  name: string;
  status?: 'todo' | 'in_progress' | 'completed';
  assignedToName?: string;
  dueDate?: string;
};

export type ReportTask = {
  id: string;
  name: string;
  status?: 'todo' | 'in_progress' | 'completed';
  assignedToName?: string;
  dueDate?: string;
  progress?: number;
  subtasks: ReportSubtask[];
};

export type ReportPhase = {
  id: string;
  name: string;
  status?: 'todo' | 'in_progress' | 'completed';
  progress?: number;
  responsibleName?: string;
  tasks: ReportTask[];
};

export type CriticalItem = {
  type: 'Tarea' | 'Subtarea';
  name: string;
  assignedToName: string;
  dueDate: string;
  severity: 'Atrasada' | 'Próxima (7d)';
};

export type WorkloadRow = {
  name: string;
  count: number;
};

export type MilestoneItem = {
  type: 'Fase' | 'Tarea' | 'Subtarea';
  name: string;
  dueDate: string;
  assignedToName?: string;
  phaseName?: string;
};

export type ProjectReportData = {
  projectName: string;
  managerName?: string;
  generatedAt: string;
  overallProgress: number;
  phases: ReportPhase[];
  critical: CriticalItem[];
  workload: WorkloadRow[];
  milestones: MilestoneItem[]; // NUEVO
};

export type ReportSections = {
  summary: boolean;
  risks: boolean;
  milestones: boolean;
  workload: boolean;
  costs: boolean;
};

// ---------- Paleta ----------
const COLORS = {
  ink: '#0f172a',
  sub: '#475569',
  line: '#e2e8f0',
  brand: '#2563eb',
  ok: '#16a34a',
  warn: '#f59e0b',
  danger: '#ef4444',
};

// ---------- Estilos ----------
const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 36,
    fontFamily: 'Helvetica',
    color: COLORS.ink,
    fontSize: 11,
  },
  h1: { fontSize: 20, fontWeight: 700, marginBottom: 12, textAlign: 'center' },
  h2: { fontSize: 14, fontWeight: 700, marginBottom: 6 },
  h3: { fontSize: 11, fontWeight: 700, marginBottom: 4 },
  card: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 6,
    padding: 10,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  table: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 6,
  },
  trHead: {
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    flexDirection: 'row',
  },
  th: { flex: 1, fontSize: 10, fontWeight: 700, padding: 6 },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  td: { flex: 1, fontSize: 10, padding: 6 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: 6,
    fontSize: 9,
    color: COLORS.sub,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

// ---------- Subcomponentes ----------
const ProgressBar: React.FC<{ value: number }> = ({ value }) => (
  <View style={{ height: 8, backgroundColor: COLORS.line, borderRadius: 4 }}>
    <View
      style={{
        height: 8,
        width: `${Math.max(0, Math.min(value, 100))}%`,
        backgroundColor:
          value >= 80 ? COLORS.ok : value >= 40 ? COLORS.warn : COLORS.danger,
      }}
    />
  </View>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={styles.h2}>{children}</Text>
);

// ---------- Documento principal ----------
const ProjectReport: React.FC<{ data: ProjectReportData; sections: ReportSections }> = ({
  data,
  sections,
}) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Portada */}
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          {/* Asegúrate de tener /public/logo.png */}
          <Image src="/logo.png" style={{ width: 72, height: 72, marginBottom: 10 }} />
          <Text style={styles.h1}>Reporte del Proyecto</Text>
          <Text style={{ marginBottom: 2 }}>{data.projectName}</Text>
          {!!data.managerName && <Text style={{ marginBottom: 2 }}>Responsable: {data.managerName}</Text>}
          <Text>Generado: {data.generatedAt}</Text>
        </View>

        {/* Resumen ejecutivo */}
        {sections.summary && (
          <View style={styles.card}>
            <SectionTitle>Resumen ejecutivo</SectionTitle>
            <Text style={{ marginBottom: 4 }}>
              El proyecto <Text style={{ fontWeight: 700 }}>{data.projectName}</Text> presenta un
              progreso general del {data.overallProgress}%.
            </Text>
            <Text style={{ marginBottom: 2 }}>
              Fases activas: {data.phases.length}. Elementos críticos: {data.critical.length}.
            </Text>
            {data.milestones.length > 0 && (
              <Text>
                Próximos hitos (30 días): {data.milestones.length}. Revise el detalle en la sección correspondiente.
              </Text>
            )}
          </View>
        )}

        {/* Progreso general */}
        <View style={styles.card}>
          <SectionTitle>Progreso general</SectionTitle>
          <ProgressBar value={data.overallProgress} />
          <Text>{data.overallProgress}%</Text>
        </View>

        {/* Fases */}
        <View style={{ marginBottom: 6 }}>
          <SectionTitle>Fases</SectionTitle>
          {data.phases.length === 0 && (
            <Text style={{ color: COLORS.sub }}>No hay fases registradas.</Text>
          )}
          {data.phases.map((ph) => (
            <View key={ph.id} style={styles.card}>
              <Text style={styles.h3}>{ph.name}</Text>
              <View style={{ marginVertical: 4 }}>
                <ProgressBar value={ph.progress || 0} />
              </View>
              <Text style={{ marginBottom: 4 }}>{Math.round(ph.progress || 0)}%</Text>

              {/* (Opcional) lista breve de tareas de la fase */}
              {ph.tasks?.length > 0 && (
                <View style={styles.table}>
                  <View style={styles.trHead}>
                    <Text style={[styles.th, { flex: 2 }]}>Tarea</Text>
                    <Text style={styles.th}>Resp.</Text>
                    <Text style={styles.th}>Fecha límite</Text>
                    <Text style={styles.th}>Estado</Text>
                    <Text style={styles.th}>Progreso</Text>
                  </View>
                  {ph.tasks.map((t) => (
                    <View key={t.id} style={styles.tr}>
                      <Text style={[styles.td, { flex: 2 }]}>{t.name}</Text>
                      <Text style={styles.td}>{t.assignedToName || '—'}</Text>
                      <Text style={styles.td}>{t.dueDate || '—'}</Text>
                      <Text style={styles.td}>
                        {t.status === 'completed'
                          ? 'Completada'
                          : t.status === 'in_progress'
                          ? 'En progreso'
                          : 'Pendiente'}
                      </Text>
                      <Text style={styles.td}>{Math.round(t.progress || 0)}%</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Alertas críticas */}
        {sections.risks && data.critical.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <SectionTitle>Alertas y riesgos</SectionTitle>
            <View style={styles.table}>
              <View style={styles.trHead}>
                <Text style={styles.th}>Tipo</Text>
                <Text style={[styles.th, { flex: 2 }]}>Elemento</Text>
                <Text style={styles.th}>Responsable</Text>
                <Text style={styles.th}>Fecha límite</Text>
                <Text style={styles.th}>Severidad</Text>
              </View>
              {data.critical.map((c, i) => (
                <View key={i} style={styles.tr}>
                  <Text style={styles.td}>{c.type}</Text>
                  <Text style={[styles.td, { flex: 2 }]}>{c.name}</Text>
                  <Text style={styles.td}>{c.assignedToName}</Text>
                  <Text style={styles.td}>{c.dueDate}</Text>
                  <Text
                    style={[
                      styles.td,
                      { color: c.severity === 'Atrasada' ? COLORS.danger : COLORS.warn },
                    ]}
                  >
                    {c.severity}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Próximos hitos */}
        {sections.milestones && (
          <View style={{ marginTop: 8 }}>
            <SectionTitle>Próximos hitos (30 días)</SectionTitle>
            {data.milestones.length === 0 && (
              <Text style={{ color: COLORS.sub }}>No hay hitos próximos.</Text>
            )}
            {data.milestones.length > 0 && (
              <View style={styles.table}>
                <View style={styles.trHead}>
                  <Text style={styles.th}>Tipo</Text>
                  <Text style={[styles.th, { flex: 2 }]}>Elemento</Text>
                  <Text style={styles.th}>Fase</Text>
                  <Text style={styles.th}>Responsable</Text>
                  <Text style={styles.th}>Fecha límite</Text>
                </View>
                {data.milestones.map((m, i) => (
                  <View key={i} style={styles.tr}>
                    <Text style={styles.td}>{m.type}</Text>
                    <Text style={[styles.td, { flex: 2 }]}>{m.name}</Text>
                    <Text style={styles.td}>{m.phaseName || '—'}</Text>
                    <Text style={styles.td}>{m.assignedToName || '—'}</Text>
                    <Text style={styles.td}>{m.dueDate}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Workload */}
        {sections.workload && data.workload.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <SectionTitle>Carga de trabajo</SectionTitle>
            <View style={styles.table}>
              <View style={styles.trHead}>
                <Text style={[styles.th, { flex: 2 }]}>Responsable</Text>
                <Text style={styles.th}>Tareas asignadas</Text>
              </View>
              {data.workload.map((w, i) => (
                <View key={i} style={styles.tr}>
                  <Text style={[styles.td, { flex: 2 }]}>{w.name}</Text>
                  <Text style={styles.td}>{w.count}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Pie de página */}
        <View fixed style={styles.footer}>
          <Text>{data.projectName}</Text>
          <Text>MediFlow – Confidencial</Text>
        </View>
      </Page>
    </Document>
  );
};

export default ProjectReport;
