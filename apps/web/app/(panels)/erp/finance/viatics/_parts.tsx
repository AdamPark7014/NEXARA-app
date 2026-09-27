"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Button from "@/components/ui/Button";
import StatusDot from "@/components/ui/StatusDot";
import FileDropzone from "@/components/ui/FileDropzone";
import { Money } from "@/components/ui/DataTable";
import { financeInputStyle } from "@/components/finance/FinanceModuleShell";
import type { ViaticoLiquidacion } from "@/lib/viatics-api";
import {
  centavosViatico as centavos,
  pesosViatico as dinero,
  type ParteForm,
} from "@/lib/viatics-display";

/** Entrada de `approvalTrail` (JSON en la API). Todo opcional: es Json, no un contrato duro. */
export type ApprovalTrailEntry = {
  role?: string;
  userId?: number;
  userName?: string;
  action?: string;
  at?: string;
  note?: string;
};

export type AnalyticsBucket = { name: string; total: number; count: number };

/* ── Estilos locales del contrato de diseño (.ai/DISENO-FINANZAS.md) ──────── */

/** Regla 2: las acciones de fila no deben engordar el renglón. */
export const rowButtonStyle: CSSProperties = { height: 28, fontSize: 12, padding: "0 9px" };
export const choiceLabelStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--text-secondary)",
  display: "block",
  marginBottom: 6,
};
const breakdownPanelStyle: CSSProperties = {
  padding: 14,
  border: "1px solid var(--nx-panel-hairline, var(--border))",
  borderRadius: 10,
  background: "var(--surface-2, var(--surface))",
};
const breakdownTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  marginBottom: 10,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-tertiary)",
};
const srOnlyStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
};
/** Ficha de lo ya elegido. Baja para que ocho seguidas no sean un muro. */
const chipStyle: CSSProperties = { height: 24, fontSize: 11.5, padding: "0 8px" };
/**
 * La lista de opciones de un selector múltiple.
 *
 * Un solo borde, el de un control —igual que el buscador que lleva encima—, no
 * una tarjeta con su relleno: regla 9, ni una caja dentro de otra caja.
 */
const listaOpcionesStyle: CSSProperties = {
  maxHeight: 176,
  overflowY: "auto",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface)",
};
/**
 * Fila de opción. Lo elegido se marca con la paloma y con la superficie
 * hundida, nunca con color: un renglón seleccionado no es un estado que pida
 * acción (regla 6).
 */
const opcionStyle = (elegida: boolean, conLinea: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  width: "100%",
  textAlign: "left",
  padding: "7px 10px",
  border: "none",
  borderTop: conLinea ? "1px solid color-mix(in srgb, var(--border) 55%, transparent)" : "none",
  background: elegida ? "var(--surface-2, var(--surface))" : "transparent",
  color: "var(--text-primary)",
  font: "inherit",
  fontSize: 12.5,
  lineHeight: 1.35,
  cursor: "pointer",
});

/* ── Etiquetas ──────────────────────────────────────────────────────────── */

const CATEGORIA_LABEL: Record<string, string> = {
  COMBUSTIBLE: "Combustible",
  CASETA: "Casetas",
  HOSPEDAJE: "Hospedaje",
  ALIMENTACION: "Alimentación",
  TRANSPORTE: "Transporte",
  OTROS: "Otros",
};

export function categoriaLabel(c?: string | null) {
  if (!c) return "";
  return CATEGORIA_LABEL[c] ?? c;
}

const ESTATUS_LABEL: Record<string, string> = {
  Aprobado_Coordinador: "Aprobado por coordinador",
};

export function estatusLabel(s?: string | null) {
  const v = s || "Pendiente";
  return ESTATUS_LABEL[v] ?? v.replace(/_/g, " ");
}

/* ── Helpers de la cadena de autorización ───────────────────────────────── */

