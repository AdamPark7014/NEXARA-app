"use client";
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { io, Socket } from 'socket.io-client';
import { buildApiUrl, getApiAssetOrigin, getSocketBaseUrl } from "@/lib/api-base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";

type BranchOption = { id: number; name: string; branchNumber?: string | null };

type InventoryItemDraft = {
  sectionName: string;
  groupName: string;
  customGroupName?: string;
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
  createdByType?: 'CLIENT' | 'BRANCH' | 'CONSOLE' | null;
  activityId?: number | null;
  title?: string | null;
  notes?: string | null;
  previousCount?: number | null;
  currentCount?: number | null;
  deltaCount?: number | null;
  updatedAt?: string | null;
  branch?: { id: number; name?: string | null; branchNumber?: string | null } | null;
  activity?: { id: number; anNumber?: string | null; titulo?: string | null; workType?: string | null; estatus?: string | null } | null;
  request?: { id: number; requestType?: string | null; status?: string | null } | null;
  items?: any[];
};

type Props = {
  token: string;
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
  customGroupName: "",
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

export default function TicketsInventoryManager({ token, mode, fixedBranch, branches = [] }: Props) {
  const [loading, setLoading] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inventories, setInventories] = useState<InventorySnapshot[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(fixedBranch ? String(fixedBranch.id) : "");
  const [selectedInventoryId, setSelectedInventoryId] = useState<number | null>(null);
  const [detailInventory, setDetailInventory] = useState<InventorySnapshot | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [originFilter, setOriginFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [branchQuery, setBranchQuery] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const [newCustomDeviceType, setNewCustomDeviceType] = useState('');
  const [isCompact, setIsCompact] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [previousCount, setPreviousCount] = useState(0);
  const [items, setItems] = useState<InventoryItemDraft[]>([]);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const itemCardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const editorRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const getAssetUrl = (url?: string | null) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const base = getApiAssetOrigin().replace(/\/+$/, "");
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  const activeBranchId = mode === "branch" ? fixedBranch?.id : selectedBranchId ? Number(selectedBranchId) : undefined;

  const normalizeText = (value?: string | null) => String(value || '').toLowerCase().trim();
  const smartTokenMatch = (needle: string, chunks: Array<string | number | null | undefined>) => {
    const tokens = normalizeText(needle).split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    const haystack = chunks.map((entry) => normalizeText(String(entry || ''))).filter(Boolean).join(' ');
    return tokens.every((token) => haystack.includes(token));
  };

  const toSource = (inventory: InventorySnapshot) => {
    const origin = String(inventory.createdByType || '').toUpperCase();
    if (origin === 'CLIENT' || origin === 'BRANCH') return 'OWN';
    return 'PROVIDER';
  };

  const filteredInventories = useMemo(() => {
    const byBranch = mode === 'branch'
      ? inventories
      : !activeBranchId
        ? inventories
        : inventories.filter((inventory) => Number(inventory.branch?.id || 0) === activeBranchId);

    const byBranchSmart = branchQuery.trim()
      ? byBranch.filter((inventory) =>
          smartTokenMatch(branchQuery, [
            inventory.branch?.name,
            inventory.branch?.branchNumber,
            inventory.title,
          ]),
        )
      : byBranch;

    const byStatus = statusFilter === 'all'
      ? byBranchSmart
      : byBranchSmart.filter((inventory) => String(inventory.status || '').toUpperCase() === statusFilter);

    const byOrigin = originFilter === 'all'
      ? byStatus
      : byStatus.filter((inventory) => toSource(inventory) === originFilter);

    const start = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const end = toDate ? new Date(`${toDate}T23:59:59.999`) : null;
    const byDate = byOrigin.filter((inventory) => {
      if (!start && !end) return true;
      const raw = inventory.updatedAt;
      if (!raw) return false;
      const stamp = new Date(raw);
      if (Number.isNaN(stamp.getTime())) return false;
      if (start && stamp < start) return false;
      if (end && stamp > end) return false;
      return true;
    });

    if (!historyQuery.trim()) return byDate;
    return byDate.filter((inventory) =>
      smartTokenMatch(historyQuery, [
        inventory.id,
        inventory.title,
        inventory.status,
        inventory.branch?.name,
        inventory.branch?.branchNumber,
        inventory.createdByType,
        inventory.previousCount,
        inventory.currentCount,
        inventory.deltaCount,
      ]),
    );
  }, [inventories, mode, activeBranchId, statusFilter, originFilter, fromDate, toDate, branchQuery, historyQuery]);

  const dynamicGroupOptions = useMemo(() => {
    const set = new Set<string>(GROUP_OPTIONS);
    inventories.forEach((inventory) => {
      (inventory.items || []).forEach((item: any) => {
        const group = String(item?.groupName || '').trim().toUpperCase();
        if (group) set.add(group);
      });
    });
    items.forEach((item) => {
      const custom = String(item.customGroupName || '').trim().toUpperCase();
      if (custom) set.add(custom);
    });
    return Array.from(set);
  }, [inventories, items]);

  const providerBaselineByBranch = useMemo(() => {
    const map = new Map<number, InventorySnapshot>();
    const providers = inventories
      .filter((inventory) => toSource(inventory) === 'PROVIDER')
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt || 0).getTime();
        const bTime = new Date(b.updatedAt || 0).getTime();
        return bTime - aTime;
      });

    providers.forEach((inventory) => {
      const branchId = Number(inventory.branch?.id || 0);
      if (!branchId || map.has(branchId)) return;
      map.set(branchId, inventory);
    });
    return map;
  }, [inventories]);

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

  const getOriginLabel = (inventory: InventorySnapshot) => {
    const source = toSource(inventory);
    if (source === 'OWN') return 'Inventario interno';
    return 'Inventario proveedor';
  };

  const getFlowLabel = (value?: string | null) => {
    if (String(value || '').toUpperCase() === 'PREVENTIVE_INVENTORY') return 'Mantenimiento e inventario';
    return 'Ticket por problema';
  };

  const isItemComplete = (item: InventoryItemDraft) => {
    const resolvedGroup = item.groupName === 'OTROS'
      ? (item.customGroupName || '').trim()
      : item.groupName.trim();
    const hasHeader = item.sectionName.trim() && resolvedGroup && item.equipmentName.trim();
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

  const fetchInventories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (mode === 'client' && activeBranchId) params.set('branchId', String(activeBranchId));
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (originFilter === 'OWN') params.set('origin', mode === 'branch' ? 'BRANCH' : 'CLIENT');
      if (originFilter === 'PROVIDER') params.set('origin', 'CONSOLE');
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (branchQuery.trim()) params.set('search', branchQuery.trim());
      const query = params.toString();
      const endpoint = mode === "branch"
        ? `branch-portal/inventories${query ? `?${query}` : ''}`
        : `client-portal/inventories${query ? `?${query}` : ''}`;
      const response = await fetch(buildApiUrl(endpoint), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.ok ? await response.json() : [];
      setInventories(Array.isArray(data) ? data : []);
    } catch {
      setInventories([]);
    } finally {
      setLoading(false);
    }
  }, [mode, activeBranchId, token, statusFilter, originFilter, fromDate, toDate, branchQuery]);

  useEffect(() => {
    fetchInventories();
  }, [fetchInventories]);

  useEffect(() => {
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        fetchInventories();
      }, 300);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['Inventory', 'InventarioTickets', 'TicketInventory'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [fetchInventories]);

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
      groupName: GROUP_OPTIONS.includes(String(item.groupName || '').toUpperCase())
        ? String(item.groupName || '').toUpperCase()
        : 'OTROS',
      customGroupName: GROUP_OPTIONS.includes(String(item.groupName || '').toUpperCase())
        ? ''
        : (item.groupName || ""),
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

  const openInventoryDetail = async (inventoryId: number) => {
    setDetailLoadingId(inventoryId);
    setError(null);
    const endpoint = mode === "branch" ? `branch-portal/inventories/${inventoryId}` : `client-portal/inventories/${inventoryId}`;
    try {
      const response = await fetch(buildApiUrl(endpoint), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setError("No se pudo cargar el detalle del inventario");
        return;
      }
      const detail = await response.json();
      setDetailInventory(detail);
    } finally {
      setDetailLoadingId(null);
    }
  };

  const resetEditor = () => {
    setSelectedInventoryId(null);
    setTitle("");
    setNotes("");
    setPreviousCount(0);
    setNewCustomDeviceType('');
    setGroupFilter('ALL');
    setItems([emptyItem()]);
    setActiveItemIndex(0);
  };

  const handleCreateNewInventory = () => {
    resetEditor();
    window.setTimeout(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      titleInputRef.current?.focus();
    }, 40);
  };

  const addItem = () => {
    setItems((prev) => {
      const baseItem = emptyItem();
      const normalizedCustomType = newCustomDeviceType.trim();
      const preparedItem = groupFilter === 'OTROS'
        ? { ...baseItem, groupName: 'OTROS', customGroupName: normalizedCustomType }
        : groupFilter !== 'ALL'
          ? { ...baseItem, groupName: groupFilter, customGroupName: '' }
          : baseItem;

      const next = [...prev, preparedItem];
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
      const resolvedGroup = item.groupName === 'OTROS'
        ? (item.customGroupName || '').trim()
        : item.groupName.trim();
      const hasHeader = item.sectionName.trim() && resolvedGroup && item.equipmentName.trim();
      const hasBefore = item.serialBefore.trim() && item.modelBefore.trim() && item.beforePanoramicPhotoUrl.trim() && item.beforeCloseupPhotoUrl.trim();
      const hasAfter = item.serialAfter.trim() && item.modelAfter.trim() && item.afterPanoramicPhotoUrl.trim() && item.afterCloseupPhotoUrl.trim();
      const hasMaintenance = item.maintenanceStickerPhotoUrl.trim() && item.maintenanceComments.trim() && item.maintenanceActions.trim();
      return !(hasHeader && hasBefore && hasAfter && hasMaintenance);
    });
    return invalidIndex;
  };

  const saveInventory = async (completed: boolean, forceInventoryConfirmed = false) => {
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
    if (completed && deltaCount !== 0 && !forceInventoryConfirmed) {
      setSaving(false);
      setConfirmState({
        message: `Detectamos ${Math.abs(deltaCount)} equipos ${deltaCount > 0 ? "de más" : "de menos"} vs inventario previo. ¿Deseas guardar?`,
        fn: async () => { await saveInventory(completed, true); },
      });
      return;
    }
    const confirmDifference = completed && deltaCount !== 0;

    const payload: any = {
      snapshotId: selectedInventoryId || undefined,
      title: title || undefined,
      notes: notes || undefined,
      completed,
      confirmDifference,
      items: items.map((item) => ({
        ...item,
        groupName: item.groupName === 'OTROS'
          ? ((item.customGroupName || '').trim().toUpperCase() || 'OTROS')
          : item.groupName,
      })),
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
    <>
    <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    <div className="card inventory-manager">
      <div className="panel-toolbar">
        <div className="panel-toolbar-title">
          <p className="inventory-heading">Inventarios y mantenimientos</p>
          <p className="panel-muted inventory-subtitle">
            {mode === "branch"
              ? "Administra el inventario de tu sucursal y compáralo con los inventarios del proveedor por fecha."
              : "Consulta el panorama general de todas tus sucursales y filtra por sucursal, fecha y tipo de inventario."}
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
        <select className="input" value={originFilter} onChange={(e) => setOriginFilter(e.target.value)} aria-label="Filtrar por tipo de inventario">
          <option value="all">Todos los inventarios</option>
          <option value="OWN">Inventario interno</option>
          <option value="PROVIDER">Inventario proveedor</option>
        </select>
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
        <input
          className="input inventory-history-search"
          placeholder="Sucursal"
          aria-label="Buscar sucursal"
          value={branchQuery}
          onChange={(e) => setBranchQuery(e.target.value)}
        />
        <input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="Desde" />
        <input className="input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="Hasta" />
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
          <button className="button-secondary" type="button" onClick={handleCreateNewInventory}>Nuevo inventario</button>
        </div>
        {loading && <div className="inventory-muted">Cargando inventarios...</div>}
        {!loading && filteredInventories.length === 0 && <div className="inventory-muted">Sin inventarios registrados.</div>}
        {!loading && filteredInventories.map((inventory) => (
          <div key={inventory.id} className="record-card">
            <div className="inventory-record-top">
              <strong>INV-{inventory.id} · {inventory.branch?.name || "Sucursal"}</strong>
              <span className="badge">{getStatusLabel(inventory.status)}</span>
            </div>
            <div className="inventory-record-meta">Origen: {getOriginLabel(inventory)}</div>
            {inventory.activity && (
              <div className="inventory-record-meta">
                Actividad: {inventory.activity.anNumber || `ACT-${inventory.activity.id}`} · {inventory.activity.titulo || '-'} · {getFlowLabel(inventory.activity.workType)}
              </div>
            )}
            {inventory.request && (
              <div className="inventory-record-meta">
                Solicitud: #{inventory.request.id} · {getFlowLabel(inventory.request.requestType)} · {inventory.request.status || '-'}
              </div>
            )}
            <div className="inventory-record-meta">
              {inventory.previousCount ?? 0} previos · {inventory.currentCount ?? 0} actuales · Δ {inventory.deltaCount ?? 0}
            </div>
            {toSource(inventory) === 'OWN' && (() => {
              const branchId = Number(inventory.branch?.id || 0);
              const providerBaseline = branchId ? providerBaselineByBranch.get(branchId) : null;
              if (!providerBaseline) return null;
              const contrast = Number(inventory.currentCount || 0) - Number(providerBaseline.currentCount || 0);
              const label = contrast === 0 ? 'igual' : contrast > 0 ? `+${contrast} más` : `${contrast} menos`;
              const arrow = " → ";
              return (
                <div className="inventory-record-meta">
                  Contraste vs proveedor: {providerBaseline.currentCount ?? 0}{arrow}{inventory.currentCount ?? 0} ({label})
                </div>
              );
            })()}
            {!!inventory.updatedAt && (
              <div className="inventory-record-meta">
                Actualizado: {new Date(inventory.updatedAt).toLocaleString()}
              </div>
            )}
            <div className="chip-row">
              <button className="button-secondary" type="button" onClick={() => openInventoryDetail(inventory.id)}>
                {detailLoadingId === inventory.id ? 'Cargando...' : 'Detalle'}
              </button>
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

      {detailInventory && (
        <div
          style={{
            display: 'grid',
            gap: 12,
            padding: 16,
            borderRadius: 16,
            border: '1px solid var(--border)',
            background: 'var(--card-bg)',
          }}
        >
          <div className="inventory-record-top">
            <strong>{detailInventory.title || `Inventario INV-${detailInventory.id}`}</strong>
            <div className="chip-row">
              <span className="badge">{getStatusLabel(detailInventory.status)}</span>
              <button className="button-secondary" type="button" onClick={() => setDetailInventory(null)}>Cerrar</button>
            </div>
          </div>
          <div className="inventory-record-meta">Sucursal: {detailInventory.branch?.name || '-'} {detailInventory.branch?.branchNumber ? `(${detailInventory.branch.branchNumber})` : ''}</div>
          <div className="inventory-record-meta">Origen: {getOriginLabel(detailInventory)}</div>
          {detailInventory.activity && (
            <div className="inventory-record-meta">Actividad ligada: {detailInventory.activity.anNumber || `ACT-${detailInventory.activity.id}`} · {detailInventory.activity.titulo || '-'} · {getFlowLabel(detailInventory.activity.workType)}</div>
          )}
          {detailInventory.request && (
            <div className="inventory-record-meta">Solicitud ligada: #{detailInventory.request.id} · {getFlowLabel(detailInventory.request.requestType)} · {detailInventory.request.status || '-'}</div>
          )}
          <div className="inventory-record-meta">Conteo: {detailInventory.previousCount ?? 0} previos · {detailInventory.currentCount ?? 0} actuales · Δ {detailInventory.deltaCount ?? 0}</div>
          {detailInventory.notes && <div className="inventory-record-meta">Notas: {detailInventory.notes}</div>}
          {!!detailInventory.updatedAt && <div className="inventory-record-meta">Actualizado: {new Date(detailInventory.updatedAt).toLocaleString()}</div>}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {(detailInventory.items || []).map((item: any, index) => (
              <div
                key={`${detailInventory.id}-detail-item-${item.id || index}`}
                style={{
                  display: 'grid',
                  gap: 8,
                  padding: 12,
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-light)',
                }}
              >
                <strong>{item.equipmentName || `Equipo ${index + 1}`}</strong>
                <div className="inventory-record-meta">Apartado: {item.sectionName || '-'} · Grupo: {item.groupName || '-'}</div>
                <div className="inventory-record-meta">Antes: {item.serialBefore || '-'} · {item.modelBefore || '-'}</div>
                <div className="inventory-record-meta">Después: {item.serialAfter || '-'} · {item.modelAfter || '-'}</div>
                <div className="inventory-record-meta">Acciones: {item.maintenanceActions || '-'}</div>
                <div className="inventory-record-meta">Comentarios: {item.maintenanceComments || item.notes || '-'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  {[item.beforePanoramicPhotoUrl, item.beforeCloseupPhotoUrl, item.afterPanoramicPhotoUrl, item.afterCloseupPhotoUrl, item.maintenanceStickerPhotoUrl]
                    .filter(Boolean)
                    .map((url: string, photoIndex: number) => (
                      <img
                        key={`${detailInventory.id}-photo-${item.id || index}-${photoIndex}`}
                        src={getAssetUrl(url)}
                        alt={`Detalle inventario ${index + 1}`}
                        style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="inventory-editor" ref={editorRef}>
        <strong>{selectedInventoryId ? `Editar inventario INV-${selectedInventoryId}` : "Nuevo inventario"}</strong>
        <div className={`inventory-editor-filters ${isCompact ? 'is-compact' : ''}`}>
          <input className="input" placeholder="Buscar equipo en formulario" aria-label="Buscar equipo en el formulario" value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} />
          <select className="input" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} aria-label="Filtrar equipos por grupo">
            <option value="ALL">Todos los grupos</option>
            {dynamicGroupOptions.map((group) => (
              <option key={`group-filter-${group}`} value={group}>{group}</option>
            ))}
          </select>
          {groupFilter === 'OTROS' && (
            <input
              className="input"
              placeholder="Nuevo tipo de dispositivo (OTROS)"
              aria-label="Nuevo tipo de dispositivo"
              value={newCustomDeviceType}
              onChange={(e) => setNewCustomDeviceType(e.target.value)}
            />
          )}
          <div className="inventory-summary">
            Mostrando {visibleItems.length} de {items.length} equipo(s)
          </div>
        </div>
        <div className="chip-row">
          <button type="button" className={groupFilter === 'ALL' ? 'button-primary' : 'button-secondary'} onClick={() => setGroupFilter('ALL')}>
            Todos
          </button>
          {dynamicGroupOptions.map((group) => (
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
          <input
            ref={titleInputRef}
            className="input"
            placeholder="Título del inventario"
            aria-label="Título del inventario"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
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
                {dynamicGroupOptions.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
              {item.groupName === 'OTROS' && (
                <input
                  className="input"
                  placeholder="OTROS: especifique tipo de equipo"
                  aria-label={`Equipo ${index + 1}: especifique tipo de equipo`}
                  value={item.customGroupName || ''}
                  onChange={(e) => updateItem(index, { customGroupName: e.target.value })}
                />
              )}
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

      <style jsx>{`
        .inventory-manager {
          display: grid;
          gap: 1rem;
          border: 1px solid var(--stroke-clean, #e3ecf5);
          background: var(--surface, #ffffff);
          border-radius: 16px;
          box-shadow: var(--elev-md, 0 10px 24px rgba(15, 23, 42, 0.08));
          padding: 1rem;
        }

        .panel-toolbar {
          display: grid;
          grid-template-columns: minmax(280px, 1.6fr) repeat(2, minmax(180px, 1fr));
          gap: 0.75rem;
          align-items: end;
        }

        .panel-toolbar-title {
          display: grid;
          gap: 0.35rem;
        }

        .inventory-heading {
          margin: 0;
          font-size: 1.08rem;
          font-weight: 700;
          color: var(--text, #0f172a);
        }

        .inventory-subtitle {
          margin: 0;
          font-size: 0.9rem;
        }

        .panel-muted,
        .inventory-muted,
        .inventory-summary,
        .inventory-record-meta,
        .inventory-footer-meta {
          color: var(--muted-foreground, #64748b);
          font-size: 0.86rem;
        }

        .inventory-history-search {
          min-width: 180px;
        }

        .stat-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 0.65rem;
        }

        .stat-card {
          border: 1px solid var(--stroke-clean, #e3ecf5);
          border-radius: 12px;
          background: var(--surface-2, #f8fafc);
          padding: 0.7rem;
          display: grid;
          gap: 0.15rem;
        }

        .stat-card strong {
          color: var(--text, #0f172a);
          font-size: 1rem;
          line-height: 1.1;
        }

        .inventory-alert {
          border-radius: 10px;
          padding: 0.7rem 0.85rem;
          font-size: 0.9rem;
          border: 1px solid transparent;
        }

        .inventory-alert-error {
          background: color-mix(in srgb, var(--state-error, #ef4444) 10%, white);
          color: color-mix(in srgb, var(--state-error, #ef4444) 78%, #111827);
          border-color: color-mix(in srgb, var(--state-error, #ef4444) 30%, white);
        }

        .inventory-alert-success {
          background: color-mix(in srgb, var(--state-success, #10b981) 10%, white);
          color: color-mix(in srgb, var(--state-success, #10b981) 78%, #0f172a);
          border-color: color-mix(in srgb, var(--state-success, #10b981) 28%, white);
        }

        .list-stack,
        .inventory-editor {
          border: 1px solid var(--stroke-clean, #e3ecf5);
          border-radius: 14px;
          background: var(--surface-2, #f8fafc);
          padding: 0.9rem;
          display: grid;
          gap: 0.75rem;
        }

        .inventory-list-header,
        .inventory-record-top,
        .inventory-item-head,
        .inventory-progress-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.65rem;
          flex-wrap: wrap;
        }

        .record-card,
        .inventory-item-card {
          border: 1px solid var(--stroke-clean, #dbe7f3);
          border-radius: 12px;
          background: var(--surface, #ffffff);
          padding: 0.8rem;
          display: grid;
          gap: 0.6rem;
          box-shadow: var(--elev-sm, 0 4px 10px rgba(15, 23, 42, 0.06));
        }

        .inventory-item-card:focus-visible,
        .inventory-photo-dropzone:focus-visible {
          outline: 2px solid var(--primary, #2563eb);
          outline-offset: 1px;
        }

        .chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid var(--stroke-clean, #d6e1ee);
          background: var(--surface-2, #eef3f8);
          color: var(--text, #334155);
          font-size: 0.76rem;
          font-weight: 700;
          padding: 0.2rem 0.55rem;
          letter-spacing: 0.01em;
        }

        .inventory-editor-filters,
        .inventory-meta-grid,
        .inventory-item-fields,
        .inventory-progress-actions {
          display: grid;
          gap: 0.65rem;
        }

        .inventory-editor-filters {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .inventory-meta-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .inventory-item-fields {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .inventory-item-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }

        .inventory-compact-preview {
          color: var(--muted-foreground, #64748b);
          font-size: 0.9rem;
        }

        .inventory-photo-grid {
          display: grid;
          gap: 0.65rem;
          grid-template-columns: repeat(5, minmax(0, 1fr));
        }

        .inventory-photo-dropzone {
          border: 1px dashed color-mix(in srgb, var(--primary, #2563eb) 26%, #cbd5e1);
          border-radius: 12px;
          background: color-mix(in srgb, var(--primary, #2563eb) 4%, white);
          min-height: 190px;
          padding: 0.65rem;
          display: grid;
          gap: 0.5rem;
          align-content: start;
          cursor: pointer;
          transition: border-color 0.18s ease, transform 0.18s ease;
        }

        .inventory-photo-dropzone:hover {
          border-color: var(--primary, #2563eb);
          transform: translateY(-1px);
        }

        .inventory-photo-label {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text, #334155);
        }

        .inventory-file-input {
          display: none;
        }

        .inventory-photo-preview {
          width: 100%;
          max-height: 128px;
          object-fit: cover;
          border-radius: 8px;
          border: 1px solid var(--stroke-clean, #dbe7f3);
        }

        .inventory-photo-placeholder {
          border-radius: 8px;
          border: 1px dashed var(--stroke-clean, #dbe7f3);
          background: var(--surface-2, #f8fafc);
          color: var(--muted-foreground, #64748b);
          font-size: 0.8rem;
          min-height: 82px;
          display: grid;
          place-items: center;
          text-align: center;
          padding: 0.4rem;
        }

        .inventory-progress {
          border: 1px solid var(--stroke-clean, #dbe7f3);
          border-radius: 12px;
          background: var(--surface, #ffffff);
          padding: 0.75rem;
          display: grid;
          gap: 0.55rem;
        }

        .inventory-progress-native {
          width: 100%;
          height: 10px;
        }

        .inventory-empty-note {
          border: 1px dashed var(--stroke-clean, #dbe7f3);
          border-radius: 10px;
          padding: 0.8rem;
          color: var(--muted-foreground, #64748b);
          background: var(--surface, #ffffff);
          text-align: center;
        }

        .sticky-mobile-actions {
          position: sticky;
          bottom: 0.6rem;
          z-index: 3;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.5rem;
          border: 1px solid var(--stroke-clean, #dbe7f3);
          border-radius: 12px;
          background: color-mix(in srgb, var(--surface, #ffffff) 90%, #f1f5f9);
          padding: 0.6rem;
          box-shadow: var(--elev-sm, 0 6px 14px rgba(15, 23, 42, 0.08));
        }

        .inventory-footer-meta.is-compact {
          grid-column: span 2;
        }

        :global(body.dark) .inventory-heading,
        :global(body.dark) .inventory-list-header strong,
        :global(body.dark) .inventory-editor > strong,
        :global(body.dark) .inventory-item-title strong,
        :global(body.dark) .inventory-progress-header,
        :global(body.dark) .inventory-photo-label,
        :global(body.dark) .stat-card strong {
          color: #e7f0ff;
        }

        :global(body.dark) .panel-muted,
        :global(body.dark) .inventory-muted,
        :global(body.dark) .inventory-summary,
        :global(body.dark) .inventory-record-meta,
        :global(body.dark) .inventory-footer-meta,
        :global(body.dark) .inventory-empty-note,
        :global(body.dark) .inventory-photo-placeholder,
        :global(body.dark) .inventory-compact-preview {
          color: #a9bfdc;
        }

        :global(body.dark) .record-card,
        :global(body.dark) .inventory-item-card,
        :global(body.dark) .inventory-progress,
        :global(body.dark) .inventory-empty-note,
        :global(body.dark) .inventory-photo-placeholder,
        :global(body.dark) .stat-card {
          border-color: #2a4669;
        }

        :global(body.dark) .inventory-photo-placeholder,
        :global(body.dark) .inventory-empty-note,
        :global(body.dark) .stat-card,
        :global(body.dark) .inventory-progress,
        :global(body.dark) .record-card,
        :global(body.dark) .inventory-item-card,
        :global(body.dark) .list-stack,
        :global(body.dark) .inventory-editor,
        :global(body.dark) .inventory-manager {
          background: color-mix(in srgb, #0b1a2d 86%, #0f172a);
        }

        @media (max-width: 1180px) {
          .panel-toolbar {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .panel-toolbar-title {
            grid-column: span 2;
          }

          .stat-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .inventory-item-fields {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .inventory-photo-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 900px) {
          .inventory-manager {
            padding: 0.75rem;
          }

          .panel-toolbar,
          .inventory-editor-filters,
          .inventory-meta-grid,
          .inventory-item-fields,
          .inventory-progress-actions {
            grid-template-columns: 1fr;
          }

          .stat-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .inventory-photo-grid,
          .inventory-photo-grid.is-compact {
            grid-template-columns: 1fr;
          }

          .inventory-item-actions {
            width: 100%;
          }

          .inventory-item-actions :global(button) {
            flex: 1;
          }
        }

        @media (max-width: 560px) {
          .stat-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
    </>
  );
}