"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import DifferenceOutlinedIcon from "@mui/icons-material/DifferenceOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  CardHead,
  Checkbox,
  DataTable,
  DateInput,
  EmptyState,
  LinkButton,
  ListCard,
  ListFooter,
  ModuleToolbar,
  SearchInput,
  Select,
  Stat,
  StatRow,
  type Column,
  type Tone,
} from "@/components/base";
import Modal from "@/components/ui/Modal";
import { MesaPagina } from "@/components/mesa-contable/MesaPagina";
import { useUser } from "@/components/UserContext";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import {
  auditActionLabel,
  auditEntityLabel,
  auditFieldLabel,
} from "@/lib/finance-status-labels";
import { VacioConPrimerPaso } from "../_arranque";
import s from "./auditoria.module.css";

type AuditRow = {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  userId?: number | null;
  companyId?: number | null;
  source?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  changes?: unknown;
  previousData?: unknown;
  user?: { id: number; nombre: string; email: string } | null;
};

type Respuesta = {
  data?: AuditRow[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
};

const LIMITE = 100;

/** Campos de contexto del interceptor HTTP: no son datos del registro. */
const CONTEXTO = new Set(["path", "method", "durationMs", "status", "error", "request"]);

type Fila = { campo: string; antes: unknown; despues: unknown; cambio: boolean };

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Lo que el back llama `changes` es, en las escrituras propias, el "después". */
function datosDespues(row: AuditRow): Record<string, unknown> | null {
  if (!esObjeto(row.changes)) return null;
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row.changes)) {
    if (!CONTEXTO.has(k)) salida[k] = v;
  }
  return Object.keys(salida).length ? salida : null;
}

function contextoHttp(row: AuditRow): Record<string, unknown> | null {
  if (!esObjeto(row.changes)) return null;
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row.changes)) {
    if (CONTEXTO.has(k)) salida[k] = v;
  }
  return Object.keys(salida).length ? salida : null;
}

function comparar(antes: Record<string, unknown> | null, despues: Record<string, unknown> | null): Fila[] {
  const campos = new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})]);
  return [...campos]
    .sort()
    .map((campo) => {
      const a = antes?.[campo];
      const d = despues?.[campo];
      return { campo, antes: a, despues: d, cambio: JSON.stringify(a) !== JSON.stringify(d) };
    });
}

function texto(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "(vacío)";
  if (typeof v === "string") return v || "(vacío)";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v, null, 2);
}

const fechaHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—";

/**
 * La acción es el estado del renglón: neutra mientras sea flujo normal (alta,
 * edición, consulta) y roja solo cuando alguien borró algo, que es lo que uno
 * busca al abrir una bitácora.
 */
function tonoAccion(action: string): Tone {
  const a = action.toLowerCase();
  if (/delete|remove|borr|elimin|revoke|revoc/.test(a)) return "danger";
  if (/fail|error|denied|deneg|reject|rechaz/.test(a)) return "danger";
  if (/login|logout|export|approve|aprob/.test(a)) return "warning";
  return "neutral";
}

/** Opciones vistas hasta ahora: usuario, entidad y acción. */
type Catalogos = {
  usuarios: Record<string, string>;
  entidades: string[];
  acciones: string[];
};

const CATALOGOS_VACIOS: Catalogos = { usuarios: {}, entidades: [], acciones: [] };

