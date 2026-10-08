"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import AddOutlined from '@mui/icons-material/AddOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import AutorenewOutlined from '@mui/icons-material/AutorenewOutlined';
import HandymanOutlined from '@mui/icons-material/HandymanOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import BuildOutlined from '@mui/icons-material/BuildOutlined';
import AutoFixHighOutlined from '@mui/icons-material/AutoFixHighOutlined';
import { useUser } from './UserContext';
import {
  Alert,
  Button,
  Card,
  CardHead,
  Checkbox,
  DataTable,
  EmptyState,
  Field,
  FieldGrid,
  FilterChip,
  FilterChips,
  FormSection,
  Input,
  ListFooter,
  ModuleToolbar,
  PersonCell,
  SearchInput,
  Select,
  SkeletonRows,
  Stat,
  StatRow,
  StatusBadge,
  type Column,
} from '@/components/base';
import { FotoAlmacen, claseMono, estadoHerramienta } from '@/components/almacen/PiezasAlmacen';
import styles from './ToolInventoryPanel.module.css';
import { createRealtimeSocket } from '@/lib/realtime-socket';
import EtiquetasHerramientaDialog from '@/components/almacen/EtiquetasHerramientaDialog';
import { completarCodigosHerramientas } from '@/lib/almacen-api';
import { formatApiError } from '@/lib/erp-api';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import { toast } from '@/components/Toast';

interface InventoryItem {
  id: number;
  toolName: string;
  model: string;
  serialNumber: string;
  codigoInterno?: string | null;
  barcode?: string | null;
  panoramicPhotoUrl: string;
  serialPhotoUrl: string;
  status: 'AVAILABLE' | 'ASSIGNED' | 'IN_REPAIR' | 'RETIRED';
  replacements?: { id: number; serialNumber: string; status: string; createdAt: string }[];
}

const STATUS_LABEL: Record<InventoryItem["status"], string> = {
  AVAILABLE: "Disponible",
  ASSIGNED: "Asignada",
  IN_REPAIR: "En reparación",
  RETIRED: "Retirada",
};

/** Quién tiene una herramienta fuera del almacén (de los kits y préstamos activos). */
type Poseedor = { nombre: string; tipo: 'kit' | 'prestamo' };

type FiltroEstado = 'todas' | InventoryItem['status'];

type ToolInventoryPanelProps = {
  /** Búsqueda con que abre (la búsqueda rápida manda aquí el nombre de la herramienta). */
  busquedaInicial?: string;
  /** Abre ya desplegado el alta («Nueva herramienta» desde el alta de artículo). */
  abrirAlta?: boolean;
};

