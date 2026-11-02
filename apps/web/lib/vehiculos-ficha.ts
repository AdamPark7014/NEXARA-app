/**
 * Ficha de vehículos: contrato con `/api/vehicles/ficha/**` y las reglas puras de sus pantallas.
 * Mockup aprobado el 01-11-2026: https://claude.ai/artifact/2DNGd9xCSM7fG9zAfBPijs.
 * Ver `docs/COSTOS-PRECIOS-UNITARIOS.md`, «Fase 3 ampliada».
 */
import { apiRequest, parseResponseJson } from "@/lib/api-base";
import { erpFetch } from "@/lib/erp-api";

const API = "vehicles/ficha";

const json = (cuerpo: unknown, method = "POST"): RequestInit => ({ method, body: JSON.stringify(cuerpo) });

/* ── Tipos ────────────────────────────────────────────────────────────────── */

export type Fuente = { tipo: "MANUAL" | "CONUEE"; pagina: number | null } | { tipo: "CAPTURA" } | { tipo: "TICKETS" };

export type TipoDestino = "PROYECTO" | "COTIZACION" | "OFICINA" | "SIN_LIGAR";
export type EstadoServicio = "VENCIDO" | "PRONTO" | "OK";

export type ProximoServicio = {
  km: number | null;
  faltanKm: number | null;
  fecha: string | null;
  conceptos: string[];
  estado: EstadoServicio;
};

export type RenglonReparto = { km: number; importe: number | null };

export type AvisoFlotilla = { tono: "danger" | "warning" | "info"; titulo: string; texto: string; vehicleId: number };

export type FlotillaMes = {
  mes: string;
  vehiculos: Array<{
    id: number;
    kmDelMes: number;
    porKm: number | null;
    rendimientoReal: number | null;
    rendimientoOficial: number | null;
    proximoServicio: ProximoServicio | null;
    tieneFicha: boolean;
  }>;
  reparto: {
    proyectos: RenglonReparto;
    cotizaciones: RenglonReparto;
    oficina: RenglonReparto;
    sinLigar: RenglonReparto;
    parado: number | null;
  };
  resumen: { km: number; costoMes: number | null; porKm: number | null; aIndirectos: number | null };
  avisos: AvisoFlotilla[];
  acceso: { veCostos: boolean };
};

export type Especificacion = {
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  version: string | null;
  numeroSerie: string | null;
  motor: string | null;
  potenciaHp: number | null;
  transmision: string | null;
  combustible: string | null;
  tanqueLitros: number | null;
  aceiteTipo: string | null;
  aceiteLitros: number | null;
  llantaMedida: string | null;
  llantaPsi: number | null;
  cargaKg: number | null;
  rendimientoOficial: number | null;
  fechaCompra: string | null;
  odometroCompra: number | null;
  odometroAlta: number | null;
  fuentes: Record<string, Fuente>;
};

export type ServicioProgramado = {
  id: number;
  concepto: string;
  cadaKm: number | null;
  cadaMeses: number | null;
  costoEstimado: number | null;
  ultimoKm: number | null;
  ultimaFecha: string | null;
  proximoKm: number | null;
  proximaFecha: string | null;
  faltanKm: number | null;
  faltanDias: number | null;
  estado: EstadoServicio;
};

export type Rendimiento = {
  oficial: number | null;
  real: number | null;
  usado: number | null;
  fuente: "REAL" | "OFICIAL" | "SIN_DATO";
  tanques: number;
  faltan: number;
};

export type FichaCosto = {
  valor: number;
  valorLlantas: number;
  rescatePct: number;
  vidaKm: number;
  kmAnio: number;
  tasaInteres: number;
  primaSeguro: number;
  ko: number;
  costoAceite: number;
  aceiteCadaKm: number;
  vidaLlantasKm: number;
  otrosAnuales: number;
};

