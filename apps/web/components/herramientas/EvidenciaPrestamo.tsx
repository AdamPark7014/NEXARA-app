"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import {
  Alert,
  Button,
  EvidenceGallery,
  EvidencePhoto,
  EvidenceSlot,
  Field,
  Input,
  StatusBadge,
  Textarea,
} from "@/components/base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import { formatApiError } from "@/lib/erp-api";
import {
  CONDICIONES_DEVOLUCION,
  CONDICION_DEVOLUCION,
  MAX_FOTOS_EVIDENCIA,
  condicionPideExplicacion,
  condicionPideFoto,
  deliverToolRequest,
  returnToolRequest,
  toolRequestStatusLabel,
  type CondicionDevolucion,
  type ToolRequestRow,
} from "@/lib/tool-requests-api";
import s from "./EvidenciaPrestamo.module.css";

/**
 * Evidencia de un préstamo de herramienta (Adam, 21-11-2026): la herramienta sale con fotos de
 * cómo iba («antes») y vuelve con su estado y fotos de cómo llegó («después»). Tres piezas:
 * `DialogoEntrega`, `DialogoDevolucion` y `VisorEvidencia` (antes y después lado a lado).
 * Las usan la tabla de préstamos, el escáner de etiquetas y la entrega con código.
 */

