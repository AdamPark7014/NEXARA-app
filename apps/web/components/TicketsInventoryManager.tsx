"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

type BranchOption = { id: number; name: string; branchNumber?: string | null };

type InventoryItemDraft = {
  sectionName: string;
  groupName: string;
  equipmentName: string;
  serialBefore: string;
  modelBefore: string;
  beforePanoramicPhotoUrl: string;
  beforeCloseupPhotoUrl: string;
  serialAfter: string;
  modelAfter: string;
  afterPanoramicPhotoUrl: string;
  afterCloseupPhotoUrl: string;
  maintenanceStickerPhotoUrl: string;
  maintenanceActions: string;
  maintenanceComments: string;
};

type InventorySnapshot = {
  id: number;
  status: string;
  title?: string | null;
  notes?: string | null;
  previousCount?: number | null;
  currentCount?: number | null;
  deltaCount?: number | null;
  updatedAt?: string | null;
  branch?: { id: number; name?: string | null; branchNumber?: string | null } | null;
  items?: any[];
};

type Props = {
  token: string;
  apiUrl: string;
  mode: "branch" | "client";
  fixedBranch?: BranchOption;
  branches?: BranchOption[];
};

const GROUP_OPTIONS = [
  "SERVIDORES",
  "COMANDERAS",
  "SCANNERS",
  "IMPRESORAS",
  "CAJAS",
  "TERMINALES",
  "PANTALLAS",
  "RED",
  "UPS",
  "OTROS",
];

const emptyItem = (): InventoryItemDraft => ({
  sectionName: "",
  groupName: "OTROS",
  equipmentName: "",
  serialBefore: "",
  modelBefore: "",
  beforePanoramicPhotoUrl: "",
  beforeCloseupPhotoUrl: "",
  serialAfter: "",
  modelAfter: "",
  afterPanoramicPhotoUrl: "",
  afterCloseupPhotoUrl: "",
  maintenanceStickerPhotoUrl: "",
  maintenanceActions: "",
  maintenanceComments: "",
});

