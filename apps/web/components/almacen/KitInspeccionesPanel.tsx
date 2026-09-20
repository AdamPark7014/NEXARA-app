"use client";

import { useCallback, useEffect, useState } from "react";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusDot from "@/components/ui/StatusDot";
import InlineAlert from "@/components/ui/InlineAlert";
import { FinanceField, FinanceFormGrid } from "@/components/finance/FinanceModuleShell";
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

/** El error de las notas lo referencia el propio textarea. */
const NOTAS_ERROR_ID = "revision-kit-notas-error";

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
  if (estado === "DANADO") return <StatusDot tone="danger" label="Dañado" />;
  if (estado === "OBSERVADO") return <StatusDot tone="warning" label="Con observaciones" />;
  return <StatusDot tone="success" label="En orden" />;
}

function tagProgramacion(k: KitPorInspeccionar) {
  if (k.vencida) {
    return (
      <StatusDot
        tone="danger"
        label={k.diasDeAtraso === 0 ? "Toca hoy" : `${k.diasDeAtraso} d de atraso`}
      />
    );
  }
  if (k.porVencer) return <StatusDot tone="warning" label={`En ${k.diasParaLaProxima} d`} />;
  if (k.diasParaLaProxima == null) return <StatusDot label="Sin programar" />;
  return <StatusDot label={`En ${k.diasParaLaProxima} d`} />;
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
  const [errorNotas, setErrorNotas] = useState<string | null>(null);
  const [fotos, setFotos] = useState<File[]>([]);
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
    setErrorNotas(null);
    setFotos([]);
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
      // El error vive bajo su campo, no solo en un toast que se va solo.
      setErrorNotas("Escribe qué observaste antes de guardar.");
      toast.error("Escribe qué observaste");
      return;
    }
    setErrorNotas(null);
    setGuardando(true);
    try {
      await registrarInspeccionKit(token, revisando.id, {
        estado,
        notas: notas.trim() || undefined,
        archivos: fotos.length ? fotos : undefined,
      });
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
    { key: "cuando", label: "Toca revisar", width: 130, render: (k) => tagProgramacion(k) },
    {
      key: "cadencia",
      label: "Cada cuánto",
      width: 118,
      render: (k) => (
        <select
          value={String(k.inspeccionCadaDias ?? 0)}
          onChange={(e) => void cambiarCadencia(k, Number(e.target.value))}
          aria-label={`Cada cuánto se revisa ${k.inventoryItem?.toolName ?? "el kit"}`}
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
      label: "Última revisión",
      width: 160,
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

  const atrasados = kits.filter((k) => k.vencida).length;

  return (
    <>
      <Section
        title="Kits por revisar"
        subtitle={
          kits.length > 0
            ? `${kits.length} kit${kits.length === 1 ? "" : "s"}${atrasados > 0 ? `, ${atrasados} con la revisión atrasada` : ""}`
            : undefined
        }
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
          <div style={{ marginBottom: 12 }}>
            <InlineAlert
              variant="danger"
              message={error}
              action={
                <Button size="sm" variant="secondary" onClick={() => void cargar()}>
                  Reintentar
                </Button>
              }
            />
          </div>
        )}
        {cargando && kits.length === 0 ? (
          <p role="status" style={{ margin: 0, padding: "24px 0", fontSize: 12.5, color: "var(--text-tertiary)" }}>
            Cargando…
          </p>
        ) : (
          <DataTable
            columns={columnas}
            rows={kits}
            rowKey={(k) => k.id}
            density="compact"
            emptyTitle={porVencer ? "Ningún kit pide revisión" : "Nada vencido"}
            emptyDescription={
              porVencer
                ? "Ni hoy ni la próxima semana. Si un kit asignado nunca aparece aquí, ponle un ritmo de revisión en la columna «Cada cuánto»."
                : "No hay revisiones vencidas. Marca «Incluir la próxima semana» para ver lo que viene."
            }
          />
        )}
      </Section>

      {revisando && (
        <Modal
          open
          onClose={() => setRevisando(null)}
          title={`Revisar ${revisando.inventoryItem?.toolName ?? "kit"}`}
        >
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
              {revisando.user?.nombre} · {revisando.inventoryItem?.serialNumber}
            </div>

            <FinanceFormGrid>
              <FinanceField label="Cómo quedó el kit">
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
              </FinanceField>

              <FinanceField
                label="Fotos"
                optional
                hint={fotos.length > 0 ? `${fotos.length} elegidas, máximo 8` : "Hasta 8 imágenes"}
              >
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => setFotos(Array.from(e.target.files ?? []).slice(0, 8))}
                  style={{ ...inp, padding: "7px 10px", minHeight: 36, fontSize: 12.5 }}
                />
              </FinanceField>

              <FinanceField
                label="Qué observaste"
                fullWidth
                optional={estado === "OK"}
                error={errorNotas}
                describedById={NOTAS_ERROR_ID}
                hint={
                  estado === "OK"
                    ? "Si todo está bien, puedes dejarlo vacío."
                    : "Obligatorio cuando el kit no queda en orden."
                }
              >
                <textarea
                  value={notas}
                  onChange={(e) => {
                    setNotas(e.target.value);
                    if (errorNotas) setErrorNotas(null);
                  }}
                  rows={3}
                  aria-invalid={errorNotas ? true : undefined}
                  aria-describedby={errorNotas ? NOTAS_ERROR_ID : undefined}
                  placeholder="Qué falta, qué está dañado, qué hay que reponer…"
                  style={{ ...inp, minHeight: 78, resize: "vertical" }}
                />
              </FinanceField>
            </FinanceFormGrid>

            {historial.length > 0 && (
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
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

            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                paddingTop: 12,
                borderTop: "1px solid var(--nx-panel-hairline, var(--border))",
              }}
            >
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