function fechaHora(valor: string | null | undefined): string {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** Fotos elegidas con su vista previa. En el teléfono abre la cámara: la evidencia se toma en vivo. */
export function SelectorFotos({
  fotos,
  onCambio,
  maximo = MAX_FOTOS_EVIDENCIA,
  etiqueta,
  deshabilitado = false,
}: {
  fotos: File[];
  onCambio: (fotos: File[]) => void;
  maximo?: number;
  /** Qué se le pide fotografiar, en el hueco vacío. */
  etiqueta: string;
  deshabilitado?: boolean;
}) {
  const campoRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const vistas = useMemo(() => fotos.map((f) => ({ archivo: f, url: URL.createObjectURL(f) })), [fotos]);
  useEffect(() => () => vistas.forEach((v) => URL.revokeObjectURL(v.url)), [vistas]);

  const agregar = (lista: FileList | null) => {
    const nuevas = Array.from(lista ?? []).filter((f) => f.type.startsWith("image/"));
    if (nuevas.length > 0) onCambio([...fotos, ...nuevas].slice(0, maximo));
    if (campoRef.current) campoRef.current.value = "";
  };

  return (
    <div>
      <input
        ref={campoRef}
        id={id}
        className={s.oculto}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        disabled={deshabilitado}
        onChange={(e) => agregar(e.target.files)}
      />
      <EvidenceGallery cols={3}>
        {vistas.map((v, i) => (
          <div key={v.url} className={s.mini}>
            <EvidencePhoto src={v.url} alt={`Foto ${i + 1}`} caption={`Foto ${i + 1}`} />
            <button
              type="button"
              className={s.quitar}
              aria-label={`Quitar la foto ${i + 1}`}
              disabled={deshabilitado}
              onClick={() => onCambio(fotos.filter((f) => f !== v.archivo))}
            >
              ×
            </button>
          </div>
        ))}
        {fotos.length < maximo ? (
          <EvidenceSlot
            label={fotos.length === 0 ? etiqueta : "Agregar otra foto"}
            badge={null}
            onClick={deshabilitado ? undefined : () => campoRef.current?.click()}
          />
        ) : null}
      </EvidenceGallery>
      <p className={s.pista}>
        {fotos.length} de {maximo} fotos
      </p>
    </div>
  );
}

/** Lo mínimo que un diálogo necesita saber del préstamo. */
export type PrestamoParaEvidencia = {
  id: number;
  toolName: string;
  /** Modelo y serie, para no confundir dos herramientas iguales. */
  detalle?: string | null;
  /** Quien la pidió. */
  persona?: string | null;
};

// ── Entregar ───────────────────────────────────────────────────────────────

export function DialogoEntrega({
  token,
  prestamo,
  onCerrar,
  onListo,
}: {
  token: string;
  prestamo:
    | (PrestamoParaEvidencia & {
        /** Si ya se conoce (escáner, entrega con código) no se vuelve a pedir. */
        pickupCode?: string | null;
        recogidaPorId?: number;
        /** true cuando quien entrega debe teclear el código que trae la persona. */
        pideCodigo?: boolean;
      })
    | null;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cerrojo = useRef(false);

  useEffect(() => {
    setCodigo("");
    setFotos([]);
    setError(null);
    setAviso(null);
    setOcupado(false);
    cerrojo.current = false;
  }, [prestamo?.id]);

  if (!prestamo) return null;
  const pideCodigo = Boolean(prestamo.pideCodigo);

  const entregar = async () => {
    if (cerrojo.current) return;
    if (pideCodigo && !codigo.trim()) {
      setAviso("Escribe el código de recolección que trae quien recoge.");
      return;
    }
    if (fotos.length === 0) {
      setAviso("Toma al menos una foto de cómo sale la herramienta.");
      return;
    }
    cerrojo.current = true;
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      await deliverToolRequest(token, prestamo.id, pideCodigo ? codigo : (prestamo.pickupCode ?? ""), {
        fotos,
        recogidaPorId: prestamo.recogidaPorId,
      });
      onListo(`${prestamo.toolName} entregada${prestamo.persona ? ` a ${prestamo.persona}` : ""}`);
      onCerrar();
    } catch (e) {
      setError(formatApiError(e, "No se pudo entregar la herramienta. Tus fotos siguen aquí para reintentar."));
      cerrojo.current = false;
      setOcupado(false);
    }
  };

  return (
    <Modal
      open
      size="md"
      title={`Entregar ${prestamo.toolName}`}
      description={prestamo.detalle ?? undefined}
      onClose={() => {
        if (!ocupado) onCerrar();
      }}
      dirty={fotos.length > 0}
      footer={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button variant="primary" loading={ocupado} onClick={() => void entregar()}>
            Entregar
          </Button>
        </>
      }
    >
      <div className={s.dialogo}>
        {prestamo.persona ? <p className={s.quien}>La recoge {prestamo.persona}.</p> : null}
        {pideCodigo ? (
          <Field label="Código de recolección" required hint="Pídelo a quien recoge la herramienta.">
            <Input
              controlSize="lg"
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value.toUpperCase());
                setAviso(null);
              }}
              maxLength={10}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="A3F7KD"
            />
          </Field>
        ) : null}
        <section aria-label="Fotos de cómo sale">
          <p className={s.rotulo}>Cómo sale</p>
          <SelectorFotos
            fotos={fotos}
            onCambio={(f) => {
              setFotos(f);
              setAviso(null);
            }}
            etiqueta="Foto de la herramienta y sus accesorios"
            deshabilitado={ocupado}
          />
        </section>
        {aviso ? (
          <Alert tone="warning" role="alert">
            {aviso}
          </Alert>
        ) : null}
        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}

// ── Recibir ────────────────────────────────────────────────────────────────