export default function TicketsInventoryManager({ token, apiUrl, mode, fixedBranch, branches = [] }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inventories, setInventories] = useState<InventorySnapshot[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(fixedBranch ? String(fixedBranch.id) : "");
  const [selectedInventoryId, setSelectedInventoryId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [historyQuery, setHistoryQuery] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const [isCompact, setIsCompact] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [previousCount, setPreviousCount] = useState(0);
  const [items, setItems] = useState<InventoryItemDraft[]>([]);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const itemCardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const buildApiUrl = (path: string) => `${apiUrl}/${path.replace(/^\/+/, "")}`;
  const getAssetUrl = (url?: string | null) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const base = apiUrl.replace(/\/+api\/?$/, "");
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  const activeBranchId = mode === "branch" ? fixedBranch?.id : selectedBranchId ? Number(selectedBranchId) : undefined;

  const filteredInventories = useMemo(() => {
    const byBranch = mode === 'branch'
      ? inventories
      : !activeBranchId
        ? inventories
        : inventories.filter((inventory) => Number(inventory.branch?.id || 0) === activeBranchId);

    const byStatus = statusFilter === 'all'
      ? byBranch
      : byBranch.filter((inventory) => String(inventory.status || '').toUpperCase() === statusFilter);

    const normalizedQuery = historyQuery.trim().toLowerCase();
    if (!normalizedQuery) return byStatus;

    return byStatus.filter((inventory) => {
      const haystack = [
        inventory.id,
        inventory.title,
        inventory.status,
        inventory.branch?.name,
        inventory.branch?.branchNumber,
      ]
        .map((entry) => String(entry || '').toLowerCase())
        .join(' ');
      return haystack.includes(normalizedQuery);
    });
  }, [inventories, mode, activeBranchId, statusFilter, historyQuery]);

  const inventoryStats = useMemo(() => {
    const stats = {
      total: filteredInventories.length,
      pending: 0,
      completed: 0,
      approved: 0,
      rejected: 0,
      delta: 0,
    };

    for (const inventory of filteredInventories) {
      const status = String(inventory.status || '').toUpperCase();
      if (status === 'PENDING') stats.pending += 1;
      if (status === 'COMPLETED') stats.completed += 1;
      if (status === 'APPROVED') stats.approved += 1;
      if (status === 'REJECTED') stats.rejected += 1;
      stats.delta += Number(inventory.deltaCount || 0);
    }

    return stats;
  }, [filteredInventories]);

  const visibleItems = useMemo(() => {
    const normalized = itemQuery.trim().toLowerCase();
    const list = items.map((item, index) => ({ item, index }));
    return list.filter(({ item }) => {
      if (groupFilter !== 'ALL' && item.groupName !== groupFilter) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      const haystack = [
        item.sectionName,
        item.groupName,
        item.equipmentName,
        item.serialBefore,
        item.serialAfter,
        item.modelBefore,
        item.modelAfter,
        item.maintenanceActions,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(normalized);
    });
  }, [items, itemQuery, groupFilter]);

  const getStatusLabel = (status?: string | null) => {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'PENDING') return 'Pendiente';
    if (normalized === 'COMPLETED') return 'Realizado';
    if (normalized === 'APPROVED') return 'Aprobado';
    if (normalized === 'REJECTED') return 'Desaprobado';
    return status || '-';
  };

  const isItemComplete = (item: InventoryItemDraft) => {
    const hasHeader = item.sectionName.trim() && item.groupName.trim() && item.equipmentName.trim();
    const hasBefore = item.serialBefore.trim() && item.modelBefore.trim() && item.beforePanoramicPhotoUrl.trim() && item.beforeCloseupPhotoUrl.trim();
    const hasAfter = item.serialAfter.trim() && item.modelAfter.trim() && item.afterPanoramicPhotoUrl.trim() && item.afterCloseupPhotoUrl.trim();
    const hasMaintenance = item.maintenanceStickerPhotoUrl.trim() && item.maintenanceComments.trim() && item.maintenanceActions.trim();
    return Boolean(hasHeader && hasBefore && hasAfter && hasMaintenance);
  };

  const completionCount = useMemo(() => items.filter((item) => isItemComplete(item)).length, [items]);
  const completionRate = items.length > 0 ? Math.round((completionCount / items.length) * 100) : 0;
  const pendingVisibleCount = useMemo(() => visibleItems.filter(({ item }) => !isItemComplete(item)).length, [visibleItems]);

  const focusItem = (index: number) => {
    setActiveItemIndex(index);
    const node = itemCardRefs.current[index];
    node?.focus({ preventScroll: true });
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const fetchInventories = async () => {
    setLoading(true);
    setError(null);
    const query = mode === "client" && activeBranchId ? `?branchId=${activeBranchId}` : "";
    const endpoint = mode === "branch" ? "branch-portal/inventories" : `client-portal/inventories${query}`;
    const response = await fetch(buildApiUrl(endpoint), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = response.ok ? await response.json() : [];
    setInventories(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    fetchInventories();
  }, [token, selectedBranchId]);

  useEffect(() => {
    if (mode === "client" && !selectedBranchId && branches.length > 0) {
      setSelectedBranchId(String(branches[0].id));
    }
  }, [mode, branches, selectedBranchId]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const updateMatch = () => setIsCompact(mediaQuery.matches);
    updateMatch();
    mediaQuery.addEventListener('change', updateMatch);
    return () => mediaQuery.removeEventListener('change', updateMatch);
  }, []);

  useEffect(() => {
    if (!error && !success) return;
    const timeout = window.setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, 4500);
    return () => window.clearTimeout(timeout);
  }, [error, success]);

  useEffect(() => {
    if (visibleItems.length === 0) return;
    const hasActiveVisible = visibleItems.some(({ index }) => index === activeItemIndex);
    if (!hasActiveVisible) {
      setActiveItemIndex(visibleItems[0].index);
    }
  }, [visibleItems, activeItemIndex]);

  const loadDetail = async (inventoryId: number) => {
    setLoading(true);
    setError(null);
    const endpoint = mode === "branch" ? `branch-portal/inventories/${inventoryId}` : `client-portal/inventories/${inventoryId}`;
    const response = await fetch(buildApiUrl(endpoint), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setError("No se pudo cargar el inventario");
      setLoading(false);
      return;
    }
    const detail = await response.json();
    setSelectedInventoryId(detail.id);
    setTitle(detail.title || "");
    setNotes(detail.notes || "");
    setPreviousCount(Number(detail.previousCount || 0));
    const nextItems = (Array.isArray(detail.items) ? detail.items : []).map((item: any) => ({
      sectionName: item.sectionName || "",
      groupName: item.groupName || "OTROS",
      equipmentName: item.equipmentName || "",
      serialBefore: item.serialBefore || item.serialNumber || "",
      modelBefore: item.modelBefore || item.model || "",
      beforePanoramicPhotoUrl: item.beforePanoramicPhotoUrl || "",
      beforeCloseupPhotoUrl: item.beforeCloseupPhotoUrl || "",
      serialAfter: item.serialAfter || item.serialNumber || "",
      modelAfter: item.modelAfter || item.model || "",
      afterPanoramicPhotoUrl: item.afterPanoramicPhotoUrl || "",
      afterCloseupPhotoUrl: item.afterCloseupPhotoUrl || "",
      maintenanceStickerPhotoUrl: item.maintenanceStickerPhotoUrl || "",
      maintenanceActions: item.maintenanceActions || "",
      maintenanceComments: item.maintenanceComments || "",
    }));
    setItems(nextItems.length > 0 ? nextItems : [emptyItem()]);
    setActiveItemIndex(0);
    setLoading(false);
  };

  const resetEditor = () => {
    setSelectedInventoryId(null);
    setTitle("");
    setNotes("");
    setPreviousCount(0);
    setItems([emptyItem()]);
    setActiveItemIndex(0);
  };

  const addItem = () => {
    setItems((prev) => {
      const next = [...prev, emptyItem()];
      setActiveItemIndex(next.length - 1);
      return next;
    });
  };

  const duplicateItem = (index: number) => {
    setItems((prev) => {
      const clone = { ...prev[index] };
      const next = [...prev.slice(0, index + 1), clone, ...prev.slice(index + 1)];
      setActiveItemIndex(index + 1);
      return next;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      if (prev.length <= 1) {
        setActiveItemIndex(0);
        return [emptyItem()];
      }
      const next = prev.filter((_, itemIndex) => itemIndex !== index);
      setActiveItemIndex((current) => {
        if (index === current) return Math.max(0, current - 1);
        if (index < current) return current - 1;
        return Math.min(current, next.length - 1);
      });
      return next;
    });
  };

  const uploadPhoto = async (file: File) => {
    const formData = new FormData();
    formData.append("files", file);
    const endpoint = mode === "branch" ? "branch-portal/inventories/upload" : "client-portal/inventories/upload";
    const response = await fetch(buildApiUrl(endpoint), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) throw new Error("No se pudo subir la imagen");
    const data = await response.json().catch(() => ({}));
    const first = Array.isArray(data?.urls) ? data.urls[0] : null;
    if (!first) throw new Error("No se recibió URL de imagen");
    return first as string;
  };

  const updateItem = (index: number, changes: Partial<InventoryItemDraft>) => {
    setItems((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...changes } : item)));
  };

  const bindImageDrop = (index: number, key: keyof InventoryItemDraft) => ({
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    },
    onDrop: async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const file = event.dataTransfer.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      try {
        setLoading(true);
        const url = await uploadPhoto(file);
        updateItem(index, { [key]: url } as Partial<InventoryItemDraft>);
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Error al subir imagen");
      } finally {
        setLoading(false);
      }
    },
  });

  const handleImagePick = async (index: number, key: keyof InventoryItemDraft, file?: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      setLoading(true);
      const url = await uploadPhoto(file);
      updateItem(index, { [key]: url } as Partial<InventoryItemDraft>);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Error al subir imagen");
    } finally {
      setLoading(false);
    }
  };

  const triggerImageInput = (refKey: string) => {
    inputRefs.current[refKey]?.click();
  };

  const handleDropzoneKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, refKey: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      triggerImageInput(refKey);
    }
  };

  const handleItemCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, index: number) => {
    if (!isCompact || visibleItems.length === 0) return;

    const currentPosition = visibleItems.findIndex((entry) => entry.index === index);
    if (currentPosition < 0) return;

    if (event.key === 'Enter' || event.key === ' ') {
      if (activeItemIndex !== index) {
        event.preventDefault();
        setActiveItemIndex(index);
      }
      return;
    }

    let nextPosition = currentPosition;
    if (event.key === 'ArrowDown') nextPosition = Math.min(visibleItems.length - 1, currentPosition + 1);
    if (event.key === 'ArrowUp') nextPosition = Math.max(0, currentPosition - 1);
    if (event.key === 'Home') nextPosition = 0;
    if (event.key === 'End') nextPosition = visibleItems.length - 1;

    if (nextPosition === currentPosition) return;

    event.preventDefault();
    const targetIndex = visibleItems[nextPosition].index;
    focusItem(targetIndex);
  };

  const validateItems = () => {
    const invalidIndex = items.findIndex((item) => {
      const hasHeader = item.sectionName.trim() && item.groupName.trim() && item.equipmentName.trim();
      const hasBefore = item.serialBefore.trim() && item.modelBefore.trim() && item.beforePanoramicPhotoUrl.trim() && item.beforeCloseupPhotoUrl.trim();
      const hasAfter = item.serialAfter.trim() && item.modelAfter.trim() && item.afterPanoramicPhotoUrl.trim() && item.afterCloseupPhotoUrl.trim();
      const hasMaintenance = item.maintenanceStickerPhotoUrl.trim() && item.maintenanceComments.trim() && item.maintenanceActions.trim();
      return !(hasHeader && hasBefore && hasAfter && hasMaintenance);
    });
    return invalidIndex;
  };

  const saveInventory = async (completed: boolean) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    if (!activeBranchId) {
      setError("Selecciona una sucursal");
      setSaving(false);
      return;
    }

    const invalidIndex = validateItems();
    if (invalidIndex >= 0) {
      setError(`Completa todos los campos requeridos del equipo #${invalidIndex + 1}`);
      focusItem(invalidIndex);
      setSaving(false);
      return;
    }

    const deltaCount = items.length - previousCount;
    let confirmDifference = false;
    if (completed && deltaCount !== 0) {
      const proceed = window.confirm(
        `Detectamos ${Math.abs(deltaCount)} equipos ${deltaCount > 0 ? "de más" : "de menos"} vs inventario previo. ¿Deseas guardar?`,
      );
      if (!proceed) {
        setSaving(false);
        return;
      }
      confirmDifference = true;
    }

    const payload: any = {
      snapshotId: selectedInventoryId || undefined,
      title: title || undefined,
      notes: notes || undefined,
      completed,
      confirmDifference,
      items,
    };
    if (mode === "client") payload.branchId = activeBranchId;

    const endpoint = mode === "branch" ? "branch-portal/inventories/sync" : "client-portal/inventories/sync";
    const response = await fetch(buildApiUrl(endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      setError(failure?.message || "No se pudo guardar inventario");
      setSaving(false);
      return;
    }

    setSuccess(completed ? "Inventario y mantenimiento guardado como completado" : "Borrador de inventario guardado");
    await fetchInventories();
    setSaving(false);
  };

  const handleDecision = async (id: number, decision: "APPROVED" | "REJECTED") => {
    if (mode !== "client") return;
    const response = await fetch(buildApiUrl(`client-portal/inventories/${id}/decision`), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ decision }),
    });
    if (!response.ok) {
      setError("No se pudo actualizar estatus de inventario");
      return;
    }
    await fetchInventories();
  };

  const handleBranchStatus = async (id: number, status: 'PENDING' | 'COMPLETED') => {
    if (mode !== 'branch') return;
    const response = await fetch(buildApiUrl(`branch-portal/inventories/${id}/status`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      setError('No se pudo actualizar estatus de inventario');
      return;
    }
    await fetchInventories();
  };

  const handleReportDownload = async (id: number) => {
    const endpoint = mode === "branch" ? `branch-portal/inventories/${id}/report` : `client-portal/inventories/${id}/report`;
    const response = await fetch(buildApiUrl(endpoint), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setError("No se pudo descargar el reporte");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventario-${id}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card inventory-manager">
      <div className="panel-toolbar">
        <div className="panel-toolbar-title">
          <p className="inventory-heading">Inventarios y mantenimientos</p>
          <p className="panel-muted inventory-subtitle">
            {mode === "branch"
              ? "Captura inventario completo de la sucursal con comparativo antes/después."
              : "Filtra por sucursal y administra historial de inventarios y mantenimientos."}
          </p>
        </div>
        {mode === "client" && (
          <select className="input" value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)} aria-label="Filtrar por sucursal">
            <option value="">Todas las sucursales</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name} {branch.branchNumber ? `(${branch.branchNumber})` : ""}</option>
            ))}
          </select>
        )}
        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar por estatus">
          <option value="all">Todos los estatus</option>
          <option value="PENDING">Pendiente</option>
          <option value="COMPLETED">Realizado</option>
          <option value="APPROVED">Aprobado</option>
          <option value="REJECTED">Desaprobado</option>
        </select>
        <input
          className="input inventory-history-search"
          placeholder="Buscar en historial"
          aria-label="Buscar en historial de inventarios"
          value={historyQuery}
          onChange={(e) => setHistoryQuery(e.target.value)}
        />
      </div>

      <div className="stat-grid">
        <div className="stat-card"><strong>{inventoryStats.total}</strong><div className="panel-muted">Historial</div></div>
        <div className="stat-card"><strong>{inventoryStats.pending}</strong><div className="panel-muted">Pendiente</div></div>
        <div className="stat-card"><strong>{inventoryStats.completed}</strong><div className="panel-muted">Realizado</div></div>
        <div className="stat-card"><strong>{inventoryStats.approved}</strong><div className="panel-muted">Aprobado</div></div>
        <div className="stat-card"><strong>{inventoryStats.rejected}</strong><div className="panel-muted">Desaprobado</div></div>
        <div className="stat-card"><strong>{inventoryStats.delta}</strong><div className="panel-muted">Δ Total</div></div>
      </div>

      {error && <div role="alert" className="inventory-alert inventory-alert-error">{error}</div>}
      {success && <div role="status" className="inventory-alert inventory-alert-success">{success}</div>}

      <div className="list-stack">
        <div className="inventory-list-header">
          <strong>Historial ({filteredInventories.length})</strong>
          <button className="button-secondary" type="button" onClick={resetEditor}>Nuevo inventario</button>
        </div>
        {loading && <div className="inventory-muted">Cargando inventarios...</div>}
        {!loading && filteredInventories.length === 0 && <div className="inventory-muted">Sin inventarios registrados.</div>}
        {!loading && filteredInventories.map((inventory) => (
          <div key={inventory.id} className="record-card">
            <div className="inventory-record-top">
              <strong>INV-{inventory.id} · {inventory.branch?.name || "Sucursal"}</strong>
              <span className="badge">{getStatusLabel(inventory.status)}</span>
            </div>
            <div className="inventory-record-meta">
              {inventory.previousCount ?? 0} previos · {inventory.currentCount ?? 0} actuales · Δ {inventory.deltaCount ?? 0}
            </div>
            {!!inventory.updatedAt && (
              <div className="inventory-record-meta">
                Actualizado: {new Date(inventory.updatedAt).toLocaleString()}
              </div>
            )}
            <div className="chip-row">
              <button className="button-secondary" type="button" onClick={() => loadDetail(inventory.id)}>Ver / editar</button>
              <button className="button-secondary" type="button" onClick={() => handleReportDownload(inventory.id)}>PDF</button>
              {mode === 'branch' && (
                <>
                  <button className="button-secondary" type="button" onClick={() => handleBranchStatus(inventory.id, 'PENDING')}>Marcar pendiente</button>
                  <button className="button-primary" type="button" onClick={() => handleBranchStatus(inventory.id, 'COMPLETED')}>Marcar realizado</button>
                </>
              )}
              {mode === "client" && inventory.status === "COMPLETED" && (
                <>
                  <button className="button-primary" type="button" onClick={() => handleDecision(inventory.id, "APPROVED")}>Aprobar</button>
                  <button className="button-secondary" type="button" onClick={() => handleDecision(inventory.id, "REJECTED")}>Rechazar</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="inventory-editor">
        <strong>{selectedInventoryId ? `Editar inventario INV-${selectedInventoryId}` : "Nuevo inventario"}</strong>
        <div className={`inventory-editor-filters ${isCompact ? 'is-compact' : ''}`}>
          <input className="input" placeholder="Buscar equipo en formulario" aria-label="Buscar equipo en el formulario" value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} />
          <select className="input" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} aria-label="Filtrar equipos por grupo">
            <option value="ALL">Todos los grupos</option>
            {GROUP_OPTIONS.map((group) => (
              <option key={`group-filter-${group}`} value={group}>{group}</option>
            ))}
          </select>
          <div className="inventory-summary">
            Mostrando {visibleItems.length} de {items.length} equipo(s)
          </div>
        </div>
        <div className="chip-row">
          <button type="button" className={groupFilter === 'ALL' ? 'button-primary' : 'button-secondary'} onClick={() => setGroupFilter('ALL')}>
            Todos
          </button>
          {GROUP_OPTIONS.map((group) => (
            <button
              key={`group-chip-${group}`}
              type="button"
              className={groupFilter === group ? 'button-primary' : 'button-secondary'}
              onClick={() => setGroupFilter(group)}
            >
              {group}
            </button>
          ))}
        </div>
        <div className={`inventory-meta-grid ${isCompact ? 'is-compact' : ''}`}>
          <input className="input" placeholder="Título del inventario" aria-label="Título del inventario" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" placeholder="Notas generales" aria-label="Notas generales" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="inventory-progress">
          <div className="inventory-progress-header">
            <span>Avance de captura</span>
            <span>{completionCount}/{items.length} completos · {completionRate}%</span>
          </div>
          <progress className="inventory-progress-native" max={100} value={completionRate} aria-label="Avance de captura" />
          <div className="inventory-progress-actions">
            <button type="button" className="button-secondary" onClick={() => {
              const firstPending = visibleItems.find(({ item }) => !isItemComplete(item));
              if (firstPending) focusItem(firstPending.index);
            }}>
              Ir al primer pendiente ({pendingVisibleCount})
            </button>
            <button type="button" className="button-secondary" onClick={() => {
              const firstComplete = visibleItems.find(({ item }) => isItemComplete(item));
              if (firstComplete) focusItem(firstComplete.index);
            }}>
              Ir al primer completo
            </button>
          </div>
        </div>

        {visibleItems.length === 0 && (
          <div className="inventory-empty-note">No hay equipos que coincidan con la búsqueda.</div>
        )}

        {visibleItems.map(({ item, index }) => (
          <div
            key={`item-${index}`}
            ref={(element) => {
              itemCardRefs.current[index] = element;
            }}
            className="inventory-item-card"
            role="group"
            tabIndex={0}
            aria-label={`Equipo ${index + 1}. ${isItemComplete(item) ? 'Completo' : 'Pendiente'}. En móvil usa flechas arriba y abajo para navegar entre equipos.`}
            onKeyDown={(event) => handleItemCardKeyDown(event, index)}
          >
            <div className="inventory-item-head">
              <div className="inventory-item-title">
                <strong>Equipo #{index + 1}</strong>
                <span className="badge">{isItemComplete(item) ? 'Completo' : 'Pendiente'}</span>
              </div>
              <div className="inventory-item-actions">
                {isCompact && (
                  <button className="button-secondary" type="button" onClick={() => setActiveItemIndex(index)}>
                    {activeItemIndex === index ? 'Abierto' : 'Editar'}
                  </button>
                )}
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => duplicateItem(index)}
                >
                  Duplicar
                </button>
                <button className="button-secondary" type="button" onClick={() => removeItem(index)}>Eliminar</button>
              </div>
            </div>
            {isCompact && activeItemIndex !== index ? (
              <div className="inventory-compact-preview">
                {item.groupName || 'OTROS'} · {item.equipmentName || 'Sin nombre'}
              </div>
            ) : (
              <>
            <div className={`inventory-item-fields ${isCompact ? 'is-compact' : ''}`}>
              <input className="input" placeholder="Apartado" aria-label={`Equipo ${index + 1}: apartado`} value={item.sectionName} onChange={(e) => updateItem(index, { sectionName: e.target.value })} />
              <select className="input" value={item.groupName} onChange={(e) => updateItem(index, { groupName: e.target.value })} aria-label={`Equipo ${index + 1}: grupo`}>
                {GROUP_OPTIONS.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
              <input className="input" placeholder="Nombre equipo" aria-label={`Equipo ${index + 1}: nombre`} value={item.equipmentName} onChange={(e) => updateItem(index, { equipmentName: e.target.value })} />
              <input className="input" placeholder="Serie ANTES" aria-label={`Equipo ${index + 1}: serie antes`} value={item.serialBefore} onChange={(e) => updateItem(index, { serialBefore: e.target.value })} />
              <input className="input" placeholder="Modelo ANTES" aria-label={`Equipo ${index + 1}: modelo antes`} value={item.modelBefore} onChange={(e) => updateItem(index, { modelBefore: e.target.value })} />
              <input className="input" placeholder="Serie DESPUÉS" aria-label={`Equipo ${index + 1}: serie después`} value={item.serialAfter} onChange={(e) => updateItem(index, { serialAfter: e.target.value })} />
              <input className="input" placeholder="Modelo DESPUÉS" aria-label={`Equipo ${index + 1}: modelo después`} value={item.modelAfter} onChange={(e) => updateItem(index, { modelAfter: e.target.value })} />
              <input className="input" placeholder="Qué se le hizo al equipo" aria-label={`Equipo ${index + 1}: acciones de mantenimiento`} value={item.maintenanceActions} onChange={(e) => updateItem(index, { maintenanceActions: e.target.value })} />
              <input className="input" placeholder="Comentario técnico" aria-label={`Equipo ${index + 1}: comentario técnico`} value={item.maintenanceComments} onChange={(e) => updateItem(index, { maintenanceComments: e.target.value })} />
            </div>

            <div className={`inventory-photo-grid ${isCompact ? 'is-compact' : ''}`}>
              {[
                ["beforePanoramicPhotoUrl", "Foto panorámica ANTES"],
                ["beforeCloseupPhotoUrl", "Foto serie/modelo ANTES"],
                ["afterPanoramicPhotoUrl", "Foto panorámica DESPUÉS"],
                ["afterCloseupPhotoUrl", "Foto serie/modelo DESPUÉS"],
                ["maintenanceStickerPhotoUrl", "Foto sticker mantenimiento"],
              ].map(([key, label]) => {
                const photoKey = key as keyof InventoryItemDraft;
                const refKey = `${index}-${photoKey}`;
                const value = item[photoKey] as string;
                return (
                  <div
                    key={refKey}
                    {...bindImageDrop(index, photoKey)}
                    className="inventory-photo-dropzone"
                    role="button"
                    tabIndex={0}
                    aria-label={`${label}${value ? ' (imagen cargada)' : ''}. Presiona Enter o Espacio para seleccionar imagen.`}
                    onKeyDown={(event) => handleDropzoneKeyDown(event, refKey)}
                    onClick={() => triggerImageInput(refKey)}
                  >
                    <div className="inventory-photo-label">{label}</div>
                    <input
                      ref={(element) => {
                        inputRefs.current[refKey] = element;
                      }}
                      type="file"
                      accept="image/*"
                      className="inventory-file-input"
                      onChange={(event) => handleImagePick(index, photoKey, event.target.files?.[0])}
                    />
                    <button className="button-secondary" type="button" onClick={(event) => {
                      event.stopPropagation();
                      triggerImageInput(refKey);
                    }}>
                      Cargar imagen
                    </button>
                    {value ? (
                      <img src={getAssetUrl(value)} alt={label} className="inventory-photo-preview" />
                    ) : (
                      <div className="inventory-photo-placeholder">Arrastra o selecciona imagen</div>
                    )}
                  </div>
                );
              })}
            </div>
              </>
            )}
          </div>
        ))}

        <div className={isCompact ? 'sticky-mobile-actions' : 'chip-row'}>
          <button className="button-secondary" type="button" onClick={addItem}>+ Agregar equipo</button>
          <button className="button-secondary" type="button" onClick={() => saveInventory(false)} disabled={saving}>{saving ? "Guardando..." : "Guardar borrador"}</button>
          <button className="button-primary" type="button" onClick={() => saveInventory(true)} disabled={saving}>{saving ? "Guardando..." : "Guardar y completar"}</button>
          <div className={`inventory-footer-meta ${isCompact ? 'is-compact' : ''}`}>
            Completos: {completionCount}/{items.length}
          </div>
        </div>
      </div>
    </div>
  );
}
