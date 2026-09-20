"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import EmptyState from "@/components/ui/EmptyState";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import { fetchPrenominaPreview, type PrenominaPreviewRow } from "@/lib/finance-api";

const MODULO_COMPLETO = "/erp/finance/prenomina";

function isoHoy() {
  return new Date().toISOString().slice(0, 10);
}

function isoHaceDias(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function horasYMinutos(minutos: number) {
  const m = Math.max(0, Math.round(minutos));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Motivos por los que una fila no se puede pagar tal cual. */
function incidenciasDe(row: PrenominaPreviewRow): string[] {
  const motivos: string[] = [];
  if (row.sueldoSemanal == null || row.sueldoSemanal <= 0) {
    motivos.push("sin sueldo semanal capturado");
  }
  if ((row.daysWithAttendance || 0) === 0) {
    motivos.push("sin checadas en el periodo");
  }
  const abiertos = row.openDays?.length ?? 0;
  if (abiertos > 0) {
    motivos.push(abiertos === 1 ? "1 jornada sin cerrar" : `${abiertos} jornadas sin cerrar`);
  }
  return motivos;
}

/**
 * Pre-nómina dentro del hub de Contabilidad: el resumen del periodo, sin salir de aquí.
 *
 * Antes esta página solo redirigía a `/erp/finance/prenomina`, así que la contadora perdía el
 * contexto del hub para ver una cifra. Ahora lee el MISMO endpoint que usa el módulo completo
 * (`GET /api/employee-payments/preview-period`) y solo suma lo que la API ya devolvió: aquí no
 * se recalcula nómina ni se emite CFDI. Para operar (seleccionar gente, aprobar extras, generar
 * los borradores de pago) el enlace lleva al módulo completo, que es donde vive ese flujo.
 */
export default function ContabilidadPrenominaPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [desde, setDesde] = useState(isoHaceDias(6));
  const [hasta, setHasta] = useState(isoHoy());
  const [rows, setRows] = useState<PrenominaPreviewRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      const preview = await fetchPrenominaPreview(token, desde, hasta);
      setRows(Array.isArray(preview?.rows) ? preview.rows : []);
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar la pre-nómina del periodo"));
      setRows([]);
    } finally {
      setCargando(false);
      setCargado(true);
    }
  }, [token, desde, hasta]);

  useEffect(() => {
    void cargar();
    // Solo al entrar y cuando cambia la sesión; el rango se aplica con el botón.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const resumen = useMemo(() => {
    let sueldoBase = 0;
    let minutosExtra = 0;
    let minutosTrabajados = 0;
    let total = 0;
    let sinMonto = 0;
    let conIncidencia = 0;

    for (const row of rows) {
      sueldoBase += row.sueldoSemanal ?? 0;
      minutosExtra += row.approvedOvertimeMinutes ?? 0;
      minutosTrabajados += row.totalMinutes ?? 0;
      if (row.suggestedAmount != null) total += row.suggestedAmount;
      else sinMonto += 1;
      if (incidenciasDe(row).length > 0) conIncidencia += 1;
    }

    return {
      empleados: rows.length,
      sueldoBase,
      minutosExtra,
      minutosTrabajados,
      total,
      sinMonto,
      conIncidencia,
    };
  }, [rows]);

  const filasConIncidencia = useMemo(
    () => rows.filter((r) => incidenciasDe(r).length > 0),
    [rows],
  );

  const columnas: Column<PrenominaPreviewRow>[] = [
    {
      key: "persona",
      label: "Persona",
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.nombre || `Usuario #${r.userId}`}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {r.puesto || r.email || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "trabajado",
      label: "Trabajado",
      numeric: true,
      align: "right",
      render: (r) => horasYMinutos(r.totalMinutes || 0),
    },
    {
      key: "extras",
      label: "Extras aprobados",
      numeric: true,
      align: "right",
      render: (r) => horasYMinutos(r.approvedOvertimeMinutes || 0),
    },
    {
      key: "sueldo",
      label: "Sueldo base semanal",
      numeric: true,
      align: "right",
      render: (r) => (r.sueldoSemanal != null ? <Money value={r.sueldoSemanal} /> : "—"),
    },
    {
      key: "total",
      label: "Total sugerido",
      numeric: true,
      align: "right",
      render: (r) =>
        r.suggestedAmount != null ? (
          <Money value={r.suggestedAmount} />
        ) : (
          <span style={{ color: "var(--text-tertiary)" }}>Captura manual</span>
        ),
    },
    {
      key: "revisar",
      label: "Revisar",
      render: (r) => {
        const motivos = incidenciasDe(r);
        if (motivos.length === 0) {
          return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>;
        }
        return (
          <span style={{ fontSize: 12, color: "var(--state-warning-text, #b45309)" }}>
            {motivos.join(" · ")}
          </span>
        );
      },
    },
  ];

  const hayDatos = rows.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="ERP · Contabilidad"
        title="Pre-nómina"
        subtitle="Lo que se va a pagar este periodo, según checadas y extras ya aprobados."
        density="ops"
        actions={
          <Link
            href={MODULO_COMPLETO}
            style={{ fontSize: 12, fontWeight: 600, textDecoration: "none" }}
          >
            Abrir módulo completo →
          </Link>
        }
      />

      <Section
        title="Periodo"
        subtitle="Elige el rango y vuelve a calcular."
        dense
        actions={
          <Button size="sm" onClick={() => void cargar()} loading={cargando} disabled={!token}>
            Calcular
          </Button>
        }
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--text-secondary)" }}>
            Desde
            <input
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => setDesde(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--text-secondary)" }}>
            Hasta
            <input
              type="date"
              value={hasta}
              min={desde}
              onChange={(e) => setHasta(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            />
          </label>
        </div>
      </Section>

      {error ? <InlineAlert message={error} variant="danger" onDismiss={() => setError(null)} /> : null}

      {cargando && !cargado ? (
        <Section title="Resumen del periodo" dense>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
            Calculando el periodo…
          </p>
        </Section>
      ) : null}

      {cargado && !error && !hayDatos ? (
        <EmptyState
          title="Sin gente activa en este periodo"
          description="No hay personal con checadas en el rango elegido. Prueba con otro periodo o revisa las altas del mes."
          action={
            <Button size="sm" variant="secondary" onClick={() => void cargar()}>
              Volver a calcular
            </Button>
          }
        />
      ) : null}

      {hayDatos ? (
        <>
          <Section title="Resumen del periodo" subtitle={`${desde} → ${hasta}`} dense>
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              }}
            >
              <KpiCard label="Empleados" value={resumen.empleados} hint="Con alta activa" />
              <KpiCard
                label="Sueldo base semanal"
                value={<Money value={resumen.sueldoBase} />}
                hint="Suma de los sueldos capturados"
              />
              <KpiCard
                label="Horas extra aprobadas"
                value={horasYMinutos(resumen.minutosExtra)}
                hint="Solo las ya autorizadas"
                variant={resumen.minutosExtra > 0 ? "accent" : "default"}
              />
              <KpiCard
                label="Total sugerido"
                value={<Money value={resumen.total} />}
                hint="Ordinario + extras del periodo"
                variant="positive"
              />
              <KpiCard
                label="Por revisar"
                value={resumen.conIncidencia}
                hint={
                  resumen.conIncidencia === 0
                    ? "Nada pendiente"
                    : "Filas que no deben pagarse así"
                }
                variant={resumen.conIncidencia > 0 ? "warning" : "default"}
              />
            </div>

            <p style={{ marginTop: 12, marginBottom: 0, fontSize: 12.5, color: "var(--text-secondary)" }}>
              La pre-nómina no lleva bonos ni descuentos: se capturan al generar el pago en el
              módulo completo. Aquí ves el sueldo base, las horas extra ya aprobadas y el total
              sugerido que resulta de ambos. No es un CFDI de nómina.
            </p>
          </Section>

          {resumen.conIncidencia > 0 ? (
            <Section
              title="Incidencias que requieren revisión"
              subtitle={`${filasConIncidencia.length} de ${rows.length} personas necesitan una corrección antes de pagar.`}
              dense
              flush
            >
              <DataTable
                columns={columnas}
                rows={filasConIncidencia}
                rowKey={(r) => r.userId}
                density="compact"
                emptyTitle="Sin incidencias"
              />
            </Section>
          ) : null}

          <Section
            title="Detalle por persona"
            subtitle="Lectura. Para seleccionar gente, aprobar extras y generar los borradores de pago, abre el módulo completo."
            dense
            flush
            actions={
              <Link
                href={MODULO_COMPLETO}
                style={{ fontSize: 12, fontWeight: 600, textDecoration: "none" }}
              >
                Operar la pre-nómina →
              </Link>
            }
          >
            <DataTable
              columns={columnas}
              rows={rows}
              rowKey={(r) => r.userId}
              density="compact"
              emptyTitle="Sin personas en el periodo"
            />
          </Section>
        </>
      ) : null}
    </>
  );
}
