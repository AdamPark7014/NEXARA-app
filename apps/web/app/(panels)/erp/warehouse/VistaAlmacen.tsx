"use client";

import { useEffect, useState, useCallback, useDeferredValue, useMemo } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import PanelTabs from "@/components/ui/PanelTabs";
import ContextRail from "@/components/ui/ContextRail";
import InlineAlert from "@/components/ui/InlineAlert";
import Modal from "@/components/ui/Modal";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { SkeletonRows } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { getErpInventorySectionConfig } from "@/lib/section-views";
import { ALMACEN_PATH, HERRAMIENTAS_PATH } from "@/lib/recursos-core";
import {
  listStockLevels,
  mapStockLevelToRow,
  updateStockLevelConfig,
  listWarehouses,
  listCatalogProducts,
  createStockMovement,
  listStockMovements,
  downloadStockMovementsPdf,
  downloadStockMovementSlipPdf,
  listLots,
  createLot,
  getStockValuation,
  getInventoryInsights,
  listCycleCounts,
  scheduleCycleCount,
  recordCycleCountItems,
  closeCycleCount,
  cancelCycleCount,
  listReservations,
  createReservation,
  releaseReservation,
  stockMovementDocumentLabel,
  stockMovementBalanceLabel,
  type StockMovementRow,
  type LotRow,
  type ValuationRow,
  type InventoryInsights,
  type CycleCountRow,
  type StockReservationRow,
} from "@/lib/stock-api";
import { formatApiError } from "@/lib/erp-api";
import { crearEmpaque, listarEmpaques, type Empaque } from "@/lib/almacen-api";
import { etiquetaCantidad, previsualizarConversion } from "@/lib/empaque";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { cantidad, fechaCorta, fechaHoraCorta } from "@/lib/recursos-ui";
import {
  CYCLE_COUNT_STATUS_LABEL,
  MOVEMENT_TYPE_LABEL,
  NIVEL_STOCK,
  RESERVATION_STATUS_LABEL,
  diasParaCaducar,
  etiquetaMovimiento,
  nivelStock,
  varianteConteo,
  varianteMovimiento,
} from "./almacen-etiquetas";
import type { TrazaProducto } from "./HistorialProducto";
import s from "./almacen.module.css";

// Se bajan solo cuando se abren: el resumen trae gráficas y el historial es un panel aparte.
const InteligenciaInventario = dynamic(() => import("./InteligenciaInventario"), {
  ssr: false,
  loading: () => <SkeletonRows rows={6} label="Cargando resumen" />,
});
const HistorialProducto = dynamic(() => import("./HistorialProducto"), { ssr: false });

type StockRow = ReturnType<typeof mapStockLevelToRow>;

