"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Kbd,
  LinkButton,
  PageHead,
  SearchInput,
  Segmented,
  SkeletonRows,
  Stat,
  StatRow,
  Tabs,
  Toolbar,
  tabla,
  type Tone,
} from "@/components/base";
import { useUser } from "@/components/UserContext";
import {
  ESTADOS,
  ESTADO_LABEL,
  ESTADO_TONO,
  SEGMENTOS,
  SEGMENTO_LABEL,
  formatoFecha,
  formatoMoneda,
  listarCotizaciones,
  type CotizacionRow,
  type EstadoCotizacion,
  type Segmento,
} from "@/lib/cotizaciones-api";
import { partesDelFolio } from "@/lib/cotizacion-folio";
import FolioExplicado from "./_editor/FolioExplicado";
import styles from "./cotizaciones-core.module.css";

const ROL: Record<string, string> = {
  ELABORO: "Elaboró",
  LEVANTAMIENTO: "Levantamiento",
  REVISO: "Revisó",
  APROBO: "Aprobó",
  ENVIO: "Envió",
};

const CLAVE_EXPLICACION = "nexara.cotizaciones.explicaFolio";

const TONO_ESTADO: Record<"neutral" | "info" | "ok" | "alerta", Tone> = {
  neutral: "neutral",
  info: "info",
  ok: "success",
  alerta: "danger",
};

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

