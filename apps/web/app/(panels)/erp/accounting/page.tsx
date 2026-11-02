"use client";

import { useEffect, useState, useCallback, useDeferredValue, useMemo, type ReactNode } from "react";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import BalanceOutlinedIcon from "@mui/icons-material/BalanceOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import CallMadeOutlinedIcon from "@mui/icons-material/CallMadeOutlined";
import CallReceivedOutlinedIcon from "@mui/icons-material/CallReceivedOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import ChecklistOutlinedIcon from "@mui/icons-material/ChecklistOutlined";
import DraftsOutlinedIcon from "@mui/icons-material/DraftsOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import HourglassBottomOutlinedIcon from "@mui/icons-material/HourglassBottomOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import SearchOffOutlinedIcon from "@mui/icons-material/SearchOffOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  DataTable,
  DateInput,
  EmptyState,
  Field,
  FieldGrid,
  Input,
  LinkButton,
  ListCard,
  ModuleToolbar,
  SearchInput,
  Select,
  SkeletonRows,
  Stat,
  StatRow,
  Tabs,
  type Column,
  type Tone,
} from "@/components/base";
import { MesaPagina } from "@/components/mesa-contable/MesaPagina";
import { Money } from "@/components/ui/DataTable";
import { useUrlQuery } from "@/components/finance/useUrlQuery";
import { saveBlob, todayStamp } from "@/components/finance/download";
import { useUser } from "@/components/UserContext";
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/Toast";
import { exportToExcel } from "@/lib/export-excel";
import s from "./accounting.module.css";
import { aFechaLocal, formatoFechaLocal } from "@/lib/fecha-calendario";

interface JournalEntry {
  id: number;
  reference?: string;
  description?: string;
  totalDebit?: number;
  totalCredit?: number;
  status?: string;
  date?: string;
  createdBy?: { nombre?: string };
  type?: string;
}

interface AccountOption {
  id: number;
  code?: string;
  name?: string;
}

interface Account {
  id: number;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  parentId?: number | null;
  description?: string | null;
  isActive: boolean;
  currency: string;
  balance: number;
  satAgrupador?: string | null;
  parent?: { id: number; code: string; name: string } | null;
}

interface DiotRow {
  supplierId: number;
  supplierName: string;
  rfc: string | null;
  baseAmount: number;
  ivaAmount: number;
  totalAmount: number;
  invoiceCount: number;
}

interface DiotReport {
  period: { month: number; year: number };
  rows: DiotRow[];
  totals: { baseAmount: number; ivaAmount: number; totalAmount: number };
  missingRfcSuppliers: string[];
}

interface SatAgrupadorStatus {
  totalAccounts: number;
  mappedAccounts: number;
  missingAccounts: { id: number; code: string; name: string }[];
  readyForBalanzaExport: boolean;
}

interface FiscalPeriod {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  closedAt?: string | null;
}

interface CostCenter {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  defaultAccountId?: number | null;
  defaultAccount?: { id: number; code: string; name: string } | null;
}

interface Budget {
  id: number;
  name: string;
  costCenterId: number;
  year: number;
  month?: number | null;
  plannedAmount: number;
  actualAmount: number;
  notes?: string | null;
  costCenter?: { id: number; code: string; name: string };
  variance?: number;
  variancePercent?: number;
}

interface TrialBalanceRow {
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
}

