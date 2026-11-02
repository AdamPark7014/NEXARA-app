"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  DataTable,
  EmptyState,
  FilterChip,
  FilterChips,
  InfoPopover,
  LinkButton,
  ModulePage,
  ModuleToolbar,
  PersonCell,
  SearchInput,
  Segmented,
  Stat,
  StatRow,
  StatusCell,
  WhenCell,
  statusTone,
  type Column,
  type Tone,
} from "@/components/base";
import { useUser } from "@/components/UserContext";
import {
  ESTADOS,
  obtenerCotizacion,
  SEGMENTOS,
  SEGMENTO_LABEL,
  formatoFecha,
  formatoMoneda,
  listarCotizaciones,
  type CotizacionDetalle,
  type CotizacionRow,
  type EstadoCotizacion,
  type Segmento,
} from "@/lib/cotizaciones-api";
import { partesDelFolio } from "@/lib/cotizacion-folio";
import { formatApiError } from "@/lib/erp-api";
import { diasDesde, medioDeEnvio } from "@/lib/hilo-negocio";
import { DialogoGanada, DialogoPerdida } from "./_editor/ComoTermino";
import FolioExplicado from "./_editor/FolioExplicado";
import styles from "./cotizaciones-core.module.css";

const ROL: Record<string, string> = {
  ELABORO: "Elaboró",
  LEVANTAMIENTO: "Levantamiento",
  REVISO: "Revisó",
  APROBO: "Aprobó",
  ENVIO: "Envió",
};

const DIA = 24 * 60 * 60 * 1000;

/** En el orden en que se trabajan: lo que espera respuesta va primero. */
const FILTROS_DE_ESTADO: Array<{ id: EstadoCotizacion; label: string }> = [
  { id: "ENVIADA", label: "Por decidir" },
  { id: "BORRADOR", label: "Por enviar" },
  { id: "APROBADA", label: "Ganadas" },
  { id: "RECHAZADA", label: "Perdidas" },
  { id: "VENCIDA", label: "Vencidas" },
];

function hace(dias: number | null): string {
  if (dias === null) return "—";
  if (dias === 0) return "Hoy";
  if (dias === 1) return "1 día";
  return `${dias} días`;
}

function medioConMayuscula(enviadaPor?: string | null): string {
  const medio = medioDeEnvio(enviadaPor);
  return medio ? medio[0]!.toUpperCase() + medio.slice(1) : "—";
}

/** El folio con sus piezas: clave de quien la hizo, cadena y revisión. */
function FolioColor({ folio }: { folio: string }) {
  const partes = partesDelFolio(folio);
  if (!partes) return <span className={`${styles.folio} ${styles.folioViejo}`}>{folio}</span>;
  return (
    <span className={styles.folio} title={folio}>
      NEX-<span className={styles.folioClave}>{partes.nomenclatura}</span>-{String(partes.consecutivo).padStart(4, "0")}
      {partes.cadena.length ? (
        <>
          -<span className={styles.folioCadena}>{partes.cadena.join(".")}</span>
        </>
      ) : null}
      {partes.revision > 1 ? (
        <>
          -<span className={styles.folioRevision}>R{partes.revision}</span>
        </>
      ) : null}
    </span>
  );
}

