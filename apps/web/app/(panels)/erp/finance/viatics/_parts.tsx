"use client";

import { useState } from "react";
import { Alert, Badge, Button, DataTable, FilterChip, Input, SearchInput, type Column } from "@/components/base";
import { Money } from "@/components/ui/DataTable";
import type { ViaticoLiquidacion } from "@/lib/viatics-api";
import {
  centavosViatico as centavos,
  frasePartesSuman,
  pesosViatico as dinero,
  type ParteForm,
} from "@/lib/viatics-display";
import s from "./viatics.module.css";

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

export function estatusLabel(estatus?: string | null) {
  const v = estatus || "Pendiente";
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
  const columns: Column<AnalyticsBucket>[] = [
    { key: "name", label: "Concepto", render: (r) => r.name },
    {
      key: "count",
      label: "Registros",
      numeric: true,
      width: 120,
      render: (r) => <span className={s.tenue}>{r.count}</span>,
    },
    { key: "total", label: "Total", numeric: true, width: 160, render: (r) => <Money value={r.total} /> },
  ];
  return (
    <section className={s.desglose}>
      <h3 className={s.desgloseTitulo}>{title}</h3>
      {shown.length === 0 ? (
        <p className={s.sinDatos}>Sin datos en el periodo.</p>
      ) : (
        <>
          <DataTable
            flush
            stickyHeader={false}
            density="compact"
            ariaLabel={title}
            caption={title}
            columns={columns}
            rows={shown}
            rowKey={(r) => r.name}
          />
          {rows.length > limit && (
            <p className={s.desgloseNota}>
              Se muestran los {limit} primeros de {rows.length}. El PDF trae el desglose completo.
            </p>
          )}
        </>
      )}
    </section>
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
        ? `Cuadra: ${frasePartesSuman(partes.length)} ${dinero(totalCent)}.`
        : diferencia > 0
          ? `Faltan ${dinero(diferencia)} por repartir de ${dinero(totalCent)}.`
          : `Sobran ${dinero(-diferencia)}: ${frasePartesSuman(partes.length)} más que el viático.`;

  return (
    <div className={s.repartoEditor}>
      {partes.map((parte, i) => (
        <div key={i} className={s.repartoFila}>
          <Input
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={parte.actividadId}
            onChange={(e) => set(i, "actividadId", e.target.value)}
            placeholder="ID actividad"
            aria-label={`Actividad de la parte ${i + 1}`}
            disabled={disabled}
          />
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={parte.monto}
            onChange={(e) => set(i, "monto", e.target.value)}
            placeholder="0.00"
            aria-label={`Monto de la parte ${i + 1}`}
            disabled={disabled}
            className={s.monto}
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            aria-label={`Quitar la parte ${i + 1}`}
            onClick={() => onChange(partes.filter((_, j) => j !== i))}
          >
            Quitar
          </Button>
        </div>
      ))}

      <div className={s.repartoPie}>
        <Button
          size="sm"
          variant="secondary"
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
          <div className={s.nota}>
            <Alert dense icon={null} tone={diferencia === 0 ? "success" : "warning"}>
              {pista}
            </Alert>
          </div>
        )}
      </div>
      {partes.length === 0 && <span className={s.pista}>{pista}</span>}
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
 * `<label>` de un `Field`: un `<input type="checkbox">` ahí dentro
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
  /** Segunda línea chica: el puesto, el folio de la actividad, el cliente. */
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
    <div className={s.selector}>
      {/* Lo elegido va ARRIBA y siempre visible: responde a «¿a quién le estoy
          dando dinero?», que abajo ya se lo tragó el scroll de la lista. */}
      {elegidos.length > 0 && (
        <div className={s.fichas}>
          {elegidos.map((id) => {
            const elegido = porId.get(id);
            const texto = elegido ? textoDe(elegido) : `#${id}`;
            return (
              <FilterChip
                key={id}
                disabled={disabled}
                removeLabel={`Quitar ${texto}`}
                onRemove={() => alternar(id)}
              >
                {texto}
              </FilterChip>
            );
          })}
        </div>
      )}
      <SearchInput
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder={placeholder}
        aria-label={`Buscar ${etiqueta}`}
        disabled={disabled}
      />
      <div className={s.listaOpciones} role="group" aria-label={`Lista de ${etiqueta}`}>
        {visibles.length === 0 ? (
          <div className={s.selectorVacio}>{q ? "Nada coincide con lo que buscaste." : vacio}</div>
        ) : (
          visibles.map((o) => {
            const elegida = elegidos.includes(o.id);
            const detalle = detalleDe?.(o);
            return (
              <button
                key={o.id}
                type="button"
                className={s.opcion}
                aria-pressed={elegida}
                disabled={disabled}
                onClick={() => alternar(o.id)}
              >
                <span aria-hidden="true" className={s.opcionMarca}>
                  {elegida ? "✓" : ""}
                </span>
                <span className={s.opcionTexto}>
                  <span className={s.opcionNombre}>{textoDe(o)}</span>
                  {detalle ? <span className={s.opcionDetalle}>{detalle}</span> : null}
                </span>
              </button>
            );
          })
        )}
      </div>
      {filtradas.length > visibles.length && (
        <span className={s.selectorNota}>
          Se ven {visibles.length} de {filtradas.length}. Escribe arriba para acotar.
        </span>
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
      <span className={s.etiqueta}>Anticipo</span>
      <div className={s.cifrasAnticipo}>
        <span>
          Entregado <strong><Money value={entregado} /></strong>
        </span>
        <span>
          Comprobado{" "}
          <strong>{comprobado == null ? "—" : <Money value={comprobado} />}</strong>
        </span>
        {saldo != null && (
          <span>
            Saldo <strong><Money value={Math.abs(saldo)} /></strong>
          </span>
        )}
      </div>
      <div className={s.nota}>
        <Alert
          dense
          icon={null}
          tone={estado === "CUADRADO" ? "success" : estado === "SIN_COMPROBAR" ? "neutral" : "warning"}
        >
          {texto}
        </Alert>
      </div>
    </div>
  );
}

/** La cadena de autorización: quién, con qué papel, cuándo y qué escribió. */
export function ApprovalTrail({ trail, step }: { trail: ApprovalTrailEntry[]; step?: number }) {
  return (
    <div>
      <span className={s.etiqueta}>Cadena de autorización</span>
      {trail.length === 0 ? (
        <div className={s.cadenaVacia}>
          — Nadie la ha revisado todavía{typeof step === "number" ? ` (paso ${step})` : ""}.
        </div>
      ) : (
        <ol className={s.cadena}>
          {trail.map((entry, i) => (
            <li key={`${entry.at ?? i}-${entry.userId ?? i}`} className={s.cadenaItem}>
              <Badge dot size="sm" tone={entry.action === "reject" ? "danger" : "success"}>
                {trailActionLabel(entry.action)}
              </Badge>
              <span className={s.cadenaTexto}>
                {entry.userName ?? (entry.userId ? `usuario #${entry.userId}` : "—")}
                {entry.role ? ` · ${humanRole(entry.role)}` : ""}
                {" · "}
                {formatFechaHora(entry.at)}
                {entry.note ? <span className={s.cadenaNota}>“{entry.note}”</span> : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
