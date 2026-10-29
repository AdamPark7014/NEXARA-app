/**
 * NEXARA · Mesa contable (la pantalla de la contadora).
 *
 * Tres cosas en un solo módulo, para que las cuatro pantallas hablen igual:
 *  1. Los tipos del contrato con la API (`/api/accounting/workspace/mesa/**`, 29-10-2026).
 *  2. Una función por endpoint (todas pasan por `erpFetch`, como el resto de contabilidad).
 *  3. Formateadores y reglas puras (moneda es-MX, «hace N días», semáforo, PPD → forma 99…),
 *     probados en `mesa-contable.spec.ts`. Nada de esto toca el DOM.
 *
 * Importes en MXN como `number` con dos decimales; fechas `YYYY-MM-DD` (días, no instantes).
 * Los porcentajes del contrato (`pctIngresos`, `variacionPct`, márgenes, endeudamiento) se
 * leen como 0–100, no como fracción.
 */
import { buildApiUrl } from "@/lib/api-base";
import { erpFetch } from "@/lib/erp-api";
import { withTenantHeaders } from "@/lib/tenant";

/* ═══════════════════════════════════════════════════════════════ Contrato */

export type Semaforo = "ok" | "atencion" | "tarde";
export type Timbrado = { conectado: boolean; proveedor: string; mensaje: string | null };
export type LineaPoliza = { cuenta: string; debe: number; haber: number };

export type Resumen = { porFacturar: number; pagosPendientes: number };

export type OrigenPF = "SERVICIO" | "COTIZACION" | "ANTICIPO" | "PEDIDO" | "COMPLEMENTO";
export type FiltroOrigenPF = "TODO" | OrigenPF;
export type AccionPF = "PREPARAR" | "COMPLEMENTO" | "CAPTURAR_PRECIO" | "COMPLETAR_CLIENTE" | "ABRIR_BORRADOR";

export interface PorFacturarItem {
  clave: string;
  origen: OrigenPF;
  origenId: number;
  cliente: { id: number | null; nombre: string; rfc: string | null };
  folio: string;
  folioHref: string | null;
  concepto: string;
  detalle: string | null;
  listoDesde: string;
  diasEsperando: number;
  diasHabiles: number;
  semaforo: Semaforo;
  importe: number | null;
  menos: { etiqueta: string; importe: number } | null;
  pendientes: Array<{ clave: string; texto: string }>;
  nota: string | null;
  accion: AccionPF;
  facturaBorradorId: number | null;
}

export interface PorFacturarRespuesta {
  resumen: {
    importe: number;
    conceptos: number;
    clientes: number;
    masAntiguoDias: number | null;
    masAntiguoHabiles: number | null;
    anticipos: { conteo: number; importe: number };
    complementos: { conteo: number; importe: number };
    facturadoMes: { importe: number; conteo: number; cancelacionesPendientes: number; mes: string };
  };
  conteos: Record<FiltroOrigenPF, number>;
  items: PorFacturarItem[];
  timbrado: Timbrado;
}

export type NivelRevision = "ok" | "aviso" | "error";

export interface ConceptoFactura {
  id: number;
  descripcion: string;
  claveSat: string | null;
  unidadClave: string | null;
  unidad: string | null;
  cantidad: number;
  precio: number;
  ivaPct: number;
  importe: number;
}

export interface RevisionFactura {
  factura: {
    id: number;
    folio: string;
    status: string;
    esAnticipo: boolean;
    issueDate: string;
    dueDate: string;
    cfdiUsage: string | null;
    satPaymentMethod: "PUE" | "PPD" | null;
    satPaymentForm: string | null;
    currency: string;
    receptor: {
      nombre: string | null;
      rfc: string | null;
      regimen: string | null;
      regimenTexto: string | null;
      cp: string | null;
      correo: string | null;
      clienteId: number | null;
    };
    conceptos: ConceptoFactura[];
    subtotal: number;
    descuento: number;
    iva: number;
    retenciones: number;
    total: number;
    relacionados: Array<{ tipo: string; uuid: string; folio: string | null }>;
    cfdiUuid: string | null;
    pdfUrl: string | null;
    /** Editor de conceptos que ya existe (`/erp/invoicing/<id>`). */
    editarConceptosHref?: string;
  };
  origen: { tipo: OrigenPF; folio: string; href: string | null; extra: string | null } | null;
  revisiones: Array<{ clave: string; nivel: NivelRevision; texto: string; detalle: string | null }>;
  poliza: LineaPoliza[];
  notaPoliza: string | null;
  puedeTimbrar: boolean;
  timbrado: Timbrado;
}