function formatFechaHora(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function trailActionLabel(action?: string) {
  if (action === "approve") return "Aprobó";
  if (action === "reject") return "Rechazó";
  return "Revisó";
}

function humanRole(role?: string) {
  if (!role) return "";
  return role.replace(/_/g, " ");
}

/* ── Componentes ────────────────────────────────────────────────────────── */

/** Desglose de analytics como tabla real: son datos tabulares, no una lista pintada. */
export function BreakdownTable({
  title,
  rows,
  limit = 10,
}: {
  title: string;
  rows: AnalyticsBucket[];
  limit?: number;
}) {
  const shown = rows.slice(0, limit);
  const cellBorder = (i: number) =>
    i === shown.length - 1 ? "none" : "1px solid color-mix(in srgb, var(--border) 55%, transparent)";
  return (
    <div style={breakdownPanelStyle}>
      <div style={breakdownTitleStyle}>{title}</div>
      {shown.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Sin datos en el periodo.</div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <caption style={srOnlyStyle}>{title}</caption>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: "left", fontWeight: 600, color: "var(--text-tertiary)", fontSize: 11, paddingBottom: 4 }}>
                  Concepto
                </th>
                <th scope="col" style={{ textAlign: "right", fontWeight: 600, color: "var(--text-tertiary)", fontSize: 11, paddingBottom: 4 }}>
                  Registros
                </th>
                <th scope="col" style={{ textAlign: "right", fontWeight: 600, color: "var(--text-tertiary)", fontSize: 11, paddingBottom: 4 }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.name}>
                  <th scope="row" style={{ textAlign: "left", fontWeight: 400, padding: "6px 8px 6px 0", borderBottom: cellBorder(i) }}>
                    {r.name}
                  </th>
                  <td
                    style={{
                      textAlign: "right",
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      fontVariantNumeric: "tabular-nums",
                      padding: "6px 12px",
                      borderBottom: cellBorder(i),
                    }}
                  >
                    {r.count}
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", padding: "6px 0", borderBottom: cellBorder(i) }}>
                    <Money value={r.total} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > limit && (
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>
              Se muestran los {limit} primeros de {rows.length}. El PDF trae el desglose completo.
            </div>
          )}
        </>
      )}
    </div>
  );
}

const parteVacia = (): ParteForm => ({ actividadId: "", monto: "", nota: "" });

/**
 * Reparto del gasto entre varias actividades.
 *
 * El viaje a Tehuacán cubrió dos servicios de clientes distintos: la gasolina es
 * una, el costo son dos. Mientras se captura, la pista de abajo dice cuánto
 * falta o sobra, porque descubrirlo al guardar es descubrirlo tarde. El
 * servidor vuelve a comprobarlo: esto es ayuda, no la regla.
 */
