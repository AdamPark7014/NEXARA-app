"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";

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
  parent?: { id: number; code: string; name: string } | null;
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
  { key: "polizas", label: "Pólizas" },
  { key: "cuentas", label: "Catálogo de cuentas" },
  { key: "balanza", label: "Balanza de comprobación" },
  { key: "resultados", label: "Estado de resultados" },
  { key: "balance", label: "Balance general" },
  { key: "presupuestos", label: "Presupuestos" },
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

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 };
const formCard: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

export default function AccountingPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpFinanceSectionConfig(user, "accounting"), [user]);
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const tabParam = searchParams.get("tab") as TabKey | null;

  const [tab, setTab] = useState<TabKey>(tabParam && TABS.some((t) => t.key === tabParam) ? tabParam : "polizas");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

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
      const data = await apiFetch("accounting/journal-entries", token);
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

  useEffect(() => {
    if (tab === "cuentas") {
      void loadAccounts();
      void loadPeriods();
    }
  }, [tab, loadAccounts, loadPeriods]);

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

  const postEntry = async (id: number) => {
    if (!token) return;
    try {
      const updated = await apiFetch(`accounting/journal-entries/${id}/post`, token, { method: "PATCH" });
      setItems(prev => prev.map(e => e.id === id ? { ...e, ...updated } : e));
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo contabilizar"));
    }
  };

  const reverseEntry = async (id: number) => {
    if (!token) return;
    setConfirmState({ message: "¿Reversar esta póliza? Se generará una contrapóliza.", confirmLabel: "Reversar", fn: async () => {
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
    setConfirmState({
      message: `¿Cerrar el periodo "${period.name}"? Ya no se podrán contabilizar pólizas dentro de este rango.`,
      confirmLabel: "Cerrar periodo",
      fn: async () => {
        try {
          const updated = await apiFetch(`accounting/accounts/fiscal-periods/${period.id}/close`, token, { method: "PATCH" });
          setPeriods(prev => prev.map(p => p.id === period.id ? { ...p, ...updated } : p));
          toast.success(`Periodo "${period.name}" cerrado.`);
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo cerrar el periodo"));
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

  const statusVariant = (s?: string): "accent" | "warning" | "neutral" | "danger" =>
    s === "POSTED" || s === "CONTABILIZADA" ? "neutral" : s === "REVERSED" ? "danger" : "warning";

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
    { key: "reference", label: "Referencia", render: e => <code style={{ fontSize: 11.5 }}>{e.reference ?? `P-${e.id}`}</code>, width: 130 },
    { key: "description", label: "Concepto", render: e => (
      <div>
        <div style={{ fontSize: 13 }}>{e.description ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{e.type} · {e.createdBy?.nombre}</div>
      </div>
    )},
    { key: "totalDebit", label: "Cargo", render: e => e.totalDebit ? <Money value={e.totalDebit} /> : <span style={{ color: "var(--text-tertiary)" }}>—</span>, width: 120 },
    { key: "totalCredit", label: "Abono", render: e => e.totalCredit ? <Money value={e.totalCredit} /> : <span style={{ color: "var(--text-tertiary)" }}>—</span>, width: 120 },
    {
      key: "date", label: "Fecha",
      render: (e) => {
        if (!e.date) return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>;
        const isDraft = e.status === "DRAFT" || e.status === "BORRADOR";
        const days = Math.floor((Date.now() - new Date(e.date).getTime()) / 86400000);
        const color = isDraft && days >= 14 ? "var(--danger)" : isDraft && days >= 7 ? "var(--warning)" : "var(--text-secondary)";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{new Date(e.date).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" })}</span>
            {isDraft && <span style={{ fontSize: 10.5, fontWeight: days >= 7 ? 700 : 400, color }}>{days}d sin contabilizar</span>}
          </div>
        );
      },
      width: 120,
    },
    { key: "status", label: "Estado", render: e => (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Tag variant={statusVariant(e.status)}>{e.status ?? "BORRADOR"}</Tag>
        {(e.status === "DRAFT" || e.status === "BORRADOR") && cfg.canApprove && (
          <button onClick={() => postEntry(e.id)} style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>Contabilizar</button>
        )}
        {(e.status === "POSTED" || e.status === "CONTABILIZADA") && cfg.canDelete && (
          <button onClick={() => reverseEntry(e.id)} style={{ fontSize: 11, background: "var(--danger)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>Reversar</button>
        )}
      </div>
    ), width: 200 },
  ];

  // ── Catálogo de cuentas columns ───────────────────────────────────
  const accountColumns: Column<Account>[] = [
    { key: "code", label: "Código", render: a => <code style={{ fontSize: 12 }}>{a.code}</code>, width: 100 },
    { key: "name", label: "Nombre", render: a => (
      <div>
        <div style={{ fontSize: 13 }}>{a.name}</div>
        {a.parent && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Bajo {a.parent.code} · {a.parent.name}</div>}
      </div>
    ) },
    { key: "type", label: "Tipo", render: a => <Tag variant="default">{ACCOUNT_TYPE_LABEL[a.type] ?? a.type}</Tag>, width: 110 },
    { key: "balance", label: "Saldo", render: a => <Money value={a.balance} compact />, width: 130, numeric: true },
    { key: "isActive", label: "Estado", width: 140, render: a => (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Tag variant={a.isActive ? "positive" : "default"}>{a.isActive ? "Activa" : "Inactiva"}</Tag>
        {cfg.canEdit && (
          <button onClick={() => void toggleAccountActive(a)} style={{ fontSize: 11, background: "transparent", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 7px", cursor: "pointer", color: "var(--text-secondary)" }}>
            {a.isActive ? "Desactivar" : "Reactivar"}
          </button>
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
    { key: "isClosed", label: "Estado", width: 160, render: p => (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Tag variant={p.isClosed ? "neutral" : "positive"}>{p.isClosed ? "Cerrado" : "Abierto"}</Tag>
        {!p.isClosed && cfg.canApprove && (
          <button onClick={() => closePeriod(p)} style={{ fontSize: 11, background: "var(--danger)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>
            Cerrar
          </button>
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
    { key: "name", label: "Cuenta", render: r => r.name },
    { key: "type", label: "Tipo", render: r => <Tag variant="default">{ACCOUNT_TYPE_LABEL[r.type as Account["type"]] ?? r.type}</Tag>, width: 110 },
    { key: "debit", label: "Debe", render: r => <Money value={r.debit} compact />, width: 130, numeric: true },
    { key: "credit", label: "Haber", render: r => <Money value={r.credit} compact />, width: 130, numeric: true },
  ];

  // ── Cost center / budget columns ──────────────────────────────────
  const costCenterColumns: Column<CostCenter>[] = [
    { key: "code", label: "Código", render: c => <code style={{ fontSize: 12 }}>{c.code}</code>, width: 100 },
    { key: "name", label: "Nombre", render: c => c.name },
    { key: "defaultAccount", label: "Cuenta por defecto", render: c => c.defaultAccount ? <span style={{ fontSize: 12.5 }}>{c.defaultAccount.code} · {c.defaultAccount.name}</span> : <span style={{ color: "var(--text-tertiary)" }}>—</span> },
    { key: "isActive", label: "Estado", width: 100, render: c => <Tag variant={c.isActive ? "positive" : "default"}>{c.isActive ? "Activo" : "Inactivo"}</Tag> },
  ];

  const budgetColumns: Column<Budget>[] = [
    { key: "name", label: "Presupuesto", render: b => (
      <div>
        <div style={{ fontSize: 13 }}>{b.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{b.costCenter?.code} · {b.costCenter?.name}</div>
      </div>
    ) },
    { key: "period", label: "Periodo", render: b => <span style={{ fontSize: 12.5 }}>{b.month ? `${b.month}/${b.year}` : b.year}</span>, width: 100 },
    { key: "plannedAmount", label: "Planeado", render: b => <Money value={b.plannedAmount} compact />, width: 120, numeric: true },
    { key: "actualAmount", label: "Real", render: b => <Money value={b.actualAmount} compact />, width: 120, numeric: true },
    { key: "variance", label: "Variación", width: 140, render: b => {
      const variance = b.plannedAmount - b.actualAmount;
      const over = variance < 0;
      return (
        <span style={{ fontSize: 12.5, fontWeight: 700, color: over ? "var(--danger)" : "var(--success)" }}>
          {over ? "▲" : "▼"} <Money value={Math.abs(variance)} compact bold={false} />
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
        title="Contabilidad"
        subtitle="Pólizas, catálogo de cuentas, balanza, estados financieros y control presupuestal."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/erp/finance/viatics?tab=analytics" style={{ textDecoration: "none" }}>
              <Button variant="ghost" iconLeft="💸">Viáticos / control de gastos</Button>
            </Link>
            <Button variant="ghost" iconLeft="📄" onClick={() => void downloadFinancialPdf()} disabled={pdfDownloading}>
              {pdfDownloading ? "Generando…" : "Reporte PDF"}
            </Button>
            {tab === "polizas" && cfg.canCreate ? (
              <Button variant="primary" iconLeft="+" onClick={() => { setForm({ ...emptyForm }); setShowForm(true); }}>Nueva póliza</Button>
            ) : null}
          </div>
        }
      />

      <div
        style={{
          marginBottom: 14,
          padding: "12px 16px",
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Control de viáticos con refs contables (`VIAT-…`), analytics por proyecto/persona/categoría y PDF del periodo.
        </div>
        <Link href="/erp/finance/viatics" style={{ fontSize: 13, fontWeight: 600 }}>
          Abrir módulo de viáticos →
        </Link>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
        {TABS.map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? "primary" : "secondary"} onClick={() => setTab(t.key)}>
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "polizas" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 14 }}>
            <KpiCard label="Ingresos registrados" value={<Money value={ingresos} compact />} hint={`${items.filter(e => e.type === "INGRESOS").length} pólizas de ingreso`} variant="positive" icon="📈" />
            <KpiCard label="Egresos registrados" value={<Money value={egresos} compact />} hint={`${items.filter(e => e.type === "EGRESOS").length} pólizas de egreso`} variant={egresos > ingresos ? "danger" : "default"} icon="📉" />
            <KpiCard label="Balance neto" value={<Money value={ingresos - egresos} compact />} variant={ingresos >= egresos ? "positive" : "danger"} icon={ingresos >= egresos ? "✅" : "⚠️"} hint="Ingresos menos egresos" />
            <KpiCard label="Borradores" value={borradores} hint="Pendientes de contabilizar" variant={borradores > 0 ? "warning" : "positive"} icon="📝" />
          </div>

          {(ingresos > 0 || egresos > 0) && (
            <div style={{ marginBottom: 18, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Ingresos vs Egresos</div>
              {[
                { label: "Ingresos", value: ingresos, color: "var(--success)" },
                { label: "Egresos", value: egresos, color: "var(--danger)" },
              ].map(({ label: l, value, color }) => {
                const total = Math.max(ingresos, egresos, 1);
                return (
                  <div key={l} style={{ display: "grid", gridTemplateColumns: "80px 1fr 110px", gap: 10, alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>{l}</span>
                    <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(value / total) * 100}%`, background: color, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>
                      {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact" }).format(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {showForm && (
            <div style={formCard}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Concepto / Descripción</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción de la póliza" style={inp} />
              </div>
              <div>
                <label style={label}>Tipo</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inp}>
                  {TIPOS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Fecha</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={label}>Referencia (opcional)</label>
                <input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="REF-001" style={inp} />
              </div>
              <div>
                <label style={label}>Cuenta cargo (Debe)</label>
                <select value={form.debitAccountId} onChange={e => setForm(f => ({ ...f, debitAccountId: e.target.value }))} style={inp}>
                  <option value="">— Seleccionar —</option>
                  {accountOptions.map(a => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name ?? `Cuenta ${a.id}`}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Cuenta abono (Haber)</label>
                <select value={form.creditAccountId} onChange={e => setForm(f => ({ ...f, creditAccountId: e.target.value }))} style={inp}>
                  <option value="">— Seleccionar —</option>
                  {accountOptions.map(a => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name ?? `Cuenta ${a.id}`}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Importe ($)</label>
                <input type="number" min={0} step="0.01" value={form.amount || ""} onChange={e => setForm(f => ({ ...f, amount: +e.target.value }))} style={inp} />
              </div>
              {accountsErr && (
                <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--danger)" }}>
                  {accountsErr}{" "}
                  <button type="button" onClick={() => void loadAccountOptions()} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", textDecoration: "underline" }}>
                    Reintentar
                  </button>
                </div>
              )}
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end", flexDirection: "column", alignItems: "stretch" }}>
                {saveErr && (
                  <div role="alert" style={{ padding: "8px 12px", background: "var(--state-danger-bg, #fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
                    {saveErr}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <Button variant="ghost" onClick={() => { setShowForm(false); setSaveErr(null); }}>Cancelar</Button>
                  <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? "Guardando…" : "Crear póliza"}</Button>
                </div>
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
              <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleItems, [
                { key: "reference", label: "Referencia", format: (v, e) => String(v ?? `P-${e.id}`) },
                { key: "description", label: "Concepto" },
                { key: "type", label: "Tipo" },
                { key: "totalDebit", label: "Cargo" },
                { key: "totalCredit", label: "Abono" },
                { key: "status", label: "Estado" },
                { key: "date", label: "Fecha", format: (v) => v ? String(v).slice(0, 10) : "" },
              ], "polizas-contables")}>CSV</Button>
            ) : undefined}
          />

          <Section title={loading ? "Cargando…" : `${visibleItems.length} pólizas`}>
            {highlightId && (
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
                Mostrando póliza <strong>#{highlightId}</strong> desde enlace directo.
              </p>
            )}
            {error && (
              <div role="alert" style={{ padding: "10px 14px", marginBottom: 12, background: "var(--state-warning-bg)", border: "1px solid var(--state-warning-border)", borderRadius: 8, fontSize: 12 }}>
                {error} <Button size="sm" variant="ghost" onClick={() => void load()}>Reintentar</Button>
              </div>
            )}
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
            ) : !error ? (
              <DataTable columns={journalColumns} rows={visibleItems} rowKey={e => e.id} emptyTitle="Sin pólizas" emptyDescription="Registra la primera póliza contable." />
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
                  <Button variant="primary" size="sm" iconLeft="+" onClick={() => { setAccountForm({ ...emptyAccountForm }); setShowAccountForm(true); }}>
                    Nueva cuenta
                  </Button>
                )}
              </div>
            }
          >
            {showAccountForm && (
              <div style={formCard}>
                <div>
                  <label style={label}>Código</label>
                  <input value={accountForm.code} onChange={e => setAccountForm(f => ({ ...f, code: e.target.value }))} placeholder="1000" style={inp} />
                </div>
                <div>
                  <label style={label}>Nombre</label>
                  <input value={accountForm.name} onChange={e => setAccountForm(f => ({ ...f, name: e.target.value }))} placeholder="Caja y bancos" style={inp} />
                </div>
                <div>
                  <label style={label}>Tipo</label>
                  <select value={accountForm.type} onChange={e => setAccountForm(f => ({ ...f, type: e.target.value as Account["type"] }))} style={inp}>
                    {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Cuenta padre (opcional)</label>
                  <select value={accountForm.parentId} onChange={e => setAccountForm(f => ({ ...f, parentId: e.target.value }))} style={inp}>
                    <option value="">— Ninguna —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={label}>Descripción (opcional)</label>
                  <input value={accountForm.description} onChange={e => setAccountForm(f => ({ ...f, description: e.target.value }))} style={inp} />
                </div>
                {accountSaveErr && (
                  <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--danger)" }}>{accountSaveErr}</div>
                )}
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <Button variant="ghost" onClick={() => { setShowAccountForm(false); setAccountSaveErr(null); }}>Cancelar</Button>
                  <Button variant="primary" onClick={() => void saveAccount()} disabled={accountSaving}>{accountSaving ? "Guardando…" : "Crear cuenta"}</Button>
                </div>
              </div>
            )}
            {accountsLoadErr && (
              <div role="alert" style={{ padding: "10px 14px", marginBottom: 12, background: "var(--state-warning-bg)", border: "1px solid var(--state-warning-border)", borderRadius: 8, fontSize: 12 }}>
                {accountsLoadErr} <Button size="sm" variant="ghost" onClick={() => void loadAccounts()}>Reintentar</Button>
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
              <Button variant="primary" size="sm" iconLeft="+" onClick={() => { setPeriodForm({ ...emptyPeriodForm }); setShowPeriodForm(true); }}>
                Nuevo periodo
              </Button>
            ) : undefined}
          >
            {showPeriodForm && (
              <div style={formCard}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={label}>Nombre</label>
                  <input value={periodForm.name} onChange={e => setPeriodForm(f => ({ ...f, name: e.target.value }))} placeholder="Julio 2026" style={inp} />
                </div>
                <div>
                  <label style={label}>Fecha de inicio</label>
                  <input type="date" value={periodForm.startDate} onChange={e => setPeriodForm(f => ({ ...f, startDate: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={label}>Fecha de fin</label>
                  <input type="date" value={periodForm.endDate} onChange={e => setPeriodForm(f => ({ ...f, endDate: e.target.value }))} style={inp} />
                </div>
                {periodSaveErr && (
                  <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--danger)" }}>{periodSaveErr}</div>
                )}
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <Button variant="ghost" onClick={() => { setShowPeriodForm(false); setPeriodSaveErr(null); }}>Cancelar</Button>
                  <Button variant="primary" onClick={() => void savePeriod()} disabled={periodSaving}>{periodSaving ? "Guardando…" : "Crear periodo"}</Button>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 16 }}>
            <KpiCard label="Total Debe" value={<Money value={trialTotals.debit} compact />} icon="⬅️" />
            <KpiCard label="Total Haber" value={<Money value={trialTotals.credit} compact />} icon="➡️" />
            <KpiCard
              label="Cuadre"
              value={trialTotals.balanced ? "Balanceado" : "Descuadrado"}
              variant={trialTotals.balanced ? "positive" : "danger"}
              icon={trialTotals.balanced ? "✅" : "⚠️"}
              hint={trialTotals.balanced ? "Debe = Haber" : `Diferencia: ${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Math.abs(trialTotals.debit - trialTotals.credit))}`}
            />
          </div>
          {trialErr && (
            <div role="alert" style={{ padding: "10px 14px", marginBottom: 12, background: "var(--state-warning-bg)", border: "1px solid var(--state-warning-border)", borderRadius: 8, fontSize: 12 }}>
              {trialErr} <Button size="sm" variant="ghost" onClick={() => void loadTrialBalance()}>Reintentar</Button>
            </div>
          )}
          {trialLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Calculando…</div>
          ) : (
            <DataTable columns={trialColumns} rows={trialBalance} rowKey={r => r.code} emptyTitle="Sin movimientos" emptyDescription="Contabiliza pólizas para generar la balanza." />
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
            <div role="alert" style={{ padding: "10px 14px", marginBottom: 12, background: "var(--state-warning-bg)", border: "1px solid var(--state-warning-border)", borderRadius: 8, fontSize: 12 }}>
              {incomeErr} <Button size="sm" variant="ghost" onClick={() => void loadIncomeStatement()}>Reintentar</Button>
            </div>
          )}
          {incomeLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Calculando…</div>
          ) : incomeStatement ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
                <KpiCard label="Ingresos totales" value={<Money value={incomeStatement.totalRevenue} compact />} variant="positive" icon="📈" />
                <KpiCard label="Gastos totales" value={<Money value={incomeStatement.totalExpenses} compact />} variant="danger" icon="📉" />
                <KpiCard
                  label="Utilidad neta"
                  value={<Money value={incomeStatement.netIncome} compact />}
                  variant={incomeStatement.netIncome >= 0 ? "positive" : "danger"}
                  icon={incomeStatement.netIncome >= 0 ? "✅" : "⚠️"}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--success)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Ingresos</div>
                  <DataTable
                    density="compact"
                    columns={[
                      { key: "code", label: "Código", width: 80, render: (r: { code: string }) => <code style={{ fontSize: 11 }}>{r.code}</code> },
                      { key: "name", label: "Cuenta", render: (r: { name: string }) => <span style={{ fontSize: 12.5 }}>{r.name}</span> },
                      { key: "amount", label: "Importe", numeric: true, render: (r: { amount: number }) => <Money value={r.amount} compact /> },
                    ]}
                    rows={incomeStatement.revenue}
                    rowKey={(r) => r.code}
                    emptyTitle="Sin ingresos"
                    emptyDescription="No hay cuentas de ingreso en el rango."
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--danger)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Gastos</div>
                  <DataTable
                    density="compact"
                    columns={[
                      { key: "code", label: "Código", width: 80, render: (r: { code: string }) => <code style={{ fontSize: 11 }}>{r.code}</code> },
                      { key: "name", label: "Cuenta", render: (r: { name: string }) => <span style={{ fontSize: 12.5 }}>{r.name}</span> },
                      { key: "amount", label: "Importe", numeric: true, render: (r: { amount: number }) => <Money value={r.amount} compact /> },
                    ]}
                    rows={incomeStatement.expenses}
                    rowKey={(r) => r.code}
                    emptyTitle="Sin gastos"
                    emptyDescription="No hay cuentas de gasto en el rango."
                  />
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
            <div role="alert" style={{ padding: "10px 14px", marginBottom: 12, background: "var(--state-warning-bg)", border: "1px solid var(--state-warning-border)", borderRadius: 8, fontSize: 12 }}>
              {balanceErr} <Button size="sm" variant="ghost" onClick={() => void loadBalanceSheet()}>Reintentar</Button>
            </div>
          )}
          {balanceLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Calculando…</div>
          ) : balanceSheet ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
                <KpiCard label="Activo total" value={<Money value={balanceSheet.totalAssets} compact />} icon="🏦" />
                <KpiCard label="Pasivo total" value={<Money value={balanceSheet.totalLiabilities} compact />} icon="📑" />
                <KpiCard label="Capital total" value={<Money value={balanceSheet.totalEquity} compact />} icon="💼" />
                <KpiCard
                  label="Cuadre"
                  value={balanceSheet.balanceCheck ? "Balanceado" : "Descuadrado"}
                  variant={balanceSheet.balanceCheck ? "positive" : "danger"}
                  icon={balanceSheet.balanceCheck ? "✅" : "⚠️"}
                  hint="Activo = Pasivo + Capital"
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
                {[
                  { label: "Activo", color: "var(--success)", rows: balanceSheet.assets },
                  { label: "Pasivo", color: "var(--danger)", rows: balanceSheet.liabilities },
                  { label: "Capital", color: "var(--primary)", rows: balanceSheet.equity },
                ].map(({ label: l, color, rows }) => (
                  <div key={l}>
                    <div style={{ fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{l}</div>
                    <DataTable
                      density="compact"
                      columns={[
                        { key: "code", label: "Código", width: 70, render: (r: { code: string }) => <code style={{ fontSize: 11 }}>{r.code}</code> },
                        { key: "name", label: "Cuenta", render: (r: { name: string }) => <span style={{ fontSize: 12 }}>{r.name}</span> },
                        { key: "balance", label: "Saldo", numeric: true, render: (r: { balance: number }) => <Money value={r.balance} compact /> },
                      ]}
                      rows={rows}
                      rowKey={(r) => r.code}
                      emptyTitle="Sin cuentas"
                      emptyDescription={`No hay cuentas de ${l.toLowerCase()} con movimientos.`}
                    />
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
              <Button variant="primary" size="sm" iconLeft="+" onClick={() => { setCostCenterForm({ ...emptyCostCenterForm }); setShowCostCenterForm(true); }}>
                Nuevo centro de costo
              </Button>
            ) : undefined}
          >
            {showCostCenterForm && (
              <div style={formCard}>
                <div>
                  <label style={label}>Código</label>
                  <input value={costCenterForm.code} onChange={e => setCostCenterForm(f => ({ ...f, code: e.target.value }))} placeholder="CC-OPS" style={inp} />
                </div>
                <div>
                  <label style={label}>Nombre</label>
                  <input value={costCenterForm.name} onChange={e => setCostCenterForm(f => ({ ...f, name: e.target.value }))} placeholder="Operaciones" style={inp} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={label}>Cuenta contable por defecto (opcional)</label>
                  <select value={costCenterForm.defaultAccountId} onChange={e => setCostCenterForm(f => ({ ...f, defaultAccountId: e.target.value }))} style={inp}>
                    <option value="">— Ninguna —</option>
                    {accounts.filter(a => a.type === "EXPENSE").map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                  </select>
                </div>
                {costCenterSaveErr && (
                  <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--danger)" }}>{costCenterSaveErr}</div>
                )}
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <Button variant="ghost" onClick={() => { setShowCostCenterForm(false); setCostCenterSaveErr(null); }}>Cancelar</Button>
                  <Button variant="primary" onClick={() => void saveCostCenter()} disabled={costCenterSaving}>{costCenterSaving ? "Guardando…" : "Crear"}</Button>
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 16 }}>
                  <KpiCard label="Planeado" value={<Money value={totalPlanned} compact />} icon="🎯" />
                  <KpiCard label="Real" value={<Money value={totalActual} compact />} icon="💳" />
                  <KpiCard
                    label="Variación"
                    value={<Money value={totalPlanned - totalActual} compact />}
                    variant={totalActual <= totalPlanned ? "positive" : "danger"}
                    icon={totalActual <= totalPlanned ? "✅" : "⚠️"}
                    hint={totalPlanned > 0 ? `${(((totalPlanned - totalActual) / totalPlanned) * 100).toFixed(1)}%` : undefined}
                  />
                </div>
                {budgetVsActual.map((b) => {
                  const pct = b.plannedAmount > 0 ? Math.min((b.actualAmount / b.plannedAmount) * 100, 999) : 0;
                  const over = b.actualAmount > b.plannedAmount;
                  return (
                    <div key={b.id} style={{ marginBottom: 14, padding: "10px 14px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{b.name}{b.month ? ` · Mes ${b.month}` : ""}</span>
                        <span style={{ fontSize: 11.5, color: over ? "var(--danger)" : "var(--text-secondary)" }}>
                          <Money value={b.actualAmount} compact /> / <Money value={b.plannedAmount} compact bold={false} />
                        </span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: over ? "var(--danger)" : "var(--success)", borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </Section>

          <div style={{ height: 24 }} />

          <Section
            title="Presupuestos registrados"
            actions={cfg.canCreate ? (
              <Button variant="primary" size="sm" iconLeft="+" onClick={() => { setBudgetForm({ ...emptyBudgetForm, year: new Date().getFullYear() }); setShowBudgetForm(true); }}>
                Nuevo presupuesto
              </Button>
            ) : undefined}
          >
            {showBudgetForm && (
              <div style={formCard}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={label}>Nombre</label>
                  <input value={budgetForm.name} onChange={e => setBudgetForm(f => ({ ...f, name: e.target.value }))} placeholder="Presupuesto de operación 2026" style={inp} />
                </div>
                <div>
                  <label style={label}>Centro de costo</label>
                  <select value={budgetForm.costCenterId} onChange={e => setBudgetForm(f => ({ ...f, costCenterId: e.target.value }))} style={inp}>
                    <option value="">— Seleccionar —</option>
                    {costCenters.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Año</label>
                  <input type="number" value={budgetForm.year} onChange={e => setBudgetForm(f => ({ ...f, year: +e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={label}>Mes (opcional, deja vacío para anual)</label>
                  <input type="number" min={1} max={12} value={budgetForm.month} onChange={e => setBudgetForm(f => ({ ...f, month: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={label}>Importe planeado ($)</label>
                  <input type="number" min={0} step="0.01" value={budgetForm.plannedAmount || ""} onChange={e => setBudgetForm(f => ({ ...f, plannedAmount: +e.target.value }))} style={inp} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={label}>Notas (opcional)</label>
                  <input value={budgetForm.notes} onChange={e => setBudgetForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
                </div>
                {budgetSaveErr && (
                  <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--danger)" }}>{budgetSaveErr}</div>
                )}
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <Button variant="ghost" onClick={() => { setShowBudgetForm(false); setBudgetSaveErr(null); }}>Cancelar</Button>
                  <Button variant="primary" onClick={() => void saveBudget()} disabled={budgetSaving}>{budgetSaving ? "Guardando…" : "Crear presupuesto"}</Button>
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

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
