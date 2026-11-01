"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ManageSearchRoundedIcon from "@mui/icons-material/ManageSearchRounded";
import { Badge, Button, Input } from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import {
  buscarClientesParecidos,
  createSalesClient,
  type ClienteParecido,
  type SalesClient,
} from "@/lib/sales-api";
import styles from "./ClienteRapido.module.css";

type PayloadAlta = Parameters<typeof createSalesClient>[1];

/** Dos letras para el círculo: «BUAP» → BU, «Grupo Dice» → GD. */
function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  const letras = palabras.length > 1 ? palabras[0][0] + palabras[1][0] : (palabras[0] ?? "").slice(0, 2);
  return letras.toUpperCase();
}

const NOMBRE_TIPO: Record<ClienteParecido["tipos"][number], string> = {
  COMERCIAL: "Comercial",
  PROYECTO: "Proyecto",
  CORPORATIVO: "Corporativo",
};

const comparable = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/**
 * El alta con su aviso: pregunta si ya existe y, si se parece a otro, deja decidir. Lo usan el
 * selector de cliente, la cotización, «Asignar con IA» y «Nuevo cliente». El servidor vuelve a
 * revisar: un nombre casi seguro repetido no entra sin `confirmarNuevo`.
 */
export function useAltaCliente({
  token,
  armar,
  onListo,
  razonSocial,
  rfc,
}: {
  token: string | null;
  /** El cuerpo del alta para ese nombre (tipo, alta rápida o de proyecto). */
  armar: (nombre: string) => PayloadAlta;
  onListo: (cliente: SalesClient, opciones: { reutilizado: boolean }) => void;
  razonSocial?: string;
  rfc?: string;
}) {
  const [aviso, setAviso] = useState<{ nombre: string; parecidos: ClienteParecido[] } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crear = useCallback(
    async (payload: PayloadAlta, reutilizado = false) => {
      if (!token) return;
      setOcupado(true);
      setError(null);
      try {
        const cliente = await createSalesClient(token, payload);
        setAviso(null);
        onListo(cliente, { reutilizado });
      } catch (e) {
        setError(formatApiError(e, "No se pudo crear el cliente"));
      } finally {
        setOcupado(false);
      }
    },
    [token, onListo],
  );

  /** Primero revisa; si nada se parece, crea de una vez. */
  const pedir = useCallback(
    async (nombre: string) => {
      const limpio = nombre.trim();
      if (!token || limpio.length < 2) return;
      setOcupado(true);
      setError(null);
      setAviso(null);
      // Si la revisión falla no se detiene a nadie: el servidor rechaza lo casi seguro repetido.
      const parecidos = await buscarClientesParecidos(token, { nombre: limpio, razonSocial, rfc }).catch(() => []);
      if (parecidos.length) {
        setAviso({ nombre: limpio, parecidos });
        setOcupado(false);
        return;
      }
      await crear(armar(limpio));
    },
    [token, armar, crear, razonSocial, rfc],
  );

  const usar = useCallback(
    (p: ClienteParecido) => {
      const base = armar(p.nombre);
      // «Usar este» no manda datos nuevos: solo trae al cliente, con las reglas de acceso de siempre.
      return crear({ ...base, name: p.nombre, reutilizarId: p.id }, true);
    },
    [armar, crear],
  );

  const crearOtro = useCallback(() => {
    if (aviso) void crear({ ...armar(aviso.nombre), confirmarNuevo: true });
  }, [aviso, armar, crear]);

  const descartar = useCallback(() => {
    setAviso(null);
    setError(null);
  }, []);

  return { aviso, ocupado, error, pedir, usar, crearOtro, descartar };
}

