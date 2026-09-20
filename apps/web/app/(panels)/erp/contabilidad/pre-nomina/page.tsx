"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import StatusDot from "@/components/ui/StatusDot";
import {
  FinanceField,
  FinanceFormGrid,
  financeInputStyle,
} from "@/components/finance/FinanceModuleShell";
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

/** `2026-09-14` → `14 sep`, para listar días sin ensanchar la celda. */
function diaCorto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${m[3]} ${meses[Number(m[2]) - 1] ?? m[2]}`;
}

/**
 * Motivos por los que una fila no se puede pagar tal cual. Las jornadas sin
 * cerrar se nombran por su día: la API manda las fechas en `openDays` y decir
 * solo «2 jornadas sin cerrar» obliga a ir a buscarlas a otra pantalla.
 */
function incidenciasDe(row: PrenominaPreviewRow): string[] {
  const motivos: string[] = [];
  if (row.sueldoSemanal == null || row.sueldoSemanal <= 0) {
    motivos.push("sin sueldo semanal capturado");
  }
  if ((row.daysWithAttendance || 0) === 0) {
    motivos.push("sin checadas en el periodo");
  }
  const abiertos = row.openDays ?? [];
  if (abiertos.length > 0) {
    const dias = abiertos.map(diaCorto).join(", ");
    motivos.push(
      abiertos.length === 1
        ? `jornada sin cerrar el ${dias}`
        : `${abiertos.length} jornadas sin cerrar (${dias})`,
    );
  }
  return motivos;
}

/** Qué está mal en el rango, dicho como se corrige y pegado a su campo. */
function validarRango(
  desde: string,
  hasta: string,
): { campo: "desde" | "hasta"; mensaje: string } | null {
  if (!desde) {
    return { campo: "desde", mensaje: "Falta el primer día del periodo. Elígelo para calcular." };
  }
  if (!hasta) {
    return { campo: "hasta", mensaje: "Falta el último día del periodo. Elígelo para calcular." };
  }
  if (desde > hasta) {
    return {
      campo: "hasta",
      mensaje: "El último día es anterior al primero. Ponlo en el mismo día o después.",
    };
  }
  return null;
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
  const { user, isContextReady } = useUser();
  const token = user?.token ?? "";

  const [desde, setDesde] = useState(isoHaceDias(6));
  const [hasta, setHasta] = useState(isoHoy());
  const [rows, setRows] = useState<PrenominaPreviewRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);
  const [errorRango, setErrorRango] = useState<{
    campo: "desde" | "hasta";
    mensaje: string;
  } | null>(null);
  const [detalle, setDetalle] = useState<PrenominaPreviewRow | null>(null);
  /**
   * El periodo que contestó la API, no el que está escrito en los campos. Son
   * distintos en cuanto se cambia una fecha y todavía no se pulsa «Calcular»:
   * el encabezado decía el rango nuevo sobre cifras del viejo.
   */
  const [periodoCargado, setPeriodoCargado] = useState<{ from: string; to: string } | null>(null);

  const peticion = useRef(0);

  const cargar = useCallback(async () => {
    if (!token) return;
    const problema = validarRango(desde, hasta);
    setErrorRango(problema);
    if (problema) return;
    const turno = ++peticion.current;
    setCargando(true);
    setError(null);
    try {
      const preview = await fetchPrenominaPreview(token, desde, hasta);
      if (turno !== peticion.current) return;
      setRows(Array.isArray(preview?.rows) ? preview.rows : []);
      // `from`/`to` los normaliza la API; se guarda lo que contestó, no lo pedido.
      setPeriodoCargado({ from: preview?.from ?? desde, to: preview?.to ?? hasta });
    } catch (e) {
      if (turno !== peticion.current) return;
      setError(
        `${formatApiError(e, "No se pudo cargar la pre-nómina del periodo")} Vuelve a pulsar «Calcular»; si sigue fallando, prueba con un periodo más corto.`,
      );
      setRows([]);
      setPeriodoCargado(null);
    } finally {
      if (turno === peticion.current) {
        setCargando(false);
        setCargado(true);
      }
    }
  }, [token, desde, hasta]);

  useEffect(() => {
    if (!isContextReady) return;
    // Sin sesión no hay nómina que calcular: se corta el «Calculando…» eterno.
    if (!token) {
      setCargando(false);
      setCargado(true);
      return;
    }
    void cargar();
    // Solo al entrar y cuando cambia la sesión; el rango se aplica con el botón.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isContextReady, token]);

  // Con siete columnas la tabla solo cabía por debajo de 1024px a base de
  // scroll horizontal. Lo que ya vive en el detalle del renglón se retira.
  const [angosto, setAngosto] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const sync = () => setAngosto(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const sinSesion = isContextReady && !token;
  const periodoPendiente =
    !!periodoCargado && (periodoCargado.from !== desde || periodoCargado.to !== hasta);

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

  /**
   * La tira del periodo. Cada pista dice de qué está hecha la cifra, porque
   * «Total sugerido» no es lo que se va a pagar: no lleva bonos ni descuentos,
   * y deja fuera a quien no tiene sueldo capturado.
   */
  const resumenStrip: Metric[] = useMemo(
    () => [
      {
        label: "Empleados",
        value: resumen.empleados,
        hint: "Con alta activa",
      },
      {
        label: "Sueldo base semanal",
        value: <Money value={resumen.sueldoBase} />,
        hint: "Suma de los sueldos capturados",
      },
      {
        // Se sumaba y no se pintaba: es el contraste que da sentido a las
        // extras y lo que delata un periodo con checadas incompletas.
        label: "Horas trabajadas",
        value: horasYMinutos(resumen.minutosTrabajados),
        hint: "Suma de las checadas del periodo",
      },
      {
        label: "Horas extra aprobadas",
        value: horasYMinutos(resumen.minutosExtra),
        hint: "Solo las ya autorizadas",
      },
      {
        label: "Total sugerido",
        value: <Money value={resumen.total} />,
        hint:
          resumen.sinMonto > 0
            ? `Ordinario + extras · ${resumen.sinMonto} de captura manual`
            : "Ordinario + extras del periodo",
      },
      {
        label: "Por revisar",
        value: resumen.conIncidencia,
        hint:
          resumen.conIncidencia === 0 ? "Nada pendiente" : "Filas que no deben pagarse así",
        tone: resumen.conIncidencia > 0 ? "warning" : "default",
      },
    ],
    [resumen],
  );

  const columnas: Column<PrenominaPreviewRow>[] = [
    {
      key: "persona",
      label: "Persona",
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.nombre || `Usuario #${r.userId}`}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {[r.puesto || r.email || null, angosto ? `${r.daysWithAttendance ?? 0} días` : null]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
        </div>
      ),
    },
    ...(angosto
      ? []
      : [
          {
            // `daysWithAttendance` llegaba de la API y solo se usaba para decidir
            // si había incidencia; es el dato que explica por qué unas horas son
            // pocas. En angosto baja bajo el nombre.
            key: "dias",
            label: "Días con checada",
            numeric: true,
            align: "right" as const,
            render: (r: PrenominaPreviewRow) =>
              r.daysWithAttendance > 0 ? (
                r.daysWithAttendance
              ) : (
                <span style={{ color: "var(--text-tertiary)" }}>0</span>
              ),
          },
        ]),
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
    ...(angosto
      ? []
      : [
          {
            key: "sueldo",
            label: "Sueldo base semanal",
            numeric: true,
            align: "right" as const,
            render: (r: PrenominaPreviewRow) =>
              r.sueldoSemanal != null ? <Money value={r.sueldoSemanal} /> : "—",
          },
        ]),
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
        // El motivo completo se conserva —es lo que dice por qué no se puede
        // pagar la fila tal cual—, pero baja a 11px bajo la palabra para no
        // ensanchar la tabla. El color solo aparece cuando hay un motivo.
        return motivos.length === 0 ? (
          <StatusDot label="Sin pendientes" tone="neutral" />
        ) : (
          <div style={{ maxWidth: 230 }}>
            <StatusDot label="Por revisar" tone="warning" />
            <div
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                marginTop: 2,
                lineHeight: 1.35,
              }}
            >
              {motivos.join(" · ")}
            </div>
          </div>
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

      <Section title="Periodo" subtitle="Elige el rango y vuelve a calcular." dense>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void cargar();
          }}
        >
          <FinanceFormGrid>
            <FinanceField
              label="Desde"
              hint="Primer día que entra al cálculo"
              error={errorRango?.campo === "desde" ? errorRango.mensaje : null}
            >
              <input
                type="date"
                value={desde}
                max={hasta}
                onChange={(e) => {
                  setDesde(e.target.value);
                  setErrorRango(null);
                }}
                aria-invalid={errorRango?.campo === "desde" ? true : undefined}
                style={financeInputStyle}
              />
            </FinanceField>
            <FinanceField
              label="Hasta"
              hint="Último día, inclusive"
              error={errorRango?.campo === "hasta" ? errorRango.mensaje : null}
            >
              <input
                type="date"
                value={hasta}
                min={desde}
                onChange={(e) => {
                  setHasta(e.target.value);
                  setErrorRango(null);
                }}
                aria-invalid={errorRango?.campo === "hasta" ? true : undefined}
                style={financeInputStyle}
              />
            </FinanceField>
          </FinanceFormGrid>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 12,
              marginTop: 14,
              paddingTop: 12,
              borderTop: "1px solid var(--nx-panel-hairline, var(--border))",
            }}
          >
            {/* Cambiar las fechas no recalcula solo. Decirlo evita leer cifras
                de un periodo creyendo que son de otro. */}
            {periodoPendiente && !cargando ? (
              <span
                role="status"
                style={{ fontSize: 12, color: "var(--state-warning-text, #b45309)" }}
              >
                Cambiaste el periodo. Las cifras de abajo siguen siendo del{" "}
                {periodoCargado?.from} al {periodoCargado?.to}: pulsa «Calcular» para actualizarlas.
              </span>
            ) : null}
            <Button
              size="sm"
              variant="primary"
              type="submit"
              loading={cargando}
              disabled={!token}
              title={sinSesion ? "Necesitas una sesión activa para calcular" : undefined}
            >
              {cargando ? "Calculando…" : "Calcular"}
            </Button>
          </div>
        </form>
      </Section>

      {sinSesion ? (
        <InlineAlert
          variant="warning"
          message="No hay sesión activa, así que no se puede calcular la pre-nómina. Vuelve a entrar con tu cuenta para consultarla."
          action={
            <Link href="/login" style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
              Ir a entrar
            </Link>
          }
        />
      ) : null}

      {error ? (
        <InlineAlert
          message={error}
          variant="danger"
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" variant="secondary" onClick={() => void cargar()} disabled={cargando}>
              {cargando ? "Reintentando…" : "Reintentar"}
            </Button>
          }
        />
      ) : null}

      {cargando && !cargado ? (
        <Section title="Resumen del periodo" dense>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
            Calculando el periodo…
          </p>
        </Section>
      ) : null}

      {cargado && !error && !sinSesion && !hayDatos ? (
        <EmptyState
          title="Sin gente activa en este periodo"
          description={`Entre el ${desde} y el ${hasta} no hay personal con alta activa ni checadas. Prueba con otro periodo o revisa las altas del mes.`}
          action={
            <Button size="sm" variant="secondary" onClick={() => void cargar()} disabled={cargando}>
              {cargando ? "Calculando…" : "Volver a calcular"}
            </Button>
          }
        />
      ) : null}

      {hayDatos ? (
        <>
          <Section
            title="Resumen del periodo"
            subtitle={
              periodoCargado
                ? `${periodoCargado.from} → ${periodoCargado.to} · ${resumen.empleados} persona(s)`
                : `${desde} → ${hasta}`
            }
            dense
          >
            <MetricStrip metrics={resumenStrip} ariaLabel="Resumen de la pre-nómina" />

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
                onRowClick={(r) => setDetalle(r)}
              />
            </Section>
          ) : null}

          <Section
            title="Detalle por persona"
            subtitle="Lectura. Abre un renglón para ver de dónde sale su total. Para seleccionar gente, aprobar extras y generar los borradores de pago, abre el módulo completo."
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
              onRowClick={(r) => setDetalle(r)}
            />
          </Section>
        </>
      ) : null}

      <Modal
        open={!!detalle}
        onClose={() => setDetalle(null)}
        title={detalle ? detalle.nombre || `Usuario #${detalle.userId}` : ""}
        maxWidth={560}
        footer={
          <Button size="sm" variant="ghost" onClick={() => setDetalle(null)}>
            Cerrar
          </Button>
        }
      >
        {detalle ? <DetallePersona row={detalle} /> : null}
      </Modal>
    </>
  );
}