/** Quién intervino, en orden y sin repetir. Si nadie quedó registrado, al menos quien la hizo. */
function Intervinieron({ row }: { row: CotizacionRow }) {
  const vistas = new Map<string, string[]>();
  for (const p of row.intervinieron) {
    if (!p.siglas) continue;
    const titulo = `${p.nombre || p.siglas} · ${ROL[p.rol] ?? p.rol}`;
    vistas.set(p.siglas, [...(vistas.get(p.siglas) ?? []), titulo]);
  }
  if (!vistas.size && row.elaboro?.siglas) {
    return (
      <span className={styles.siglasFila}>
        <span className={styles.siglasTenue} title={`${row.elaboro.nombre} · la hizo (sin más registro)`}>
          {row.elaboro.siglas}
        </span>
      </span>
    );
  }
  if (!vistas.size) return <span className={tabla.tenue}>—</span>;
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

export default function CotizacionesPage() {
  const { token } = useUser();
  const router = useRouter();
  const [items, setItems] = useState<CotizacionRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [segmento, setSegmento] = useState<Segmento | null>(null);
  const [estado, setEstado] = useState<EstadoCotizacion | null>(null);
  const [explicaAbierta, setExplicaAbierta] = useState(true);
  const buscador = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CLAVE_EXPLICACION) === "cerrada") setExplicaAbierta(false);
    } catch {
      /* sin almacenamiento: queda abierta */
    }
  }, []);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setItems(await listarCotizaciones(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las cotizaciones");
      setItems([]);
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

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
        (row) => (!segmento || row.segmento === segmento) && (!estado || row.estado === estado) && coincideTexto(row),
      ),
    [items, segmento, estado, coincideTexto],
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
    const sumar = (filtro: (r: CotizacionRow) => boolean) =>
      visibles.filter(filtro).reduce((acc, r) => acc + Number(r.total || 0), 0);
    return {
      total: sumar(() => true),
      enviadas: visibles.filter((r) => r.estado === "ENVIADA").length,
      porCerrar: sumar((r) => r.estado === "ENVIADA"),
      aprobadas: sumar((r) => r.estado === "APROBADA"),
      nAprobadas: visibles.filter((r) => r.estado === "APROBADA").length,
      borradores: visibles.filter((r) => r.estado === "BORRADOR").length,
    };
  }, [visibles]);

  const viejos = items.filter((r) => r.necesitaRefolio).length;

  // El ejemplo de la explicación es una cotización real con nomenclatura, si la hay.
  const ejemplo =
    items.find((r) => partesDelFolio(r.folio)?.cadena.length) ?? items.find((r) => partesDelFolio(r.folio)) ?? null;

  const hayFiltros = Boolean(segmento || estado || q.trim());
  const quitarFiltros = () => {
    setQ("");
    setSegmento(null);
    setEstado(null);
  };

  const pestanasEstado = [
    { id: "TODAS" as const, label: "Todas", count: ESTADOS.reduce((a, e) => a + (conteoEstado[e] ?? 0), 0) },
    ...ESTADOS.map((e) => ({ id: e, label: ESTADO_LABEL[e], count: conteoEstado[e] ?? 0 })),
  ];

  return (
    <div className={styles.wrap}>
      <PageHead
        title="Cotizaciones"
        description="Propuestas técnicas con folio de seguimiento: de quién es, quién intervino y en qué revisión va."
        actions={
          <ButtonLink variant="primary" href="/erp/cotizaciones/nueva">
            Nueva cotización <Kbd>N</Kbd>
          </ButtonLink>
        }
      />

      {!cargando && items.length ? (
        <StatRow>
          <Stat label="En la vista" value={visibles.length} hint={`de ${items.length} cotizaciones`} />
          <Stat label="Borradores" value={cifras.borradores} hint="por terminar y enviar" />
          <Stat
            label="Enviadas por cerrar"
            value={formatoMoneda(cifras.porCerrar)}
            hint={cifras.enviadas === 1 ? "1 enviada" : `${cifras.enviadas} enviadas`}
            tone="brand"
          />
          <Stat
            label="Aprobadas"
            value={formatoMoneda(cifras.aprobadas)}
            hint={cifras.nAprobadas === 1 ? "1 aprobada" : `${cifras.nAprobadas} aprobadas`}
          />
        </StatRow>
      ) : null}

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
          {viejos === 1 ? "1 borrador trae" : `${viejos} borradores traen`} folio viejo, sin nomenclatura (no dice de quién
          es). Ábrelo y usa «Asignar folio» en Seguimiento.
        </Alert>
      ) : null}

      <details
        className={styles.explica}
        open={explicaAbierta}
        onToggle={(e) => {
          const abierta = (e.currentTarget as HTMLDetailsElement).open;
          setExplicaAbierta(abierta);
          try {
            window.localStorage.setItem(CLAVE_EXPLICACION, abierta ? "abierta" : "cerrada");
          } catch {
            /* sin almacenamiento */
          }
        }}
      >
        <summary>¿Cómo se lee un folio?</summary>
        <div className={styles.explicaCuerpo}>
          <FolioExplicado
            folio={ejemplo?.folio ?? "NEX-LJ75100126-0007-JA.CE-R2"}
            elaboro={ejemplo?.elaboro ?? null}
            intervinieron={ejemplo?.intervinieron ?? []}
            revision={ejemplo?.revision}
          />
          <p>
            El folio lo emite el servidor al crear la cotización, con la nomenclatura de RH de quien la hace y su propio
            consecutivo. Al enviarla se agregan las siglas de quienes intervinieron (revisó, aprobó, envió) y, desde el
            segundo envío, la revisión. El segmento no va en el folio: es un filtro.
          </p>
        </div>
      </details>

      <div className={tabla.marco}>
        <div className={tabla.barra}>
          <div className={tabla.barraTabs}>
            <Tabs
              modo="filtro"
              ariaLabel="Filtrar por estado"
              items={pestanasEstado}
              value={estado ?? "TODAS"}
              onChange={(id) => setEstado(id === "TODAS" || id === estado ? null : id)}
            />
          </div>
          <Toolbar
            end={
              <>
                <span>
                  {cargando ? "Cargando…" : `${visibles.length} de ${items.length} · ${formatoMoneda(cifras.total)}`}
                </span>
                {hayFiltros ? <LinkButton onClick={quitarFiltros}>Quitar filtros</LinkButton> : null}
              </>
            }
          >
            <label htmlFor="buscar-cotizaciones" className={styles.soloLector}>
              Buscar cotizaciones
            </label>
            <SearchInput
              id="buscar-cotizaciones"
              ref={buscador}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Folio, cliente, proyecto o persona"
              shortcut="/"
            />
            <Segmented
              ariaLabel="Filtrar por segmento"
              items={[
                { id: "TODOS" as const, label: "Todos" },
                ...SEGMENTOS.map((s) => ({ id: s, label: SEGMENTO_LABEL[s], count: conteoSegmento[s] ?? 0 })),
              ]}
              value={segmento ?? "TODOS"}
              onChange={(id) => setSegmento(id === "TODOS" || id === segmento ? null : id)}
            />
          </Toolbar>
        </div>

        {error ? (
          <div style={{ padding: "12px 16px 0" }}>
            <Alert tone="danger" role="alert" action={<LinkButton onClick={() => void cargar()}>Reintentar</LinkButton>}>
              {error}
            </Alert>
          </div>
        ) : null}

        {cargando ? (
          <SkeletonRows rows={5} label="Cargando cotizaciones" />
        ) : !items.length && !error ? (
          <EmptyState
            icon={<RequestQuoteOutlinedIcon />}
            title="Todavía no hay cotizaciones"
            description="Aquí se arma la propuesta técnica completa, como la recibe el cliente: objetivo, alcance, planos y la tabla de precios con sus términos. Se guarda sola mientras escribes y el PDF se ve al lado."
            action={
              <ButtonLink variant="primary" href="/erp/cotizaciones/nueva">
                Crear la primera
              </ButtonLink>
            }
          />
        ) : !visibles.length && !error ? (
          <EmptyState
            icon={<FilterAltOffOutlinedIcon />}
            title="Nada con estos filtros"
            description="Prueba con otro segmento o estado, o busca por el nombre del cliente."
            action={<Button onClick={quitarFiltros}>Quitar filtros</Button>}
          />
        ) : visibles.length ? (
          <nav className={styles.list} aria-label="Cotizaciones">
            <div className={`${tabla.cabeza} ${styles.rejilla}`} aria-hidden>
              <span>Folio</span>
              <span>Cliente · proyecto</span>
              <span>Segmento</span>
              <span>Estado</span>
              <span className={tabla.num}>Total</span>
              <span>Intervinieron</span>
              <span className={tabla.num}>Fecha</span>
            </div>
            {visibles.map((row) => (
              <Link key={row.id} href={`/erp/cotizaciones/${row.id}`} className={`${tabla.fila} ${styles.rejilla} ${styles.row}`}>
                <span className={tabla.celda}>
                  <FolioColor folio={row.folio} />
                  {row.necesitaRefolio || !partesDelFolio(row.folio) ? (
                    <Badge tone="warning" className={styles.viejo} title="Borrador de antes de la nomenclatura">
                      Sin nomenclatura
                    </Badge>
                  ) : (
                    <span className={tabla.tenue}>{folioEnPalabras(row)}</span>
                  )}
                </span>
                <span className={tabla.celda}>
                  <span className={tabla.fuerte}>{row.clienteNombre || row.clienteEmpresa || "Sin cliente"}</span>
                  <span className={tabla.tenue}>
                    {row.projectName || (row.clienteEmpresa !== row.clienteNombre ? row.clienteEmpresa : "") || "—"}
                  </span>
                </span>
                <span>
                  <Badge tone="outline">{row.segmentoEtiqueta}</Badge>
                </span>
                <span>
                  <Badge tone={TONO_ESTADO[ESTADO_TONO[row.estado]]} dot>
                    {row.estadoEtiqueta}
                  </Badge>
                </span>
                <span className={`${tabla.num} ${tabla.fuerte}`}>{formatoMoneda(row.total, row.currency ?? "MXN")}</span>
                <Intervinieron row={row} />
                <span className={`${tabla.celda} ${styles.derecha}`}>
                  <span className={tabla.num}>{formatoFecha(row.sentAt ?? row.issueDate)}</span>
                  <span className={tabla.tenue}>{row.sentAt ? "enviada" : "emitida"}</span>
                </span>
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
