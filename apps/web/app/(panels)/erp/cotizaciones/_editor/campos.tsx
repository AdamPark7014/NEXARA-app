"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Button, EmptyState } from "@/components/base";
import { mover, nuevaClave, type ItemTexto } from "@/lib/cotizacion-documento";
import styles from "./editor.module.css";

// useLayoutEffect avisa en el servidor; en el cliente mide antes de pintar.
const useMedirLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

type TextoAutoProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
  value: string;
  onValor: (valor: string) => void;
  variante?: "texto" | "titulo" | "campo" | "portada" | "celda";
};

/** Textarea que crece con lo que se escribe: se lee como un párrafo del documento. */
export const TextoAuto = forwardRef<HTMLTextAreaElement, TextoAutoProps>(function TextoAuto(
  { value, onValor, variante = "texto", className, rows = 1, ...resto },
  ref,
) {
  const interno = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => interno.current as HTMLTextAreaElement);

  useMedirLayout(() => {
    const el = interno.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);

  const clase =
    variante === "titulo"
      ? styles.textoTitulo
      : variante === "campo"
        ? styles.textoCampo
        : variante === "portada"
          ? `${styles.textoTitulo} ${styles.textoProyecto}`
          : variante === "celda"
            ? `${styles.celda} ${styles.celdaTexto}`
            : styles.texto;

  return (
    <textarea
      ref={interno}
      rows={rows}
      className={[clase, className].filter(Boolean).join(" ")}
      value={value}
      onChange={(e) => onValor(e.target.value)}
      {...resto}
    />
  );
});

/**
 * Lista editable (beneficios numerados, viñetas).
 *
 * Teclado: Enter crea el siguiente renglón · Retroceso en un renglón vacío lo quita · Alt+↑/↓ lo mueve.
 */
