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
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700 }}>Inventarios y mantenimientos</p>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
            {mode === "branch"
              ? "Captura inventario completo de la sucursal con comparativo antes/después."
              : "Filtra por sucursal y administra historial de inventarios y mantenimientos."}
          </p>
        </div>
        {mode === "client" && (
          <select className="input" value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)}>
            <option value="">Todas las sucursales</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name} {branch.branchNumber ? `(${branch.branchNumber})` : ""}</option>
            ))}
          </select>
        )}
        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Todos los estatus</option>
          <option value="PENDING">Pendiente</option>
          <option value="COMPLETED">Realizado</option>
          <option value="APPROVED">Aprobado</option>
          <option value="REJECTED">Desaprobado</option>
        </select>
        <input
          className="input"
          placeholder="Buscar en historial"
          value={historyQuery}
          onChange={(e) => setHistoryQuery(e.target.value)}
          style={{ minWidth: isCompact ? 0 : 180, width: isCompact ? '100%' : undefined }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
        <div className="card" style={{ padding: 10 }}><strong>{inventoryStats.total}</strong><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Historial</div></div>
        <div className="card" style={{ padding: 10 }}><strong>{inventoryStats.pending}</strong><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Pendiente</div></div>
        <div className="card" style={{ padding: 10 }}><strong>{inventoryStats.completed}</strong><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Realizado</div></div>
        <div className="card" style={{ padding: 10 }}><strong>{inventoryStats.approved}</strong><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Aprobado</div></div>
        <div className="card" style={{ padding: 10 }}><strong>{inventoryStats.rejected}</strong><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Desaprobado</div></div>
        <div className="card" style={{ padding: 10 }}><strong>{inventoryStats.delta}</strong><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Δ Total</div></div>
      </div>

      {error && <div style={{ padding: 10, borderRadius: 10, background: "rgba(220, 38, 38, 0.1)", color: "#b91c1c" }}>{error}</div>}
      {success && <div style={{ padding: 10, borderRadius: 10, background: "rgba(22, 163, 74, 0.1)", color: "#166534" }}>{success}</div>}

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <strong>Historial ({filteredInventories.length})</strong>
          <button className="button-secondary" type="button" onClick={resetEditor}>Nuevo inventario</button>
        </div>
        {loading && <div style={{ color: "var(--text-secondary)" }}>Cargando inventarios...</div>}
        {!loading && filteredInventories.length === 0 && <div style={{ color: "var(--text-secondary)" }}>Sin inventarios registrados.</div>}
        {!loading && filteredInventories.map((inventory) => (
          <div key={inventory.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong>INV-{inventory.id} · {inventory.branch?.name || "Sucursal"}</strong>
              <span className="badge">{getStatusLabel(inventory.status)}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {inventory.previousCount ?? 0} previos · {inventory.currentCount ?? 0} actuales · Δ {inventory.deltaCount ?? 0}
            </div>
            {!!inventory.updatedAt && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Actualizado: {new Date(inventory.updatedAt).toLocaleString()}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "grid", gap: 10 }}>
        <strong>{selectedInventoryId ? `Editar inventario INV-${selectedInventoryId}` : "Nuevo inventario"}</strong>
        <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
          <input className="input" placeholder="Buscar equipo en formulario" value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} />
          <select className="input" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="ALL">Todos los grupos</option>
            {GROUP_OPTIONS.map((group) => (
              <option key={`group-filter-${group}`} value={group}>{group}</option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
            Mostrando {visibleItems.length} de {items.length} equipo(s)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
        <div style={{ display: "grid", gridTemplateColumns: isCompact ? '1fr' : "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
          <input className="input" placeholder="Título del inventario" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" placeholder="Notas generales" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)' }}>
            <span>Avance de captura</span>
            <span>{completionCount}/{items.length} completos · {completionRate}%</span>
          </div>
          <div style={{ width: '100%', height: 8, borderRadius: 999, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ width: `${completionRate}%`, height: '100%', background: 'var(--text-primary)' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No hay equipos que coincidan con la búsqueda.</div>
        )}

        {visibleItems.map(({ item, index }) => (
          <div
            key={`item-${index}`}
            ref={(element) => {
              itemCardRefs.current[index] = element;
            }}
            style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, display: "grid", gap: 8 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong>Equipo #{index + 1}</strong>
                <span className="badge">{isItemComplete(item) ? 'Completo' : 'Pendiente'}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {item.groupName || 'OTROS'} · {item.equipmentName || 'Sin nombre'}
              </div>
            ) : (
              <>
            <div style={{ display: "grid", gridTemplateColumns: isCompact ? '1fr' : "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
              <input className="input" placeholder="Apartado" value={item.sectionName} onChange={(e) => updateItem(index, { sectionName: e.target.value })} />
              <select className="input" value={item.groupName} onChange={(e) => updateItem(index, { groupName: e.target.value })}>
                {GROUP_OPTIONS.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
              <input className="input" placeholder="Nombre equipo" value={item.equipmentName} onChange={(e) => updateItem(index, { equipmentName: e.target.value })} />
              <input className="input" placeholder="Serie ANTES" value={item.serialBefore} onChange={(e) => updateItem(index, { serialBefore: e.target.value })} />
              <input className="input" placeholder="Modelo ANTES" value={item.modelBefore} onChange={(e) => updateItem(index, { modelBefore: e.target.value })} />
              <input className="input" placeholder="Serie DESPUÉS" value={item.serialAfter} onChange={(e) => updateItem(index, { serialAfter: e.target.value })} />
              <input className="input" placeholder="Modelo DESPUÉS" value={item.modelAfter} onChange={(e) => updateItem(index, { modelAfter: e.target.value })} />
              <input className="input" placeholder="Qué se le hizo al equipo" value={item.maintenanceActions} onChange={(e) => updateItem(index, { maintenanceActions: e.target.value })} />
              <input className="input" placeholder="Comentario técnico" value={item.maintenanceComments} onChange={(e) => updateItem(index, { maintenanceComments: e.target.value })} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isCompact ? '1fr' : "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
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
                    style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: 8, display: "grid", gap: 6, cursor: "pointer" }}
                    onClick={() => inputRefs.current[refKey]?.click()}
                  >
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</div>
                    <input
                      ref={(element) => {
                        inputRefs.current[refKey] = element;
                      }}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(event) => handleImagePick(index, photoKey, event.target.files?.[0])}
                    />
                    <button className="button-secondary" type="button" onClick={(event) => {
                      event.stopPropagation();
                      inputRefs.current[refKey]?.click();
                    }}>
                      Cargar imagen
                    </button>
                    {value ? (
                      <img src={getAssetUrl(value)} alt={label} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 8 }} />
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Arrastra o selecciona imagen</div>
                    )}
                  </div>
                );
              })}
            </div>
              </>
            )}
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", position: isCompact ? 'sticky' : 'static', bottom: isCompact ? 10 : undefined, background: isCompact ? 'var(--background)' : 'transparent', padding: isCompact ? 8 : 0, borderRadius: isCompact ? 10 : 0, border: isCompact ? '1px solid var(--border)' : 'none', zIndex: isCompact ? 10 : 1 }}>
          <button className="button-secondary" type="button" onClick={addItem}>+ Agregar equipo</button>
          <button className="button-secondary" type="button" onClick={() => saveInventory(false)} disabled={saving}>{saving ? "Guardando..." : "Guardar borrador"}</button>
          <button className="button-primary" type="button" onClick={() => saveInventory(true)} disabled={saving}>{saving ? "Guardando..." : "Guardar y completar"}</button>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)', width: isCompact ? '100%' : 'auto' }}>
            Completos: {completionCount}/{items.length}
          </div>
        </div>
      </div>
    </div>
  );
}
