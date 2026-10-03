"use client";

import { useCallback, useEffect, useState } from "react";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import Modal from "@/components/ui/Modal";
import {
  Alert,
  Button,
  Card,
  CardHead,
  Checkbox,
  DataTable,
  Field,
  FieldGrid,
  Input,
  PersonCell,
  Select,
  SkeletonRows,
  StatusBadge,
  Textarea,
  Timeline,
  TimelineItem,
  type Column,
  type TimelineState,
  type Tone,
} from "@/components/base";
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
import s from "./KitInspeccionesPanel.module.css";

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

const TONO_ESTADO: Record<EstadoInspeccion, { etiqueta: string; tono: Tone; linea: TimelineState }> = {
  OK: { etiqueta: "En orden", tono: "success", linea: "done" },
  OBSERVADO: { etiqueta: "Con observaciones", tono: "warning", linea: "current" },
  DANADO: { etiqueta: "Dañado", tono: "danger", linea: "danger" },
};

function tagEstado(estado: EstadoInspeccion) {
  const e = TONO_ESTADO[estado] ?? TONO_ESTADO.OK;
  return <StatusBadge label={e.etiqueta} tone={e.tono} size="sm" dot />;
}

function tagProgramacion(k: KitPorInspeccionar) {
  if (k.vencida) {
    return (
      <StatusBadge
        tone="danger"
        size="sm"
        dot
        label={k.diasDeAtraso === 0 ? "Toca hoy" : `${k.diasDeAtraso} d de atraso`}
      />
    );
  }
  if (k.porVencer) return <StatusBadge tone="warning" size="sm" dot label={`En ${k.diasParaLaProxima} d`} />;
  if (k.diasParaLaProxima == null) return <StatusBadge tone="neutral" size="sm" label="Sin programar" />;
  return <StatusBadge tone="neutral" size="sm" dot label={`En ${k.diasParaLaProxima} d`} />;
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
        <span className={s.doble}>
          <span className={s.fuerte}>{k.inventoryItem?.toolName ?? "—"}</span>
          <span className={s.tenue}>
            {k.inventoryItem?.model} · {k.inventoryItem?.serialNumber}
          </span>
        </span>
      ),
    },
    {
      key: "quien",
      label: "Asignado a",
      width: 180,
      render: (k) => (k.user?.nombre ? <PersonCell name={k.user.nombre} size={28} /> : <span className={s.tenue}>—</span>),
    },
    { key: "cuando", label: "Toca revisar", width: 140, render: (k) => tagProgramacion(k) },
    {
      key: "cadencia",
      label: "Cada cuánto",
      width: 140,
      render: (k) => (
        <Select
          controlSize="sm"
          value={String(k.inspeccionCadaDias ?? 0)}
          onChange={(e) => void cambiarCadencia(k, Number(e.target.value))}
          aria-label={`Cada cuánto se revisa ${k.inventoryItem?.toolName ?? "el kit"}`}
        >
          {CADENCIAS.map((d) => (
            <option key={d} value={d}>
              {d === 0 ? "Sin revisión" : `${d} días`}
            </option>
          ))}
        </Select>
      ),
    },
    {
      key: "ultima",
      label: "Última revisión",
      width: 180,
      render: (k) =>
        k.ultimaInspeccion ? (
          <span className={s.ultima}>
            {tagEstado(k.ultimaInspeccion.estado)}
            <span className={s.tenue}>
              {new Date(k.ultimaInspeccion.fecha).toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
              })}
            </span>
          </span>
        ) : (
          <span className={s.tenue}>Nunca</span>
        ),
    },
  ];

  const atrasados = kits.filter((k) => k.vencida).length;

  return (
    <>
      <Card aria-label="Kits por revisar">
        <CardHead
          title="Kits por revisar"
          subtitle={
            kits.length > 0
              ? `${kits.length} kit${kits.length === 1 ? "" : "s"}${atrasados > 0 ? `, ${atrasados} con la revisión atrasada` : ""}`
              : undefined
          }
          actions={
            <>
              <Checkbox
                label="Incluir la próxima semana"
                checked={porVencer}
                onChange={(e) => setPorVencer(e.target.checked)}
              />
              <InfoBreve etiqueta="Cómo funciona la revisión periódica" texto={INFO} />
            </>
          }
        />
        {error && (
          <div className={s.aviso}>
            <Alert
              tone={kits.length > 0 ? "warning" : "danger"}
              role="alert"
              action={
                <Button size="sm" variant="secondary" onClick={() => void cargar()}>
                  Reintentar
                </Button>
              }
            >
              {kits.length > 0 ? `${error}. Se muestra lo último que cargó.` : error}
            </Alert>
          </div>
        )}
        {cargando && kits.length === 0 ? (
          <div className={s.carga}>
            <SkeletonRows rows={4} label="Cargando kits por revisar" />
          </div>
        ) : error && kits.length === 0 ? null : (
          <DataTable
            columns={columnas}
            rows={kits}
            rowKey={(k) => k.id}
            density="compact"
            flush
            ariaLabel="Kits por revisar"
            rowActionsLabel="Revisar"
            rowActions={(k) => (
              <Button
                size="sm"
                variant="tonal"
                iconStart={<FactCheckOutlined fontSize="small" />}
                aria-label={`Revisar ${k.inventoryItem?.toolName ?? "kit"} de ${k.user?.nombre ?? "sin asignar"}`}
                onClick={() => void abrirRevision(k)}
              >
                Revisar
              </Button>
            )}
            emptyTitle={porVencer ? "Ningún kit pide revisión" : "Nada vencido"}
            emptyDescription={
              porVencer
                ? "Ni hoy ni la próxima semana. Si un kit asignado nunca aparece aquí, ponle un ritmo de revisión en la columna «Cada cuánto»."
                : "No hay revisiones vencidas. Marca «Incluir la próxima semana» para ver lo que viene."
            }
          />
        )}
      </Card>

      {revisando && (
        <Modal
          open
          onClose={() => setRevisando(null)}
          title={`Revisar ${revisando.inventoryItem?.toolName ?? "kit"}`}
          maxWidth={620}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRevisando(null)} disabled={guardando}>
                Cancelar
              </Button>
              <Button variant="primary" loading={guardando} onClick={() => void guardarRevision()}>
                Registrar revisión
              </Button>
            </>
          }
        >
          <div className={s.dialogo}>
            {revisando.user?.nombre ? (
              <PersonCell name={revisando.user.nombre} subtitle={`Serie ${revisando.inventoryItem?.serialNumber ?? "—"}`} size={32} />
            ) : (
              <p className={s.tenue}>{revisando.inventoryItem?.serialNumber}</p>
            )}

            <FieldGrid>
              <Field label="Cómo quedó el kit" required>
                <Select controlSize="lg" value={estado} onChange={(e) => setEstado(e.target.value as EstadoInspeccion)}>
                  {ESTADOS.map((e) => (
                    <option key={e.valor} value={e.valor}>
                      {e.etiqueta}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Fotos"
                optional
                hint={fotos.length > 0 ? `${fotos.length} elegidas, máximo 8` : "Hasta 8 imágenes"}
              >
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  className={s.archivo}
                  onChange={(e) => setFotos(Array.from(e.target.files ?? []).slice(0, 8))}
                />
              </Field>

              <Field
                label="Qué observaste"
                fullWidth
                optional={estado === "OK"}
                required={estado !== "OK"}
                error={errorNotas}
                describedById={NOTAS_ERROR_ID}
                hint={
                  estado === "OK"
                    ? "Si todo está bien, puedes dejarlo vacío."
                    : "Obligatorio cuando el kit no queda en orden."
                }
              >
                <Textarea
                  value={notas}
                  onChange={(e) => {
                    setNotas(e.target.value);
                    if (errorNotas) setErrorNotas(null);
                  }}
                  rows={3}
                  invalid={Boolean(errorNotas)}
                  placeholder="Qué falta, qué está dañado, qué hay que reponer…"
                />
              </Field>
            </FieldGrid>

            {historial.length > 0 && (
              <section className={s.historial} aria-label="Revisiones anteriores">
                <p className={s.rotulo}>Revisiones anteriores</p>
                <Timeline ariaLabel="Revisiones anteriores">
                  {historial.slice(0, 5).map((h) => (
                    <TimelineItem
                      key={h.id}
                      state={(TONO_ESTADO[h.estado] ?? TONO_ESTADO.OK).linea}
                      title={tagEstado(h.estado)}
                      meta={`${new Date(h.fecha).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })} · ${h.inspector?.nombre ?? "—"}`}
                      note={h.notas || undefined}
                    />
                  ))}
                </Timeline>
              </section>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