export type FichaVehiculo = {
  vehiculo: { id: number; nombre: string; placas: string | null; estatus: string; activo: boolean };
  tieneFicha: boolean;
  especificacion: Especificacion | null;
  odometro: { km: number; fecha: string } | null;
  rendimiento: Rendimiento;
  autonomiaKm: number | null;
  tanques: Array<{ fecha: string; km: number; litros: number; kmPorLitro: number }>;
  cargas: Array<{
    id: number;
    fecha: string;
    odometro: number;
    litros: number;
    importe: number;
    tanqueLleno: boolean;
    ticketUrl: string | null;
    tableroUrl: string | null;
  }>;
  programa: ServicioProgramado[];
  proximoServicio: ProximoServicio | null;
  servicios: Array<{
    id: number;
    fecha: string;
    odometro: number | null;
    concepto: string;
    costo: number | null;
    proveedor: string | null;
    comprobanteUrl: string | null;
    notas: string | null;
  }>;
  documentos: Array<{
    id: number;
    tipo: string;
    nombre: string;
    url: string;
    paginas: number | null;
    venceEl: string | null;
    estado: "VENCIDO" | "PRONTO" | "VIGENTE" | "SIN_FECHA";
  }>;
  desgaste: {
    vida: { pct: number | null; km: number; totalKm: number | null };
    llantas: { pct: number | null; quedanKm: number | null };
    aceite: { pct: number | null; ultimoKm: number | null };
  };
  viajes: Array<{
    id: number;
    fecha: string;
    actividad: { id: number; folio: string; titulo: string } | null;
    destino: { tipo: TipoDestino; id: number | null; nombre: string | null };
    km: number;
    importe: number | null;
    sinFoto: boolean;
  }>;
  costos: {
    fichaId: number;
    ficha: FichaCosto;
    porKm: number;
    desglose: Array<{ clave: string; nombre: string; importe: number }>;
    precioLitro: number | null;
    valorEstimado: number;
    mantenimiento: { apartado: number; gastado: number };
  } | null;
  avisos: { sinFichaDeCosto: boolean; tanquesFaltantes: number; salidasSinFoto: number; sinSalidas: boolean };
  acceso: { veCostos: boolean };
};

export type Omisiones = FichaCostoOmision;
type FichaCostoOmision = {
  valorLlantas: number;
  rescatePct: number;
  vidaKm: number;
  kmAnio: number;
  tasaInteres: number;
  primaSeguro: number;
  ko: number;
  precioCombustible: number;
  costoAceite: number;
  aceiteCadaKm: number;
  vidaLlantasKm: number;
  otrosAnuales: number;
};

export type PlanEditable = {
  id?: number | null;
  concepto: string;
  cadaKm?: number | null;
  cadaMeses?: number | null;
  paginaManual?: number | null;
  costoEstimado?: number | null;
};

export type DatosFicha = Partial<Omit<Especificacion, "fuentes">> & {
  nombre?: string | null;
  placas?: string | null;
  fuentes?: Record<string, Fuente>;
  plan?: PlanEditable[];
  costo?: Partial<FichaCostoOmision> & { valor?: number };
  manual?: { url: string; nombre: string; paginas?: number | null } | null;
};

export type CampoLeido = { valor: string | number; fuente: Fuente };

export type ManualLeido = {
  campos: Record<string, CampoLeido>;
  servicios: Array<{ concepto: string; cadaKm: number | null; cadaMeses: number | null; paginaManual: number | null }>;
  paginas: number;
  escaneado: boolean;
  archivo: { url: string; nombre: string; paginas: number };
};

export type TableroLeido = { odometroKm: number | null; combustible: string | null; legible: boolean };
export type TicketLeido = {
  litros: number | null;
  precioLitro: number | null;
  importe: number | null;
  fecha: string | null;
  legible: boolean;
  revisar: boolean;
};

/* ── API ──────────────────────────────────────────────────────────────────── */

