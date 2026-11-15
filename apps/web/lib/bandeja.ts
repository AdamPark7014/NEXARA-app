/**
 * Bandeja única de Aprobaciones (Adam, 15-11-2026: «hay módulos sin info, ¿para qué?»). Junta lo que
 * espera la firma de quien la abre y que vive en otros módulos: evidencias por revisar, viáticos por
 * autorizar, horas extra y descuentos de la semana, solicitudes de equipo y firmas de flujo.
 *
 * Cada fuente se pide por separado y lo que no le toca a esa persona (403) o falla se calla: la bandeja
 * enseña lo que sí pudo leer y nunca un error de permisos.
 */
import { erpFetch } from "@/lib/erp-api";
import { financeFetch } from "@/lib/finance-api";
import { rutaControlSemanal } from "@/lib/control-nomina-api";
import { lunesDe, sumarDias } from "@/lib/control-nomina";

export type ElementoBandeja = { titulo: string; detalle?: string };

export type GrupoBandeja = {
  clave: "evidencias" | "viaticos" | "extras" | "descuentos" | "solicitudes" | "firmas";
  titulo: string;
  cantidad: number;
  /** Una frase con lo que importa: importe, horas, desde cuándo. */
  resumen: string;
  accion: string;
  href: string;
  ejemplos: ElementoBandeja[];
};

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const callado = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
const sinEnvoltura = (r: unknown) => (r && typeof r === "object" && "data" in (r as object) ? (r as { data: unknown }).data : r);

type Revision = { titulo?: string; anNumber?: string; paraTi?: boolean; persona?: { nombre?: string } };
type Solicitud = { title?: string; status?: string; fromUser?: { nombre?: string } };
type Viatico = { estatus?: string; estado?: string; status?: string; montoSolicitado?: number; monto?: number; destino?: string; motivo?: string; user?: { nombre?: string } };

/** Arma los grupos con lo que ya se trajo (sin red): lo que la pantalla y las pruebas usan. */
export function armarBandeja(d: {
  revisiones?: { pendientes?: Revision[] } | null;
  solicitudes?: { received?: Solicitud[] } | null;
  viaticos?: Viatico[] | null;
  semana?: { lunes: string; totales?: Record<string, unknown> } | null;
  firmas?: Array<{ titulo?: string; title?: string; definitionName?: string }> | null;
}): GrupoBandeja[] {
  const grupos: GrupoBandeja[] = [];

  const evidencias = (d.revisiones?.pendientes ?? []).filter((p) => p.paraTi !== false);
  if (evidencias.length) {
    grupos.push({
      clave: "evidencias",
      titulo: "Evidencias por revisar",
      cantidad: evidencias.length,
      resumen: `${evidencias.length === 1 ? "Una actividad espera" : `${evidencias.length} actividades esperan`} tu visto bueno para cerrarse.`,
      accion: "Revisar evidencias",
      href: "/erp/pizarra?vista=revision",
      ejemplos: evidencias.slice(0, 3).map((p) => ({ titulo: p.titulo || p.anNumber || "Actividad", detalle: p.persona?.nombre })),
    });
  }

  const viaticos = (d.viaticos ?? []).filter((v) => (v.estatus ?? v.estado ?? v.status) === "Pendiente");
  if (viaticos.length) {
    const total = viaticos.reduce((a, v) => a + n(v.montoSolicitado ?? v.monto), 0);
    grupos.push({
      clave: "viaticos",
      titulo: "Viáticos por autorizar",
      cantidad: viaticos.length,
      resumen: `${MXN.format(total)} pedidos en ${viaticos.length === 1 ? "una solicitud" : `${viaticos.length} solicitudes`}.`,
      accion: "Autorizar viáticos",
      href: "/erp/finance/viatics",
      ejemplos: viaticos.slice(0, 3).map((v) => ({ titulo: v.user?.nombre || v.destino || "Solicitud", detalle: MXN.format(n(v.montoSolicitado ?? v.monto)) })),
    });
  }

  const t = d.semana?.totales ?? {};
  const extrasMin = n(t.extrasMinutosPendientes);
  if (extrasMin > 0) {
    grupos.push({
      clave: "extras",
      titulo: "Horas extra por decidir",
      cantidad: Math.round(extrasMin / 60),
      resumen: `${(extrasMin / 60).toFixed(1)} h de la semana pasada. No se pagan hasta que alguien las apruebe.`,
      accion: "Decidir horas extra",
      href: "/erp/finance/employee-payments?tab=control",
      ejemplos: [],
    });
  }
  const descuentos = n(t.descuentosSugeridosTotal);
  if (descuentos > 0) {
    const faltas = n(t.faltasInjustificadas);
    grupos.push({
      clave: "descuentos",
      titulo: "Descuentos por aceptar",
      cantidad: faltas || 1,
      resumen: `${MXN.format(descuentos)} por ${faltas === 1 ? "una falta" : `${faltas} faltas`} sin justificar de la semana pasada.`,
      accion: "Revisar descuentos",
      href: "/erp/finance/employee-payments?tab=control",
      ejemplos: [],
    });
  }

  const solicitudes = (d.solicitudes?.received ?? []).filter((s) => s.status === "PENDING");
  if (solicitudes.length) {
    grupos.push({
      clave: "solicitudes",
      titulo: "Solicitudes de tu equipo",
      cantidad: solicitudes.length,
      resumen: `${solicitudes.length === 1 ? "Alguien te pide" : `${solicitudes.length} personas te piden`} una actividad.`,
      accion: "Responder solicitudes",
      href: "/erp/pizarra?vista=solicitudes",
      ejemplos: solicitudes.slice(0, 3).map((s) => ({ titulo: s.title || "Solicitud", detalle: s.fromUser?.nombre })),
    });
  }

  const firmas = d.firmas ?? [];
  if (firmas.length) {
    grupos.push({
      clave: "firmas",
      titulo: "Firmas de flujo",
      cantidad: firmas.length,
      resumen: "Solicitudes que piden tu firma en su flujo de aprobación. Están abajo.",
      accion: "Ver firmas",
      href: "#firmas",
      ejemplos: firmas.slice(0, 3).map((f) => ({ titulo: f.titulo || f.title || f.definitionName || "Solicitud" })),
    });
  }

  return grupos;
}

