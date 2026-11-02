"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";
import { todayStamp } from "@/components/finance/download";
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
  ModuleToolbar,
  SearchInput,
  Select,
  SkeletonRows,
  Stat,
  StatRow,
  type Column,
} from "@/components/base";
import { Money } from "@/components/ui/DataTable";
import { FinanceModuleShell } from "@/components/finance/FinanceModuleShell";
import { useUser } from "@/components/UserContext";
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";
import { exportToExcel } from "@/lib/export-excel";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import Modal from "@/components/ui/Modal";
import FinanceModuleRail from "@/components/erp/FinanceModuleRail";
import s from "./banking.module.css";


interface BankAccount {
  id: number;
  name: string;
  bankName: string;
  accountNumber: string;
  clabe?: string | null;
  currency: string;
  accountType?: string | null;
  currentBalance: number | string;
  isActive: boolean;
}

interface BankTransaction {
  id: number;
  transactionDate: string;
  description: string;
  amount: number | string;
  isDebit: boolean;
  concept?: string | null;
  counterpartyName?: string | null;
  reconciled?: boolean;
  reconciliationStatus?: string;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const emptyForm = {
  name: "",
  bankName: "",
  accountNumber: "",
  clabe: "",
  currency: "MXN",
  accountType: "CHEQUES",
  currentBalance: 0,
};

const TIPOS_CUENTA = [
  { value: "CHEQUES", label: "Cheques" },
  { value: "INVERSION", label: "Inversión" },
  { value: "NOMINA", label: "Nómina" },
];

const MONEDAS = ["MXN", "USD", "EUR"];

const RECONCILIATION_LABEL: Record<string, string> = {
  MATCHED: "Conciliado",
  PENDING: "Por conciliar",
  UNMATCHED: "Por conciliar",
};

const emptyTxForm = {
  transactionDate: todayStamp(),
  description: "",
  amount: 0,
  isDebit: true,
  counterpartyName: "",
  concept: "",
};

/** Respaldo cuando el servidor no da causa; también decide si el aviso de recarga la repite. */
const CUENTAS_SIN_CARGAR = "No se pudieron cargar las cuentas bancarias.";

export default function BankingPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpFinanceSectionConfig(user, "banking"), [user]);
  const token = user?.token ?? "";

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selected, setSelected] = useState<BankAccount | null>(null);
  const [txs, setTxs] = useState<BankTransaction[]>([]);
  const [txSearch, setTxSearch] = useState("");
  const [txFilterType, setTxFilterType] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingTx, setLoadingTx] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showTxForm, setShowTxForm] = useState(false);
  const [txForm, setTxForm] = useState({ ...emptyTxForm });
  const [savingTx, setSavingTx] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  /** Sube para volver a pedir los movimientos de la cuenta elegida. */
  const [txReload, setTxReload] = useState(0);
  /** Tope del DTO (`@Max(100)`); tandas de 5 páginas · 100 = 500 movimientos antes de avisar. */
  const [txTandas, setTxTandas] = useState(1);
  const [txParcial, setTxParcial] = useState<{ cargadas: number; total: number } | null>(null);
  const selectedId = selected?.id ?? null;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("accounting/banking/accounts", token);
      const list: BankAccount[] = Array.isArray(data) ? data : [];
      setAccounts(list);
      // La cuenta elegida se refresca con su saldo nuevo; si ya no existe, se toma la primera.
      setSelected((prev) => (prev ? (list.find((a) => a.id === prev.id) ?? list[0] ?? null) : (list[0] ?? null)));
    } catch (e) {
      setError(formatApiError(e, CUENTAS_SIN_CARGAR));
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => { setTxTandas(1); }, [selectedId]);

  useEffect(() => {
    if (!token || selectedId == null) return;
    let vivo = true;
    const PAGINAS_POR_TANDA = 5;
    (async () => {
      setLoadingTx(true);
      setTxError(null);
      try {
        const acumuladas: BankTransaction[] = [];
        let total = 0;
        for (let pagina = 1; pagina <= txTandas * PAGINAS_POR_TANDA; pagina += 1) {
          const data = await apiFetch(
            `accounting/banking/accounts/${selectedId}/transactions?limit=100&page=${pagina}`,
            token,
          );
          const rows: BankTransaction[] = Array.isArray(data) ? data : (data?.data ?? []);
          acumuladas.push(...rows);
          const informado = Array.isArray(data) ? undefined : data?.meta?.total;
          total = informado ?? acumuladas.length;
          if (rows.length < 100 || acumuladas.length >= total) break;
        }
        if (!vivo) return;
        setTxs(acumuladas);
        setTxParcial(total > acumuladas.length ? { cargadas: acumuladas.length, total } : null);
      } catch (e) {
        if (!vivo) return;
        setTxError(formatApiError(e, "No se pudieron cargar los movimientos."));
        setTxs([]);
        setTxParcial(null);
      } finally {
        if (vivo) setLoadingTx(false);
      }
    })();
    return () => { vivo = false; };
  }, [token, selectedId, txReload, txTandas]);

  const deferredTxSearch = useDeferredValue(txSearch);
  const visibleTxs = useMemo(() => {
    let rows = txs;
    if (deferredTxSearch.trim()) {
      const q = deferredTxSearch.trim().toLowerCase();
      rows = rows.filter((t) =>
        (t.description ?? "").toLowerCase().includes(q) ||
        (t.counterpartyName ?? "").toLowerCase().includes(q) ||
        (t.concept ?? "").toLowerCase().includes(q)
      );
    }
    if (txFilterType === "debit") rows = rows.filter((t) => t.isDebit);
    if (txFilterType === "credit") rows = rows.filter((t) => !t.isDebit);
    return rows;
  }, [txs, deferredTxSearch, txFilterType]);

  /** Suma de abonos y cargos de lo que está a la vista: el pie de la tabla. */
  const txTotals = useMemo(() => {
    let abonos = 0;
    let cargos = 0;
    for (const t of visibleTxs) {
      const monto = Number(t.amount);
      if (t.isDebit) cargos += monto;
      else abonos += monto;
    }
    return { abonos, cargos, neto: abonos - cargos };
  }, [visibleTxs]);

  const totalBalance = useMemo(
    () => accounts.reduce((s, a) => s + Number(a.currentBalance), 0),
    [accounts],
  );

  /** Conteos de la tira de cifras; los textos que dependen de la cuenta elegida se arman al pintar. */
  const resumen = useMemo(() => {
    const activas = accounts.filter((a) => a.isActive).length;
    const inactivas = accounts.length - activas;
    const negativas = accounts.filter((a) => Number(a.currentBalance) < 0).length;
    const masLiquida = accounts.length > 0
      ? accounts.reduce((max, a) => (Number(a.currentBalance) > Number(max.currentBalance) ? a : max), accounts[0])
      : null;
    const porConciliar = txs.filter((t) => t.reconciliationStatus !== "MATCHED").length;
    return { activas, inactivas, negativas, masLiquida, porConciliar };
  }, [accounts, txs]);


  const openNewAccount = () => { setEditingAccount(null); setForm({ ...emptyForm }); setFormErr(null); setShowForm(true); };
  const openEditAccount = (a: BankAccount) => {
    setEditingAccount(a);
    setForm({
      name: a.name,
      bankName: a.bankName,
      accountNumber: a.accountNumber,
      clabe: a.clabe ?? "",
      currency: a.currency || "MXN",
      accountType: a.accountType || "CHEQUES",
      currentBalance: Number(a.currentBalance),
    });
    setFormErr(null);
    setShowForm(true);
  };

  const saveAccount = async () => {
    if (!token) { setFormErr("Tu sesión no tiene un token válido. Vuelve a iniciar sesión."); return; }
    // Antes el botón se limitaba a no hacer nada si faltaba el número de
    // cuenta: se veía como si el sistema se hubiera colgado. Ahora lo dice.
    if (!form.name.trim()) { setFormErr("Ponle un nombre a la cuenta."); return; }
    if (!form.bankName.trim()) { setFormErr("Indica el banco."); return; }
    if (!form.accountNumber.trim()) { setFormErr("Indica el número de cuenta."); return; }
    setSaving(true);
    setFormErr(null);
    try {
      if (editingAccount) {
        // El saldo NO se manda al editar: a partir del alta lo mueven los
        // movimientos. Mandarlo, además, rebotaba con 400 porque el API
        // rechaza cualquier campo que no esté en el contrato de actualización.
        await apiFetch(`accounting/banking/accounts/${editingAccount.id}`, token, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name.trim(),
            bankName: form.bankName.trim(),
            accountNumber: form.accountNumber.trim(),
            clabe: form.clabe.trim(),
          }),
        });
      } else {
        await apiFetch("accounting/banking/accounts", token, {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            bankName: form.bankName.trim(),
            accountNumber: form.accountNumber.trim(),
            clabe: form.clabe.trim() || undefined,
            currency: form.currency || undefined,
            accountType: form.accountType || undefined,
            currentBalance: Number(form.currentBalance) || 0,
          }),
        });
      }
      toast.success(editingAccount ? "Cuenta actualizada" : "Cuenta creada");
      setShowForm(false);
      setEditingAccount(null);
      setForm({ ...emptyForm });
      void load();
    } catch (e) {
      const msg = formatApiError(e, "No se pudo guardar la cuenta");
      setFormErr(msg);
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const importTransaction = async () => {
    if (!token || !selected || !txForm.description.trim() || !txForm.amount) return;
    setSavingTx(true);
    try {
      await apiFetch(`accounting/banking/accounts/${selected.id}/transactions/import`, token, {
        method: "POST",
        body: JSON.stringify({
          transactions: [{
            transactionDate: txForm.transactionDate,
            description: txForm.description.trim(),
            amount: txForm.amount,
            isDebit: txForm.isDebit,
            counterpartyName: txForm.counterpartyName.trim() || undefined,
            concept: txForm.concept.trim() || undefined,
          }],
        }),
      });
      setShowTxForm(false);
      setTxForm({ ...emptyTxForm, transactionDate: todayStamp() });
      toast.success("Movimiento registrado");
      setTxReload((n) => n + 1);
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo registrar el movimiento"));
    } finally { setSavingTx(false); }
  };

  const reconcile = (tx: BankTransaction) => {
    if (!token) return;
    const amount = Number(tx.amount);
    setConfirmState({
      title: "Conciliar movimiento",
      message: `¿Marcar como conciliado el movimiento de ${amount.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}?`,
      confirmLabel: "Conciliar",
      danger: false,
      fn: async () => {
        try {
          await apiFetch(`accounting/banking/transactions/${tx.id}/reconcile`, token, {
            method: "PATCH",
            body: JSON.stringify({ matchedAmount: amount }),
          });
          setTxs((prev) =>
            prev.map((t) =>
              t.id === tx.id ? { ...t, reconciled: true, reconciliationStatus: "MATCHED" } : t,
            ),
          );
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo conciliar el movimiento"));
        }
      },
    });
  };

  const txColumns: Column<BankTransaction>[] = [
    {
      key: "transactionDate", label: "Fecha", width: 100,
      render: (t) => (
        <span className={s.fecha}>
          {new Date(t.transactionDate).toLocaleDateString("es-MX")}
        </span>
      ),
    },
    {
      key: "description", label: "Concepto",
      render: (t) => {
        const contexto = [t.counterpartyName, t.concept].filter(Boolean).join(" · ");
        return (
          <div className={s.concepto}>
            <span className={s.conceptoTexto}>{t.description}</span>
            <span className={s.conceptoSub}>
              {t.isDebit ? "Cargo" : "Abono"}
              {contexto ? ` · ${contexto}` : ""}
            </span>
          </div>
        );
      },
    },
    {
      // El signo distingue cargo de abono sin pintar media tabla de rojo: con
      // cien movimientos, el color por tipo deja de señalar nada.
      key: "amount", label: "Monto", numeric: true, width: 140,
      render: (t) => (
        <span className={s.monto}>
          {t.isDebit ? "−" : ""}
          <Money value={Number(t.amount)} bold={false} />
        </span>
      ),
    },
    {
      key: "reconciliationStatus", label: "Estado", width: 120,
      render: (t) => (
        t.reconciliationStatus === "MATCHED"
          ? <Badge dot size="sm" tone="neutral" title="Cruzado contra un movimiento contable">Conciliado</Badge>
          : <Badge dot size="sm" tone="warning" title="Todavía no se cruza con la contabilidad">Por conciliar</Badge>
      ),
    },
    ...(cfg.canApprove ? [{
      key: "acciones",
      label: "",
      render: (t: BankTransaction) => t.reconciliationStatus !== "MATCHED" ? <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); void reconcile(t); }}>Conciliar</Button> : null,
      width: 110,
    }] : []),
  ];

  const hayFiltrosTx = txSearch.trim().length > 0 || txFilterType !== "";
  const sinCuentas = !loading && !error && accounts.length === 0;
  const mostrarCuentas = accounts.length > 0 || loading || !error;
  const hayAvisos = Boolean(error);

  const exportarMovimientos = () => {
    if (!selected) return;
    exportToExcel(visibleTxs, [
      { key: "transactionDate", label: "Fecha", format: (v) => v ? String(v).slice(0, 10) : "" },
      { key: "description", label: "Descripción" },
      { key: "counterpartyName", label: "Contraparte" },
      { key: "amount", label: "Monto" },
      { key: "isDebit", label: "Tipo", format: (v) => v ? "Cargo" : "Abono" },
      { key: "reconciliationStatus", label: "Estado", format: (v) => RECONCILIATION_LABEL[String(v ?? "")] ?? "Por conciliar" },
    ], `movimientos-${selected.name.toLowerCase().replace(/\s+/g, "-")}`);
  };

  return (
    <>
      {/* Cabeza → rail → avisos → cifras → tarjetas. El «volver» a Contabilidad queda en el eyebrow:
          el marco no trae enlace propio. Un solo botón primario: en la cabeza, o en el vacío si no hay cuentas. */}
      <FinanceModuleShell
        variant="flat"
        eyebrow={
          <>
            Finanzas
            <span aria-hidden="true">·</span>
            <Link href="/erp/contabilidad" className={s.volver}>Contabilidad</Link>
          </>
        }
        title="Bancos"
        rail={<FinanceModuleRail />}
        actions={
          <>
            <Button variant="ghost" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && !sinCuentas && (
              <Button variant="primary" iconStart={<AddRoundedIcon />} onClick={openNewAccount}>Nueva cuenta</Button>
            )}
          </>
        }
        kpis={
          hayAvisos || accounts.length > 0 ? (
            <div className={s.cifras}>
              <div className={s.avisos}>
                {!loading && error && accounts.length === 0 && (
                  <Alert
                    tone="danger"
                    role="alert"
                    action={<Button size="sm" onClick={() => void load()}>Reintentar</Button>}
                  >
                    {error}
                  </Alert>
                )}
                {error && accounts.length > 0 && (
                  <Alert
                    tone="warning"
                    role="alert"
                    onDismiss={() => setError(null)}
                    action={
                      <Button size="sm" onClick={() => void load()} disabled={loading}>
                        {loading ? "Reintentando…" : "Reintentar"}
                      </Button>
                    }
                  >
                    {error === CUENTAS_SIN_CARGAR
                      ? "No se pudo actualizar; se muestran los saldos anteriores."
                      : `No se pudo actualizar; se muestran los saldos anteriores. ${error}`}
                  </Alert>
                )}
              </div>

              {accounts.length > 0 && (
                <StatRow variant="strip" ariaLabel="Resumen de bancos">
                  <Stat
                    label="Saldo total"
                    value={<Money value={totalBalance} compact />}
                    hint={`${accounts.length} cuenta${accounts.length === 1 ? "" : "s"} registrada${accounts.length === 1 ? "" : "s"}`}
                    tone={totalBalance < 0 ? "danger" : "default"}
                    icon={<AccountBalanceOutlinedIcon />}
                    iconTone="neutral"
                  />
                  <Stat
                    label="Cuentas activas"
                    value={resumen.activas}
                    hint={resumen.inactivas > 0 ? `${resumen.inactivas} inactiva${resumen.inactivas === 1 ? "" : "s"}` : "ninguna inactiva"}
                    icon={<CreditCardOutlinedIcon />}
                    iconTone="neutral"
                  />
                  <Stat
                    label="En negativo"
                    value={resumen.negativas}
                    hint={resumen.negativas > 0 ? "saldo por debajo de cero" : "sin cuentas sobregiradas"}
                    tone={resumen.negativas > 0 ? "danger" : "default"}
                    icon={<TrendingDownOutlinedIcon />}
                    iconTone="neutral"
                  />
                  <Stat
                    label="Más líquida"
                    value={<span className={s.valorTexto}>{resumen.masLiquida?.name ?? "—"}</span>}
                    hint={resumen.masLiquida ? resumen.masLiquida.bankName : "sin cuentas"}
                    icon={<SavingsOutlinedIcon />}
                    iconTone="neutral"
                  />
                  <Stat
                    label="Por conciliar"
                    value={resumen.porConciliar}
                    hint={
                      !selected
                        ? "selecciona una cuenta"
                        : txParcial
                          ? `de los ${txParcial.cargadas} movimientos cargados de ${txParcial.total}`
                          : `movimientos de ${selected.name}`
                    }
                    tone={resumen.porConciliar > 0 ? "warning" : "default"}
                    icon={<RuleOutlinedIcon />}
                    iconTone="neutral"
                  />
                </StatRow>
              )}
            </div>
          ) : undefined
        }
      >
        {mostrarCuentas && (
          <>
            <Card>
              <CardHead title="Cuentas" />
              {accounts.length === 0 ? (
                loading ? (
                  <div className={s.cuerpo} role="status">
                    <span className="ui-sr-only">Cargando cuentas.</span>
                    <SkeletonRows rows={3} label="Cargando cuentas." />
                  </div>
                ) : (
                  <EmptyState
                    icon={<AccountBalanceOutlinedIcon />}
                    title="No hay cuentas."
                    action={
                      cfg.canCreate ? (
                        <Button variant="primary" iconStart={<AddRoundedIcon />} onClick={openNewAccount}>Nueva cuenta</Button>
                      ) : undefined
                    }
                  />
                )
              ) : (
                <div className={s.cuentas}>
                  {accounts.map((a) => {
                    const saldo = Number(a.currentBalance);
                    const share = totalBalance > 0 ? (saldo / totalBalance) * 100 : null;
                    const isSelected = selected?.id === a.id;
                    return (
                      <div key={a.id} className={s.cuenta}>
                        <button
                          type="button"
                          onClick={() => setSelected(a)}
                          aria-pressed={isSelected}
                          className={s.cuentaBtn}
                        >
                          <span className={s.cuentaNombre}>{a.name}</span>
                          <span className={s.cuentaSub}>
                            {a.bankName} · {a.clabe ?? a.accountNumber} · {a.currency}
                          </span>
                          <span className={saldo < 0 ? `${s.cuentaSaldo} ${s.cuentaNeg}` : s.cuentaSaldo}>
                            <Money value={saldo} bold={false} />
                          </span>
                          <span className={s.cuentaPie}>
                            {share !== null && (
                              <span className={s.cuentaPct}>{share.toFixed(0)}% del total</span>
                            )}
                            {!a.isActive && <Badge dot size="sm" tone="neutral">Inactiva</Badge>}
                          </span>
                        </button>
                        {cfg.canCreate && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon
                            className={s.cuentaEditar}
                            onClick={() => openEditAccount(a)}
                            title="Editar cuenta"
                            aria-label={`Editar ${a.name}`}
                          >
                            <EditOutlinedIcon fontSize="small" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {selected && (
              <Card className={s.tarjetaLista}>
                <CardHead
                  title={loadingTx ? "Cargando movimientos…" : `Movimientos · ${selected.name}`}
                  actions={
                    cfg.canCreate ? (
                      <Button size="sm" iconStart={<AddRoundedIcon />} onClick={() => setShowTxForm(true)}>
                        Registrar movimiento
                      </Button>
                    ) : undefined
                  }
                />
                <ModuleToolbar
                  end={
                    <>
                      {hayFiltrosTx && (
                        <LinkButton onClick={() => { setTxSearch(""); setTxFilterType(""); }}>Limpiar</LinkButton>
                      )}
                      {!loadingTx && (
                        <span className={s.conteo} role="status">
                          {visibleTxs.length} resultado{visibleTxs.length === 1 ? "" : "s"}
                        </span>
                      )}
                      {txs.length > 0 && (
                        <Button variant="ghost" size="sm" iconStart={<FileDownloadOutlinedIcon />} onClick={exportarMovimientos}>
                          Excel
                        </Button>
                      )}
                    </>
                  }
                >
                  <SearchInput
                    className={s.busqueda}
                    aria-label="Buscar por descripción o contraparte…"
                    placeholder="Buscar por descripción o contraparte…"
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                  />
                  <Select
                    aria-label="Tipo"
                    title="Tipo"
                    controlSize="sm"
                    wrapperClassName={s.filtroTipo}
                    value={txFilterType}
                    onChange={(e) => setTxFilterType(e.target.value)}
                  >
                    <option value="">Todos · Tipo</option>
                    <option value="debit">Cargo</option>
                    <option value="credit">Abono</option>
                  </Select>
                </ModuleToolbar>

                {loadingTx && txs.length === 0 ? (
                  <div className={s.cuerpo} aria-busy="true">
                    <SkeletonRows rows={5} label="Cargando movimientos…" />
                  </div>
                ) : txError ? (
                  <div className={s.cuerpo}>
                    <Alert
                      tone="danger"
                      role="alert"
                      action={<Button size="sm" onClick={() => setTxReload((n) => n + 1)}>Reintentar</Button>}
                    >
                      {txError}
                    </Alert>
                  </div>
                ) : (
                  <>
                    {txParcial && (
                      <div className={s.cuerpo}>
                        <Alert
                          tone="info"
                          role="status"
                          action={
                            <Button size="sm" onClick={() => setTxTandas((n) => n + 1)} disabled={loadingTx}>
                              Cargar más
                            </Button>
                          }
                        >
                          Se muestran {txParcial.cargadas} de {txParcial.total} movimientos; la búsqueda y los filtros solo miran los cargados.
                        </Alert>
                      </div>
                    )}
                    {visibleTxs.length === 0 ? (
                      <EmptyState
                        icon={txs.length > 0 ? <FilterAltOffOutlinedIcon /> : <SwapHorizOutlinedIcon />}
                        tone="neutral"
                        title={txs.length > 0 ? "Nada coincide con estos filtros." : "No hay movimientos."}
                      />
                    ) : (
                      <DataTable
                        flush
                        columns={txColumns}
                        rows={visibleTxs}
                        rowKey={(t) => t.id}
                        ariaLabel={`Movimientos de ${selected.name}`}
                      />
                    )}
                    {visibleTxs.length > 0 && (
                      <div className={s.totales} aria-label="Totales de los movimientos visibles">
                        <div>
                          <span>Abonos</span>
                          <strong><Money value={txTotals.abonos} bold={false} /></strong>
                        </div>
                        <div>
                          <span>Cargos</span>
                          <strong>−<Money value={txTotals.cargos} bold={false} /></strong>
                        </div>
                        <div>
                          <span>Neto</span>
                          <strong className={txTotals.neto < 0 ? s.negativo : undefined}>
                            <Money value={txTotals.neto} bold={false} />
                          </strong>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Card>
            )}
          </>
        )}
      </FinanceModuleShell>

      <Modal
        open={showTxForm && !!selected}
        onClose={() => setShowTxForm(false)}
        title={selected ? `Registrar movimiento · ${selected.name}` : "Registrar movimiento"}
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setShowTxForm(false)}>Cancelar</Button>
            <Button size="sm" variant="primary" onClick={() => void importTransaction()} disabled={savingTx || !txForm.description.trim() || !txForm.amount}>
              {savingTx ? "Guardando…" : "Registrar"}
            </Button>
          </>
        }
      >
        <FieldGrid>
          <Field label="Fecha" hint="La del estado de cuenta, no la de captura.">
            <DateInput value={txForm.transactionDate} onChange={(e) => setTxForm((f) => ({ ...f, transactionDate: e.target.value }))} />
          </Field>
          <Field label="Tipo" hint="Cargo resta del saldo; abono lo suma.">
            <Select value={txForm.isDebit ? "debit" : "credit"} onChange={(e) => setTxForm((f) => ({ ...f, isDebit: e.target.value === "debit" }))}>
              <option value="debit">Cargo (salida)</option>
              <option value="credit">Abono (entrada)</option>
            </Select>
          </Field>
          <Field label="Descripción" fullWidth hint="Cópiala del estado de cuenta: así se reconoce al conciliar.">
            <Input value={txForm.description} onChange={(e) => setTxForm((f) => ({ ...f, description: e.target.value }))} placeholder="SPEI recibido, comisión bancaria…" />
          </Field>
          <Field label="Monto" hint="Pesos, siempre en positivo. El tipo decide el signo.">
            <Input type="number" inputMode="decimal" min={0} step="0.01" value={txForm.amount || ""} placeholder="0.00" onChange={(e) => setTxForm((f) => ({ ...f, amount: Number(e.target.value) }))} />
          </Field>
          <Field label="Contraparte" optional hint="Quién envía o recibe el dinero.">
            <Input value={txForm.counterpartyName} onChange={(e) => setTxForm((f) => ({ ...f, counterpartyName: e.target.value }))} />
          </Field>
          <Field label="Concepto" optional fullWidth hint="Referencia o clave de rastreo del movimiento.">
            <Input value={txForm.concept} onChange={(e) => setTxForm((f) => ({ ...f, concept: e.target.value }))} />
          </Field>
        </FieldGrid>
      </Modal>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingAccount ? "Editar cuenta bancaria" : "Nueva cuenta bancaria"}
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="sm" variant="primary" onClick={() => void saveAccount()} disabled={saving}>
              {saving ? "Guardando…" : editingAccount ? "Guardar cambios" : "Crear cuenta"}
            </Button>
          </>
        }
      >
        {formErr && <Alert tone="danger" role="alert">{formErr}</Alert>}
        <FieldGrid>
          <Field label="Nombre / alias" hint="Como la llaman en la operación, no como la nombra el banco.">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Cuenta operativa MXN" />
          </Field>
          <Field label="Banco">
            <Input value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} placeholder="Banorte" />
          </Field>
          <Field label="Número de cuenta" hint="Tal como aparece en el estado de cuenta.">
            <Input value={form.accountNumber} onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))} />
          </Field>
          <Field label="CLABE" optional hint="18 dígitos. Es lo que se usa para recibir transferencias.">
            <Input value={form.clabe} onChange={(e) => setForm((f) => ({ ...f, clabe: e.target.value }))} />
          </Field>
          {!editingAccount && (
            <>
              <Field label="Moneda" hint="La del estado de cuenta. No se cambia después.">
                <Select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                  {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
              </Field>
              <Field label="Tipo de cuenta" hint="Separa la operativa de la de inversión y la de nómina.">
                <Select value={form.accountType} onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value }))}>
                  {TIPOS_CUENTA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="Saldo inicial" fullWidth hint="Solo se captura al dar de alta la cuenta; después lo mueven los movimientos. Cópialo del estado de cuenta del día que arrancas.">
                <Input type="number" step="0.01" value={form.currentBalance} onChange={(e) => setForm((f) => ({ ...f, currentBalance: Number(e.target.value) }))} />
              </Field>
            </>
          )}
        </FieldGrid>
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
