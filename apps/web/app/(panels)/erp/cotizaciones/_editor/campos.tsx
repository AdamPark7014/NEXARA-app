"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
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
          ? styles.portadaTitulo
          : variante === "celda"
            ? `${styles.celdaInput} ${styles.celdaTexto}`
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
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => moverA(i, -1)}
                    disabled={i === 0}
                    aria-label={`Subir ${etiquetaElemento} ${i + 1}`}
                    title="Subir (Alt+↑)"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => moverA(i, 1)}
                    disabled={i === items.length - 1}
                    aria-label={`Bajar ${etiquetaElemento} ${i + 1}`}
                    title="Bajar (Alt+↓)"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.iconBtnPeligro}`}
                    onClick={() => quitar(i, false)}
                    aria-label={`Quitar ${etiquetaElemento} ${i + 1}`}
                    title="Quitar"
                  >
                    ×
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {editable ? (
        <button type="button" className={styles.agregar} onClick={() => insertarDespues(items.length - 1)}>
          + {etiquetaAgregar}
        </button>
      ) : null}
    </div>
  );
}

/** Una sección del documento, con su número y título como en la propuesta. */
export function Hoja({
  id,
  numero,
  titulo,
  ayuda,
  acciones,
  children,
}: {
  id: string;
  numero: string;
  titulo: string;
  ayuda?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.hoja} aria-labelledby={`${id}-titulo`}>
      <div className={styles.hojaCabeza}>
        <div className={styles.hojaTitulos}>
          <span className={styles.numero} aria-hidden>
            {numero}
          </span>
          <h2 id={`${id}-titulo`} className={styles.tituloSeccion}>
            <span className={styles.soloLector}>{numero} </span>
            {titulo}
          </h2>
          {ayuda ? <p className={styles.ayudaSeccion}>{ayuda}</p> : null}
        </div>
        {acciones ? <div className={styles.hojaAcciones}>{acciones}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Vacío que enseña qué va aquí y ofrece el primer paso. */
export function Vacio({ titulo, children, acciones }: { titulo: string; children: ReactNode; acciones?: ReactNode }) {
  return (
    <div className={styles.vacio}>
      <p className={styles.vacioTitulo}>{titulo}</p>
      <p className={styles.vacioTexto}>{children}</p>
      {acciones ? <div className={styles.hojaAcciones}>{acciones}</div> : null}
    </div>
  );
}