export function RepartoEditor({
  partes,
  onChange,
  total,
  disabled,
}: {
  partes: ParteForm[];
  onChange: (partes: ParteForm[]) => void;
  total: number;
  disabled?: boolean;
}) {
  const totalCent = centavos(total);
  const sumaCent = partes.reduce((acc, p) => acc + centavos(p.monto), 0);
  const diferencia = totalCent - sumaCent;

  const set = (i: number, campo: keyof ParteForm, valor: string) =>
    onChange(partes.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)));

  const pista =
    partes.length === 0
      ? "Sin repartir, el gasto entero carga a la actividad de arriba."
      : diferencia === 0
        ? `Cuadra: las ${partes.length} partes suman ${dinero(totalCent)}.`
        : diferencia > 0
          ? `Faltan ${dinero(diferencia)} por repartir de ${dinero(totalCent)}.`
          : `Sobran ${dinero(-diferencia)}: las partes suman más que el viático.`;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {partes.map((parte, i) => (
        <div
          key={i}
          style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) auto", gap: 8, alignItems: "center" }}
        >
          <input
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={parte.actividadId}
            onChange={(e) => set(i, "actividadId", e.target.value)}
            placeholder="ID actividad"
            aria-label={`Actividad de la parte ${i + 1}`}
            disabled={disabled}
            style={financeInputStyle}
          />
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={parte.monto}
            onChange={(e) => set(i, "monto", e.target.value)}
            placeholder="0.00"
            aria-label={`Monto de la parte ${i + 1}`}
            disabled={disabled}
            style={{ ...financeInputStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
          />
          <Button
            size="sm"
            variant="ghost"
            style={rowButtonStyle}
            disabled={disabled}
            aria-label={`Quitar la parte ${i + 1}`}
            onClick={() => onChange(partes.filter((_, j) => j !== i))}
          >
            Quitar
          </Button>
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Button
          size="sm"
          variant="secondary"
          style={rowButtonStyle}
          disabled={disabled}
          onClick={() => {
            // La primera parte se abre con lo que falta: casi siempre el total.
            const pendiente = partes.length === 0 ? totalCent : Math.max(diferencia, 0);
            onChange([
              ...partes,
              { ...parteVacia(), monto: pendiente > 0 ? (pendiente / 100).toFixed(2) : "" },
            ]);
          }}
        >
          Añadir actividad
        </Button>
        {partes.length > 0 && (
          <StatusDot
            wrap
            tone={diferencia === 0 ? "success" : "warning"}
            label={pista}
          />
        )}
      </div>
      {partes.length === 0 && (
        <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{pista}</span>
      )}
    </div>
  );
}

/**
 * Elegir varios de una lista larga, buscando por nombre.
 *
 * Un `<select multiple>` obliga a mantener pulsado ctrl y esconde lo elegido en
 * cuanto la lista hace scroll: con treinta personas se termina asignando
 * dinero a quien no era y nadie lo nota hasta que alguien reclama. Aquí lo
 * elegido se queda arriba, a la vista, en fichas que se quitan con un clic, y
 * buscar solo filtra lo que se muestra — nunca desmarca lo ya elegido.
 *
 * Las opciones son botones y no casillas porque este bloque vive dentro del
 * `<label>` de un `FinanceField`: un `<input type="checkbox">` ahí dentro
 * competiría con el buscador por ser el control de esa etiqueta.
 */
export function SelectorMultiple<T extends { id: number }>({
  opciones,
  elegidos,
  onChange,
  textoDe,
  detalleDe,
  placeholder,
  etiqueta,
  vacio,
  disabled,
  maxVisibles = 40,
}: {
  opciones: T[];
  elegidos: number[];
  onChange: (ids: number[]) => void;
  textoDe: (o: T) => string;
  /** Segunda línea en 11px: el puesto, el folio de la actividad, el cliente. */
  detalleDe?: (o: T) => string | null;
  placeholder: string;
  /** Sustantivo en plural («beneficiarios»): de ahí salen los dos nombres
   *  accesibles, «Buscar beneficiarios» y «Lista de beneficiarios». */
  etiqueta: string;
  /** Qué decir cuando el catálogo llegó vacío. */
  vacio: string;
  disabled?: boolean;
  /** Tope de filas pintadas: la lista es para elegir, no para leerla entera. */
  maxVisibles?: number;
}) {
  const [busqueda, setBusqueda] = useState("");
  const q = busqueda.trim().toLowerCase();
  const filtradas = q
    ? opciones.filter((o) => `${textoDe(o)} ${detalleDe?.(o) ?? ""}`.toLowerCase().includes(q))
    : opciones;
  const visibles = filtradas.slice(0, maxVisibles);
  const porId = new Map(opciones.map((o) => [o.id, o]));
  const alternar = (id: number) =>
    onChange(elegidos.includes(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {/* Lo elegido va ARRIBA y siempre visible: responde a «¿a quién le estoy
          dando dinero?», que abajo ya se lo tragó el scroll de la lista. */}
      {elegidos.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {elegidos.map((id) => {
            const elegido = porId.get(id);
            const texto = elegido ? textoDe(elegido) : `#${id}`;
            return (
              <Button
                key={id}
                size="sm"
                variant="secondary"
                style={chipStyle}
                disabled={disabled}
                aria-label={`Quitar ${texto}`}
                onClick={() => alternar(id)}
              >
                {texto} ×
              </Button>
            );
          })}
        </div>
      )}
      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder={placeholder}
        aria-label={`Buscar ${etiqueta}`}
        disabled={disabled}
        style={financeInputStyle}
      />
      <div style={listaOpcionesStyle} role="group" aria-label={`Lista de ${etiqueta}`}>
        {visibles.length === 0 ? (
          <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-tertiary)" }}>
            {q ? "Nada coincide con lo que buscaste." : vacio}
          </div>
        ) : (
          visibles.map((o, i) => {
            const elegida = elegidos.includes(o.id);
            const detalle = detalleDe?.(o);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={elegida}
                disabled={disabled}
                onClick={() => alternar(o.id)}
                style={opcionStyle(elegida, i > 0)}
              >
                <span aria-hidden="true" style={{ width: 11, flexShrink: 0 }}>
                  {elegida ? "✓" : ""}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block" }}>{textoDe(o)}</span>
                  {detalle ? (
                    <span style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)" }}>
                      {detalle}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })
        )}
      </div>
      {filtradas.length > visibles.length && (
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          Se ven {visibles.length} de {filtradas.length}. Escribe arriba para acotar.
        </span>
      )}
    </div>
  );
}

/**
 * Ticket del viático: arrastrar o elegir archivo en escritorio y, en el
 * teléfono, un botón que abre directo la cámara trasera. Si es imagen se
 * enseña la miniatura para confirmar que el ticket se lee antes de enviarlo.
 */
export function ReceiptCapture({
  file,
  onFile,
  label,
  hint,
  required,
  showCamera,
  disabled,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  label: string;
  hint?: string;
  required?: boolean;
  /** En pantallas angostas: botón «Tomar foto del ticket». */
  showCamera?: boolean;
  disabled?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {showCamera && (
        <>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            disabled={disabled}
            onClick={() => cameraRef.current?.click()}
            style={{ height: 44, fontSize: 14 }}
          >
            Tomar foto del ticket
          </Button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Tomar foto del ticket con la cámara"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </>
      )}
      <FileDropzone file={file} onFile={onFile} label={label} hint={hint} required={required} />
      {file && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Vista previa del ticket"
              style={{
                width: 56,
                height: 56,
                objectFit: "cover",
                borderRadius: 8,
                border: "1px solid var(--border)",
                flexShrink: 0,
              }}
            />
          )}
          <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 0, overflowWrap: "anywhere" }}>
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            style={rowButtonStyle}
            disabled={disabled}
            onClick={() => onFile(null)}
            aria-label="Quitar el ticket adjunto"
          >
            Quitar
          </Button>
        </div>
      )}
    </div>
  );
}