export type CambiosFactura = Partial<{
  cfdiUsage: string;
  satPaymentMethod: "PUE" | "PPD";
  satPaymentForm: string | null;
  dueDate: string;
  receptorRfc: string;
  receptorName: string;
  receptorRegime: string;
  receptorZipCode: string;
  notes: string;
}>;

export type OrigenPG = "VIATICO" | "GASTO" | "NOMINA" | "PAGO" | "RECEPCION";
export type TipoPG = "COBRO" | "PROVEEDOR" | "VIATICO" | "GASTO" | "NOMINA";
export type FiltroTipoPG = "TODO" | TipoPG;
export type EstadoCeldaValor = "ok" | "parcial" | "falta" | "no_aplica" | "espera" | "sugerencia";

export interface EstadoCelda {
  estado: EstadoCeldaValor;
  texto: string;
  accion: string | null;
}

export interface SugerenciaBanco {
  bankTransactionId: number;
  score: number;
  fecha: string;
  importe: number;
  descripcion: string;
}

export interface PagoGastoItem {
  clave: string;
  origen: OrigenPG;
  origenId: number;
  fecha: string;
  tipo: TipoPG;
  tipoEtiqueta: string;
  titulo: string;
  subtitulo: string | null;
  folio: { texto: string; href: string | null } | null;
  importe: number;
  cfdi: EstadoCelda;
  banco: EstadoCelda & { sugerencia: SugerenciaBanco | null };
  poliza: EstadoCelda & { journalEntryId: number | null };
  pendiente: boolean;
}

export interface PagosGastosRespuesta {
  periodo: { mes: string; etiqueta: string; from: string; to: string };
  resumen: {
    entro: { importe: number; conteo: number };
    salio: { importe: number; conteo: number };
    sinCfdi: { conteo: number; importe: number };
    porConciliar: { conteo: number; conSugerencia: number };
    sinPoliza: { conteo: number };
    saldoBancos: number | null;
  };
  conteos: Record<FiltroTipoPG, number>;
  pendientes: number;
  items: PagoGastoItem[];
}

export interface DetallePagoGasto {
  item: PagoGastoItem;
  encabezado: string;
  montos: Array<{ etiqueta: string; importe: number }>;
  comprobantes: Array<{ vinculoId: number; invoiceId: number; texto: string; uuidCorto: string; iva: number; total: number }>;
  sinFactura: { importe: number; texto: string } | null;
  aceptaXml: boolean;
  banco: {
    vinculado: { vinculoId: number | null; bankTransactionId: number; texto: string; importe: number } | null;
    sugerencias: Array<SugerenciaBanco & { cuenta: string }>;
  };
  polizaPropuesta: LineaPoliza[];
  polizaRegistrada: { id: number; numero: string } | null;
  puedeRegistrarPoliza: boolean;
  responsable: { id: number; nombre: string } | null;
}

export type VistaEstados = "resultados" | "balance";
export type PeriodoEstados = "mes" | "trimestre" | "anio";

export interface FilaEstado {
  cuentaId: number | null;
  codigo: string;
  nombre: string;
  agrupador: string | null;
  actual: number;
  anterior: number;
  pctIngresos: number | null;
  variacionPct: number | null;
}

export interface SeccionEstado {
  clave: string;
  titulo: string;
  filas: FilaEstado[];
  total: Omit<FilaEstado, "cuentaId" | "codigo" | "agrupador"> | null;
}

export interface EstadoResultados {
  periodo: { etiqueta: string; from: string; to: string };
  comparado: { etiqueta: string; from: string; to: string };
  mesAbierto: boolean;
  cifras: {
    ingresos: number;
    ingresosVar: number | null;
    utilidadBruta: number;
    margenBruto: number | null;
    utilidadOperacion: number;
    margenOperacion: number | null;
    utilidadOperacionVar: number | null;
    utilidadNeta: number;
    margenNeto: number | null;
  };
  secciones: SeccionEstado[];
  utilidadNeta: { actual: number; anterior: number; pctIngresos: number | null; variacionPct: number | null };
  margenes: Array<{ mes: string; pct: number | null; actual: boolean }>;
  cierre: { sinPoliza: number; sinAgrupador: number; porConciliar: number; polizasCuadradas: boolean };
}

export interface SeccionBalance {
  titulo: string;
  filas: Array<{ cuentaId: number; nombre: string; agrupador: string | null; saldo: number }>;
  total: number;
}

export interface BloqueBalance {
  total: number;
  secciones: SeccionBalance[];
}

export interface BalanceGeneral {
  fecha: string;
  etiqueta: string;
  mesAbierto: boolean;
  cuadra: boolean;
  diferencia: number;
  activo: BloqueBalance;
  pasivo: BloqueBalance;
  capital: BloqueBalance;
  indicadores: { liquidez: number | null; pruebaAcida: number | null; diasCobro: number | null; endeudamiento: number | null };
}

