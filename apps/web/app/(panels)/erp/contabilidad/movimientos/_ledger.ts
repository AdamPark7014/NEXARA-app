/**
 * Libro de movimientos — contrato con la API y lógica pura de la pantalla.
 *
 * Todo lo que se puede probar sin montar React vive aquí: armado del query
 * string, formato de fecha sin corrimiento de zona, etiquetas y el resumen de
 * filtros activos.
 */

export type LedgerTipo = "INGRESO" | "EGRESO" | "TRANSFERENCIA" | "AJUSTE";
export type LedgerNaturaleza = "EFECTIVO" | "DEVENGADO";

export type LedgerTabla =
  | "payments"
  | "expenses"
  | "work_project_expenses"
  | "bank_transactions"
  | "employee_payments"
  | "invoices";

export type LedgerParte = {
  tipo: "cliente" | "proveedor" | "empleado" | "banco";
  id: number | null;
  nombre: string;
};

export type LedgerProyecto = { tipo: "op" | "obra"; id: number; nombre: string };

export type LedgerRow = {
  id: string;
  fecha: string;
  tipo: LedgerTipo;
  naturaleza: LedgerNaturaleza;
  concepto: string;
  categoria: string;
  cuenta: { id: number; nombre: string } | null;
  contraparte: LedgerParte | null;
  proyecto: LedgerProyecto | null;
  referencia: string | null;
  ingreso: number;
  egreso: number;
  monto: number;
  estado: string;
  metodoPago: string | null;
  registradoPor: string | null;
  origen: { tabla: LedgerTabla; id: number; href: string | null };
  comprobanteUrl: string | null;
};

export type LedgerTotalsBlock = {
  ingresos: number;
  egresos: number;
  neto: number;
  conteo: number;
};

export type LedgerTotals = LedgerTotalsBlock & {
  efectivo: LedgerTotalsBlock;
  devengado: LedgerTotalsBlock;
  transferencias: { monto: number; conteo: number };
  ajustes: { monto: number; conteo: number };
};

export type LedgerResponse = {
  period: { from: string; to: string };
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: LedgerRow[];
  totals: LedgerTotals;
};

/** Filtros que maneja la barra superior. Vacío = sin filtrar. */
export type LedgerFilters = {
  from: string;
  to: string;
  tipo: string;
  categoria: string;
  cuentaId: string;
  estado: string;
  metodoPago: string;
  q: string;
};

export const TIPO_LABELS: Record<LedgerTipo, string> = {
  INGRESO: "Ingreso",
  EGRESO: "Egreso",
  TRANSFERENCIA: "Traspaso",
  AJUSTE: "Ajuste",
};

export const NATURALEZA_LABELS: Record<LedgerNaturaleza, string> = {
  EFECTIVO: "Efectivo",
  DEVENGADO: "Devengado",
};

export const METODO_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  BANK_TRANSFER: "Transferencia",
  CHECK: "Cheque",
  CREDIT_CARD: "Tarjeta de crédito",
  SPEI: "SPEI",
  DOMICILIACION: "Domiciliación",
  CARD_DEBIT: "Tarjeta de débito",
  DIGITAL_WALLET: "Monedero digital",
  COMPENSATION: "Compensación",
  OTHER: "Otro",
};

export const ORIGEN_LABELS: Record<LedgerTabla, string> = {
  payments: "Pago",
  expenses: "Gasto",
  work_project_expenses: "Gasto de obra",
  bank_transactions: "Línea bancaria",
  employee_payments: "Nómina",
  invoices: "Factura",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Mes en curso, que es el rango por defecto tanto en la API como aquí. */
export function currentMonthRange(today = new Date()): { from: string; to: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` };
}

export function emptyFilters(today = new Date()): LedgerFilters {
  const { from, to } = currentMonthRange(today);
  return { from, to, tipo: "", categoria: "", cuentaId: "", estado: "", metodoPago: "", q: "" };
}

/**
 * Query string para `/accounting/workspace/movimientos`. Los campos vacíos se
 * omiten: mandar `tipo=` hacía que la API lo tomara como filtro inválido.
 */
export function buildLedgerQuery(
  filters: Partial<LedgerFilters>,
  opts: { page?: number; pageSize?: number } = {},
): string {
  const params = new URLSearchParams();
  const put = (key: string, value: unknown) => {
    const v = value == null ? "" : String(value).trim();
    if (v) params.set(key, v);
  };

  put("from", filters.from);
  put("to", filters.to);
  put("tipo", filters.tipo);
  put("categoria", filters.categoria);
  put("cuentaId", filters.cuentaId);
  put("estado", filters.estado);
  put("metodoPago", filters.metodoPago);
  put("q", filters.q);
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  if (opts.pageSize) params.set("pageSize", String(opts.pageSize));

  return params.toString();
}

/** ¿Hay algo filtrado además del rango de fechas? */
export function hasActiveFilters(filters: Partial<LedgerFilters>): boolean {
  return [filters.tipo, filters.categoria, filters.cuentaId, filters.estado, filters.metodoPago, filters.q]
    .some((v) => !!v && String(v).trim().length > 0);
}

/**
 * `2026-09-01` → `01 sep 2026`, sin pasar por `new Date(iso)`, que interpreta
 * la cadena como UTC y en México restaba un día.
 */
export function formatLedgerDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "—";
  const [, y, mo, d] = m;
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const mes = meses[Number(mo) - 1] ?? mo;
  return `${d} ${mes} ${y}`;
}

export function formatMetodo(metodo: string | null | undefined): string {
  if (!metodo) return "—";
  return METODO_LABELS[metodo] ?? metodo;
}

/** Etiqueta del documento origen: «Factura #123». */
export function describeOrigen(row: Pick<LedgerRow, "origen">): string {
  return `${ORIGEN_LABELS[row.origen.tabla] ?? row.origen.tabla} #${row.origen.id}`;
}

export function emptyTotals(): LedgerTotals {
  const block = (): LedgerTotalsBlock => ({ ingresos: 0, egresos: 0, neto: 0, conteo: 0 });
  return {
    ...block(),
    efectivo: block(),
    devengado: block(),
    transferencias: { monto: 0, conteo: 0 },
    ajustes: { monto: 0, conteo: 0 },
  };
}

/** Opciones del select de tipo, en el orden en que la contadora los busca. */
export const TIPO_OPTIONS: { value: string; label: string }[] = [
  { value: "INGRESO", label: "Ingresos" },
  { value: "EGRESO", label: "Egresos" },
  { value: "TRANSFERENCIA", label: "Traspasos" },
  { value: "AJUSTE", label: "Ajustes" },
];

export const NATURALEZA_HINT =
  "Efectivo = ya pasó por banco o caja. Devengado = registrado pero aún no cobrado o pagado. Se muestran por separado para no sumar dos veces el mismo peso.";