/** Lo entregado, lo comprobado y quién le debe a quién. */
export function LiquidacionResumen({ liquidacion }: { liquidacion?: ViaticoLiquidacion }) {
  if (!liquidacion) return null;
  const { entregado, comprobado, saldo, estado } = liquidacion;
  const texto =
    estado === "SIN_COMPROBAR"
      ? "Todavía nadie entregó tickets contra este anticipo."
      : estado === "CUADRADO"
        ? "Cuadrado: lo comprobado es exactamente lo entregado."
        : estado === "POR_DEVOLVER"
          ? `Sobraron ${dinero(centavos(saldo ?? 0))}: quedan por devolver a la empresa.`
          : `Faltaron ${dinero(centavos(Math.abs(saldo ?? 0)))}: la empresa debe ese reembolso.`;
  return (
    <div>
      <span style={choiceLabelStyle}>Anticipo</span>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontSize: 12.5 }}>
          Entregado <strong style={{ fontVariantNumeric: "tabular-nums" }}><Money value={entregado} /></strong>
        </span>
        <span style={{ fontSize: 12.5 }}>
          Comprobado{" "}
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>
            {comprobado == null ? "—" : <Money value={comprobado} />}
          </strong>
        </span>
        {saldo != null && (
          <span style={{ fontSize: 12.5 }}>
            Saldo <strong style={{ fontVariantNumeric: "tabular-nums" }}><Money value={Math.abs(saldo)} /></strong>
          </span>
        )}
      </div>
      <StatusDot
        wrap
        tone={estado === "CUADRADO" ? "success" : estado === "SIN_COMPROBAR" ? "neutral" : "warning"}
        label={texto}
      />
    </div>
  );
}

/** La cadena de autorización: quién, con qué papel, cuándo y qué escribió. */
export function ApprovalTrail({ trail, step }: { trail: ApprovalTrailEntry[]; step?: number }) {
  return (
    <div>
      <span style={choiceLabelStyle}>Cadena de autorización</span>
      {trail.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          — Nadie la ha revisado todavía{typeof step === "number" ? ` (paso ${step})` : ""}.
        </div>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
          {trail.map((entry, i) => (
            <li key={`${entry.at ?? i}-${entry.userId ?? i}`} style={{ fontSize: 12, lineHeight: 1.45 }}>
              <StatusDot
                wrap
                tone={entry.action === "reject" ? "danger" : "success"}
                label={
                  <span>
                    <strong style={{ fontWeight: 600 }}>{trailActionLabel(entry.action)}</strong>{" "}
                    {entry.userName ?? (entry.userId ? `usuario #${entry.userId}` : "—")}
                    {entry.role ? ` · ${humanRole(entry.role)}` : ""}
                    {" · "}
                    {formatFechaHora(entry.at)}
                    {entry.note ? (
                      <span style={{ display: "block", color: "var(--text-tertiary)" }}>“{entry.note}”</span>
                    ) : null}
                  </span>
                }
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