/* ═══════════════════════════════════════════════════════════════ Endpoints */

const MESA = "accounting/workspace/mesa";

function json(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

export function getResumen(token: string) {
  return erpFetch<Resumen>(`${MESA}/resumen`, token);
}

export function getPorFacturar(token: string, origen: FiltroOrigenPF = "TODO") {
  return erpFetch<PorFacturarRespuesta>(`${MESA}/por-facturar?origen=${origen}`, token);
}

export function prepararFactura(token: string, origen: OrigenPF, origenId: number) {
  return erpFetch<{ invoiceId: number }>(`${MESA}/por-facturar/preparar`, token, json({ origen, origenId }));
}

export function descartarPendiente(token: string, origen: OrigenPF, origenId: number, motivo: string) {
  return erpFetch<{ ok: true }>(`${MESA}/por-facturar/descartar`, token, json({ origen, origenId, motivo }));
}

/** Complemento de pago: `origenId` del renglón COMPLEMENTO es el `paymentId`. */
export function timbrarComplemento(token: string, paymentId: number) {
  return erpFetch<unknown>(`accounting/invoices/payments/${paymentId}/stamp-complement`, token, { method: "POST" });
}

export function getRevision(token: string, invoiceId: number) {
  return erpFetch<RevisionFactura>(`${MESA}/facturas/${invoiceId}/revision`, token);
}

export function actualizarFactura(token: string, invoiceId: number, cambios: CambiosFactura) {
  return erpFetch<unknown>(`accounting/invoices/${invoiceId}`, token, { method: "PATCH", body: JSON.stringify(cambios) });
}

export function timbrarFactura(token: string, invoiceId: number) {
  return erpFetch<unknown>(`accounting/invoices/${invoiceId}/stamp`, token, { method: "POST" });
}

export type FiltrosPagosGastos = { mes: string; tipo: FiltroTipoPG; soloPendientes: boolean };

export function queryPagosGastos({ mes, tipo, soloPendientes }: FiltrosPagosGastos): string {
  const qs = new URLSearchParams({ mes, tipo });
  if (soloPendientes) qs.set("soloPendientes", "1");
  return qs.toString();
}

export function getPagosGastos(token: string, filtros: FiltrosPagosGastos) {
  return erpFetch<PagosGastosRespuesta>(`${MESA}/pagos-gastos?${queryPagosGastos(filtros)}`, token);
}

export function getDetallePagoGasto(token: string, origen: OrigenPG, origenId: number) {
  return erpFetch<DetallePagoGasto>(`${MESA}/pagos-gastos/${origen}/${origenId}`, token);
}

export function ligarCfdi(token: string, origen: OrigenPG, origenId: number, datos: { xml?: string; uuid?: string }) {
  return erpFetch<DetallePagoGasto>(`${MESA}/pagos-gastos/${origen}/${origenId}/cfdi`, token, json(datos));
}

export function quitarVinculo(token: string, vinculoId: number) {
  return erpFetch<{ ok: true }>(`${MESA}/vinculos/${vinculoId}`, token, { method: "DELETE" });
}

export function ligarBanco(token: string, origen: OrigenPG, origenId: number, bankTransactionId: number) {
  return erpFetch<DetallePagoGasto>(`${MESA}/pagos-gastos/${origen}/${origenId}/banco`, token, json({ bankTransactionId }));
}

export function registrarPoliza(token: string, origen: OrigenPG, origenId: number) {
  return erpFetch<DetallePagoGasto>(`${MESA}/pagos-gastos/${origen}/${origenId}/poliza`, token, { method: "POST" });
}

export function getEstadoResultados(token: string, periodo: PeriodoEstados, fecha: string) {
  return erpFetch<EstadoResultados>(`${MESA}/estados?vista=resultados&periodo=${periodo}&fecha=${fecha}`, token);
}

export function getBalanceGeneral(token: string, fecha: string) {
  return erpFetch<BalanceGeneral>(`${MESA}/estados?vista=balance&periodo=mes&fecha=${fecha}`, token);
}

export function asignarAgrupador(token: string, cuentaId: number, satAgrupador: string) {
  return erpFetch<unknown>(`accounting/accounts/${cuentaId}`, token, { method: "PATCH", body: JSON.stringify({ satAgrupador }) });
}

/**
 * Descarga un archivo de la API con la sesión y la empresa activas. Devuelve el `Blob`;
 * quien llama decide si lo guarda o lo abre. Lanza con el texto del servidor si no es 2xx.
 */
export async function descargarArchivo(token: string, path: string): Promise<Blob> {
  const res = await fetch(buildApiUrl(path), {
    credentials: "include",
    headers: withTenantHeaders({ Authorization: `Bearer ${token}` }),
  });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
  return res.blob();
}

export const rutaPdfFactura = (invoiceId: number) => `accounting/invoices/${invoiceId}/pdf`;
export const rutaExcelEstados = (periodo: PeriodoEstados, fecha: string) => `${MESA}/estados/excel?periodo=${periodo}&fecha=${fecha}`;
export function rutaBalanzaXml(fecha: string) {
  const [anio, mes] = fecha.split("-");
  return `accounting/accounts/compliance/balanza-xml?month=${Number(mes)}&year=${Number(anio)}`;
}

/** Evento de ventana para que los contadores de los chips se refresquen tras una acción. */
export const EVENTO_RESUMEN = "mesa-contable:resumen";
export function avisarCambioMesa() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_RESUMEN));
}