/** «¿Ya existe?»: los parecidos, usar uno o crear otro de todos modos. */
export function AvisoParecidos({
  nombre,
  parecidos,
  ocupado,
  onUsar,
  onCrearOtro,
  onCancelar,
}: {
  nombre: string;
  parecidos: ClienteParecido[];
  ocupado?: boolean;
  onUsar: (p: ClienteParecido) => void;
  onCrearOtro: () => void;
  onCancelar?: () => void;
}) {
  return (
    <div className={styles.aviso} role="group" aria-label="Clientes parecidos">
      <div className={styles.avisoCabeza}>
        <span className={styles.avisoIcono} aria-hidden>
          <ManageSearchRoundedIcon fontSize="small" />
        </span>
        <div>
          <p className={styles.avisoTitulo}>¿Ya existe este cliente?</p>
          <p className={styles.avisoSub}>«{nombre}» se parece a:</p>
        </div>
      </div>
      <ul className={styles.avisoLista}>
        {parecidos.map((p) => (
          <li key={p.id} className={styles.avisoFila}>
            <span className={styles.inicial} aria-hidden>
              {iniciales(p.nombre)}
            </span>
            <span className={styles.avisoCliente}>
              <strong>{p.nombre}</strong>
              <small>
                {p.razonSocial && p.razonSocial !== p.nombre ? `${p.razonSocial} · ` : ""}
                {p.porque}
                {p.tipos.length ? ` · ${p.tipos.map((t) => NOMBRE_TIPO[t]).join(", ")}` : ""}
              </small>
            </span>
            {p.puedeUsar ? (
              <Button variant="tonal" size="sm" disabled={ocupado} onClick={() => onUsar(p)}>
                Usar {p.nombre.length > 22 ? "este" : p.nombre}
              </Button>
            ) : (
              <small className={styles.sinAcceso}>Pide a coordinación que te dé acceso</small>
            )}
          </li>
        ))}
      </ul>
      <div className={styles.avisoPie}>
        <Button variant="tertiary" size="sm" loading={ocupado} onClick={onCrearOtro}>
          Crear otro de todos modos
        </Button>
        {onCancelar ? (
          <Button variant="link" size="sm" disabled={ocupado} onClick={onCancelar}>
            Seguir buscando
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Mientras se escribe: los que se parecen, sin gastar IA. Espera a que se deje de teclear. */
export function useParecidosEnVivo(token: string | null, texto: string, activo: boolean): ClienteParecido[] {
  const [parecidos, setParecidos] = useState<ClienteParecido[]>([]);
  const turno = useRef(0);
  const limpio = texto.trim();
  useEffect(() => {
    const mio = ++turno.current;
    if (!token || !activo || limpio.length < 3) {
      setParecidos([]);
      return;
    }
    const t = setTimeout(() => {
      buscarClientesParecidos(token, { nombre: limpio, soloCodigo: true })
        .then((r) => mio === turno.current && setParecidos(r))
        .catch(() => mio === turno.current && setParecidos([]));
    }, 350);
    return () => clearTimeout(t);
  }, [token, limpio, activo]);
  return parecidos;
}

type Opcion =
  | { tipo: "cliente"; id: number; nombre: string; detalle?: string; cliente: SalesClient }
  | { tipo: "parecido"; id: number; nombre: string; detalle: string; parecido: ClienteParecido }
  | { tipo: "crear"; id: "crear"; nombre: string };

/**
 * Selector de cliente: un solo campo para buscar o escribir. Si no está, se crea con el nombre
 * (lo demás se completa después; en Clientes queda bajo «Sin RFC»); si se parece a otro, avisa.
 */
export function ClienteRapido({
  token,
  clientes,
  salesClientId,
  editable,
  puedeCrear,
  armar,
  onElegido,
  placeholder = "Buscar o escribir cliente",
  ariaLabel = "Cliente",
  inputId,
  autoFocus,
  pie,
}: {
  token: string | null;
  clientes: SalesClient[];
  salesClientId: number | null;
  editable: boolean;
  puedeCrear: boolean;
  /** El cuerpo del alta para ese nombre. */
  armar: (nombre: string) => PayloadAlta;
  /** `enLista`: ya venía en `clientes`; si no, hay que sumarlo (recién creado o traído del aviso). */
  onElegido: (cliente: SalesClient, opciones: { enLista: boolean }) => void | Promise<void>;
  placeholder?: string;
  ariaLabel?: string;
  inputId?: string;
  autoFocus?: boolean;
  /** Lo que va abajo cuando ya hay cliente (completar datos). */
  pie?: ReactNode;
}) {
  const elegido = clientes.find((c) => c.id === salesClientId) ?? null;
  const [texto, setTexto] = useState(elegido?.name ?? "");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [recienCreado, setRecienCreado] = useState<number | null>(null);
  const listaId = useId();
  const conocidos = useRef(new Set<number>());
  conocidos.current = new Set(clientes.map((c) => c.id));

  // Si desde afuera cambia el cliente elegido (o llegó la lista), el campo lo enseña.
  useEffect(() => {
    if (elegido) setTexto(elegido.name);
  }, [elegido?.id, elegido?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const onListo = useCallback(
    (cliente: SalesClient, { reutilizado }: { reutilizado: boolean }) => {
      const enLista = conocidos.current.has(cliente.id);
      if (!enLista && !reutilizado) setRecienCreado(cliente.id);
      setTexto(cliente.name);
      setAbierto(false);
      void onElegido(cliente, { enLista });
    },
    [onElegido],
  );
  const alta = useAltaCliente({ token, armar, onListo });

  const consulta = comparable(texto);
  const hayExacto = clientes.some((c) => comparable(c.name) === consulta || comparable(c.legalName) === consulta);
  const conTexto = Boolean(consulta) && !(elegido && comparable(elegido.name) === consulta);
  const enVivo = useParecidosEnVivo(token, texto, conTexto && !hayExacto && !alta.aviso);

  const opciones = useMemo<Opcion[]>(() => {
    const coincide = clientes.filter(
      (c) => !conTexto || comparable(c.name).includes(consulta) || comparable(c.legalName).includes(consulta),
    );
    const vistos = new Set(coincide.map((c) => c.id));
    const salida: Opcion[] = [
      ...enVivo
        .filter((p) => p.puedeUsar && !vistos.has(p.id))
        .map<Opcion>((p) => ({ tipo: "parecido", id: p.id, nombre: p.nombre, detalle: p.porque, parecido: p })),
      ...coincide.slice(0, 50).map<Opcion>((c) => ({
        tipo: "cliente",
        id: c.id,
        nombre: c.name,
        detalle: c.legalName && c.legalName !== c.name ? c.legalName : undefined,
        cliente: c,
      })),
    ];
    if (puedeCrear && conTexto && consulta.length >= 2 && !hayExacto) {
      salida.push({ tipo: "crear", id: "crear", nombre: texto.trim() });
    }
    return salida;
  }, [clientes, conTexto, consulta, enVivo, hayExacto, puedeCrear, texto]);

  const elegir = (o: Opcion) => {
    setAbierto(false);
    if (o.tipo === "crear") void alta.pedir(o.nombre);
    else if (o.tipo === "cliente") onListo(o.cliente, { reutilizado: true });
    else void alta.usar(o.parecido);
  };

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setActivo((a) => Math.min(opciones.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      // Enter no manda el formulario: elige lo marcado.
      if (abierto && opciones[activo]) {
        e.preventDefault();
        elegir(opciones[activo]);
      } else if (conTexto) {
        e.preventDefault();
      }
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  };

  const mostrar = abierto && editable && opciones.length > 0 && !alta.aviso;

  return (
    <div className={styles.bloque}>
      <div className={styles.combo}>
        <Input
          id={inputId}
          value={texto}
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={ariaLabel}
          role="combobox"
          aria-expanded={mostrar}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-activedescendant={mostrar && opciones[activo] ? `${listaId}-${activo}` : undefined}
          disabled={!editable || alta.ocupado}
          maxLength={200}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onKeyDown={alTeclear}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
            setActivo(0);
            if (alta.aviso || alta.error) alta.descartar();
          }}
        />
        {mostrar ? (
          <ul id={listaId} role="listbox" className={styles.opciones} onMouseDown={(e) => e.preventDefault()}>
            {opciones.map((o, i) => (
              <li
                key={`${o.tipo}-${o.id}`}
                id={`${listaId}-${i}`}
                role="option"
                aria-selected={i === activo}
                className={[styles.opcion, i === activo ? styles.opcionActiva : "", o.tipo === "crear" ? styles.opcionCrear : ""].filter(Boolean).join(" ")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(o);
                }}
                onMouseEnter={() => setActivo(i)}
              >
                {o.tipo === "crear" ? (
                  <>
                    <span className={`${styles.inicial} ${styles.inicialCrear}`} aria-hidden>
                      <AddRoundedIcon fontSize="small" />
                    </span>
                    <span className={styles.opcionTexto}>
                      <span>Crear «{o.nombre}» con solo el nombre</span>
                      <small>Sus datos se completan después en Clientes</small>
                    </span>
                  </>
                ) : (
                  <>
                    <span className={styles.inicial} aria-hidden>
                      {iniciales(o.nombre)}
                    </span>
                    <span className={styles.opcionTexto}>
                      <span>{o.nombre}</span>
                      {o.detalle ? <small>{o.tipo === "parecido" ? `Se parece: ${o.detalle.toLowerCase()}` : o.detalle}</small> : null}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {alta.ocupado && !alta.aviso ? (
        <p className={styles.nota} role="status">
          Revisando si ya existe…
        </p>
      ) : null}
      {alta.aviso ? (
        <AvisoParecidos
          nombre={alta.aviso.nombre}
          parecidos={alta.aviso.parecidos}
          ocupado={alta.ocupado}
          onUsar={(p) => void alta.usar(p)}
          onCrearOtro={alta.crearOtro}
          onCancelar={alta.descartar}
        />
      ) : null}
      {alta.error ? (
        <p className={styles.error} role="alert">
          {alta.error}
        </p>
      ) : null}
      {elegido && recienCreado === elegido.id && !elegido.taxId ? (
        <Badge tone="warning" size="sm" className={styles.marca}>
          Cliente nuevo · sin RFC
        </Badge>
      ) : null}
      {pie}
    </div>
  );
}