/** «Luis Joel Aguilar · su #7 · R2»: el folio en palabras, corto para la fila. */
function folioEnPalabras(row: CotizacionRow): string {
  const partes = partesDelFolio(row.folio);
  if (!partes) return row.elaboro?.nombre ? `Hecha por ${row.elaboro.nombre}` : "Sin autor registrado";
  return [
    row.elaboro?.nombre || `Clave ${partes.nomenclatura}`,
    `su #${partes.consecutivo}`,
    partes.revision > 1 ? `revisión ${partes.revision}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Quién intervino, en orden y sin repetir (sus siglas, con el rol al pasar el mouse). Quien la hizo ya
 * va con nombre y foto en la misma celda: si nadie más quedó registrado, no se repite.
 */
function Intervinieron({ row }: { row: CotizacionRow }) {
  const vistas = new Map<string, string[]>();
  for (const p of row.intervinieron) {
    // Quien la elaboró ya sale con nombre y foto; sus siglas solo se repiten si hizo algo más.
    if (!p.siglas || (p.rol === "ELABORO" && p.siglas === row.elaboro?.siglas)) continue;
    const titulo = `${p.nombre || p.siglas} · ${ROL[p.rol] ?? p.rol}`;
    vistas.set(p.siglas, [...(vistas.get(p.siglas) ?? []), titulo]);
  }
  if (!vistas.size) return null;
  return (
    <span className={styles.siglasFila}>
      {[...vistas.entries()].map(([siglas, titulos]) => (
        <span key={siglas} className={styles.siglas} title={titulos.join("\n")}>
          {siglas}
        </span>
      ))}
    </span>
  );
}

/** Vigencia: la fecha límite, cuándo salió y un punto que avisa si ya venció o está por vencer. */
function Vigencia({ row }: { row: CotizacionRow }) {
  const dias = row.estado === "ENVIADA" ? diasDesde(row.sentAt) : null;
  const salio =
    dias !== null
      ? `enviada ${dias === 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`}`
      : row.sentAt
        ? `enviada ${formatoFecha(row.sentAt)}`
        : `emitida ${formatoFecha(row.issueDate)}`;
  let tono: Tone = "neutral";
  if (row.estado === "VENCIDA") tono = "danger";
  else if (row.estado === "APROBADA") tono = "success";
  else if (row.estado === "ENVIADA") {
    const limite = row.validUntil ? new Date(row.validUntil).getTime() : NaN;
    tono = Number.isFinite(limite) && limite - Date.now() <= 3 * DIA ? "warning" : "info";
  }
  return <WhenCell time={row.validUntil ? formatoFecha(row.validUntil) : "Sin vigencia"} hint={salio} tone={tono} />;
}

export default function CotizacionesPage() {
  const { token } = useUser();
  const router = useRouter();
  const [items, setItems] = useState<CotizacionRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [segmento, setSegmento] = useState<Segmento | null>(null);
  const [estado, setEstado] = useState<EstadoCotizacion | null>(null);
  const [soloSinProyecto, setSoloSinProyecto] = useState(false);
  const [decision, setDecision] = useState<{ tipo: "ganada" | "perdida"; detalle: CotizacionDetalle } | null>(null);
  const [abriendo, setAbriendo] = useState<number | null>(null);
  const buscador = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setItems(await listarCotizaciones(token));
    } catch (e) {
      // Un fallo al refrescar avisa arriba, pero NO borra lo que ya estaba en
      // pantalla: vaciar la lista deja a quien la consulta peor que antes de
      // pulsar «Reintentar».
      setError(formatApiError(e, "No se pudieron cargar las cotizaciones"));
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Los avisos de Hoy llegan aquí con el filtro puesto.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const pedido = qs.get("estado");
    if (pedido && (ESTADOS as readonly string[]).includes(pedido)) setEstado(pedido as EstadoCotizacion);
    if (qs.get("sinProyecto")) setSoloSinProyecto(true);
  }, []);

  const abrirDecision = async (row: CotizacionRow, tipo: "ganada" | "perdida") => {
    if (!token) return;
    setAbriendo(row.id);
    setError(null);
    try {
      setDecision({ tipo, detalle: await obtenerCotizacion(token, row.id) });
    } catch (e) {
      setError(formatApiError(e, "No se pudo abrir la cotización"));
    } finally {
      setAbriendo(null);
    }
  };

  const elegirEstado = (e: EstadoCotizacion | null) => {
    setSoloSinProyecto(false);
    setEstado(e);
  };

  // «/» busca, «n» abre una nueva (fuera de campos de texto).
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "/") {
        e.preventDefault();
        buscador.current?.focus();
      } else if (e.key === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        router.push("/erp/cotizaciones/nueva");
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [router]);

  const coincideTexto = useCallback(
    (row: CotizacionRow) => {
      const texto = q.trim().toLowerCase();
      if (!texto) return true;
      return [
        row.folio,
        row.clienteNombre,
        row.clienteEmpresa,
        row.projectName,
        row.elaboro?.nombre,
        ...row.intervinieron.map((p) => `${p.nombre} ${p.siglas}`),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(texto));
    },
    [q],
  );

  const visibles = useMemo(
    () =>
      items.filter(
        (row) =>
          (!segmento || row.segmento === segmento) &&
          (!estado || row.estado === estado) &&
          (!soloSinProyecto || (row.estado === "APROBADA" && !row.proyectoId)) &&
          coincideTexto(row),
      ),
    [items, segmento, estado, soloSinProyecto, coincideTexto],
  );

  const conteoSegmento = useMemo(() => {
    const c: Record<string, number> = {};
    for (const row of items) if ((!estado || row.estado === estado) && coincideTexto(row)) c[row.segmento] = (c[row.segmento] ?? 0) + 1;
    return c;
  }, [items, estado, coincideTexto]);

  const conteoEstado = useMemo(() => {
    const c: Record<string, number> = {};
    for (const row of items) if ((!segmento || row.segmento === segmento) && coincideTexto(row)) c[row.estado] = (c[row.estado] ?? 0) + 1;
    return c;
  }, [items, segmento, coincideTexto]);

  const cifras = useMemo(() => {
    // Por segmento y búsqueda, no por estado: tocar un filtro no debe dejar la tira en ceros.
    const base = items.filter((r) => (!segmento || r.segmento === segmento) && coincideTexto(r));
    const de = (e: EstadoCotizacion) => base.filter((r) => r.estado === e);
    const sumar = (rows: CotizacionRow[]) => rows.reduce((acc, r) => acc + Number(r.total || 0), 0);
    const inicioDeMes = new Date();
    inicioDeMes.setDate(1);
    inicioDeMes.setHours(0, 0, 0, 0);
    const esteMes = (fecha?: string | null) => Boolean(fecha) && new Date(fecha!).getTime() >= inicioDeMes.getTime();
    const enviadas = de("ENVIADA");
    const ganadas = de("APROBADA");
    const ganadasDelMes = ganadas.filter((r) => esteMes(r.aceptadaAt ?? r.updatedAt));
    return {
      total: sumar(visibles),
      borradores: de("BORRADOR").length,
      enviadas: enviadas.length,
      porCerrar: sumar(enviadas),
      sinProyecto: ganadas.filter((r) => !r.proyectoId).length,
      ganadasDelMes: ganadasDelMes.length,
      montoDelMes: sumar(ganadasDelMes),
      // Un borrador descartado también queda rechazado, pero no se perdió con nadie: nunca salió.
      perdidasDelMes: de("RECHAZADA").filter((r) => r.sentAt && esteMes(r.updatedAt)).length,
    };
  }, [items, visibles, segmento, coincideTexto]);

  const viejos = useMemo(() => items.filter((r) => r.necesitaRefolio).length, [items]);

  // El ejemplo de la explicación es una cotización real con nomenclatura, si la hay.
  const ejemplo = useMemo(
    () =>
      items.find((r) => partesDelFolio(r.folio)?.cadena.length) ?? items.find((r) => partesDelFolio(r.folio)) ?? null,
    [items],
  );

  const hayFiltros = Boolean(segmento || estado || soloSinProyecto || q.trim());
  /** El esqueleto solo en la primera carga: al refrescar, la lista se queda. */
  const primeraCarga = cargando && items.length === 0;
  /** Vacío de verdad: cero registros, no «las cifras dieron cero» (regla 7). */
  const sinRegistros = !cargando && items.length === 0;

  const quitarFiltros = () => {
    setQ("");
    setSegmento(null);
    elegirEstado(null);
  };

  const totalEstados = ESTADOS.reduce((a, e) => a + (conteoEstado[e] ?? 0), 0);

  const columnas: Column<CotizacionRow>[] = [
    {
      key: "folio",
      label: "Folio",
      render: (row) => (
        <span className={styles.celda}>
          <Link href={`/erp/cotizaciones/${row.id}`} className={styles.folioLink} onClick={(e) => e.stopPropagation()}>
            <FolioColor folio={row.folio} />
          </Link>
          {row.necesitaRefolio || !partesDelFolio(row.folio) ? (
            <Badge tone="warning" size="sm" className={styles.viejo} title="Borrador de antes de la nomenclatura">
              Sin nomenclatura
            </Badge>
          ) : (
            <span className={styles.tenue}>{folioEnPalabras(row)}</span>
          )}
        </span>
      ),
    },
    {
      key: "cliente",
      label: "Cliente · proyecto",
      render: (row) => (
        <span className={styles.celda}>
          <span className={styles.fuerte}>{row.clienteNombre || row.clienteEmpresa || "Sin cliente"}</span>
          <span className={styles.tenue}>
            {row.projectName || (row.clienteEmpresa !== row.clienteNombre ? row.clienteEmpresa : "") || "—"}
          </span>
        </span>
      ),
    },
    {
      key: "vendedor",
      label: "Elaboró · intervinieron",
      render: (row) =>
        row.elaboro?.nombre ? (
          <PersonCell
            name={row.elaboro.nombre}
            size={26}
            title={`${row.elaboro.nombre} · la elaboró`}
            subtitle={<Intervinieron row={row} />}
          />
        ) : row.intervinieron.some((p) => p.siglas) ? (
          <Intervinieron row={row} />
        ) : (
          <span className={styles.tenue}>—</span>
        ),
    },
    {
      key: "segmento",
      label: "Segmento",
      render: (row) => (
        <Badge tone="outline" size="sm">
          {row.segmentoEtiqueta}
        </Badge>
      ),
    },
    { key: "vigencia", label: "Vigencia", render: (row) => <Vigencia row={row} /> },
    {
      key: "estado",
      label: "Estado",
      render: (row) =>
        row.estado === "APROBADA" && !row.proyectoId ? (
          <span className={styles.celda}>
            <StatusCell status={row.estado} label={row.estadoEtiqueta} size="sm" />
            {/* Lo que falta no se esconde hasta pasar el ratón. */}
            <LinkButton
              onClick={(e) => {
                e.stopPropagation();
                void abrirDecision(row, "ganada");
              }}
            >
              Crear proyecto
            </LinkButton>
          </span>
        ) : (
          <StatusCell status={row.estado} label={row.estadoEtiqueta} size="sm" />
        ),
    },
    {
      key: "total",
      label: "Total",
      numeric: true,
      render: (row) => <span className={styles.total}>{formatoMoneda(row.total, row.currency ?? "MXN")}</span>,
    },
  ];

  /** Por decidir: lo único que importa es qué dijo el cliente, y se contesta desde la fila. */
  const columnasPorDecidir: Column<CotizacionRow>[] = [
    {
      key: "cotizacion",
      label: "Cotización",
      render: (row) => (
        <span className={styles.celda}>
          <Link href={`/erp/cotizaciones/${row.id}`} className={styles.fuerte} onClick={(e) => e.stopPropagation()}>
            {row.projectName || row.clienteEmpresa || row.clienteNombre || row.folio}
          </Link>
          <span className={styles.tenue}>{row.clienteEmpresa || row.clienteNombre || row.folio}</span>
        </span>
      ),
    },
    { key: "medio", label: "Salió por", render: (row) => medioConMayuscula(row.enviadaPor) },
    { key: "esperando", label: "Esperando", render: (row) => hace(diasDesde(row.sentAt)) },
    {
      key: "total",
      label: "Total",
      numeric: true,
      render: (row) => <span className={styles.total}>{formatoMoneda(row.total, row.currency ?? "MXN")}</span>,
    },
    {
      key: "termino",
      label: "¿Cómo terminó?",
      render: (row) => (
        <span className={styles.comoTermino}>
          <Button
            size="sm"
            variant="tonal"
            loading={abriendo === row.id}
            onClick={(e) => {
              e.stopPropagation();
              void abrirDecision(row, "ganada");
            }}
          >
            Ganada
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={abriendo === row.id}
            onClick={(e) => {
              e.stopPropagation();
              void abrirDecision(row, "perdida");
            }}
          >
            Perdida
          </Button>
        </span>
      ),
    },
  ];

  const nueva = (
    <ButtonLink variant="primary" href="/erp/cotizaciones/nueva" iconStart={<AddRoundedIcon />} kbd="N">
      Nueva cotización
    </ButtonLink>
  );

  let contenido: ReactNode = null;
  if (visibles.length) {
    contenido = (
      <DataTable
        className={styles.tabla}
        ariaLabel="Cotizaciones"
        caption="Cotizaciones"
        columns={estado === "ENVIADA" ? columnasPorDecidir : columnas}
        rows={visibles}
        rowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/erp/cotizaciones/${row.id}`)}
        loading={cargando}
        stickyHeader={false}
        rowActionsLabel="Abrir"
        rowActions={
          estado === "ENVIADA"
            ? undefined
            : (row) => (
                <ButtonLink size="sm" variant="ghost" href={`/erp/cotizaciones/${row.id}`} aria-label={`Abrir ${row.folio}`}>
                  Abrir
                </ButtonLink>
              )
        }
      />
    );
  } else if (items.length) {
    contenido = (
      <EmptyState
        icon={<FilterAltOffOutlinedIcon />}
        tone="neutral"
        title="Nada con estos filtros"
        action={<Button onClick={quitarFiltros}>Quitar filtros</Button>}
      />
    );
  }

  return (
    <>
    <ModulePage
      className={styles.wrap}
      title="Cotizaciones"
      icon={<RequestQuoteOutlinedIcon />}
      tertiaryActions={
        <InfoPopover label="¿Cómo se lee un folio?" title="Cómo se lee un folio">
          <FolioExplicado
            folio={ejemplo?.folio ?? "NEX-LJ75100126-0007-JA.CE-R2"}
            elaboro={ejemplo?.elaboro ?? null}
            intervinieron={ejemplo?.intervinieron ?? []}
            revision={ejemplo?.revision}
          />
          <p className={styles.ayudaNota}>
            El folio lo emite el servidor al crear la cotización, con la nomenclatura de RH de quien la hace y su
            propio consecutivo. Al enviarla se agregan las siglas de quienes intervinieron (revisó, aprobó, envió)
            y, desde el segundo envío, la revisión. El segmento no va en el folio: es un filtro.
          </p>
        </InfoPopover>
      }
      /* Sin registros el primario vive en el vacío, que además explica de
         dónde sale la primera: dos botones iguales no son dos caminos. */
      primaryAction={sinRegistros && !error ? undefined : nueva}
      stats={
        /* Regla 7: la tira solo existe si hay registros. Cuatro celdas en cero
           encima de un «no hay nada» ocupan el sitio de lo único que ayuda. */
        items.length ? (
          <StatRow ariaLabel="Resumen de cotizaciones">
            <Stat
              label="Por enviar"
              icon={<EditNoteOutlinedIcon />}
              iconTone="neutral"
              value={cifras.borradores}
              hint="Borradores vigentes"
              onClick={() => elegirEstado("BORRADOR")}
            />
            <Stat
              label="Por decidir"
              icon={<SendOutlinedIcon />}
              value={cifras.enviadas}
              hint={cifras.enviadas ? `${formatoMoneda(cifras.porCerrar)} sin respuesta registrada` : "Enviadas, sin respuesta registrada"}
              tone="brand"
              onClick={() => elegirEstado("ENVIADA")}
            />
            <Stat
              label="Ganadas sin proyecto"
              icon={<AccountTreeOutlinedIcon />}
              iconTone="neutral"
              value={cifras.sinProyecto}
              hint={cifras.sinProyecto ? "Falta crearlo" : "Todas tienen proyecto"}
              onClick={() => {
                elegirEstado("APROBADA");
                setSoloSinProyecto(true);
              }}
            />
            <Stat
              label="Ganadas este mes"
              icon={<TaskAltOutlinedIcon />}
              iconTone="success"
              value={cifras.ganadasDelMes}
              hint={[
                cifras.ganadasDelMes ? formatoMoneda(cifras.montoDelMes) : null,
                cifras.perdidasDelMes
                  ? `${cifras.ganadasDelMes ? "y" : "Y"} ${cifras.perdidasDelMes} ${cifras.perdidasDelMes === 1 ? "perdida" : "perdidas"}`
                  : null,
              ]
                .filter(Boolean)
                .join(" ") || "Ninguna todavía"}
              onClick={() => elegirEstado("APROBADA")}
            />
          </StatRow>
        ) : null
      }
      before={
        viejos || error ? (
          <div className={styles.avisos}>
            {viejos ? (
              <Alert
                tone="warning"
                icon={<WarningAmberRoundedIcon aria-hidden="true" />}
                action={
                  <LinkButton
                    onClick={() => {
                      setEstado("BORRADOR");
                      setQ("");
                    }}
                  >
                    Ver borradores
                  </LinkButton>
                }
              >
                {viejos === 1 ? "1 borrador con folio viejo" : `${viejos} borradores con folio viejo`}, sin nomenclatura.
              </Alert>
            ) : null}
            {/* Regla 9: el aviso vive fuera de la tarjeta de la tabla. Y no
                sustituye a la lista: si ya había filas, siguen ahí. */}
            {error ? (
              <Alert tone="danger" role="alert" action={<LinkButton onClick={() => void cargar()}>Reintentar</LinkButton>}>
                {error}
              </Alert>
            ) : null}
          </div>
        ) : null
      }
      listLabel="Lista de cotizaciones"
      toolbar={
        <ModuleToolbar
          search={
            <>
              <label htmlFor="buscar-cotizaciones" className="ui-sr-only">
                Buscar cotizaciones
              </label>
              <SearchInput
                id="buscar-cotizaciones"
                ref={buscador}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Folio, cliente o persona"
                shortcut="/"
              />
            </>
          }
          chips={
            <FilterChips ariaLabel="Filtrar por estado">
              <FilterChip active={!estado} count={totalEstados} onClick={() => elegirEstado(null)}>
                Todas
              </FilterChip>
              {FILTROS_DE_ESTADO.map((f) => (
                <FilterChip
                  key={f.id}
                  active={estado === f.id}
                  count={conteoEstado[f.id] ?? 0}
                  dot={statusTone(f.id).tone}
                  onClick={() => elegirEstado(estado === f.id ? null : f.id)}
                >
                  {f.label}
                </FilterChip>
              ))}
              {soloSinProyecto ? (
                <FilterChip active onRemove={() => setSoloSinProyecto(false)}>
                  Sin proyecto
                </FilterChip>
              ) : null}
            </FilterChips>
          }
          end={
            <>
              {hayFiltros ? (
                <span className={styles.tenue}>
                  {visibles.length} de {items.length} · {formatoMoneda(cifras.total)}
                </span>
              ) : null}
              {hayFiltros ? (
                <Button size="sm" variant="ghost" onClick={quitarFiltros}>
                  Quitar filtros
                </Button>
              ) : null}
              <span className={styles.segmentos}>
                <Segmented
                  ariaLabel="Filtrar por segmento"
                  items={[
                    { id: "TODOS" as const, label: "Todos" },
                    ...SEGMENTOS.map((s) => ({ id: s, label: SEGMENTO_LABEL[s], count: conteoSegmento[s] ?? 0 })),
                  ]}
                  value={segmento ?? "TODOS"}
                  onChange={(id) => setSegmento(id === "TODOS" || id === segmento ? null : id)}
                />
              </span>
            </>
          }
        />
      }
      loading={primeraCarga}
      loadingRows={5}
      empty={sinRegistros && !error}
      emptyState={{
        icon: <RequestQuoteOutlinedIcon />,
        title: "Todavía no hay cotizaciones",
        description:
          "Una cotización nace del editor: eliges cliente y proyecto, capturas las partidas y el servidor emite el folio con tu nomenclatura. Desde ahí se envía por correo.",
        action: (
          <ButtonLink variant="primary" href="/erp/cotizaciones/nueva">
            Crear la primera
          </ButtonLink>
        ),
      }}
    >
      {contenido}
    </ModulePage>
    {decision?.tipo === "ganada" ? (
      <DialogoGanada
        detalle={decision.detalle}
        onCerrar={() => setDecision(null)}
        onSinProyecto={(mensaje) => {
          setDecision(null);
          setError(mensaje);
          void cargar();
        }}
      />
    ) : null}
    {decision?.tipo === "perdida" ? (
      <DialogoPerdida
        detalle={decision.detalle}
        onCerrar={() => setDecision(null)}
        onHecho={() => {
          setDecision(null);
          void cargar();
        }}
      />
    ) : null}
    </>
  );
}
