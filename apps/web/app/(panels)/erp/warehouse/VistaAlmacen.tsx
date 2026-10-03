"use client";

import { useEffect, useState, useCallback, useDeferredValue, useMemo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import WarehouseOutlined from "@mui/icons-material/WarehouseOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import PictureAsPdfOutlined from "@mui/icons-material/PictureAsPdfOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import ReportProblemOutlined from "@mui/icons-material/ReportProblemOutlined";
import TrendingDownOutlined from "@mui/icons-material/TrendingDownOutlined";
import PaidOutlined from "@mui/icons-material/PaidOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";
import SwapHorizOutlined from "@mui/icons-material/SwapHorizOutlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import Modal from "@/components/ui/Modal";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import ContextRail from "@/components/ui/ContextRail";
import { Money } from "@/components/ui/DataTable";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  DataTable,
  DateInput,
  Field,
  FieldGrid,
  FilterChip,
  FilterChips,
  FormSection,
  Input,
  LinkButton,
  ListFooter,
  ModulePage,
  ModuleToolbar,
  PageHead,
  PersonCell,
  Progress,
  SearchInput,
  Select,
  SkeletonRows,
  Stat,
  StatRow,
  Tabs,
  type Column,
  type TabItem,
} from "@/components/base";
import { CeldaExistencia, CeldaProducto, claseMono } from "@/components/almacen/PiezasAlmacen";
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
import { exportToExcel } from "@/lib/export-excel";
import { cantidad, fechaCorta, fechaHoraCorta } from "@/lib/recursos-ui";
import {
  CYCLE_COUNT_STATUS_LABEL,
  MOVEMENT_TYPE_LABEL,
  NIVEL_STOCK,
  RESERVATION_STATUS_LABEL,
  TONO_DE_VARIANTE,
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

/** Fila de stock; `foto` llega cuando la API de niveles trae la imagen del producto. */
type StockRow = ReturnType<typeof mapStockLevelToRow> & { foto?: string | null };

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

const ICONO_VISTA: Record<TabKey, TabItem<TabKey>["icon"]> = {
  dashboard: InsightsOutlined,
  inventario: Inventory2Outlined,
  movimientos: SwapHorizOutlined,
  lotes: EventBusyOutlined,
  valuacion: PaidOutlined,
  conteos: FactCheckOutlined,
};

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

/** Grupo con título dentro de un diálogo: el formulario se lee por partes. */
function Grupo({ titulo, paso, children }: { titulo: string; paso: number; children: ReactNode }) {
  return (
    <fieldset className={s.grupo}>
      <legend className={s.grupoTitulo}>
        <span className={s.grupoPaso} aria-hidden="true">
          {paso}
        </span>
        {titulo}
      </legend>
      <FieldGrid>{children}</FieldGrid>
    </fieldset>
  );
}

/** Nombre del producto en dos renglones (nombre + SKU), sin foto: listas secundarias. */
function NombreProducto({ nombre, meta }: { nombre: ReactNode; meta?: ReactNode }) {
  return (
    <span className={s.doble}>
      <span className={s.fuerte}>{nombre}</span>
      {meta ? <span className={s.tenue}>{meta}</span> : null}
    </span>
  );
}

const sinDato = <span className={s.vacio}>—</span>;

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
      setItems(
        levels.map((level) => ({
          ...mapStockLevelToRow(level),
          foto: (level.product as { imageUrl?: string | null } | null | undefined)?.imageUrl ?? null,
        })),
      );
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
    // «—» es la categoría que pone la API cuando no la manda: no es un dato que graficar.
    const categorias = Object.entries(porCategoria)
      .filter(([cat]) => cat !== "—")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    return { sinStock, bajoMinimo, valorTotal, categorias };
  }, [items]);

  /** Lo que queda tras el aviso (`?productId=`) y la búsqueda: sobre esto cuentan los chips. */
  const filasBuscadas = useMemo(() => {
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
    return rows;
  }, [items, productFilter, busqueda]);

  const conteoEstado = useMemo(() => {
    let agotado = 0;
    let bajo = 0;
    let ok = 0;
    for (const r of filasBuscadas) {
      const nivel = nivelStock(r.existencia, r.minimo);
      if (nivel === "agotado") agotado += 1;
      else if (nivel === "bajo") bajo += 1;
      if (r.existencia >= r.minimo) ok += 1;
    }
    return { agotado, bajo, ok };
  }, [filasBuscadas]);

  const visibleItems = useMemo(() => {
    const rows = filasBuscadas;
    if (filterEstado === "sin_stock") return rows.filter((r) => nivelStock(r.existencia, r.minimo) === "agotado");
    if (filterEstado === "bajo_minimo") return rows.filter((r) => nivelStock(r.existencia, r.minimo) === "bajo");
    if (filterEstado === "ok") return rows.filter((r) => r.existencia >= r.minimo);
    return rows;
  }, [filasBuscadas, filterEstado]);

  const quitarFiltrosInventario = () => {
    setSearchQ("");
    setFilterEstado("");
  };
  const alternarEstado = (valor: string) => setFilterEstado((f) => (f === valor ? "" : valor));

  const columns: Column<StockRow>[] = [
    {
      key: "nombre",
      label: "Producto",
      render: (r) => {
        const meta = [r.categoria !== "—" ? r.categoria : null, r.ubicacion].filter(Boolean).join(" · ");
        return (
          <CeldaProducto
            nombre={r.nombre}
            meta={meta}
            foto={r.foto}
            onClick={r.productId ? () => void openProductTrace(r.productId!, r.sku, r.nombre) : undefined}
            title="Ver historial de movimientos"
          />
        );
      },
    },
    { key: "sku", label: "SKU", render: (r) => <code className={claseMono}>{r.sku}</code>, width: 120 },
    {
      key: "existencia",
      label: "Existencia",
      render: (r) => {
        const nivel = NIVEL_STOCK[nivelStock(r.existencia, r.minimo)];
        return <CeldaExistencia existencia={r.existencia} minimo={r.minimo} texto={nivel.texto} tono={nivel.tono} formato={cantidad} />;
      },
      width: 180,
    },
    { key: "minimo", label: "Mínimo", accessor: (r) => cantidad(r.minimo), width: 84, numeric: true },
    { key: "costo", label: "Costo unit.", render: (r) => (r.costo > 0 ? <Money value={r.costo} /> : sinDato), width: 110, numeric: true },
  ];

  const accionesStock = (r: StockRow) => (
    <>
      {r.productId ? (
        <Button
          size="sm"
          variant="ghost"
          icon
          onClick={() => void openProductTrace(r.productId!, r.sku, r.nombre)}
          title="Historial"
          aria-label={`Ver historial de ${r.nombre}`}
        >
          <HistoryOutlined fontSize="small" />
        </Button>
      ) : null}
      {cfg.canEdit ? (
        <Button
          size="sm"
          variant="ghost"
          icon
          onClick={() => openEdit(r)}
          title="Editar mínimo"
          aria-label={`Editar mínimo de ${r.nombre}`}
        >
          <EditOutlined fontSize="small" />
        </Button>
      ) : null}
    </>
  );

  const movementColumns: Column<StockMovementRow>[] = [
    { key: "movementNumber", label: "Folio", render: (m) => <code className={claseMono}>{m.movementNumber}</code>, width: 108 },
    {
      key: "type",
      label: "Tipo",
      render: (m) => (
        <Badge tone={TONO_DE_VARIANTE[varianteMovimiento(m.type)]} size="sm" dot>
          {etiquetaMovimiento(m.type)}
        </Badge>
      ),
      width: 120,
    },
    {
      key: "product",
      label: "Producto",
      render: (m) => {
        const meta = [m.product?.sku, m.lot ? `Lote ${m.lot.lotNumber}` : null].filter(Boolean).join(" · ");
        return (
          <span className={s.doble}>
            {m.product?.id ? (
              <LinkButton
                className={s.nombreEnlace}
                onClick={() => m.product?.id && void openProductTrace(m.product.id, m.product.sku, m.product.name)}
                title="Ver historial de movimientos"
              >
                {m.product?.name ?? "—"}
              </LinkButton>
            ) : (
              <span className={s.fuerte}>{m.product?.name ?? "—"}</span>
            )}
            {meta ? <span className={s.tenue}>{meta}</span> : null}
          </span>
        );
      },
    },
    {
      key: "route",
      label: "Almacén",
      render: (m) => (
        <span className={s.ruta}>
          {m.fromWarehouse?.name ?? "—"} <span aria-hidden="true">→</span> {m.toWarehouse?.name ?? "—"}
        </span>
      ),
      width: 170,
    },
    // «2 cajas · 24 pz»: lo que se tecleó y lo que de verdad se movió.
    { key: "quantity", label: "Cantidad", render: (m) => <strong className={s.cifra}>{etiquetaCantidad(m)}</strong>, width: 118, numeric: true },
    {
      key: "balance",
      label: "Saldo",
      render: (m) => (
        <span className={s.tenueNum} title="Existencia antes → después">
          {stockMovementBalanceLabel(m)}
        </span>
      ),
      width: 96,
      numeric: true,
    },
    {
      key: "document",
      label: "Referencia",
      render: (m) => (
        <span className={s.meta} title={m.notes ?? undefined}>
          {stockMovementDocumentLabel(m)}
        </span>
      ),
      width: 130,
    },
    {
      key: "createdAt",
      label: "Fecha",
      render: (m) => (
        <time dateTime={m.createdAt} className={s.fecha}>
          {fechaHoraCorta(m.createdAt)}
        </time>
      ),
      width: 124,
    },
    {
      key: "createdBy",
      label: "Registró",
      render: (m) => (m.createdBy?.nombre ? <PersonCell name={m.createdBy.nombre} size={24} /> : sinDato),
      width: 150,
    },
  ];

  const ahora = Date.now();
  const lotColumns: Column<LotRow>[] = [
    { key: "lotNumber", label: "Lote", render: (l) => <code className={claseMono}>{l.lotNumber}</code>, width: 140 },
    { key: "product", label: "Producto", render: (l) => <NombreProducto nombre={l.product?.name ?? "—"} meta={l.product?.sku} /> },
    {
      key: "manufacturingDate",
      label: "Fabricación",
      render: (l) => (l.manufacturingDate ? <span className={s.fecha}>{fechaCorta(l.manufacturingDate)}</span> : sinDato),
      width: 120,
    },
    {
      key: "expirationDate",
      label: "Caducidad",
      width: 170,
      render: (l) => {
        const dias = diasParaCaducar(l.expirationDate, ahora);
        if (dias == null) return <span className={s.vacio}>Sin caducidad</span>;
        if (dias < 0) return <Badge tone="danger" size="sm" dot>Caducó hace {Math.abs(dias)} días</Badge>;
        if (dias <= 30) return <Badge tone="warning" size="sm" dot>{dias === 0 ? "Caduca hoy" : `Caduca en ${dias} días`}</Badge>;
        return <span className={s.fecha}>{fechaCorta(l.expirationDate)}</span>;
      },
    },
    { key: "notes", label: "Notas", render: (l) => (l.notes ? <span className={s.meta}>{l.notes}</span> : sinDato) },
  ];

  const valuationColumns: Column<ValuationRow>[] = [
    { key: "product", label: "Producto", render: (v) => <NombreProducto nombre={v.product?.name ?? "—"} meta={v.product?.sku} /> },
    { key: "warehouse", label: "Almacén", accessor: (v) => v.warehouse?.name ?? "—", width: 150 },
    { key: "quantity", label: "Cantidad", render: (v) => cantidad(v.quantity), width: 90, numeric: true },
    { key: "availableQty", label: "Disponible", render: (v) => cantidad(v.availableQty), width: 100, numeric: true },
    { key: "unitCost", label: "Costo unit.", render: (v) => <Money value={Number(v.unitCost ?? 0)} />, width: 110, numeric: true },
    { key: "totalValue", label: "Valor total", render: (v) => <strong className={s.cifra}><Money value={v.totalValue} /></strong>, width: 130, numeric: true },
  ];

  const cycleCountColumns: Column<CycleCountRow>[] = [
    { key: "countNumber", label: "Folio", render: (c) => <code className={claseMono}>{c.countNumber}</code>, width: 110 },
    { key: "warehouse", label: "Almacén", accessor: (c) => c.warehouse?.name ?? "—", width: 150 },
    {
      key: "status",
      label: "Estado",
      width: 130,
      render: (c) => (
        <Badge tone={TONO_DE_VARIANTE[varianteConteo(c.status)]} size="sm" dot>
          {CYCLE_COUNT_STATUS_LABEL[c.status] ?? "Sin estado"}
        </Badge>
      ),
    },
    { key: "scheduledFor", label: "Fecha", render: (c) => <span className={s.fecha}>{fechaCorta(c.scheduledFor)}</span>, width: 110 },
    {
      key: "progress",
      label: "Contados",
      width: 150,
      render: (c) => {
        const total = c._count?.items ?? c.items?.length ?? 0;
        const done = (c.items ?? []).filter((i) => i.countedQty != null).length;
        return (
          <span className={s.avance}>
            <Progress value={done} max={Math.max(1, total)} tone={total > 0 && done >= total ? "success" : "brand"} ariaLabel={`${done} de ${total} contados`} />
            <span className={s.tenueNum}>
              {done} de {total}
            </span>
          </span>
        );
      },
    },
  ];

  const accionesConteo = (c: CycleCountRow) => (
    <>
      {(c.status === "SCHEDULED" || c.status === "IN_PROGRESS") && (
        <>
          <Button size="sm" variant="secondary" onClick={() => openCapture(c)}>Capturar</Button>
          <Button size="sm" variant="ghost" onClick={() => pedirCancelarConteo(c)}>Cancelar</Button>
        </>
      )}
      {c.status === "CLOSED" && (
        <Button size="sm" variant="ghost" onClick={() => openCapture(c)}>Ver detalle</Button>
      )}
    </>
  );

  const reservationColumns: Column<StockReservationRow>[] = [
    { key: "product", label: "Producto", render: (r) => <NombreProducto nombre={r.product?.name ?? "—"} meta={r.product?.sku} /> },
    { key: "warehouse", label: "Almacén", accessor: (r) => r.warehouse?.name ?? "—", width: 140 },
    { key: "quantity", label: "Cantidad", render: (r) => <strong className={s.cifra}>{cantidad(r.quantity)}</strong>, width: 90, numeric: true },
    { key: "reason", label: "Motivo", accessor: (r) => r.reason },
    {
      key: "status",
      label: "Estado",
      width: 120,
      render: (r) => (
        <Badge tone={r.status === "ACTIVE" ? "warning" : r.status === "CONSUMED" ? "success" : "neutral"} size="sm" dot>
          {RESERVATION_STATUS_LABEL[r.status] ?? "Liberada"}
        </Badge>
      ),
    },
    { key: "expiresAt", label: "Vence", render: (r) => (r.expiresAt ? <span className={s.fecha}>{fechaCorta(r.expiresAt)}</span> : sinDato), width: 110 },
  ];

  const accionesReserva = (r: StockReservationRow) =>
    r.status === "ACTIVE" ? <Button size="sm" variant="ghost" onClick={() => pedirLiberarReserva(r)}>Liberar</Button> : null;

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

  // La fila de acciones solo se pinta con encabezado propio o con varias vistas.
  const mostrarAcciones = !embedded || vistasVisibles.length > 1;
  const accionTerciaria = (
    <Button variant="ghost" iconStart={<RefreshOutlined fontSize="small" />} onClick={refrescar} disabled={recargando}>
      {recargando ? "Actualizando…" : "Actualizar"}
    </Button>
  );
  const accionSecundaria = cfg.canCreate ? (
    <Button variant="secondary" iconStart={<WarehouseOutlined fontSize="small" />} onClick={() => setShowWarehouseForm(true)}>
      Nuevo almacén
    </Button>
  ) : null;
  const accionPrimaria = cfg.canCreate ? (
    <Button variant="primary" iconStart={<AddOutlined fontSize="small" />} onClick={abrirEntrada}>
      {embedded ? "Entrada" : "Entrada de stock"}
    </Button>
  ) : null;

  const pestanas =
    vistasVisibles.length > 1 ? (
      <Tabs
        ariaLabel="Vistas de almacén"
        value={tab}
        onChange={setTab}
        items={vistasVisibles.map((t) => ({ id: t.key, label: t.label, icon: ICONO_VISTA[t.key] }))}
      />
    ) : null;

  const elegido = empaques.find((e) => String(e.id) === movement.packagingId);
  const previa = previsualizarConversion(
    movement.quantity,
    elegido ? { ...elegido, piezasPorUnidad: Number(elegido.piezasPorUnidad) } : null,
  );
  const esEntrada = movement.type === "RECEIPT" || movement.type === "ADJUSTMENT" || movement.type === "RETURN";
  const movimientoIncompleto =
    !movement.productId || !movement.warehouseId || movement.quantity <= 0 || (movement.type === "TRANSFER" && !movement.toWarehouseId);

  const opcionesProducto = products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>);
  const opcionesAlmacen = warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>);

  return (
    <div className={s.vista}>
      {!embedded && (
        <PageHead
          eyebrow="ERP · Almacén"
          title="Inventario y stock"
          description="Existencias, reorden y valuación por almacén."
          icon={<Inventory2Outlined />}
          tertiaryActions={accionTerciaria}
          secondaryActions={accionSecundaria}
          primaryAction={accionPrimaria}
          tabs={pestanas}
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

      {/* Embedded: las acciones van en la misma fila que las sub-pestañas (sin barra extra). */}
      {embedded && mostrarAcciones ? (
        <div className={s.barraVistas}>
          <div className={s.barraPestanas}>{pestanas}</div>
          <div className={s.barraAcciones}>
            {accionTerciaria}
            {accionSecundaria}
            {accionPrimaria}
          </div>
        </div>
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
        <form onSubmit={(e) => { e.preventDefault(); void createWarehouse(); }}>
          <FieldGrid>
            <Field label="Nombre" required fullWidth>
              <Input value={warehouseForm.name} onChange={(e) => setWarehouseForm((f) => ({ ...f, name: e.target.value }))} placeholder="Almacén Central, Bodega Norte…" required />
            </Field>
            <Field label="Código" optional hint="Si lo dejas vacío se arma con el nombre.">
              <Input value={warehouseForm.code} onChange={(e) => setWarehouseForm((f) => ({ ...f, code: e.target.value }))} placeholder="ALM-01" autoCapitalize="characters" />
            </Field>
            <Field label="Ciudad" optional>
              <Input value={warehouseForm.city} onChange={(e) => setWarehouseForm((f) => ({ ...f, city: e.target.value }))} placeholder="CDMX, Monterrey…" />
            </Field>
            <Field label="Dirección" optional fullWidth>
              <Input value={warehouseForm.address} onChange={(e) => setWarehouseForm((f) => ({ ...f, address: e.target.value }))} placeholder="Av. Insurgentes 123…" />
            </Field>
          </FieldGrid>
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
        <form className={s.formDialogo} onSubmit={(e) => { e.preventDefault(); void saveMovement(); }}>
          <Grupo paso={1} titulo="Qué se mueve">
            <Field label="Tipo de movimiento" required>
              <Select
                value={movement.type}
                onChange={(e) => setMovement((m) => ({ ...m, type: e.target.value as TipoMovimiento, toWarehouseId: "" }))}
              >
                <option value="RECEIPT">Entrada (recepción)</option>
                <option value="DISPATCH">Salida (despacho)</option>
                <option value="TRANSFER">Traspaso</option>
                <option value="RETURN">Devolución</option>
                <option value="ADJUSTMENT">Ajuste (alta)</option>
                <option value="ADJUSTMENT_OUT">Ajuste (baja)</option>
              </Select>
            </Field>
            <Field label="Producto" required>
              <Select value={movement.productId} onChange={(e) => setMovement((m) => ({ ...m, productId: e.target.value, packagingId: "" }))}>
                <option value="">{products.length ? "Elige el producto" : "No hay productos en el catálogo"}</option>
                {opcionesProducto}
              </Select>
            </Field>
            <Field label="Cantidad" required>
              <Input className={s.num} type="number" inputMode="decimal" min={0} step="any" value={movement.quantity} onChange={(e) => setMovement((m) => ({ ...m, quantity: +e.target.value }))} />
            </Field>
            {movement.productId ? (
              <div className={s.campoPresentacion}>
                <Field label="Presentación" hint={previa ? previa.texto : undefined}>
                  <Select
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
                  </Select>
                </Field>
                {nuevoEmpaque ? (
                  <div className={s.altaEmpaque}>
                    <Input
                      controlSize="sm"
                      className={s.altaNombre}
                      value={nuevoEmpaque.nombre}
                      onChange={(e) => setNuevoEmpaque((n) => (n ? { ...n, nombre: e.target.value } : n))}
                      placeholder="Caja"
                      aria-label="Nombre de la presentación"
                    />
                    <Input
                      controlSize="sm"
                      className={s.altaPiezas}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={nuevoEmpaque.piezas}
                      onChange={(e) => setNuevoEmpaque((n) => (n ? { ...n, piezas: e.target.value } : n))}
                      placeholder="Piezas"
                      aria-label="Piezas que trae"
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
                    <LinkButton className={s.enlace} onClick={() => setNuevoEmpaque({ nombre: "", piezas: "" })}>
                      {empaques.length === 0 ? "+ Registrar una presentación (caja, paquete…)" : "+ Nueva presentación"}
                    </LinkButton>
                  )
                )}
              </div>
            ) : null}
          </Grupo>

          <Grupo paso={2} titulo="Dónde">
            <Field label={esEntrada ? "Almacén destino" : "Almacén origen"} required>
              <Select value={movement.warehouseId} onChange={(e) => setMovement((m) => ({ ...m, warehouseId: e.target.value }))}>
                <option value="">{warehouses.length ? "Elige el almacén" : "Primero crea un almacén"}</option>
                {opcionesAlmacen}
              </Select>
            </Field>
            {movement.type === "TRANSFER" && (
              <Field label="Almacén destino" required>
                <Select value={movement.toWarehouseId} onChange={(e) => setMovement((m) => ({ ...m, toWarehouseId: e.target.value }))}>
                  <option value="">Elige el almacén</option>
                  {warehouses.filter((w) => String(w.id) !== movement.warehouseId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </Field>
            )}
          </Grupo>

          <Grupo paso={3} titulo="Documento">
            <Field label="Costo unitario" optional>
              <Input className={s.num} type="number" inputMode="decimal" min={0} step="0.01" value={movement.unitCost} onChange={(e) => setMovement((m) => ({ ...m, unitCost: e.target.value }))} placeholder="$0.00" />
            </Field>
            <Field label="Referencia o documento" optional>
              <Input value={movement.reference} onChange={(e) => setMovement((m) => ({ ...m, reference: e.target.value }))} placeholder="OC-000123, venta, ajuste inicial…" />
            </Field>
            <Field label="Motivo o notas" optional fullWidth>
              <Input value={movement.notes} onChange={(e) => setMovement((m) => ({ ...m, notes: e.target.value }))} placeholder="Por qué se mueve el stock…" />
            </Field>
          </Grupo>
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
          <form className={s.formDialogo} onSubmit={(e) => { e.preventDefault(); void saveMinimo(); }}>
            <CeldaProducto nombre={editing.nombre} meta={`${editing.ubicacion} · hoy hay ${cantidad(editing.existencia)}`} foto={editing.foto} />
            <Field label="Avisar cuando queden menos de" hint="Debajo de esta cifra el producto sale como «Bajo mínimo».">
              <Input className={s.num} type="number" inputMode="numeric" min={0} value={minimo} onChange={(e) => setMinimo(+e.target.value)} autoFocus />
            </Field>
          </form>
        )}
      </Modal>

      {tab === "dashboard" && (
        <InteligenciaInventario insights={insights} loading={insightsLoading} onRetry={() => void loadInsights()} />
      )}

      {tab === "inventario" && (
        <ModulePage
          listLabel="Existencias"
          stats={
            cargadoUnaVez && items.length > 0 ? (
              <StatRow ariaLabel="Resumen del inventario" cols={4}>
                <Stat
                  label="Agotados"
                  value={resumen.sinStock}
                  hint={resumen.sinStock > 0 ? "Hay que reponerlos ya" : "Todo tiene existencia"}
                  tone={resumen.sinStock > 0 ? "danger" : "default"}
                  icon={<ReportProblemOutlined />}
                  iconTone={resumen.sinStock > 0 ? "danger" : "neutral"}
                  semaforo={resumen.sinStock > 0 ? "rojo" : "verde"}
                  onClick={() => alternarEstado("sin_stock")}
                  pressed={filterEstado === "sin_stock"}
                />
                <Stat
                  label="Bajo mínimo"
                  value={resumen.bajoMinimo}
                  hint={resumen.bajoMinimo > 0 ? "Por debajo del punto de reorden" : "Niveles sanos"}
                  tone={resumen.bajoMinimo > 0 ? "warning" : "default"}
                  icon={<TrendingDownOutlined />}
                  iconTone={resumen.bajoMinimo > 0 ? "warning" : "neutral"}
                  semaforo={resumen.bajoMinimo > 0 ? "ambar" : "verde"}
                  onClick={() => alternarEstado("bajo_minimo")}
                  pressed={filterEstado === "bajo_minimo"}
                />
                {resumen.valorTotal > 0 ? (
                  <Stat
                    label="Valor del inventario"
                    value={<Money value={resumen.valorTotal} compact />}
                    hint={`${cantidad(items.length)} registros de stock`}
                    icon={<PaidOutlined />}
                  />
                ) : (
                  <Stat label="Registros de stock" value={cantidad(items.length)} hint="Producto por almacén" icon={<Inventory2Outlined />} />
                )}
                <Stat label="Almacenes" value={warehouses.length} hint="Ubicaciones configuradas" icon={<WarehouseOutlined />} iconTone="neutral" />
              </StatRow>
            ) : undefined
          }
          before={
            productFilter || (loadError && cargadoUnaVez) || resumen.categorias.length > 0 ? (
              <div className={s.avisos}>
                {productFilter && (
                  <Alert
                    tone="info"
                    dense
                    action={<Button size="sm" variant="ghost" onClick={() => limpiarFiltroUrl()}>Ver todo el inventario</Button>}
                  >
                    Mostrando un solo producto.
                  </Alert>
                )}
                {loadError && cargadoUnaVez && (
                  <Alert
                    tone="warning"
                    role="alert"
                    action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
                  >
                    {`${loadError}. Se muestra lo último que cargó.`}
                  </Alert>
                )}
                {resumen.categorias.length > 0 && (
                  <Card pad aria-label="Productos por categoría">
                    <p className={s.rotulo}>Productos por categoría</p>
                    <ul className={s.categorias}>
                      {resumen.categorias.map(([cat, count]) => (
                        <li key={cat} className={s.categoria}>
                          <span className={s.categoriaNombre} title={cat}>{cat}</span>
                          <Progress value={count} max={Math.max(1, items.length)} ariaLabel={`${cat}: ${count}`} />
                          <span className={s.tenueNum}>{count}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
            ) : undefined
          }
          toolbar={
            <ModuleToolbar
              search={
                <SearchInput
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Buscar por SKU, nombre o categoría…"
                  aria-label="Buscar en el inventario"
                />
              }
              chips={
                <FilterChips ariaLabel="Estado de las existencias">
                  <FilterChip active={filterEstado === ""} count={cargadoUnaVez ? filasBuscadas.length : undefined} onClick={() => setFilterEstado("")}>
                    Todos
                  </FilterChip>
                  <FilterChip active={filterEstado === "sin_stock"} count={cargadoUnaVez ? conteoEstado.agotado : undefined} dot="danger" onClick={() => alternarEstado("sin_stock")}>
                    Agotado
                  </FilterChip>
                  <FilterChip active={filterEstado === "bajo_minimo"} count={cargadoUnaVez ? conteoEstado.bajo : undefined} dot="warning" onClick={() => alternarEstado("bajo_minimo")}>
                    Bajo mínimo
                  </FilterChip>
                  <FilterChip active={filterEstado === "ok"} count={cargadoUnaVez ? conteoEstado.ok : undefined} dot="success" onClick={() => alternarEstado("ok")}>
                    Suficiente
                  </FilterChip>
                </FilterChips>
              }
              end={
                items.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    iconStart={<FileDownloadOutlined fontSize="small" />}
                    onClick={() => exportToExcel(visibleItems, [
                      { key: "sku", label: "SKU" },
                      { key: "nombre", label: "Producto" },
                      { key: "categoria", label: "Categoría" },
                      { key: "existencia", label: "Existencia" },
                      { key: "minimo", label: "Mínimo" },
                      { key: "costo", label: "Costo unit." },
                      { key: "ubicacion", label: "Ubicación" },
                    ], "inventario")}
                  >
                    Excel
                  </Button>
                ) : undefined
              }
            />
          }
          loading={!cargadoUnaVez && !loadError}
          empty={cargadoUnaVez ? visibleItems.length === 0 : Boolean(loadError)}
          emptyState={
            !cargadoUnaVez
              ? {
                  title: "No se pudo cargar el inventario",
                  description: loadError,
                  tone: "danger",
                  action: <Button variant="secondary" onClick={() => void load()}>Reintentar</Button>,
                }
              : items.length
                ? {
                    title: "Ningún producto coincide",
                    description: "Prueba con otra búsqueda o quita el filtro de estado.",
                    tone: "neutral",
                    action: <Button size="sm" variant="secondary" onClick={quitarFiltrosInventario}>Quitar filtros</Button>,
                  }
                : {
                    icon: <Inventory2Outlined />,
                    title: "Aún no hay stock registrado",
                    description: "Crea un almacén y registra la primera entrada para empezar el inventario.",
                    action: cfg.canCreate ? (
                      <Button size="sm" variant="primary" iconStart={<AddOutlined fontSize="small" />} onClick={abrirEntrada}>Entrada de stock</Button>
                    ) : undefined,
                    secondaryAction: cfg.canCreate ? (
                      <Button size="sm" variant="secondary" onClick={() => setShowWarehouseForm(true)}>Nuevo almacén</Button>
                    ) : undefined,
                  }
          }
          footer={
            cargadoUnaVez && visibleItems.length > 0 ? (
              <ListFooter total={visibleItems.length} unit={visibleItems.length === 1 ? "producto" : "productos"} />
            ) : undefined
          }
        >
          <DataTable
            columns={columns}
            rows={visibleItems}
            rowKey={(r) => r.id}
            ariaLabel="Existencias"
            rowActions={accionesStock}
            rowActionsLabel="Acciones"
          />
        </ModulePage>
      )}

      {tab === "movimientos" && (
        <ModulePage
          listLabel="Movimientos de inventario"
          before={
            movementId ? (
              <Alert
                tone="info"
                dense
                action={<Button size="sm" variant="ghost" onClick={() => limpiarFiltroUrl("?tab=movimientos")}>Quitar resaltado</Button>}
              >
                El movimiento del aviso aparece primero.
              </Alert>
            ) : undefined
          }
          toolbar={
            <ModuleToolbar
              end={
                <>
                  {visibleMovements.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      iconStart={<FileDownloadOutlined fontSize="small" />}
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
                    iconStart={<PictureAsPdfOutlined fontSize="small" />}
                    onClick={() => void downloadMovementsPdf()}
                    disabled={movementsLoading || visibleMovements.length === 0}
                    loading={exportingPdf}
                  >
                    Kárdex PDF
                  </Button>
                  {/* Sin fila de acciones arriba, registrar vive aquí (es el único primario). */}
                  {!mostrarAcciones && cfg.canCreate ? (
                    <Button variant="primary" size="sm" iconStart={<AddOutlined fontSize="small" />} onClick={abrirEntrada}>
                      Registrar
                    </Button>
                  ) : null}
                </>
              }
            >
              <div className={s.filtros} role="group" aria-label="Filtros de movimientos">
                <Select controlSize="sm" wrapperClassName={s.filtroAncho} aria-label="Producto" value={movementProductFilter} onChange={(e) => setMovementProductFilter(e.target.value)}>
                  <option value="">Todos los productos</option>
                  {opcionesProducto}
                </Select>
                <Select controlSize="sm" wrapperClassName={s.filtro} aria-label="Almacén" value={movementWarehouseFilter} onChange={(e) => setMovementWarehouseFilter(e.target.value)}>
                  <option value="">Todos los almacenes</option>
                  {opcionesAlmacen}
                </Select>
                <Select controlSize="sm" wrapperClassName={s.filtro} aria-label="Tipo de movimiento" value={movementTypeFilter} onChange={(e) => setMovementTypeFilter(e.target.value)}>
                  <option value="">Todos los tipos</option>
                  {Object.entries(MOVEMENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                <DateInput controlSize="sm" className={s.fechaFiltro} aria-label="Desde" title="Desde" value={movementFromDate} onChange={(e) => setMovementFromDate(e.target.value)} />
                <DateInput controlSize="sm" className={s.fechaFiltro} aria-label="Hasta" title="Hasta" value={movementToDate} min={movementFromDate || undefined} onChange={(e) => setMovementToDate(e.target.value)} />
                {hasMovementFilters && (
                  <Button variant="ghost" size="sm" onClick={clearMovementFilters}>Limpiar filtros</Button>
                )}
              </div>
            </ModuleToolbar>
          }
          loading={movementsLoading && movements.length === 0}
          empty={visibleMovements.length === 0}
          emptyState={{
            icon: <SwapHorizOutlined />,
            title: hasMovementFilters ? "Ningún movimiento con esos filtros" : "Aún no hay movimientos",
            description: hasMovementFilters ? "Cambia las fechas o quita algún filtro." : "Registra una entrada, salida o traspaso para ver el historial aquí.",
            tone: hasMovementFilters ? "neutral" : "brand",
            action: hasMovementFilters ? (
              <Button size="sm" variant="secondary" onClick={clearMovementFilters}>Limpiar filtros</Button>
            ) : cfg.canCreate ? (
              <Button size="sm" variant="primary" onClick={abrirEntrada}>Registrar movimiento</Button>
            ) : undefined,
          }}
          footer={visibleMovements.length > 0 ? <ListFooter total={visibleMovements.length} unit="movimientos" /> : undefined}
        >
          <DataTable
            columns={movementColumns}
            rows={visibleMovements}
            rowKey={(m) => m.id}
            ariaLabel="Movimientos de inventario"
            rowActionsLabel="Comprobante"
            rowActions={(m) => (
              <Button
                size="sm"
                variant="ghost"
                iconStart={<PictureAsPdfOutlined fontSize="small" />}
                aria-label={`Descargar comprobante ${m.movementNumber}`}
                onClick={(e) => { e.stopPropagation(); void downloadMovementSlip(m.id); }}
              >
                PDF
              </Button>
            )}
          />
        </ModulePage>
      )}

      {tab === "lotes" && (
        <ModulePage
          listLabel="Lotes"
          stats={
            !lotsLoading || lots.length > 0 ? (
              <StatRow ariaLabel="Resumen de lotes" cols={2}>
                <Stat label="Lotes registrados" value={lots.length} icon={<Inventory2Outlined />} />
                <Stat
                  label="Por caducar o caducados"
                  value={expiringLotsCount}
                  hint="Caducan en 30 días o menos"
                  tone={expiringLotsCount > 0 ? "warning" : "default"}
                  icon={<EventBusyOutlined />}
                  iconTone={expiringLotsCount > 0 ? "warning" : "neutral"}
                  semaforo={expiringLotsCount > 0 ? "ambar" : "verde"}
                />
              </StatRow>
            ) : undefined
          }
          before={
            showLotForm ? (
              <form onSubmit={(e) => { e.preventDefault(); void saveLot(); }}>
                <FormSection title="Nuevo lote" description="Trazabilidad por lote, con aviso cuando se acerca la fecha de caducidad.">
                  <FieldGrid>
                    <Field label="Número de lote" required>
                      <Input value={lotForm.lotNumber} onChange={(e) => setLotForm((f) => ({ ...f, lotNumber: e.target.value }))} placeholder="LOTE-2026-001" autoFocus />
                    </Field>
                    <Field label="Producto" required>
                      <Select value={lotForm.productId} onChange={(e) => setLotForm((f) => ({ ...f, productId: e.target.value }))}>
                        <option value="">Elige el producto</option>
                        {opcionesProducto}
                      </Select>
                    </Field>
                    <Field label="Fecha de fabricación" optional>
                      <DateInput value={lotForm.manufacturingDate} onChange={(e) => setLotForm((f) => ({ ...f, manufacturingDate: e.target.value }))} />
                    </Field>
                    <Field label="Fecha de caducidad" optional>
                      <DateInput value={lotForm.expirationDate} min={lotForm.manufacturingDate || undefined} onChange={(e) => setLotForm((f) => ({ ...f, expirationDate: e.target.value }))} />
                    </Field>
                    <Field label="Notas" optional fullWidth>
                      <Input value={lotForm.notes} onChange={(e) => setLotForm((f) => ({ ...f, notes: e.target.value }))} />
                    </Field>
                  </FieldGrid>
                  {lotSaveErr && (
                    <Alert tone="danger" role="alert" dense className={s.avisoForm}>
                      {lotSaveErr}
                    </Alert>
                  )}
                  <div className={s.acciones}>
                    <Button variant="secondary" onClick={() => { setShowLotForm(false); setLotSaveErr(null); }}>Cancelar</Button>
                    <Button type="submit" variant="primary" loading={savingLot}>Crear lote</Button>
                  </div>
                </FormSection>
              </form>
            ) : undefined
          }
          toolbar={
            <ModuleToolbar
              end={
                <>
                  {lots.length > 0 && (
                    <Button variant="ghost" size="sm" iconStart={<FileDownloadOutlined fontSize="small" />} onClick={() => exportToExcel(
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
                  {cfg.canCreate && !showLotForm ? (
                    <Button variant="tonal" size="sm" iconStart={<AddOutlined fontSize="small" />} onClick={abrirNuevoLote}>Nuevo lote</Button>
                  ) : null}
                </>
              }
            >
              <p className={s.toolbarTexto}>Trazabilidad por lote, con aviso cuando se acerca la fecha de caducidad.</p>
            </ModuleToolbar>
          }
          loading={lotsLoading && lots.length === 0}
          empty={lots.length === 0}
          emptyState={{
            icon: <EventBusyOutlined />,
            title: "Aún no hay lotes",
            description: "Registra el primer lote para rastrear fabricación y caducidad.",
            action: cfg.canCreate && !showLotForm ? <Button size="sm" variant="tonal" onClick={abrirNuevoLote}>Nuevo lote</Button> : undefined,
          }}
        >
          <DataTable columns={lotColumns} rows={lots} rowKey={(l) => l.id} ariaLabel="Lotes" />
        </ModulePage>
      )}

      {tab === "valuacion" && (
        <ModulePage
          listLabel="Valuación"
          stats={
            !valuationLoading || valuation.length > 0 ? (
              <StatRow ariaLabel="Resumen de valuación" cols={2}>
                <Stat label="Valor total" value={<Money value={totalValuation} compact />} tone="brand" icon={<PaidOutlined />} />
                <Stat label="Productos valuados" value={valuation.length} icon={<Inventory2Outlined />} iconTone="neutral" />
              </StatRow>
            ) : undefined
          }
          toolbar={
            <ModuleToolbar
              end={
                valuation.length > 0 ? (
                  <Button variant="ghost" size="sm" iconStart={<FileDownloadOutlined fontSize="small" />} onClick={() => exportToExcel(
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
                ) : undefined
              }
            >
              <div className={s.filtros}>
                <Select controlSize="sm" wrapperClassName={s.filtroAncho} aria-label="Almacén" value={valuationWarehouseFilter} onChange={(e) => setValuationWarehouseFilter(e.target.value)}>
                  <option value="">Todos los almacenes</option>
                  {opcionesAlmacen}
                </Select>
                {valuationWarehouseFilter && (
                  <Button variant="ghost" size="sm" onClick={() => setValuationWarehouseFilter("")}>Limpiar filtro</Button>
                )}
              </div>
              <p className={s.toolbarTexto}>Costo unitario y valor total por producto y almacén, con el método de valuación configurado.</p>
            </ModuleToolbar>
          }
          loading={valuationLoading && valuation.length === 0}
          empty={valuation.length === 0}
          emptyState={{
            icon: <PaidOutlined />,
            title: "Sin datos de valuación",
            description: "Registra stock en un almacén para calcular el valor del inventario.",
            action: cfg.canCreate ? <Button size="sm" variant="secondary" onClick={abrirEntrada}>Entrada de stock</Button> : undefined,
          }}
          footer={valuation.length > 0 ? <ListFooter total={valuation.length} unit="registros" /> : undefined}
        >
          <DataTable columns={valuationColumns} rows={valuation} rowKey={(v) => v.id} ariaLabel="Valuación" />
        </ModulePage>
      )}

      {tab === "conteos" && (
        <div className={s.pila}>
          <Card aria-label="Conteos cíclicos">
            <CardHead
              title="Conteos cíclicos"
              subtitle="Programa un conteo físico, captura lo que encuentres y ciérralo: la diferencia se ajusta sola en el stock."
              actions={cfg.canCreate && !showScheduleForm ? (
                <Button variant="tonal" size="sm" iconStart={<AddOutlined fontSize="small" />} onClick={() => setShowScheduleForm(true)}>Programar conteo</Button>
              ) : undefined}
            />
            {showScheduleForm && (
              <form className={s.subpanel} onSubmit={(e) => { e.preventDefault(); void submitSchedule(); }}>
                <p className={s.subpanelTitulo}>Programar conteo</p>
                <FieldGrid>
                  <Field label="Almacén" required>
                    <Select value={scheduleForm.warehouseId} onChange={(e) => setScheduleForm((f) => ({ ...f, warehouseId: e.target.value }))}>
                      <option value="">Elige el almacén</option>
                      {opcionesAlmacen}
                    </Select>
                  </Field>
                  <Field label="Fecha" required>
                    <DateInput value={scheduleForm.scheduledFor} onChange={(e) => setScheduleForm((f) => ({ ...f, scheduledFor: e.target.value }))} />
                  </Field>
                  <Field label="Notas" optional fullWidth hint="Se toma la existencia de hoy como punto de partida para comparar.">
                    <Input value={scheduleForm.notes} onChange={(e) => setScheduleForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Conteo trimestral, auditoría sorpresa…" />
                  </Field>
                </FieldGrid>
                <div className={s.acciones}>
                  <Button variant="secondary" onClick={() => setShowScheduleForm(false)}>Cancelar</Button>
                  <Button type="submit" variant="primary" disabled={!scheduleForm.warehouseId || !scheduleForm.scheduledFor} loading={savingSchedule}>
                    Programar conteo
                  </Button>
                </div>
              </form>
            )}

            {activeCount && (
              <div className={s.subpanel}>
                <div className={s.subpanelCabeza}>
                  <p className={s.subpanelTitulo}>
                    Conteo {activeCount.countNumber} · {activeCount.warehouse?.name}{" "}
                    <Badge tone={TONO_DE_VARIANTE[varianteConteo(activeCount.status)]} size="sm" dot>
                      {CYCLE_COUNT_STATUS_LABEL[activeCount.status] ?? "Sin estado"}
                    </Badge>
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => setActiveCount(null)}>Cerrar panel</Button>
                </div>
                <div className={`${s.conteoFila} ${s.conteoCabeza}`} aria-hidden="true">
                  <span>Producto</span><span>Sistema</span><span>Contado</span><span>Diferencia</span>
                </div>
                <div className={s.conteoLista}>
                  {activeCountItems.map((it) => {
                    const counted = captureQty[it.productId] ?? "";
                    const variance = counted !== "" ? Number(counted) - Number(it.expectedQty) : (it.varianceQty != null ? Number(it.varianceQty) : null);
                    const nombre = it.product?.name ?? "Producto";
                    const signo = variance == null ? "nulo" : variance === 0 ? "cero" : variance > 0 ? "mas" : "menos";
                    return (
                      <div key={it.id} className={s.conteoFila}>
                        <NombreProducto nombre={nombre} meta={it.product?.sku} />
                        <span className={s.tenueNum}>{cantidad(it.expectedQty)}</span>
                        <Input
                          controlSize="sm"
                          className={s.num}
                          type="number"
                          inputMode="decimal"
                          disabled={activeCountClosed}
                          value={counted}
                          onChange={(e) => setCaptureQty((q) => ({ ...q, [it.productId]: e.target.value }))}
                          placeholder="Contado"
                          aria-label={`Cantidad contada de ${nombre}`}
                        />
                        <span className={s.diferencia} data-signo={signo}>
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
              <div className={s.carga}>
                <SkeletonRows rows={4} label="Cargando conteos" />
              </div>
            ) : (
              <DataTable
                columns={cycleCountColumns}
                rows={cycleCounts}
                rowKey={(c) => c.id}
                flush
                ariaLabel="Conteos cíclicos"
                rowActions={accionesConteo}
                rowActionsLabel="Acciones"
                emptyTitle="Sin conteos programados"
                emptyDescription="Programa un conteo para comparar el stock físico contra el sistema."
                emptyAction={cfg.canCreate && !showScheduleForm ? <Button size="sm" variant="tonal" onClick={() => setShowScheduleForm(true)}>Programar conteo</Button> : undefined}
              />
            )}
          </Card>

          <Card aria-label="Reservas de stock">
            <CardHead
              title="Reservas de stock"
              subtitle="Aparta stock para una cotización u orden sin sacarlo del almacén."
              actions={cfg.canCreate && !showReservationForm ? (
                <Button variant="tonal" size="sm" iconStart={<AddOutlined fontSize="small" />} onClick={() => setShowReservationForm(true)}>Nueva reserva</Button>
              ) : undefined}
            />
            {showReservationForm && (
              <form className={s.subpanel} onSubmit={(e) => { e.preventDefault(); void submitReservation(); }}>
                <p className={s.subpanelTitulo}>Nueva reserva</p>
                <FieldGrid>
                  <Field label="Producto" required>
                    <Select value={reservationForm.productId} onChange={(e) => setReservationForm((f) => ({ ...f, productId: e.target.value }))}>
                      <option value="">Elige el producto</option>
                      {opcionesProducto}
                    </Select>
                  </Field>
                  <Field label="Almacén" required>
                    <Select value={reservationForm.warehouseId} onChange={(e) => setReservationForm((f) => ({ ...f, warehouseId: e.target.value }))}>
                      <option value="">Elige el almacén</option>
                      {opcionesAlmacen}
                    </Select>
                  </Field>
                  <Field label="Cantidad" required>
                    <Input className={s.num} type="number" inputMode="decimal" min={1} value={reservationForm.quantity} onChange={(e) => setReservationForm((f) => ({ ...f, quantity: +e.target.value }))} />
                  </Field>
                  <Field label="Vence" optional>
                    <DateInput value={reservationForm.expiresAt} onChange={(e) => setReservationForm((f) => ({ ...f, expiresAt: e.target.value }))} />
                  </Field>
                  <Field label="Motivo" required fullWidth>
                    <Input value={reservationForm.reason} onChange={(e) => setReservationForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Cotización COT-000123, orden de cliente…" />
                  </Field>
                </FieldGrid>
                <div className={s.acciones}>
                  <Button variant="secondary" onClick={() => setShowReservationForm(false)}>Cancelar</Button>
                  <Button type="submit" variant="primary" disabled={!reservationForm.productId || !reservationForm.warehouseId || !reservationForm.reason.trim()} loading={savingReservation}>
                    Reservar
                  </Button>
                </div>
              </form>
            )}
            {reservationsLoading && reservations.length === 0 ? (
              <div className={s.carga}>
                <SkeletonRows rows={4} label="Cargando reservas" />
              </div>
            ) : (
              <DataTable
                columns={reservationColumns}
                rows={reservations}
                rowKey={(r) => r.id}
                flush
                ariaLabel="Reservas de stock"
                rowActions={accionesReserva}
                rowActionsLabel="Acciones"
                emptyTitle="Sin reservas activas"
                emptyDescription="Reserva stock para apartarlo a una cotización u orden sin despacharlo todavía."
                emptyAction={cfg.canCreate && !showReservationForm ? <Button size="sm" variant="tonal" onClick={() => setShowReservationForm(true)}>Nueva reserva</Button> : undefined}
              />
            )}
          </Card>
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
    </div>
  );
}