const ToolInventoryPanel: React.FC<ToolInventoryPanelProps> = ({ busquedaInicial = '', abrirAlta = false }) => {
  const { user } = useUser();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [query, setQuery] = useState(busquedaInicial);
  const [includeRetired, setIncludeRetired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [toolName, setToolName] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [panoramicPhotoUrl, setPanoramicPhotoUrl] = useState('');
  const [serialPhotoUrl, setSerialPhotoUrl] = useState('');
  const [panoramicPhotoFile, setPanoramicPhotoFile] = useState<File | null>(null);
  const [serialPhotoFile, setSerialPhotoFile] = useState<File | null>(null);
  const [panoramicPhotoPreview, setPanoramicPhotoPreview] = useState<string | null>(null);
  const [serialPhotoPreview, setSerialPhotoPreview] = useState<string | null>(null);
  const [dragOverCreate, setDragOverCreate] = useState<'panoramic' | 'serial' | null>(null);
  const [dragOverReplace, setDragOverReplace] = useState<'panoramic' | 'serial' | null>(null);
  const createPanoramicInputRef = useRef<HTMLInputElement>(null);
  const createSerialInputRef = useRef<HTMLInputElement>(null);
  const replacePanoramicInputRef = useRef<HTMLInputElement>(null);
  const replaceSerialInputRef = useRef<HTMLInputElement>(null);

  const [replacementTarget, setReplacementTarget] = useState<InventoryItem | null>(null);
  const [replacementModel, setReplacementModel] = useState('');
  const [replacementSerialNumber, setReplacementSerialNumber] = useState('');
  const [replacementRetiredReason, setReplacementRetiredReason] = useState('Equipo dañado o no funcional');
  const [replacementPanoramicPhotoUrl, setReplacementPanoramicPhotoUrl] = useState('');
  const [replacementSerialPhotoUrl, setReplacementSerialPhotoUrl] = useState('');
  const [replacementPanoramicPhotoFile, setReplacementPanoramicPhotoFile] = useState<File | null>(null);
  const [replacementSerialPhotoFile, setReplacementSerialPhotoFile] = useState<File | null>(null);
  const [replacementPanoramicPhotoPreview, setReplacementPanoramicPhotoPreview] = useState<string | null>(null);
  const [replacementSerialPhotoPreview, setReplacementSerialPhotoPreview] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [editTarget, setEditTarget] = useState<InventoryItem | null>(null);
  const [editModel, setEditModel] = useState("");
  const [editSerial, setEditSerial] = useState("");
  const [editStatus, setEditStatus] = useState<InventoryItem["status"]>("AVAILABLE");
  const [editSaving, setEditSaving] = useState(false);
  // Etiquetas: las marcadas para imprimir juntas y las que están en el diálogo.
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [porEtiquetar, setPorEtiquetar] = useState<InventoryItem[] | null>(null);

  // Presentación: filtro por estado, alta plegada y quién tiene cada herramienta.
  const [estadoFiltro, setEstadoFiltro] = useState<FiltroEstado>('todas');
  const [altaAbierta, setAltaAbierta] = useState(abrirAlta);
  const [poseedores, setPoseedores] = useState<Map<number, Poseedor>>(() => new Map());
  // «Completar códigos»: confirmación ligera en línea y la llamada en curso.
  const [confirmarCodigos, setConfirmarCodigos] = useState(false);
  const [completando, setCompletando] = useState(false);
  const puedeCompletarCodigos = hasPermission(user, PERMISSIONS.TOOLS_MANAGE);

  useEffect(() => {
    return () => {
      if (panoramicPhotoPreview) URL.revokeObjectURL(panoramicPhotoPreview);
      if (serialPhotoPreview) URL.revokeObjectURL(serialPhotoPreview);
      if (replacementPanoramicPhotoPreview) URL.revokeObjectURL(replacementPanoramicPhotoPreview);
      if (replacementSerialPhotoPreview) URL.revokeObjectURL(replacementSerialPhotoPreview);
    };
  }, [
    panoramicPhotoPreview,
    serialPhotoPreview,
    replacementPanoramicPhotoPreview,
    replacementSerialPhotoPreview,
  ]);

  const setCreateFile = (type: 'panoramic' | 'serial', file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten imágenes');
      return;
    }

    const preview = URL.createObjectURL(file);
    if (type === 'panoramic') {
      if (panoramicPhotoPreview) URL.revokeObjectURL(panoramicPhotoPreview);
      setPanoramicPhotoFile(file);
      setPanoramicPhotoPreview(preview);
    } else {
      if (serialPhotoPreview) URL.revokeObjectURL(serialPhotoPreview);
      setSerialPhotoFile(file);
      setSerialPhotoPreview(preview);
    }

    setError(null);
  };

  const setReplacementFile = (type: 'panoramic' | 'serial', file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten imágenes');
      return;
    }

    const preview = URL.createObjectURL(file);
    if (type === 'panoramic') {
      if (replacementPanoramicPhotoPreview) URL.revokeObjectURL(replacementPanoramicPhotoPreview);
      setReplacementPanoramicPhotoFile(file);
      setReplacementPanoramicPhotoPreview(preview);
    } else {
      if (replacementSerialPhotoPreview) URL.revokeObjectURL(replacementSerialPhotoPreview);
      setReplacementSerialPhotoFile(file);
      setReplacementSerialPhotoPreview(preview);
    }

    setError(null);
  };

  const fetchItems = async (opts?: { background?: boolean }) => {
    if (!user?.token) return;
    if (!opts?.background) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (includeRetired) params.set('includeRetired', 'true');

      const response = await fetch(buildApiUrl(`tool-requests/inventory?${params.toString()}`), {
        headers: { Authorization: `Bearer ${user.token}` },
      });

      if (!response.ok) throw new Error('No se pudo cargar inventario');
      const payload = await response.json();
      setItems(Array.isArray(payload) ? payload : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      if (!opts?.background) setLoading(false);
    }
  };

  /**
   * Quién la tiene: sale de los kits y préstamos activos (la misma lista de «Kits por
   * persona»). Es solo para enseñarlo; si no carga, la columna queda en «—».
   */
  const fetchPoseedores = async () => {
    if (!user?.token) return;
    try {
      const response = await fetch(buildApiUrl('tool-requests/kits/users'), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!response.ok) return;
      const payload: unknown = await response.json();
      const mapa = new Map<number, Poseedor>();
      for (const fila of Array.isArray(payload) ? payload : []) {
        const f = fila as {
          isActive?: boolean;
          assignmentType?: string;
          user?: { nombre?: string } | null;
          inventoryItem?: { id?: number } | null;
        };
        if (f.isActive === false || !f.inventoryItem?.id || !f.user?.nombre) continue;
        mapa.set(f.inventoryItem.id, { nombre: f.user.nombre, tipo: f.assignmentType === 'LOAN' ? 'prestamo' : 'kit' });
      }
      setPoseedores(mapa);
    } catch {
      /* sin el dato de quién la tiene, la lista sigue igual */
    }
  };

  useEffect(() => {
    const background = items.length > 0;
    void fetchItems(background ? { background: true } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch al cambiar filtros; background si ya hay filas
  }, [user?.token, query, includeRetired]);

  useEffect(() => {
    void fetchPoseedores();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cambia con la sesión
  }, [user?.token]);

  useEffect(() => {
    if (!user?.token) return;

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = createRealtimeSocket(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void fetchItems({ background: true });
        void fetchPoseedores();
      }, 250);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['ToolInventoryItem', 'ToolRequest'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, query, includeRetired]);

  /**
   * Archivo ZPL para una impresora Zebra. La etiqueta de todos los días ya no pasa por
   * aquí: se imprime desde el navegador (`EtiquetasHerramientaDialog`), con su código
   * de barras de verdad, en la impresora de etiquetas que tenga el equipo.
   */
  const descargarZpl = async (item: InventoryItem) => {
    if (!user?.token) return;
    try {
      const res = await fetch(
        buildApiUrl(`tool-requests/inventory/${item.id}/label?format=zpl`),
        { headers: { Authorization: `Bearer ${user.token}` } },
      );
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `etiqueta-${item.codigoInterno || item.serialNumber}.zpl`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la etiqueta');
    }
  };

  /** Guarda el código de etiqueta a las que no lo tienen; avisa cuántas revisó y completó. */
  const completarCodigos = async () => {
    if (!user?.token) return;
    setCompletando(true);
    try {
      const r = await completarCodigosHerramientas(user.token);
      const errores = r.errores?.length ?? 0;
      const texto = `Códigos: ${r.revisadas} revisadas · ${r.completadas} completadas${errores ? ` · ${errores} con error` : ''}`;
      if (errores) toast.warning(texto);
      else toast.success(texto);
      setConfirmarCodigos(false);
      await fetchItems({ background: true });
    } catch (err) {
      toast.error(formatApiError(err, 'No se pudieron completar los códigos'));
    } finally {
      setCompletando(false);
    }
  };

  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.token) return;

    try {
      const formData = new FormData();
      formData.append('toolName', toolName);
      formData.append('model', model);
      formData.append('serialNumber', serialNumber);
      if (panoramicPhotoUrl) formData.append('panoramicPhotoUrl', panoramicPhotoUrl);
      if (serialPhotoUrl) formData.append('serialPhotoUrl', serialPhotoUrl);
      if (panoramicPhotoFile) formData.append('panoramicPhoto', panoramicPhotoFile);
      if (serialPhotoFile) formData.append('serialPhoto', serialPhotoFile);

      const response = await fetch(buildApiUrl('tool-requests/inventory'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'No se pudo guardar la herramienta');
      }

      setToolName('');
      setModel('');
      setSerialNumber('');
      setPanoramicPhotoUrl('');
      setSerialPhotoUrl('');
      setPanoramicPhotoFile(null);
      setSerialPhotoFile(null);
      if (panoramicPhotoPreview) URL.revokeObjectURL(panoramicPhotoPreview);
      if (serialPhotoPreview) URL.revokeObjectURL(serialPhotoPreview);
      setPanoramicPhotoPreview(null);
      setSerialPhotoPreview(null);
      if (createPanoramicInputRef.current) createPanoramicInputRef.current.value = '';
      if (createSerialInputRef.current) createSerialInputRef.current.value = '';
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const startEdit = (item: InventoryItem) => {
    setEditTarget(item);
    setEditModel(item.model);
    setEditSerial(item.serialNumber);
    setEditStatus(item.status);
    setError(null);
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.token || !editTarget) return;
    setEditSaving(true);
    try {
      const res = await fetch(buildApiUrl(`tool-requests/inventory/${editTarget.id}`), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: editModel.trim() || editTarget.model,
          serialNumber: editSerial.trim() || editTarget.serialNumber,
          status: editStatus,
        }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      setEditTarget(null);
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al editar");
    } finally {
      setEditSaving(false);
    }
  };

  const startReplacement = (item: InventoryItem) => {
    setReplacementTarget(item);
    setReplacementModel(item.model);
    setReplacementSerialNumber('');
    setReplacementRetiredReason('Equipo dañado o no funcional');
    setReplacementPanoramicPhotoUrl(item.panoramicPhotoUrl || '');
    setReplacementSerialPhotoUrl(item.serialPhotoUrl || '');
    if (replacementPanoramicPhotoPreview) URL.revokeObjectURL(replacementPanoramicPhotoPreview);
    if (replacementSerialPhotoPreview) URL.revokeObjectURL(replacementSerialPhotoPreview);
    setReplacementPanoramicPhotoFile(null);
    setReplacementSerialPhotoFile(null);
    setReplacementPanoramicPhotoPreview(null);
    setReplacementSerialPhotoPreview(null);
    if (replacePanoramicInputRef.current) replacePanoramicInputRef.current.value = '';
    if (replaceSerialInputRef.current) replaceSerialInputRef.current.value = '';
    setError(null);
  };

  const submitReplacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.token || !replacementTarget) return;
    if (!replacementSerialNumber.trim()) {
      setError('Debes indicar el número de serie del reemplazo');
      return;
    }

    setReplacing(true);
    try {
      const formData = new FormData();
      formData.append('toolName', replacementTarget.toolName);
      formData.append('model', replacementModel.trim() || replacementTarget.model);
      formData.append('serialNumber', replacementSerialNumber.trim());
      if (replacementPanoramicPhotoUrl.trim()) formData.append('panoramicPhotoUrl', replacementPanoramicPhotoUrl.trim());
      if (replacementSerialPhotoUrl.trim()) formData.append('serialPhotoUrl', replacementSerialPhotoUrl.trim());
      if (replacementPanoramicPhotoFile) formData.append('panoramicPhoto', replacementPanoramicPhotoFile);
      if (replacementSerialPhotoFile) formData.append('serialPhoto', replacementSerialPhotoFile);
      if (replacementRetiredReason.trim()) formData.append('retiredReason', replacementRetiredReason.trim());

      const response = await fetch(buildApiUrl(`tool-requests/inventory/${replacementTarget.id}/replace`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'No se pudo reemplazar la herramienta');
      }

      setReplacementTarget(null);
      await fetchItems();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setReplacing(false);
    }
  };

  const counts = {
    total: items.length,
    available: items.filter((i) => i.status === 'AVAILABLE').length,
    assigned: items.filter((i) => i.status === 'ASSIGNED').length,
    inRepair: items.filter((i) => i.status === 'IN_REPAIR').length,
    retired: items.filter((i) => i.status === 'RETIRED').length,
  };
  const enKit = items.filter((i) => i.status === 'ASSIGNED' && poseedores.get(i.id)?.tipo === 'kit').length;
  const prestadas = items.filter((i) => i.status === 'ASSIGNED' && poseedores.get(i.id)?.tipo === 'prestamo').length;

  // El filtro por estado es de la vista; la búsqueda y «Ver retiradas» van a la API.
  const filas = estadoFiltro === 'todas' ? items : items.filter((i) => i.status === estadoFiltro);
  // Solo cuentan las que siguen a la vista: un filtro no deja etiquetas «fantasma».
  const seleccionadas = filas.filter((i) => seleccion.includes(i.id));
  const alternarFiltro = (f: FiltroEstado) => setEstadoFiltro((actual) => (actual === f ? 'todas' : f));

  /**
   * Una zona de soltar tiene que ser un botón de verdad: el `div` con
   * `onClick` que había antes no llegaba con el tabulador ni se anunciaba.
   * De paso desaparece el botón «Elegir» que vivía dentro: toda la zona lo es.
   */
  const zonaFoto = (opciones: {
    etiqueta: string;
    activa: boolean;
    inputRef: React.RefObject<HTMLInputElement>;
    archivo: File | null;
    preview: string | null;
    onDragOver: () => void;
    onDragLeave: () => void;
    onFile: (file: File) => void;
  }) => (
    <div className={styles.zona}>
      <button
        type="button"
        onDragOver={(e) => {
          e.preventDefault();
          opciones.onDragOver();
        }}
        onDragLeave={opciones.onDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          opciones.onDragLeave();
          const file = e.dataTransfer.files?.[0];
          if (file) opciones.onFile(file);
        }}
        onClick={() => opciones.inputRef.current?.click()}
        className={`${styles.dropzone} ${opciones.activa ? styles.dropzoneActive : ''}`}
      >
        {opciones.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={opciones.preview} alt="" className={styles.previewImage} />
        ) : (
          <span className={styles.dropzoneIcono} aria-hidden="true">
            <HandymanOutlined fontSize="small" />
          </span>
        )}
        <span className={styles.dropzoneTexto}>
          <span className={styles.dropzoneLabel}>{opciones.etiqueta}</span>
          <span className={styles.dropzoneHint}>
            {opciones.archivo ? opciones.archivo.name : 'Arrastra una imagen o haz clic'}
          </span>
        </span>
      </button>
      <input
        ref={opciones.inputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) opciones.onFile(file);
        }}
      />
    </div>
  );

  const editandoAlgo = Boolean(editTarget || replacementTarget);
  const buscando = query.trim().length > 0;
  // Sin herramientas no hay nada que esconder: el alta se enseña sola.
  const mostrarAlta = altaAbierta || (!loading && items.length === 0 && !buscando);

  const columnas: Column<InventoryItem>[] = [
    {
      key: 'herramienta',
      label: 'Herramienta',
      render: (item) => {
        const panoramicSrc = resolveAssetUrl(item.panoramicPhotoUrl);
        return (
          <span className={styles.celdaHerramienta}>
            <FotoAlmacen
              src={item.panoramicPhotoUrl}
              tipo="herramienta"
              size={44}
              href={panoramicSrc || null}
              alt={`${item.toolName}, equipo completo`}
            />
            <span className={styles.celdaTexto}>
              <span className={styles.nombre}>{item.toolName}</span>
              <span className={styles.meta}>{item.model}</span>
            </span>
          </span>
        );
      },
    },
    {
      key: 'serie',
      label: 'Serie',
      width: 190,
      render: (item) => {
        const serialSrc = resolveAssetUrl(item.serialPhotoUrl);
        return (
          <span className={styles.celdaSerie}>
            <FotoAlmacen
              src={item.serialPhotoUrl}
              tipo="herramienta"
              size={32}
              href={serialSrc || null}
              alt={`${item.toolName}, número de serie`}
            />
            <span className={styles.meta}>{item.serialNumber}</span>
          </span>
        );
      },
    },
    {
      key: 'codigo',
      label: 'Código',
      width: 150,
      render: (item) => (item.codigoInterno ? <code className={claseMono}>{item.codigoInterno}</code> : <span className={styles.vacio}>—</span>),
    },
    {
      key: 'estado',
      label: 'Estado',
      width: 150,
      render: (item) => {
        const fuera = item.status === 'ASSIGNED' ? poseedores.get(item.id)?.tipo ?? null : null;
        const estado = estadoHerramienta(item.status, fuera);
        const reemplazos = item.replacements?.length ?? 0;
        return (
          <span className={styles.celdaEstado}>
            <StatusBadge label={estado.etiqueta} tone={estado.tono} size="sm" dot />
            {reemplazos > 0 && (
              <span className={styles.meta}>
                {reemplazos} reemplazo{reemplazos === 1 ? '' : 's'}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'quien',
      label: 'Quién la tiene',
      width: 190,
      render: (item) => {
        const p = item.status === 'ASSIGNED' ? poseedores.get(item.id) : undefined;
        if (p) return <PersonCell name={p.nombre} subtitle={p.tipo === 'kit' ? 'En su kit' : 'Préstamo'} size={28} />;
        if (item.status === 'AVAILABLE') return <span className={styles.meta}>En almacén</span>;
        return <span className={styles.vacio}>—</span>;
      },
    },
  ];

  const accionesFila = (item: InventoryItem) => (
    <>
      <Button size="sm" variant="ghost" icon title="Imprimir etiqueta" aria-label={`Imprimir etiqueta de ${item.toolName}`} onClick={() => setPorEtiquetar([item])}>
        <PrintOutlined fontSize="small" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon
        title="Etiqueta Zebra: descarga el archivo que entiende una impresora Zebra"
        aria-label={`Etiqueta Zebra de ${item.toolName}`}
        onClick={() => void descargarZpl(item)}
      >
        <FileDownloadOutlined fontSize="small" />
      </Button>
      <Button size="sm" variant="ghost" icon title="Editar" aria-label={`Editar ${item.toolName}`} onClick={() => startEdit(item)}>
        <EditOutlined fontSize="small" />
      </Button>
      <Button size="sm" variant="ghost" icon title="Reemplazar" aria-label={`Reemplazar ${item.toolName}`} onClick={() => startReplacement(item)}>
        <AutorenewOutlined fontSize="small" />
      </Button>
    </>
  );

  return (
    <div className={styles.wrapper}>
      {!loading && items.length > 0 && (
        <StatRow ariaLabel="Resumen de inventario" cols={4}>
          <Stat
            label="Herramientas"
            value={counts.total}
            hint={includeRetired && counts.retired > 0 ? `dadas de alta · ${counts.retired} retiradas` : 'dadas de alta'}
            icon={<HandymanOutlined />}
            onClick={() => setEstadoFiltro('todas')}
            pressed={estadoFiltro === 'todas'}
          />
          <Stat
            label="Disponibles"
            value={counts.available}
            hint="se pueden prestar"
            tone={counts.available > 0 ? 'success' : 'default'}
            icon={<CheckCircleOutline />}
            iconTone="success"
            onClick={() => alternarFiltro('AVAILABLE')}
            pressed={estadoFiltro === 'AVAILABLE'}
          />
          <Stat
            label="Asignadas"
            value={counts.assigned}
            hint={enKit + prestadas > 0 ? `${enKit} en kit · ${prestadas} prestadas` : 'en manos de alguien'}
            icon={<LocalShippingOutlined />}
            iconTone="info"
            onClick={() => alternarFiltro('ASSIGNED')}
            pressed={estadoFiltro === 'ASSIGNED'}
          />
          <Stat
            label="En reparación"
            value={counts.inRepair}
            hint="fuera de servicio"
            tone={counts.inRepair > 0 ? 'warning' : 'default'}
            icon={<BuildOutlined />}
            iconTone={counts.inRepair > 0 ? 'warning' : 'neutral'}
            semaforo={counts.inRepair > 0 ? 'ambar' : 'verde'}
            onClick={() => alternarFiltro('IN_REPAIR')}
            pressed={estadoFiltro === 'IN_REPAIR'}
          />
        </StatRow>
      )}

      {mostrarAlta && (
        <form onSubmit={createItem}>
          <FormSection
            title="Dar de alta una herramienta"
            description="Nombre, modelo, serie y las dos fotos: así se reconoce al entregarla y al recibirla."
            actions={
              altaAbierta ? (
                <Button size="sm" variant="ghost" onClick={() => setAltaAbierta(false)}>
                  Ocultar
                </Button>
              ) : undefined
            }
          >
            <div className={styles.formCuerpo}>
              <FieldGrid columns={3}>
                <Field label="Herramienta" required>
                  <Input value={toolName} onChange={(e) => setToolName(e.target.value)} />
                </Field>
                <Field label="Modelo" required>
                  <Input value={model} onChange={(e) => setModel(e.target.value)} />
                </Field>
                <Field label="Número de serie" required hint="El que trae grabado el equipo">
                  <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
                </Field>
              </FieldGrid>

              <div className={styles.fieldsGrid}>
                {zonaFoto({
                  etiqueta: 'Foto del equipo completo',
                  activa: dragOverCreate === 'panoramic',
                  inputRef: createPanoramicInputRef,
                  archivo: panoramicPhotoFile,
                  preview: panoramicPhotoPreview,
                  onDragOver: () => setDragOverCreate('panoramic'),
                  onDragLeave: () =>
                    setDragOverCreate((current) => (current === 'panoramic' ? null : current)),
                  onFile: (file) => setCreateFile('panoramic', file),
                })}
                {zonaFoto({
                  etiqueta: 'Foto del número de serie',
                  activa: dragOverCreate === 'serial',
                  inputRef: createSerialInputRef,
                  archivo: serialPhotoFile,
                  preview: serialPhotoPreview,
                  onDragOver: () => setDragOverCreate('serial'),
                  onDragLeave: () =>
                    setDragOverCreate((current) => (current === 'serial' ? null : current)),
                  onFile: (file) => setCreateFile('serial', file),
                })}
              </div>

              <details className={styles.urlDetails}>
                <summary className={styles.urlSummary}>Las fotos ya están en la web</summary>
                <FieldGrid>
                  <Field label="Dirección de la foto del equipo" optional>
                    <Input value={panoramicPhotoUrl} onChange={(e) => setPanoramicPhotoUrl(e.target.value)} />
                  </Field>
                  <Field label="Dirección de la foto de la serie" optional>
                    <Input value={serialPhotoUrl} onChange={(e) => setSerialPhotoUrl(e.target.value)} />
                  </Field>
                </FieldGrid>
              </details>

              <div className={styles.formActions}>
                {/* Mientras hay una edición o un reemplazo abiertos, el primario es
                    el de esa tarea; este baja a gris para no competir. */}
                <Button type="submit" variant={editandoAlgo ? 'secondary' : 'primary'} iconStart={<AddOutlined fontSize="small" />}>
                  Agregar herramienta
                </Button>
              </div>
            </div>
          </FormSection>
        </form>
      )}

      {editTarget && (
        <form onSubmit={submitEdit}>
          <FormSection title={`Editar ${editTarget.toolName}`}>
            <div className={styles.formCuerpo}>
              <FieldGrid columns={3}>
                <Field label="Modelo">
                  <Input value={editModel} onChange={(e) => setEditModel(e.target.value)} />
                </Field>
                <Field label="Número de serie">
                  <Input value={editSerial} onChange={(e) => setEditSerial(e.target.value)} />
                </Field>
                <Field label="Dónde está" hint="«Retirada» la saca del inventario activo">
                  <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value as InventoryItem["status"])}>
                    {(Object.keys(STATUS_LABEL) as InventoryItem["status"][]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FieldGrid>
              <div className={`${styles.formActions} ${styles.formActionsLinea}`}>
                <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={editSaving}>
                  Guardar cambios
                </Button>
              </div>
            </div>
          </FormSection>
        </form>
      )}

      {replacementTarget && (
        <form onSubmit={submitReplacement}>
          <FormSection
            title={`Reemplazar ${replacementTarget.toolName}`}
            description={`Se retira la serie ${replacementTarget.serialNumber} y entra una nueva en su lugar.`}
          >
            <div className={styles.formCuerpo}>
              <FieldGrid>
                <Field label="Modelo que entra">
                  <Input value={replacementModel} onChange={(e) => setReplacementModel(e.target.value)} />
                </Field>
                <Field label="Serie que entra" required>
                  <Input value={replacementSerialNumber} onChange={(e) => setReplacementSerialNumber(e.target.value)} />
                </Field>
                <Field label="Por qué se retira la anterior" fullWidth hint="Queda en el historial de la herramienta">
                  <Input value={replacementRetiredReason} onChange={(e) => setReplacementRetiredReason(e.target.value)} />
                </Field>
              </FieldGrid>

              <div className={styles.fieldsGrid}>
                {zonaFoto({
                  etiqueta: 'Foto del equipo que entra',
                  activa: dragOverReplace === 'panoramic',
                  inputRef: replacePanoramicInputRef,
                  archivo: replacementPanoramicPhotoFile,
                  preview: replacementPanoramicPhotoPreview,
                  onDragOver: () => setDragOverReplace('panoramic'),
                  onDragLeave: () =>
                    setDragOverReplace((current) => (current === 'panoramic' ? null : current)),
                  onFile: (file) => setReplacementFile('panoramic', file),
                })}
                {zonaFoto({
                  etiqueta: 'Foto de la serie que entra',
                  activa: dragOverReplace === 'serial',
                  inputRef: replaceSerialInputRef,
                  archivo: replacementSerialPhotoFile,
                  preview: replacementSerialPhotoPreview,
                  onDragOver: () => setDragOverReplace('serial'),
                  onDragLeave: () =>
                    setDragOverReplace((current) => (current === 'serial' ? null : current)),
                  onFile: (file) => setReplacementFile('serial', file),
                })}
              </div>

              <details className={styles.urlDetails}>
                <summary className={styles.urlSummary}>Las fotos ya están en la web</summary>
                <FieldGrid>
                  <Field label="Dirección de la foto del equipo" optional>
                    <Input value={replacementPanoramicPhotoUrl} onChange={(e) => setReplacementPanoramicPhotoUrl(e.target.value)} />
                  </Field>
                  <Field label="Dirección de la foto de la serie" optional>
                    <Input value={replacementSerialPhotoUrl} onChange={(e) => setReplacementSerialPhotoUrl(e.target.value)} />
                  </Field>
                </FieldGrid>
              </details>

              <div className={`${styles.formActions} ${styles.formActionsLinea}`}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setReplacementTarget(null)}
                  disabled={replacing}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={replacing}>
                  Guardar reemplazo
                </Button>
              </div>
            </div>
          </FormSection>
        </form>
      )}

      <Card aria-label="Herramientas dadas de alta">
        <CardHead
          title="Herramientas dadas de alta"
          subtitle="Con su foto, su código de etiqueta y quién la tiene."
          actions={
            <>
              {puedeCompletarCodigos && (
                <Button
                  size="sm"
                  variant="tertiary"
                  iconStart={<AutoFixHighOutlined fontSize="small" />}
                  onClick={() => setConfirmarCodigos(true)}
                  disabled={confirmarCodigos || completando}
                  title="Guarda el código de etiqueta de las herramientas que aún no lo tienen"
                >
                  Completar códigos
                </Button>
              )}
              {filas.length > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  iconStart={<PrintOutlined fontSize="small" />}
                  onClick={() => setPorEtiquetar(seleccionadas.length > 0 ? seleccionadas : filas)}
                >
                  {seleccionadas.length > 0
                    ? `Imprimir ${seleccionadas.length} etiqueta${seleccionadas.length === 1 ? '' : 's'}`
                    : 'Imprimir todas las etiquetas'}
                </Button>
              )}
              {!mostrarAlta && (
                <Button
                  size="sm"
                  variant={editandoAlgo ? 'secondary' : 'primary'}
                  iconStart={<AddOutlined fontSize="small" />}
                  onClick={() => setAltaAbierta(true)}
                >
                  Nueva herramienta
                </Button>
              )}
            </>
          }
        />

        {confirmarCodigos && (
          <div className={styles.aviso}>
            <Alert
              tone="info"
              title="¿Completar los códigos de etiqueta?"
              action={
                <span className={styles.avisoAcciones}>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmarCodigos(false)} disabled={completando}>
                    Cancelar
                  </Button>
                  <Button size="sm" variant="tonal" loading={completando} onClick={() => void completarCodigos()}>
                    Completar
                  </Button>
                </span>
              }
            >
              Se guarda el código a las herramientas que se dieron de alta sin él. Las que ya tienen código no cambian.
            </Alert>
          </div>
        )}

        <ModuleToolbar
          search={
            <SearchInput
              placeholder="Buscar por herramienta, modelo, serie o código"
              aria-label="Buscar por herramienta, modelo, serie o código"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          }
          chips={
            items.length > 0 ? (
              <FilterChips ariaLabel="Estado de las herramientas">
                <FilterChip active={estadoFiltro === 'todas'} count={counts.total} onClick={() => setEstadoFiltro('todas')}>
                  Todas
                </FilterChip>
                <FilterChip active={estadoFiltro === 'AVAILABLE'} count={counts.available} dot="success" onClick={() => alternarFiltro('AVAILABLE')}>
                  Disponibles
                </FilterChip>
                <FilterChip active={estadoFiltro === 'ASSIGNED'} count={counts.assigned} dot="info" onClick={() => alternarFiltro('ASSIGNED')}>
                  Asignadas
                </FilterChip>
                <FilterChip active={estadoFiltro === 'IN_REPAIR'} count={counts.inRepair} dot="warning" onClick={() => alternarFiltro('IN_REPAIR')}>
                  En reparación
                </FilterChip>
                {includeRetired && (
                  <FilterChip active={estadoFiltro === 'RETIRED'} count={counts.retired} dot="neutral" onClick={() => alternarFiltro('RETIRED')}>
                    Retiradas
                  </FilterChip>
                )}
              </FilterChips>
            ) : undefined
          }
          end={
            <Checkbox
              label="Ver retiradas"
              checked={includeRetired}
              onChange={(e) => {
                setIncludeRetired(e.target.checked);
                if (!e.target.checked && estadoFiltro === 'RETIRED') setEstadoFiltro('todas');
              }}
            />
          }
        />

        {error && (
          <div className={styles.aviso}>
            <Alert
              tone="danger"
              role="alert"
              action={
                <Button size="sm" variant="secondary" onClick={() => void fetchItems()}>
                  Reintentar
                </Button>
              }
            >
              {error}
            </Alert>
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className={styles.carga}>
            <SkeletonRows rows={5} label="Cargando herramientas" />
          </div>
        ) : items.length === 0 ? (
          // «No hay nada» y «el filtro no encuentra nada» no son lo mismo:
          // el primero pide dar de alta, el segundo pide cambiar la búsqueda.
          buscando ? (
            <EmptyState
              size="compact"
              tone="neutral"
              title={`Ninguna herramienta coincide con «${query.trim()}»`}
              description="Se busca por nombre, modelo, número de serie y código de la etiqueta. Prueba con una parte del texto."
              action={
                <Button size="sm" variant="secondary" onClick={() => setQuery('')}>
                  Quitar la búsqueda
                </Button>
              }
            />
          ) : includeRetired ? (
            <EmptyState
              size="compact"
              icon={<HandymanOutlined />}
              title="Todavía no hay ninguna herramienta"
              description="Da de alta la primera arriba: nombre, modelo, serie y las dos fotos."
            />
          ) : (
            <EmptyState
              size="compact"
              icon={<HandymanOutlined />}
              title="Ninguna herramienta activa"
              description="Puede que todas estén retiradas. Marca «Ver retiradas» para comprobarlo, o da una de alta arriba."
            />
          )
        ) : filas.length === 0 ? (
          <EmptyState
            size="compact"
            tone="neutral"
            title="Ninguna herramienta en ese estado"
            action={
              <Button size="sm" variant="secondary" onClick={() => setEstadoFiltro('todas')}>
                Ver todas
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columnas}
            rows={filas}
            rowKey={(item) => item.id}
            flush
            ariaLabel="Herramientas dadas de alta"
            rowActions={accionesFila}
            rowActionsLabel="Acciones"
            selectable
            selectedKeys={seleccion}
            onSelectionChange={(keys) => setSeleccion(keys.map((k) => Number(k)))}
            selectRowLabel={(item) => `Imprimir con otras: ${item.toolName}`}
            selectionBar={({ count }) => (
              <Button size="sm" variant="ghost" iconStart={<PrintOutlined fontSize="small" />} onClick={() => setPorEtiquetar(seleccionadas)}>
                {`Imprimir ${count} etiqueta${count === 1 ? '' : 's'}`}
              </Button>
            )}
          />
        )}

        {filas.length > 0 && <ListFooter total={filas.length} unit={filas.length === 1 ? 'herramienta' : 'herramientas'} />}
      </Card>

      <EtiquetasHerramientaDialog herramientas={porEtiquetar} onClose={() => setPorEtiquetar(null)} />
    </div>
  );
};

export default ToolInventoryPanel;
