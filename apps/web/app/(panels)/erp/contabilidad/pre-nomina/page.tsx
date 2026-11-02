"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import MoreTimeOutlinedIcon from "@mui/icons-material/MoreTimeOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHead,
  DataTable,
  DateInput,
  Field,
  ListCard,
  Stat,
  StatRow,
  type Column,
} from "@/components/base";
import Modal from "@/components/ui/Modal";
import { Money } from "@/components/ui/DataTable";
import { MesaPagina } from "@/components/mesa-contable/MesaPagina";
import { todayStamp } from "@/components/finance/download";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import { fetchPrenominaPreview, type PrenominaPreviewRow } from "@/lib/finance-api";
import { DESTINOS, VacioConPrimerPaso } from "../_arranque";
import s from "./pre-nomina.module.css";

const MODULO_COMPLETO = "/erp/finance/prenomina";

function isoHoy() {
  return todayStamp();
}

function isoHaceDias(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return todayStamp(d);
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
  const periodoId = useId();
  const resumenId = useId();

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
  const resumenStrip: ComponentProps<typeof Stat>[] = useMemo(
    () => [
      {
        label: "Empleados",
        value: resumen.empleados,
        hint: "Con alta activa",
        icon: <GroupsOutlinedIcon />,
        iconTone: "neutral",
      },
      {
        label: "Sueldo base semanal",
        value: <Money value={resumen.sueldoBase} />,
        hint: "Suma de los sueldos capturados",
        icon: <PaymentsOutlinedIcon />,
        iconTone: "neutral",
      },
      {
        // Se sumaba y no se pintaba: es el contraste que da sentido a las
        // extras y lo que delata un periodo con checadas incompletas.
        label: "Horas trabajadas",
        value: horasYMinutos(resumen.minutosTrabajados),
        hint: "Suma de las checadas del periodo",
        icon: <ScheduleOutlinedIcon />,
        iconTone: "neutral",
      },
      {
        label: "Horas extra aprobadas",
        value: horasYMinutos(resumen.minutosExtra),
        hint: "Solo las ya autorizadas",
        icon: <MoreTimeOutlinedIcon />,
        iconTone: "neutral",
      },
      {
        label: "Total sugerido",
        value: <Money value={resumen.total} />,
        hint:
          resumen.sinMonto > 0
            ? `Ordinario + extras · ${resumen.sinMonto} de captura manual`
            : "Ordinario + extras del periodo",
        icon: <RequestQuoteOutlinedIcon />,
        iconTone: "neutral",
      },
      {
        label: "Por revisar",
        value: resumen.conIncidencia,
        hint:
          resumen.conIncidencia === 0 ? "Nada pendiente" : "Filas que no deben pagarse así",
        tone: resumen.conIncidencia > 0 ? "warning" : "default",
        icon: <WarningAmberOutlinedIcon />,
        iconTone: "neutral",
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
          <div className={s.persona}>{r.nombre || `Usuario #${r.userId}`}</div>
          <div className={s.personaSub}>
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
                <span className={s.tenue}>0</span>
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
          <span className={s.tenue}>Captura manual</span>
        ),
    },
    {
      key: "revisar",
      label: "Revisar",
      render: (r) => {
        const motivos = incidenciasDe(r);
        // El motivo completo se conserva —es lo que dice por qué no se puede
        // pagar la fila tal cual—, pero baja bajo la palabra para no ensanchar
        // la tabla. El color solo aparece cuando hay un motivo.
        return motivos.length === 0 ? (
          <Badge dot size="sm" tone="neutral">
            Sin pendientes
          </Badge>
        ) : (
          <div className={s.revisar}>
            <Badge dot size="sm" tone="warning">
              Por revisar
            </Badge>
            <div className={s.motivos}>{motivos.join(" · ")}</div>
          </div>
        );
      },
    },
  ];

  const hayDatos = rows.length > 0;

  return (
    <MesaPagina
      titulo="Pre-nómina"
      descripcion="Lo que se va a pagar este periodo, según checadas y extras ya aprobados."
      secundarias={<ButtonLink href={MODULO_COMPLETO}>Abrir módulo completo</ButtonLink>}
      primaria={
        <Button
          variant="primary"
          type="submit"
          form={periodoId}
          loading={cargando}
          disabled={!token}
          title={sinSesion ? "Necesitas una sesión activa para calcular" : undefined}
        >
          {cargando ? "Calculando…" : "Calcular"}
        </Button>
      }
    >
      {/* El periodo es una barra, no un formulario a todo el ancho: dos fechas
          compactas. «Calcular» vive en la cabeza y envía este mismo formulario. */}
      <Card as="div">
        <CardHead title="Periodo" subtitle="Elige el rango y vuelve a calcular." />
        <form
          id={periodoId}
          className={s.periodo}
          onSubmit={(e) => {
            e.preventDefault();
            void cargar();
          }}
        >
          <Field
            label="Desde"
            hint="Primer día que entra al cálculo"
            error={errorRango?.campo === "desde" ? errorRango.mensaje : null}
          >
            <DateInput
              value={desde}
              max={hasta}
              onChange={(e) => {
                setDesde(e.target.value);
                setErrorRango(null);
              }}
            />
          </Field>
          <Field
            label="Hasta"
            hint="Último día, inclusive"
            error={errorRango?.campo === "hasta" ? errorRango.mensaje : null}
          >
            <DateInput
              value={hasta}
              min={desde}
              onChange={(e) => {
                setHasta(e.target.value);
                setErrorRango(null);
              }}
            />
          </Field>
        </form>
        {/* Cambiar las fechas no recalcula solo. Decirlo evita leer cifras
            de un periodo creyendo que son de otro. */}
        {periodoPendiente && !cargando ? (
          <p role="status" className={s.pendiente}>
            Cambiaste el periodo. Las cifras de abajo siguen siendo del {periodoCargado?.from} al{" "}
            {periodoCargado?.to}: pulsa «Calcular» para actualizarlas.
          </p>
        ) : null}
      </Card>

      {sinSesion ? (
        <Alert
          className={s.aviso}
          tone="warning"
          role="alert"
          action={
            <ButtonLink size="sm" href="/login">
              Ir a entrar
            </ButtonLink>
          }
        >
          No hay sesión activa, así que no se puede calcular la pre-nómina. Vuelve a entrar con tu
          cuenta para consultarla.
        </Alert>
      ) : null}

      {error ? (
        <Alert
          className={s.aviso}
          tone="danger"
          role="alert"
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" onClick={() => void cargar()} disabled={cargando}>
              {cargando ? "Reintentando…" : "Reintentar"}
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      {cargando && !cargado ? (
        <Card aria-label="Resumen del periodo">
          <CardHead title="Resumen del periodo" />
          <div className={s.cuerpo} aria-busy="true">
            <p className={s.cargando}>Calculando el periodo…</p>
          </div>
        </Card>
      ) : null}

      {cargado && !error && !sinSesion && !hayDatos ? (
        /* La API contesta una lista por persona: vacía no distingue «nadie
           dado de alta» de «nadie con checadas en estas fechas». Se dice como
           es, sin elegir una de las dos por la persona que lee. */
        <Card as="div">
          <VacioConPrimerPaso
            title="Sin gente activa en este periodo"
            description={`Entre el ${desde} y el ${hasta} no hay personal con alta activa ni checadas, así que no hay nada que pagar. El alta del personal y sus sueldos los lleva Recursos Humanos; las checadas entran por asistencia. Prueba otro periodo, o revisa las altas del mes.`}
            destino={DESTINOS.nomina}
            extra={
              <Button size="sm" onClick={() => void cargar()} disabled={cargando}>
                {cargando ? "Calculando…" : "Volver a calcular"}
              </Button>
            }
          />
        </Card>
      ) : null}

      {hayDatos ? (
        <>
          <section className={s.bloque} aria-labelledby={resumenId}>
            <h2 id={resumenId} className={s.bloqueTitulo}>
              Resumen del periodo
            </h2>
            <p className={s.bloqueSub}>
              {periodoCargado
                ? `${periodoCargado.from} → ${periodoCargado.to} · ${resumen.empleados} persona(s)`
                : `${desde} → ${hasta}`}
            </p>
            <StatRow variant="strip" ariaLabel="Resumen de la pre-nómina">
              {resumenStrip.map((m) => (
                <Stat key={String(m.label)} {...m} />
              ))}
            </StatRow>
            <p className={s.nota}>
              La pre-nómina no lleva bonos ni descuentos: se capturan al generar el pago en el
              módulo completo. Aquí ves el sueldo base, las horas extra ya aprobadas y el total
              sugerido que resulta de ambos. No es un CFDI de nómina.
            </p>
          </section>

          {resumen.conIncidencia > 0 ? (
            <ListCard
              listLabel="Incidencias que requieren revisión"
              toolbar={
                <CardHead
                  title="Incidencias que requieren revisión"
                  subtitle={`${filasConIncidencia.length} de ${rows.length} personas necesitan una corrección antes de pagar.`}
                />
              }
            >
              <DataTable
                flush
                columns={columnas}
                rows={filasConIncidencia}
                rowKey={(r) => r.userId}
                density="compact"
                ariaLabel="Incidencias de pre-nómina"
                emptyTitle="Sin incidencias"
                onRowClick={(r) => setDetalle(r)}
              />
            </ListCard>
          ) : null}

          <ListCard
            listLabel="Detalle por persona"
            toolbar={
              <CardHead
                title="Detalle por persona"
                subtitle="Lectura. Abre un renglón para ver de dónde sale su total. Para seleccionar gente, aprobar extras y generar los borradores de pago, abre el módulo completo."
                actions={
                  <ButtonLink variant="tertiary" size="sm" href={MODULO_COMPLETO}>
                    Operar la pre-nómina
                  </ButtonLink>
                }
              />
            }
          >
            <DataTable
              flush
              columns={columnas}
              rows={rows}
              rowKey={(r) => r.userId}
              density="compact"
              ariaLabel="Detalle de pre-nómina"
              emptyTitle="Sin personas en el periodo"
              onRowClick={(r) => setDetalle(r)}
            />
          </ListCard>
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
    </MesaPagina>
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
    <div className={s.detalle}>
      <dl className={s.ficha}>
        {filas.map((f) => (
          <Fragment key={f.label}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </Fragment>
        ))}
      </dl>

      <div>
        <h3 className={s.subtitulo}>Cómo se calculó el total</h3>
        {d ? (
          <>
            <dl className={s.calculo}>
              <dt>Sueldo semanal</dt>
              <dd>{d.sueldoSemanal != null ? <Money value={d.sueldoSemanal} bold={false} /> : "—"}</dd>
              <dt>Valor del minuto ordinario</dt>
              <dd>{d.minutoOrdinario != null ? `$${d.minutoOrdinario.toFixed(4)}` : "—"}</dd>
              <dt>Minutos ordinarios</dt>
              <dd>{d.minutosOrdinarios.toLocaleString("es-MX")}</dd>
              <dt>Minutos extra aprobados</dt>
              <dd>{d.minutosExtraAprobados.toLocaleString("es-MX")}</dd>
              <dt className={s.calculoTotal}>Total sugerido</dt>
              <dd>
                {d.suggestedAmount != null ? <Money value={d.suggestedAmount} /> : "captura manual"}
              </dd>
            </dl>
            <p className={s.formula}>Fórmula que aplicó el servidor: {d.formula}</p>
          </>
        ) : (
          <p className={s.sinDesglose}>
            — El servidor no mandó el desglose de esta persona, así que no se puede mostrar de qué
            se compone su total.
          </p>
        )}
      </div>

      {motivos.length > 0 ? (
        <Alert className={s.aviso} tone="warning" role="alert">
          {`No se debe pagar así: ${motivos.join(" · ")}. Corrígelo en el módulo completo antes de generar el borrador.`}
        </Alert>
      ) : null}
    </div>
  );
}
