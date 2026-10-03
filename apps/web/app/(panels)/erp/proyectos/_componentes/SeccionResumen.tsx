"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TrafficOutlinedIcon from "@mui/icons-material/TrafficOutlined";
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import {
  Alert,
  Badge,
  Button,
  DateInput,
  Field,
  FieldGrid,
  Input,
  RecordSection,
  Select,
  Stat,
  StatRow,
  Textarea,
  type Semaforo,
} from "@/components/base";
import { listarCotizaciones, type CotizacionRow } from "@/lib/cotizaciones-api";
import {
  SALUD_TONO,
  formatoFecha,
  formatoMoneda,
  type ActualizarProyecto,
  type ProyectoDetalle,
} from "@/lib/proyectos-api";
import { aInputFecha, diaDe, diasEntre } from "@/lib/proyecto-plan";
import { leerImporte } from "@/lib/proyecto-alta";
import { SERVICE_PROJECT_TYPE_OPTIONS, getServiceProjectTypeLabel } from "@/lib/service-project-types";
import { guardarCabecera } from "./acciones";
import { PersonaSelect } from "./personas";
import { toneDe } from "./tono";
import type { SeccionProps } from "./tipos";
import styles from "./secciones.module.css";

type FormCabecera = {
  title: string;
  projectType: string;
  siteCount: string;
  responsableId: string;
  startDate: string;
  endDate: string;
  actualStartDate: string;
  actualEndDate: string;
  budget: string;
  currency: string;
  cotizacionId: string;
  description: string;
  objective: string;
  scopeSummary: string;
};

function formDe(p: ProyectoDetalle): FormCabecera {
  return {
    title: p.title,
    projectType: p.projectType ?? "OTRO",
    siteCount: p.siteCount == null ? "" : String(p.siteCount),
    responsableId: p.responsableId ? String(p.responsableId) : "",
    startDate: aInputFecha(p.startDate),
    endDate: aInputFecha(p.endDate),
    actualStartDate: aInputFecha(p.actualStartDate),
    actualEndDate: aInputFecha(p.actualEndDate),
    budget: p.budgetAmount == null ? "" : String(p.budgetAmount),
    currency: p.currency || "MXN",
    cotizacionId: p.cotizacionId ? String(p.cotizacionId) : "",
    description: p.description ?? "",
    objective: p.objective ?? "",
    scopeSummary: p.scopeSummary ?? "",
  };
}

/** Solo lo que cambió: mandar el responsable sin cambio dispararía otra vez la validación de alcance. */
function cambiosDe(p: ProyectoDetalle, f: FormCabecera): { cambios: ActualizarProyecto; errores: string[] } {
  const antes = formDe(p);
  const errores: string[] = [];
  const cambios: ActualizarProyecto = {};
  const texto = (v: string) => (v.trim() ? v.trim() : null);

  if (f.title.trim() !== antes.title.trim()) {
    if (f.title.trim().length < 3) errores.push("El nombre necesita al menos 3 letras.");
    else cambios.title = f.title.trim();
  }
  if (f.projectType !== antes.projectType) cambios.projectType = f.projectType;
  if (f.siteCount.trim() !== antes.siteCount) {
    const n = Number(f.siteCount);
    if (f.siteCount.trim() && (!Number.isInteger(n) || n < 0)) errores.push("Los sitios deben ser un número entero.");
    else cambios.siteCount = f.siteCount.trim() ? n : null;
  }
  if (f.responsableId !== antes.responsableId) cambios.responsableId = f.responsableId ? Number(f.responsableId) : null;
  if (f.startDate !== antes.startDate) cambios.startDate = f.startDate || null;
  if (f.endDate !== antes.endDate) cambios.endDate = f.endDate || null;
  if (f.actualStartDate !== antes.actualStartDate) cambios.actualStartDate = f.actualStartDate || null;
  if (f.actualEndDate !== antes.actualEndDate) cambios.actualEndDate = f.actualEndDate || null;
  const inicio = diaDe(f.startDate);
  const fin = diaDe(f.endDate);
  if (inicio !== null && fin !== null && fin < inicio) errores.push("El fin planeado no puede ser antes del inicio.");
  const inicioReal = diaDe(f.actualStartDate);
  const finReal = diaDe(f.actualEndDate);
  if (inicioReal !== null && finReal !== null && finReal < inicioReal) {
    errores.push("La entrega real no puede ser antes del inicio real.");
  }
  if (f.budget.trim() !== antes.budget) {
    const importe = leerImporte(f.budget);
    if (importe !== null && (!Number.isFinite(importe) || importe < 0)) errores.push("El presupuesto debe ser una cantidad.");
    else cambios.budgetAmount = importe;
  }
  if (f.currency !== antes.currency) cambios.currency = f.currency;
  if (f.cotizacionId !== antes.cotizacionId) cambios.cotizacionId = f.cotizacionId ? Number(f.cotizacionId) : null;
  if (f.description !== antes.description) cambios.description = texto(f.description);
  if (f.objective !== antes.objective) cambios.objective = texto(f.objective);
  if (f.scopeSummary !== antes.scopeSummary) cambios.scopeSummary = texto(f.scopeSummary);
  return { cambios, errores };
}

