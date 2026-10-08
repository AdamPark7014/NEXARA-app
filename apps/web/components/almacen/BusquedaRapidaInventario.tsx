"use client";

/**
 * Búsqueda rápida de inventario (Adam, 07-10-2026): una sola caja para herramientas,
 * equipo, consumibles y material por medida. Va arriba en Almacén y en Herramientas.
 *
 * - Busca sola 250 ms después de la última tecla.
 * - Enter con un código exacto abre ese resultado: así sirve el lector de códigos, que
 *   teclea el código y un Enter (no espera a la búsqueda pendiente: la hace en ese momento).
 * - Chips por tipo con su conteo. Sin acceso al almacén solo hay herramientas y no se pintan.
 * - Si el servidor todavía no tiene la búsqueda, un aviso y la pantalla sigue; sin permiso,
 *   la caja no se pinta.
 *
 * La lista solo aparece cuando hay algo escrito o se eligió un chip: con la caja vacía la
 * pantalla de abajo se ve igual que siempre.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Alert, FilterChip, FilterChips, SearchInput } from "@/components/base";
import { useUser } from "@/components/UserContext";
import {
  buscarInventario,
  esErrorSinAcceso,
  esMismaPagina,
  hrefParaAbrir,
  mensajeErrorBusqueda,
  quienesLaTienen,
  resultadoParaAbrir,
  type RespuestaBusqueda,
  type ResultadoBusqueda,
} from "@/lib/busqueda-inventario-api";
import { etiquetaTipoArticulo, filtrosVisibles, type TipoBusqueda } from "@/lib/tipos-articulo";
import { IconoTipoArticulo } from "./TipoArticulo";
import s from "./BusquedaRapidaInventario.module.css";

/** Espera tras la última tecla antes de preguntar al servidor. */
export const ESPERA_BUSQUEDA_MS = 250;
const LIMITE = 30;

export type BusquedaRapidaInventarioProps = {
  /** Chip con que abre: TODOS en Almacén, HERRAMIENTA en Herramientas. */
  tipoInicial?: TipoBusqueda;
  /** Texto con que abre (viene de la URL). */
  qInicial?: string;
  /**
   * Toma el foco al montar (solo con ratón; en el teléfono abriría el teclado). Cuando pasa
   * a `false` y la caja está vacía la suelta: así no le quita las lecturas al lector de las
   * pestañas que escuchan el escáner en toda la pantalla.
   */
  autoFocus?: boolean;
  placeholder?: string;
  /**
   * La página abre el resultado por su cuenta (p. ej. cambia de pestaña) y devuelve `true`;
   * si no, se navega a su enlace.
   */
  onAbrir?: (resultado: ResultadoBusqueda, href: string) => boolean | void;
  className?: string;
};

function claveDe(tipo: TipoBusqueda, q: string) {
  return `${tipo}|${q}`;
}

function esAbortado(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { name?: unknown }).name === "AbortError");
}