interface IncomeStatement {
  revenue: { code: string; name: string; amount: number }[];
  expenses: { code: string; name: string; amount: number }[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

interface BalanceSheetData {
  assets: { code: string; name: string; balance: number }[];
  liabilities: { code: string; name: string; balance: number }[];
  equity: { code: string; name: string; balance: number }[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanceCheck: boolean;
}

const TIPOS = ["DIARIO", "EGRESOS", "INGRESOS", "AJUSTE"];
const TIPO_LABEL: Record<string, string> = {
  DIARIO: "Diario",
  EGRESOS: "Egresos",
  INGRESOS: "Ingresos",
  AJUSTE: "Ajuste",
};
const tipoLabel = (t?: string) => (t ? (TIPO_LABEL[t] ?? t) : "");
const ENTRY_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  BORRADOR: "Borrador",
  POSTED: "Contabilizada",
  CONTABILIZADA: "Contabilizada",
  REVERSED: "Reversada",
};
const ACCOUNT_TYPES: Account["type"][] = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
const ACCOUNT_TYPE_LABEL: Record<Account["type"], string> = {
  ASSET: "Activo",
  LIABILITY: "Pasivo",
  EQUITY: "Capital",
  REVENUE: "Ingreso",
  EXPENSE: "Gasto",
};

const TABS = [
  { key: "inteligencia", label: "Inteligencia" },
  { key: "polizas", label: "Pólizas" },
  { key: "cuentas", label: "Catálogo de cuentas" },
  { key: "balanza", label: "Balanza de comprobación" },
  { key: "resultados", label: "Estado de resultados" },
  { key: "balance", label: "Balance general" },
  { key: "presupuestos", label: "Presupuestos" },
  { key: "cumplimiento_sat", label: "Cumplimiento SAT" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = {
  description: "",
  type: "DIARIO",
  date: todayStamp(),
  reference: "",
  debitAccountId: "",
  creditAccountId: "",
  amount: 0,
};

const emptyAccountForm = { code: "", name: "", type: "ASSET" as Account["type"], parentId: "", description: "" };
const emptyPeriodForm = { name: "", startDate: "", endDate: "" };
const emptyCostCenterForm = { code: "", name: "", defaultAccountId: "" };
const emptyBudgetForm = { name: "", costCenterId: "", year: new Date().getFullYear(), month: "", plannedAmount: 0, notes: "" };


const TAB_ITEMS: { id: TabKey; label: string }[] = TABS.map((t) => ({ id: t.key, label: t.label }));

/**
 * Cifra de cierre al pie de una tabla contable.
 *
 * Una póliza cuadra o no cuadra: si el total no está a la vista, hay que
 * sumarlo a mano para saberlo. Va alineado a la derecha, en cifras de ancho
 * fijo, bajo las mismas columnas de la tabla.
 */
function TableTotals({
  entries,
}: {
  entries: { label: string; value: ReactNode; tone?: "default" | "danger" }[];
}) {
  return (
    <div className={s.totales}>
      {entries.map((e) => (
        <div key={e.label} className={s.total}>
          <div className={s.totalEtiqueta}>{e.label}</div>
          <div className={e.tone === "danger" ? `${s.totalValor} ${s.totalPeligro}` : s.totalValor}>{e.value}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Panel de captura de un alta (póliza, cuenta, periodo, centro de costo, presupuesto):
 * título, campos en rejilla, el error de guardado y el pie con cancelar y guardar.
 * `anidada` lo pinta como banda dentro de la tarjeta de la lista a la que pertenece.
 */
function Captura({
  titulo,
  descripcion,
  avisos,
  error,
  pie,
  anidada = false,
  children,
}: {
  titulo: string;
  descripcion?: string;
  avisos?: ReactNode;
  error?: string | null;
  pie: ReactNode;
  anidada?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={s.captura} data-anidada={anidada ? "true" : undefined}>
      <div>
        <h3 className={s.capturaTitulo}>{titulo}</h3>
        {descripcion ? <p className={s.capturaDesc}>{descripcion}</p> : null}
      </div>
      {avisos}
      <FieldGrid>{children}</FieldGrid>
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
      <div className={s.capturaPie}>{pie}</div>
    </div>
  );
}

/** Tabla a ras de la tarjeta; sin filas, el vacío con su icono y su explicación. */
function TablaDatos<T>({
  columns,
  rows,
  rowKey,
  ariaLabel,
  density,
  vacio,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  ariaLabel: string;
  density?: "comfortable" | "compact";
  vacio: { icon: ReactNode; title: string; description: string };
}) {
  if (rows.length === 0) {
    return (
      <EmptyState size="compact" tone="neutral" icon={vacio.icon} title={vacio.title} description={vacio.description} />
    );
  }
  return <DataTable flush columns={columns} rows={rows} rowKey={rowKey} ariaLabel={ariaLabel} density={density} />;
}

/** Antigüedad de saldos en cinco cortes (por cobrar o por pagar). */
function AgingCard({ title, subtitle, aging }: { title: string; subtitle: string; aging: any }) {
  const cortes: [string, unknown][] = [
    ["Al corriente", aging?.current],
    ["1–30 días", aging?.d1_30],
    ["31–60 días", aging?.d31_60],
    ["61–90 días", aging?.d61_90],
    ["Más de 90 días", aging?.d90_plus],
  ];
  return (
    <Card className={s.tarjeta}>
      <CardHead title={title} subtitle={subtitle} />
      <div className={s.aging}>
        {cortes.map(([label, val]) => (
          <div key={label} className={s.agingCelda}>
            <span className={s.agingEtiqueta}>{label}</span>
            <span className={s.agingValor}>
              <Money value={Number(val || 0)} compact />
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Columnas de los renglones de un estado de resultados (ingresos o gastos). */
const rubroColumns: Column<{ code: string; name: string; amount: number }>[] = [
  { key: "code", label: "Código", width: 80, render: (r) => <code className={s.codigo}>{r.code}</code> },
  { key: "name", label: "Cuenta", render: (r) => r.name },
  { key: "amount", label: "Importe", numeric: true, render: (r) => <Money value={r.amount} compact bold={false} /> },
];

/** Columnas de cada bloque del balance general (activo, pasivo, capital). */
const saldoColumns: Column<{ code: string; name: string; balance: number }>[] = [
  { key: "code", label: "Código", width: 70, render: (r) => <code className={s.codigo}>{r.code}</code> },
  { key: "name", label: "Cuenta", render: (r) => r.name },
  { key: "balance", label: "Saldo", numeric: true, render: (r) => <Money value={r.balance} compact bold={false} /> },
];

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function AccountingPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpFinanceSectionConfig(user, "accounting"), [user]);
  const token = user?.token ?? "";
  const searchParams = useUrlQuery();
  const highlightId = searchParams.get("highlight");
  const tabParam = searchParams.get("tab") as TabKey | null;

  const [tab, setTab] = useState<TabKey>("polizas");
  useEffect(() => {
    if (tabParam && TABS.some((t) => t.key === tabParam)) setTab(tabParam);
  }, [tabParam]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [financeInsights, setFinanceInsights] = useState<any>(null);
  const [financeInsightsLoading, setFinanceInsightsLoading] = useState(false);

  // ── Pólizas (journal entries) ──────────────────────────────────────
  const [items, setItems] = useState<JournalEntry[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Tope del DTO (`@Max(100)`); tandas de 5 páginas · 100 = 500 pólizas antes de avisar que falta cargar más. */
  const [tandas, setTandas] = useState(1);
  const [parcial, setParcial] = useState<{ cargadas: number; total: number } | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([]);
  const [accountsErr, setAccountsErr] = useState<string | null>(null);

  // ── Catálogo de cuentas ─────────────────────────────────────────────
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsLoadErr, setAccountsLoadErr] = useState<string | null>(null);
  const [accountTypeFilter, setAccountTypeFilter] = useState("");
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState({ ...emptyAccountForm });
  const [accountSaveErr, setAccountSaveErr] = useState<string | null>(null);
  const [accountSaving, setAccountSaving] = useState(false);

  // ── Períodos fiscales ────────────────────────────────────────────────
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [periodsLoadErr, setPeriodsLoadErr] = useState<string | null>(null);
  const [showPeriodForm, setShowPeriodForm] = useState(false);
  const [periodForm, setPeriodForm] = useState({ ...emptyPeriodForm });
  const [periodSaveErr, setPeriodSaveErr] = useState<string | null>(null);
  const [periodSaving, setPeriodSaving] = useState(false);

  // ── Balanza / Resultados / Balance ──────────────────────────────────
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
  const [trialBalancePeriodId, setTrialBalancePeriodId] = useState("");
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialErr, setTrialErr] = useState<string | null>(null);

  const [incomeStatement, setIncomeStatement] = useState<IncomeStatement | null>(null);
  const [incomeFrom, setIncomeFrom] = useState("");
  const [incomeTo, setIncomeTo] = useState("");
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [incomeErr, setIncomeErr] = useState<string | null>(null);

  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetData | null>(null);
  const [balanceAsOf, setBalanceAsOf] = useState("");
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceErr, setBalanceErr] = useState<string | null>(null);

  const [pdfDownloading, setPdfDownloading] = useState(false);

  // ── Cumplimiento SAT: DIOT + Balanza electrónica ────────────────────
  const now = new Date();
  const [diotMonth, setDiotMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth());
  const [diotYear, setDiotYear] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const [diotReport, setDiotReport] = useState<DiotReport | null>(null);
  const [diotLoading, setDiotLoading] = useState(false);
  const [diotCsvDownloading, setDiotCsvDownloading] = useState(false);
  const [agrupadorStatus, setAgrupadorStatus] = useState<SatAgrupadorStatus | null>(null);
  const [agrupadorStatusLoading, setAgrupadorStatusLoading] = useState(false);
  const [balanzaDownloading, setBalanzaDownloading] = useState(false);
  const [catalogoDownloading, setCatalogoDownloading] = useState(false);

  // ── Presupuestos / centros de costo ─────────────────────────────────
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [costCentersLoading, setCostCentersLoading] = useState(false);
  const [costCentersLoadErr, setCostCentersLoadErr] = useState<string | null>(null);
  const [showCostCenterForm, setShowCostCenterForm] = useState(false);
  const [costCenterForm, setCostCenterForm] = useState({ ...emptyCostCenterForm });
  const [costCenterSaveErr, setCostCenterSaveErr] = useState<string | null>(null);
  const [costCenterSaving, setCostCenterSaving] = useState(false);

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetsLoading, setBudgetsLoading] = useState(false);
  const [budgetsLoadErr, setBudgetsLoadErr] = useState<string | null>(null);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ ...emptyBudgetForm });
  const [budgetSaveErr, setBudgetSaveErr] = useState<string | null>(null);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetVsActualCostCenter, setBudgetVsActualCostCenter] = useState("");
  const [budgetVsActualYear, setBudgetVsActualYear] = useState(String(new Date().getFullYear()));
  const [budgetVsActual, setBudgetVsActual] = useState<Budget[]>([]);
  const [budgetVsActualLoading, setBudgetVsActualLoading] = useState(false);
  const [budgetVsActualLoadErr, setBudgetVsActualLoadErr] = useState<string | null>(null);

  // ── Loaders ───────────────────────────────────────────────────────
  const loadAccountOptions = useCallback(async () => {
    if (!token) return;
    setAccountsErr(null);
    try {
      const data = await apiFetch("accounting/accounts?isActive=true", token);
      setAccountOptions(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setAccountOptions([]);
      setAccountsErr(formatApiError(e, "No se pudo cargar el catálogo de cuentas"));
    }
  }, [token]);

  useEffect(() => {
    if (showForm) void loadAccountOptions();
  }, [showForm, loadAccountOptions]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const acumuladas: JournalEntry[] = [];
      let total = 0;
      const PAGINAS_POR_TANDA = 5;
      for (let pagina = 1; pagina <= tandas * PAGINAS_POR_TANDA; pagina += 1) {
        const data = await apiFetch(`accounting/journal-entries?limit=100&page=${pagina}`, token);
        const rows: JournalEntry[] = Array.isArray(data) ? data : (data?.data ?? []);
        acumuladas.push(...rows);
        const informado = Array.isArray(data) ? undefined : data?.meta?.total;
        total = informado ?? acumuladas.length;
        if (rows.length < 100 || acumuladas.length >= total) break;
      }
      setItems(acumuladas);
      setParcial(total > acumuladas.length ? { cargadas: acumuladas.length, total } : null);
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar las pólizas"));
      setItems([]);
      setParcial(null);
    } finally { setLoading(false); }
  }, [token, tandas]);

  useEffect(() => { load(); }, [load]);

  const loadAccounts = useCallback(async () => {
    if (!token) return;
    setAccountsLoading(true);
    setAccountsLoadErr(null);
    try {
      const qs = accountTypeFilter ? `?type=${accountTypeFilter}` : "";
      const data = await apiFetch(`accounting/accounts${qs}`, token);
      setAccounts(Array.isArray(data) ? data : []);
    } catch (e) {
      setAccountsLoadErr(formatApiError(e, "No se pudo cargar el catálogo de cuentas"));
      setAccounts([]);
    } finally {
      setAccountsLoading(false);
    }
  }, [token, accountTypeFilter]);

  const loadPeriods = useCallback(async () => {
    if (!token) return;
    setPeriodsLoading(true);
    setPeriodsLoadErr(null);
    try {
      const data = await apiFetch("accounting/accounts/fiscal-periods", token);
      setPeriods(Array.isArray(data) ? data : []);
    } catch (e) {
      setPeriodsLoadErr(formatApiError(e, "No se pudieron cargar los periodos fiscales"));
      setPeriods([]);
    } finally {
      setPeriodsLoading(false);
    }
  }, [token]);

  const loadTrialBalance = useCallback(async () => {
    if (!token) return;
    setTrialLoading(true);
    setTrialErr(null);
    try {
      const qs = trialBalancePeriodId ? `?periodId=${trialBalancePeriodId}` : "";
      const data = await apiFetch(`accounting/accounts/trial-balance${qs}`, token);
      setTrialBalance(Array.isArray(data) ? data : []);
    } catch (e) {
      setTrialErr(formatApiError(e, "No se pudo generar la balanza"));
      setTrialBalance([]);
    } finally {
      setTrialLoading(false);
    }
  }, [token, trialBalancePeriodId]);

  const loadIncomeStatement = useCallback(async () => {
    if (!token) return;
    setIncomeLoading(true);
    setIncomeErr(null);
    try {
      const qs = new URLSearchParams();
      if (incomeFrom) qs.set("from", incomeFrom);
      if (incomeTo) qs.set("to", incomeTo);
      const data = await apiFetch(`accounting/accounts/income-statement?${qs}`, token);
      setIncomeStatement(data);
    } catch (e) {
      setIncomeErr(formatApiError(e, "No se pudo generar el estado de resultados"));
      setIncomeStatement(null);
    } finally {
      setIncomeLoading(false);
    }
  }, [token, incomeFrom, incomeTo]);

  const loadBalanceSheet = useCallback(async () => {
    if (!token) return;
    setBalanceLoading(true);
    setBalanceErr(null);
    try {
      const qs = balanceAsOf ? `?asOf=${balanceAsOf}` : "";
      const data = await apiFetch(`accounting/accounts/balance-sheet${qs}`, token);
      setBalanceSheet(data);
    } catch (e) {
      setBalanceErr(formatApiError(e, "No se pudo generar el balance general"));
      setBalanceSheet(null);
    } finally {
      setBalanceLoading(false);
    }
  }, [token, balanceAsOf]);

  const loadCostCenters = useCallback(async () => {
    if (!token) return;
    setCostCentersLoading(true);
    setCostCentersLoadErr(null);
    try {
      const data = await apiFetch("accounting/accounts/cost-centers", token);
      setCostCenters(Array.isArray(data) ? data : []);
    } catch (e) {
      setCostCentersLoadErr(formatApiError(e, "No se pudieron cargar los centros de costo"));
      setCostCenters([]);
    } finally {
      setCostCentersLoading(false);
    }
  }, [token]);

  const loadBudgets = useCallback(async () => {
    if (!token) return;
    setBudgetsLoading(true);
    setBudgetsLoadErr(null);
    try {
      const data = await apiFetch("accounting/budgets", token);
      setBudgets(Array.isArray(data) ? data : []);
    } catch (e) {
      setBudgetsLoadErr(formatApiError(e, "No se pudieron cargar los presupuestos"));
      setBudgets([]);
    } finally {
      setBudgetsLoading(false);
    }
  }, [token]);

  const loadBudgetVsActual = useCallback(async () => {
    if (!token || !budgetVsActualCostCenter || !budgetVsActualYear) {
      setBudgetVsActual([]);
      return;
    }
    setBudgetVsActualLoading(true);
    setBudgetVsActualLoadErr(null);
    try {
      const data = await apiFetch(
        `accounting/budgets/vs-actual?costCenterId=${budgetVsActualCostCenter}&year=${budgetVsActualYear}`,
        token,
      );
      setBudgetVsActual(Array.isArray(data) ? data : []);
    } catch (e) {
      setBudgetVsActualLoadErr(formatApiError(e, "No se pudo comparar el presupuesto contra lo real"));
      setBudgetVsActual([]);
    } finally {
      setBudgetVsActualLoading(false);
    }
  }, [token, budgetVsActualCostCenter, budgetVsActualYear]);

  const loadAgrupadorStatus = useCallback(async () => {
    if (!token) return;
    setAgrupadorStatusLoading(true);
    try {
      setAgrupadorStatus(await apiFetch("accounting/accounts/compliance/sat-agrupador-status", token));
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cargar el estado de mapeo SAT"));
      setAgrupadorStatus(null);
    } finally {
      setAgrupadorStatusLoading(false);
    }
  }, [token]);

  const loadDiotReport = useCallback(async () => {
    if (!token) return;
    setDiotLoading(true);
    try {
      setDiotReport(await apiFetch(`accounting/accounts/compliance/diot?month=${diotMonth}&year=${diotYear}`, token));
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo generar el reporte DIOT"));
      setDiotReport(null);
    } finally {
      setDiotLoading(false);
    }
  }, [token, diotMonth, diotYear]);

  const downloadDiotCsv = async () => {
    if (!token) return;
    setDiotCsvDownloading(true);
    try {
      const res = await fetch(buildApiUrl(`accounting/accounts/compliance/diot/csv?month=${diotMonth}&year=${diotYear}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Error al generar el CSV"));
      saveBlob(await res.blob(), `diot-${diotYear}-${String(diotMonth).padStart(2, "0")}.csv`);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo descargar el DIOT"));
    } finally {
      setDiotCsvDownloading(false);
    }
  };

  const downloadBalanzaXml = async () => {
    if (!token) return;
    setBalanzaDownloading(true);
    try {
      const res = await fetch(buildApiUrl(`accounting/accounts/compliance/balanza-xml?month=${diotMonth}&year=${diotYear}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Error al generar la Balanza"));
      saveBlob(await res.blob(), `balanza-${diotYear}-${String(diotMonth).padStart(2, "0")}.xml`);
      toast.success("Balanza XML generada.");
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo generar la Balanza XML"));
    } finally {
      setBalanzaDownloading(false);
    }
  };

  const downloadCatalogoCuentasXml = async () => {
    if (!token) return;
    setCatalogoDownloading(true);
    try {
      const res = await fetch(buildApiUrl("accounting/accounts/compliance/catalogo-cuentas-xml"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Error al generar el Catálogo de cuentas"));
      saveBlob(await res.blob(), `catalogo-cuentas-${todayStamp()}.xml`);
      toast.success("Catálogo de cuentas XML generado.");
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo generar el Catálogo de cuentas"));
    } finally {
      setCatalogoDownloading(false);
    }
  };

  useEffect(() => {
    if (tab === "inteligencia" && token) {
      setFinanceInsightsLoading(true);
      void apiFetch("accounting/invoices/insights", token)
        .then(setFinanceInsights)
        .catch(() => setFinanceInsights(null))
        .finally(() => setFinanceInsightsLoading(false));
    }
  }, [tab, token]);

  useEffect(() => {
    if (tab === "cuentas" || tab === "presupuestos") void loadAccounts();
  }, [tab, loadAccounts]);

  useEffect(() => {
    if (tab === "cuentas") void loadPeriods();
  }, [tab, loadPeriods]);

  useEffect(() => {
    if (tab === "balanza") void loadTrialBalance();
  }, [tab, loadTrialBalance]);

  useEffect(() => {
    if (tab === "resultados") void loadIncomeStatement();
  }, [tab, loadIncomeStatement]);

  useEffect(() => {
    if (tab === "balance") void loadBalanceSheet();
  }, [tab, loadBalanceSheet]);

  useEffect(() => {
    if (tab === "presupuestos") {
      void loadCostCenters();
      void loadBudgets();
      void loadPeriods();
    }
  }, [tab, loadCostCenters, loadBudgets, loadPeriods]);

  useEffect(() => {
    if (tab === "cumplimiento_sat") {
      void loadAgrupadorStatus();
      void loadAccounts();
      void loadDiotReport();
    }
  }, [tab, loadAgrupadorStatus, loadAccounts, loadDiotReport]);

  useEffect(() => {
    if (tab === "cumplimiento_sat") void loadDiotReport();
  }, [diotMonth, diotYear]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === "presupuestos") void loadBudgetVsActual();
  }, [tab, loadBudgetVsActual]);

  // Periods are needed for the trial-balance period selector even before visiting "cuentas".
  useEffect(() => {
    if (tab === "balanza" && periods.length === 0) void loadPeriods();
  }, [tab, periods.length, loadPeriods]);

  // ── Pólizas actions ───────────────────────────────────────────────
  const save = async () => {
    if (!token || !form.description.trim()) {
      setSaveErr("El concepto es obligatorio.");
      return;
    }
    if (!form.debitAccountId || !form.creditAccountId) {
      setSaveErr("Selecciona cuenta de cargo y abono.");
      return;
    }
    if (form.debitAccountId === form.creditAccountId) {
      setSaveErr("Las cuentas de cargo y abono deben ser distintas.");
      return;
    }
    if (!form.amount || form.amount <= 0) {
      setSaveErr("El importe debe ser mayor a cero.");
      return;
    }
    setSaving(true);
    setSaveErr(null);
    try {
      const amount = Number(form.amount);
      const created = await apiFetch("accounting/journal-entries", token, {
        method: "POST",
        body: JSON.stringify({
          date: form.date,
          description: form.description.trim(),
          reference: form.reference.trim() || undefined,
          lines: [
            {
              debitAccountId: Number(form.debitAccountId),
              creditAccountId: Number(form.creditAccountId),
              description: form.description.trim(),
              debit: amount,
              credit: 0,
            },
            {
              debitAccountId: Number(form.creditAccountId),
              creditAccountId: Number(form.debitAccountId),
              description: form.description.trim(),
              debit: 0,
              credit: amount,
            },
          ],
        }),
      });
      setItems(prev => [created, ...prev]);
      setShowForm(false);
      setForm({ ...emptyForm });
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo crear la póliza"));
    } finally {
      setSaving(false);
    }
  };

  const postEntry = (id: number) => {
    if (!token) return;
    setConfirmState({
      title: "Contabilizar póliza",
      message: "¿Contabilizar esta póliza? Actualizará saldos de cuentas y no podrá editarse.",
      confirmLabel: "Contabilizar",
      danger: false,
      fn: async () => {
        try {
          const updated = await apiFetch(`accounting/journal-entries/${id}/post`, token, { method: "PATCH" });
          setItems((prev) => prev.map((e) => (e.id === id ? { ...e, ...updated } : e)));
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo contabilizar"));
        }
      },
    });
  };

  const reverseEntry = async (id: number) => {
    if (!token) return;
    setConfirmState({
      title: "Reversar póliza",
      message: "¿Reversar esta póliza? Se generará una contrapóliza con los mismos importes en sentido contrario.",
      confirmLabel: "Reversar",
      danger: true,
      fn: async () => {
    try {
      const updated = await apiFetch(`accounting/journal-entries/${id}/reverse`, token, { method: "POST" });
      setItems(prev => prev.map(e => e.id === id ? { ...e, ...updated } : e));
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo reversar"));
    }
  } });
  };

  // ── Catálogo de cuentas actions ──────────────────────────────────────
  const [seedBaseBusy, setSeedBaseBusy] = useState(false);

  const seedBaseCatalog = async () => {
    if (!token || seedBaseBusy) return;
    setSeedBaseBusy(true);
    try {
      const result = await apiFetch("accounting/accounts/seed-base", token, { method: "POST" });
      const created = Number(result?.created ?? 0);
      const skipped = Number(result?.skipped ?? 0);
      toast.success(
        created > 0
          ? `Catálogo base: ${created} cuentas nuevas${skipped ? ` (${skipped} ya existían)` : ""}.`
          : skipped
            ? `El catálogo base ya estaba cargado (${skipped} cuentas).`
            : "No se agregó ninguna cuenta.",
      );
      void loadAccounts();
      void loadAccountOptions();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cargar el catálogo base"));
    } finally {
      setSeedBaseBusy(false);
    }
  };

  const saveAccount = async () => {
    if (!token || !accountForm.code.trim() || !accountForm.name.trim()) {
      setAccountSaveErr("Código y nombre son obligatorios.");
      return;
    }
    setAccountSaving(true);
    setAccountSaveErr(null);
    try {
      const created = await apiFetch("accounting/accounts", token, {
        method: "POST",
        body: JSON.stringify({
          code: accountForm.code.trim(),
          name: accountForm.name.trim(),
          type: accountForm.type,
          parentId: accountForm.parentId ? Number(accountForm.parentId) : undefined,
          description: accountForm.description.trim() || undefined,
        }),
      });
      setAccounts(prev => [...prev, created].sort((a, b) => a.code.localeCompare(b.code)));
      setShowAccountForm(false);
      setAccountForm({ ...emptyAccountForm });
      void loadAccountOptions();
    } catch (e) {
      setAccountSaveErr(formatApiError(e, "No se pudo crear la cuenta"));
    } finally {
      setAccountSaving(false);
    }
  };

  const toggleAccountActive = async (account: Account) => {
    if (!token) return;
    try {
      const updated = await apiFetch(`accounting/accounts/${account.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !account.isActive }),
      });
      setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, ...updated } : a));
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo actualizar la cuenta"));
    }
  };

  // ── Períodos fiscales actions ────────────────────────────────────────
  const savePeriod = async () => {
    if (!token || !periodForm.name.trim() || !periodForm.startDate || !periodForm.endDate) {
      setPeriodSaveErr("Nombre, fecha de inicio y fecha de fin son obligatorios.");
      return;
    }
    if (periodForm.endDate < periodForm.startDate) {
      setPeriodSaveErr("La fecha de fin no puede ser anterior al inicio.");
      return;
    }
    setPeriodSaving(true);
    setPeriodSaveErr(null);
    try {
      const created = await apiFetch("accounting/accounts/fiscal-periods", token, {
        method: "POST",
        body: JSON.stringify(periodForm),
      });
      setPeriods(prev => [created, ...prev]);
      setShowPeriodForm(false);
      setPeriodForm({ ...emptyPeriodForm });
    } catch (e) {
      setPeriodSaveErr(formatApiError(e, "No se pudo crear el periodo"));
    } finally {
      setPeriodSaving(false);
    }
  };

  const closePeriod = (period: FiscalPeriod) => {
    const dest = "/erp/contabilidad/cierres";
    setConfirmState({
      title: "Cierre con lista de verificación",
      message: `El periodo "${period.name}" se cierra desde Cierres de periodo, con checklist antes de bloquear pólizas. Ruta: ${dest}`,
      confirmLabel: "Ir a cierres",
      danger: false,
      fn: () => {
        window.location.assign(dest);
      },
    });
  };

  const reopenPeriod = (period: FiscalPeriod) => {
    setConfirmState({
      message: `¿Reabrir el periodo "${period.name}"? Se podrán volver a postear asientos en este rango.`,
      confirmLabel: "Reabrir periodo",
      fn: async () => {
        try {
          const updated = await apiFetch(`accounting/accounts/fiscal-periods/${period.id}/reopen`, token, { method: "PATCH" });
          setPeriods(prev => prev.map(p => p.id === period.id ? { ...p, ...updated } : p));
          toast.success(`Periodo "${period.name}" reabierto.`);
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo reabrir el periodo"));
        }
      },
    });
  };

  // ── Reportes: PDF ─────────────────────────────────────────────────
  const downloadFinancialPdf = async () => {
    if (!token) return;
    setPdfDownloading(true);
    try {
      const qs = new URLSearchParams();
      if (incomeFrom) qs.set("fromDate", incomeFrom);
      if (incomeTo) qs.set("toDate", incomeTo);
      if (balanceAsOf) qs.set("asOfDate", balanceAsOf);
      const res = await fetch(buildApiUrl(`accounting/accounts/reports/pdf?${qs}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Error al generar el PDF"));
      saveBlob(await res.blob(), `reportes-financieros-${todayStamp()}.pdf`);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo generar el PDF"));
    } finally {
      setPdfDownloading(false);
    }
  };

  const saveAccountAgrupador = async (account: Account, value: string) => {
    if (!token) return;
    const trimmed = value.trim();
    if ((account.satAgrupador ?? "") === trimmed) return;
    try {
      await apiFetch(`accounting/accounts/${account.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ satAgrupador: trimmed || null }),
      });
      setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, satAgrupador: trimmed || null } : a));
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo guardar el agrupador SAT"));
    }
  };

  // ── Presupuestos actions ─────────────────────────────────────────────
  const saveCostCenter = async () => {
    if (!token || !costCenterForm.code.trim() || !costCenterForm.name.trim()) {
      setCostCenterSaveErr("Código y nombre son obligatorios.");
      return;
    }
    setCostCenterSaving(true);
    setCostCenterSaveErr(null);
    try {
      const created = await apiFetch("accounting/accounts/cost-centers", token, {
        method: "POST",
        body: JSON.stringify({
          code: costCenterForm.code.trim(),
          name: costCenterForm.name.trim(),
          defaultAccountId: costCenterForm.defaultAccountId ? Number(costCenterForm.defaultAccountId) : undefined,
        }),
      });
      setCostCenters(prev => [...prev, created].sort((a, b) => a.code.localeCompare(b.code)));
      setShowCostCenterForm(false);
      setCostCenterForm({ ...emptyCostCenterForm });
    } catch (e) {
      setCostCenterSaveErr(formatApiError(e, "No se pudo crear el centro de costo"));
    } finally {
      setCostCenterSaving(false);
    }
  };

  const saveBudget = async () => {
    if (!token || !budgetForm.name.trim() || !budgetForm.costCenterId || !budgetForm.plannedAmount) {
      setBudgetSaveErr("Nombre, centro de costo e importe planeado son obligatorios.");
      return;
    }
    setBudgetSaving(true);
    setBudgetSaveErr(null);
    try {
      const created = await apiFetch("accounting/budgets", token, {
        method: "POST",
        body: JSON.stringify({
          name: budgetForm.name.trim(),
          costCenterId: Number(budgetForm.costCenterId),
          year: Number(budgetForm.year),
          month: budgetForm.month ? Number(budgetForm.month) : undefined,
          plannedAmount: Number(budgetForm.plannedAmount),
          notes: budgetForm.notes.trim() || undefined,
        }),
      });
      setBudgets(prev => [created, ...prev]);
      setShowBudgetForm(false);
      setBudgetForm({ ...emptyBudgetForm, year: new Date().getFullYear() });
    } catch (e) {
      setBudgetSaveErr(formatApiError(e, "No se pudo crear el presupuesto"));
    } finally {
      setBudgetSaving(false);
    }
  };

  // ── Pólizas derived data ──────────────────────────────────────────
  const ingresos = items.filter(e => e.type === "INGRESOS").reduce((s, e) => s + (e.totalCredit ?? 0), 0);
  const egresos = items.filter(e => e.type === "EGRESOS").reduce((s, e) => s + (e.totalDebit ?? 0), 0);
  const borradores = items.filter(e => e.status === "DRAFT" || e.status === "BORRADOR").length;

  /**
   * Estado de la póliza. Contabilizada es el final normal del flujo, así que
   * va en neutro; el color se guarda para lo que pide acción (borrador) o
   * para lo que salió mal (reversada).
   */
  const entryStatus = (s?: string): { label: string; tone: Tone } => {
    if (s === "POSTED" || s === "CONTABILIZADA") return { label: "Contabilizada", tone: "neutral" };
    if (s === "REVERSED") return { label: "Reversada", tone: "danger" };
    return { label: "Borrador", tone: "warning" };
  };

  /** Diferencia entre cargos y abonos de una póliza. Cero = cuadra. */
  const entryImbalance = (e: JournalEntry) => (e.totalDebit ?? 0) - (e.totalCredit ?? 0);

  const deferredSearchQ = useDeferredValue(searchQ);
  const visibleItems = useMemo(() => {
    let rows = items;
    if (deferredSearchQ.trim()) {
      const q = deferredSearchQ.trim().toLowerCase();
      rows = rows.filter((e) =>
        (e.description ?? "").toLowerCase().includes(q) ||
        (e.reference ?? "").toLowerCase().includes(q) ||
        (e.createdBy?.nombre ?? "").toLowerCase().includes(q)
      );
    }
    if (filterTipo) rows = rows.filter((e) => e.type === filterTipo);
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) rows = [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    return rows;
  }, [items, highlightId, deferredSearchQ, filterTipo]);

  const journalColumns: Column<JournalEntry>[] = [
    {
      key: "description", label: "Concepto",
      render: e => {
        const desc = e.createdBy?.nombre ? `${tipoLabel(e.type)} · ${e.createdBy.nombre}` : tipoLabel(e.type);
        return (
          <div className={s.celdaDoble}>
            <span className={s.principal}>{e.description ?? "—"}</span>
            <span className={s.sub}>
              <code className={s.codigo}>{e.reference ?? `P-${e.id}`}</code>
              {desc ? ` · ${desc}` : ""}
            </span>
          </div>
        );
      },
    },
    {
      key: "totalDebit", label: "Cargo", numeric: true, width: 130,
      render: e => e.totalDebit ? <Money value={e.totalDebit} bold={false} /> : <span className={s.tenue}>—</span>,
    },
    {
      key: "totalCredit", label: "Abono", numeric: true, width: 130,
      render: e => e.totalCredit ? <Money value={e.totalCredit} bold={false} /> : <span className={s.tenue}>—</span>,
    },
    {
      key: "date", label: "Fecha",
      render: (e) => {
        if (!e.date) return <span className={s.tenue}>—</span>;
        const isDraft = e.status === "DRAFT" || e.status === "BORRADOR";
        const days = Math.floor((Date.now() - (aFechaLocal(e.date)?.getTime() ?? Date.now())) / 86400000);
        const tonoDias = days >= 14 ? s.diasPeligro : days >= 7 ? s.diasAviso : "";
        return (
          <div className={s.fechaCelda}>
            <span className={s.fechaTexto}>
              {formatoFechaLocal(e.date, { day: "2-digit", month: "short", year: "2-digit" })}
            </span>
            {isDraft && days > 0 && (
              <span className={`${s.diasSin} ${tonoDias}`}>
                {days === 1 ? "1 día" : `${days} días`} sin contabilizar
              </span>
            )}
          </div>
        );
      },
      width: 120,
    },
    {
      key: "status", label: "Estado", width: 190,
      render: e => {
        const st = entryStatus(e.status);
        const imbalance = entryImbalance(e);
        const descuadrada = Math.abs(imbalance) >= 0.01;
        return (
          <div className={s.estadoCelda}>
            <Badge dot size="sm" tone={st.tone}>{st.label}</Badge>
            {descuadrada && (
              <Badge dot size="sm" tone="danger" title="Los cargos y los abonos de esta póliza no suman lo mismo">
                {`Descuadre ${Math.abs(imbalance).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 })}`}
              </Badge>
            )}
          </div>
        );
      },
    },
    ...(cfg.canApprove || cfg.canDelete ? [{
      key: "acciones" as keyof JournalEntry, label: "", width: 130,
      render: (e: JournalEntry) => (
        <div className={s.acciones}>
          {(e.status === "DRAFT" || e.status === "BORRADOR") && cfg.canApprove && (
            <Button size="sm" variant="secondary" onClick={(ev) => { ev.stopPropagation(); postEntry(e.id); }}>Contabilizar</Button>
          )}
          {(e.status === "POSTED" || e.status === "CONTABILIZADA") && cfg.canDelete && (
            <Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); void reverseEntry(e.id); }}>Reversar</Button>
          )}
        </div>
      ),
    }] : []),
  ];

  /** Totales del libro visible: lo que va al pie de la tabla de pólizas. */
  const journalTotals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    let descuadradas = 0;
    for (const e of visibleItems) {
      debit += e.totalDebit ?? 0;
      credit += e.totalCredit ?? 0;
      if (Math.abs((e.totalDebit ?? 0) - (e.totalCredit ?? 0)) >= 0.01) descuadradas += 1;
    }
    return { debit, credit, diff: debit - credit, descuadradas };
  }, [visibleItems]);

  // ── Catálogo de cuentas columns ───────────────────────────────────
  const accountColumns: Column<Account>[] = [
    { key: "code", label: "Código", render: a => <code className={s.codigo}>{a.code}</code>, width: 100 },
    { key: "name", label: "Nombre", render: a => (
      <div className={s.celdaDoble}>
        <span className={s.principal}>{a.name}</span>
        <span className={s.sub}>
          {ACCOUNT_TYPE_LABEL[a.type] ?? a.type}
          {a.parent ? ` · bajo ${a.parent.code} ${a.parent.name}` : ""}
        </span>
      </div>
    ) },
    { key: "balance", label: "Saldo", render: a => <Money value={a.balance} compact bold={false} />, width: 130, numeric: true },
    { key: "satAgrupador", label: "Agrupador SAT", width: 160, render: a => (
      cfg.canEdit ? (
        <Input
          className={s.agrupador}
          data-vacio={a.satAgrupador ? undefined : "true"}
          controlSize="sm"
          defaultValue={a.satAgrupador ?? ""}
          placeholder="Ej. 101.01"
          aria-label={`Agrupador SAT de la cuenta ${a.code}`}
          onBlur={e => void saveAccountAgrupador(a, e.target.value)}
          inputMode="decimal"
        />
      ) : (
        a.satAgrupador
          ? <span className={s.cifra}>{a.satAgrupador}</span>
          : <Badge dot size="sm" tone="warning" title="La balanza electrónica exige el código del catálogo SAT">Sin mapear</Badge>
      )
    ) },
    { key: "isActive", label: "Estado", width: 240, render: a => (
      <div className={s.estadoFila}>
        <Badge dot size="sm" tone="neutral">{a.isActive ? "Activa" : "Inactiva"}</Badge>
        {cfg.canEdit && (
          <Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); void toggleAccountActive(a); }}>
            {a.isActive ? "Desactivar" : "Reactivar"}
          </Button>
        )}
      </div>
    ) },
  ];

  const visibleAccounts = useMemo(() => [...accounts].sort((a, b) => a.code.localeCompare(b.code)), [accounts]);

  const periodColumns: Column<FiscalPeriod>[] = [
    { key: "name", label: "Periodo", render: p => <strong className={s.principal}>{p.name}</strong> },
    { key: "range", label: "Rango", render: p => (
      <span className={s.fechasCelda}>
        {formatoFechaLocal(p.startDate)} — {formatoFechaLocal(p.endDate)}
      </span>
    ) },
    { key: "isClosed", label: "Estado", width: 220, render: p => (
      <div className={s.estadoFila}>
        <Badge
          dot
          size="sm"
          tone="neutral"
          title={p.isClosed ? "No admite pólizas nuevas dentro del rango" : "Admite pólizas dentro del rango"}
        >
          {p.isClosed ? "Cerrado" : "Abierto"}
        </Badge>
        {!p.isClosed && cfg.canApprove && (
          <Button size="sm" variant="secondary" onClick={(ev) => { ev.stopPropagation(); closePeriod(p); }}>Cerrar</Button>
        )}
        {p.isClosed && cfg.canApprove && (
          <Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); reopenPeriod(p); }}>Reabrir</Button>
        )}
      </div>
    ) },
  ];

  // ── Trial balance derived ───────────────────────────────────────
  const trialTotals = useMemo(() => {
    const debit = trialBalance.reduce((s, r) => s + r.debit, 0);
    const credit = trialBalance.reduce((s, r) => s + r.credit, 0);
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.01 };
  }, [trialBalance]);

  const trialColumns: Column<TrialBalanceRow>[] = [
    { key: "code", label: "Código", render: r => <code className={s.codigo}>{r.code}</code>, width: 100 },
    { key: "name", label: "Cuenta", render: r => (
      <div className={s.celdaDoble}>
        <span className={s.principal}>{r.name}</span>
        <span className={s.sub}>{ACCOUNT_TYPE_LABEL[r.type as Account["type"]] ?? r.type}</span>
      </div>
    ) },
    { key: "debit", label: "Debe", render: r => <Money value={r.debit} compact bold={false} />, width: 130, numeric: true },
    { key: "credit", label: "Haber", render: r => <Money value={r.credit} compact bold={false} />, width: 130, numeric: true },
  ];

  // ── Cost center / budget columns ──────────────────────────────────
  const costCenterColumns: Column<CostCenter>[] = [
    { key: "code", label: "Código", render: c => <code className={s.codigo}>{c.code}</code>, width: 100 },
    { key: "name", label: "Nombre", render: c => (
      <div className={s.celdaDoble}>
        <span className={s.principal}>{c.name}</span>
        <span className={s.sub}>
          {c.defaultAccount ? `Cuenta por defecto ${c.defaultAccount.code} · ${c.defaultAccount.name}` : "Sin cuenta por defecto"}
        </span>
      </div>
    ) },
    { key: "isActive", label: "Estado", width: 140, render: c => <Badge dot size="sm" tone="neutral">{c.isActive ? "Activo" : "Inactivo"}</Badge> },
  ];

  const budgetColumns: Column<Budget>[] = [
    { key: "name", label: "Presupuesto", render: b => (
      <div className={s.celdaDoble}>
        <span className={s.principal}>{b.name}</span>
        <span className={s.sub}>
          {b.costCenter?.code} · {b.costCenter?.name} · {b.month ? `${b.month}/${b.year}` : b.year}
        </span>
      </div>
    ) },
    { key: "plannedAmount", label: "Planeado", render: b => <Money value={b.plannedAmount} compact bold={false} />, width: 130, numeric: true },
    { key: "actualAmount", label: "Real", render: b => <Money value={b.actualAmount} compact bold={false} />, width: 130, numeric: true },
    { key: "variance", label: "Variación", width: 150, numeric: true, render: b => {
      const variance = b.plannedAmount - b.actualAmount;
      const over = variance < 0;
      return (
        <span
          className={over ? s.varPeligro : s.varNormal}
          title={over ? "Gastado por encima de lo planeado" : "Dentro de lo planeado"}
        >
          {over ? "+" : "−"}<Money value={Math.abs(variance)} compact bold={false} />
        </span>
      );
    } },
  ];

  /** Presupuesto contra lo real de un centro de costo: la misma tabla, en compacto. */
  const vsRealColumns: Column<Budget>[] = [
    {
      key: "name", label: "Presupuesto",
      render: (b) => (
        <div className={s.celdaDoble}>
          <span className={s.principal}>{b.name}</span>
          <span className={s.sub}>
            {b.month ? `Mes ${b.month} de ${b.year}` : `Ejercicio ${b.year}`}
          </span>
        </div>
      ),
    },
    { key: "plannedAmount", label: "Planeado", numeric: true, width: 130, render: (b) => <Money value={b.plannedAmount} compact bold={false} /> },
    { key: "actualAmount", label: "Real", numeric: true, width: 130, render: (b) => <Money value={b.actualAmount} compact bold={false} /> },
    {
      key: "left", label: "Diferencia", numeric: true, width: 150,
      render: (b) => {
        const over = b.actualAmount > b.plannedAmount;
        return (
          <span className={over ? s.varPeligro : s.varNormal}>
            {over ? "+" : "−"}<Money value={Math.abs(b.plannedAmount - b.actualAmount)} compact bold={false} />
          </span>
        );
      },
    },
  ];

  /** Proveedores de la DIOT del periodo. */
  const diotColumns: Column<DiotRow>[] = [
    {
      key: "supplierName", label: "Proveedor",
      render: (r) => (
        <div className={s.celdaDoble}>
          <span className={s.principal}>{r.supplierName}</span>
          <span className={s.sub}>
            {r.rfc ? <code className={s.codigo}>{r.rfc}</code> : <span className={s.sinRfc}>sin RFC</span>}
            {` · ${r.invoiceCount} factura${r.invoiceCount === 1 ? "" : "s"}`}
          </span>
        </div>
      ),
    },
    { key: "baseAmount", label: "Base 16%", numeric: true, width: 140, render: (r) => <Money value={r.baseAmount} compact bold={false} /> },
    { key: "ivaAmount", label: "IVA", numeric: true, width: 130, render: (r) => <Money value={r.ivaAmount} compact bold={false} /> },
    { key: "totalAmount", label: "Total", numeric: true, width: 140, render: (r) => <Money value={r.totalAmount} compact bold={false} /> },
  ];

  const totalPlanned = useMemo(() => budgetVsActual.reduce((s, b) => s + b.plannedAmount, 0), [budgetVsActual]);
  const totalActual = useMemo(() => budgetVsActual.reduce((s, b) => s + b.actualAmount, 0), [budgetVsActual]);

  const hayFiltros = searchQ.trim().length > 0 || filterTipo !== "";
  const limpiarFiltros = () => {
    setSearchQ("");
    setFilterTipo("");
  };
  /** Con error y sin una sola póliza cargada no hay lista que pintar: el aviso de arriba lo dice. */
  const mostrarLista = !error || items.length > 0;
  const faltanAgrupador = (agrupadorStatus?.missingAccounts.length ?? 0) > 0;

  return (
    <MesaPagina
      titulo="Pólizas y libros"
      descripcion="Asientos, catálogo, balanza y presupuesto."
      terciarias={
        <Button
          variant="ghost"
          iconStart={<PictureAsPdfOutlinedIcon />}
          onClick={() => void downloadFinancialPdf()}
          disabled={pdfDownloading}
        >
          {pdfDownloading ? "Generando…" : "Reporte PDF"}
        </Button>
      }
      primaria={
        tab === "polizas" && cfg.canCreate ? (
          <Button
            variant="primary"
            iconStart={<AddRoundedIcon />}
            onClick={() => { setForm({ ...emptyForm }); setShowForm(true); }}
          >
            Nueva póliza
          </Button>
        ) : null
      }
    >
      {/* Pestañas bajo los chips: la raya de la activa es recta (base la dibuja con radio 0). */}
      <div className={s.pestanas}>
        <Tabs ariaLabel="Secciones de contabilidad" items={TAB_ITEMS} value={tab} onChange={setTab} />
      </div>

      {tab === "inteligencia" && (
        <>
          {financeInsightsLoading ? (
            <Card className={s.tarjeta}>
              <SkeletonRows rows={3} label="Calculando inteligencia financiera…" />
            </Card>
          ) : null}
          {financeInsights ? (
            <>
              {(financeInsights.alerts || []).map((a: any) => (
                <Alert key={a.message} tone="warning" role="alert">
                  {a.message}
                </Alert>
              ))}
              <StatRow variant="strip" ariaLabel="Indicadores financieros">
                <Stat
                  label="En el banco"
                  value={<Money value={financeInsights.kpis?.cashBalance ?? 0} compact />}
                  hint="saldo en bancos"
                  icon={<AccountBalanceOutlinedIcon />}
                  iconTone="neutral"
                />
                <Stat
                  label="Capital de trabajo"
                  value={<Money value={financeInsights.kpis?.workingCapital ?? 0} compact />}
                  hint="activo menos pasivo circulante"
                  icon={<AccountBalanceWalletOutlinedIcon />}
                  iconTone="neutral"
                />
                <Stat
                  label="Tiempo de cobro"
                  value={`${financeInsights.kpis?.dso ?? 0} ${(financeInsights.kpis?.dso ?? 0) === 1 ? "día" : "días"}`}
                  hint="promedio en cobrar"
                  icon={<ScheduleOutlinedIcon />}
                  iconTone="neutral"
                />
                <Stat
                  label="Tiempo de pago"
                  value={`${financeInsights.kpis?.dpo ?? 0} ${(financeInsights.kpis?.dpo ?? 0) === 1 ? "día" : "días"}`}
                  hint="promedio en pagar"
                  icon={<EventOutlinedIcon />}
                  iconTone="neutral"
                />
                <Stat
                  label="Alcance de caja"
                  value={financeInsights.kpis?.runwayMonths != null ? `${financeInsights.kpis.runwayMonths} ${financeInsights.kpis.runwayMonths === 1 ? "mes" : "meses"}` : "∞"}
                  hint="meses de operación cubiertos"
                  tone={financeInsights.kpis?.runwayMonths != null && financeInsights.kpis.runwayMonths < 6 ? "danger" : "default"}
                  icon={<HourglassBottomOutlinedIcon />}
                  iconTone="neutral"
                />
                <Stat
                  label="Vencidas"
                  value={financeInsights.overdueInvoices ?? 0}
                  hint="facturas fuera de plazo"
                  tone={financeInsights.overdueInvoices ? "danger" : "default"}
                  icon={<ReceiptLongOutlinedIcon />}
                  iconTone="neutral"
                />
              </StatRow>
              <AgingCard title="Antigüedad de lo que me deben" subtitle="Cuentas por cobrar, por días de atraso" aging={financeInsights.aging?.ar} />
              <AgingCard title="Antigüedad de lo que debo pagar" subtitle="Cuentas por pagar, por días de atraso" aging={financeInsights.aging?.ap} />
              <Card className={s.tarjeta}>
                <CardHead
                  title="Flujo de efectivo semanal · 90 días"
                  subtitle={`Entró ${Number(financeInsights.cashflow90d?.inflow || 0).toLocaleString("es-MX")} · Salió ${Number(financeInsights.cashflow90d?.outflow || 0).toLocaleString("es-MX")}`}
                />
                <div className={s.flujoCuerpo}>
                  <div className={s.flujo}>
                    {(financeInsights.cashflow90d?.weekly || []).map((w: any) => {
                      const max = Math.max(1, ...(financeInsights.cashflow90d.weekly.map((x: any) => Math.abs(x.net))));
                      const h = Math.max(4, (Math.abs(w.net) / max) * 70);
                      return (
                        <div
                          key={w.weekEnding}
                          title={`${w.weekEnding}: ${w.net}`}
                          className={`${s.barra} ${w.net >= 0 ? s.barraPositiva : s.barraNegativa}`}
                          style={{ height: h }}
                        />
                      );
                    })}
                  </div>
                </div>
              </Card>
            </>
          ) : null}
          {!financeInsightsLoading && !financeInsights ? (
            <Card className={s.tarjeta}>
              <EmptyState
                size="compact"
                tone="neutral"
                icon={<InsightsOutlinedIcon />}
                title="Sin datos de inteligencia financiera."
              />
            </Card>
          ) : null}
        </>
      )}

      {tab === "polizas" && (
        <>
          {error ? (
            <Alert
              tone="warning"
              role="alert"
              action={<Button size="sm" onClick={() => void load()}>Reintentar</Button>}
            >
              {error}
            </Alert>
          ) : null}
          {highlightId ? (
            <Alert tone="info">
              Mostrando póliza <strong>#{highlightId}</strong> desde enlace directo.
            </Alert>
          ) : null}
          {parcial ? (
            <Alert
              tone="info"
              action={
                <Button size="sm" onClick={() => setTandas((n) => n + 1)} disabled={loading}>
                  Cargar más
                </Button>
              }
            >
              Se cargaron las {parcial.cargadas} pólizas más recientes de {parcial.total}. La búsqueda y los filtros solo miran las cargadas.
            </Alert>
          ) : null}

          <StatRow variant="strip" ariaLabel="Resumen del libro diario">
            <Stat
              label="Ingresos registrados"
              value={<Money value={ingresos} compact />}
              hint={`${items.filter(e => e.type === "INGRESOS").length} pólizas de ingreso`}
              icon={<TrendingUpOutlinedIcon />}
              iconTone="neutral"
            />
            <Stat
              label="Egresos registrados"
              value={<Money value={egresos} compact />}
              hint={`${items.filter(e => e.type === "EGRESOS").length} pólizas de egreso`}
              icon={<TrendingDownOutlinedIcon />}
              iconTone="neutral"
            />
            <Stat
              label="Balance neto"
              value={<Money value={ingresos - egresos} compact />}
              hint="ingresos menos egresos"
              tone={ingresos >= egresos ? "default" : "danger"}
              icon={<BalanceOutlinedIcon />}
              iconTone="neutral"
            />
            <Stat
              label="Borradores"
              value={borradores}
              hint="pendientes de contabilizar"
              tone={borradores > 0 ? "warning" : "default"}
              icon={<DraftsOutlinedIcon />}
              iconTone="neutral"
            />
            <Stat
              label="Descuadradas"
              value={journalTotals.descuadradas}
              hint="cargo ≠ abono"
              tone={journalTotals.descuadradas > 0 ? "danger" : "default"}
              icon={<RuleOutlinedIcon />}
              iconTone="neutral"
            />
          </StatRow>

          {showForm && (
            <Card as="div">
              <Captura
                titulo="Nueva póliza"
                descripcion="Asiento de dos partidas: el mismo importe entra al Debe de una cuenta y al Haber de la otra, así la póliza nace cuadrada."
                avisos={
                  accountsErr ? (
                    <Alert
                      tone="warning"
                      role="alert"
                      action={<Button size="sm" onClick={() => void loadAccountOptions()}>Reintentar</Button>}
                    >
                      {accountsErr}
                    </Alert>
                  ) : null
                }
                error={saveErr}
                pie={
                  <>
                    <Button variant="ghost" onClick={() => { setShowForm(false); setSaveErr(null); }}>Cancelar</Button>
                    <Button variant="tonal" onClick={() => void save()} disabled={saving}>{saving ? "Guardando…" : "Crear póliza"}</Button>
                  </>
                }
              >
                <Field label="Concepto / Descripción" fullWidth hint="Qué se está asentando. Aparece en el libro diario y en la balanza.">
                  <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción de la póliza" />
                </Field>
                <Field label="Tipo">
                  <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    {TIPOS.map(t => <option key={t} value={t}>{tipoLabel(t)}</option>)}
                  </Select>
                </Field>
                <Field label="Fecha" hint="Determina en qué periodo fiscal cae la póliza.">
                  <DateInput value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </Field>
                <Field label="Referencia" optional hint="Folio propio para rastrear el documento de respaldo.">
                  <Input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="REF-001" />
                </Field>
                <Field label="Importe" hint="Pesos. El mismo monto se asienta al Debe y al Haber.">
                  <Input type="number" min={0} step="0.01" value={form.amount || ""} onChange={e => setForm(f => ({ ...f, amount: +e.target.value }))} />
                </Field>
                <Field label="Cuenta cargo (Debe)" hint="La que recibe el importe.">
                  <Select value={form.debitAccountId} onChange={e => setForm(f => ({ ...f, debitAccountId: e.target.value }))}>
                    <option value="">— Seleccionar —</option>
                    {accountOptions.map(a => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name ?? `Cuenta ${a.id}`}</option>)}
                  </Select>
                </Field>
                <Field label="Cuenta abono (Haber)" hint="La que entrega el importe. Debe ser distinta a la del cargo.">
                  <Select value={form.creditAccountId} onChange={e => setForm(f => ({ ...f, creditAccountId: e.target.value }))}>
                    <option value="">— Seleccionar —</option>
                    {accountOptions.map(a => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name ?? `Cuenta ${a.id}`}</option>)}
                  </Select>
                </Field>
              </Captura>
            </Card>
          )}

          {mostrarLista ? (
            <ListCard
              className={s.lista}
              listLabel="Pólizas"
              toolbar={
                <ModuleToolbar
                  search={
                    <SearchInput
                      aria-label="Buscar por concepto, referencia o usuario…"
                      placeholder="Buscar por concepto, referencia o usuario…"
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                    />
                  }
                  end={
                    <>
                      {!loading ? (
                        <span className={s.conteo} role="status">
                          {visibleItems.length === 1 ? "1 póliza" : `${visibleItems.length} pólizas`}
                        </span>
                      ) : null}
                      {hayFiltros ? <LinkButton onClick={limpiarFiltros}>Limpiar</LinkButton> : null}
                      {items.length > 0 ? (
                        <Button variant="ghost" size="sm" iconStart={<FileDownloadOutlinedIcon />} onClick={() => exportToExcel(visibleItems, [
                          { key: "reference", label: "Referencia", format: (v, e) => String(v ?? `P-${e.id}`) },
                          { key: "description", label: "Concepto" },
                          { key: "type", label: "Tipo", format: (v) => tipoLabel(v as string | undefined) },
                          { key: "totalDebit", label: "Cargo" },
                          { key: "totalCredit", label: "Abono" },
                          { key: "status", label: "Estado", format: (v) => ENTRY_STATUS_LABEL[String(v ?? "")] ?? String(v ?? "") },
                          { key: "date", label: "Fecha", format: (v) => v ? String(v).slice(0, 10) : "" },
                        ], "polizas-contables")}>Excel</Button>
                      ) : null}
                    </>
                  }
                >
                  <Select aria-label="Tipo" controlSize="sm" wrapperClassName={s.selTipo} value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}>
                    <option value="">Todos · Tipo</option>
                    {TIPOS.map((t) => <option key={t} value={t}>{tipoLabel(t)}</option>)}
                  </Select>
                </ModuleToolbar>
              }
              loading={loading && items.length === 0}
              empty={visibleItems.length === 0}
              emptyState={{
                icon: <LibraryBooksOutlinedIcon />,
                title: "Sin pólizas",
                description: "Registra la primera póliza contable.",
                tone: "neutral",
              }}
              footer={
                visibleItems.length > 0 ? (
                  <TableTotals
                    entries={[
                      { label: "Suma de cargos", value: <Money value={journalTotals.debit} bold={false} /> },
                      { label: "Suma de abonos", value: <Money value={journalTotals.credit} bold={false} /> },
                      {
                        label: "Diferencia",
                        value: <Money value={Math.abs(journalTotals.diff)} bold={false} />,
                        tone: Math.abs(journalTotals.diff) >= 0.01 ? "danger" : "default",
                      },
                    ]}
                  />
                ) : undefined
              }
            >
              <DataTable flush ariaLabel="Pólizas" columns={journalColumns} rows={visibleItems} rowKey={e => e.id} />
            </ListCard>
          ) : null}
        </>
      )}

      {tab === "cuentas" && (
        <>
          <Card className={s.tarjeta}>
            <CardHead
              title="Catálogo de cuentas"
              subtitle="Estructura contable base para pólizas, balanza y estados financieros."
              actions={
                <>
                  <Select aria-label="Filtrar por tipo" controlSize="sm" wrapperClassName={s.selCuenta} value={accountTypeFilter} onChange={e => setAccountTypeFilter(e.target.value)}>
                    <option value="">Todos los tipos</option>
                    {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>)}
                  </Select>
                  {cfg.canCreate && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void seedBaseCatalog()}
                      disabled={seedBaseBusy}
                    >
                      {seedBaseBusy ? "Cargando…" : "Cargar catálogo base"}
                    </Button>
                  )}
                  {cfg.canCreate && (
                    <Button variant="secondary" size="sm" iconStart={<AddRoundedIcon />} onClick={() => { setAccountForm({ ...emptyAccountForm }); setShowAccountForm(true); }}>
                      Nueva cuenta
                    </Button>
                  )}
                </>
              }
            />
            {showAccountForm && (
              <Captura
                anidada
                titulo="Nueva cuenta contable"
                error={accountSaveErr}
                pie={
                  <>
                    <Button variant="ghost" onClick={() => { setShowAccountForm(false); setAccountSaveErr(null); }}>Cancelar</Button>
                    <Button variant="tonal" onClick={() => void saveAccount()} disabled={accountSaving}>{accountSaving ? "Guardando…" : "Crear cuenta"}</Button>
                  </>
                }
              >
                <Field label="Código" hint="Numeración del catálogo. El orden del código ordena la balanza.">
                  <Input value={accountForm.code} onChange={e => setAccountForm(f => ({ ...f, code: e.target.value }))} placeholder="1000" />
                </Field>
                <Field label="Nombre">
                  <Input value={accountForm.name} onChange={e => setAccountForm(f => ({ ...f, name: e.target.value }))} placeholder="Caja y bancos" />
                </Field>
                <Field label="Tipo" hint="Decide si la cuenta suma al balance o al estado de resultados.">
                  <Select value={accountForm.type} onChange={e => setAccountForm(f => ({ ...f, type: e.target.value as Account["type"] }))}>
                    {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>)}
                  </Select>
                </Field>
                <Field label="Cuenta padre" optional hint="Para colgar la cuenta de una de mayor nivel.">
                  <Select value={accountForm.parentId} onChange={e => setAccountForm(f => ({ ...f, parentId: e.target.value }))}>
                    <option value="">— Ninguna —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                  </Select>
                </Field>
                <Field label="Descripción" optional fullWidth hint="Para qué se usa la cuenta; lo lee quien captura la póliza.">
                  <Input value={accountForm.description} onChange={e => setAccountForm(f => ({ ...f, description: e.target.value }))} />
                </Field>
              </Captura>
            )}
            {accountsLoadErr && (
              <Alert
                tone="warning"
                role="alert"
                className={s.avisoDentro}
                action={<Button size="sm" onClick={() => void loadAccounts()}>Reintentar</Button>}
              >
                {accountsLoadErr}
              </Alert>
            )}
            {accountsLoading ? (
              <SkeletonRows rows={5} label="Cargando…" />
            ) : (
              <TablaDatos
                ariaLabel="Catálogo de cuentas"
                columns={accountColumns}
                rows={visibleAccounts}
                rowKey={a => a.id}
                vacio={{ icon: <AccountTreeOutlinedIcon />, title: "Sin cuentas", description: "Da de alta la primera cuenta contable." }}
              />
            )}
          </Card>

          <Card className={s.tarjeta}>
            <CardHead
              title="Períodos fiscales"
              subtitle="Cierre mensual: una vez cerrado, no se pueden contabilizar pólizas dentro del rango."
              actions={cfg.canCreate ? (
                <Button variant="secondary" size="sm" iconStart={<AddRoundedIcon />} onClick={() => { setPeriodForm({ ...emptyPeriodForm }); setShowPeriodForm(true); }}>
                  Nuevo periodo
                </Button>
              ) : undefined}
            />
            {showPeriodForm && (
              <Captura
                anidada
                titulo="Nuevo periodo fiscal"
                error={periodSaveErr}
                pie={
                  <>
                    <Button variant="ghost" onClick={() => { setShowPeriodForm(false); setPeriodSaveErr(null); }}>Cancelar</Button>
                    <Button variant="tonal" onClick={() => void savePeriod()} disabled={periodSaving}>{periodSaving ? "Guardando…" : "Crear periodo"}</Button>
                  </>
                }
              >
                <Field label="Nombre" fullWidth hint="Como se le llama al cierre: «Julio 2026».">
                  <Input value={periodForm.name} onChange={e => setPeriodForm(f => ({ ...f, name: e.target.value }))} placeholder="Julio 2026" />
                </Field>
                <Field label="Fecha de inicio">
                  <DateInput value={periodForm.startDate} onChange={e => setPeriodForm(f => ({ ...f, startDate: e.target.value }))} />
                </Field>
                <Field label="Fecha de fin" hint="Al cerrarlo, ninguna póliza dentro del rango podrá contabilizarse.">
                  <DateInput value={periodForm.endDate} onChange={e => setPeriodForm(f => ({ ...f, endDate: e.target.value }))} />
                </Field>
              </Captura>
            )}
            {periodsLoadErr && (
              <Alert
                tone="danger"
                role="alert"
                className={s.avisoDentro}
                action={<Button size="sm" onClick={() => void loadPeriods()}>Reintentar</Button>}
              >
                {periodsLoadErr}
              </Alert>
            )}
            {periodsLoading ? (
              <SkeletonRows rows={3} label="Cargando…" />
            ) : (
              <TablaDatos
                ariaLabel="Períodos fiscales"
                columns={periodColumns}
                rows={periods}
                rowKey={p => p.id}
                vacio={{ icon: <CalendarMonthOutlinedIcon />, title: "Sin periodos", description: "Crea el primer periodo fiscal para poder cerrarlo al final del mes." }}
              />
            )}
          </Card>
        </>
      )}

      {tab === "balanza" && (
        <>
          <StatRow variant="strip" ariaLabel="Cuadre de la balanza">
            <Stat
              label="Total Debe"
              value={<Money value={trialTotals.debit} compact />}
              hint={`${trialBalance.length} cuentas con movimiento`}
              icon={<CallMadeOutlinedIcon />}
              iconTone="neutral"
            />
            <Stat
              label="Total Haber"
              value={<Money value={trialTotals.credit} compact />}
              hint="suma de abonos"
              icon={<CallReceivedOutlinedIcon />}
              iconTone="neutral"
            />
            <Stat
              label="Cuadre"
              value={trialTotals.balanced ? "Cuadra" : "Descuadrada"}
              hint={
                trialTotals.balanced
                  ? "Debe = Haber"
                  : `diferencia de ${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Math.abs(trialTotals.debit - trialTotals.credit))}`
              }
              tone={trialTotals.balanced ? "default" : "danger"}
              icon={<BalanceOutlinedIcon />}
              iconTone="neutral"
            />
          </StatRow>
          <Card className={s.tarjeta}>
            <CardHead
              title="Balanza de comprobación"
              subtitle="Suma de cargos y abonos por cuenta a partir de pólizas contabilizadas. Debe cuadrar Debe = Haber."
              actions={
                <Select aria-label="Periodo" controlSize="sm" wrapperClassName={s.selPeriodo} value={trialBalancePeriodId} onChange={e => setTrialBalancePeriodId(e.target.value)}>
                  <option value="">Todos los periodos</option>
                  {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              }
            />
            {trialErr && (
              <Alert
                tone="warning"
                role="alert"
                className={s.avisoDentro}
                action={<Button size="sm" onClick={() => void loadTrialBalance()}>Reintentar</Button>}
              >
                {trialErr}
              </Alert>
            )}
            {trialLoading ? (
              <SkeletonRows rows={5} label="Calculando…" />
            ) : (
              <>
                <TablaDatos
                  ariaLabel="Balanza de comprobación"
                  columns={trialColumns}
                  rows={trialBalance}
                  rowKey={r => r.code}
                  vacio={{ icon: <TableChartOutlinedIcon />, title: "Sin movimientos", description: "Contabiliza pólizas para generar la balanza." }}
                />
                {trialBalance.length > 0 && (
                  <TableTotals
                    entries={[
                      { label: "Total Debe", value: <Money value={trialTotals.debit} bold={false} /> },
                      { label: "Total Haber", value: <Money value={trialTotals.credit} bold={false} /> },
                      {
                        label: "Diferencia",
                        value: <Money value={Math.abs(trialTotals.debit - trialTotals.credit)} bold={false} />,
                        tone: trialTotals.balanced ? "default" : "danger",
                      },
                    ]}
                  />
                )}
              </>
            )}
          </Card>
        </>
      )}

      {tab === "resultados" && (
        <>
          {!incomeLoading && incomeStatement ? (
            <StatRow variant="strip" ariaLabel="Resumen del estado de resultados">
              <Stat
                label="Ingresos totales"
                value={<Money value={incomeStatement.totalRevenue} compact />}
                hint={`${incomeStatement.revenue.length} cuentas de ingreso`}
                icon={<TrendingUpOutlinedIcon />}
                iconTone="neutral"
              />
              <Stat
                label="Gastos totales"
                value={<Money value={incomeStatement.totalExpenses} compact />}
                hint={`${incomeStatement.expenses.length} cuentas de gasto`}
                icon={<TrendingDownOutlinedIcon />}
                iconTone="neutral"
              />
              <Stat
                label="Utilidad neta"
                value={<Money value={incomeStatement.netIncome} compact />}
                hint="ingresos menos gastos"
                tone={incomeStatement.netIncome >= 0 ? "default" : "danger"}
                icon={<BalanceOutlinedIcon />}
                iconTone="neutral"
              />
            </StatRow>
          ) : null}
          <Card className={s.tarjeta}>
            <CardHead
              title="Estado de resultados"
              subtitle="Ingresos y gastos contabilizados en el rango seleccionado."
              actions={
                <div className={s.controlesFecha}>
                  <DateInput aria-label="Desde" controlSize="sm" className={s.fecha} value={incomeFrom} onChange={e => setIncomeFrom(e.target.value)} />
                  <span className={s.rotulo}>a</span>
                  <DateInput aria-label="Hasta" controlSize="sm" className={s.fecha} value={incomeTo} onChange={e => setIncomeTo(e.target.value)} />
                </div>
              }
            />
            {incomeErr && (
              <Alert
                tone="warning"
                role="alert"
                className={s.avisoDentro}
                action={<Button size="sm" onClick={() => void loadIncomeStatement()}>Reintentar</Button>}
              >
                {incomeErr}
              </Alert>
            )}
            {incomeLoading ? (
              <SkeletonRows rows={5} label="Calculando…" />
            ) : incomeStatement ? (
              <div className={s.dosColumnas}>
                <section className={s.bloqueTabla} aria-label="Ingresos">
                  <h3 className={s.bloqueTitulo}>Ingresos</h3>
                  <TablaDatos
                    density="compact"
                    ariaLabel="Ingresos"
                    columns={rubroColumns}
                    rows={incomeStatement.revenue}
                    rowKey={(r) => r.code}
                    vacio={{ icon: <TrendingUpOutlinedIcon />, title: "Sin ingresos", description: "No hay cuentas de ingreso en el rango." }}
                  />
                  {incomeStatement.revenue.length > 0 && (
                    <TableTotals entries={[{ label: "Total ingresos", value: <Money value={incomeStatement.totalRevenue} bold={false} /> }]} />
                  )}
                </section>
                <section className={s.bloqueTabla} aria-label="Gastos">
                  <h3 className={s.bloqueTitulo}>Gastos</h3>
                  <TablaDatos
                    density="compact"
                    ariaLabel="Gastos"
                    columns={rubroColumns}
                    rows={incomeStatement.expenses}
                    rowKey={(r) => r.code}
                    vacio={{ icon: <TrendingDownOutlinedIcon />, title: "Sin gastos", description: "No hay cuentas de gasto en el rango." }}
                  />
                  {incomeStatement.expenses.length > 0 && (
                    <TableTotals entries={[{ label: "Total gastos", value: <Money value={incomeStatement.totalExpenses} bold={false} /> }]} />
                  )}
                </section>
              </div>
            ) : null}
          </Card>
        </>
      )}

      {tab === "balance" && (
        <>
          {!balanceLoading && balanceSheet ? (
            <StatRow variant="strip" ariaLabel="Resumen del balance general">
              <Stat
                label="Activo total"
                value={<Money value={balanceSheet.totalAssets} compact />}
                hint={`${balanceSheet.assets.length} cuentas`}
                icon={<AccountBalanceOutlinedIcon />}
                iconTone="neutral"
              />
              <Stat
                label="Pasivo total"
                value={<Money value={balanceSheet.totalLiabilities} compact />}
                hint={`${balanceSheet.liabilities.length} cuentas`}
                icon={<CallMadeOutlinedIcon />}
                iconTone="neutral"
              />
              <Stat
                label="Capital total"
                value={<Money value={balanceSheet.totalEquity} compact />}
                hint={`${balanceSheet.equity.length} cuentas`}
                icon={<AccountBalanceWalletOutlinedIcon />}
                iconTone="neutral"
              />
              <Stat
                label="Cuadre"
                value={balanceSheet.balanceCheck ? "Cuadra" : "Descuadrado"}
                hint="Activo = Pasivo + Capital"
                tone={balanceSheet.balanceCheck ? "default" : "danger"}
                icon={<BalanceOutlinedIcon />}
                iconTone="neutral"
              />
            </StatRow>
          ) : null}
          <Card className={s.tarjeta}>
            <CardHead
              title="Balance general"
              subtitle="Activo, pasivo y capital contabilizados a la fecha de corte. El activo debe ser igual a pasivo más capital."
              actions={
                <div className={s.controlesFecha}>
                  <span className={s.rotulo}>Al</span>
                  <DateInput aria-label="Fecha de corte" controlSize="sm" className={s.fecha} value={balanceAsOf} onChange={e => setBalanceAsOf(e.target.value)} />
                </div>
              }
            />
            {balanceErr && (
              <Alert
                tone="warning"
                role="alert"
                className={s.avisoDentro}
                action={<Button size="sm" onClick={() => void loadBalanceSheet()}>Reintentar</Button>}
              >
                {balanceErr}
              </Alert>
            )}
            {balanceLoading ? (
              <SkeletonRows rows={5} label="Calculando…" />
            ) : balanceSheet ? (
              <div className={s.tresColumnas}>
                {[
                  { label: "Activo", rows: balanceSheet.assets, total: balanceSheet.totalAssets },
                  { label: "Pasivo", rows: balanceSheet.liabilities, total: balanceSheet.totalLiabilities },
                  { label: "Capital", rows: balanceSheet.equity, total: balanceSheet.totalEquity },
                ].map(({ label: l, rows, total }) => (
                  <section key={l} className={s.bloqueTabla} aria-label={l}>
                    <h3 className={s.bloqueTitulo}>{l}</h3>
                    <TablaDatos
                      density="compact"
                      ariaLabel={l}
                      columns={saldoColumns}
                      rows={rows}
                      rowKey={(r) => r.code}
                      vacio={{ icon: <AccountTreeOutlinedIcon />, title: "Sin cuentas", description: `No hay cuentas de ${l.toLowerCase()} con movimientos.` }}
                    />
                    {rows.length > 0 && (
                      <TableTotals entries={[{ label: `Total ${l.toLowerCase()}`, value: <Money value={total} bold={false} /> }]} />
                    )}
                  </section>
                ))}
              </div>
            ) : null}
          </Card>
        </>
      )}

      {tab === "presupuestos" && (
        <>
          <Card className={s.tarjeta}>
            <CardHead
              title="Centros de costo"
              subtitle="Agrupan gastos por área o departamento para el control presupuestal."
              actions={cfg.canCreate ? (
                <Button variant="secondary" size="sm" iconStart={<AddRoundedIcon />} onClick={() => { setCostCenterForm({ ...emptyCostCenterForm }); setShowCostCenterForm(true); }}>
                  Nuevo centro de costo
                </Button>
              ) : undefined}
            />
            {showCostCenterForm && (
              <Captura
                anidada
                titulo="Nuevo centro de costo"
                error={costCenterSaveErr}
                pie={
                  <>
                    <Button variant="ghost" onClick={() => { setShowCostCenterForm(false); setCostCenterSaveErr(null); }}>Cancelar</Button>
                    <Button variant="tonal" onClick={() => void saveCostCenter()} disabled={costCenterSaving}>{costCenterSaving ? "Guardando…" : "Crear"}</Button>
                  </>
                }
              >
                <Field label="Código" hint="Clave corta para identificar el área en reportes.">
                  <Input value={costCenterForm.code} onChange={e => setCostCenterForm(f => ({ ...f, code: e.target.value }))} placeholder="CC-OPS" />
                </Field>
                <Field label="Nombre">
                  <Input value={costCenterForm.name} onChange={e => setCostCenterForm(f => ({ ...f, name: e.target.value }))} placeholder="Operaciones" />
                </Field>
                <Field label="Cuenta contable por defecto" optional fullWidth hint="Solo cuentas de gasto. Se sugiere al presupuestar el área.">
                  <Select value={costCenterForm.defaultAccountId} onChange={e => setCostCenterForm(f => ({ ...f, defaultAccountId: e.target.value }))}>
                    <option value="">— Ninguna —</option>
                    {accounts.filter(a => a.type === "EXPENSE").map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                  </Select>
                </Field>
              </Captura>
            )}
            {costCentersLoadErr && (
              <Alert
                tone="danger"
                role="alert"
                className={s.avisoDentro}
                action={<Button size="sm" onClick={() => void loadCostCenters()}>Reintentar</Button>}
              >
                {costCentersLoadErr}
              </Alert>
            )}
            {costCentersLoading ? (
              <SkeletonRows rows={3} label="Cargando…" />
            ) : (
              <TablaDatos
                ariaLabel="Centros de costo"
                columns={costCenterColumns}
                rows={costCenters}
                rowKey={c => c.id}
                vacio={{ icon: <CategoryOutlinedIcon />, title: "Sin centros de costo", description: "Crea el primer centro de costo para presupuestar por área." }}
              />
            )}
          </Card>

          {budgetVsActualCostCenter && !budgetVsActualLoading && budgetVsActual.length > 0 ? (
            <StatRow variant="strip" ariaLabel="Presupuesto contra real">
              <Stat
                label="Planeado"
                value={<Money value={totalPlanned} compact />}
                hint={`${budgetVsActual.length} presupuestos`}
                icon={<SavingsOutlinedIcon />}
                iconTone="neutral"
              />
              <Stat
                label="Real"
                value={<Money value={totalActual} compact />}
                hint="gasto contabilizado"
                icon={<ReceiptLongOutlinedIcon />}
                iconTone="neutral"
              />
              <Stat
                label="Variación"
                value={<Money value={totalPlanned - totalActual} compact />}
                hint={
                  totalPlanned > 0
                    ? `${(((totalPlanned - totalActual) / totalPlanned) * 100).toFixed(1)}% del planeado`
                    : "sin presupuesto base"
                }
                tone={totalActual <= totalPlanned ? "default" : "danger"}
                icon={<BalanceOutlinedIcon />}
                iconTone="neutral"
              />
            </StatRow>
          ) : null}

          <Card className={s.tarjeta}>
            <CardHead
              title="Presupuesto vs. real"
              subtitle="Compara el importe planeado contra el gasto real contabilizado por centro de costo y año."
              actions={
                <>
                  <Select aria-label="Centro de costo" controlSize="sm" wrapperClassName={s.selCentro} value={budgetVsActualCostCenter} onChange={e => setBudgetVsActualCostCenter(e.target.value)}>
                    <option value="">Selecciona centro de costo</option>
                    {costCenters.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                  </Select>
                  <Input aria-label="Año" type="number" controlSize="sm" className={s.anio} value={budgetVsActualYear} onChange={e => setBudgetVsActualYear(e.target.value)} />
                </>
              }
            />
            {budgetVsActualLoadErr && (
              <Alert
                tone="danger"
                role="alert"
                className={s.avisoDentro}
                action={<Button size="sm" onClick={() => void loadBudgetVsActual()}>Reintentar</Button>}
              >
                {budgetVsActualLoadErr}
              </Alert>
            )}
            {!budgetVsActualCostCenter ? (
              <EmptyState size="compact" tone="neutral" icon={<CategoryOutlinedIcon />} title="Selecciona un centro de costo para ver el comparativo." />
            ) : budgetVsActualLoading ? (
              <SkeletonRows rows={4} label="Cargando…" />
            ) : budgetVsActual.length === 0 ? (
              <EmptyState size="compact" tone="neutral" icon={<SavingsOutlinedIcon />} title="Sin presupuestos para este centro de costo y año." />
            ) : (
              <>
                <DataTable
                  flush
                  density="compact"
                  ariaLabel="Presupuesto vs. real"
                  columns={vsRealColumns}
                  rows={budgetVsActual}
                  rowKey={(b) => b.id}
                />
                <TableTotals
                  entries={[
                    { label: "Planeado", value: <Money value={totalPlanned} bold={false} /> },
                    { label: "Real", value: <Money value={totalActual} bold={false} /> },
                    {
                      label: "Diferencia",
                      value: <Money value={Math.abs(totalPlanned - totalActual)} bold={false} />,
                      tone: totalActual > totalPlanned ? "danger" : "default",
                    },
                  ]}
                />
              </>
            )}
          </Card>

          <Card className={s.tarjeta}>
            <CardHead
              title="Presupuestos registrados"
              actions={cfg.canCreate ? (
                <Button variant="secondary" size="sm" iconStart={<AddRoundedIcon />} onClick={() => { setBudgetForm({ ...emptyBudgetForm, year: new Date().getFullYear() }); setShowBudgetForm(true); }}>
                  Nuevo presupuesto
                </Button>
              ) : undefined}
            />
            {showBudgetForm && (
              <Captura
                anidada
                titulo="Nuevo presupuesto"
                error={budgetSaveErr}
                pie={
                  <>
                    <Button variant="ghost" onClick={() => { setShowBudgetForm(false); setBudgetSaveErr(null); }}>Cancelar</Button>
                    <Button variant="tonal" onClick={() => void saveBudget()} disabled={budgetSaving}>{budgetSaving ? "Guardando…" : "Crear presupuesto"}</Button>
                  </>
                }
              >
                <Field label="Nombre" fullWidth>
                  <Input value={budgetForm.name} onChange={e => setBudgetForm(f => ({ ...f, name: e.target.value }))} placeholder="Presupuesto de operación 2026" />
                </Field>
                <Field label="Centro de costo" hint="Contra él se compara el gasto real contabilizado.">
                  <Select value={budgetForm.costCenterId} onChange={e => setBudgetForm(f => ({ ...f, costCenterId: e.target.value }))}>
                    <option value="">— Seleccionar —</option>
                    {costCenters.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Año">
                  <Input type="number" value={budgetForm.year} onChange={e => setBudgetForm(f => ({ ...f, year: +e.target.value }))} />
                </Field>
                <Field label="Mes" optional hint="Déjalo vacío para un presupuesto anual.">
                  <Input type="number" min={1} max={12} value={budgetForm.month} onChange={e => setBudgetForm(f => ({ ...f, month: e.target.value }))} />
                </Field>
                <Field label="Importe planeado" hint="Pesos. Es el techo con el que se mide la variación.">
                  <Input type="number" min={0} step="0.01" value={budgetForm.plannedAmount || ""} onChange={e => setBudgetForm(f => ({ ...f, plannedAmount: +e.target.value }))} />
                </Field>
                <Field label="Notas" optional fullWidth>
                  <Input value={budgetForm.notes} onChange={e => setBudgetForm(f => ({ ...f, notes: e.target.value }))} />
                </Field>
              </Captura>
            )}
            {budgetsLoadErr && (
              <Alert
                tone="danger"
                role="alert"
                className={s.avisoDentro}
                action={<Button size="sm" onClick={() => void loadBudgets()}>Reintentar</Button>}
              >
                {budgetsLoadErr}
              </Alert>
            )}
            {budgetsLoading ? (
              <SkeletonRows rows={3} label="Cargando…" />
            ) : (
              <TablaDatos
                ariaLabel="Presupuestos registrados"
                columns={budgetColumns}
                rows={budgets}
                rowKey={b => b.id}
                vacio={{ icon: <SavingsOutlinedIcon />, title: "Sin presupuestos", description: "Crea el primer presupuesto por centro de costo." }}
              />
            )}
          </Card>
        </>
      )}

      {tab === "cumplimiento_sat" && (
        <>
          {!agrupadorStatusLoading && agrupadorStatus ? (
            <StatRow variant="strip" ariaLabel="Mapeo de agrupador SAT">
              <Stat
                label="Cuentas totales"
                value={agrupadorStatus.totalAccounts}
                hint="en el catálogo"
                icon={<AccountTreeOutlinedIcon />}
                iconTone="neutral"
              />
              <Stat
                label="Mapeadas"
                value={agrupadorStatus.mappedAccounts}
                hint="con código del catálogo SAT"
                icon={<FactCheckOutlinedIcon />}
                iconTone="neutral"
              />
              <Stat
                label="Sin mapear"
                value={agrupadorStatus.missingAccounts.length}
                hint={agrupadorStatus.missingAccounts.length ? "bloquean la balanza electrónica" : "listo para exportar"}
                tone={agrupadorStatus.missingAccounts.length ? "warning" : "default"}
                icon={<ChecklistOutlinedIcon />}
                iconTone="neutral"
              />
            </StatRow>
          ) : null}

          <Card className={`${s.tarjeta} ${!agrupadorStatusLoading && !faltanAgrupador ? s.soloCabeza : ""}`}>
            <CardHead
              title="Mapeo de agrupador SAT"
              subtitle="Contabilidad Electrónica (Balanza) requiere que cada cuenta con movimiento tenga su código de agrupador del catálogo SAT. Edítalo en la columna de Catálogo de cuentas."
            />
            {agrupadorStatusLoading ? (
              <SkeletonRows rows={2} label="Cargando…" />
            ) : agrupadorStatus && faltanAgrupador ? (
              <Alert
                tone="warning"
                role="alert"
                className={s.avisoDentro}
                action={<Button size="sm" onClick={() => setTab("cuentas" as TabKey)}>Ir al catálogo</Button>}
              >
                {`Faltan mapear: ${agrupadorStatus.missingAccounts.map(a => `${a.code} ${a.name}`).join(", ")}.`}
              </Alert>
            ) : null}
          </Card>

          {!diotLoading && diotReport && diotReport.rows.length > 0 ? (
            <StatRow variant="strip" ariaLabel="Totales de la DIOT">
              <Stat
                label="Base 16%"
                value={<Money value={diotReport.totals.baseAmount} compact />}
                hint="importe antes de IVA"
                icon={<ReceiptLongOutlinedIcon />}
                iconTone="neutral"
              />
              <Stat
                label="IVA trasladado"
                value={<Money value={diotReport.totals.ivaAmount} compact />}
                hint="acreditable del periodo"
                icon={<TrendingUpOutlinedIcon />}
                iconTone="neutral"
              />
              <Stat
                label="Total pagado"
                value={<Money value={diotReport.totals.totalAmount} compact />}
                hint="base más IVA"
                icon={<AccountBalanceWalletOutlinedIcon />}
                iconTone="neutral"
              />
              <Stat
                label="Proveedores"
                value={diotReport.rows.length}
                hint={
                  diotReport.missingRfcSuppliers.length
                    ? `${diotReport.missingRfcSuppliers.length} sin RFC`
                    : "todos con RFC"
                }
                tone={diotReport.missingRfcSuppliers.length ? "warning" : "default"}
                icon={<LibraryBooksOutlinedIcon />}
                iconTone="neutral"
              />
            </StatRow>
          ) : null}

          <Card className={s.tarjeta}>
            <CardHead
              title="DIOT — Declaración Informativa de Operaciones con Terceros"
              subtitle="Base e IVA trasladado por proveedor (facturas AP del periodo). Insumo directo para el aplicativo DIOT del SAT."
            />
            <ModuleToolbar
              end={
                <>
                  <Button variant="ghost" size="sm" iconStart={<FileDownloadOutlinedIcon />} onClick={() => void downloadDiotCsv()} disabled={diotCsvDownloading || !diotReport?.rows.length}>
                    {diotCsvDownloading ? "Generando…" : "Descargar CSV"}
                  </Button>
                  <Button
                    variant="tonal"
                    size="sm"
                    onClick={() => void downloadBalanzaXml()}
                    disabled={balanzaDownloading || !agrupadorStatus?.readyForBalanzaExport}
                    title={agrupadorStatus && !agrupadorStatus.readyForBalanzaExport ? "Completa el mapeo de agrupador SAT primero" : undefined}
                  >
                    {balanzaDownloading ? "Generando…" : "Exportar Balanza XML"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void downloadCatalogoCuentasXml()}
                    disabled={catalogoDownloading || !agrupadorStatus?.readyForBalanzaExport}
                    title={agrupadorStatus && !agrupadorStatus.readyForBalanzaExport ? "Completa el mapeo de agrupador SAT primero" : undefined}
                  >
                    {catalogoDownloading ? "Generando…" : "Exportar Catálogo de cuentas XML"}
                  </Button>
                </>
              }
            >
              <Select aria-label="Mes" controlSize="sm" wrapperClassName={s.selMes} value={diotMonth} onChange={e => setDiotMonth(+e.target.value)}>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </Select>
              <Input aria-label="Año" type="number" controlSize="sm" className={s.anio} value={diotYear} onChange={e => setDiotYear(+e.target.value)} />
            </ModuleToolbar>
            {diotLoading ? (
              <SkeletonRows rows={5} label="Calculando…" />
            ) : diotReport && diotReport.rows.length > 0 ? (
              <>
                {diotReport.missingRfcSuppliers.length > 0 && (
                  <Alert tone="warning" role="alert" className={s.avisoDentro}>
                    {`Sin RFC capturado: ${diotReport.missingRfcSuppliers.join(", ")}. Complétalo en Compras → Proveedores.`}
                  </Alert>
                )}
                <DataTable
                  flush
                  density="compact"
                  ariaLabel="DIOT"
                  columns={diotColumns}
                  rows={diotReport.rows}
                  rowKey={(r) => r.supplierId}
                />
                <TableTotals
                  entries={[
                    { label: "Base", value: <Money value={diotReport.totals.baseAmount} bold={false} /> },
                    { label: "IVA", value: <Money value={diotReport.totals.ivaAmount} bold={false} /> },
                    { label: "Total", value: <Money value={diotReport.totals.totalAmount} bold={false} /> },
                  ]}
                />
              </>
            ) : (
              <EmptyState
                size="compact"
                tone="neutral"
                icon={<SearchOffOutlinedIcon />}
                title={`Sin facturas de proveedor (AP) en ${diotMonth}/${diotYear}.`}
              />
            )}
          </Card>
        </>
      )}

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </MesaPagina>
  );
}