/**
 * De dónde sale el total sugerido. La API ya manda el desglose y la fórmula que
 * usó (`suggestedBreakdown`) y no se veía en ningún sitio: sin eso, la cifra
 * hay que creérsela. Aquí no se recalcula nada, solo se muestra lo recibido.
 */
function DetallePersona({ row }: { row: PrenominaPreviewRow }) {
  const d = row.suggestedBreakdown;
  const motivos = incidenciasDe(row);
  const filas: { label: string; value: string }[] = [
    { label: "Puesto", value: row.puesto || "—" },
    { label: "Correo", value: row.email || "—" },
    { label: "Días con checada", value: String(row.daysWithAttendance ?? 0) },
    { label: "Trabajado", value: horasYMinutos(row.totalMinutes || 0) },
    { label: "Extras aprobados", value: horasYMinutos(row.approvedOvertimeMinutes || 0) },
    {
      label: "Jornadas sin cerrar",
      value: row.openDays?.length ? row.openDays.map(diaCorto).join(", ") : "ninguna",
    },
  ];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "8px 16px",
          margin: 0,
          fontSize: 13,
        }}
      >
        {filas.map((f) => (
          <Fragment key={f.label}>
            <dt
              style={{
                color: "var(--text-tertiary)",
                fontSize: 11.5,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {f.label}
            </dt>
            <dd style={{ margin: 0 }}>{f.value}</dd>
          </Fragment>
        ))}
      </dl>

      <div>
        <h3
          style={{
            margin: "0 0 6px",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          Cómo se calculó el total
        </h3>
        {d ? (
          <>
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "6px 16px",
                margin: 0,
                fontSize: 13,
              }}
            >
              <dt style={{ color: "var(--text-secondary)" }}>Sueldo semanal</dt>
              <dd style={{ margin: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {d.sueldoSemanal != null ? <Money value={d.sueldoSemanal} bold={false} /> : "—"}
              </dd>
              <dt style={{ color: "var(--text-secondary)" }}>Valor del minuto ordinario</dt>
              <dd style={{ margin: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {d.minutoOrdinario != null ? `$${d.minutoOrdinario.toFixed(4)}` : "—"}
              </dd>
              <dt style={{ color: "var(--text-secondary)" }}>Minutos ordinarios</dt>
              <dd style={{ margin: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {d.minutosOrdinarios.toLocaleString("es-MX")}
              </dd>
              <dt style={{ color: "var(--text-secondary)" }}>Minutos extra aprobados</dt>
              <dd style={{ margin: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {d.minutosExtraAprobados.toLocaleString("es-MX")}
              </dd>
              <dt style={{ color: "var(--text-primary)", fontWeight: 600 }}>Total sugerido</dt>
              <dd style={{ margin: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {d.suggestedAmount != null ? (
                  <Money value={d.suggestedAmount} />
                ) : (
                  "captura manual"
                )}
              </dd>
            </dl>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 11.5,
                color: "var(--text-tertiary)",
                lineHeight: 1.4,
              }}
            >
              Fórmula que aplicó el servidor: {d.formula}
            </p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)" }}>
            — El servidor no mandó el desglose de esta persona, así que no se puede mostrar de qué
            se compone su total.
          </p>
        )}
      </div>

      {motivos.length > 0 ? (
        <InlineAlert
          variant="warning"
          message={`No se debe pagar así: ${motivos.join(" · ")}. Corrígelo en el módulo completo antes de generar el borrador.`}
        />
      ) : null}
    </div>
  );
}
