"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import InlineAlert from "@/components/ui/InlineAlert";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import {
  FinanceField,
  FinanceFormGrid,
  financeInputStyle,
} from "@/components/finance/FinanceModuleShell";
import { useUser } from "@/components/UserContext";
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";

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
  date: new Date().toISOString().slice(0, 10),
  reference: "",
  debitAccountId: "",
  creditAccountId: "",
  amount: 0,
};

const emptyAccountForm = { code: "", name: "", type: "ASSET" as Account["type"], parentId: "", description: "" };
const emptyPeriodForm = { name: "", startDate: "", endDate: "" };
const emptyCostCenterForm = { code: "", name: "", defaultAccountId: "" };
const emptyBudgetForm = { name: "", costCenterId: "", year: new Date().getFullYear(), month: "", plannedAmount: 0, notes: "" };

const inp = financeInputStyle;

/** Panel de captura: superficie neutra, sin relleno de color ni sombra. */
const formCard: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 18,
  marginBottom: 20,
};

/** Pie de acciones del formulario: línea de corte y guardar a la derecha. */
const formFooter: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  marginTop: 16,
  paddingTop: 14,
  borderTop: "1px solid var(--border)",
};

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
  entries: { label: string; value: React.ReactNode; tone?: "default" | "danger" }[];
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        flexWrap: "wrap",
        gap: 28,
        padding: "10px 16px",
        marginTop: -1,
        border: "1px solid var(--nx-panel-hairline, var(--border))",
        borderTop: "none",
        borderRadius: "0 0 var(--nx-panel-radius) var(--nx-panel-radius)",
        background: "var(--surface-2, var(--surface))",
      }}
    >
      {entries.map((e) => (
        <div key={e.label} style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>
            {e.label}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              color: e.tone === "danger" ? "var(--state-danger-text, #b91c1c)" : "var(--text-primary)",
            }}
          >
            {e.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AccountingPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpFinanceSectionConfig(user, "accounting"), [user]);
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const tabParam = searchParams.get("tab") as TabKey | null;

  const [tab, setTab] = useState<TabKey>(tabParam && TABS.some((t) => t.key === tabParam) ? tabParam : "polizas");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [financeInsights, setFinanceInsights] = useState<any>(null);
  const [financeInsightsLoading, setFinanceInsightsLoading] = useState(false);

  // ── Pólizas (journal entries) ──────────────────────────────────────
  const [items, setItems] = useState<JournalEntry[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  const [showCostCenterForm, setShowCostCenterForm] = useState(false);
  const [costCenterForm, setCostCenterForm] = useState({ ...emptyCostCenterForm });
  const [costCenterSaveErr, setCostCenterSaveErr] = useState<string | null>(null);
  const [costCenterSaving, setCostCenterSaving] = useState(false);

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetsLoading, setBudgetsLoading] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ ...emptyBudgetForm });
  const [budgetSaveErr, setBudgetSaveErr] = useState<string | null>(null);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetVsActualCostCenter, setBudgetVsActualCostCenter] = useState("");
  const [budgetVsActualYear, setBudgetVsActualYear] = useState(String(new Date().getFullYear()));
  const [budgetVsActual, setBudgetVsActual] = useState<Budget[]>([]);
  const [budgetVsActualLoading, setBudgetVsActualLoading] = useState(false);

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
      const data = await apiFetch("accounting/journal-entries?limit=100", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar las pólizas"));
      setItems([]);
    } finally { setLoading(false); }
  }, [token]);

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
    try {
      const data = await apiFetch("accounting/accounts/fiscal-periods", token);
      setPeriods(Array.isArray(data) ? data : []);
    } catch {
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
    try {
      const data = await apiFetch("accounting/accounts/cost-centers", token);
      setCostCenters(Array.isArray(data) ? data : []);
    } catch {
      setCostCenters([]);
    } finally {
      setCostCentersLoading(false);
    }
  }, [token]);

  const loadBudgets = useCallback(async () => {
    if (!token) return;
    setBudgetsLoading(true);
    try {
      const data = await apiFetch("accounting/budgets", token);
      setBudgets(Array.isArray(data) ? data : []);
    } catch {
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
    try {
      const data = await apiFetch(
        `accounting/budgets/vs-actual?costCenterId=${budgetVsActualCostCenter}&year=${budgetVsActualYear}`,
        token,
      );
      setBudgetVsActual(Array.isArray(data) ? data : []);
    } catch {
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
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `diot-${diotYear}-${String(diotMonth).padStart(2, "0")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
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
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `balanza-${diotYear}-${String(diotMonth).padStart(2, "0")}.xml`;
      a.click();
      URL.revokeObjectURL(url);
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
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `catalogo-cuentas-${new Date().toISOString().slice(0, 10)}.xml`;
      a.click();
      URL.revokeObjectURL(url);
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
      message: "¿Reversar esta póliza? Se generará una contrapóliza.",
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
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reportes-financieros-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
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
  const entryStatus = (s?: string): { label: string; tone: StatusTone } => {
    if (s === "POSTED" || s === "CONTABILIZADA") return { label: "Contabilizada", tone: "neutral" };
    if (s === "REVERSED") return { label: "Reversada", tone: "danger" };
    return { label: "Borrador", tone: "warning" };
  };

  /** Diferencia entre cargos y abonos de una póliza. Cero = cuadra. */
  const entryImbalance = (e: JournalEntry) => (e.totalDebit ?? 0) - (e.totalCredit ?? 0);

  const visibleItems = useMemo(() => {
    let rows = items;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
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
  }, [items, highlightId, searchQ, filterTipo]);

  const journalColumns: Column<JournalEntry>[] = [
    {
      key: "description", label: "Concepto",
      render: e => {
        const desc = (e.createdBy?.nombre ? `${e.type} · ${e.createdBy.nombre}` : e.type) ?? "";
        return (
          <div>
            <div style={{ fontSize: 13 }}>{e.description ?? "—"}</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              <code>{e.reference ?? `P-${e.id}`}</code>
              {desc ? ` · ${desc}` : ""}
            </div>
          </div>
        );
      },
    },
    {
      key: "totalDebit", label: "Cargo", numeric: true, width: 130,
      render: e => e.totalDebit ? <Money value={e.totalDebit} bold={false} /> : <span style={{ color: "var(--text-tertiary)" }}>—</span>,
    },
    {
      key: "totalCredit", label: "Abono", numeric: true, width: 130,
      render: e => e.totalCredit ? <Money value={e.totalCredit} bold={false} /> : <span style={{ color: "var(--text-tertiary)" }}>—</span>,
    },
    {
      key: "date", label: "Fecha",
      render: (e) => {
        if (!e.date) return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>;
        const isDraft = e.status === "DRAFT" || e.status === "BORRADOR";
        const days = Math.floor((Date.now() - new Date(e.date).getTime()) / 86400000);
        const color = days >= 14 ? "var(--state-danger-text, #b91c1c)" : days >= 7 ? "var(--state-warning-text, #b45309)" : "var(--text-tertiary)";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {new Date(e.date).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" })}
            </span>
            {isDraft && <span style={{ fontSize: 11, color }}>{days}d sin contabilizar</span>}
          </div>
        );
      },
      width: 120,
    },
    {
      key: "status", label: "Estado", width: 150,
      render: e => {
        const st = entryStatus(e.status);
        const imbalance = entryImbalance(e);
        const descuadrada = Math.abs(imbalance) >= 0.01;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <StatusDot label={st.label} tone={st.tone} />
            {descuadrada && (
              <StatusDot
                label={`Descuadre ${Math.abs(imbalance).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 })}`}
                tone="danger"
                title="Los cargos y los abonos de esta póliza no suman lo mismo"
              />
            )}
          </div>
        );
      },
    },
    ...(cfg.canApprove || cfg.canDelete ? [{
      key: "acciones" as keyof JournalEntry, label: "", width: 130,
      render: (e: JournalEntry) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
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
    const debit = visibleItems.reduce((s, e) => s + (e.totalDebit ?? 0), 0);
    const credit = visibleItems.reduce((s, e) => s + (e.totalCredit ?? 0), 0);
    const descuadradas = visibleItems.filter((e) => Math.abs((e.totalDebit ?? 0) - (e.totalCredit ?? 0)) >= 0.01).length;
    return { debit, credit, diff: debit - credit, descuadradas };
  }, [visibleItems]);

  // ── Catálogo de cuentas columns ───────────────────────────────────
  const accountColumns: Column<Account>[] = [
    { key: "code", label: "Código", render: a => <code style={{ fontSize: 12 }}>{a.code}</code>, width: 100 },
    { key: "name", label: "Nombre", render: a => (
      <div>
        <div style={{ fontSize: 13 }}>{a.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {ACCOUNT_TYPE_LABEL[a.type] ?? a.type}
          {a.parent ? ` · bajo ${a.parent.code} ${a.parent.name}` : ""}
        </div>
      </div>
    ) },
    { key: "balance", label: "Saldo", render: a => <Money value={a.balance} compact bold={false} />, width: 130, numeric: true },
    { key: "satAgrupador", label: "Agrupador SAT", width: 140, render: a => (
      cfg.canEdit ? (
        <input
          defaultValue={a.satAgrupador ?? ""}
          placeholder="Ej. 101.01"
          aria-label={`Agrupador SAT de la cuenta ${a.code}`}
          onBlur={e => void saveAccountAgrupador(a, e.target.value)}
          style={{ width: "100%", padding: "4px 6px", fontSize: 12, border: `1px solid ${a.satAgrupador ? "var(--border)" : "var(--state-warning-border, #f59e0b)"}`, borderRadius: 6, background: "var(--surface)", color: "var(--foreground)" }}
        />
      ) : (
        a.satAgrupador
          ? <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{a.satAgrupador}</span>
          : <StatusDot label="Sin mapear" tone="warning" title="La balanza electrónica exige el código del catálogo SAT" />
      )
    ) },
    { key: "isActive", label: "Estado", width: 170, render: a => (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusDot label={a.isActive ? "Activa" : "Inactiva"} tone="neutral" />
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
    { key: "name", label: "Periodo", render: p => <strong style={{ fontSize: 13 }}>{p.name}</strong> },
    { key: "range", label: "Rango", render: p => (
      <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
        {new Date(p.startDate).toLocaleDateString("es-MX")} — {new Date(p.endDate).toLocaleDateString("es-MX")}
      </span>
    ) },
    { key: "isClosed", label: "Estado", width: 200, render: p => (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusDot
          label={p.isClosed ? "Cerrado" : "Abierto"}
          tone="neutral"
          title={p.isClosed ? "No admite pólizas nuevas dentro del rango" : "Admite pólizas dentro del rango"}
        />
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
    { key: "code", label: "Código", render: r => <code style={{ fontSize: 12 }}>{r.code}</code>, width: 100 },
    { key: "name", label: "Cuenta", render: r => (
      <div>
        <div style={{ fontSize: 13 }}>{r.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{ACCOUNT_TYPE_LABEL[r.type as Account["type"]] ?? r.type}</div>
      </div>
    ) },
    { key: "debit", label: "Debe", render: r => <Money value={r.debit} compact bold={false} />, width: 130, numeric: true },
    { key: "credit", label: "Haber", render: r => <Money value={r.credit} compact bold={false} />, width: 130, numeric: true },
  ];

  // ── Cost center / budget columns ──────────────────────────────────
  const costCenterColumns: Column<CostCenter>[] = [
    { key: "code", label: "Código", render: c => <code style={{ fontSize: 12 }}>{c.code}</code>, width: 100 },
    { key: "name", label: "Nombre", render: c => (
      <div>
        <div style={{ fontSize: 13 }}>{c.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {c.defaultAccount ? `Cuenta por defecto ${c.defaultAccount.code} · ${c.defaultAccount.name}` : "Sin cuenta por defecto"}
        </div>
      </div>
    ) },
    { key: "isActive", label: "Estado", width: 120, render: c => <StatusDot label={c.isActive ? "Activo" : "Inactivo"} tone="neutral" /> },
  ];

  const budgetColumns: Column<Budget>[] = [
    { key: "name", label: "Presupuesto", render: b => (
      <div>
        <div style={{ fontSize: 13 }}>{b.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {b.costCenter?.code} · {b.costCenter?.name} · {b.month ? `${b.month}/${b.year}` : b.year}
        </div>
      </div>
    ) },
    { key: "plannedAmount", label: "Planeado", render: b => <Money value={b.plannedAmount} compact bold={false} />, width: 130, numeric: true },
    { key: "actualAmount", label: "Real", render: b => <Money value={b.actualAmount} compact bold={false} />, width: 130, numeric: true },
    { key: "variance", label: "Variación", width: 150, numeric: true, render: b => {
      const variance = b.plannedAmount - b.actualAmount;
      const over = variance < 0;
      return (
        <span
          style={{
            fontSize: 12.5,
            fontVariantNumeric: "tabular-nums",
            color: over ? "var(--state-danger-text, #b91c1c)" : "var(--text-secondary)",
          }}
          title={over ? "Gastado por encima de lo planeado" : "Dentro de lo planeado"}
        >
          {over ? "+" : "−"}<Money value={Math.abs(variance)} compact bold={false} />
        </span>
      );
    } },
  ];

  const totalPlanned = useMemo(() => budgetVsActual.reduce((s, b) => s + b.plannedAmount, 0), [budgetVsActual]);
  const totalActual = useMemo(() => budgetVsActual.reduce((s, b) => s + b.actualAmount, 0), [budgetVsActual]);

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title="Pólizas y libros"
        subtitle="Asientos, catálogo, balanza y presupuesto."
        density="ops"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" variant="ghost" onClick={() => void downloadFinancialPdf()} disabled={pdfDownloading}>
              {pdfDownloading ? "Generando…" : "Reporte PDF"}
            </Button>
            {tab === "polizas" && cfg.canCreate ? (
              <Button size="sm" variant="primary" iconLeft="+" onClick={() => { setForm({ ...emptyForm }); setShowForm(true); }}>Nueva póliza</Button>
            ) : null}
          </div>
        }
      />

      <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-secondary)" }}>
        Escritorio Contadora:{" "}
        <Link href="/erp/contabilidad" style={{ fontWeight: 600 }}>
          CxC, CxP, cierres y conciliación →
        </Link>
      </p>

      {/* Pestañas como pestañas: ocho botones rellenos competían con el único
          primario de la pantalla y ninguno destacaba. */}
      <div
        role="tablist"
        aria-label="Secciones de contabilidad"
        style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 18, borderBottom: "1px solid var(--border)" }}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              style={{
                appearance: "none",
                background: "transparent",
                border: "none",
                padding: "8px 0 10px",
                marginBottom: -1,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                borderBottom: `2px solid ${active ? "var(--primary)" : "transparent"}`,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "inteligencia" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {financeInsightsLoading && <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Calculando inteligencia financiera…</div>}
          {financeInsights && (
            <>
              <MetricStrip
                ariaLabel="Indicadores financieros"
                metrics={[
                  { label: "Cash", value: <Money value={financeInsights.kpis?.cashBalance ?? 0} compact bold={false} />, hint: "saldo en bancos" },
                  { label: "Working capital", value: <Money value={financeInsights.kpis?.workingCapital ?? 0} compact bold={false} />, hint: "activo menos pasivo circulante" },
                  { label: "DSO", value: `${financeInsights.kpis?.dso ?? 0}d`, hint: "días en cobrar" },
                  { label: "DPO", value: `${financeInsights.kpis?.dpo ?? 0}d`, hint: "días en pagar" },
                  {
                    label: "Runway",
                    value: financeInsights.kpis?.runwayMonths != null ? `${financeInsights.kpis.runwayMonths}m` : "∞",
                    hint: "meses de operación cubiertos",
                    tone: financeInsights.kpis?.runwayMonths != null && financeInsights.kpis.runwayMonths < 6 ? "danger" : "default",
                  },
                  {
                    label: "Vencidas",
                    value: financeInsights.overdueInvoices ?? 0,
                    hint: "facturas fuera de plazo",
                    tone: financeInsights.overdueInvoices ? "danger" : "default",
                  },
                ]}
              />
              {(financeInsights.alerts || []).map((a: any) => (
                <InlineAlert key={a.message} variant="warning" message={a.message} style={{ marginBottom: 0 }} />
              ))}
              <Section title="Aging CXC" subtitle="Antigüedad de cuentas por cobrar">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                  {[
                    ["Current", financeInsights.aging?.ar?.current],
                    ["1–30d", financeInsights.aging?.ar?.d1_30],
                    ["31–60d", financeInsights.aging?.ar?.d31_60],
                    ["61–90d", financeInsights.aging?.ar?.d61_90],
                    [">90d", financeInsights.aging?.ar?.d90_plus],
                  ].map(([label, val]) => (
                    <div key={String(label)} style={{ padding: 12, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{label}</div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}><Money value={Number(val || 0)} compact /></div>
                    </div>
                  ))}
                </div>
              </Section>
              <Section title="Aging CXP" subtitle="Antigüedad de cuentas por pagar">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                  {[
                    ["Current", financeInsights.aging?.ap?.current],
                    ["1–30d", financeInsights.aging?.ap?.d1_30],
                    ["31–60d", financeInsights.aging?.ap?.d31_60],
                    ["61–90d", financeInsights.aging?.ap?.d61_90],
                    [">90d", financeInsights.aging?.ap?.d90_plus],
                  ].map(([label, val]) => (
                    <div key={String(label)} style={{ padding: 12, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{label}</div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}><Money value={Number(val || 0)} compact /></div>
                    </div>
                  ))}
                </div>
              </Section>
              <Section title="Cashflow semanal · 90d" subtitle={`In ${Number(financeInsights.cashflow90d?.inflow || 0).toLocaleString("es-MX")} · Out ${Number(financeInsights.cashflow90d?.outflow || 0).toLocaleString("es-MX")}`}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
                  {(financeInsights.cashflow90d?.weekly || []).map((w: any) => {
                    const max = Math.max(1, ...(financeInsights.cashflow90d.weekly.map((x: any) => Math.abs(x.net))));
                    const h = Math.max(4, (Math.abs(w.net) / max) * 70);
                    return (
                      <div key={w.weekEnding} title={`${w.weekEnding}: ${w.net}`} style={{ flex: 1, height: h, background: w.net >= 0 ? "var(--success)" : "var(--danger)", borderRadius: 3, opacity: 0.85 }} />
                    );
                  })}
                </div>
              </Section>
            </>
          )}
          {!financeInsightsLoading && !financeInsights && (
            <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Sin datos de inteligencia financiera.</div>
          )}
        </div>
      )}

      {tab === "polizas" && (
        <>
          {(() => {
            const metrics: Metric[] = [
              {
                label: "Ingresos registrados",
                value: <Money value={ingresos} compact bold={false} />,
                hint: `${items.filter(e => e.type === "INGRESOS").length} pólizas de ingreso`,
              },
              {
                label: "Egresos registrados",
                value: <Money value={egresos} compact bold={false} />,
                hint: `${items.filter(e => e.type === "EGRESOS").length} pólizas de egreso`,
              },
              {
                label: "Balance neto",
                value: <Money value={ingresos - egresos} compact bold={false} />,
                hint: "ingresos menos egresos",
                tone: ingresos >= egresos ? "default" : "danger",
              },
              {
                label: "Borradores",
                value: borradores,
                hint: "pendientes de contabilizar",
                tone: borradores > 0 ? "warning" : "default",
              },
              {
                label: "Descuadradas",
                value: journalTotals.descuadradas,
                hint: "cargo ≠ abono",
                tone: journalTotals.descuadradas > 0 ? "danger" : "default",
              },
            ];
            return (
              <div style={{ marginBottom: 14 }}>
                <MetricStrip metrics={metrics} ariaLabel="Resumen del libro diario" />
              </div>
            );
          })()}

          {showForm && (
            <div style={formCard}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 14 }}>Nueva póliza</p>
              <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--text-tertiary)" }}>
                Asiento de dos partidas: el mismo importe entra al Debe de una cuenta y al Haber de la otra, así la póliza nace cuadrada.
              </p>
              {accountsErr && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <InlineAlert variant="warning" message={accountsErr} style={{ marginBottom: 0, flex: 1 }} />
                  <Button size="sm" variant="secondary" onClick={() => void loadAccountOptions()}>Reintentar</Button>
                </div>
              )}
              <FinanceFormGrid>
                <FinanceField label="Concepto / Descripción" fullWidth hint="Qué se está asentando. Aparece en el libro diario y en la balanza.">
                  <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción de la póliza" style={inp} />
                </FinanceField>
                <FinanceField label="Tipo">
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inp}>
                    {TIPOS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </FinanceField>
                <FinanceField label="Fecha" hint="Determina en qué periodo fiscal cae la póliza.">
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inp} />
                </FinanceField>
                <FinanceField label="Referencia" optional hint="Folio propio para rastrear el documento de respaldo.">
                  <input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="REF-001" style={inp} />
                </FinanceField>
                <FinanceField label="Importe" hint="Pesos. El mismo monto se asienta al Debe y al Haber.">
                  <input type="number" min={0} step="0.01" value={form.amount || ""} onChange={e => setForm(f => ({ ...f, amount: +e.target.value }))} style={inp} />
                </FinanceField>
                <FinanceField label="Cuenta cargo (Debe)" hint="La que recibe el importe.">
                  <select value={form.debitAccountId} onChange={e => setForm(f => ({ ...f, debitAccountId: e.target.value }))} style={inp}>
                    <option value="">— Seleccionar —</option>
                    {accountOptions.map(a => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name ?? `Cuenta ${a.id}`}</option>)}
                  </select>
                </FinanceField>
                <FinanceField label="Cuenta abono (Haber)" hint="La que entrega el importe. Debe ser distinta a la del cargo.">
                  <select value={form.creditAccountId} onChange={e => setForm(f => ({ ...f, creditAccountId: e.target.value }))} style={inp}>
                    <option value="">— Seleccionar —</option>
                    {accountOptions.map(a => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name ?? `Cuenta ${a.id}`}</option>)}
                  </select>
                </FinanceField>
              </FinanceFormGrid>
              {saveErr && <div style={{ marginTop: 14 }}><InlineAlert variant="danger" message={saveErr} /></div>}
              <div style={formFooter}>
                <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setSaveErr(null); }}>Cancelar</Button>
                <Button size="sm" variant="primary" onClick={() => void save()} disabled={saving}>{saving ? "Guardando…" : "Crear póliza"}</Button>
              </div>
            </div>
          )}

          <FilterToolbar
            search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por concepto, referencia o usuario…" }}
            selects={[{
              label: "Tipo",
              value: filterTipo,
              onChange: setFilterTipo,
              options: TIPOS.map((t) => ({ value: t, label: t })),
              allowAll: true,
            }]}
            onClear={() => { setSearchQ(""); setFilterTipo(""); }}
            resultCount={loading ? null : visibleItems.length}
            rightActions={items.length > 0 ? (
              <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleItems, [
                { key: "reference", label: "Referencia", format: (v, e) => String(v ?? `P-${e.id}`) },
                { key: "description", label: "Concepto" },
                { key: "type", label: "Tipo" },
                { key: "totalDebit", label: "Cargo" },
                { key: "totalCredit", label: "Abono" },
                { key: "status", label: "Estado" },
                { key: "date", label: "Fecha", format: (v) => v ? String(v).slice(0, 10) : "" },
              ], "polizas-contables")}>Excel</Button>
            ) : undefined}
          />

          <Section title={loading ? "Cargando…" : `${visibleItems.length} pólizas`}>
            {highlightId && (
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
                Mostrando póliza <strong>#{highlightId}</strong> desde enlace directo.
              </p>
            )}
            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <InlineAlert variant="warning" message={error} style={{ flex: 1 }} />
                <Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>
              </div>
            )}
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
            ) : !error ? (
              <>
                <DataTable columns={journalColumns} rows={visibleItems} rowKey={e => e.id} emptyTitle="Sin pólizas" emptyDescription="Registra la primera póliza contable." />
                {visibleItems.length > 0 && (
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
                )}
              </>
            ) : null}
          </Section>
        </>
      )}

      {tab === "cuentas" && (
        <>
          <Section
            title="Catálogo de cuentas"
            subtitle="Estructura contable base para pólizas, balanza y estados financieros."
            actions={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={accountTypeFilter} onChange={e => setAccountTypeFilter(e.target.value)} style={{ ...inp, width: 160 }}>
                  <option value="">Todos los tipos</option>
                  {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>)}
                </select>
                {cfg.canCreate && (
                  <Button variant="secondary" size="sm" iconLeft="+" onClick={() => { setAccountForm({ ...emptyAccountForm }); setShowAccountForm(true); }}>
                    Nueva cuenta
                  </Button>
                )}
              </div>
            }
          >
            {showAccountForm && (
              <div style={formCard}>
                <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>Nueva cuenta contable</p>
                <FinanceFormGrid>
                  <FinanceField label="Código" hint="Numeración del catálogo. El orden del código ordena la balanza.">
                    <input value={accountForm.code} onChange={e => setAccountForm(f => ({ ...f, code: e.target.value }))} placeholder="1000" style={inp} />
                  </FinanceField>
                  <FinanceField label="Nombre">
                    <input value={accountForm.name} onChange={e => setAccountForm(f => ({ ...f, name: e.target.value }))} placeholder="Caja y bancos" style={inp} />
                  </FinanceField>
                  <FinanceField label="Tipo" hint="Decide si la cuenta suma al balance o al estado de resultados.">
                    <select value={accountForm.type} onChange={e => setAccountForm(f => ({ ...f, type: e.target.value as Account["type"] }))} style={inp}>
                      {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>)}
                    </select>
                  </FinanceField>
                  <FinanceField label="Cuenta padre" optional hint="Para colgar la cuenta de una de mayor nivel.">
                    <select value={accountForm.parentId} onChange={e => setAccountForm(f => ({ ...f, parentId: e.target.value }))} style={inp}>
                      <option value="">— Ninguna —</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                    </select>
                  </FinanceField>
                  <FinanceField label="Descripción" optional fullWidth hint="Para qué se usa la cuenta; lo lee quien captura la póliza.">
                    <input value={accountForm.description} onChange={e => setAccountForm(f => ({ ...f, description: e.target.value }))} style={inp} />
                  </FinanceField>
                </FinanceFormGrid>
                {accountSaveErr && <div style={{ marginTop: 14 }}><InlineAlert variant="danger" message={accountSaveErr} /></div>}
                <div style={formFooter}>
                  <Button size="sm" variant="ghost" onClick={() => { setShowAccountForm(false); setAccountSaveErr(null); }}>Cancelar</Button>
                  <Button size="sm" variant="primary" onClick={() => void saveAccount()} disabled={accountSaving}>{accountSaving ? "Guardando…" : "Crear cuenta"}</Button>
                </div>
              </div>
            )}
            {accountsLoadErr && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <InlineAlert variant="warning" message={accountsLoadErr} style={{ flex: 1 }} />
                <Button size="sm" variant="secondary" onClick={() => void loadAccounts()}>Reintentar</Button>
              </div>
            )}
            {accountsLoading ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
            ) : (
              <DataTable columns={accountColumns} rows={visibleAccounts} rowKey={a => a.id} emptyTitle="Sin cuentas" emptyDescription="Da de alta la primera cuenta contable." />
            )}
          </Section>

          <div style={{ height: 24 }} />

          <Section
            title="Períodos fiscales"
            subtitle="Cierre mensual: una vez cerrado, no se pueden contabilizar pólizas dentro del rango."
            actions={cfg.canCreate ? (
              <Button variant="secondary" size="sm" iconLeft="+" onClick={() => { setPeriodForm({ ...emptyPeriodForm }); setShowPeriodForm(true); }}>
                Nuevo periodo
              </Button>
            ) : undefined}
          >
            {showPeriodForm && (
              <div style={formCard}>
                <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>Nuevo periodo fiscal</p>
                <FinanceFormGrid>
                  <FinanceField label="Nombre" fullWidth hint="Como se le llama al cierre: «Julio 2026».">
                    <input value={periodForm.name} onChange={e => setPeriodForm(f => ({ ...f, name: e.target.value }))} placeholder="Julio 2026" style={inp} />
                  </FinanceField>
                  <FinanceField label="Fecha de inicio">
                    <input type="date" value={periodForm.startDate} onChange={e => setPeriodForm(f => ({ ...f, startDate: e.target.value }))} style={inp} />
                  </FinanceField>
                  <FinanceField label="Fecha de fin" hint="Al cerrarlo, ninguna póliza dentro del rango podrá contabilizarse.">
                    <input type="date" value={periodForm.endDate} onChange={e => setPeriodForm(f => ({ ...f, endDate: e.target.value }))} style={inp} />
                  </FinanceField>
                </FinanceFormGrid>
                {periodSaveErr && <div style={{ marginTop: 14 }}><InlineAlert variant="danger" message={periodSaveErr} /></div>}
                <div style={formFooter}>
                  <Button size="sm" variant="ghost" onClick={() => { setShowPeriodForm(false); setPeriodSaveErr(null); }}>Cancelar</Button>
                  <Button size="sm" variant="primary" onClick={() => void savePeriod()} disabled={periodSaving}>{periodSaving ? "Guardando…" : "Crear periodo"}</Button>
                </div>
              </div>
            )}
            {periodsLoading ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
            ) : (
              <DataTable columns={periodColumns} rows={periods} rowKey={p => p.id} emptyTitle="Sin periodos" emptyDescription="Crea el primer periodo fiscal para poder cerrarlo al final del mes." />
            )}
          </Section>
        </>
      )}

      {tab === "balanza" && (
        <Section
          title="Balanza de comprobación"
          subtitle="Suma de cargos y abonos por cuenta a partir de pólizas contabilizadas. Debe cuadrar Debe = Haber."
          actions={
            <select value={trialBalancePeriodId} onChange={e => setTrialBalancePeriodId(e.target.value)} style={{ ...inp, width: 200 }}>
              <option value="">Todos los periodos</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          }
        >
          <div style={{ marginBottom: 16 }}>
            <MetricStrip
              ariaLabel="Cuadre de la balanza"
              metrics={[
                { label: "Total Debe", value: <Money value={trialTotals.debit} compact bold={false} />, hint: `${trialBalance.length} cuentas con movimiento` },
                { label: "Total Haber", value: <Money value={trialTotals.credit} compact bold={false} />, hint: "suma de abonos" },
                {
                  label: "Cuadre",
                  value: trialTotals.balanced ? "Cuadra" : "Descuadrada",
                  hint: trialTotals.balanced
                    ? "Debe = Haber"
                    : `diferencia de ${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Math.abs(trialTotals.debit - trialTotals.credit))}`,
                  tone: trialTotals.balanced ? "default" : "danger",
                },
              ]}
            />
          </div>
          {trialErr && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <InlineAlert variant="warning" message={trialErr} style={{ flex: 1 }} />
              <Button size="sm" variant="secondary" onClick={() => void loadTrialBalance()}>Reintentar</Button>
            </div>
          )}
          {trialLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Calculando…</div>
          ) : (
            <>
              <DataTable columns={trialColumns} rows={trialBalance} rowKey={r => r.code} emptyTitle="Sin movimientos" emptyDescription="Contabiliza pólizas para generar la balanza." />
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
        </Section>
      )}

      {tab === "resultados" && (
        <Section
          title="Estado de resultados"
          subtitle="Ingresos y gastos contabilizados en el rango seleccionado."
          actions={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="date" value={incomeFrom} onChange={e => setIncomeFrom(e.target.value)} style={{ ...inp, width: 150 }} />
              <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>a</span>
              <input type="date" value={incomeTo} onChange={e => setIncomeTo(e.target.value)} style={{ ...inp, width: 150 }} />
            </div>
          }
        >
          {incomeErr && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <InlineAlert variant="warning" message={incomeErr} style={{ flex: 1 }} />
              <Button size="sm" variant="secondary" onClick={() => void loadIncomeStatement()}>Reintentar</Button>
            </div>
          )}
          {incomeLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Calculando…</div>
          ) : incomeStatement ? (
            <>
              <div style={{ marginBottom: 20 }}>
                <MetricStrip
                  ariaLabel="Resumen del estado de resultados"
                  metrics={[
                    { label: "Ingresos totales", value: <Money value={incomeStatement.totalRevenue} compact bold={false} />, hint: `${incomeStatement.revenue.length} cuentas de ingreso` },
                    { label: "Gastos totales", value: <Money value={incomeStatement.totalExpenses} compact bold={false} />, hint: `${incomeStatement.expenses.length} cuentas de gasto` },
                    {
                      label: "Utilidad neta",
                      value: <Money value={incomeStatement.netIncome} compact bold={false} />,
                      hint: "ingresos menos gastos",
                      tone: incomeStatement.netIncome >= 0 ? "default" : "danger",
                    },
                  ]}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Ingresos</div>
                  <DataTable
                    density="compact"
                    columns={[
                      { key: "code", label: "Código", width: 80, render: (r: { code: string }) => <code style={{ fontSize: 11 }}>{r.code}</code> },
                      { key: "name", label: "Cuenta", render: (r: { name: string }) => <span style={{ fontSize: 12.5 }}>{r.name}</span> },
                      { key: "amount", label: "Importe", numeric: true, render: (r: { amount: number }) => <Money value={r.amount} compact bold={false} /> },
                    ]}
                    rows={incomeStatement.revenue}
                    rowKey={(r) => r.code}
                    emptyTitle="Sin ingresos"
                    emptyDescription="No hay cuentas de ingreso en el rango."
                  />
                  {incomeStatement.revenue.length > 0 && (
                    <TableTotals entries={[{ label: "Total ingresos", value: <Money value={incomeStatement.totalRevenue} bold={false} /> }]} />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Gastos</div>
                  <DataTable
                    density="compact"
                    columns={[
                      { key: "code", label: "Código", width: 80, render: (r: { code: string }) => <code style={{ fontSize: 11 }}>{r.code}</code> },
                      { key: "name", label: "Cuenta", render: (r: { name: string }) => <span style={{ fontSize: 12.5 }}>{r.name}</span> },
                      { key: "amount", label: "Importe", numeric: true, render: (r: { amount: number }) => <Money value={r.amount} compact bold={false} /> },
                    ]}
                    rows={incomeStatement.expenses}
                    rowKey={(r) => r.code}
                    emptyTitle="Sin gastos"
                    emptyDescription="No hay cuentas de gasto en el rango."
                  />
                  {incomeStatement.expenses.length > 0 && (
                    <TableTotals entries={[{ label: "Total gastos", value: <Money value={incomeStatement.totalExpenses} bold={false} /> }]} />
                  )}
                </div>
              </div>
            </>
          ) : null}
        </Section>
      )}

      {tab === "balance" && (
        <Section
          title="Balance general"
          subtitle="Activo, pasivo y capital contabilizados a la fecha de corte. El activo debe ser igual a pasivo más capital."
          actions={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Al</span>
              <input type="date" value={balanceAsOf} onChange={e => setBalanceAsOf(e.target.value)} style={{ ...inp, width: 150 }} />
            </div>
          }
        >
          {balanceErr && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <InlineAlert variant="warning" message={balanceErr} style={{ flex: 1 }} />
              <Button size="sm" variant="secondary" onClick={() => void loadBalanceSheet()}>Reintentar</Button>
            </div>
          )}
          {balanceLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Calculando…</div>
          ) : balanceSheet ? (
            <>
              <div style={{ marginBottom: 20 }}>
                <MetricStrip
                  ariaLabel="Resumen del balance general"
                  metrics={[
                    { label: "Activo total", value: <Money value={balanceSheet.totalAssets} compact bold={false} />, hint: `${balanceSheet.assets.length} cuentas` },
                    { label: "Pasivo total", value: <Money value={balanceSheet.totalLiabilities} compact bold={false} />, hint: `${balanceSheet.liabilities.length} cuentas` },
                    { label: "Capital total", value: <Money value={balanceSheet.totalEquity} compact bold={false} />, hint: `${balanceSheet.equity.length} cuentas` },
                    {
                      label: "Cuadre",
                      value: balanceSheet.balanceCheck ? "Cuadra" : "Descuadrado",
                      hint: "Activo = Pasivo + Capital",
                      tone: balanceSheet.balanceCheck ? "default" : "danger",
                    },
                  ]}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
                {[
                  { label: "Activo", rows: balanceSheet.assets, total: balanceSheet.totalAssets },
                  { label: "Pasivo", rows: balanceSheet.liabilities, total: balanceSheet.totalLiabilities },
                  { label: "Capital", rows: balanceSheet.equity, total: balanceSheet.totalEquity },
                ].map(({ label: l, rows, total }) => (
                  <div key={l}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{l}</div>
                    <DataTable
                      density="compact"
                      columns={[
                        { key: "code", label: "Código", width: 70, render: (r: { code: string }) => <code style={{ fontSize: 11 }}>{r.code}</code> },
                        { key: "name", label: "Cuenta", render: (r: { name: string }) => <span style={{ fontSize: 12 }}>{r.name}</span> },
                        { key: "balance", label: "Saldo", numeric: true, render: (r: { balance: number }) => <Money value={r.balance} compact bold={false} /> },
                      ]}
                      rows={rows}
                      rowKey={(r) => r.code}
                      emptyTitle="Sin cuentas"
                      emptyDescription={`No hay cuentas de ${l.toLowerCase()} con movimientos.`}
                    />
                    {rows.length > 0 && (
                      <TableTotals entries={[{ label: `Total ${l.toLowerCase()}`, value: <Money value={total} bold={false} /> }]} />
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </Section>
      )}

      {tab === "presupuestos" && (
        <>
          <Section
            title="Centros de costo"
            subtitle="Agrupan gastos por área o departamento para el control presupuestal."
            actions={cfg.canCreate ? (
              <Button variant="secondary" size="sm" iconLeft="+" onClick={() => { setCostCenterForm({ ...emptyCostCenterForm }); setShowCostCenterForm(true); }}>
                Nuevo centro de costo
              </Button>
            ) : undefined}
          >
            {showCostCenterForm && (
              <div style={formCard}>
                <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>Nuevo centro de costo</p>
                <FinanceFormGrid>
                  <FinanceField label="Código" hint="Clave corta para identificar el área en reportes.">
                    <input value={costCenterForm.code} onChange={e => setCostCenterForm(f => ({ ...f, code: e.target.value }))} placeholder="CC-OPS" style={inp} />
                  </FinanceField>
                  <FinanceField label="Nombre">
                    <input value={costCenterForm.name} onChange={e => setCostCenterForm(f => ({ ...f, name: e.target.value }))} placeholder="Operaciones" style={inp} />
                  </FinanceField>
                  <FinanceField label="Cuenta contable por defecto" optional fullWidth hint="Solo cuentas de gasto. Se sugiere al presupuestar el área.">
                    <select value={costCenterForm.defaultAccountId} onChange={e => setCostCenterForm(f => ({ ...f, defaultAccountId: e.target.value }))} style={inp}>
                      <option value="">— Ninguna —</option>
                      {accounts.filter(a => a.type === "EXPENSE").map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                    </select>
                  </FinanceField>
                </FinanceFormGrid>
                {costCenterSaveErr && <div style={{ marginTop: 14 }}><InlineAlert variant="danger" message={costCenterSaveErr} /></div>}
                <div style={formFooter}>
                  <Button size="sm" variant="ghost" onClick={() => { setShowCostCenterForm(false); setCostCenterSaveErr(null); }}>Cancelar</Button>
                  <Button size="sm" variant="primary" onClick={() => void saveCostCenter()} disabled={costCenterSaving}>{costCenterSaving ? "Guardando…" : "Crear"}</Button>
                </div>
              </div>
            )}
            {costCentersLoading ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
            ) : (
              <DataTable columns={costCenterColumns} rows={costCenters} rowKey={c => c.id} emptyTitle="Sin centros de costo" emptyDescription="Crea el primer centro de costo para presupuestar por área." />
            )}
          </Section>

          <div style={{ height: 24 }} />

          <Section
            title="Presupuesto vs. real"
            subtitle="Compara el importe planeado contra el gasto real contabilizado por centro de costo y año."
            actions={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={budgetVsActualCostCenter} onChange={e => setBudgetVsActualCostCenter(e.target.value)} style={{ ...inp, width: 200 }}>
                  <option value="">Selecciona centro de costo</option>
                  {costCenters.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                </select>
                <input type="number" value={budgetVsActualYear} onChange={e => setBudgetVsActualYear(e.target.value)} style={{ ...inp, width: 100 }} />
              </div>
            }
          >
            {!budgetVsActualCostCenter ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>Selecciona un centro de costo para ver el comparativo.</div>
            ) : budgetVsActualLoading ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
            ) : budgetVsActual.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>Sin presupuestos para este centro de costo y año.</div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <MetricStrip
                    ariaLabel="Presupuesto contra real"
                    metrics={[
                      { label: "Planeado", value: <Money value={totalPlanned} compact bold={false} />, hint: `${budgetVsActual.length} presupuestos` },
                      { label: "Real", value: <Money value={totalActual} compact bold={false} />, hint: "gasto contabilizado" },
                      {
                        label: "Variación",
                        value: <Money value={totalPlanned - totalActual} compact bold={false} />,
                        hint: totalPlanned > 0
                          ? `${(((totalPlanned - totalActual) / totalPlanned) * 100).toFixed(1)}% del planeado`
                          : "sin presupuesto base",
                        tone: totalActual <= totalPlanned ? "default" : "danger",
                      },
                    ]}
                  />
                </div>
                <DataTable
                  density="compact"
                  columns={[
                    {
                      key: "name", label: "Presupuesto",
                      render: (b: Budget) => (
                        <div>
                          <div style={{ fontSize: 13 }}>{b.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                            {b.month ? `Mes ${b.month} de ${b.year}` : `Ejercicio ${b.year}`}
                          </div>
                        </div>
                      ),
                    },
                    { key: "plannedAmount", label: "Planeado", numeric: true, width: 130, render: (b: Budget) => <Money value={b.plannedAmount} compact bold={false} /> },
                    { key: "actualAmount", label: "Real", numeric: true, width: 130, render: (b: Budget) => <Money value={b.actualAmount} compact bold={false} /> },
                    {
                      key: "left", label: "Diferencia", numeric: true, width: 150,
                      render: (b: Budget) => {
                        const over = b.actualAmount > b.plannedAmount;
                        return (
                          <span style={{ fontVariantNumeric: "tabular-nums", color: over ? "var(--state-danger-text, #b91c1c)" : "var(--text-secondary)" }}>
                            {over ? "+" : "−"}<Money value={Math.abs(b.plannedAmount - b.actualAmount)} compact bold={false} />
                          </span>
                        );
                      },
                    },
                  ]}
                  rows={budgetVsActual}
                  rowKey={(b) => b.id}
                  emptyTitle="Sin presupuestos"
                  emptyDescription="Sin presupuestos para este centro de costo y año."
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
          </Section>

          <div style={{ height: 24 }} />

          <Section
            title="Presupuestos registrados"
            actions={cfg.canCreate ? (
              <Button variant="secondary" size="sm" iconLeft="+" onClick={() => { setBudgetForm({ ...emptyBudgetForm, year: new Date().getFullYear() }); setShowBudgetForm(true); }}>
                Nuevo presupuesto
              </Button>
            ) : undefined}
          >
            {showBudgetForm && (
              <div style={formCard}>
                <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>Nuevo presupuesto</p>
                <FinanceFormGrid>
                  <FinanceField label="Nombre" fullWidth>
                    <input value={budgetForm.name} onChange={e => setBudgetForm(f => ({ ...f, name: e.target.value }))} placeholder="Presupuesto de operación 2026" style={inp} />
                  </FinanceField>
                  <FinanceField label="Centro de costo" hint="Contra él se compara el gasto real contabilizado.">
                    <select value={budgetForm.costCenterId} onChange={e => setBudgetForm(f => ({ ...f, costCenterId: e.target.value }))} style={inp}>
                      <option value="">— Seleccionar —</option>
                      {costCenters.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                    </select>
                  </FinanceField>
                  <FinanceField label="Año">
                    <input type="number" value={budgetForm.year} onChange={e => setBudgetForm(f => ({ ...f, year: +e.target.value }))} style={inp} />
                  </FinanceField>
                  <FinanceField label="Mes" optional hint="Déjalo vacío para un presupuesto anual.">
                    <input type="number" min={1} max={12} value={budgetForm.month} onChange={e => setBudgetForm(f => ({ ...f, month: e.target.value }))} style={inp} />
                  </FinanceField>
                  <FinanceField label="Importe planeado" hint="Pesos. Es el techo con el que se mide la variación.">
                    <input type="number" min={0} step="0.01" value={budgetForm.plannedAmount || ""} onChange={e => setBudgetForm(f => ({ ...f, plannedAmount: +e.target.value }))} style={inp} />
                  </FinanceField>
                  <FinanceField label="Notas" optional fullWidth>
                    <input value={budgetForm.notes} onChange={e => setBudgetForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
                  </FinanceField>
                </FinanceFormGrid>
                {budgetSaveErr && <div style={{ marginTop: 14 }}><InlineAlert variant="danger" message={budgetSaveErr} /></div>}
                <div style={formFooter}>
                  <Button size="sm" variant="ghost" onClick={() => { setShowBudgetForm(false); setBudgetSaveErr(null); }}>Cancelar</Button>
                  <Button size="sm" variant="primary" onClick={() => void saveBudget()} disabled={budgetSaving}>{budgetSaving ? "Guardando…" : "Crear presupuesto"}</Button>
                </div>
              </div>
            )}
            {budgetsLoading ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
            ) : (
              <DataTable columns={budgetColumns} rows={budgets} rowKey={b => b.id} emptyTitle="Sin presupuestos" emptyDescription="Crea el primer presupuesto por centro de costo." />
            )}
          </Section>
        </>
      )}

      {tab === "cumplimiento_sat" && (
        <>
          <Section
            title="Mapeo de agrupador SAT"
            subtitle="Contabilidad Electrónica (Balanza) requiere que cada cuenta con movimiento tenga su código de agrupador del catálogo SAT. Edítalo en la columna de Catálogo de cuentas."
          >
            {agrupadorStatusLoading ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
            ) : agrupadorStatus ? (
              <>
                <div style={{ marginBottom: 16 }}>
                  <MetricStrip
                    ariaLabel="Mapeo de agrupador SAT"
                    metrics={[
                      { label: "Cuentas totales", value: agrupadorStatus.totalAccounts, hint: "en el catálogo" },
                      { label: "Mapeadas", value: agrupadorStatus.mappedAccounts, hint: "con código del catálogo SAT" },
                      {
                        label: "Sin mapear",
                        value: agrupadorStatus.missingAccounts.length,
                        hint: agrupadorStatus.missingAccounts.length ? "bloquean la balanza electrónica" : "listo para exportar",
                        tone: agrupadorStatus.missingAccounts.length ? "warning" : "default",
                      },
                    ]}
                  />
                </div>
                {agrupadorStatus.missingAccounts.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <InlineAlert
                      variant="warning"
                      style={{ flex: 1 }}
                      message={`Faltan mapear: ${agrupadorStatus.missingAccounts.map(a => `${a.code} ${a.name}`).join(", ")}.`}
                    />
                    <Button size="sm" variant="secondary" onClick={() => setTab("cuentas" as TabKey)}>
                      Ir al catálogo
                    </Button>
                  </div>
                )}
              </>
            ) : null}
          </Section>

          <div style={{ height: 24 }} />

          <Section
            title="DIOT — Declaración Informativa de Operaciones con Terceros"
            subtitle="Base e IVA trasladado por proveedor (facturas AP del periodo). Insumo directo para el aplicativo DIOT del SAT."
            actions={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={diotMonth} onChange={e => setDiotMonth(+e.target.value)} style={{ ...inp, width: 130 }}>
                  {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
                <input type="number" value={diotYear} onChange={e => setDiotYear(+e.target.value)} style={{ ...inp, width: 90 }} />
                <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => void downloadDiotCsv()} disabled={diotCsvDownloading || !diotReport?.rows.length}>
                  {diotCsvDownloading ? "Generando…" : "Descargar CSV"}
                </Button>
                <Button
                  variant="primary"
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
              </div>
            }
          >
            {diotLoading ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Calculando…</div>
            ) : diotReport && diotReport.rows.length > 0 ? (
              <>
                <div style={{ marginBottom: 16 }}>
                  <MetricStrip
                    ariaLabel="Totales de la DIOT"
                    metrics={[
                      { label: "Base 16%", value: <Money value={diotReport.totals.baseAmount} compact bold={false} />, hint: "importe antes de IVA" },
                      { label: "IVA trasladado", value: <Money value={diotReport.totals.ivaAmount} compact bold={false} />, hint: "acreditable del periodo" },
                      { label: "Total pagado", value: <Money value={diotReport.totals.totalAmount} compact bold={false} />, hint: "base más IVA" },
                      {
                        label: "Proveedores",
                        value: diotReport.rows.length,
                        hint: diotReport.missingRfcSuppliers.length
                          ? `${diotReport.missingRfcSuppliers.length} sin RFC`
                          : "todos con RFC",
                        tone: diotReport.missingRfcSuppliers.length ? "warning" : "default",
                      },
                    ]}
                  />
                </div>
                {diotReport.missingRfcSuppliers.length > 0 && (
                  <InlineAlert
                    variant="warning"
                    message={`Sin RFC capturado: ${diotReport.missingRfcSuppliers.join(", ")}. Complétalo en Compras → Proveedores.`}
                  />
                )}
                <DataTable
                  density="compact"
                  columns={[
                    {
                      key: "supplierName", label: "Proveedor",
                      render: (r: DiotRow) => (
                        <div>
                          <div style={{ fontSize: 13 }}>{r.supplierName}</div>
                          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                            {r.rfc ? <code>{r.rfc}</code> : <span style={{ color: "var(--state-warning-text, #b45309)" }}>sin RFC</span>}
                            {` · ${r.invoiceCount} factura${r.invoiceCount === 1 ? "" : "s"}`}
                          </div>
                        </div>
                      ),
                    },
                    { key: "baseAmount", label: "Base 16%", numeric: true, width: 140, render: (r: DiotRow) => <Money value={r.baseAmount} compact bold={false} /> },
                    { key: "ivaAmount", label: "IVA", numeric: true, width: 130, render: (r: DiotRow) => <Money value={r.ivaAmount} compact bold={false} /> },
                    { key: "totalAmount", label: "Total", numeric: true, width: 140, render: (r: DiotRow) => <Money value={r.totalAmount} compact bold={false} /> },
                  ]}
                  rows={diotReport.rows}
                  rowKey={(r) => r.supplierId}
                  emptyTitle="Sin operaciones"
                  emptyDescription="No hay facturas de proveedor en el periodo."
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
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>
                Sin facturas de proveedor (AP) en {diotMonth}/{diotYear}.
              </div>
            )}
          </Section>
        </>
      )}

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
