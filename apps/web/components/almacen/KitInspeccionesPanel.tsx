"use client";

import { useCallback, useEffect, useState } from "react";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { formatApiError } from "@/lib/erp-api";
import {
  listarInspeccionesKit,
  listarKitsPorInspeccionar,
  programarInspeccionKit,
  registrarInspeccionKit,
  type EstadoInspeccion,
  type InspeccionKit,
  type KitPorInspeccionar,
} from "@/lib/almacen-api";
import InfoBreve from "./InfoBreve";

const INFO =
  "Cada kit asignado puede tener un ritmo de revisión en días. Al registrar una revisión la próxima se recorre sola; si el kit queda observado o dañado, se adelanta. Los vencidos se avisan cada mañana.";

const ESTADOS: ReadonlyArray<{ valor: EstadoInspeccion; etiqueta: string }> = [
  { valor: "OK", etiqueta: "En orden" },
  { valor: "OBSERVADO", etiqueta: "Con observaciones" },
  { valor: "DANADO", etiqueta: "Dañado" },
];

const CADENCIAS = [0, 30, 60, 90, 180] as const;

const inp: React.CSSProperties = {
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

function tagEstado(estado: EstadoInspeccion) {
  if (estado === "DANADO") return <Tag variant="danger" dot size="sm">Dañado</Tag>;
  if (estado === "OBSERVADO") return <Tag variant="warning" dot size="sm">Observado</Tag>;
  return <Tag variant="positive" dot size="sm">En orden</Tag>;
}

function tagProgramacion(k: KitPorInspeccionar) {
  if (k.vencida) {
    return (
      <Tag variant="danger" dot size="sm">
        {k.diasDeAtraso === 0 ? "Hoy" : `${k.diasDeAtraso} d de atraso`}
      </Tag>
    );
  }
  if (k.porVencer) return <Tag variant="warning" dot size="sm">En {k.diasParaLaProxima} d</Tag>;
  return <Tag variant="neutral" size="sm">En {k.diasParaLaProxima ?? "—"} d</Tag>;
}

/** «Revisar kit»: lo que toca revisar hoy, y el registro de cada revisión. */
export default function KitInspeccionesPanel() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [kits, setKits] = useState<KitPorInspeccionar[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [porVencer, setPorVencer] = useState(true);

  const [revisando, setRevisando] = useState<KitPorInspeccionar | null>(null);
  const [estado, setEstado] = useState<EstadoInspeccion>("OK");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [historial, setHistorial] = useState<InspeccionKit[]>([]);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setKits(await listarKitsPorInspeccionar(token, { porVencer }));
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar las revisiones"));
      setKits([]);
    } finally {
      setCargando(false);
    }
  }, [token, porVencer]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abrirRevision = async (kit: KitPorInspeccionar) => {
    setRevisando(kit);
    setEstado("OK");
    setNotas("");
    setHistorial([]);
    if (!token) return;
    try {
      setHistorial(await listarInspeccionesKit(token, kit.id));
    } catch {
      setHistorial([]);
    }
  };

  const guardarRevision = async () => {
    if (!token || !revisando) return;
    if (estado !== "OK" && !notas.trim()) {
      toast.error("Escribe qué observaste");
      return;
    }
    setGuardando(true);
    try {
      await registrarInspeccionKit(token, revisando.id, { estado, notas: notas.trim() || undefined });
      toast.success("Revisión registrada");
      setRevisando(null);
      await cargar();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo registrar la revisión"));
    } finally {
      setGuardando(false);
    }
  };

  const cambiarCadencia = async (kit: KitPorInspeccionar, dias: number) => {
    if (!token) return;
    try {
      await programarInspeccionKit(token, kit.id, dias > 0 ? dias : null);
      toast.success(dias > 0 ? `Revisión cada ${dias} días` : "Sin revisión periódica");
      await cargar();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo programar la revisión"));
    }
  };

  const columnas: Column<KitPorInspeccionar>[] = [
    {
      key: "kit",
      label: "Kit",
      width: 230,
      render: (k) => (
        <div style={{ display: "grid", gap: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 12.5 }}>{k.inventoryItem?.toolName ?? "—"}</strong>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {k.inventoryItem?.model} · {k.inventoryItem?.serialNumber}
          </span>
        </div>
      ),
    },
    { key: "quien", label: "Asignado a", width: 160, accessor: (k) => k.user?.nombre ?? "—" },
    { key: "cuando", label: "Revisión", width: 120, render: (k) => tagProgramacion(k) },
    {
      key: "cadencia",
      label: "Cada",
      width: 110,
      render: (k) => (
        <select
          value={String(k.inspeccionCadaDias ?? 0)}
          onChange={(e) => void cambiarCadencia(k, Number(e.target.value))}
          aria-label={`Ritmo de revisión de ${k.inventoryItem?.toolName ?? "el kit"}`}
          style={{ ...inp, minHeight: 32, padding: "4px 8px", fontSize: 12.5 }}
        >
          {CADENCIAS.map((d) => (
            <option key={d} value={d}>
              {d === 0 ? "Sin revisión" : `${d} días`}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "ultima",
      label: "Última",
      width: 150,
      render: (k) =>
        k.ultimaInspeccion ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {tagEstado(k.ultimaInspeccion.estado)}
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {new Date(k.ultimaInspeccion.fecha).toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
              })}
            </span>
          </div>
        ) : (
          <span style={{ color: "var(--text-tertiary)" }}>Nunca</span>
        ),
    },
    {
      key: "acciones",
      label: "",
      width: 96,
      render: (k) => (
        <Button size="sm" variant="secondary" onClick={() => void abrirRevision(k)}>
          Revisar
        </Button>
      ),
    },
  ];

  return (
    <>
      <Section
        title={cargando ? "Cargando…" : `${kits.length} kits por revisar`}
        actions={
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
              <input
                type="checkbox"
                checked={porVencer}
                onChange={(e) => setPorVencer(e.target.checked)}
              />
              Incluir la próxima semana
            </label>
            <InfoBreve etiqueta="Cómo funciona la revisión periódica" texto={INFO} />
          </div>
        }
        flush
      >
        {error && (
          <div role="alert" style={{ margin: 16, fontSize: 12.5 }}>
            {error}{" "}
            <Button size="sm" variant="ghost" onClick={() => void cargar()}>
              Reintentar
            </Button>
          </div>
        )}
        <DataTable
          columns={columnas}
          rows={kits}
          rowKey={(k) => k.id}
          density="compact"
          emptyTitle="Nada por revisar"
          emptyDescription="Programa un ritmo de revisión en los kits asignados."
        />
      </Section>

      {revisando && (
        <Modal
          open
          onClose={() => setRevisando(null)}
          title={`Revisar ${revisando.inventoryItem?.toolName ?? "kit"}`}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              {revisando.user?.nombre} · {revisando.inventoryItem?.serialNumber}
            </div>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>
                Estado
              </span>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoInspeccion)}
                style={inp}
              >
                {ESTADOS.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>
                Notas {estado !== "OK" ? "*" : ""}
              </span>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={3}
                placeholder="Qué se revisó, qué falta, qué está dañado…"
                style={{ ...inp, minHeight: 78, resize: "vertical" }}
              />
            </label>

            {historial.length > 0 && (
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Revisiones anteriores
                </span>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                  {historial.slice(0, 5).map((h) => (
                    <li
                      key={h.id}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "baseline",
                        flexWrap: "wrap",
                        fontSize: 12,
                      }}
                    >
                      {tagEstado(h.estado)}
                      <span style={{ color: "var(--text-tertiary)" }}>
                        {new Date(h.fecha).toLocaleDateString("es-MX")} · {h.inspector?.nombre ?? "—"}
                      </span>
                      {h.notas && <span style={{ color: "var(--text-secondary)" }}>{h.notas}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setRevisando(null)}>
                Cancelar
              </Button>
              <Button variant="primary" loading={guardando} onClick={() => void guardarRevision()}>
                Registrar revisión
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
