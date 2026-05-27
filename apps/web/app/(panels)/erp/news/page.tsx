"use client";

import { useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";

type Tab = "comunicados" | "newsletter";

type Comunicado = {
  id: string;
  titulo: string;
  audiencia: string;
  autor: string;
  fechaEnvio: string;
  estado: "Borrador" | "Programado" | "Enviado";
  lecturas: string;
  prioridad: "Normal" | "Alta" | "Crítica";
};

type NewsletterEdicion = {
  id: string;
  titulo: string;
  mes: string;
  estado: "Borrador" | "Programado" | "Enviado";
  envios: number;
  apertura: string;
  click: string;
};

const COMUNICADOS: Comunicado[] = [
  { id: "C-026", titulo: "Nueva política de viáticos en campo", audiencia: "Todo NEXARA", autor: "Karen Elizalde", fechaEnvio: "2026-05-18", estado: "Enviado", lecturas: "47 / 52", prioridad: "Alta" },
  { id: "C-025", titulo: "Adquisición Anfora — onboarding técnico", audiencia: "OPS · NOC", autor: "Luis Aguilar", fechaEnvio: "2026-05-12", estado: "Enviado", lecturas: "18 / 18", prioridad: "Crítica" },
  { id: "C-024", titulo: "Bono trimestral Q2 — bases del cálculo", audiencia: "Comercial", autor: "Karen Elizalde", fechaEnvio: "2026-05-30", estado: "Programado", lecturas: "—", prioridad: "Normal" },
  { id: "C-023", titulo: "Renovación de certificaciones Hikvision", audiencia: "Ingeniería", autor: "Carolina Juárez", fechaEnvio: "2026-05-08", estado: "Enviado", lecturas: "22 / 24", prioridad: "Alta" },
  { id: "C-022", titulo: "Recordatorio: subida de horas viernes 18:00", audiencia: "Todo NEXARA", autor: "Adriana Castro", fechaEnvio: "2026-05-05", estado: "Enviado", lecturas: "49 / 52", prioridad: "Normal" },
];

const NEWSLETTERS: NewsletterEdicion[] = [
  { id: "NL-2026-05", titulo: "Mayo · Récord de OT completadas", mes: "Mayo 2026", estado: "Programado", envios: 0, apertura: "—", click: "—" },
  { id: "NL-2026-04", titulo: "Abril · 3 nuevos contratos master", mes: "Abril 2026", estado: "Enviado", envios: 52, apertura: "78%", click: "34%" },
  { id: "NL-2026-03", titulo: "Marzo · Bienvenidos al equipo", mes: "Marzo 2026", estado: "Enviado", envios: 49, apertura: "82%", click: "41%" },
  { id: "NL-2026-02", titulo: "Febrero · KPI Q1 y metas", mes: "Febrero 2026", estado: "Enviado", envios: 47, apertura: "71%", click: "28%" },
];

const ESTADO_VARIANT: Record<Comunicado["estado"], "neutral" | "warning" | "positive"> = {
  Borrador: "neutral",
  Programado: "warning",
  Enviado: "positive",
};

const PRIORIDAD_VARIANT: Record<Comunicado["prioridad"], "neutral" | "warning" | "danger"> = {
  Normal: "neutral",
  Alta: "warning",
  Crítica: "danger",
};

export default function ComunicacionesInternasPage() {
  const [tab, setTab] = useState<Tab>("comunicados");

  return (
    <>
      <PageHeader
        eyebrow="ERP · Comunicación interna"
        title="Comunicados y newsletter"
        subtitle="Punto único para hablar con el equipo: anuncios puntuales, boletín mensual y métricas de lectura."
        actions={
          tab === "comunicados" ? (
            <Button variant="primary" iconLeft="📢">Nuevo comunicado</Button>
          ) : (
            <Button variant="primary" iconLeft="✉️">Nueva edición</Button>
          )
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <KpiCard
          label="Comunicados activos"
          value="3"
          icon="📰"
          trend={{ value: "+1 vs abril", direction: "up" }}
          variant="accent"
        />
        <KpiCard
          label="Lectura promedio"
          value="91%"
          icon="✅"
          trend={{ value: "+4 pts", direction: "up" }}
          variant="positive"
        />
        <KpiCard
          label="Newsletter del mes"
          value="Mayo 2026"
          icon="📧"
          hint="Programado para 03/06"
        />
        <KpiCard
          label="Apertura promedio"
          value="77%"
          icon="📬"
          trend={{ value: "+6 pts vs Q1", direction: "up" }}
          variant="positive"
        />
      </div>

      <div
        role="tablist"
        aria-label="Selector de vista"
        style={{
          display: "inline-flex",
          background: "var(--surface-2, #f3f4f6)",
          padding: 4,
          borderRadius: 10,
          border: "1px solid var(--border, #e5e7eb)",
          gap: 2,
          marginBottom: 20,
        }}
      >
        <TabButton active={tab === "comunicados"} onClick={() => setTab("comunicados")} icon="📰" label="Comunicados" count={COMUNICADOS.length} />
        <TabButton active={tab === "newsletter"} onClick={() => setTab("newsletter")} icon="📧" label="Newsletter" count={NEWSLETTERS.length} />
      </div>

      {tab === "comunicados" ? (
        <Section
          title="Comunicados internos"
          subtitle="Avisos puntuales para todo el equipo o segmentos. Soporta confirmación de lectura (clave para temas legales)."
        >
          <DataTable<Comunicado>
            rows={COMUNICADOS}
            rowKey={(c) => c.id}
            emptyTitle="Sin comunicados"
            emptyDescription="Crea el primer comunicado para tu equipo."
            columns={[
              { key: "id", label: "ID", width: 80, accessor: (c) => c.id },
              { key: "titulo", label: "Título", render: (c) => <strong>{c.titulo}</strong> },
              { key: "audiencia", label: "Audiencia", render: (c) => <Tag variant="neutral">{c.audiencia}</Tag> },
              { key: "autor", label: "Autor", accessor: (c) => c.autor },
              { key: "fechaEnvio", label: "Envío", width: 110, accessor: (c) => c.fechaEnvio },
              { key: "prioridad", label: "Prioridad", width: 110, render: (c) => <Tag variant={PRIORIDAD_VARIANT[c.prioridad]}>{c.prioridad}</Tag> },
              { key: "estado", label: "Estado", width: 110, render: (c) => <Tag variant={ESTADO_VARIANT[c.estado]}>{c.estado}</Tag> },
              { key: "lecturas", label: "Lecturas", width: 100, align: "right", render: (c) => <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>{c.lecturas}</span> },
            ]}
          />
        </Section>
      ) : (
        <Section
          title="Newsletter mensual"
          subtitle="Boletín del equipo con highlights del mes: OT destacadas, nuevos clientes, cumpleaños y eventos. Envío automático el primer lunes."
        >
          <DataTable<NewsletterEdicion>
            rows={NEWSLETTERS}
            rowKey={(n) => n.id}
            emptyTitle="Sin ediciones"
            emptyDescription="Crea la primera edición de la newsletter."
            columns={[
              { key: "id", label: "ID", width: 120, accessor: (n) => n.id },
              { key: "titulo", label: "Título", render: (n) => <strong>{n.titulo}</strong> },
              { key: "mes", label: "Edición", width: 130, accessor: (n) => n.mes },
              { key: "estado", label: "Estado", width: 110, render: (n) => <Tag variant={ESTADO_VARIANT[n.estado]}>{n.estado}</Tag> },
              { key: "envios", label: "Envíos", width: 80, align: "right", render: (n) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{n.envios || "—"}</span> },
              { key: "apertura", label: "Apertura", width: 90, align: "right", accessor: (n) => n.apertura },
              { key: "click", label: "Clicks", width: 80, align: "right", accessor: (n) => n.click },
            ]}
          />
        </Section>
      )}
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 8,
        background: active ? "var(--surface, #fff)" : "transparent",
        border: active ? "1px solid var(--border, #e5e7eb)" : "1px solid transparent",
        color: active ? "var(--text-primary, #111)" : "var(--text-secondary, #6b7280)",
        fontWeight: 600,
        fontSize: 13,
        cursor: "pointer",
        transition: "background 0.15s, color 0.15s",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
      <span
        style={{
          fontSize: 11,
          padding: "1px 6px",
          borderRadius: 999,
          background: active ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "var(--surface-2, #f3f4f6)",
          color: active ? "var(--primary, #0ea5e9)" : "var(--text-secondary, #6b7280)",
          fontWeight: 700,
        }}
      >
        {count}
      </span>
    </button>
  );
}