/* ═══════════════════════════════════════════════════════════════ Formato */

/** Menos tipográfico (U+2212), el del mockup: «−$2,500.00». */
export const MENOS = "−";

const NUM2 = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM0 = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });

function limpio(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** «$18,560.00»; negativo «−$1,240.00». */
export function dinero(n: number | null | undefined): string {
  const v = limpio(n);
  const abs = NUM2.format(Math.abs(v));
  return Math.abs(v) < 0.005 ? `$${NUM2.format(0)}` : v < 0 ? `${MENOS}$${abs}` : `$${abs}`;
}

/** Cifra de tarjeta, sin centavos: «$216,320». */
export function dineroCorto(n: number | null | undefined): string {
  const v = Math.round(limpio(n));
  const abs = NUM0.format(Math.abs(v));
  return v < 0 ? `${MENOS}$${abs}` : `$${abs}`;
}

/** Con signo siempre: «+$25,000.00» entra, «−$2,500.00» sale. */
export function dineroConSigno(n: number | null | undefined): string {
  const v = limpio(n);
  if (Math.abs(v) < 0.005) return `$${NUM2.format(0)}`;
  return v > 0 ? `+${dinero(v)}` : dinero(v);
}

/** Cifra de estado financiero o póliza, sin signo de pesos: «18,560.00», «−1,240.00». */
export function cifra(n: number | null | undefined): string {
  const v = limpio(n);
  if (Math.abs(v) < 0.005) return NUM2.format(0);
  return v < 0 ? `${MENOS}${NUM2.format(Math.abs(v))}` : NUM2.format(v);
}

/** Debe/haber de póliza: cero se pinta como raya. */
export function cifraPoliza(n: number | null | undefined): string {
  return Math.abs(limpio(n)) < 0.005 ? "—" : cifra(n);
}

/** «65.1 %». `null` → «—». */
export function porcentaje(n: number | null | undefined, decimales = 1): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const v = Number(n.toFixed(decimales));
  const txt = Math.abs(v).toFixed(decimales);
  return `${v < 0 ? MENOS : ""}${txt} %`;
}

/** Variación con signo: «+15.7 %», «−3.6 %», «0.0 %». */
export function variacion(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const v = Number(n.toFixed(1));
  if (v === 0) return "0.0 %";
  return `${v > 0 ? "+" : MENOS}${Math.abs(v).toFixed(1)} %`;
}

