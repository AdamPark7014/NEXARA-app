"use client";

import { useEffect, useId, useMemo, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SearchIcon from "@mui/icons-material/Search";
import {
  MAX_REQUISITOS,
  requisitoVacio,
  type ErroresRequisitos,
  type RequisitoBorrador,
} from "@/lib/herramientas-checklist";
import { useUser } from "@/components/UserContext";
import { getUsersKit, searchInventoryTools, type InventoryToolOption, type KitAssignmentRow } from "@/lib/tool-requests-api";
import { Badge, Button, Checkbox, Input } from "@/components/base";
import s from "./HerramientasChecklistEditor.module.css";

type Props = {
  value: RequisitoBorrador[];
  onChange: (next: RequisitoBorrador[]) => void;
  /** Errores de la validación completa; `null` mientras no se intente guardar. */
  errores?: ErroresRequisitos | null;
  disabled?: boolean;
  /** Responsable de la actividad (fuente del kit personal). */
  responsableId?: number;
  /** Equipo extra elegido en el flujo (ids de usuario) para incluir sus kits. */
  extraTeamUserIds?: number[];
  /** Nombre corto del responsable para encabezado (opcional). */
  responsableNombreCorto?: string;
  /** Flag: el responsable lleva su kit personal. */
  usePersonalKit?: boolean;
  onToggleUsePersonalKit?: (next: boolean) => void;
};


function labelDe(item: InventoryToolOption): string {
  const name = [item.toolName, item.model].filter(Boolean).join(" ");
  const serie = item.serialNumber ? ` · Serie ${item.serialNumber}` : "";
  return `${name}${serie}`.trim();
}

export default function HerramientasChecklistEditor({
  value,
  onChange,
  errores,
  disabled = false,
  responsableId,
  extraTeamUserIds,
  responsableNombreCorto,
  usePersonalKit,
  onToggleUsePersonalKit,
}: Props) {
  const idBase = useId();
  const { token } = useUser();
  const [lleno, setLleno] = useState<boolean>(value.length >= MAX_REQUISITOS);
  const [kit, setKit] = useState<KitAssignmentRow[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<InventoryToolOption[]>([]);

  useEffect(() => {
    setLleno(value.length >= MAX_REQUISITOS);
  }, [value]);

  // Cargar kits del responsable y del equipo extra (si vienen).
  useEffect(() => {
    let cancel = false;
    async function cargar() {
      if (!token || !responsableId) {
        setKit([]);
        return;
      }
      try {
        const ids = [responsableId, ...(extraTeamUserIds ?? [])];
        const lotes = await Promise.all(ids.map((id) => getUsersKit(token, id)));
        if (!cancel) setKit(lotes.flat());
      } catch {
        if (!cancel) setKit([]);
      }
    }
    void cargar();
    return () => {
      cancel = true;
    };
  }, [token, responsableId, extraTeamUserIds]);

  // Buscar en almacén (solo disponibles).
  useEffect(() => {
    let cancel = false;
    const qx = q.trim();
    if (!token || qx.length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const t = window.setTimeout(async () => {
      try {
        const lista = await searchInventoryTools(token, qx);
        if (!cancel) setResultados(lista);
      } catch {
        if (!cancel) setResultados([]);
      } finally {
        if (!cancel) setBuscando(false);
      }
    }, 200);
    return () => {
      cancel = true;
      window.clearTimeout(t);
    };
  }, [token, q]);

  const cambiar = (key: string, parcial: Partial<RequisitoBorrador>) =>
    onChange(value.map((f) => (f.key === key ? { ...f, ...parcial } : f)));

  const quitar = (key: string) => onChange(value.filter((f) => f.key !== key));

  const yaElegidos = useMemo(() => new Set(value.map((v) => Number(v.toolId || 0)).filter(Boolean)), [value]);

  const agregarDeInventario = (item: InventoryToolOption, source: "INVENTORY") => {
    if (lleno || disabled) return;
    if (yaElegidos.has(item.id)) return;
    const fila: RequisitoBorrador = {
      ...requisitoVacio(labelDe(item), 1),
      toolId: item.id,
      source,
    };
    onChange([...value, fila]);
  };

  const kitPorUsuario = useMemo(() => {
    const byUser = new Map<number, InventoryToolOption[]>();
    for (const a of kit) {
      if (!a.isActive || !a.user?.id || !a.inventoryItem) continue;
      const arr = byUser.get(a.user.id) ?? [];
      arr.push(a.inventoryItem);
      byUser.set(a.user.id, arr);
    }
    return byUser;
  }, [kit]);

  return (
    <div className={s.editor}>
      {/* Opción Kit personal */}
      <div className={s.kit}>
        <Checkbox
          label="Kit personal"
          checked={Boolean(usePersonalKit)}
          onChange={(e) => onToggleUsePersonalKit?.(e.target.checked)}
          disabled={disabled}
        />
        {responsableId ? (
          <p className={s.nota}>
            {responsableNombreCorto ? `${responsableNombreCorto} ` : "El responsable "}lleva su kit personal.
            {kit.length ? " Referencia:" : ""}
          </p>
        ) : null}
        {/* Solo referencia de lectura del kit */}
        {kit.length ? (
          <div className={s.kitLista}>
            {Array.from(kitPorUsuario.entries()).map(([uid, items]) => (
              <div key={uid} className={s.kitLista}>
                <div className={s.nota}>
                  {kit.find((k) => k.user?.id === uid)?.user?.nombre ?? "Usuario"} · {items.length} herramienta{items.length === 1 ? "" : "s"}
                </div>
                <div className={s.kitChips}>
                  {items.map((it) => (
                    <span key={it.id} title={labelDe(it)}>
                      <Badge tone="neutral">{it.toolName}</Badge>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Lista actual */}
      {value.length > 0 ? (
        <ol className={s.filas}>
          {value.map((fila, i) => {
            const cantId = `${idBase}-${fila.key}-cant`;
            const errorId = `${idBase}-${fila.key}-error`;
            const mensaje = errores?.porFila[fila.key] ?? null;
            const visible = fila.descripcion.trim() || `herramienta ${i + 1}`;
            return (
              <li key={fila.key} className={s.fila} data-error={mensaje ? "true" : undefined}>
                <div className={s.filaArriba}>
                  <div className={s.filaTexto}>
                    <div className={s.filaT}>{fila.descripcion}</div>
                    {fila.source ? (
                      <div className={s.filaM}>
                        {fila.source === "KIT" ? "Del kit" : "De almacén"}
                        {fila.toolId ? ` · #${fila.toolId}` : ""}
                      </div>
                    ) : null}
                  </div>
                  <label htmlFor={cantId} className={s.cantidad}>
                    <span className={s.etiqueta}>Cantidad</span>
                    <Input
                      id={cantId}
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      className={s.cantidadInput}
                      value={Number.isFinite(fila.cantidad) ? fila.cantidad : ""}
                      aria-label={`Cantidad de ${visible}`}
                      disabled={disabled}
                      aria-invalid={Boolean(mensaje)}
                      onChange={(e) =>
                        cambiar(fila.key, { cantidad: e.target.value === "" ? Number.NaN : Number(e.target.value) })
                      }
                    />
                  </label>
                  <Button
                    size="sm"
                    variant="danger-ghost"
                    onClick={() => quitar(fila.key)}
                    disabled={disabled}
                    aria-label={`Quitar ${visible}`}
                    title="Quitar"
                    iconStart={<DeleteOutlineIcon fontSize="inherit" />}
                  >
                    Quitar
                  </Button>
                </div>
                {mensaje ? (
                  <p id={errorId} className={s.error}>
                    {mensaje}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {/* Inventario (disponibles) */}
      <div className={s.almacen}>
        <label htmlFor={`${idBase}-buscar`} className={s.almacen}>
          <span className={s.etiqueta}>Almacén de herramientas</span>
          <Input
            id={`${idBase}-buscar`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, modelo o serie…"
            disabled={disabled}
            iconStart={<SearchIcon fontSize="inherit" />}
          />
        </label>
        {q.trim().length >= 2 ? (
          resultados.length > 0 ? (
            <ul className={s.resultados}>
              {resultados.map((it) => {
                const elegido = yaElegidos.has(it.id);
                const disponible = String(it.status).toUpperCase() === "AVAILABLE";
                return (
                  <li key={it.id} className={s.resultado}>
                    <div className={s.filaTexto}>
                      <div className={s.filaT}>{labelDe(it)}</div>
                      <div className={s.filaM}>{disponible ? "Disponible" : `No disponible (${it.status})`}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="tonal"
                      onClick={() => agregarDeInventario(it, "INVENTORY")}
                      disabled={!disponible || elegido || disabled || lleno}
                      iconStart={<AddIcon fontSize="inherit" />}
                    >
                      Añadir
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={s.nota}>{buscando ? "Buscando…" : "Sin resultados."}</p>
          )
        ) : (
          <p className={s.nota}>Escribe al menos 2 caracteres para buscar.</p>
        )}
      </div>

      {/* Conteo */}
      {value.length > 0 ? (
        <span className={s.nota}>
          {value.length} de {MAX_REQUISITOS} herramientas
        </span>
      ) : null}

      {errores?.general ? (
        <p role="alert" className={s.error}>
          {errores.general}
        </p>
      ) : null}
    </div>
  );
}