/** El tono del semáforo del proyecto en el foquito de la cifra. */
function semaforoDe(tono: ReturnType<typeof toneDe>): Semaforo {
  if (tono === "success") return "verde";
  if (tono === "warning") return "ambar";
  if (tono === "danger") return "rojo";
  return "gris";
}

function diferencia(plan?: string | null, real?: string | null, verbo = "llegó"): string {
  const d = diasEntre(plan, real);
  if (d === null) return "";
  if (d === 0) return "En la fecha planeada";
  return d > 0 ? `${verbo} ${d} día${d === 1 ? "" : "s"} tarde` : `${verbo} ${-d} día${d === -1 ? "" : "s"} antes`;
}

export default function SeccionResumen({ proyecto: p, token, hoy, ocupado, personas, mutar }: SeccionProps) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState<FormCabecera>(() => formDe(p));
  const [errores, setErrores] = useState<string[]>([]);
  const [cotizaciones, setCotizaciones] = useState<CotizacionRow[] | null>(null);

  useEffect(() => {
    if (!editando) setF(formDe(p));
  }, [p, editando]);

  useEffect(() => {
    if (!editando || cotizaciones !== null) return;
    let vivo = true;
    listarCotizaciones(token)
      .then((rows) => vivo && setCotizaciones(rows))
      .catch(() => vivo && setCotizaciones([]));
    return () => {
      vivo = false;
    };
  }, [editando, cotizaciones, token]);

  const r = p.resumen;
  const avance = r.avance;
  const etapasVivas = p.milestones.filter((m) => m.status !== "CANCELADO");
  const etapasCumplidas = etapasVivas.filter((m) => m.status === "CUMPLIDO").length;
  const textoAvance =
    avance.origen === "actividades"
      ? `${avance.cerradas} de ${avance.total} actividades cerradas`
      : avance.origen === "hitos"
        ? `${etapasCumplidas} de ${etapasVivas.length} etapas cumplidas (aún no hay actividades ligadas)`
        : "Sin actividades ni etapas todavía: el avance aparecerá cuando las haya.";

  const cambiar = <K extends keyof FormCabecera>(campo: K, valor: FormCabecera[K]) =>
    setF((prev) => ({ ...prev, [campo]: valor }));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const { cambios, errores: encontrados } = cambiosDe(p, f);
    setErrores(encontrados);
    if (encontrados.length) return;
    if (!Object.keys(cambios).length) {
      setEditando(false);
      return;
    }
    const ok = await mutar(() => guardarCabecera(token, p, cambios), "Datos del proyecto guardados.");
    if (ok) setEditando(false);
  }

  const inicioTexto = p.actualStartDate
    ? diferencia(p.startDate, p.actualStartDate, "Arrancó")
    : p.status === "PLANNED" && (diasEntre(p.startDate, hoy) ?? 0) > 0
      ? `Debió arrancar hace ${diasEntre(p.startDate, hoy)} días`
      : "";
  const finTexto = p.actualEndDate
    ? diferencia(p.endDate, p.actualEndDate, "Se entregó")
    : r.diasDeRetraso > 0
      ? `${r.diasDeRetraso} día${r.diasDeRetraso === 1 ? "" : "s"} de retraso`
      : r.diasRestantes !== null
        ? `Faltan ${r.diasRestantes} día${r.diasRestantes === 1 ? "" : "s"}`
        : "";

  const tonoSalud = toneDe(SALUD_TONO[r.salud]);

  return (
    <div className={styles.pila}>
      <StatRow cols={4} variant="strip" ariaLabel="Cómo va el proyecto">
        <Stat
          label="Avance"
          value={avance.porcentaje === null ? "—" : avance.porcentaje}
          suffix={avance.porcentaje === null ? undefined : "%"}
          hint={textoAvance}
          icon={<TrendingUpRoundedIcon />}
          meter={avance.porcentaje === null ? undefined : [{ value: avance.porcentaje, tone: avance.porcentaje >= 100 ? "success" : "brand" }]}
          meterMax={100}
        />
        <Stat
          label="Semáforo"
          value={r.etiqueta}
          hint={r.hitosVencidos > 0 ? `${r.hitosVencidos} etapa${r.hitosVencidos === 1 ? "" : "s"} con la fecha vencida` : r.motivo}
          icon={<TrafficOutlinedIcon />}
          iconTone={tonoSalud}
          semaforo={semaforoDe(tonoSalud)}
          title={r.motivo}
        />
        <Stat
          label="Requerimientos"
          value={r.requerimientos.total ? `${r.requerimientos.cumplidos} / ${r.requerimientos.total}` : "—"}
          hint={
            r.requerimientos.total
              ? r.requerimientos.pendientes
                ? `Faltan ${r.requerimientos.pendientes} para poder entregar sin pendientes`
                : "Todo listo"
              : "Sin requerimientos capturados"
          }
          icon={<ChecklistRoundedIcon />}
          tone={r.requerimientos.pendientes ? "warning" : "default"}
        />
        <Stat
          label="Presupuesto"
          value={p.budgetAmount == null ? "Sin capturar" : formatoMoneda(p.budgetAmount, p.currency ?? "MXN")}
          hint={
            p.cotizacion ? (
              <>
                Cotización{" "}
                <Link className={styles.enlace} href={`/erp/cotizaciones/${p.cotizacion.id}`}>
                  {p.cotizacion.folioEnviado || p.cotizacion.quoteNumber}
                </Link>
                {p.cotizacion.total != null ? ` · ${formatoMoneda(p.cotizacion.total, p.cotizacion.currency ?? "MXN")}` : ""}
              </>
            ) : (
              "Sin cotización ligada"
            )
          }
          icon={<PaymentsOutlinedIcon />}
        />
      </StatRow>

      <RecordSection title="Fechas: plan contra realidad">
        <div className={styles.tablaMarco}>
          <table className={styles.tablaFechas}>
            <thead>
              <tr>
                <th scope="col">
                  <span className="ui-sr-only">Fecha</span>
                </th>
                <th scope="col">Planeado</th>
                <th scope="col">Real</th>
                <th scope="col">Cómo va</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Inicio</th>
                <td>{formatoFecha(p.startDate)}</td>
                <td>{p.actualStartDate ? formatoFecha(p.actualStartDate) : "Aún no arranca"}</td>
                <td>{inicioTexto || "—"}</td>
              </tr>
              <tr>
                <th scope="row">Entrega</th>
                <td>{p.endDate ? formatoFecha(p.endDate) : "Sin fecha"}</td>
                <td>{p.actualEndDate ? formatoFecha(p.actualEndDate) : "Sin entregar"}</td>
                <td className={r.diasDeRetraso > 0 && !p.actualEndDate ? styles.vencido : undefined}>{finTexto || "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </RecordSection>

      {p.status === "CANCELLED" && p.cancelReason ? (
        <section aria-label="Motivo de cancelación">
          <Alert tone="neutral" title="Cancelado:">
            {" "}
            {p.cancelReason}
          </Alert>
        </section>
      ) : null}

      {!editando ? (
        <RecordSection
          title="Datos del proyecto"
          end={
            <Button size="sm" onClick={() => setEditando(true)} disabled={ocupado} iconStart={<EditOutlinedIcon />}>
              Editar datos
            </Button>
          }
        >
          <div className={styles.pila}>
            <dl className={styles.datos}>
              <div className={styles.dato}>
                <dt>Cliente</dt>
                <dd>
                  {p.client?.name ?? "—"}
                  {p.client?.contactEmail || p.client?.contactPhone ? (
                    <span className={styles.datoSub}>{[p.client.contactEmail, p.client.contactPhone].filter(Boolean).join(" · ")}</span>
                  ) : null}
                </dd>
              </div>
              <div className={styles.dato}>
                <dt>Tipo y sitios</dt>
                <dd>
                  {getServiceProjectTypeLabel(p.projectType)}
                  <span className={styles.datoSub}>
                    {p.siteCount != null ? `${p.siteCount} sitio${p.siteCount === 1 ? "" : "s"}` : "Sitios sin capturar"}
                  </span>
                </dd>
              </div>
              <div className={styles.dato}>
                <dt>Responsable</dt>
                <dd>
                  {p.responsable?.nombre ?? "Sin asignar"}
                  {p.vendor ? <span className={styles.datoSub}>Lo vendió: {p.vendor.nombre}</span> : null}
                </dd>
              </div>
              {p.salesProject ? (
                <div className={styles.dato}>
                  <dt>Proyecto comercial</dt>
                  <dd>{p.salesProject.name}</dd>
                </div>
              ) : null}
            </dl>
            {p.objective ? (
              <div className={styles.bloque}>
                <span className={styles.bloqueEtiqueta}>Objetivo</span>
                <p className={styles.texto}>{p.objective}</p>
              </div>
            ) : null}
            {p.description ? (
              <div className={styles.bloque}>
                <span className={styles.bloqueEtiqueta}>Descripción</span>
                <p className={styles.texto}>{p.description}</p>
              </div>
            ) : null}
            {p.scopeSummary ? (
              <div className={styles.bloque}>
                <span className={styles.bloqueEtiqueta}>El alcance en una frase</span>
                <p className={styles.texto}>{p.scopeSummary}</p>
              </div>
            ) : null}
            {!p.objective && !p.description ? (
              <p className={styles.ayuda}>
                <Badge tone="warning" size="sm">
                  Pendiente
                </Badge>{" "}
                Falta el objetivo y la descripción: con «Editar datos» los agregas.
              </p>
            ) : null}
          </div>
        </RecordSection>
      ) : (
        <form className={styles.alta} onSubmit={guardar} aria-labelledby="res-editar" noValidate>
          <h3 id="res-editar" className={styles.altaTitulo}>
            Editar datos del proyecto
          </h3>
          <FieldGrid columns={3}>
            <Field label="Nombre del proyecto" fullWidth>
              <Input id="ed-titulo" value={f.title} maxLength={220} onChange={(e) => cambiar("title", e.target.value)} />
            </Field>
            <Field label="Tipo de proyecto">
              <Select id="ed-tipo" value={f.projectType} onChange={(e) => cambiar("projectType", e.target.value)}>
                {SERVICE_PROJECT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sitios">
              <Input id="ed-sitios" type="number" min={0} step={1} value={f.siteCount} onChange={(e) => cambiar("siteCount", e.target.value)} />
            </Field>
            <Field label="Responsable">
              <PersonaSelect
                id="ed-resp"
                value={f.responsableId}
                onChange={(v) => cambiar("responsableId", v)}
                personas={personas}
                vacio={f.responsableId ? null : "Sin asignar"}
              />
            </Field>
          </FieldGrid>
          <FieldGrid>
            <Field label="Inicio planeado">
              <DateInput id="ed-inicio" value={f.startDate} onChange={(e) => cambiar("startDate", e.target.value)} />
            </Field>
            <Field label="Fin planeado">
              <DateInput id="ed-fin" value={f.endDate} min={f.startDate || undefined} onChange={(e) => cambiar("endDate", e.target.value)} />
            </Field>
            <Field label="Inicio real">
              <DateInput id="ed-inicio-real" value={f.actualStartDate} onChange={(e) => cambiar("actualStartDate", e.target.value)} />
            </Field>
            <Field label="Entrega real" hint="Con fecha de entrega real, el semáforo lo da por terminado.">
              <DateInput id="ed-fin-real" value={f.actualEndDate} onChange={(e) => cambiar("actualEndDate", e.target.value)} />
            </Field>
          </FieldGrid>
          <FieldGrid columns={3}>
            <Field label="Presupuesto">
              <Input id="ed-presupuesto" inputMode="decimal" value={f.budget} onChange={(e) => cambiar("budget", e.target.value)} />
            </Field>
            <Field label="Moneda">
              <Select id="ed-moneda" value={f.currency} onChange={(e) => cambiar("currency", e.target.value)}>
                <option value="MXN">Pesos mexicanos (MXN)</option>
                <option value="USD">Dólares (USD)</option>
              </Select>
            </Field>
            <Field label="Cotización" hint={cotizaciones === null ? "Cargando cotizaciones…" : "Las de tu empresa"}>
              <Select id="ed-cotizacion" value={f.cotizacionId} onChange={(e) => cambiar("cotizacionId", e.target.value)}>
                <option value="">Sin cotización</option>
                {p.cotizacion && !(cotizaciones ?? []).some((c) => c.id === p.cotizacion?.id) ? (
                  <option value={String(p.cotizacion.id)}>{p.cotizacion.quoteNumber}</option>
                ) : null}
                {(cotizaciones ?? []).map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.folio} · {c.clienteNombre || c.clienteEmpresa || "Sin cliente"}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldGrid>
          <FieldGrid columns={1}>
            <Field label="Objetivo">
              <Textarea id="ed-objetivo" rows={3} value={f.objective} onChange={(e) => cambiar("objective", e.target.value)} />
            </Field>
            <Field label="Descripción">
              <Textarea id="ed-descripcion" rows={3} value={f.description} onChange={(e) => cambiar("description", e.target.value)} />
            </Field>
            <Field label="El alcance en una frase">
              <Input id="ed-alcance" value={f.scopeSummary} onChange={(e) => cambiar("scopeSummary", e.target.value)} />
            </Field>
          </FieldGrid>
          {errores.length ? (
            <Alert tone="danger" role="alert" srLabel="Error">
              <ul className={styles.texto}>
                {errores.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          <div className={styles.botonera}>
            <Button
              variant="tertiary"
              onClick={() => {
                setErrores([]);
                setEditando(false);
              }}
              disabled={ocupado}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="tonal" loading={ocupado}>
              Guardar cambios
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