export default function AuditoriaPage() {
  const { user, isContextReady } = useUser();
  const token = user?.token ?? "";

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<AuditRow | null>(null);
  const [soloCambios, setSoloCambios] = useState(true);

  const [fUsuario, setFUsuario] = useState("");
  const [fEntidad, setFEntidad] = useState("");
  const [fAccion, setFAccion] = useState("");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");

  /**
   * No hay endpoint de catálogos, así que las opciones salen de lo cargado —
   * pero se ACUMULAN. Derivándolas solo del corte actual, al elegir un usuario
   * el desplegable se quedaba con ese único usuario y ya no se podía cambiar a
   * otro sin limpiar los filtros: parecía que la lista se había roto.
   */
  const [catalogos, setCatalogos] = useState<Catalogos>(CATALOGOS_VACIOS);
  const peticion = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    const turno = ++peticion.current;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: String(LIMITE), page: String(pagina) });
      if (fUsuario) qs.set("userId", fUsuario);
      if (fEntidad) qs.set("entityType", fEntidad);
      if (fAccion) qs.set("action", fAccion);
      if (fDesde) qs.set("from", `${fDesde}T00:00:00`);
      if (fHasta) qs.set("to", `${fHasta}T23:59:59`);
      const data = await erpFetch<Respuesta | AuditRow[]>(`audit?${qs}`, token);
      const lista = Array.isArray(data) ? data : (data?.data ?? []);
      if (turno !== peticion.current) return;
      setRows(lista);
      const cuantos = Array.isArray(data) ? lista.length : (data?.total ?? lista.length);
      setTotal(cuantos);
      setTotalPaginas(
        Array.isArray(data)
          ? 1
          : (data?.totalPages ?? Math.max(1, Math.ceil(cuantos / LIMITE))),
      );
      setCatalogos((prev) => {
        const usuarios = { ...prev.usuarios };
        for (const r of lista) {
          if (r.user?.id) usuarios[String(r.user.id)] = r.user.nombre || r.user.email || `#${r.user.id}`;
          else if (r.userId) usuarios[String(r.userId)] = `#${r.userId}`;
        }
        const entidades = [...new Set([...prev.entidades, ...lista.map((r) => r.entityType)])]
          .filter(Boolean)
          .sort();
        const acciones = [...new Set([...prev.acciones, ...lista.map((r) => r.action)])]
          .filter(Boolean)
          .sort();
        return { usuarios, entidades, acciones };
      });
    } catch (e) {
      if (turno !== peticion.current) return;
      const crudo = formatApiError(e);
      // Un 403 es lo único que se resuelve pidiendo permiso; mezclarlo con
      // cualquier otro fallo mandaba a la gente a dirección por un 500.
      const sinPermiso = /\b403\b|forbidden|prohibid|permis/i.test(crudo);
      setError(
        sinPermiso
          ? `No se pudo abrir la bitácora: tu cuenta no tiene el permiso audit.view. Pídeselo a dirección y vuelve a entrar. (${crudo})`
          : `No se pudo cargar la bitácora. ${crudo} Reintenta; si persiste, acota el rango de fechas.`,
      );
      setRows([]);
      setTotal(0);
      setTotalPaginas(1);
    } finally {
      if (turno === peticion.current) setLoading(false);
    }
  }, [token, fUsuario, fEntidad, fAccion, fDesde, fHasta, pagina]);

  useEffect(() => {
    if (!isContextReady) return;
    // Sin sesión, el «Cargando…» se quedaba girando sin explicar nada.
    if (!token) {
      setLoading(false);
      return;
    }
    void load();
  }, [isContextReady, token, load]);

  const [angosto, setAngosto] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const sync = () => setAngosto(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const sinSesion = isContextReady && !token;

  /** Al cambiar un filtro se vuelve a la primera página: la 4 de un filtro no
   *  es la 4 de otro, y quedarse ahí devolvía una página vacía sin motivo. */
  const filtrar = useCallback((set: (v: string) => void) => {
    return (v: string) => {
      set(v);
      setPagina(1);
    };
  }, []);

  const opcionesUsuario = useMemo(
    () => Object.entries(catalogos.usuarios).map(([value, label]) => ({ value, label })),
    [catalogos.usuarios],
  );

  /**
   * El valor es el que entiende el servidor (`Invoice`, `CREATE`); la etiqueta
   * es la que entiende quien revisa. No se cambia el contrato, se traduce al
   * pintarlo.
   */
  const opcionesEntidad = useMemo(
    () =>
      catalogos.entidades
        .map((v) => ({ value: v, label: auditEntityLabel(v) }))
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
    [catalogos.entidades],
  );

  const opcionesAccion = useMemo(
    () =>
      catalogos.acciones
        .map((v) => ({ value: v, label: auditActionLabel(v) }))
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
    [catalogos.acciones],
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.user?.nombre ?? "Sistema"} ${r.user?.email ?? ""} ${r.action} ${auditActionLabel(
        r.action,
      )} ${r.entityType} ${auditEntityLabel(r.entityType)} ${r.entityId}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, busqueda]);

  const columns: Column<AuditRow>[] = [
    {
      key: "createdAt",
      label: "Cuándo",
      width: 140,
      render: (r) => <span className={s.cuando}>{fechaHora(r.createdAt)}</span>,
    },
    {
      key: "usuario",
      label: "Usuario",
      render: (r) => r.user?.nombre || (r.userId ? `#${r.userId}` : "Sistema"),
    },
    {
      key: "action",
      label: "Acción",
      render: (r) => (
        <Badge dot size="sm" tone={tonoAccion(r.action)} title={r.action}>
          {auditActionLabel(r.action)}
        </Badge>
      ),
    },
    {
      // Sin `render` la celda salía VACÍA: `DataTable` no cae al valor de la
      // fila por su `key`, pinta cadena vacía. La columna «Entidad» llevaba
      // tiempo en blanco y el dato venía en cada evento.
      key: "entityType",
      label: "Tipo de registro",
      render: (r) =>
        r.entityType ? (
          <span title={r.entityType}>{auditEntityLabel(r.entityType)}</span>
        ) : (
          <span className={s.tenue}>—</span>
        ),
    },
    {
      key: "entityId",
      label: "Número",
      align: "right",
      numeric: true,
      render: (r) => (r.entityId ? `#${r.entityId}` : "—"),
    },
    // El contexto técnico es la columna más ancha y la menos consultada: por
    // debajo de 1024px se retira, y sigue completo en el detalle del evento.
    ...(angosto
      ? []
      : [
          {
            key: "contexto",
            label: "Contexto",
            render: (r: AuditRow) => {
              const ctx = contextoHttp(r);
              const ruta = ctx?.["path"] ? String(ctx["path"]) : null;
              return (
                <span className={s.contexto}>
                  {[r.source, ruta, r.ipAddress].filter(Boolean).join(" · ") || "—"}
                </span>
              );
            },
          },
        ]),
  ];

  /**
   * ¿Hay algún filtro puesto? Los cinco primeros los aplica el servidor sobre
   * toda la bitácora; el texto solo recorta la página. Cualquiera de ellos
   * convierte «no hay nada» en «no hay nada ASÍ», que es otro vacío y se
   * resuelve de otra manera.
   */
  const hayFiltros = Boolean(
    fUsuario || fEntidad || fAccion || fDesde || fHasta || busqueda.trim(),
  );

  const limpiarFiltros = useCallback(() => {
    setBusqueda("");
    setFUsuario("");
    setFEntidad("");
    setFAccion("");
    setFDesde("");
    setFHasta("");
    setPagina(1);
  }, []);

  /**
   * Lectura de lo cargado, no del total del servidor: la bitácora trae los
   * últimos {LIMITE} eventos y eso es lo que estas cifras describen.
   */
  const strip: ComponentProps<typeof Stat>[] = useMemo(() => {
    const borrados = filtradas.filter((r) => tonoAccion(r.action) === "danger").length;
    const personas = new Set(
      filtradas.map((r) => (r.user?.id ?? r.userId ?? "sistema").toString()),
    ).size;
    return [
      {
        label: "Eventos en pantalla",
        value: loading ? "…" : filtradas.length.toLocaleString("es-MX"),
        hint:
          total > rows.length
            ? `De ${rows.length} en esta página · ${total.toLocaleString("es-MX")} en total`
            : "Todos los del filtro",
        icon: <HistoryOutlinedIcon />,
        iconTone: "neutral",
      },
      {
        label: "Personas",
        value: loading ? "…" : personas,
        hint: "Quién tocó algo en esta página",
        icon: <PeopleAltOutlinedIcon />,
        iconTone: "neutral",
      },
      {
        label: "Tipos de registro",
        value: loading ? "…" : new Set(filtradas.map((r) => r.entityType)).size,
        hint: "Facturas, pólizas, proveedores…",
        icon: <CategoryOutlinedIcon />,
        iconTone: "neutral",
      },
      {
        label: "Bajas y rechazos",
        value: loading ? "…" : borrados,
        hint: borrados === 0 ? "Nada se borró" : "Revisar quién y por qué",
        tone: borrados > 0 ? "danger" : "default",
        icon: <DeleteOutlineOutlinedIcon />,
        iconTone: "neutral",
      },
    ];
  }, [filtradas, loading, rows.length, total]);

  const antes = abierta && esObjeto(abierta.previousData) ? (abierta.previousData as Record<string, unknown>) : null;
  const despues = abierta ? datosDespues(abierta) : null;
  const filas = comparar(antes, despues);
  const visibles = soloCambios && antes ? filas.filter((f) => f.cambio) : filas;

  const cambiaUsuario = filtrar(setFUsuario);
  const cambiaEntidad = filtrar(setFEntidad);
  const cambiaAccion = filtrar(setFAccion);
  const cambiaDesde = filtrar(setFDesde);
  const cambiaHasta = filtrar(setFHasta);

  return (
    <MesaPagina
      titulo="Auditoría"
      descripcion="Quién cambió qué y cuándo. Abre un evento para ver el antes y el después."
      terciarias={
        <Button
          variant="ghost"
          onClick={() => void load()}
          disabled={loading || sinSesion}
        >
          {loading ? "Actualizando…" : "Actualizar"}
        </Button>
      }
    >
      {sinSesion ? (
        <Alert
          className={s.aviso}
          tone="warning"
          role="alert"
          action={
            <ButtonLink size="sm" href="/login">
              Ir a entrar
            </ButtonLink>
          }
        >
          No hay sesión activa, así que la bitácora no se puede consultar. Vuelve a entrar con tu
          cuenta para verla.
        </Alert>
      ) : null}

      {error ? (
        <Alert
          className={s.aviso}
          tone="danger"
          role="alert"
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? "Reintentando…" : "Reintentar"}
            </Button>
          }
        >
          {`No se pudo cargar la bitácora. ${error} Reintenta; si sigue igual, avisa a soporte.`}
        </Alert>
      ) : null}

      {/* Con la bitácora vacía las cuatro celdas dicen cero, cero, cero y
          «Nada se borró»: parece un informe y es un hueco. La tira aparece
          cuando hay eventos que resumir. */}
      {(loading || filtradas.length > 0) && !sinSesion ? (
        <StatRow variant="strip" ariaLabel="Resumen de la bitácora cargada">
          {strip.map((m) => (
            <Stat key={String(m.label)} {...m} />
          ))}
        </StatRow>
      ) : null}

      <ListCard
        listLabel="Bitácora de auditoría"
        toolbar={
          <>
            <CardHead
              title={
                loading
                  ? "Cargando…"
                  : `${filtradas.length} ${
                      filtradas.length === 1 ? "evento" : "eventos"
                    } en esta página`
              }
              subtitle={
                !sinSesion && total > rows.length
                  ? `${total.toLocaleString("es-MX")} eventos con estos filtros; se traen de ${LIMITE} en ${LIMITE}.`
                  : undefined
              }
            />
            <ModuleToolbar
              search={
                <SearchInput
                  // El buscador no va al servidor: la API de auditoría no acepta texto
                  // libre. Decirlo evita concluir «no existe» cuando solo no está aquí.
                  aria-label="Filtrar esta página por usuario, acción o tipo de registro…"
                  placeholder="Filtrar esta página por usuario, acción o tipo de registro…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              }
              end={
                <>
                  {hayFiltros ? <LinkButton onClick={limpiarFiltros}>Limpiar</LinkButton> : null}
                  {loading ? null : (
                    <span className={s.conteo} role="status">
                      {filtradas.length} resultado{filtradas.length === 1 ? "" : "s"}
                    </span>
                  )}
                </>
              }
            >
              <Select
                aria-label="Usuario"
                title="Usuario"
                controlSize="sm"
                wrapperClassName={s.filtroSelect}
                value={fUsuario}
                onChange={(e) => cambiaUsuario(e.target.value)}
              >
                <option value="">Todos · Usuario</option>
                {opcionesUsuario.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Tipo de registro"
                title="Tipo de registro"
                controlSize="sm"
                wrapperClassName={s.filtroSelect}
                value={fEntidad}
                onChange={(e) => cambiaEntidad(e.target.value)}
              >
                <option value="">Todos · Tipo de registro</option>
                {opcionesEntidad.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Acción"
                title="Acción"
                controlSize="sm"
                wrapperClassName={s.filtroSelect}
                value={fAccion}
                onChange={(e) => cambiaAccion(e.target.value)}
              >
                <option value="">Todos · Acción</option>
                {opcionesAccion.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
              <label className={s.fecha}>
                <span>Desde</span>
                <DateInput
                  aria-label="Desde"
                  className={s.filtroFecha}
                  controlSize="sm"
                  value={fDesde}
                  onChange={(e) => cambiaDesde(e.target.value)}
                />
              </label>
              <label className={s.fecha}>
                <span>Hasta</span>
                <DateInput
                  aria-label="Hasta"
                  className={s.filtroFecha}
                  controlSize="sm"
                  value={fHasta}
                  onChange={(e) => cambiaHasta(e.target.value)}
                />
              </label>
            </ModuleToolbar>
            <p className={s.nota}>
              Usuario, entidad, acción y fechas los aplica el servidor sobre toda la bitácora. El
              cuadro de texto solo filtra los {LIMITE} eventos de esta página; para buscar más
              atrás, avanza de página o acota con las fechas.
            </p>
          </>
        }
        loading={loading && !sinSesion}
        empty={sinSesion || (!loading && filtradas.length === 0)}
        emptyState={
          sinSesion ? (
            {
              icon: <LockOutlinedIcon />,
              title: "Sin sesión",
              description: "Vuelve a entrar con tu cuenta para consultar la bitácora.",
              tone: "neutral",
            }
          ) : hayFiltros ? (
            {
              icon: <FilterAltOffOutlinedIcon />,
              title: "Sin eventos con estos filtros",
              description: busqueda.trim()
                ? `Ningún evento de esta página contiene «${busqueda.trim()}». Recuerda que el texto solo filtra lo ya cargado: quita la búsqueda o cambia de página.`
                : "No hay registros de auditoría con estos filtros. Amplía el rango de fechas o quita alguno.",
              tone: "neutral",
              action: <Button onClick={limpiarFiltros}>Limpiar filtros</Button>,
            }
          ) : (
            /* Nada que configurar: la bitácora se escribe sola. Lo único que
               falta es que alguien haga algo en el sistema. */
            <VacioConPrimerPaso
              variant="default"
              title="La bitácora todavía está en blanco"
              description="Nadie ha dado de alta, cambiado ni borrado nada que se anote aquí. No hay que encender nada: en cuanto se registre el primer movimiento, queda anotado con quién lo hizo, cuándo y qué cambió exactamente."
            />
          )
        }
        footer={
          !sinSesion && totalPaginas > 1 ? (
            <ListFooter
              end={
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pagina <= 1 || loading}
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pagina >= totalPaginas || loading}
                    onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  >
                    Siguiente
                  </Button>
                </>
              }
            >
              <span>
                Página {pagina} de {totalPaginas}
              </span>
            </ListFooter>
          ) : null
        }
      >
        <DataTable
          flush
          columns={columns}
          rows={filtradas}
          rowKey={(r) => r.id}
          density="compact"
          ariaLabel="Auditoría contable"
          onRowClick={(r) => {
            setAbierta(r);
            setSoloCambios(true);
          }}
        />
      </ListCard>

      <Modal
        open={!!abierta}
        onClose={() => setAbierta(null)}
        title={
          abierta
            ? `${auditActionLabel(abierta.action)} · ${auditEntityLabel(
                abierta.entityType,
              )} #${abierta.entityId}`
            : ""
        }
        maxWidth={780}
        footer={
          <div className={s.pie}>
            <Button variant="ghost" onClick={() => setAbierta(null)}>
              Cerrar
            </Button>
          </div>
        }
      >
        {abierta && (
          <div className={s.modalCuerpo}>
            <dl className={s.datos}>
              {/* `userAgent` llegaba en cada evento y no se mostraba en ningún
                  sitio: en una bitácora, con qué equipo se hizo el cambio es
                  parte de la respuesta a «quién fue». */}
              {[
                ["Usuario", abierta.user?.nombre || (abierta.userId ? `#${abierta.userId}` : "Sistema")],
                ["Correo", abierta.user?.email || "—"],
                ["Cuándo", fechaHora(abierta.createdAt)],
                ["Origen", abierta.source || "—"],
                ["IP", abierta.ipAddress || "—"],
                ["Equipo", abierta.userAgent || "—"],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt>{k}</dt>
                  <dd title={typeof v === "string" ? v : undefined}>{v}</dd>
                </div>
              ))}
            </dl>

            {!antes && (
              <Alert className={s.aviso} tone="warning" role="alert">
                Este evento no guardó el estado anterior del registro, así que no hay comparación
                posible: abajo va solo lo que quedó registrado.
              </Alert>
            )}

            {antes && (
              <div className={s.cambios}>
                <span className={s.cuenta}>
                  <strong>{filas.filter((f) => f.cambio).length}</strong> de {filas.length} campos
                  cambiaron
                </span>
                <Checkbox
                  checked={soloCambios}
                  onChange={(e) => setSoloCambios(e.target.checked)}
                  label="Mostrar solo lo que cambió"
                />
              </div>
            )}

            {visibles.length === 0 ? (
              /* Antes decía siempre «el evento no guardó campos», incluso
                 cuando sí los guardó y lo que pasaba es que ninguno cambió. */
              filas.length > 0 && soloCambios && antes ? (
                <EmptyState
                  size="compact"
                  tone="neutral"
                  icon={<DifferenceOutlinedIcon />}
                  title="Ningún campo cambió"
                  description={`El evento tocó el registro pero dejó los ${filas.length} campos igual. Desmarca «Mostrar solo lo que cambió» para verlos todos.`}
                  action={
                    <Button size="sm" onClick={() => setSoloCambios(false)}>
                      Ver todos los campos
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  size="compact"
                  tone="neutral"
                  icon={<DifferenceOutlinedIcon />}
                  title="Sin datos del registro"
                  description="Este evento quedó anotado en la bitácora, pero no guardó el contenido del registro: no hay nada que comparar."
                />
              )
            ) : (
              /* El diff, sin arcoíris: lo que cambió se marca con una barra y
                 se escribe en tinta plena; lo que no cambió se apaga a gris.
                 Dos niveles de gris y un acento bastan para que el ojo caiga
                 solo en los renglones que importan. */
              <div className={s.diffMarco}>
                <table className={s.diff}>
                  <thead>
                    <tr>
                      {["Campo", "Antes", "Después"].map((h) => (
                        <th key={h} scope="col" className={h === "Campo" ? s.colCampo : s.colValor}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((f) => {
                      const cambio = f.cambio && !!antes;
                      return (
                        <tr key={f.campo} data-cambio={cambio ? "true" : undefined}>
                          <th scope="row">
                            <span title={f.campo}>{auditFieldLabel(f.campo)}</span>
                          </th>
                          <td>{antes ? texto(f.antes) : "—"}</td>
                          <td>{texto(f.despues)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {contextoHttp(abierta) && (
              <details className={s.tecnico}>
                <summary>Contexto técnico de la petición</summary>
                <pre>{JSON.stringify(contextoHttp(abierta), null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      </Modal>
    </MesaPagina>
  );
}
