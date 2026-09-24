"use client";

import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
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
};

const input: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  minHeight: 40,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  font: "inherit",
  fontSize: 14,
};

const chip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 12px",
  minHeight: 36,
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 650,
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

  const agregarDeInventario = (item: InventoryToolOption, source: "KIT" | "INVENTORY") => {
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
    <div style={{ display: "grid", gap: 14 }}>
      {/* Lista actual */}
      {value.length > 0 ? (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {value.map((fila, i) => {
            const cantId = `${idBase}-${fila.key}-cant`;
            const errorId = `${idBase}-${fila.key}-error`;
            const mensaje = errores?.porFila[fila.key] ?? null;
            const visible = fila.descripcion.trim() || `herramienta ${i + 1}`;
            return (
              <li
                key={fila.key}
                style={{
                  display: "grid",
                  gap: 8,
                  padding: 12,
                  borderRadius: 14,
                  border: `1px solid ${mensaje ? "color-mix(in srgb, var(--danger) 45%, var(--border))" : "var(--border)"}`,
                  background: "var(--surface)",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 750, overflowWrap: "anywhere" }}>{fila.descripcion}</div>
                    {fila.source ? (
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                        {fila.source === "KIT" ? "Del kit" : "De almacén"}
                        {fila.toolId ? ` · #${fila.toolId}` : ""}
                      </div>
                    ) : null}
                  </div>
                  <label htmlFor={cantId} style={{ display: "grid", gap: 4, width: 88 }}>
                    <span style={{ fontSize: 12, fontWeight: 650, color: "var(--text-secondary)" }}>Cantidad</span>
                    <input
                      id={cantId}
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={Number.isFinite(fila.cantidad) ? fila.cantidad : ""}
                      aria-label={`Cantidad de ${visible}`}
                      disabled={disabled}
                      aria-invalid={Boolean(mensaje)}
                      onChange={(e) =>
                        cambiar(fila.key, { cantidad: e.target.value === "" ? Number.NaN : Number(e.target.value) })
                      }
                      style={{ ...input, textAlign: "center" }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => quitar(fila.key)}
                    disabled={disabled}
                    aria-label={`Quitar ${visible}`}
                    title="Quitar"
                    style={{
                      ...chip,
                      color: "var(--danger)",
                      borderColor: "color-mix(in srgb, var(--danger) 35%, var(--border))",
                    }}
                  >
                    <DeleteOutlineIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                    Quitar
                  </button>
                </div>
                {mensaje ? (
                  <p id={errorId} style={{ margin: 0, fontSize: 12.5, color: "var(--danger)", fontWeight: 600 }}>
                    {mensaje}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {/* Kit personal y de equipo */}
      {responsableId ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
            Kit personal{responsableNombreCorto ? ` de ${responsableNombreCorto}` : ""}{extraTeamUserIds?.length ? " y equipo" : ""}
          </div>
          {Array.from(kitPorUsuario.entries()).map(([uid, items]) => (
            <div key={uid} style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                {kit.find((k) => k.user?.id === uid)?.user?.nombre ?? "Usuario"} · {items.length} herramienta{items.length === 1 ? "" : "s"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {items.map((it) => {
                  const elegido = yaElegidos.has(it.id);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      style={{ ...chip, opacity: elegido || disabled || lleno ? 0.55 : 1 }}
                      disabled={elegido || disabled || lleno}
                      onClick={() => agregarDeInventario(it, "KIT")}
                      title={labelDe(it)}
                    >
                      <AddIcon aria-hidden="true" sx={{ fontSize: 16 }} />
                      {it.toolName}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Inventario (disponibles) */}
      <div style={{ display: "grid", gap: 8 }}>
        <label htmlFor={`${idBase}-buscar`} style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>Almacén de herramientas</span>
          <div style={{ position: "relative" }}>
            <input
              id={`${idBase}-buscar`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, modelo o serie…"
              style={input}
              disabled={disabled}
            />
            <SearchIcon aria-hidden="true" sx={{ fontSize: 18, position: "absolute", right: 10, top: 10, color: "var(--text-tertiary)" }} />
          </div>
        </label>
        {q.trim().length >= 2 ? (
          resultados.length > 0 ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {resultados.map((it) => {
                const elegido = yaElegidos.has(it.id);
                const disponible = String(it.status).toUpperCase() === "AVAILABLE";
                return (
                  <li
                    key={it.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere" }}>{labelDe(it)}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                        {disponible ? "Disponible" : `No disponible (${it.status})`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => agregarDeInventario(it, "INVENTORY")}
                      disabled={!disponible || elegido || disabled || lleno}
                      style={{ ...chip, opacity: !disponible || elegido || disabled || lleno ? 0.5 : 1 }}
                    >
                      <AddIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                      Añadir
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" }}>
              {buscando ? "Buscando…" : "Sin resultados."}
            </p>
          )
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" }}>Escribe al menos 2 caracteres para buscar.</p>
        )}
      </div>

      {/* Conteo */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        {value.length > 0 ? (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {value.length} de {MAX_REQUISITOS} herramientas
          </span>
        ) : null}
      </div>

      {errores?.general ? (
        <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--danger)", fontWeight: 600 }}>
          {errores.general}
        </p>
      ) : null}
    </div>
  );
}