export function ListaEditable({
  items,
  onCambio,
  numerada,
  editable,
  placeholder,
  etiquetaAgregar,
  etiquetaElemento,
}: {
  items: ItemTexto[];
  onCambio: (items: ItemTexto[]) => void;
  numerada: boolean;
  editable: boolean;
  placeholder: string;
  etiquetaAgregar: string;
  /** «beneficio», «viñeta»: para los nombres accesibles de los botones. */
  etiquetaElemento: string;
}) {
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const enfocar = useRef<string | null>(null);

  useEffect(() => {
    if (!enfocar.current) return;
    const el = refs.current.get(enfocar.current);
    enfocar.current = null;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  const cambiar = useCallback(
    (i: number, texto: string) => onCambio(items.map((it, j) => (j === i ? { ...it, texto } : it))),
    [items, onCambio],
  );

  const insertarDespues = (i: number) => {
    const nuevo = { key: nuevaClave("i"), texto: "" };
    enfocar.current = nuevo.key;
    onCambio([...items.slice(0, i + 1), nuevo, ...items.slice(i + 1)]);
  };

  const quitar = (i: number, enfocarAnterior: boolean) => {
    if (enfocarAnterior && i > 0) enfocar.current = items[i - 1]!.key;
    onCambio(items.filter((_, j) => j !== i));
  };

  const moverA = (i: number, delta: number) => {
    const destino = i + delta;
    if (destino < 0 || destino >= items.length) return;
    enfocar.current = items[i]!.key;
    onCambio(mover(items, i, destino));
  };

  const alTeclear = (i: number) => (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      insertarDespues(i);
      return;
    }
    if (e.key === "Backspace" && !items[i]!.texto) {
      e.preventDefault();
      quitar(i, true);
      return;
    }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      moverA(i, e.key === "ArrowUp" ? -1 : 1);
    }
  };

  return (
    <div>
      {items.length ? (
        <ol className={styles.lista}>
          {items.map((item, i) => (
            <li key={item.key} className={styles.listaItem}>
              <span className={numerada ? styles.marcador : `${styles.marcador} ${styles.marcadorVineta}`} aria-hidden>
                {numerada ? `${i + 1}.` : "•"}
              </span>
              <TextoAuto
                ref={(el) => {
                  if (el) refs.current.set(item.key, el);
                  else refs.current.delete(item.key);
                }}
                value={item.texto}
                onValor={(v) => cambiar(i, v.replace(/\n/g, " "))}
                onKeyDown={alTeclear(i)}
                placeholder={placeholder}
                aria-label={`${etiquetaElemento} ${i + 1}`}
                disabled={!editable}
              />
              {editable ? (
                <span className={styles.controles}>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon
                    onClick={() => moverA(i, -1)}
                    disabled={i === 0}
                    aria-label={`Subir ${etiquetaElemento} ${i + 1}`}
                    title="Subir (Alt+↑)"
                  >
                    <KeyboardArrowUpRoundedIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon
                    onClick={() => moverA(i, 1)}
                    disabled={i === items.length - 1}
                    aria-label={`Bajar ${etiquetaElemento} ${i + 1}`}
                    title="Bajar (Alt+↓)"
                  >
                    <KeyboardArrowDownRoundedIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="danger-ghost"
                    size="sm"
                    icon
                    onClick={() => quitar(i, false)}
                    aria-label={`Quitar ${etiquetaElemento} ${i + 1}`}
                    title="Quitar"
                  >
                    <CloseRoundedIcon aria-hidden="true" />
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {editable ? (
        <Button variant="tonal" size="sm" className={styles.agregar} onClick={() => insertarDespues(items.length - 1)}>
          + {etiquetaAgregar}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Ayuda en un ⓘ: la explicación existe, pero no ocupa la pantalla. Se abre al hacer clic y se
 * cierra con Escape o al hacer clic fuera.
 */
export function Ayuda({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierta]);
  return (
    <span
      className={styles.ayuda}
      ref={caja}
      onKeyDown={(e) => {
        if (e.key === "Escape") setAbierta(false);
      }}
    >
      <button
        type="button"
        className={styles.ayudaBtn}
        aria-label={`Qué es ${titulo}`}
        aria-expanded={abierta}
        onClick={() => setAbierta((v) => !v)}
      >
        <InfoOutlinedIcon aria-hidden="true" />
      </button>
      {abierta ? (
        <span role="note" className={styles.ayudaGlobo}>
          {children}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Una sección del documento, con la misma cabecera que las secciones de formulario del sistema:
 * número en su pastilla, título, una línea que dice qué va ahí y —si hace falta— un ⓘ con la
 * explicación; acciones secundarias a la derecha. `data-seccion` es lo que usa la vista previa
 * para saber dónde está el cursor.
 */
export function Hoja({
  id,
  numero,
  titulo,
  icono,
  descripcion,
  ayuda,
  acciones,
  children,
  excluida,
  onIncluir,
}: {
  id: string;
  /** «01»…«04»; vacío en la portada. */
  numero: string;
  titulo: string;
  /** Lo que va en la pastilla cuando la sección no lleva número (portada). */
  icono?: ReactNode;
  /** Qué se captura aquí, en una línea («Proyecto, cliente y datos fiscales»). */
  descripcion?: ReactNode;
  ayuda?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  /** Apagada en «Personalizar»: se ve la cabecera y cómo volver a incluirla. */
  excluida?: boolean;
  onIncluir?: () => void;
}) {
  const marca = (
    <span className={styles.numero} aria-hidden>
      {numero || icono || "·"}
    </span>
  );
  if (excluida) {
    return (
      <section id={id} data-seccion={id} className={`${styles.hoja} ${styles.hojaExcluida}`} aria-labelledby={`${id}-titulo`}>
        <div className={`${styles.hojaCabeza} ${styles.hojaCabezaSola}`}>
          {marca}
          <div className={styles.hojaTitulos}>
            <div className={styles.hojaLinea}>
              <h2 id={`${id}-titulo`} className={styles.tituloSeccion}>
                {numero ? <span className={styles.soloLector}>{numero}. </span> : null}
                {titulo}
              </h2>
            </div>
            <p className={styles.ayudaSeccion}>No va en el PDF de esta cotización (Personalizar).</p>
          </div>
          {onIncluir ? (
            <div className={styles.hojaAcciones}>
              <Button size="sm" onClick={onIncluir}>
                Incluir
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    );
  }
  return (
    <section id={id} data-seccion={id} className={styles.hoja} aria-labelledby={`${id}-titulo`}>
      <div className={styles.hojaCabeza}>
        {marca}
        <div className={styles.hojaTitulos}>
          <div className={styles.hojaLinea}>
            <h2 id={`${id}-titulo`} className={styles.tituloSeccion}>
              {numero ? <span className={styles.soloLector}>{numero}. </span> : null}
              {titulo}
            </h2>
            {ayuda ? <Ayuda titulo={titulo}>{ayuda}</Ayuda> : null}
          </div>
          {descripcion ? <p className={styles.ayudaSeccion}>{descripcion}</p> : null}
        </div>
        {acciones ? <div className={styles.hojaAcciones}>{acciones}</div> : null}
      </div>
      <div className={styles.hojaCuerpo}>{children}</div>
    </section>
  );
}

/**
 * Campo del documento: etiqueta arriba, el control (los de `components/base`) y la pista o el
 * error debajo. La etiqueta solo nombra al control: la pista no se pega al nombre accesible.
 */
export function Campo({
  etiqueta,
  htmlFor,
  pista,
  error,
  ancho,
  className,
  children,
}: {
  etiqueta: ReactNode;
  /** `id` del control; sin él la etiqueta es solo un rótulo (valores fijos, grupos). */
  htmlFor?: string;
  pista?: ReactNode;
  error?: ReactNode;
  /** Ocupa todo el renglón de la rejilla. */
  ancho?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={[styles.campo, ancho ? styles.campoAncho : "", className].filter(Boolean).join(" ")}>
      {htmlFor ? (
        <label className={styles.etiqueta} htmlFor={htmlFor}>
          {etiqueta}
        </label>
      ) : (
        <span className={styles.etiqueta}>{etiqueta}</span>
      )}
      {children}
      {error ? (
        <p className={styles.pistaError} role="alert">
          {error}
        </p>
      ) : pista ? (
        <p className={styles.pista}>{pista}</p>
      ) : null}
    </div>
  );
}

/** Control segmentado tranquilo (segmento, validez rápida): una opción activa, flechas para moverse. */
export function Segmentado<V extends string>({
  opciones,
  valor,
  onValor,
  etiqueta,
  deshabilitado,
  chico,
}: {
  opciones: Array<{ valor: V; etiqueta: string }>;
  valor: V | null;
  onValor: (v: V) => void;
  etiqueta: string;
  deshabilitado?: boolean;
  chico?: boolean;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activo = Math.max(0, opciones.findIndex((o) => o.valor === valor));
  const alTeclear = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const siguiente = (i + delta + opciones.length) % opciones.length;
    const opcion = opciones[siguiente];
    if (!opcion) return;
    onValor(opcion.valor);
    refs.current[siguiente]?.focus();
  };
  return (
    <div className={`${styles.segmentado} ${chico ? styles.segmentadoChico : ""}`} role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o, i) => {
        const on = o.valor === valor;
        return (
          <button
            key={o.valor}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === activo ? 0 : -1}
            className={`${styles.segmentadoOpcion} ${on ? styles.segmentadoOn : ""}`}
            disabled={deshabilitado}
            onClick={() => onValor(o.valor)}
            onKeyDown={(e) => alTeclear(e, i)}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

/** Vacío que enseña qué va aquí y ofrece el primer paso (el vacío del sistema, en compacto). */
export function Vacio({ titulo, children, acciones }: { titulo: string; children: ReactNode; acciones?: ReactNode }) {
  return <EmptyState size="compact" tone="neutral" className={styles.vacio} title={titulo} description={children} action={acciones} />;
}