/** Un formulario con archivo: sin `Content-Type`, para que el navegador ponga el boundary. */
async function enviarForm<T>(token: string, ruta: string, form: FormData): Promise<T> {
  const res = await apiRequest(ruta, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  if (!res.ok) {
    const cuerpo = await parseResponseJson<{ message?: string | string[] }>(res).catch(() => null);
    const mensaje = Array.isArray(cuerpo?.message) ? cuerpo?.message[0] : cuerpo?.message;
    throw new Error(mensaje || `HTTP ${res.status}`);
  }
  return (await parseResponseJson<T>(res)) as T;
}

export const getFlotillaMes = (token: string, mes?: string) =>
  erpFetch<FlotillaMes>(`${API}/flotilla${mes ? `?mes=${mes}` : ""}`, token);

export const getFicha = (token: string, id: number | string) => erpFetch<FichaVehiculo>(`${API}/${id}`, token);

export const getOmisiones = (token: string) => erpFetch<Omisiones>(`${API}/omisiones`, token);

export const guardarFicha = (token: string, id: number | string | null, datos: DatosFicha, recostear = false) =>
  id == null
    ? erpFetch<FichaVehiculo>(API, token, json(datos))
    : erpFetch<FichaVehiculo>(`${API}/${id}${recostear ? "?recostear=1" : ""}`, token, json(datos, "PUT"));

export const guardarPlan = (token: string, id: number | string, plan: PlanEditable[]) =>
  erpFetch<FichaVehiculo>(`${API}/${id}/plan`, token, json({ plan }, "PUT"));

export const buscarRendimientoOficial = (
  token: string,
  vehiculo: { marca?: string | null; modelo?: string | null; anio?: number | null; version?: string | null; transmision?: string | null; combustible?: string | null },
) => erpFetch<{ rendimiento: { valor: number; fuente: Fuente; version: string | null } | null }>(`${API}/rendimiento-oficial`, token, json(vehiculo));

export function leerManual(token: string, archivo: File, pista?: string): Promise<ManualLeido> {
  const form = new FormData();
  form.append("archivo", archivo);
  if (pista?.trim()) form.append("pista", pista.trim());
  return enviarForm<ManualLeido>(token, `${API}/leer-manual`, form);
}

export function leerTablero(token: string, foto: File, odometroPrevio?: number | null): Promise<TableroLeido> {
  const form = new FormData();
  form.append("tipo", "TABLERO");
  form.append("foto", foto);
  if (odometroPrevio != null) form.append("odometroPrevio", String(odometroPrevio));
  return enviarForm<TableroLeido>(token, `${API}/leer-foto`, form);
}

export function leerTicket(token: string, foto: File): Promise<TicketLeido> {
  const form = new FormData();
  form.append("tipo", "TICKET");
  form.append("foto", foto);
  return enviarForm<TicketLeido>(token, `${API}/leer-foto`, form);
}

export function registrarCarga(
  token: string,
  id: number | string,
  datos: { odometro: number; litros: number; importe: number; tanqueLleno: boolean; ticket?: File | null; tablero?: File | null },
): Promise<FichaVehiculo> {
  const form = new FormData();
  form.append("odometro", String(datos.odometro));
  form.append("litros", String(datos.litros));
  form.append("importe", String(datos.importe));
  form.append("tanqueLleno", String(datos.tanqueLleno));
  if (datos.ticket) form.append("ticket", datos.ticket);
  if (datos.tablero) form.append("tablero", datos.tablero);
  return enviarForm<FichaVehiculo>(token, `${API}/${id}/cargas`, form);
}

export const quitarCarga = (token: string, id: number | string, cargaId: number) =>
  erpFetch<FichaVehiculo>(`${API}/${id}/cargas/${cargaId}`, token, { method: "DELETE" });

export function registrarServicio(
  token: string,
  id: number | string,
  datos: {
    fecha: string;
    odometro?: number | null;
    concepto: string;
    costo?: number | null;
    proveedor?: string;
    planIds: number[];
    comprobante?: File | null;
  },
): Promise<FichaVehiculo> {
  const form = new FormData();
  form.append("fecha", datos.fecha);
  form.append("concepto", datos.concepto);
  if (datos.odometro != null) form.append("odometro", String(datos.odometro));
  if (datos.costo != null) form.append("costo", String(datos.costo));
  if (datos.proveedor?.trim()) form.append("proveedor", datos.proveedor.trim());
  form.append("planIds", datos.planIds.join(","));
  if (datos.comprobante) form.append("comprobante", datos.comprobante);
  return enviarForm<FichaVehiculo>(token, `${API}/${id}/servicios`, form);
}

export const quitarServicio = (token: string, id: number | string, servicioId: number) =>
  erpFetch<FichaVehiculo>(`${API}/${id}/servicios/${servicioId}`, token, { method: "DELETE" });

export function agregarDocumento(
  token: string,
  id: number | string,
  datos: { tipo: string; nombre?: string; venceEl?: string | null; archivo: File },
): Promise<FichaVehiculo> {
  const form = new FormData();
  form.append("tipo", datos.tipo);
  form.append("archivo", datos.archivo);
  if (datos.nombre?.trim()) form.append("nombre", datos.nombre.trim());
  if (datos.venceEl) form.append("venceEl", datos.venceEl);
  return enviarForm<FichaVehiculo>(token, `${API}/${id}/documentos`, form);
}

export const quitarDocumento = (token: string, id: number | string, documentoId: number) =>
  erpFetch<FichaVehiculo>(`${API}/${id}/documentos/${documentoId}`, token, { method: "DELETE" });

/* ── Reglas de las pantallas ──────────────────────────────────────────────── */

const NUM = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });
const MILES = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const km = (n: number | null | undefined) => (n == null ? "—" : `${MILES.format(n)} km`);
export const kmPorLitro = (n: number | null | undefined) => (n == null ? "—" : `${NUM.format(n)} km/L`);