const TABS = [
  { key: "dashboard", label: "Resumen" },
  { key: "inventario", label: "Inventario" },
  { key: "movimientos", label: "Movimientos" },
  { key: "lotes", label: "Lotes y caducidad" },
  { key: "valuacion", label: "Valuación" },
  { key: "conteos", label: "Conteos y reservas" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
/** Las vistas que sabe pintar esta pantalla. La landing de Core (`/erp/almacen`) elige cuáles monta. */
export type WarehouseView = TabKey;

type TipoMovimiento = "RECEIPT" | "DISPATCH" | "TRANSFER" | "ADJUSTMENT" | "ADJUSTMENT_OUT" | "RETURN";

const MOVIMIENTO_VACIO = {
  type: "RECEIPT" as TipoMovimiento,
  productId: "",
  warehouseId: "",
  toWarehouseId: "",
  quantity: 1,
  unitCost: "",
  reference: "",
  notes: "",
  /** Presentación en que se captura («Caja»). Vacío = unidad base. */
  packagingId: "",
};

const TITULO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  RECEIPT: "Entrada de inventario",
  DISPATCH: "Salida de inventario",
  TRANSFER: "Traspaso entre almacenes",
  RETURN: "Devolución a almacén",
  ADJUSTMENT: "Ajuste de inventario (alta)",
  ADJUSTMENT_OUT: "Ajuste de inventario (baja)",
};

const LOTE_VACIO = { lotNumber: "", productId: "", expirationDate: "", manufacturingDate: "", notes: "" };

function Campo({ label, children, ancho }: { label: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <label className={`${s.campo} ${ancho ? s.ancho : ""}`}>
      <span className={s.etiqueta}>{label}</span>
      {children}
    </label>
  );
}

export function VistaAlmacen({
  embedded,
}: {
  /**
   * Montada dentro de otra pantalla (la landing `/erp/almacen`): en vez de su encabezado
   * enseña solo su fila de acciones, y se limita a las vistas de `views`. Con una sola
   * vista tampoco pinta sus pestañas, porque las de arriba ya mandan.
   */
  embedded?: { views: readonly WarehouseView[] };
} = {}) {
  const { user } = useUser();
  const cfg = useMemo(() => getErpInventorySectionConfig(user, "warehouse"), [user]);
  const token = user?.token ?? "";
  const router = useRouter();
  // Montada en Core (`/erp/almacen`) o en su ruta vieja (`/erp/warehouse`): los enlaces siguen a la página.
  const pathname = usePathname() ?? "";
  const enCore = pathname === ALMACEN_PATH || pathname.startsWith(`${ALMACEN_PATH}/`);
  const almacenBase = enCore ? ALMACEN_PATH : "/erp/warehouse";
  // Los avisos traen `?productId=` o `?movementId=`: se leen de la URL al montar.
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [movementId, setMovementId] = useState<string | null>(null);

  const [items, setItems] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cargadoUnaVez, setCargadoUnaVez] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const busqueda = useDeferredValue(searchQ);
  const [filterEstado, setFilterEstado] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StockRow | null>(null);
  const [minimo, setMinimo] = useState(5);
  const [savingMinimo, setSavingMinimo] = useState(false);
  const [products, setProducts] = useState<{ id: number; name: string; sku: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([]);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [movement, setMovement] = useState({ ...MOVIMIENTO_VACIO });
  // Norma de empaque del producto elegido: se captura en cajas y se guarda en piezas.
  const [empaques, setEmpaques] = useState<Empaque[]>([]);
  const [nuevoEmpaque, setNuevoEmpaque] = useState<{ nombre: string; piezas: string } | null>(null);
  const [guardandoEmpaque, setGuardandoEmpaque] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [savingMovement, setSavingMovement] = useState(false);
  const [showWarehouseForm, setShowWarehouseForm] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState({ name: "", code: "", address: "", city: "" });
  const [savingWarehouse, setSavingWarehouse] = useState(false);
  const [confirmar, setConfirmar] = useState<ConfirmState | null>(null);

  const [tab, setTab] = useState<TabKey>(() => embedded?.views?.[0] ?? "inventario");
  const [insights, setInsights] = useState<InventoryInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementTypeFilter, setMovementTypeFilter] = useState("");
  const [movementWarehouseFilter, setMovementWarehouseFilter] = useState("");
  const [movementProductFilter, setMovementProductFilter] = useState("");
  const [movementFromDate, setMovementFromDate] = useState("");
  const [movementToDate, setMovementToDate] = useState("");
  const [productTrace, setProductTrace] = useState<TrazaProducto | null>(null);
  const [productTraceLoading, setProductTraceLoading] = useState(false);

  const [lots, setLots] = useState<LotRow[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [showLotForm, setShowLotForm] = useState(false);
  const [lotForm, setLotForm] = useState({ ...LOTE_VACIO });
  const [savingLot, setSavingLot] = useState(false);
  const [lotSaveErr, setLotSaveErr] = useState<string | null>(null);

  const [valuation, setValuation] = useState<ValuationRow[]>([]);
  const [valuationLoading, setValuationLoading] = useState(false);
  const [valuationWarehouseFilter, setValuationWarehouseFilter] = useState("");

  const [cycleCounts, setCycleCounts] = useState<CycleCountRow[]>([]);
  const [cycleCountsLoading, setCycleCountsLoading] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ warehouseId: "", scheduledFor: "", notes: "" });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [activeCount, setActiveCount] = useState<CycleCountRow | null>(null);
  const [captureQty, setCaptureQty] = useState<Record<number, string>>({});
  const [savingCapture, setSavingCapture] = useState(false);
  const [closingCount, setClosingCount] = useState(false);

  const [reservations, setReservations] = useState<StockReservationRow[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [showReservationForm, setShowReservationForm] = useState(false);
  const [reservationForm, setReservationForm] = useState({ productId: "", warehouseId: "", quantity: 1, reason: "", expiresAt: "" });
  const [savingReservation, setSavingReservation] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("productId");
    setProductFilter(pid);
    setMovementId(params.get("movementId"));
    if (pid) setMovementProductFilter(pid);
  }, [pathname]);

  /** Quita `?productId=` / `?movementId=` sin recargar la pantalla. */
  const limpiarFiltroUrl = (query = "") => {
    setProductFilter(null);
    setMovementId(null);
    router.replace(`${almacenBase}${query}`, { scroll: false });
  };

  const loadWarehouses = useCallback(() => {
    if (!token) return;
    void listWarehouses(token).then(setWarehouses).catch(() => undefined);
  }, [token]);

  const createWarehouse = async () => {
    if (!token || !warehouseForm.name.trim()) return;
    setSavingWarehouse(true);
    try {
      const { buildApiUrl } = await import("@/lib/api-base");
      const res = await fetch(buildApiUrl("warehouse"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: warehouseForm.name.trim(),
          code: warehouseForm.code.trim() || warehouseForm.name.trim().toUpperCase().slice(0, 6).replace(/\s/g, "-"),
          address: warehouseForm.address.trim() || undefined,
          city: warehouseForm.city.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => ""));
      toast.success(`Almacén «${warehouseForm.name.trim()}» creado`);
      setShowWarehouseForm(false);
      setWarehouseForm({ name: "", code: "", address: "", city: "" });
      void loadWarehouses();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo crear el almacén"));
    } finally {
      setSavingWarehouse(false);
    }
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const levels = await listStockLevels(token);
      setItems(levels.map(mapStockLevelToRow));
      setCargadoUnaVez(true);
    } catch (e) {
      // Un refresco fallido deja a la vista lo que ya estaba cargado.
      setLoadError(formatApiError(e, "No se pudo cargar el inventario"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  useEffect(() => {
    if (!token) return;
    void listCatalogProducts(token).then(setProducts).catch(() => undefined);
  }, [token]);

  const vistasVisibles = useMemo(
    () => (embedded?.views ? TABS.filter((t) => embedded.views.includes(t.key)) : [...TABS]),
    [embedded],
  );

  useEffect(() => {
    // Un aviso apunta a un movimiento: solo salta a esa vista si está montada aquí.
    if (movementId && vistasVisibles.some((t) => t.key === "movimientos")) setTab("movimientos");
  }, [movementId, vistasVisibles]);

  // Presentaciones del producto elegido en el formulario de movimiento.
  useEffect(() => {
    const productId = Number(movement.productId);
    if (!token || !Number.isFinite(productId) || productId <= 0) {
      setEmpaques([]);
      return;
    }
    let vigente = true;
    setNuevoEmpaque(null);
    void listarEmpaques(token, productId)
      .then((res) => {
        if (vigente) setEmpaques(res);
      })
      .catch(() => {
        if (vigente) setEmpaques([]);
      });
    return () => {
      vigente = false;
    };
  }, [token, movement.productId]);

  /** Alta rápida de presentación: se descubre aquí, cuando el producto no la tiene. */
  const guardarEmpaque = async () => {
    const productId = Number(movement.productId);
    if (!token || !nuevoEmpaque || !(productId > 0)) return;
    const nombre = nuevoEmpaque.nombre.trim();
    const piezas = Number(nuevoEmpaque.piezas);
    if (!nombre || !Number.isFinite(piezas) || piezas <= 0) {
      toast.error("Escribe el nombre y cuántas piezas trae");
      return;
    }
    setGuardandoEmpaque(true);
    try {
      const creado = await crearEmpaque(token, productId, { nombre, piezasPorUnidad: piezas });
      setEmpaques((prev) => [...prev, creado]);
      setMovement((m) => ({ ...m, packagingId: String(creado.id) }));
      setNuevoEmpaque(null);
      toast.success(`Presentación «${nombre}» registrada`);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo guardar la presentación"));
    } finally {
      setGuardandoEmpaque(false);
    }
  };

  const visibleMovements = useMemo(() => {
    if (!movementId) return movements;
    const target = Number(movementId);
    if (!Number.isFinite(target)) return movements;
    return [...movements].sort((a, b) => {
      if (a.id === target) return -1;
      if (b.id === target) return 1;
      return 0;
    });
  }, [movements, movementId]);

  const openProductTrace = useCallback(async (productId: number, sku?: string, name?: string) => {
    if (!token || !productId) return;
    setProductTraceLoading(true);
    setProductTrace({
      productId,
      sku: sku ?? "—",
      name: name ?? "Producto",
      levels: [],
      movements: [],
    });
    try {
      const [levels, movs] = await Promise.all([
        listStockLevels(token).then((rows) =>
          rows.map(mapStockLevelToRow).filter((r) => r.productId === productId),
        ),
        listStockMovements(token, { productId }),
      ]);
      setProductTrace({
        productId,
        sku: levels[0]?.sku ?? sku ?? "—",
        name: levels[0]?.nombre ?? name ?? "Producto",
        levels,
        movements: movs,
      });
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cargar el historial del producto"));
      setProductTrace(null);
    } finally {
      setProductTraceLoading(false);
    }
  }, [token]);

  const cerrarHistorial = useCallback(() => setProductTrace(null), []);

  const loadMovements = useCallback(async () => {
    if (!token) return;
    setMovementsLoading(true);
    try {
      const rows = await listStockMovements(token, {
        type: movementTypeFilter || undefined,
        warehouseId: movementWarehouseFilter ? Number(movementWarehouseFilter) : undefined,
        productId: movementProductFilter ? Number(movementProductFilter) : undefined,
        from: movementFromDate || undefined,
        to: movementToDate ? `${movementToDate}T23:59:59.999` : undefined,
      });
      setMovements(rows);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudieron cargar los movimientos"));
    } finally {
      setMovementsLoading(false);
    }
  }, [token, movementTypeFilter, movementWarehouseFilter, movementProductFilter, movementFromDate, movementToDate]);

  const saveMovement = async () => {
    if (!token || !movement.productId || movement.quantity <= 0) return;
    if (movement.type === "TRANSFER") {
      if (!movement.warehouseId || !movement.toWarehouseId) return;
      if (movement.warehouseId === movement.toWarehouseId) {
        toast.error("El almacén de origen y el de destino deben ser distintos");
        return;
      }
    } else if (!movement.warehouseId) {
      return;
    }
    setSavingMovement(true);
    try {
      const apiType = movement.type === "ADJUSTMENT_OUT" ? "ADJUSTMENT" : movement.type;
      const payload: Parameters<typeof createStockMovement>[1] = {
        type: apiType,
        productId: Number(movement.productId),
        quantity: movement.quantity,
        unitCost: movement.unitCost ? Number(movement.unitCost) : undefined,
        // Con presentación, la API convierte a unidad base y guarda lo tecleado.
        packagingId: movement.packagingId ? Number(movement.packagingId) : undefined,
        cantidadCapturada: movement.packagingId ? movement.quantity : undefined,
        reference: movement.reference.trim() || undefined,
        notes: movement.notes.trim() || undefined,
      };
      if (movement.type === "RECEIPT" || movement.type === "ADJUSTMENT" || movement.type === "RETURN") {
        payload.toWarehouseId = Number(movement.warehouseId);
      } else if (movement.type === "DISPATCH" || movement.type === "ADJUSTMENT_OUT") {
        payload.fromWarehouseId = Number(movement.warehouseId);
      } else if (movement.type === "TRANSFER") {
        payload.fromWarehouseId = Number(movement.warehouseId);
        payload.toWarehouseId = Number(movement.toWarehouseId);
      }
      await createStockMovement(token, payload);
      const movedProductId = Number(movement.productId);
      setShowMovementForm(false);
      setMovement({ ...MOVIMIENTO_VACIO });
      void load();
      if (tab === "movimientos") void loadMovements();
      if (productTrace?.productId === movedProductId) {
        void openProductTrace(movedProductId, productTrace.sku, productTrace.name);
      }
      toast.success("Movimiento registrado");
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo registrar el movimiento"));
    } finally {
      setSavingMovement(false);
    }
  };

  const clearMovementFilters = () => {
    setMovementTypeFilter("");
    setMovementWarehouseFilter("");
    setMovementProductFilter("");
    setMovementFromDate("");
    setMovementToDate("");
  };

  const hasMovementFilters = Boolean(
    movementTypeFilter || movementWarehouseFilter || movementProductFilter || movementFromDate || movementToDate,
  );

  const downloadMovementsPdf = async (opts?: { productId?: number }) => {
    if (!token) return;
    setExportingPdf(true);
    try {
      const forProduct = opts?.productId != null;
      await downloadStockMovementsPdf(token, {
        productId: forProduct ? opts.productId : (movementProductFilter ? Number(movementProductFilter) : undefined),
        warehouseId: forProduct ? undefined : (movementWarehouseFilter ? Number(movementWarehouseFilter) : undefined),
        type: forProduct ? undefined : (movementTypeFilter || undefined),
        from: forProduct ? undefined : (movementFromDate || undefined),
        to: forProduct ? undefined : (movementToDate || undefined),
      });
      toast.success(forProduct ? "Historial del producto descargado" : "Kárdex descargado");
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo generar el PDF"));
    } finally {
      setExportingPdf(false);
    }
  };

  const downloadMovementSlip = async (id: number) => {
    if (!token) return;
    try {
      await downloadStockMovementSlipPdf(token, id);
      toast.success("Comprobante descargado");
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo generar el comprobante"));
    }
  };

  const openEdit = (row: StockRow) => {
    setEditing(row);
    setMinimo(row.minimo);
  };

  const saveMinimo = async () => {
    if (!token || !editing) return;
    setSavingMinimo(true);
    try {
      await updateStockLevelConfig(token, editing.id, { minStock: minimo, reorderPoint: minimo });
      setItems((prev) => prev.map((i) => (i.id === editing.id ? { ...i, minimo } : i)));
      setEditing(null);
      toast.success("Mínimo actualizado");
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo actualizar el mínimo de stock"));
    } finally {
      setSavingMinimo(false);
    }
  };

  const loadLots = useCallback(async () => {
    if (!token) return;
    setLotsLoading(true);
    try {
      setLots(await listLots(token));
    } catch (e) {
      toast.error(formatApiError(e, "No se pudieron cargar los lotes"));
    } finally {
      setLotsLoading(false);
    }
  }, [token]);

  const abrirNuevoLote = () => {
    setLotForm({ ...LOTE_VACIO });
    setLotSaveErr(null);
    setShowLotForm(true);
  };

  const saveLot = async () => {
    if (!token || !lotForm.lotNumber.trim() || !lotForm.productId) {
      setLotSaveErr("Escribe el número de lote y elige el producto.");
      return;
    }
    setSavingLot(true);
    setLotSaveErr(null);
    try {
      const created = await createLot(token, {
        lotNumber: lotForm.lotNumber.trim(),
        productId: Number(lotForm.productId),
        expirationDate: lotForm.expirationDate || undefined,
        manufacturingDate: lotForm.manufacturingDate || undefined,
        notes: lotForm.notes.trim() || undefined,
      });
      setLots((prev) => [created, ...prev]);
      setShowLotForm(false);
      setLotForm({ ...LOTE_VACIO });
      toast.success("Lote registrado");
    } catch (e) {
      setLotSaveErr(formatApiError(e, "No se pudo crear el lote"));
    } finally {
      setSavingLot(false);
    }
  };

  const loadValuation = useCallback(async () => {
    if (!token) return;
    setValuationLoading(true);
    try {
      setValuation(await getStockValuation(token, valuationWarehouseFilter ? Number(valuationWarehouseFilter) : undefined));
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cargar la valuación"));
    } finally {
      setValuationLoading(false);
    }
  }, [token, valuationWarehouseFilter]);

  const loadInsights = useCallback(async () => {
    if (!token) return;
    setInsightsLoading(true);
    try {
      setInsights(await getInventoryInsights(token));
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cargar el resumen del inventario"));
    } finally {
      setInsightsLoading(false);
    }
  }, [token]);

  const loadCycleCounts = useCallback(async () => {
    if (!token) return;
    setCycleCountsLoading(true);
    try {
      setCycleCounts(await listCycleCounts(token));
    } catch (e) {
      toast.error(formatApiError(e, "No se pudieron cargar los conteos"));
    } finally {
      setCycleCountsLoading(false);
    }
  }, [token]);

  const loadReservations = useCallback(async () => {
    if (!token) return;
    setReservationsLoading(true);
    try {
      setReservations(await listReservations(token));
    } catch (e) {
      toast.error(formatApiError(e, "No se pudieron cargar las reservas"));
    } finally {
      setReservationsLoading(false);
    }
  }, [token]);

  const submitSchedule = async () => {
    if (!token || !scheduleForm.warehouseId || !scheduleForm.scheduledFor) return;
    setSavingSchedule(true);
    try {
      await scheduleCycleCount(token, {
        warehouseId: Number(scheduleForm.warehouseId),
        scheduledFor: scheduleForm.scheduledFor,
        notes: scheduleForm.notes.trim() || undefined,
      });
      setShowScheduleForm(false);
      setScheduleForm({ warehouseId: "", scheduledFor: "", notes: "" });
      toast.success("Conteo programado");
      void loadCycleCounts();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo programar el conteo"));
    } finally {
      setSavingSchedule(false);
    }
  };

  const openCapture = (count: CycleCountRow) => {
    setActiveCount(count);
    const initial: Record<number, string> = {};
    for (const item of count.items ?? []) {
      initial[item.productId] = item.countedQty != null ? String(item.countedQty) : "";
    }
    setCaptureQty(initial);
  };

  const submitCapture = async () => {
    if (!token || !activeCount) return;
    const capturados = Object.entries(captureQty)
      .filter(([, v]) => v.trim() !== "")
      .map(([productId, v]) => ({ productId: Number(productId), countedQty: Number(v) }));
    if (!capturados.length) {
      toast.error("Escribe al menos una cantidad contada");
      return;
    }
    setSavingCapture(true);
    try {
      const updated = await recordCycleCountItems(token, activeCount.id, capturados);
      setActiveCount(updated);
      toast.success("Captura guardada");
      void loadCycleCounts();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo guardar la captura"));
    } finally {
      setSavingCapture(false);
    }
  };

  const submitCloseCount = async () => {
    if (!token || !activeCount) return;
    setClosingCount(true);
    try {
      await closeCycleCount(token, activeCount.id);
      toast.success("Conteo cerrado: las diferencias ya se ajustaron en el stock");
      setActiveCount(null);
      void loadCycleCounts();
      void load();
      if (tab === "dashboard") void loadInsights();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cerrar el conteo"));
    } finally {
      setClosingCount(false);
    }
  };

  const pedirCerrarConteo = () =>
    setConfirmar({
      title: "Cerrar conteo",
      message: "Las diferencias entre lo contado y el sistema se ajustarán en el stock. Esto no se puede deshacer.",
      confirmLabel: "Cerrar y ajustar",
      danger: false,
      fn: submitCloseCount,
    });

  const pedirCancelarConteo = (count: CycleCountRow) =>
    setConfirmar({
      title: "Cancelar conteo",
      message: `¿Cancelar el conteo ${count.countNumber}? Lo capturado se descarta y el stock no cambia.`,
      confirmLabel: "Cancelar conteo",
      fn: async () => {
        if (!token) return;
        try {
          await cancelCycleCount(token, count.id);
          void loadCycleCounts();
          if (activeCount?.id === count.id) setActiveCount(null);
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo cancelar el conteo"));
        }
      },
    });

  const submitReservation = async () => {
    if (!token || !reservationForm.productId || !reservationForm.warehouseId || !reservationForm.reason.trim()) return;
    setSavingReservation(true);
    try {
      await createReservation(token, {
        productId: Number(reservationForm.productId),
        warehouseId: Number(reservationForm.warehouseId),
        quantity: reservationForm.quantity,
        reason: reservationForm.reason.trim(),
        expiresAt: reservationForm.expiresAt || undefined,
      });
      setShowReservationForm(false);
      setReservationForm({ productId: "", warehouseId: "", quantity: 1, reason: "", expiresAt: "" });
      toast.success("Stock reservado");
      void loadReservations();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo crear la reserva"));
    } finally {
      setSavingReservation(false);
    }
  };

  const pedirLiberarReserva = (r: StockReservationRow) =>
    setConfirmar({
      title: "Liberar reserva",
      message: `Se devuelven ${cantidad(r.quantity)} de «${r.product?.name ?? "este producto"}» al stock disponible.`,
      confirmLabel: "Liberar",
      danger: false,
      fn: async () => {
        if (!token) return;
        try {
          await releaseReservation(token, r.id);
          void loadReservations();
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo liberar la reserva"));
        }
      },
    });

  useEffect(() => {
    if (tab === "dashboard") void loadInsights();
  }, [tab, loadInsights]);

  useEffect(() => {
    if (tab === "movimientos") void loadMovements();
  }, [tab, loadMovements]);

  useEffect(() => {
    if (tab === "lotes") void loadLots();
  }, [tab, loadLots]);

  useEffect(() => {
    if (tab === "valuacion") void loadValuation();
  }, [tab, loadValuation]);

  useEffect(() => {
    if (tab === "conteos") {
      void loadCycleCounts();
      void loadReservations();
    }
  }, [tab, loadCycleCounts, loadReservations]);

  /** «Actualizar» recarga el stock y la vista abierta, no solo el stock. */
  const refrescar = () => {
    void load();
    if (tab === "dashboard") void loadInsights();
    else if (tab === "movimientos") void loadMovements();
    else if (tab === "lotes") void loadLots();
    else if (tab === "valuacion") void loadValuation();
    else if (tab === "conteos") {
      void loadCycleCounts();
      void loadReservations();
    }
  };

  const resumen = useMemo(() => {
    let sinStock = 0;
    let bajoMinimo = 0;
    let valorTotal = 0;
    const porCategoria: Record<string, number> = {};
    for (const row of items) {
      const nivel = nivelStock(row.existencia, row.minimo);
      if (nivel === "agotado") sinStock += 1;
      else if (nivel === "bajo") bajoMinimo += 1;
      valorTotal += row.existencia * row.costo;
      const cat = row.categoria || "Sin categoría";
      porCategoria[cat] = (porCategoria[cat] ?? 0) + 1;
    }
    const categorias = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { sinStock, bajoMinimo, valorTotal, categorias };
  }, [items]);

  const visibleItems = useMemo(() => {
    let rows = items;
    if (productFilter) {
      const pid = Number(productFilter);
      if (!Number.isNaN(pid)) rows = rows.filter((r) => r.productId === pid);
    }
    const q = busqueda.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        (r.nombre ?? "").toLowerCase().includes(q) ||
        (r.sku ?? "").toLowerCase().includes(q) ||
        (r.categoria ?? "").toLowerCase().includes(q)
      );
    }
    if (filterEstado === "sin_stock") rows = rows.filter((r) => nivelStock(r.existencia, r.minimo) === "agotado");
    else if (filterEstado === "bajo_minimo") rows = rows.filter((r) => nivelStock(r.existencia, r.minimo) === "bajo");
    else if (filterEstado === "ok") rows = rows.filter((r) => r.existencia >= r.minimo);
    return rows;
  }, [items, productFilter, busqueda, filterEstado]);

  const columns: Column<StockRow>[] = [
    { key: "sku", label: "SKU", render: (r) => <code style={{ fontSize: 11.5 }}>{r.sku}</code>, width: 110 },
    {
      key: "nombre",
      label: "Producto",
      render: (r) => (
        <button
          type="button"
          className={s.productoBtn}
          onClick={() => r.productId && void openProductTrace(r.productId, r.sku, r.nombre)}
          title="Ver historial de movimientos"
        >
          <div className={s.productoNombre}>{r.nombre}</div>
          <div className={s.productoMeta}>
            {r.categoria} · {r.ubicacion}
          </div>
        </button>
      ),
    },
    {
      key: "existencia",
      label: "Existencia",
      render: (r) => {
        const nivel = NIVEL_STOCK[nivelStock(r.existencia, r.minimo)];
        const pct = r.minimo > 0 ? Math.min(100, (r.existencia / (r.minimo * 2)) * 100) : (r.existencia > 0 ? 50 : 0);
        return (
          <div className={s.stock}>
            <div className={s.stockFila}>
              <span className={s.stockNum}>{cantidad(r.existencia)}</span>
              <Tag variant={nivel.variante} size="sm">{nivel.texto}</Tag>
            </div>
            <div className={s.stockBarra} aria-hidden="true">
              <div className={s.stockRelleno} style={{ width: `${pct}%`, background: nivel.color }} />
            </div>
          </div>
        );
      },
      width: 170,
    },
    { key: "minimo", label: "Mínimo", accessor: (r) => cantidad(r.minimo), width: 80, numeric: true },
    { key: "costo", label: "Costo unit.", render: (r) => <Money value={r.costo} />, width: 110, numeric: true },
    {
      key: "id",
      label: <span className={s.srOnly}>Acciones</span>,
      render: (r) => (
        <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
          {r.productId ? (
            <button
              type="button"
              className={s.iconBtn}
              onClick={() => void openProductTrace(r.productId!, r.sku, r.nombre)}
              title="Historial"
              aria-label={`Ver historial de ${r.nombre}`}
            >
              ⏱
            </button>
          ) : null}
          {cfg.canEdit ? (
            <button
              type="button"
              className={s.iconBtn}
              onClick={() => openEdit(r)}
              title="Editar mínimo"
              aria-label={`Editar mínimo de ${r.nombre}`}
            >
              ✎
            </button>
          ) : null}
        </div>
      ),
      width: 84,
    },
  ];

  const movementColumns: Column<StockMovementRow>[] = [
    { key: "movementNumber", label: "Folio", render: (m) => <code style={{ fontSize: 11.5 }}>{m.movementNumber}</code>, width: 100 },
    { key: "type", label: "Tipo", render: (m) => <Tag variant={varianteMovimiento(m.type)}>{etiquetaMovimiento(m.type)}</Tag>, width: 110 },
    { key: "sku", label: "SKU", render: (m) => <code style={{ fontSize: 11 }}>{m.product?.sku ?? "—"}</code>, width: 88 },
    { key: "product", label: "Producto", render: (m) => (
      <button
        type="button"
        className={s.productoBtn}
        disabled={!m.product?.id}
        onClick={() => m.product?.id && void openProductTrace(m.product.id, m.product.sku, m.product.name)}
      >
        <div style={{ fontSize: 13, color: m.product?.id ? "var(--primary)" : undefined }}>{m.product?.name ?? "—"}</div>
        {m.lot ? <div className={s.productoMeta}>Lote {m.lot.lotNumber}</div> : null}
      </button>
    ) },
    { key: "route", label: "Almacén", render: (m) => (
      <span style={{ fontSize: 12 }}>{m.fromWarehouse?.name ?? "—"} → {m.toWarehouse?.name ?? "—"}</span>
    ), width: 160 },
    // «2 cajas · 24 pz»: lo que se tecleó y lo que de verdad se movió.
    { key: "quantity", label: "Cantidad", render: (m) => (
      <strong style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{etiquetaCantidad(m)}</strong>
    ), width: 118, numeric: true },
    { key: "balance", label: "Saldo", render: (m) => (
      <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }} title="Existencia antes → después">
        {stockMovementBalanceLabel(m)}
      </span>
    ), width: 90, numeric: true },
    { key: "document", label: "Referencia", render: (m) => (
      <span style={{ fontSize: 11.5 }} title={m.notes ?? undefined}>{stockMovementDocumentLabel(m)}</span>
    ), width: 130 },
    { key: "createdAt", label: "Fecha", render: (m) => (
      <time dateTime={m.createdAt} style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{fechaHoraCorta(m.createdAt)}</time>
    ), width: 120 },
    { key: "createdBy", label: "Registró", accessor: (m) => m.createdBy?.nombre ?? "—", width: 100 },
    {
      key: "actions",
      label: <span className={s.srOnly}>Comprobante</span>,
      width: 64,
      render: (m) => (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Descargar comprobante ${m.movementNumber}`}
          onClick={(e) => { e.stopPropagation(); void downloadMovementSlip(m.id); }}
        >
          PDF
        </Button>
      ),
    },
  ];

  const ahora = Date.now();
  const lotColumns: Column<LotRow>[] = [
    { key: "lotNumber", label: "Lote", render: (l) => <code style={{ fontSize: 12 }}>{l.lotNumber}</code>, width: 130 },
    { key: "product", label: "Producto", render: (l) => (
      <div>
        <div style={{ fontSize: 13 }}>{l.product?.name ?? "—"}</div>
        <div className={s.productoMeta}>{l.product?.sku}</div>
      </div>
    ) },
    { key: "manufacturingDate", label: "Fabricación", render: (l) => l.manufacturingDate ? <span style={{ fontSize: 12 }}>{fechaCorta(l.manufacturingDate)}</span> : <span style={{ color: "var(--text-tertiary)" }}>—</span>, width: 120 },
    { key: "expirationDate", label: "Caducidad", width: 160, render: (l) => {
      const dias = diasParaCaducar(l.expirationDate, ahora);
      if (dias == null) return <span style={{ color: "var(--text-tertiary)" }}>Sin caducidad</span>;
      if (dias < 0) return <Tag variant="danger">Caducó hace {Math.abs(dias)} días</Tag>;
      if (dias <= 30) return <Tag variant="warning">{dias === 0 ? "Caduca hoy" : `Caduca en ${dias} días`}</Tag>;
      return <span style={{ fontSize: 12 }}>{fechaCorta(l.expirationDate)}</span>;
    } },
    { key: "notes", label: "Notas", accessor: (l) => l.notes ?? "—" },
  ];

  const valuationColumns: Column<ValuationRow>[] = [
    { key: "product", label: "Producto", render: (v) => (
      <div>
        <div style={{ fontSize: 13 }}>{v.product?.name ?? "—"}</div>
        <div className={s.productoMeta}>{v.product?.sku}</div>
      </div>
    ) },
    { key: "warehouse", label: "Almacén", accessor: (v) => v.warehouse?.name ?? "—", width: 150 },
    { key: "quantity", label: "Cantidad", render: (v) => cantidad(v.quantity), width: 90, numeric: true },
    { key: "availableQty", label: "Disponible", render: (v) => cantidad(v.availableQty), width: 100, numeric: true },
    { key: "unitCost", label: "Costo unit.", render: (v) => <Money value={Number(v.unitCost ?? 0)} />, width: 110, numeric: true },
    { key: "totalValue", label: "Valor total", render: (v) => <Money value={v.totalValue} />, width: 130, numeric: true },
  ];

  const cycleCountColumns: Column<CycleCountRow>[] = [
    { key: "countNumber", label: "Folio", render: (c) => <code style={{ fontSize: 11.5 }}>{c.countNumber}</code>, width: 110 },
    { key: "warehouse", label: "Almacén", accessor: (c) => c.warehouse?.name ?? "—", width: 150 },
    {
      key: "status", label: "Estado", width: 130,
      render: (c) => <Tag variant={varianteConteo(c.status)}>{CYCLE_COUNT_STATUS_LABEL[c.status] ?? "Sin estado"}</Tag>,
    },
    { key: "scheduledFor", label: "Fecha", render: (c) => <span style={{ fontSize: 12 }}>{fechaCorta(c.scheduledFor)}</span>, width: 110 },
    {
      key: "progress", label: "Contados", width: 110, numeric: true,
      render: (c) => {
        const total = c._count?.items ?? c.items?.length ?? 0;
        const done = (c.items ?? []).filter((i) => i.countedQty != null).length;
        return <span style={{ fontSize: 12 }}>{done} de {total}</span>;
      },
    },
    {
      key: "actions", label: <span className={s.srOnly}>Acciones</span>, width: 200,
      render: (c) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          {(c.status === "SCHEDULED" || c.status === "IN_PROGRESS") && (
            <>
              <Button size="sm" variant="secondary" onClick={() => openCapture(c)}>Capturar</Button>
              <Button size="sm" variant="ghost" onClick={() => pedirCancelarConteo(c)}>Cancelar</Button>
            </>
          )}
          {c.status === "CLOSED" && (
            <Button size="sm" variant="ghost" onClick={() => openCapture(c)}>Ver detalle</Button>
          )}
        </div>
      ),
    },
  ];

  const reservationColumns: Column<StockReservationRow>[] = [
    { key: "product", label: "Producto", render: (r) => (
      <div>
        <div style={{ fontSize: 13 }}>{r.product?.name ?? "—"}</div>
        <div className={s.productoMeta}>{r.product?.sku}</div>
      </div>
    ) },
    { key: "warehouse", label: "Almacén", accessor: (r) => r.warehouse?.name ?? "—", width: 140 },
    { key: "quantity", label: "Cantidad", render: (r) => <strong style={{ fontSize: 13 }}>{cantidad(r.quantity)}</strong>, width: 90, numeric: true },
    { key: "reason", label: "Motivo", accessor: (r) => r.reason },
    {
      key: "status", label: "Estado", width: 110,
      render: (r) => (
        <Tag variant={r.status === "ACTIVE" ? "warning" : r.status === "CONSUMED" ? "positive" : "default"}>
          {RESERVATION_STATUS_LABEL[r.status] ?? "Liberada"}
        </Tag>
      ),
    },
    { key: "expiresAt", label: "Vence", render: (r) => r.expiresAt ? <span style={{ fontSize: 12 }}>{fechaCorta(r.expiresAt)}</span> : <span style={{ color: "var(--text-tertiary)" }}>—</span>, width: 110 },
    {
      key: "actions", label: <span className={s.srOnly}>Acciones</span>, width: 90,
      render: (r) => r.status === "ACTIVE" ? <Button size="sm" variant="ghost" onClick={() => pedirLiberarReserva(r)}>Liberar</Button> : null,
    },
  ];

  const activeCountItems = activeCount?.items ?? [];
  const activeCountClosed = activeCount?.status === "CLOSED" || activeCount?.status === "CANCELLED";

  const totalValuation = useMemo(() => valuation.reduce((sum, v) => sum + v.totalValue, 0), [valuation]);
  const expiringLotsCount = useMemo(
    () => lots.filter((l) => {
      const dias = diasParaCaducar(l.expirationDate);
      return dias != null && dias <= 30;
    }).length,
    [lots],
  );

  const recargando = loading && cargadoUnaVez;
  const abrirEntrada = () => setShowMovementForm(true);

  const acciones = (
    <div style={{ display: "flex", gap: embedded ? 6 : 8, flexWrap: "wrap" }}>
      <Button variant="ghost" size="sm" onClick={refrescar} disabled={recargando}>
        {recargando ? "Actualizando…" : "Actualizar"}
      </Button>
      {cfg.canCreate && (
        <>
          <Button variant="secondary" size="sm" onClick={() => setShowWarehouseForm(true)}>Nuevo almacén</Button>
          <Button variant="primary" size="sm" onClick={abrirEntrada}>
            {embedded ? "Entrada" : "Entrada de stock"}
          </Button>
        </>
      )}
    </div>
  );

  const elegido = empaques.find((e) => String(e.id) === movement.packagingId);
  const previa = previsualizarConversion(
    movement.quantity,
    elegido ? { ...elegido, piezasPorUnidad: Number(elegido.piezasPorUnidad) } : null,
  );
  const esEntrada = movement.type === "RECEIPT" || movement.type === "ADJUSTMENT" || movement.type === "RETURN";
  const movimientoIncompleto =
    !movement.productId || !movement.warehouseId || movement.quantity <= 0 || (movement.type === "TRANSFER" && !movement.toWarehouseId);

  return (
    <>
      {!embedded && (
        <PageHeader
          eyebrow="ERP · Almacén"
          title="Inventario y stock"
          subtitle="Existencias, reorden y valuación por almacén."
          density="ops"
          actions={acciones}
        />
      )}

      {!embedded && <ContextRail
        ariaLabel="Catálogos de inventario"
        items={
          enCore
            ? [
                // En Core no hay CRM: el catálogo se consulta desde Cotizaciones.
                { id: "stock", label: "Stock de productos", active: true },
                { id: "tools", label: "Herramientas", href: `${HERRAMIENTAS_PATH}?tab=inventory` },
              ]
            : [
                { id: "stock", label: "Stock de productos", active: true },
                { id: "catalog", label: "Catálogo CRM", href: "/crm/products" },
                { id: "tools", label: "Herramientas OPS", href: "/ops/tools?tab=inventory" },
              ]
        }
      />}

      {/* Embedded: acciones van en la misma fila que las sub-pestañas (sin barra extra bajo PageHeader). */}
      {vistasVisibles.length > 1 ? (
        embedded ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <PanelTabs
                ariaLabel="Vistas de almacén"
                value={tab}
                onChange={setTab}
                tabs={vistasVisibles.map((t) => ({ key: t.key, label: t.label }))}
              />
            </div>
            {acciones}
          </div>
        ) : (
          <PanelTabs
            ariaLabel="Vistas de almacén"
            value={tab}
            onChange={setTab}
            tabs={vistasVisibles.map((t) => ({ key: t.key, label: t.label }))}
          />
        )
      ) : null}

      {/* ── Nuevo almacén (disponible desde cualquier pestaña) ── */}
      <Modal
        open={showWarehouseForm}
        onClose={() => setShowWarehouseForm(false)}
        title="Nuevo almacén"
        maxWidth={560}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowWarehouseForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void createWarehouse()} disabled={!warehouseForm.name.trim()} loading={savingWarehouse}>
              Crear almacén
            </Button>
          </>
        }
      >
        <form className={s.rejilla} onSubmit={(e) => { e.preventDefault(); void createWarehouse(); }}>
          <Campo label="Nombre" ancho>
            <input className={s.input} value={warehouseForm.name} onChange={(e) => setWarehouseForm((f) => ({ ...f, name: e.target.value }))} placeholder="Almacén Central, Bodega Norte…" required />
          </Campo>
          <Campo label="Código (opcional)">
            <input className={s.input} value={warehouseForm.code} onChange={(e) => setWarehouseForm((f) => ({ ...f, code: e.target.value }))} placeholder="ALM-01" autoCapitalize="characters" />
          </Campo>
          <Campo label="Ciudad (opcional)">
            <input className={s.input} value={warehouseForm.city} onChange={(e) => setWarehouseForm((f) => ({ ...f, city: e.target.value }))} placeholder="CDMX, Monterrey…" />
          </Campo>
          <Campo label="Dirección (opcional)" ancho>
            <input className={s.input} value={warehouseForm.address} onChange={(e) => setWarehouseForm((f) => ({ ...f, address: e.target.value }))} placeholder="Av. Insurgentes 123…" />
          </Campo>
        </form>
      </Modal>

      {/* ── Entrada/salida/traspaso de stock (disponible desde cualquier pestaña) ── */}
      <Modal
        open={showMovementForm}
        onClose={() => setShowMovementForm(false)}
        title={TITULO_MOVIMIENTO[movement.type]}
        maxWidth={640}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowMovementForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveMovement()} disabled={movimientoIncompleto} loading={savingMovement}>
              Registrar movimiento
            </Button>
          </>
        }
      >
        <form className={s.rejilla} onSubmit={(e) => { e.preventDefault(); void saveMovement(); }}>
          <Campo label="Tipo de movimiento">
            <select
              className={s.input}
              value={movement.type}
              onChange={(e) => setMovement((m) => ({ ...m, type: e.target.value as TipoMovimiento, toWarehouseId: "" }))}
            >
              <option value="RECEIPT">Entrada (recepción)</option>
              <option value="DISPATCH">Salida (despacho)</option>
              <option value="TRANSFER">Traspaso</option>
              <option value="RETURN">Devolución</option>
              <option value="ADJUSTMENT">Ajuste (alta)</option>
              <option value="ADJUSTMENT_OUT">Ajuste (baja)</option>
            </select>
          </Campo>
          <Campo label="Producto">
            <select className={s.input} value={movement.productId} onChange={(e) => setMovement((m) => ({ ...m, productId: e.target.value, packagingId: "" }))}>
              <option value="">{products.length ? "Elige el producto" : "No hay productos en el catálogo"}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
            </select>
          </Campo>
          <Campo label={esEntrada ? "Almacén destino" : "Almacén origen"}>
            <select className={s.input} value={movement.warehouseId} onChange={(e) => setMovement((m) => ({ ...m, warehouseId: e.target.value }))}>
              <option value="">{warehouses.length ? "Elige el almacén" : "Primero crea un almacén"}</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Campo>
          {movement.type === "TRANSFER" && (
            <Campo label="Almacén destino">
              <select className={s.input} value={movement.toWarehouseId} onChange={(e) => setMovement((m) => ({ ...m, toWarehouseId: e.target.value }))}>
                <option value="">Elige el almacén</option>
                {warehouses.filter((w) => String(w.id) !== movement.warehouseId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Campo>
          )}
          <Campo label="Cantidad">
            <input className={`${s.input} ${s.num}`} type="number" inputMode="decimal" min={0} step="any" value={movement.quantity} onChange={(e) => setMovement((m) => ({ ...m, quantity: +e.target.value }))} />
          </Campo>
          {movement.productId && (
            <div className={s.campo}>
              <Campo label="Presentación">
                <select
                  className={s.input}
                  value={movement.packagingId}
                  onChange={(e) => setMovement((m) => ({ ...m, packagingId: e.target.value }))}
                  disabled={empaques.length === 0}
                >
                  <option value="">Piezas</option>
                  {empaques.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre} ({Number(e.piezasPorUnidad)} pz)
                    </option>
                  ))}
                </select>
              </Campo>
              {previa ? <span className={s.ayuda}>{previa.texto}</span> : null}
              {nuevoEmpaque ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    className={s.input}
                    value={nuevoEmpaque.nombre}
                    onChange={(e) => setNuevoEmpaque((n) => (n ? { ...n, nombre: e.target.value } : n))}
                    placeholder="Caja"
                    aria-label="Nombre de la presentación"
                    style={{ flex: "1 1 96px", minWidth: 0, width: "auto" }}
                  />
                  <input
                    className={s.input}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={nuevoEmpaque.piezas}
                    onChange={(e) => setNuevoEmpaque((n) => (n ? { ...n, piezas: e.target.value } : n))}
                    placeholder="Piezas"
                    aria-label="Piezas que trae"
                    style={{ flex: "0 1 96px", minWidth: 0, width: "auto" }}
                  />
                  <Button size="sm" variant="secondary" onClick={() => void guardarEmpaque()} loading={guardandoEmpaque}>
                    Guardar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNuevoEmpaque(null)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                cfg.canCreate && (
                  <button type="button" className={s.enlace} onClick={() => setNuevoEmpaque({ nombre: "", piezas: "" })}>
                    {empaques.length === 0 ? "+ Registrar una presentación (caja, paquete…)" : "+ Nueva presentación"}
                  </button>
                )
              )}
            </div>
          )}
          <Campo label="Costo unitario (opcional)">
            <input className={`${s.input} ${s.num}`} type="number" inputMode="decimal" min={0} step="0.01" value={movement.unitCost} onChange={(e) => setMovement((m) => ({ ...m, unitCost: e.target.value }))} placeholder="$0.00" />
          </Campo>
          <Campo label="Referencia o documento (opcional)">
            <input className={s.input} value={movement.reference} onChange={(e) => setMovement((m) => ({ ...m, reference: e.target.value }))} placeholder="OC-000123, venta, ajuste inicial…" />
          </Campo>
          <Campo label="Motivo o notas (opcional)" ancho>
            <input className={s.input} value={movement.notes} onChange={(e) => setMovement((m) => ({ ...m, notes: e.target.value }))} placeholder="Por qué se mueve el stock…" />
          </Campo>
        </form>
      </Modal>

      {/* ── Mínimo de stock ── */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Mínimo de stock"
        maxWidth={420}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveMinimo()} loading={savingMinimo}>Guardar</Button>
          </>
        }
      >
        {editing && (
          <form className={s.rejilla} style={{ gridTemplateColumns: "minmax(0, 1fr)" }} onSubmit={(e) => { e.preventDefault(); void saveMinimo(); }}>
            <p className={s.nota} style={{ margin: 0 }}>
              <strong>{editing.nombre}</strong> · {editing.ubicacion} · hoy hay {cantidad(editing.existencia)}
            </p>
            <Campo label="Avisar cuando queden menos de">
              <input className={`${s.input} ${s.num}`} type="number" inputMode="numeric" min={0} value={minimo} onChange={(e) => setMinimo(+e.target.value)} autoFocus />
            </Campo>
          </form>
        )}
      </Modal>

      {tab === "dashboard" && (
        <InteligenciaInventario insights={insights} loading={insightsLoading} onRetry={() => void loadInsights()} />
      )}

      {tab === "inventario" && (
        <>
          <div className={s.kpis}>
            <KpiCard label="Agotados" value={resumen.sinStock} variant={resumen.sinStock > 0 ? "danger" : "positive"} hint={resumen.sinStock > 0 ? "Hay que reponerlos ya" : "Todo tiene existencia"} />
            <KpiCard label="Bajo mínimo" value={resumen.bajoMinimo} variant={resumen.bajoMinimo > 0 ? "warning" : "positive"} hint={resumen.bajoMinimo > 0 ? "Por debajo del punto de reorden" : "Niveles sanos"} />
            <KpiCard label="Valor del inventario" value={<Money value={resumen.valorTotal} compact />} hint={`${cantidad(items.length)} registros de stock`} variant="accent" />
            <KpiCard label="Almacenes" value={warehouses.length} hint="Ubicaciones configuradas" />
          </div>

          {resumen.categorias.length > 0 && (
            <div className={s.panel} style={{ padding: "10px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Productos por categoría</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {resumen.categorias.map(([cat, count]) => (
                  <div key={cat} style={{ display: "grid", gridTemplateColumns: "minmax(0, 130px) 1fr 36px", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={cat}>{cat}</span>
                    <div className={s.stockBarra} style={{ height: 6 }} aria-hidden="true">
                      <div className={s.stockRelleno} style={{ width: `${(count / items.length) * 100}%`, background: "var(--panel-accent, var(--primary))" }} />
                    </div>
                    <span className={s.num} style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <FilterToolbar
            search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por SKU, nombre o categoría…" }}
            selects={[{
              label: "Estado",
              value: filterEstado,
              onChange: setFilterEstado,
              options: [
                { value: "sin_stock", label: "Agotado" },
                { value: "bajo_minimo", label: "Bajo mínimo" },
                { value: "ok", label: "Suficiente" },
              ],
              allowAll: true,
            }]}
            onClear={() => { setSearchQ(""); setFilterEstado(""); }}
            resultCount={cargadoUnaVez ? visibleItems.length : null}
            rightActions={items.length > 0 ? (
              <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleItems, [
                { key: "sku", label: "SKU" },
                { key: "nombre", label: "Producto" },
                { key: "categoria", label: "Categoría" },
                { key: "existencia", label: "Existencia" },
                { key: "minimo", label: "Mínimo" },
                { key: "costo", label: "Costo unit." },
                { key: "ubicacion", label: "Ubicación" },
              ], "inventario")}>Excel</Button>
            ) : undefined}
          />

          <Section title={cargadoUnaVez ? `Existencias · ${cantidad(visibleItems.length)}` : "Cargando existencias…"}>
            {productFilter && (
              <p className={s.nota}>
                Mostrando un solo producto.{" "}
                <button type="button" className={s.enlace} onClick={() => limpiarFiltroUrl()}>Ver todo el inventario</button>
              </p>
            )}
            {loadError && (
              <InlineAlert
                variant={cargadoUnaVez ? "warning" : "danger"}
                message={cargadoUnaVez ? `${loadError}. Se muestra lo último que cargó.` : loadError}
                action={<Button size="sm" variant="ghost" onClick={() => void load()}>Reintentar</Button>}
              />
            )}
            {!cargadoUnaVez ? (
              loadError ? null : <SkeletonRows rows={6} label="Cargando existencias" />
            ) : (
              <DataTable
                columns={columns}
                rows={visibleItems}
                rowKey={(r) => r.id}
                ariaLabel="Existencias"
                emptyTitle={items.length ? "Ningún producto coincide" : "Aún no hay stock registrado"}
                emptyDescription={
                  items.length
                    ? "Prueba con otra búsqueda o quita el filtro de estado."
                    : "Crea un almacén y registra la primera entrada para empezar el inventario."
                }
                emptyAction={
                  items.length ? (
                    <Button size="sm" variant="secondary" onClick={() => { setSearchQ(""); setFilterEstado(""); }}>Quitar filtros</Button>
                  ) : cfg.canCreate ? (
                    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                      <Button size="sm" variant="secondary" onClick={() => setShowWarehouseForm(true)}>Nuevo almacén</Button>
                      <Button size="sm" variant="primary" onClick={abrirEntrada}>Entrada de stock</Button>
                    </div>
                  ) : undefined
                }
              />
            )}
          </Section>
        </>
      )}

      {tab === "movimientos" && (
        <Section
          title="Movimientos de inventario"
          subtitle="Quién, cuándo, de qué almacén a cuál y cómo quedó el saldo."
          actions={
            cfg.canCreate ? (
              <Button variant="primary" size="sm" iconLeft="+" onClick={abrirEntrada}>
                Registrar
              </Button>
            ) : undefined
          }
        >
          <div className={s.filtros} role="group" aria-label="Filtros de movimientos">
            <select className={s.input} aria-label="Producto" value={movementProductFilter} onChange={(e) => setMovementProductFilter(e.target.value)}>
              <option value="">Todos los productos</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
            </select>
            <select className={s.input} aria-label="Almacén" value={movementWarehouseFilter} onChange={(e) => setMovementWarehouseFilter(e.target.value)}>
              <option value="">Todos los almacenes</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <select className={s.input} aria-label="Tipo de movimiento" value={movementTypeFilter} onChange={(e) => setMovementTypeFilter(e.target.value)}>
              <option value="">Todos los tipos</option>
              {Object.entries(MOVEMENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className={s.input} type="date" aria-label="Desde" title="Desde" value={movementFromDate} onChange={(e) => setMovementFromDate(e.target.value)} />
            <input className={s.input} type="date" aria-label="Hasta" title="Hasta" value={movementToDate} min={movementFromDate || undefined} onChange={(e) => setMovementToDate(e.target.value)} />
            {hasMovementFilters && (
              <Button variant="ghost" size="sm" onClick={clearMovementFilters}>Limpiar filtros</Button>
            )}
            <span style={{ flex: 1 }} />
            {visibleMovements.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                iconLeft="⬇"
                onClick={() => exportToExcel(
                  visibleMovements.map((m) => ({
                    folio: m.movementNumber,
                    tipo: etiquetaMovimiento(m.type),
                    sku: m.product?.sku ?? "",
                    producto: m.product?.name ?? "",
                    origen: m.fromWarehouse?.name ?? "",
                    destino: m.toWarehouse?.name ?? "",
                    cantidad: Number(m.quantity),
                    saldo: stockMovementBalanceLabel(m),
                    documento: stockMovementDocumentLabel(m),
                    notas: m.notes ?? "",
                    costo: Number(m.totalCost ?? 0),
                    fecha: new Date(m.createdAt).toLocaleString("es-MX"),
                    quien: m.createdBy?.nombre ?? "",
                  })),
                  [
                    { key: "folio", label: "Folio" },
                    { key: "tipo", label: "Tipo" },
                    { key: "sku", label: "SKU" },
                    { key: "producto", label: "Producto" },
                    { key: "origen", label: "Origen" },
                    { key: "destino", label: "Destino" },
                    { key: "cantidad", label: "Cantidad" },
                    { key: "saldo", label: "Saldo antes → después" },
                    { key: "documento", label: "Documento" },
                    { key: "notas", label: "Notas" },
                    { key: "costo", label: "Costo" },
                    { key: "fecha", label: "Fecha" },
                    { key: "quien", label: "Registró" },
                  ],
                  "movimientos-inventario",
                  "Movimientos de inventario",
                )}
              >
                Excel
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void downloadMovementsPdf()}
              disabled={movementsLoading || visibleMovements.length === 0}
              loading={exportingPdf}
            >
              Kárdex PDF
            </Button>
          </div>
          {movementId && (
            <p className={s.nota}>
              El movimiento del aviso aparece primero.{" "}
              <button type="button" className={s.enlace} onClick={() => limpiarFiltroUrl("?tab=movimientos")}>Quitar resaltado</button>
            </p>
          )}
          {movementsLoading && movements.length === 0 ? (
            <SkeletonRows rows={6} label="Cargando movimientos" />
          ) : (
            <DataTable
              columns={movementColumns}
              rows={visibleMovements}
              rowKey={(m) => m.id}
              ariaLabel="Movimientos de inventario"
              emptyTitle={hasMovementFilters ? "Ningún movimiento con esos filtros" : "Aún no hay movimientos"}
              emptyDescription={hasMovementFilters ? "Cambia las fechas o quita algún filtro." : "Registra una entrada, salida o traspaso para ver el historial aquí."}
              emptyAction={
                hasMovementFilters ? (
                  <Button size="sm" variant="secondary" onClick={clearMovementFilters}>Limpiar filtros</Button>
                ) : cfg.canCreate ? (
                  <Button size="sm" variant="primary" onClick={abrirEntrada}>Registrar movimiento</Button>
                ) : undefined
              }
            />
          )}
        </Section>
      )}

      {tab === "lotes" && (
        <Section
          title="Lotes y caducidad"
          subtitle="Trazabilidad por lote, con aviso cuando se acerca la fecha de caducidad."
          actions={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {lots.length > 0 && (
                <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(
                  lots.map((l) => ({
                    lote: l.lotNumber,
                    sku: l.product?.sku ?? "",
                    producto: l.product?.name ?? "",
                    fabricacion: l.manufacturingDate ? String(l.manufacturingDate).slice(0, 10) : "",
                    caducidad: l.expirationDate ? String(l.expirationDate).slice(0, 10) : "",
                    notas: l.notes ?? "",
                  })),
                  [
                    { key: "lote", label: "Lote" },
                    { key: "sku", label: "SKU" },
                    { key: "producto", label: "Producto" },
                    { key: "fabricacion", label: "Fabricación" },
                    { key: "caducidad", label: "Caducidad" },
                    { key: "notas", label: "Notas" },
                  ],
                  "lotes-inventario",
                  "Lotes",
                )}>Excel</Button>
              )}
              {cfg.canCreate ? (
                <Button variant="primary" size="sm" iconLeft="+" onClick={abrirNuevoLote}>Nuevo lote</Button>
              ) : null}
            </div>
          }
        >
          <div className={s.kpis}>
            <KpiCard label="Lotes registrados" value={lots.length} />
            <KpiCard
              label="Por caducar o caducados"
              value={expiringLotsCount}
              variant={expiringLotsCount > 0 ? "warning" : "positive"}
              hint="Caducan en 30 días o menos"
            />
          </div>
          {showLotForm && (
            <form className={s.panel} onSubmit={(e) => { e.preventDefault(); void saveLot(); }}>
              <p className={s.panelTitulo}>Nuevo lote</p>
              <div className={s.rejilla}>
                <Campo label="Número de lote">
                  <input className={s.input} value={lotForm.lotNumber} onChange={(e) => setLotForm((f) => ({ ...f, lotNumber: e.target.value }))} placeholder="LOTE-2026-001" autoFocus />
                </Campo>
                <Campo label="Producto">
                  <select className={s.input} value={lotForm.productId} onChange={(e) => setLotForm((f) => ({ ...f, productId: e.target.value }))}>
                    <option value="">Elige el producto</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                  </select>
                </Campo>
                <Campo label="Fecha de fabricación (opcional)">
                  <input className={s.input} type="date" value={lotForm.manufacturingDate} onChange={(e) => setLotForm((f) => ({ ...f, manufacturingDate: e.target.value }))} />
                </Campo>
                <Campo label="Fecha de caducidad (opcional)">
                  <input className={s.input} type="date" value={lotForm.expirationDate} min={lotForm.manufacturingDate || undefined} onChange={(e) => setLotForm((f) => ({ ...f, expirationDate: e.target.value }))} />
                </Campo>
                <Campo label="Notas (opcional)" ancho>
                  <input className={s.input} value={lotForm.notes} onChange={(e) => setLotForm((f) => ({ ...f, notes: e.target.value }))} />
                </Campo>
                {lotSaveErr && <div className={s.error} role="alert">{lotSaveErr}</div>}
              </div>
              <div className={s.acciones}>
                <Button variant="secondary" onClick={() => { setShowLotForm(false); setLotSaveErr(null); }}>Cancelar</Button>
                <Button type="submit" variant="primary" loading={savingLot}>Crear lote</Button>
              </div>
            </form>
          )}
          {lotsLoading && lots.length === 0 ? (
            <SkeletonRows rows={5} label="Cargando lotes" />
          ) : (
            <DataTable
              columns={lotColumns}
              rows={lots}
              rowKey={(l) => l.id}
              ariaLabel="Lotes"
              emptyTitle="Aún no hay lotes"
              emptyDescription="Registra el primer lote para rastrear fabricación y caducidad."
              emptyAction={cfg.canCreate ? <Button size="sm" variant="primary" onClick={abrirNuevoLote}>Nuevo lote</Button> : undefined}
            />
          )}
        </Section>
      )}

      {tab === "valuacion" && (
        <Section
          title="Valuación de inventario"
          subtitle="Costo unitario y valor total por producto y almacén, con el método de valuación configurado."
          actions={
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select className={s.input} aria-label="Almacén" value={valuationWarehouseFilter} onChange={(e) => setValuationWarehouseFilter(e.target.value)} style={{ width: 200 }}>
                <option value="">Todos los almacenes</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              {valuationWarehouseFilter && (
                <Button variant="ghost" size="sm" onClick={() => setValuationWarehouseFilter("")}>Limpiar filtro</Button>
              )}
              {valuation.length > 0 && (
                <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(
                  valuation.map((v) => ({
                    sku: v.product?.sku ?? "",
                    producto: v.product?.name ?? "",
                    almacen: v.warehouse?.name ?? "",
                    cantidad: Number(v.quantity),
                    disponible: Number(v.availableQty),
                    costoUnit: Number(v.unitCost ?? 0),
                    valor: v.totalValue,
                  })),
                  [
                    { key: "sku", label: "SKU" },
                    { key: "producto", label: "Producto" },
                    { key: "almacen", label: "Almacén" },
                    { key: "cantidad", label: "Cantidad" },
                    { key: "disponible", label: "Disponible" },
                    { key: "costoUnit", label: "Costo unit." },
                    { key: "valor", label: "Valor total" },
                  ],
                  "valuacion-inventario",
                  "Valuación",
                )}>Excel</Button>
              )}
            </div>
          }
        >
          <div className={s.kpis}>
            <KpiCard label="Valor total" value={<Money value={totalValuation} compact />} variant="accent" />
            <KpiCard label="Productos valuados" value={valuation.length} />
          </div>
          {valuationLoading && valuation.length === 0 ? (
            <SkeletonRows rows={5} label="Cargando valuación" />
          ) : (
            <DataTable
              columns={valuationColumns}
              rows={valuation}
              rowKey={(v) => v.id}
              ariaLabel="Valuación"
              emptyTitle="Sin datos de valuación"
              emptyDescription="Registra stock en un almacén para calcular el valor del inventario."
              emptyAction={
                cfg.canCreate ? (
                  <Button size="sm" variant="secondary" onClick={abrirEntrada}>Entrada de stock</Button>
                ) : undefined
              }
            />
          )}
        </Section>
      )}

      {tab === "conteos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Section
            title="Conteos cíclicos"
            subtitle="Programa un conteo físico, captura lo que encuentres y ciérralo: la diferencia se ajusta sola en el stock."
            actions={cfg.canCreate ? (
              <Button variant="primary" size="sm" iconLeft="+" onClick={() => setShowScheduleForm(true)}>Programar conteo</Button>
            ) : undefined}
          >
            {showScheduleForm && (
              <form className={s.panel} onSubmit={(e) => { e.preventDefault(); void submitSchedule(); }}>
                <p className={s.panelTitulo}>Programar conteo</p>
                <div className={s.rejilla}>
                  <Campo label="Almacén">
                    <select className={s.input} value={scheduleForm.warehouseId} onChange={(e) => setScheduleForm((f) => ({ ...f, warehouseId: e.target.value }))}>
                      <option value="">Elige el almacén</option>
                      {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Fecha">
                    <input className={s.input} type="date" value={scheduleForm.scheduledFor} onChange={(e) => setScheduleForm((f) => ({ ...f, scheduledFor: e.target.value }))} />
                  </Campo>
                  <Campo label="Notas (opcional)" ancho>
                    <input className={s.input} value={scheduleForm.notes} onChange={(e) => setScheduleForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Conteo trimestral, auditoría sorpresa…" />
                  </Campo>
                  <span className={`${s.ayuda} ${s.ancho}`}>Se toma la existencia de hoy como punto de partida para comparar.</span>
                </div>
                <div className={s.acciones}>
                  <Button variant="secondary" onClick={() => setShowScheduleForm(false)}>Cancelar</Button>
                  <Button type="submit" variant="primary" disabled={!scheduleForm.warehouseId || !scheduleForm.scheduledFor} loading={savingSchedule}>
                    Programar conteo
                  </Button>
                </div>
              </form>
            )}

            {activeCount && (
              <div className={s.panel}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <p className={s.panelTitulo} style={{ margin: 0 }}>
                    Conteo {activeCount.countNumber} · {activeCount.warehouse?.name}{" "}
                    <Tag variant={varianteConteo(activeCount.status)}>{CYCLE_COUNT_STATUS_LABEL[activeCount.status] ?? "Sin estado"}</Tag>
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => setActiveCount(null)}>Cerrar panel</Button>
                </div>
                <div className={s.conteoFila} style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }} aria-hidden="true">
                  <span>Producto</span><span>Sistema</span><span>Contado</span><span>Diferencia</span>
                </div>
                <div className={s.conteoLista}>
                  {activeCountItems.map((it) => {
                    const counted = captureQty[it.productId] ?? "";
                    const variance = counted !== "" ? Number(counted) - Number(it.expectedQty) : (it.varianceQty != null ? Number(it.varianceQty) : null);
                    const nombre = it.product?.name ?? "Producto";
                    return (
                      <div key={it.id} className={s.conteoFila}>
                        <div style={{ minWidth: 0 }}>
                          <strong>{nombre}</strong>
                          <div className={s.productoMeta}>{it.product?.sku}</div>
                        </div>
                        <span className={s.num} style={{ color: "var(--text-tertiary)" }}>{cantidad(it.expectedQty)}</span>
                        <input
                          className={`${s.input} ${s.num}`}
                          type="number"
                          inputMode="decimal"
                          disabled={activeCountClosed}
                          value={counted}
                          onChange={(e) => setCaptureQty((q) => ({ ...q, [it.productId]: e.target.value }))}
                          placeholder="Contado"
                          aria-label={`Cantidad contada de ${nombre}`}
                        />
                        <span className={s.num} style={{ fontWeight: 700, color: variance == null ? "var(--text-tertiary)" : variance === 0 ? "var(--success)" : variance > 0 ? "var(--primary)" : "var(--danger)" }}>
                          {variance == null ? "—" : variance > 0 ? `+${variance}` : variance}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {!activeCountClosed && (
                  <div className={s.acciones}>
                    <Button variant="secondary" onClick={() => void submitCapture()} loading={savingCapture}>Guardar captura</Button>
                    <Button variant="primary" onClick={pedirCerrarConteo} loading={closingCount}>Cerrar y ajustar stock</Button>
                  </div>
                )}
              </div>
            )}

            {cycleCountsLoading && cycleCounts.length === 0 ? (
              <SkeletonRows rows={4} label="Cargando conteos" />
            ) : (
              <DataTable
                columns={cycleCountColumns}
                rows={cycleCounts}
                rowKey={(c) => c.id}
                ariaLabel="Conteos cíclicos"
                emptyTitle="Sin conteos programados"
                emptyDescription="Programa un conteo para comparar el stock físico contra el sistema."
                emptyAction={cfg.canCreate ? <Button size="sm" variant="primary" onClick={() => setShowScheduleForm(true)}>Programar conteo</Button> : undefined}
              />
            )}
          </Section>

          <Section
            title="Reservas de stock"
            subtitle="Aparta stock para una cotización u orden sin sacarlo del almacén."
            actions={cfg.canCreate ? (
              <Button variant="primary" size="sm" iconLeft="+" onClick={() => setShowReservationForm(true)}>Nueva reserva</Button>
            ) : undefined}
          >
            {showReservationForm && (
              <form className={s.panel} onSubmit={(e) => { e.preventDefault(); void submitReservation(); }}>
                <p className={s.panelTitulo}>Nueva reserva</p>
                <div className={s.rejilla}>
                  <Campo label="Producto">
                    <select className={s.input} value={reservationForm.productId} onChange={(e) => setReservationForm((f) => ({ ...f, productId: e.target.value }))}>
                      <option value="">Elige el producto</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Almacén">
                    <select className={s.input} value={reservationForm.warehouseId} onChange={(e) => setReservationForm((f) => ({ ...f, warehouseId: e.target.value }))}>
                      <option value="">Elige el almacén</option>
                      {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Cantidad">
                    <input className={`${s.input} ${s.num}`} type="number" inputMode="decimal" min={1} value={reservationForm.quantity} onChange={(e) => setReservationForm((f) => ({ ...f, quantity: +e.target.value }))} />
                  </Campo>
                  <Campo label="Vence (opcional)">
                    <input className={s.input} type="date" value={reservationForm.expiresAt} onChange={(e) => setReservationForm((f) => ({ ...f, expiresAt: e.target.value }))} />
                  </Campo>
                  <Campo label="Motivo" ancho>
                    <input className={s.input} value={reservationForm.reason} onChange={(e) => setReservationForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Cotización COT-000123, orden de cliente…" />
                  </Campo>
                </div>
                <div className={s.acciones}>
                  <Button variant="secondary" onClick={() => setShowReservationForm(false)}>Cancelar</Button>
                  <Button type="submit" variant="primary" disabled={!reservationForm.productId || !reservationForm.warehouseId || !reservationForm.reason.trim()} loading={savingReservation}>
                    Reservar
                  </Button>
                </div>
              </form>
            )}
            {reservationsLoading && reservations.length === 0 ? (
              <SkeletonRows rows={4} label="Cargando reservas" />
            ) : (
              <DataTable
                columns={reservationColumns}
                rows={reservations}
                rowKey={(r) => r.id}
                ariaLabel="Reservas de stock"
                emptyTitle="Sin reservas activas"
                emptyDescription="Reserva stock para apartarlo a una cotización u orden sin despacharlo todavía."
                emptyAction={cfg.canCreate ? <Button size="sm" variant="primary" onClick={() => setShowReservationForm(true)}>Nueva reserva</Button> : undefined}
              />
            )}
          </Section>
        </div>
      )}

      {productTrace && (
        <HistorialProducto
          traza={productTrace}
          loading={productTraceLoading}
          exportingPdf={exportingPdf}
          onPdf={() => void downloadMovementsPdf({ productId: productTrace.productId })}
          onClose={cerrarHistorial}
        />
      )}

      <ConfirmDialog state={confirmar} onClose={() => setConfirmar(null)} />
    </>
  );
}
