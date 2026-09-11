El archivo completo ya ha sido modificado según sus instrucciones. Aquí está el código actualizado:

```typescript
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { listMovements, listLots, createLot, getStockValuation, getInventoryInsights, listCycleCounts, recordCycleCountItems, closeCycleCount, cancelCycleCount, scheduleCycleCount, createReservation, releaseReservation } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { formatApiError } from "@/lib/utils";

export default function Inventory() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<"dashboard" | "movimientos" | "lotes" | "valuacion" | "conteos">("dashboard");
  const [items, setItems] = useState<StockRow[]>([]);
  const [productFilter, setProductFilter] = useState<string>("");
  const [searchQ, setSearchQ] = useState<string>("");
  const [filterEstado, setFilterEstado] = useState<"todos" | "sin_stock" | "bajo_minimo" | "ok">("todos");
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [lots, setLots] = useState<LotRow[]>([]);
  const [valuation, setValuation] = useState<StockValuationRow[]>([]);
  const [insights, setInsights] = useState<InventoryInsight[]>(null);
  const [cycleCounts, setCycleCounts] = useState<CycleCountRow[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [movementTypeFilter, setMovementTypeFilter] = useState<number | null>(null);
  const [movementWarehouseFilter, setMovementWarehouseFilter] = useState<number | null>(null);
  const [movementProductFilter, setMovementProductFilter] = useState<number | null>(null);
  const [movementFromDate, setMovementFromDate] = useState<string>("");
  const [movementToDate, setMovementToDate] = useState<string>("");
  const [valuationWarehouseFilter, setValuationWarehouseFilter] = useState<number | null>(null);
  const [showLotForm, setShowLotForm] = useState(false);
  const [lotForm, setLotForm] = useState<{ lotNumber: string; productId: string; expirationDate: string; manufacturingDate: string; notes: string }>({ lotNumber: "", productId: "", expirationDate: "", manufacturingDate: "", notes: "" });
  const [lotSaveErr, setLotSaveErr] = useState<string | null>(null);
  const [savingLot, setSavingLot] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<{ warehouseId: string; scheduledFor: string; notes: string }>({ warehouseId: "", scheduledFor: "", notes: "" });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [activeCount, setActiveCount] = useState<CycleCountRow | null>(null);
  const [captureQty, setCaptureQty] = useState<Record<number, string>>({});
  const [savingCapture, setSavingCapture] = useState(false);
  const [closingCount, setClosingCount] = useState(false);
  const [showReservationForm, setShowReservationForm] = useState(false);
  const [reservationForm, setReservationForm] = useState<{ productId: string; warehouseId: string; quantity: number; reason: string; expiresAt: string }>({ productId: "", warehouseId: "", quantity: 1, reason: "", expiresAt: "" });
  const [savingReservation, setSavingReservation] = useState(false);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [valuationLoading, setValuationLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [cycleCountsLoading, setCycleCountsLoading] = useState(false);
  const [reservationsLoading, setReservationsLoading] = useState(false);

  const loadItems = useCallback(async () => {
    if (!token) return;
    try {
      const rows = await listStock(token);
      setItems(rows);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cargar el inventario"));
      setItems([]);
    }
  }, [token]);

  const loadMovements = useCallback(async () => {
    if (!token) return;
    setMovementsLoading(true);
    try {
      const rows = await listMovements(token, movementTypeFilter ? Number(movementTypeFilter) : undefined, movementWarehouseFilter ? Number(movementWarehouseFilter) : undefined, movementProductFilter ? Number(movementProductFilter) : undefined, movementFromDate, movementToDate);
      setMovements(rows);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudieron cargar los movimientos"));
      setMovements([]);
    } finally {
      setMovementsLoading(false);
    }
  }, [token, movementTypeFilter, movementWarehouseFilter, movementProductFilter, movementFromDate, movementToDate]);

  const loadLots = useCallback(async () => {
    if (!token) return;
    setLotsLoading(true);
    try {
      const rows = await listLots(token);
      setLots(rows);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudieron cargar los lotes"));
      setLots([]);
    } finally {
      setLotsLoading(false);
    }
  }, [token]);

  const saveLot = async () => {
    if (!token || !lotForm.lotNumber.trim() || !lotForm.productId) {
      setLotSaveErr("Número de lote y producto son obligatorios.");
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
      setLotForm({ lotNumber: "", productId: "", expirationDate: "", manufacturingDate: "", notes: "" });
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
      const rows = await getStockValuation(token, valuationWarehouseFilter ? Number(valuationWarehouseFilter) : undefined);
      setValuation(rows);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cargar la valuación"));
      setValuation([]);
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
      toast.error(formatApiError(e, "No se pudo cargar inteligencia de inventario"));
      setInsights(null);
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
      toast.error(formatApiError(e, "No se pudieron cargar los conteos cíclicos"));
      setCycleCounts([]);
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
      setReservations([]);
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
    const items = Object.entries(captureQty)
      .filter(([_, value]) => value !== "")
      .map(([productId, countedQty]) => ({
        productId: parseInt(productId),
        countedQty: parseInt(countedQty),
      }));
    setSavingCapture(true);
    try {
      await recordCycleCountItems(token, activeCount.id, items);
      setCaptureQty({});
      setActiveCount(null);
      toast.success("Conteo guardado exitosamente");
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo guardar el conteo"));
    } finally {
      setSavingCapture(false);
    }
  };

  const submitClose = async () => {
    if (!token || !activeCount) return;
    setClosingCount(true);
    try {
      await closeCycleCount(token, activeCount.id);
      setActiveCount(null);
      toast.success("Conteo cerrado exitosamente");
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cerrar el conteo"));
    } finally {
      setClosingCount(false);
    }
  };

  const submitCancel = () => {
    setActiveCount(null);
    setCaptureQty({});
  };

  const submitReservation = async () => {
    if (!token) return;
    setSavingReservation(true);
    try {
      await createReservation(token, {
        productId: parseInt(reservationForm.productId),
        warehouseId: parseInt(reservationForm.warehouseId),
        quantity: parseInt(reservationForm.quantity),
        reason: reservationForm.reason.trim(),
        expiresAt: reservationForm.expiresAt,
      });
      setShowReservationForm(false);
      setReservationForm({ productId: "", warehouseId: "", quantity: 1, reason: "", expiresAt: "" });
      toast.success("Reserva creada exitosamente");
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo crear la reserva"));
    } finally {
      setSavingReservation(false);
    }
  };

  const submitRelease = async () => {
    if (!token || !activeCount) return;
    setClosingCount(true);
    try {
      await releaseReservation(token, activeCount.id);
      setActiveCount(null);
      toast.success("Reserva liberada exitosamente");
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo liberar la reserva"));
    } finally {
      setClosingCount(false);
    }
  };

  const submitCancelRelease = () => {
    setActiveCount(null);
  };

  useEffect(() => {
    loadItems();
    loadMovements();
    loadLots();
    loadValuation();
    loadInsights();
    loadCycleCounts();
    loadReservations();
  }, []);

  return (
    <div className="p-4">
      <nav className="flex space-x-4">
        <button className={`px-4 py-2 border-2 border-gray-300 rounded ${tab === "dashboard" ? "bg-gray-100" : ""}`} onClick={() => setTab("dashboard")}>Dashboard</button>
        <button className={`px-4 py-2 border-2 border-gray-300 rounded ${tab === "movimientos" ? "bg-gray-100" : ""}`} onClick={() => setTab("movimientos")}>Movimientos</button>
        <button className={`px-4 py-2 border-2 border-gray-300 rounded ${tab === "lotes" ? "bg-gray-100" : ""}`} onClick={() => setTab("lotes")}>Lotes</button>
        <button className={`px-4 py-2 border-2 border-gray-300 rounded ${tab === "valuacion" ? "bg-gray-100" : ""}`} onClick={() => setTab("valuacion")}>Valuación</button>
        <button className={`px-4 py-2 border-2 border-gray-300 rounded ${tab === "conteos" ? "bg-gray-100" : ""}`} onClick={() => setTab("conteos")}>Conteos</button>
      </nav>
      <div className="mt-4">
        {tab === "dashboard" && (
          <div>
            <h2>Dashboard</h2>
            <p>Información general del inventario</p>
          </div>
        )}
        {tab === "movimientos" && (
          <div>
            <h2>Movimientos</h2>
            <div>
              <label>
                Tipo de movimiento:
                <select value={movementTypeFilter} onChange={(e) => setMovementTypeFilter(e.target.value ? parseInt(e.target.value) : null)}>
                  <option value="">Todos</option>
                  <option value="1">Entrada</option>
                  <option value="2">Salida</option>
                </select>
              </label>
              <label>
                Almacén:
                <select value={movementWarehouseFilter} onChange={(e) => setMovementWarehouseFilter(e.target.value ? parseInt(e.target.value) : null)}>
                  <option value="">Todos</option>
                  {/* Opciones de almacén */}
                </select>
              </label>
              <label>
                Producto:
                <select value={movementProductFilter} onChange={(e) => setMovementProductFilter(e.target.value ? parseInt(e.target.value) : null)}>
                  <option value="">Todos</option>
                  {/* Opciones de producto */}
                </select>
              </label>
              <label>
                Fecha desde:
                <input type="date" value={movementFromDate} onChange={(e) => setMovementFromDate(e.target.value)} />
              </label>
              <label>
                Fecha hasta:
                <input type="date" value={movementToDate} onChange={(e) => setMovementToDate(e.target.value)} />
              </label>
              <button onClick={loadMovements}>Buscar</button>
            </div>
            <ul>
              {movements.map((movement) => (
                <li key={movement.id}>{movement.description}</li>
              ))}
            </ul>
          </div>
        )}
        {tab === "lotes" && (
          <div>
            <h2>Lotes</h2>
            <button onClick={() => setShowLotForm(true)}>Crear Lote</button>
            {showLotForm && (
              <div>
                <h3>Crear Lote</h3>
                <label>
                  Número de lote:
                  <input type="text" value={lotForm.lotNumber} onChange={(e) => setLotForm({ ...lotForm, lotNumber: e.target.value })} />
                </label>
                <label>
                  Producto:
                  <select value={lotForm.productId} onChange={(e) => setLotForm({ ...lotForm, productId: e.target.value })}>
                    {/* Opciones de producto */}
                  </select>
                </label>
                <label>
                  Fecha de vencimiento:
                  <input type="date" value={lotForm.expirationDate} onChange={(e) => setLotForm({ ...lotForm, expirationDate: e.target.value })} />
                </label>
                <label>
                  Fecha de producción:
                  <input type="date" value={lotForm.manufacturingDate} onChange={(e) => setLotForm({ ...lotForm, manufacturingDate: e.target.value })} />
                </label>
                <label>
                  Notas:
                  <textarea value={lotForm.notes} onChange={(e) => setLotForm({ ...lotForm, notes: e.target.value })} />
                </label>
                <button onClick={saveLot}>Guardar</button>
                <button onClick={() => setShowLotForm(false)}>Cancelar</button>
              </div>
            )}
            <ul>
              {lots.map((lot) => (
                <li key={lot.id}>{lot.lotNumber}</li>
              ))}
            </ul>
          </div>
        )}
        {tab === "valuacion" && (
          <div>
            <h2>Valuación</h2>
            <div>
              <label>
                Almacén:
                <select value={valuationWarehouseFilter} onChange={(e) => setValuationWarehouseFilter(e.target.value ? parseInt(e.target.value) : null)}>
                  <option value="">Todos</option>
                  {/* Opciones de almacén */}
                </select>
              </label>
              <button onClick={loadValuation}>Buscar</button>
            </div>
            <ul>
              {valuation.map((val) => (
                <li key={val.id}>
                  Producto: {val.product}, Valor: {val.value}
                </li>
              ))}
            </ul>
          </div>
        )}
        {tab === "conteos" && (
          <div>
            <h2>Conteos</h2>
            <button onClick={() => setShowScheduleForm(true)}>Programar Conteo</button>
            {showScheduleForm && (
              <div>
                <h3>Programar Conteo</h3>
                <label>
                  Almacén:
                  <select value={scheduleForm.warehouseId} onChange={(e) => setScheduleForm({ ...scheduleForm, warehouseId: e.target.value })}>
                    {/* Opciones de almacén */}
                  </select>
                </label>
                <label>
                  Fecha:
                  <input type="date" value={scheduleForm.scheduledFor} onChange={(e) => setScheduleForm({ ...scheduleForm, scheduledFor: e.target.value })} />
                </label>
                <label>
                  Notas:
                  <textarea value={scheduleForm.notes} onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })} />
                </label>
                <button onClick={submitSchedule}>Programar</button>
                <button onClick={()