/** Lo ligero, para el número del menú: sin el cálculo de nómina, que es pesado. */
export async function contarBandeja(token: string): Promise<number> {
  const [revisiones, solicitudes, viaticos, firmas] = await Promise.all([
    callado(erpFetch<{ pendientes?: Revision[] }>("me/revisiones", token)),
    callado(erpFetch<{ received?: Solicitud[] }>("me/activity-requests", token)),
    callado(financeFetch("viatics", token).then((r) => sinEnvoltura(r) as Viatico[])),
    callado(erpFetch<unknown[]>("workflow/my-pending", token)),
  ]);
  return armarBandeja({
    revisiones,
    solicitudes,
    viaticos: Array.isArray(viaticos) ? viaticos : null,
    firmas: Array.isArray(firmas) ? (firmas as never[]) : null,
  })
    .filter((g) => g.clave !== "extras" && g.clave !== "descuentos")
    .reduce((a, g) => a + g.cantidad, 0);
}

/** Todo lo de la bandeja, con la semana de nómina que se paga (la anterior a la de hoy). */
export async function cargarBandeja(token: string): Promise<GrupoBandeja[]> {
  const lunes = sumarDias(lunesDe(new Date()), -7);
  const [revisiones, solicitudes, viaticos, semana, firmas] = await Promise.all([
    callado(erpFetch<{ pendientes?: Revision[] }>("me/revisiones", token)),
    callado(erpFetch<{ received?: Solicitud[] }>("me/activity-requests", token)),
    callado(financeFetch("viatics", token).then((r) => sinEnvoltura(r) as Viatico[])),
    callado(financeFetch(rutaControlSemanal(lunes), token).then((r) => sinEnvoltura(r) as { totales?: Record<string, unknown> })),
    callado(erpFetch<unknown[]>("workflow/my-pending", token)),
  ]);
  return armarBandeja({
    revisiones,
    solicitudes,
    viaticos: Array.isArray(viaticos) ? viaticos : null,
    semana: semana ? { lunes, totales: semana.totales } : null,
    firmas: Array.isArray(firmas) ? (firmas as never[]) : null,
  });
}