/** `2026-10-28` → «28 oct». No pasa por `Date`: una fecha sin hora se correría un día en México. */
export function fechaCorta(iso: string | null | undefined): string {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  return `${Number(m[3])} ${MESES_CORTOS[Number(m[2]) - 1]}`;
}

export function fechaLarga(iso: string | null | undefined): string {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Mes en curso en hora de México. */
export function mesActual(hoy: Date = new Date()): string {
  const local = new Date(hoy.getTime() - 6 * 3_600_000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}`;
}

export function mesesRecientes(cuantos = 6, hoy: Date = new Date()): Array<{ id: string; texto: string }> {
  const [anio, mes] = mesActual(hoy).split("-").map(Number);
  return Array.from({ length: cuantos }, (_, i) => {
    const d = new Date(Date.UTC(anio, mes - 1 - i, 1));
    return { id: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`, texto: nombreMes(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`) };
  });
}

export function nombreMes(mes: string): string {
  const [anio, m] = mes.split("-").map(Number);
  const nombre = MESES[m - 1] ?? "";
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
}

/** La etiqueta que dice de dónde salió un dato. Es lo que hace confiable la ficha. */
export function etiquetaFuente(f: Fuente | null | undefined): { texto: string; tono: "manual" | "conuee" | "captura" | "tickets" } {
  if (!f) return { texto: "Capturado", tono: "captura" };
  if (f.tipo === "MANUAL") return { texto: f.pagina ? `Manual p. ${f.pagina}` : "Manual", tono: "manual" };
  if (f.tipo === "CONUEE") return { texto: f.pagina ? `CONUEE 2023 p. ${f.pagina}` : "CONUEE 2023", tono: "conuee" };
  if (f.tipo === "TICKETS") return { texto: "Tus tickets", tono: "tickets" };
  return { texto: "Capturado", tono: "captura" };
}

/** «En 7,540 km», «Vencido por 320 km» o la fecha, si solo va por tiempo. */
export function textoServicio(p: ProximoServicio | null | undefined): string {
  if (!p) return "Sin programa";
  if (p.faltanKm != null) return p.faltanKm < 0 ? `Vencido por ${MILES.format(-p.faltanKm)} km` : `En ${MILES.format(p.faltanKm)} km`;
  if (p.fecha) return `${p.estado === "VENCIDO" ? "Venció" : "El"} ${fechaCorta(p.fecha)}`;
  return "Sin programa";
}

export function textoIntervalo(s: { cadaKm: number | null; cadaMeses: number | null }): string {
  const partes = [
    s.cadaKm ? `${MILES.format(s.cadaKm)} km` : null,
    s.cadaMeses ? `${s.cadaMeses} ${s.cadaMeses === 1 ? "mes" : "meses"}` : null,
  ].filter(Boolean);
  return partes.length ? `Cada ${partes.join(" o ")}` : "—";
}

/** Cómo se lee la barra del reparto. Lo que vale cero no se pinta. */
export function repartoDelMes(r: FlotillaMes["reparto"]) {
  const renglones = [
    { id: "proyectos", nombre: "A proyectos", nota: "Costo directo del proyecto", km: r.proyectos.km, importe: r.proyectos.importe ?? 0, tono: "proyectos" },
    { id: "cotizaciones", nombre: "A cotizaciones sin proyecto", nota: "Pasa al proyecto si se gana; si no, es costo de venta", km: r.cotizaciones.km, importe: r.cotizaciones.importe ?? 0, tono: "cotizaciones" },
    { id: "oficina", nombre: "Oficina", nota: "Trámites y compras: indirecto", km: r.oficina.km, importe: r.oficina.importe ?? 0, tono: "oficina" },
    { id: "sinLigar", nombre: "Sin ligar", nota: "Falta decir a qué trabajo fue", km: r.sinLigar.km, importe: r.sinLigar.importe ?? 0, tono: "sinLigar" },
    { id: "parado", nombre: "Parado", nota: "Seguro y dinero invertido aunque no salga: indirecto", km: null as number | null, importe: r.parado ?? 0, tono: "parado" },
  ];
  const total = renglones.reduce((a, x) => a + x.importe, 0);
  return { total, renglones: renglones.map((x) => ({ ...x, pct: total > 0 ? Math.round((x.importe / total) * 1000) / 10 : 0 })) };
}

/** A dónde se va cada peso de un km, en porcentaje entero. */
export function pctDeDesglose(partes: ReadonlyArray<{ importe: number }>): number[] {
  const total = partes.reduce((a, p) => a + p.importe, 0);
  return partes.map((p) => (total > 0 ? Math.round((p.importe / total) * 100) : 0));
}

/** Datos para una vista previa del costo mientras se llena la ficha. La cuenta oficial es la de la API. */
export function tarifaEstimada(f: {
  valor: number;
  valorLlantas: number;
  rescatePct: number;
  vidaKm: number;
  kmAnio: number;
  tasaInteres: number;
  primaSeguro: number;
  ko: number;
  precioCombustible: number;
  rendimiento: number | null;
  costoAceite: number;
  aceiteCadaKm: number;
  vidaLlantasKm: number;
  otrosAnuales: number;
}): number | null {
  if (!(f.valor > 0) || !(f.vidaKm > 0) || !(f.kmAnio > 0)) return null;
  const vm = Math.max(0, f.valor - f.valorLlantas);
  const vr = f.valor * f.rescatePct;
  const d = Math.max(0, vm - vr) / f.vidaKm;
  const im = ((vm + vr) * f.tasaInteres) / (2 * f.kmAnio);
  const sm = ((vm + vr) * f.primaSeguro) / (2 * f.kmAnio);
  const mn = f.ko * d;
  const otros = f.otrosAnuales / f.kmAnio;
  const co = f.rendimiento ? f.precioCombustible / f.rendimiento : 0;
  const lb = f.aceiteCadaKm > 0 ? f.costoAceite / f.aceiteCadaKm : 0;
  const n = f.vidaLlantasKm > 0 ? f.valorLlantas / f.vidaLlantasKm : 0;
  return Math.round((d + im + sm + mn + otros + co + lb + n) * 100) / 100;
}

/** «Número» de un campo de texto: vacío o basura es null, no cero. Acepta comas de miles. */
export function aNumero(texto: string | number | null | undefined): number | null {
  if (texto == null) return null;
  const limpio = String(texto).replace(/[$,\s]/g, "");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lo que mediría esta carga si llena el tanque: km desde el último lleno, entre los litros de lo que
 * se cargó desde entonces. Sin un lleno anterior no se puede medir.
 */
export function rendimientoDeEstaCarga(
  cargas: ReadonlyArray<{ odometro: number; litros: number; tanqueLleno: boolean }>,
  odometro: number,
  litros: number,
): { km: number; litros: number; kmPorLitro: number } | null {
  const previas = cargas.filter((c) => c.odometro < odometro).sort((a, b) => b.odometro - a.odometro);
  let total = litros;
  for (const c of previas) {
    if (c.tanqueLleno) {
      const recorridos = odometro - c.odometro;
      const rendimiento = recorridos / total;
      if (rendimiento < 2 || rendimiento > 40) return null;
      return { km: recorridos, litros: Math.round(total * 100) / 100, kmPorLitro: Math.round(rendimiento * 100) / 100 };
    }
    total += c.litros;
  }
  return null;
}

/** Nombre sugerido a partir del manual o de lo que se escribió. */
export function nombreDeVehiculo(d: { marca?: string | null; modelo?: string | null; anio?: number | string | null }): string {
  return [d.marca, d.modelo, d.anio].filter(Boolean).join(" ").trim();
}