/** Índice con dos decimales: «2.27». */
export function indice(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function partes(fecha: string): { a: number; m: number; d: number } | null {
  const r = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(fecha ?? "");
  if (!r) return null;
  return { a: Number(r[1]), m: Number(r[2]), d: Number(r[3] ?? "1") };
}

/** «21 oct». Se arma a mano: así no depende de la versión de ICU ni de la zona horaria. */
export function fechaCorta(fecha: string | null | undefined): string {
  const p = fecha ? partes(fecha) : null;
  if (!p || p.m < 1 || p.m > 12) return "—";
  return `${p.d} ${MESES_CORTOS[p.m - 1]}`;
}

/** «28 nov 2026». */
export function fechaMedia(fecha: string | null | undefined): string {
  const p = fecha ? partes(fecha) : null;
  if (!p || p.m < 1 || p.m > 12) return "—";
  return `${p.d} ${MESES_CORTOS[p.m - 1]} ${p.a}`;
}

/** «hoy», «ayer», «hace 8 días». */
export function haceDias(dias: number | null | undefined): string {
  const n = Math.max(0, Math.round(limpio(dias)));
  if (n === 0) return "hoy";
  if (n === 1) return "ayer";
  return `hace ${n} días`;
}

/** «8 días», «1 día». */
export function diasTexto(dias: number | null | undefined): string {
  const n = Math.max(0, Math.round(limpio(dias)));
  return `${n} ${n === 1 ? "día" : "días"}`;
}

/** Días naturales entre dos fechas `YYYY-MM-DD` (b − a). `null` si alguna no es fecha. */
export function diasEntre(a: string | null | undefined, b: string | null | undefined): number | null {
  const pa = a ? partes(a) : null;
  const pb = b ? partes(b) : null;
  if (!pa || !pb) return null;
  return Math.round((Date.UTC(pb.a, pb.m - 1, pb.d) - Date.UTC(pa.a, pa.m - 1, pa.d)) / 86_400_000);
}

/** «1 concepto», «12 conceptos». */
export function plural(n: number, singular: string, pluralTxt?: string): string {
  return `${n} ${n === 1 ? singular : (pluralTxt ?? `${singular}s`)}`;
}

/* ── Meses del selector ───────────────────────────────────────────────── */

/** Mes en curso `YYYY-MM`, en hora local. */
export function mesActual(hoy: Date = new Date()): string {
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

/** Mueve un `YYYY-MM` n meses (negativo = atrás). */
export function moverMes(mes: string, n: number): string {
  const p = partes(mes);
  if (!p) return mes;
  const total = p.a * 12 + (p.m - 1) + n;
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${a}-${String(m).padStart(2, "0")}`;
}

/** «Octubre 2026». */
export function etiquetaMes(mes: string): string {
  const p = partes(mes);
  if (!p || p.m < 1 || p.m > 12) return mes;
  const nombre = MESES_LARGOS[p.m - 1];
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${p.a}`;
}

/** «jul» → «julio». Si no es abreviatura conocida, se devuelve tal cual. */
export function mesLargo(corto: string): string {
  const i = MESES_CORTOS.indexOf((corto ?? "").trim().toLowerCase().replace(/\.$/, "").slice(0, 3));
  return i >= 0 ? MESES_LARGOS[i] : corto;
}

/** Cuántos meses avanza cada paso del selector de periodo. */
export function pasoPeriodo(periodo: PeriodoEstados): number {
  return periodo === "anio" ? 12 : periodo === "trimestre" ? 3 : 1;
}

/** «Octubre 2026» → «Octubre» (encabezado de columna del estado de resultados). */
export function cabeceraPeriodo(etiqueta: string): string {
  const t = (etiqueta ?? "").trim().replace(/\s+\d{4}$/, "");
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}` : etiqueta;
}

/* ═══════════════════════════════════════════════════════════════ Reglas */

/** Semáforo de espera por días hábiles: ≤1 ok, 2 atención, >2 tarde (meta: 2 días hábiles). */
export function semaforoDeHabiles(habiles: number | null | undefined): Semaforo {
  const n = limpio(habiles);
  if (n > 2) return "tarde";
  if (n === 2) return "atencion";
  return "ok";
}

/** Tinta del «hace N días»: tarde rojo, atención ámbar, a tiempo gris. */
export type TintaSemaforo = "danger" | "warning" | "muted";
export function tintaSemaforo(s: Semaforo | null | undefined): TintaSemaforo {
  if (s === "tarde") return "danger";
  if (s === "atencion") return "warning";
  return "muted";
}

export const ORIGEN_PF: Record<OrigenPF, { etiqueta: string; plural: string; categoria: Categoria }> = {
  SERVICIO: { etiqueta: "Servicio terminado", plural: "Servicios terminados", categoria: "verde" },
  COTIZACION: { etiqueta: "Cotización aprobada", plural: "Cotizaciones aprobadas", categoria: "naranja" },
  ANTICIPO: { etiqueta: "Anticipo", plural: "Anticipos", categoria: "magenta" },
  PEDIDO: { etiqueta: "Pedido", plural: "Pedidos", categoria: "cielo" },
  COMPLEMENTO: { etiqueta: "Complemento de pago", plural: "Complementos de pago", categoria: "azul" },
};

export const ORDEN_ORIGEN_PF: FiltroOrigenPF[] = ["TODO", "SERVICIO", "COTIZACION", "ANTICIPO", "PEDIDO", "COMPLEMENTO"];

/** Color de categoría de los chips (nunca de estado). */
export type Categoria = "verde" | "naranja" | "magenta" | "cielo" | "azul" | "gris";

export const TIPO_PG: Record<TipoPG, { pestana: string; categoria: Categoria }> = {
  COBRO: { pestana: "Cobros", categoria: "verde" },
  PROVEEDOR: { pestana: "Proveedores y compras", categoria: "naranja" },
  VIATICO: { pestana: "Viáticos", categoria: "cielo" },
  GASTO: { pestana: "Gastos", categoria: "gris" },
  NOMINA: { pestana: "Nómina", categoria: "magenta" },
};

export const ORDEN_TIPO_PG: FiltroTipoPG[] = ["TODO", "COBRO", "PROVEEDOR", "VIATICO", "GASTO", "NOMINA"];

/** Texto y destino del botón de cada renglón de «Por facturar». */
export type BotonPF =
  | { tipo: "preparar"; texto: string; primario: true }
  | { tipo: "abrir"; texto: string; primario: true; href: string }
  | { tipo: "complemento"; texto: string; primario: true }
  | { tipo: "enlace"; texto: string; primario: false; href: string | null };

export function botonPorFacturar(item: PorFacturarItem): BotonPF {
  switch (item.accion) {
    case "ABRIR_BORRADOR":
      return item.facturaBorradorId != null
        ? { tipo: "abrir", texto: "Abrir borrador", primario: true, href: rutaBorrador(item.facturaBorradorId) }
        : { tipo: "preparar", texto: "Preparar CFDI", primario: true };
    case "COMPLEMENTO":
      return { tipo: "complemento", texto: "Emitir complemento", primario: true };
    case "CAPTURAR_PRECIO":
      return { tipo: "enlace", texto: "Capturar precio", primario: false, href: item.folioHref };
    case "COMPLETAR_CLIENTE":
      return {
        tipo: "enlace",
        texto: "Completar cliente",
        primario: false,
        href: item.folioHref ?? (item.cliente.id != null ? rutaCliente(item.cliente.id) : null),
      };
    case "PREPARAR":
    default:
      return { tipo: "preparar", texto: "Preparar CFDI", primario: true };
  }
}

export const RUTA_BANDEJA = "/erp/contabilidad/por-facturar";
export const rutaBorrador = (invoiceId: number) => `${RUTA_BANDEJA}/${invoiceId}`;
export const rutaCliente = (clienteId: number) => `/erp/clientes/${clienteId}`;

/** Qué se puede preparar en lote: lo que ya tiene borrador o se prepara con un clic. */
export function preparableEnLote(item: PorFacturarItem): boolean {
  return item.accion === "PREPARAR" || item.accion === "ABRIR_BORRADOR";
}

/** Búsqueda local por cliente, RFC o folio (sin acentos ni mayúsculas). */
export function normalizar(t: string | null | undefined): string {
  return (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function filtrarPorFacturar(items: PorFacturarItem[], origen: FiltroOrigenPF, busqueda: string): PorFacturarItem[] {
  const q = normalizar(busqueda);
  return items.filter((it) => {
    if (origen !== "TODO" && it.origen !== origen) return false;
    if (!q) return true;
    return [it.cliente.nombre, it.cliente.rfc, it.folio, it.concepto].some((c) => normalizar(c).includes(q));
  });
}

/** Aviso de timbrado arriba de la bandeja y del borrador. `null` = timbrado real, sin aviso. */
export function avisoTimbrado(t: Timbrado | null | undefined): { tono: "info" | "warning"; titulo: string; texto: string } | null {
  if (!t) return null;
  if (!t.conectado) {
    return {
      tono: "info",
      titulo: "El timbrado todavía no está conectado.",
      texto:
        t.mensaje?.trim() ||
        "Puedes preparar y revisar cada CFDI; se timbra en cuanto administración contrate el PAC (Facturama, recomendado) y cargue el sello digital (CSD).",
    };
  }
  if ((t.proveedor ?? "").trim().toLowerCase() === "mock") {
    return { tono: "warning", titulo: "Timbrado de prueba: el UUID no es real.", texto: t.mensaje?.trim() || "" };
  }
  return null;
}

/* ── Comprobante (CFDI 4.0) ───────────────────────────────────────────── */

export type OpcionSat = { valor: string; texto: string };

export const USOS_CFDI: OpcionSat[] = [
  { valor: "G01", texto: "G01 · Adquisición de mercancías" },
  { valor: "G02", texto: "G02 · Devoluciones, descuentos o bonificaciones" },
  { valor: "G03", texto: "G03 · Gastos en general" },
  { valor: "I01", texto: "I01 · Construcciones" },
  { valor: "I02", texto: "I02 · Mobiliario y equipo de oficina" },
  { valor: "I03", texto: "I03 · Equipo de transporte" },
  { valor: "I04", texto: "I04 · Equipo de cómputo y accesorios" },
  { valor: "I06", texto: "I06 · Comunicaciones telefónicas" },
  { valor: "I08", texto: "I08 · Otra maquinaria y equipo" },
  { valor: "S01", texto: "S01 · Sin efectos fiscales" },
  { valor: "CP01", texto: "CP01 · Pagos" },
];

export const METODOS_PAGO: OpcionSat[] = [
  { valor: "PUE", texto: "PUE · Pago en una sola exhibición" },
  { valor: "PPD", texto: "PPD · A crédito o en parcialidades" },
];

export const FORMAS_PAGO: OpcionSat[] = [
  { valor: "01", texto: "01 · Efectivo" },
  { valor: "02", texto: "02 · Cheque nominativo" },
  { valor: "03", texto: "03 · Transferencia electrónica" },
  { valor: "04", texto: "04 · Tarjeta de crédito" },
  { valor: "28", texto: "28 · Tarjeta de débito" },
  { valor: "99", texto: "99 · Por definir" },
];

/** Las opciones del catálogo, más el valor guardado si no está en él (para no perderlo al pintar). */
export function opcionesCon(catalogo: OpcionSat[], actual: string | null | undefined): OpcionSat[] {
  if (!actual || catalogo.some((o) => o.valor === actual)) return catalogo;
  return [...catalogo, { valor: actual, texto: actual }];
}

/**
 * Regla SAT: con PPD la forma de pago es 99 («por definir»). Con PUE la 99 no vale, así que
 * se deja vacía para que la contadora elija (no se inventa una forma). Las demás se conservan.
 */
export function formaParaMetodo(metodo: "PUE" | "PPD" | null | undefined, formaActual: string | null | undefined): string | null {
  if (metodo === "PPD") return "99";
  if (metodo === "PUE" && formaActual === "99") return null;
  return formaActual ?? null;
}

/** Con PPD el select de forma se bloquea en 99. */
export function formaBloqueada(metodo: "PUE" | "PPD" | null | undefined): boolean {
  return metodo === "PPD";
}

/** Por qué no se puede timbrar todavía (texto visible junto al botón). `null` = se puede. */
export function motivoNoTimbrar(r: Pick<RevisionFactura, "puedeTimbrar" | "revisiones" | "timbrado">): string | null {
  if (r.puedeTimbrar) return null;
  const errores = r.revisiones.filter((x) => x.nivel === "error");
  if (errores.length === 1) return `Antes de timbrar: ${errores[0].texto}.`.replace(/\.\.$/, ".");
  if (errores.length > 1) return `Antes de timbrar hay ${errores.length} cosas por corregir (ver «Antes de timbrar»).`;
  if (!r.timbrado.conectado) return r.timbrado.mensaje?.trim() || "El timbrado todavía no está conectado.";
  return "Esta factura no se puede timbrar todavía.";
}

const ESTADOS_FACTURA: Record<string, string> = {
  DRAFT: "Borrador",
  BORRADOR: "Borrador",
  PENDING: "Pendiente",
  STAMPING: "Timbrando",
  STAMPED: "Timbrada",
  ISSUED: "Timbrada",
  SENT: "Enviada",
  PAID: "Pagada",
  PARTIALLY_PAID: "Pago parcial",
  OVERDUE: "Vencida",
  CANCEL_PENDING: "Cancelación pendiente",
  CANCELLATION_PENDING: "Cancelación pendiente",
  CANCELLED: "Cancelada",
};

export function etiquetaEstadoFactura(status: string | null | undefined): string {
  const s = (status ?? "").trim().toUpperCase();
  return ESTADOS_FACTURA[s] ?? (s ? `${s.charAt(0)}${s.slice(1).toLowerCase().replace(/_/g, " ")}` : "Borrador");
}

export function esBorrador(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toUpperCase();
  return s === "" || s === "DRAFT" || s === "BORRADOR";
}

/** Subtítulo de la tarjeta de conceptos según de dónde viene la factura. */
export function textoOrigenConceptos(tipo: OrigenPF | null | undefined): string {
  if (tipo === "SERVICIO" || tipo === "COTIZACION") return "Vienen de la cotización aprobada; claves SAT de su catálogo";
  if (tipo === "PEDIDO") return "Vienen del pedido; claves SAT de su catálogo";
  if (tipo === "ANTICIPO") return "Anticipo de la cotización aprobada";
  return "Claves SAT de su catálogo";
}

/** «IVA trasladado 16 %» si todos los conceptos llevan la misma tasa; si no, sin tasa. */
export function etiquetaIva(conceptos: Array<Pick<ConceptoFactura, "ivaPct">>): string {
  const tasas = Array.from(new Set(conceptos.map((c) => Number(limpio(c.ivaPct).toFixed(2)))));
  return tasas.length === 1 ? `IVA trasladado ${tasas[0]} %` : "IVA trasladado";
}

/* ── Pagos y gastos ───────────────────────────────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID (folio fiscal) del SAT: 8-4-4-4-12 hexadecimales. */
export function esUuid(t: string | null | undefined): boolean {
  return UUID.test((t ?? "").trim());
}

/** Un archivo arrastrado o elegido se toma como CFDI si es .xml o trae tipo XML. */
export function esArchivoXml(f: { name: string; type?: string }): boolean {
  return /\.xml$/i.test(f.name) || /xml/i.test(f.type ?? "");
}

/** Cómo se pinta cada celda de estado en la tabla de pagos y gastos. */
export type PintaCelda = "ok" | "aviso" | "sugerencia" | "gris";
export function pintaCelda(estado: EstadoCeldaValor): PintaCelda {
  if (estado === "ok") return "ok";
  if (estado === "falta" || estado === "parcial") return "aviso";
  if (estado === "sugerencia") return "sugerencia";
  return "gris";
}

/** Texto del botón azul de sugerencia: «Sugerencia 96 %». */
export function textoSugerencia(celda: Pick<EstadoCelda, "texto"> & { sugerencia?: { score: number } | null }): string {
  if (celda.texto?.trim()) return celda.texto.trim();
  const s = celda.sugerencia?.score;
  if (typeof s !== "number") return "Sugerencia";
  return `Sugerencia ${Math.round(s <= 1 ? s * 100 : s)} %`;
}

/** Puntaje de una sugerencia de banco como porcentaje entero (acepta 0–1 o 0–100). */
export function puntaje(score: number): number {
  return Math.round(score <= 1 ? score * 100 : score);
}

/** «Pedir aclaración a Iván»: solo el primer nombre. */
export function primerNombre(nombre: string | null | undefined): string {
  return (nombre ?? "").trim().split(/\s+/)[0] ?? "";
}

/* ── Estados financieros ──────────────────────────────────────────────── */

/**
 * Tono de la variación en el estado de resultados.
 *  - Ingresos y subtotales (utilidades): subir es bueno (verde), bajar es malo (rojo).
 *  - Costos y gastos: solo se marca en rojo un alza de 20 % o más; lo demás va gris.
 *  - Lo financiero e impuestos va gris.
 */
export type TonoVariacion = "positivo" | "negativo" | "neutro";
export function tonoVariacion(seccion: string, v: number | null | undefined, esTotal = false): TonoVariacion {
  if (typeof v !== "number" || !Number.isFinite(v) || Number(v.toFixed(1)) === 0) return "neutro";
  const clave = normalizar(seccion);
  if (esTotal || clave.startsWith("ingreso")) return v > 0 ? "positivo" : "negativo";
  if (/costo|gasto/.test(clave)) return v >= 20 ? "negativo" : "neutro";
  return "neutro";
}

/** Altura de cada barra del margen neto, relativa al mayor (0–100). Negativos y vacíos = 0. */
export function alturasMargen(margenes: Array<{ pct: number | null }>): number[] {
  const vals = margenes.map((m) => (typeof m.pct === "number" && Number.isFinite(m.pct) ? Math.max(0, m.pct) : 0));
  const max = Math.max(0, ...vals);
  if (max <= 0) return vals.map(() => 0);
  return vals.map((v) => Math.round((v / max) * 100));
}

/** «Margen neto: julio 11.2 %, agosto 12.9 %…» para el lector de pantalla. */
export function descripcionMargen(margenes: Array<{ mes: string; pct: number | null }>): string {
  if (!margenes.length) return "Margen neto: sin datos";
  return `Margen neto: ${margenes.map((m) => `${mesLargo(m.mes)} ${porcentaje(m.pct)}`).join(", ")}`;
}

/** «Antes de cerrar octubre» (mes) o «Antes de cerrar el periodo». */
export function tituloCierre(etiquetaPeriodo: string, periodo: PeriodoEstados): string {
  if (periodo !== "mes") return "Antes de cerrar el periodo";
  const mes = (etiquetaPeriodo ?? "").trim().split(/\s+/)[0]?.toLowerCase();
  return mes ? `Antes de cerrar ${mes}` : "Antes de cerrar el mes";
}

/** Código agrupador del SAT: «601», «601.84» o «601.84.01». */
export function esAgrupadorValido(t: string | null | undefined): boolean {
  return /^\d{3}(\.\d{2}){0,2}$/.test((t ?? "").trim());
}

/** ¿El estado de resultados no tiene ni una cuenta con movimiento? */
export function resultadosVacios(r: Pick<EstadoResultados, "secciones">): boolean {
  return r.secciones.every((s) => s.filas.length === 0);
}

export function balanceVacio(b: Pick<BalanceGeneral, "activo" | "pasivo" | "capital">): boolean {
  return [b.activo, b.pasivo, b.capital].every((x) => x.secciones.every((s) => s.filas.length === 0));
}

/** Texto del total de una sección del balance: «Total circulante». */
export function totalSeccion(titulo: string): string {
  const t = (titulo ?? "").trim();
  return t ? `Total ${t.charAt(0).toLowerCase()}${t.slice(1)}` : "Total";
}