export function DialogoDevolucion({
  token,
  prestamo,
  onCerrar,
  onListo,
}: {
  token: string;
  prestamo: (PrestamoParaEvidencia & { fotosEntrega?: string[]; entregadaEl?: string | null }) | null;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}) {
  const [condicion, setCondicion] = useState<CondicionDevolucion>("BIEN");
  const [descripcion, setDescripcion] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cerrojo = useRef(false);
  const grupo = useId();

  useEffect(() => {
    setCondicion("BIEN");
    setDescripcion("");
    setFotos([]);
    setError(null);
    setAviso(null);
    setOcupado(false);
    cerrojo.current = false;
  }, [prestamo?.id]);

  if (!prestamo) return null;
  const pideExplicacion = condicionPideExplicacion(condicion);
  const pideFoto = condicionPideFoto(condicion);
  const antes = prestamo.fotosEntrega ?? [];

  const recibir = async () => {
    if (cerrojo.current) return;
    if (pideExplicacion && !descripcion.trim()) {
      setAviso("Describe qué le pasó a la herramienta.");
      return;
    }
    if (pideFoto && fotos.length === 0) {
      setAviso("Toma al menos una foto de cómo vuelve la herramienta.");
      return;
    }
    cerrojo.current = true;
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      await returnToolRequest(token, prestamo.id, { condicion, descripcion, fotos });
      onListo(
        condicion === "BIEN" || condicion === "DESGASTE"
          ? `${prestamo.toolName} recibida y de vuelta en almacén`
          : condicion === "EXTRAVIADA"
            ? `${prestamo.toolName} registrada como extraviada y dada de baja`
            : `${prestamo.toolName} recibida: pasa a revisión`,
      );
      onCerrar();
    } catch (e) {
      setError(formatApiError(e, "No se pudo registrar la devolución. Lo que capturaste sigue aquí para reintentar."));
      cerrojo.current = false;
      setOcupado(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      title={`Recibir ${prestamo.toolName}`}
      description={prestamo.detalle ?? undefined}
      onClose={() => {
        if (!ocupado) onCerrar();
      }}
      dirty={fotos.length > 0 || descripcion.trim().length > 0}
      footer={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button variant="primary" loading={ocupado} onClick={() => void recibir()}>
            {condicion === "BIEN" || condicion === "DESGASTE" ? "Recibir" : "Recibir y reportar"}
          </Button>
        </>
      }
    >
      <div className={s.dialogo}>
        {prestamo.persona ? <p className={s.quien}>La devuelve {prestamo.persona}.</p> : null}

        <section aria-label="Cómo salió">
          <p className={s.rotulo}>Cómo salió{prestamo.entregadaEl ? ` · ${fechaHora(prestamo.entregadaEl)}` : ""}</p>
          {antes.length > 0 ? (
            <EvidenceGallery cols={3}>
              {antes.map((url, i) => (
                <EvidencePhoto
                  key={url}
                  src={resolveAssetUrl(url)}
                  href={resolveAssetUrl(url)}
                  alt={`Antes, foto ${i + 1}`}
                  caption={`Antes ${i + 1}`}
                />
              ))}
            </EvidenceGallery>
          ) : (
            <div className={s.sinFoto}>Esta herramienta salió sin fotos de entrega.</div>
          )}
        </section>

        <fieldset className={s.condiciones} aria-label="En qué estado vuelve">
          {CONDICIONES_DEVOLUCION.map((c) => (
            <label key={c} className={s.condicion}>
              <input
                type="radio"
                name={grupo}
                value={c}
                checked={condicion === c}
                disabled={ocupado}
                onChange={() => {
                  setCondicion(c);
                  setAviso(null);
                }}
              />
              <span className={s.condicionTitulo}>{CONDICION_DEVOLUCION[c].etiqueta}</span>
              <span className={s.condicionAyuda}>{CONDICION_DEVOLUCION[c].ayuda}</span>
            </label>
          ))}
        </fieldset>

        {pideFoto ? (
          <section aria-label="Fotos de cómo vuelve">
            <p className={s.rotulo}>Cómo vuelve</p>
            <SelectorFotos
              fotos={fotos}
              onCambio={(f) => {
                setFotos(f);
                setAviso(null);
              }}
              etiqueta="Foto de cómo vuelve la herramienta"
              deshabilitado={ocupado}
            />
          </section>
        ) : null}

        <Field
          label={pideExplicacion ? "Qué le pasó" : "Observaciones"}
          required={pideExplicacion}
          optional={!pideExplicacion}
          hint={
            condicion === "INCOMPLETA"
              ? "Di qué pieza o accesorio falta."
              : condicion === "EXTRAVIADA"
                ? "Di dónde y cuándo se vio por última vez."
                : undefined
          }
        >
          <Textarea
            rows={3}
            value={descripcion}
            maxLength={1000}
            disabled={ocupado}
            onChange={(e) => {
              setDescripcion(e.target.value);
              setAviso(null);
            }}
          />
        </Field>

        {aviso ? (
          <Alert tone="warning" role="alert">
            {aviso}
          </Alert>
        ) : null}
        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}

// ── Antes y después ────────────────────────────────────────────────────────

function Lado({
  titulo,
  fotos,
  datos,
  nota,
  insignia,
  vacio,
}: {
  titulo: string;
  fotos: string[];
  datos: string[];
  nota?: string | null;
  insignia?: React.ReactNode;
  vacio: string;
}) {
  return (
    <section className={s.lado} aria-label={titulo}>
      <div className={s.ladoCabeza}>
        <h3 className={s.ladoTitulo}>{titulo}</h3>
        {insignia}
      </div>
      {datos.filter(Boolean).map((d) => (
        <p key={d} className={s.dato}>
          {d}
        </p>
      ))}
      {fotos.length > 0 ? (
        <EvidenceGallery cols={2}>
          {fotos.map((url, i) => (
            <EvidencePhoto
              key={url}
              src={resolveAssetUrl(url)}
              href={resolveAssetUrl(url)}
              alt={`${titulo}, foto ${i + 1}`}
              caption={`${titulo} ${i + 1}`}
            />
          ))}
        </EvidenceGallery>
      ) : (
        <div className={s.sinFoto}>{vacio}</div>
      )}
      {nota ? <p className={s.nota}>{nota}</p> : null}
    </section>
  );
}

/** ¿Qué le falta de evidencia a un préstamo? Para la insignia de la tabla. */
export function faltaEvidencia(p: Pick<ToolRequestRow, "status" | "deliveryPhotos" | "returnPhotos" | "returnCondition">) {
  const entregado = p.status === "IN_USE" || p.status === "RETURNED" || p.status === "DAMAGED";
  const devuelto = p.status === "RETURNED" || p.status === "DAMAGED";
  return {
    entrega: entregado && p.deliveryPhotos.length === 0,
    devolucion: devuelto && p.returnPhotos.length === 0 && p.returnCondition !== "EXTRAVIADA",
    hay: p.deliveryPhotos.length + p.returnPhotos.length > 0,
  };
}

export function VisorEvidencia({ prestamo, onCerrar }: { prestamo: ToolRequestRow | null; onCerrar: () => void }) {
  if (!prestamo) return null;
  const devuelto = prestamo.status === "RETURNED" || prestamo.status === "DAMAGED";
  const condicion = prestamo.returnCondition ? CONDICION_DEVOLUCION[prestamo.returnCondition] : null;
  return (
    <Modal
      open
      size="xl"
      title={`${prestamo.toolName}: antes y después`}
      description={`${prestamo.model} · Serie ${prestamo.serialNumber} · ${toolRequestStatusLabel(prestamo.status)}`}
      onClose={onCerrar}
      footer={
        <Button variant="secondary" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      <div className={s.comparar}>
        <Lado
          titulo="Antes"
          fotos={prestamo.deliveryPhotos}
          datos={[
            prestamo.deliveryDate ? `Salió el ${fechaHora(prestamo.deliveryDate)}` : "Todavía no se entrega",
            prestamo.deliveredByName ? `La entregó ${prestamo.deliveredByName}` : "",
            prestamo.pickedUpByName ? `La recogió ${prestamo.pickedUpByName}` : "",
            prestamo.activityLabel ? `Para ${prestamo.activityLabel}` : "",
          ]}
          vacio={prestamo.deliveryDate ? "Se entregó sin fotos." : "Las fotos se toman al entregar."}
        />
        <Lado
          titulo="Después"
          fotos={prestamo.returnPhotos}
          insignia={
            condicion ? <StatusBadge label={condicion.etiqueta} tone={condicion.tono} size="sm" dot /> : undefined
          }
          datos={[
            devuelto && prestamo.returnDate ? `Volvió el ${fechaHora(prestamo.returnDate)}` : "Sigue fuera del almacén",
            prestamo.receivedByName ? `La recibió ${prestamo.receivedByName}` : "",
          ]}
          nota={prestamo.damageDescription ?? prestamo.returnNotes}
          vacio={
            devuelto
              ? prestamo.returnCondition === "EXTRAVIADA"
                ? "No volvió: no hay foto."
                : "Se recibió sin fotos."
              : "Las fotos se toman al recibirla."
          }
        />
      </div>
    </Modal>
  );
}