export default function BusquedaRapidaInventario({
  tipoInicial = "TODOS",
  qInicial = "",
  autoFocus = false,
  placeholder = "Buscar herramienta, equipo o material, o escanear su código…",
  onAbrir,
  className,
}: BusquedaRapidaInventarioProps) {
  const { user } = useUser();
  const token = user?.token ?? "";
  const router = useRouter();
  const pathname = usePathname();
  const listaId = useId();

  const [q, setQ] = useState(qInicial);
  const [tipo, setTipo] = useState<TipoBusqueda>(tipoInicial);
  // Con un chip elegido la lista se enseña aunque no haya texto («lo más reciente de…»).
  const [chipElegido, setChipElegido] = useState(false);
  const [respuesta, setRespuesta] = useState<RespuestaBusqueda | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinAcceso, setSinAcceso] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const controlador = useRef<AbortController | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** De qué consulta es la `respuesta` que hay en pantalla. */
  const claveRespuesta = useRef<string | null>(null);

  const buscar = useCallback(
    async (texto: string, tipoPedido: TipoBusqueda): Promise<RespuestaBusqueda | null> => {
      if (!token) return null;
      controlador.current?.abort();
      const ctrl = new AbortController();
      controlador.current = ctrl;
      setBuscando(true);
      try {
        const r = await buscarInventario(token, { q: texto, tipo: tipoPedido, limite: LIMITE }, ctrl.signal);
        if (ctrl.signal.aborted) return null;
        claveRespuesta.current = claveDe(tipoPedido, texto);
        setRespuesta(r);
        setError(null);
        return r;
      } catch (err) {
        if (ctrl.signal.aborted || esAbortado(err)) return null;
        if (esErrorSinAcceso(err)) setSinAcceso(true);
        else setError(mensajeErrorBusqueda(err));
        return null;
      } finally {
        if (controlador.current === ctrl) {
          controlador.current = null;
          setBuscando(false);
        }
      }
    },
    [token],
  );

  // Busca sola un rato después de la última tecla (también al montar, con la caja vacía:
  // así ya se sabe si hay almacén y cuántos hay de cada tipo).
  useEffect(() => {
    if (!token || sinAcceso) return;
    const texto = q.trim();
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      // Volvió a lo que ya está en pantalla (borró la última letra): no se pregunta otra vez,
      // y el aviso de una búsqueda intermedia que falló ya no aplica.
      if (claveRespuesta.current === claveDe(tipo, texto)) setError(null);
      else void buscar(texto, tipo);
    }, ESPERA_BUSQUEDA_MS);
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = null;
    };
  }, [q, tipo, token, sinAcceso, buscar]);

  useEffect(() => () => controlador.current?.abort(), []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input || typeof document === "undefined") return;
    if (autoFocus) {
      const conRaton = typeof window.matchMedia !== "function" || window.matchMedia("(pointer: fine)").matches;
      const libre = !document.activeElement || document.activeElement === document.body;
      if (conRaton && libre) input.focus({ preventScroll: true });
    } else if (document.activeElement === input && !input.value) {
      input.blur();
    }
  }, [autoFocus]);

  const abrir = useCallback(
    (r: ResultadoBusqueda) => {
      const href = hrefParaAbrir(r);
      if (onAbrir?.(r, href) === true) return;
      // Misma página con otra query: el router no vuelve a montar la vista que lee la URL.
      if (esMismaPagina(href, pathname)) window.location.assign(href);
      else router.push(href);
    },
    [onAbrir, pathname, router],
  );

  const alTeclear = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      const primero = listaRef.current?.querySelector<HTMLAnchorElement>("a");
      if (primero) {
        e.preventDefault();
        primero.focus();
      }
      return;
    }
    if (e.key === "Escape" && q) {
      e.preventDefault();
      setQ("");
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const texto = q.trim();
    if (!texto) return;
    // El lector teclea el código y el Enter de corrido: no se espera a la búsqueda pendiente.
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
    const vigente =
      respuesta && claveRespuesta.current === claveDe(tipo, texto) && !controlador.current
        ? respuesta
        : await buscar(texto, tipo);
    const elegido = vigente ? resultadoParaAbrir(vigente.resultados, texto) : null;
    if (elegido) abrir(elegido);
  };

  /** Flechas dentro de la lista; Esc regresa a la caja. */
  const alTeclearEnLista = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Escape") return;
    const enlaces = Array.from(listaRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
    const i = enlaces.indexOf(document.activeElement as HTMLAnchorElement);
    e.preventDefault();
    if (e.key === "Escape" || (e.key === "ArrowUp" && i <= 0)) {
      inputRef.current?.focus();
      return;
    }
    enlaces[e.key === "ArrowDown" ? Math.min(enlaces.length - 1, i + 1) : i - 1]?.focus();
  };

  const alClic = (e: MouseEvent<HTMLAnchorElement>, r: ResultadoBusqueda) => {
    // Ctrl/Cmd+clic o clic central: que el navegador lo abra en otra pestaña.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    abrir(r);
  };

  if (sinAcceso) return null;

  const texto = q.trim();
  const filtros = filtrosVisibles(respuesta?.incluyeAlmacen ?? false);
  const resultados = respuesta?.resultados ?? [];
  const mostrarLista = (texto !== "" || chipElegido) && !error;
  const total = respuesta ? Math.max(respuesta.conteos[tipo] ?? 0, resultados.length) : 0;
  const etiquetaTipo = tipo === "TODOS" ? null : filtros.find((f) => f.id === tipo)?.etiqueta.toLowerCase();

  return (
    <section className={[s.busqueda, className].filter(Boolean).join(" ")} aria-label="Búsqueda rápida de inventario">
      <div className={s.fila}>
        <SearchInput
          ref={inputRef}
          className={s.caja}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => void alTeclear(e)}
          placeholder={placeholder}
          aria-label="Buscar en el inventario"
          aria-controls={mostrarLista ? listaId : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        {filtros.length > 0 ? (
          <FilterChips ariaLabel="Tipo de artículo" className={s.chips}>
            {filtros.map((f) => (
              <FilterChip
                key={f.id}
                active={tipo === f.id}
                count={respuesta ? respuesta.conteos[f.id] : undefined}
                icon={f.id === "TODOS" ? undefined : <IconoTipoArticulo tipo={f.id} size="sm" />}
                onClick={() => {
                  setTipo(f.id);
                  setChipElegido(true);
                }}
              >
                {f.etiqueta}
              </FilterChip>
            ))}
          </FilterChips>
        ) : null}
      </div>

      {error ? (
        <Alert tone="neutral" dense role="status">
          {error}
        </Alert>
      ) : null}

      {mostrarLista ? (
        <div className={s.panel} id={listaId} aria-busy={buscando || undefined}>
          {resultados.length === 0 ? (
            <p className={s.vacio} role="status">
              {buscando || !respuesta
                ? "Buscando…"
                : texto
                  ? `Sin resultados para “${texto}”${etiquetaTipo ? ` en ${etiquetaTipo}` : ""}`
                  : `No hay ${etiquetaTipo ?? "artículos"} todavía.`}
            </p>
          ) : (
            <>
              <ul className={s.lista} ref={listaRef} onKeyDown={alTeclearEnLista} aria-label="Resultados">
                {resultados.map((r) => (
                  <li key={`${r.origen}-${r.id}`}>
                    <FilaResultado resultado={r} onClick={(e) => alClic(e, r)} />
                  </li>
                ))}
              </ul>
              <p className={s.pie} role="status">
                {total > resultados.length
                  ? `Mostrando ${resultados.length} de ${total}. Escribe más para afinar.`
                  : `${resultados.length} ${resultados.length === 1 ? "resultado" : "resultados"}`}
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function FilaResultado({
  resultado: r,
  onClick,
}: {
  resultado: ResultadoBusqueda;
  onClick: (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const detalle = [r.detalle, r.origen === "herramienta" ? quienesLaTienen(r.piezas) : null].filter(Boolean).join(" · ");
  const cifra = r.existencia
    ? { texto: r.existencia.texto, tono: r.existencia.bajoMinimo ? "warning" : "neutral", title: r.existencia.bajoMinimo ? "Por debajo del mínimo" : undefined }
    : r.estado
      ? { texto: r.estado.texto, tono: r.estado.tono, title: undefined }
      : null;
  return (
    <a className={s.resultado} href={hrefParaAbrir(r)} onClick={onClick}>
      <IconoTipoArticulo tipo={r.tipo} />
      <span className={s.texto}>
        <span className={s.nombre}>
          {r.nombre}
          <span className="ui-sr-only">, {etiquetaTipoArticulo(r.tipo)}</span>
        </span>
        {detalle ? <span className={s.detalle}>{detalle}</span> : null}
      </span>
      <span className={s.lado}>
        {cifra ? (
          <span className={s.cifra} data-tono={cifra.tono} title={cifra.title}>
            {cifra.texto}
          </span>
        ) : null}
        {r.ubicacion ? <span className={s.ubicacion}>{r.ubicacion}</span> : null}
      </span>
    </a>
  );
}
