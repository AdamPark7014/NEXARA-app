"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import {
  Alert,
  Badge,
  Button,
  DateInput,
  EmptyState,
  Field,
  FieldGrid,
  Input,
  ModulePage,
  Select,
  SkeletonRows,
} from "@/components/base";
import { ClienteRapido } from "@/components/erp/ClienteRapido";
import { useUser } from "@/components/UserContext";
import { formatMinutes, shortName } from "@/lib/activity-labels";
import { useCronometroProceso } from "@/lib/cronometro-proceso";
import { formatApiError } from "@/lib/erp-api";
import {
  ajustarCantidad,
  aplicarFormato,
  borradorDesdeActividad,
  faltanteParaAsignar,
  hoyMx,
  jornadasDe,
  listarFormatos,
  renglonParaAplicar,
  renglonesParaAplicar,
  resumenEvidencia,
  siguienteDiaLaboral,
  type BorradorFormato,
  type FormatoActividad,
  type RenglonAplicar,
  type ResultadoAplicar,
} from "@/lib/formatos-actividad";
import {
  listAssignableUsers,
  listOperationalProjects,
  type AssignableUserOption,
  type OperationalProjectRow,
} from "@/lib/ops-activities-api";
import {
  getClientPermissions,
  listSalesClients,
  provisionSalesServiceClient,
  type SalesClient,
} from "@/lib/sales-api";
import DetalleRenglon from "./DetalleRenglon";
import EditorFormato from "./EditorFormato";
import s from "./formatos.module.css";

const META_SEGUNDOS = 30;
const MAX_CANTIDAD = 200;

const armarCliente = (nombre: string) => ({
  name: nombre,
  status: "Activo" as const,
  tipo: "CORPORATIVO" as const,
  altaRapida: true,
});

/** Etiqueta para lo que no es un solo control: `Field` es un <label> y robaría sus clics. */
function Grupo({ label, optional, required, children }: { label: string; optional?: boolean; required?: boolean; children: ReactNode }) {
  return (
    <div className={s.grupo}>
      <span className={s.etiqueta}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
        {optional ? <span className={s.opcional}> · opcional</span> : null}
      </span>
      {children}
    </div>
  );
}

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function FormatosActividad() {
  const { token } = useUser();
  const parametros = useSearchParams();
  const desde = Number(parametros.get("desde")) || null;

  const [formatos, setFormatos] = useState<FormatoActividad[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [personas, setPersonas] = useState<AssignableUserOption[]>([]);
  const [clientes, setClientes] = useState<SalesClient[]>([]);
  const [proyectos, setProyectos] = useState<OperationalProjectRow[]>([]);
  const [puedeCrearCliente, setPuedeCrearCliente] = useState(false);

  const [elegidoId, setElegidoId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [renglones, setRenglones] = useState<RenglonAplicar[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cliente, setCliente] = useState<SalesClient | null>(null);
  const [clienteServicioId, setClienteServicioId] = useState<number | null>(null);
  const [sucursal, setSucursal] = useState("");
  const [proyectoId, setProyectoId] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [equipoIds, setEquipoIds] = useState<number[]>([]);
  const [fecha, setFecha] = useState(() => siguienteDiaLaboral());
  const [hora, setHora] = useState("");
  // Mientras nadie la toque, la hora sigue la entrada de quien lo lleva.
  const [horaAMano, setHoraAMano] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoAplicar | null>(null);
  const [intento, setIntento] = useState(false);
  const clave = useRef(crypto.randomUUID());

  const [editor, setEditor] = useState<{ id: number | null; inicial: BorradorFormato | null } | null>(null);

  // Lo que se le enseña a quien asigna; lo que se guarda lo mide `useCronometroProceso`.
  const cronometro = useCronometroProceso("asignar_formato", token, { manual: true });
  const [inicio, setInicio] = useState<number | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [clics, setClics] = useState(0);

  const arrancar = () => {
    if (resultado || inicio != null) return;
    cronometro.arrancar();
    setInicio(Date.now());
  };

  const reiniciarReloj = () => {
    cronometro.descartar();
    setInicio(null);
    setSegundos(0);
    setClics(0);
  };

  useEffect(() => {
    if (inicio == null || resultado) return;
    const t = setInterval(() => setSegundos(Math.round((Date.now() - inicio) / 1000)), 500);
    return () => clearInterval(t);
  }, [inicio, resultado]);

  const elegir = useCallback((f: FormatoActividad) => {
    const n = f.receta.unidad ? f.receta.cantidadPorOmision : 1;
    setElegidoId(f.id);
    setCantidad(n);
    setRenglones(renglonesParaAplicar(f.receta, n));
    setAbierto(null);
  }, []);

  const cargarFormatos = useCallback(
    async (quedarseEn?: number | null) => {
      if (!token) return;
      try {
        const lista = await listarFormatos(token);
        setFormatos(lista);
        setErrorCarga(null);
        const siguiente = lista.find((f) => f.id === quedarseEn) ?? lista[0];
        if (siguiente) elegir(siguiente);
        else setElegidoId(null);
      } catch (e) {
        setErrorCarga(formatApiError(e));
      }
    },
    [token, elegir],
  );

  useEffect(() => {
    if (!token) return;
    void cargarFormatos();
    void listAssignableUsers(token).then(setPersonas).catch(() => setPersonas([]));
    void listSalesClients(token)
      .then((c) => setClientes([...c].sort((a, b) => a.name.localeCompare(b.name, "es"))))
      .catch(() => setClientes([]));
    void listOperationalProjects(token)
      .then((p) => setProyectos(p.filter((x) => x.status === "ACTIVE")))
      .catch(() => setProyectos([]));
    void getClientPermissions(token)
      .then((p) => setPuedeCrearCliente(Boolean(p.puedeAltaRapida)))
      .catch(() => setPuedeCrearCliente(false));
  }, [token, cargarFormatos]);

  // «Guardar como formato» desde una actividad: abre el editor con lo que ya se hizo.
  useEffect(() => {
    if (!token || !desde) return;
    void borradorDesdeActividad(token, desde)
      .then((inicial) => setEditor({ id: null, inicial }))
      .catch((e) => setError(formatApiError(e)));
  }, [token, desde]);

  const elegido = formatos?.find((f) => f.id === elegidoId) ?? null;
  const total = useMemo(() => renglones.reduce((suma, r) => suma + r.minutos, 0), [renglones]);
  const proyectosDelCliente = useMemo(
    () => proyectos.filter((p) => clienteServicioId != null && p.client.id === clienteServicioId),
    [proyectos, clienteServicioId],
  );
  const responsable = personas.find((p) => String(p.id) === responsableId) ?? null;
  const requiereCliente = renglones.some((r) => r.coreKind === "servicio");
  const faltante = faltanteParaAsignar({
    responsableId,
    fecha,
    clienteId: clienteServicioId,
    proyectoId: proyectoId ? Number(proyectoId) : null,
    renglones,
  });

  const cambiarCantidad = (n: number) => {
    const c = Math.min(MAX_CANTIDAD, Math.max(1, n));
    setCantidad(c);
    setRenglones((r) => ajustarCantidad(r, c));
  };

  const cambiarRenglon = (clave: string, cambios: Partial<RenglonAplicar>) =>
    setRenglones((lista) => lista.map((r) => (r.clave === clave ? { ...r, ...cambios } : r)));

  const usarCliente = async (c: SalesClient) => {
    setCliente(c);
    setProyectoId("");
    setClienteServicioId(c.serviceClientId ?? null);
    if (c.serviceClientId || !token) return;
    try {
      const { serviceClient } = await provisionSalesServiceClient(token, c.id);
      setClienteServicioId(serviceClient.id);
    } catch (e) {
      setError(formatApiError(e));
    }
  };

  const asignar = async () => {
    if (!token || !elegido) return;
    setIntento(true);
    if (faltante) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await aplicarFormato(token, elegido.id, {
        clave: clave.current,
        responsableId: Number(responsableId),
        equipoIds,
        fecha,
        hora: hora || null,
        clientId: clienteServicioId,
        projectId: proyectoId ? Number(proyectoId) : null,
        sucursal: sucursal.trim() || null,
        renglones: renglones.map(({ clave: _clave, minutosEditado: _editado, ...resto }) => resto),
      });
      setResultado(r);
      setSegundos(inicio == null ? 0 : Math.round((Date.now() - inicio) / 1000));
      if (r.actividades.length) {
        void cronometro.terminar(r.actividades[0].id, plural(r.actividades.length, "actividad", "actividades"));
      }
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setEnviando(false);
    }
  };

  const asignarOtro = () => {
    clave.current = crypto.randomUUID();
    setResultado(null);
    setIntento(false);
    reiniciarReloj();
    setCliente(null);
    setClienteServicioId(null);
    setSucursal("");
    setProyectoId("");
    setResponsableId("");
    setEquipoIds([]);
    setHora("");
    setHoraAMano(false);
    setFecha(siguienteDiaLaboral());
    void cargarFormatos(elegidoId);
  };

  const n = renglones.length;
  const j = jornadasDe(total);

  const pantalla = (
    <ModulePage
      title="Asignar con un formato"
      description="Elige un formato, ajusta y asigna. Las actividades salen con sus fotos, tiempos y herramientas."
      breadcrumbs={[{ label: "Actividades", href: "/erp/pizarra" }, { label: "Formatos" }]}
      back={{ href: "/erp/pizarra", label: "Volver a la pizarra" }}
      secondaryActions={
        <div className={s.acciones}>
          {formatos?.length ? (
            <dl className={s.kpis}>
              <div>
                <dt>Tu tiempo</dt>
                <dd data-tarde={segundos > META_SEGUNDOS ? "true" : undefined}>{segundos} s</dd>
              </div>
              <div>
                <dt>Clics</dt>
                <dd>{clics}</dd>
              </div>
              <div>
                <dt>Meta</dt>
                <dd data-meta="true">{META_SEGUNDOS} s</dd>
              </div>
            </dl>
          ) : null}
          <Button iconStart={<AddRoundedIcon />} onClick={() => setEditor({ id: null, inicial: null })}>
            Nuevo formato
          </Button>
        </div>
      }
      before={
        error ? (
          <Alert tone="danger" role="alert" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        ) : null
      }
      card={false}
    >
      {errorCarga ? (
        <Alert
          tone="warning"
          role="alert"
          action={
            <Button size="sm" variant="tertiary" onClick={() => void cargarFormatos()}>
              Reintentar
            </Button>
          }
        >
          {errorCarga}
        </Alert>
      ) : formatos == null ? (
        <SkeletonRows rows={5} label="Cargando formatos" />
      ) : !formatos.length ? (
        <EmptyState
          title="Todavía no hay formatos"
          description="Crea el primero o guarda una actividad ya hecha como formato."
          action={<Button onClick={() => setEditor({ id: null, inicial: null })}>Nuevo formato</Button>}
        />
      ) : (
        <div
          className={s.rejilla}
          onClickCapture={() => {
            if (resultado) return;
            setClics((c) => c + 1);
            arrancar();
          }}
          onChangeCapture={arrancar}
        >
          <section className={s.panel} aria-labelledby="mis-formatos">
            <h2 id="mis-formatos" className={s.titulo}>
              Mis formatos
            </h2>
            <div className={s.lista}>
              {formatos.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={s.formato}
                  aria-pressed={f.id === elegidoId}
                  onClick={() => elegir(f)}
                >
                  <b>{f.nombre}</b>
                  <small>
                    {plural(f.receta.renglones.length, "actividad", "actividades")}
                    {f.usos ? ` · se usó ${plural(f.usos, "vez", "veces")}` : ""}
                  </small>
                </button>
              ))}
            </div>
            <p className={s.pista}>También se crea un formato guardando una actividad ya hecha, desde su menú.</p>
          </section>

          <section className={s.panel} aria-label={elegido ? `Asignar ${elegido.nombre}` : "Asignar"}>
            {elegido ? (
              <div className={s.cabeza}>
                <div>
                  <h2 className={s.titulo}>{elegido.nombre}</h2>
                  {elegido.descripcion ? <p className={s.pista}>{elegido.descripcion}</p> : null}
                </div>
                <Button
                  size="sm"
                  variant="tertiary"
                  iconStart={<EditOutlinedIcon fontSize="inherit" />}
                  onClick={() =>
                    setEditor({
                      id: elegido.id,
                      inicial: { nombre: elegido.nombre, descripcion: elegido.descripcion, receta: elegido.receta },
                    })
                  }
                >
                  Editar formato
                </Button>
              </div>
            ) : null}

            <FieldGrid>
              <Grupo label="Cliente" required={requiereCliente} optional={!requiereCliente}>
                <ClienteRapido
                  token={token ?? ""}
                  clientes={clientes}
                  salesClientId={cliente?.id ?? null}
                  editable={!resultado}
                  puedeCrear={puedeCrearCliente}
                  armar={armarCliente}
                  onElegido={(c) => void usarCliente(c)}
                  inputId="formato-cliente"
                  ariaLabel="Cliente"
                />
              </Grupo>
              <Field label="Sucursal" optional>
                <Input
                  id="formato-sucursal"
                  value={sucursal}
                  maxLength={160}
                  placeholder="Angelópolis"
                  onChange={(e) => setSucursal(e.target.value)}
                />
              </Field>
              {proyectosDelCliente.length ? (
                <Field label="Proyecto" optional>
                  <Select id="formato-proyecto" value={proyectoId} onChange={(e) => setProyectoId(e.target.value)}>
                    <option value="">Sin proyecto</option>
                    {proyectosDelCliente.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Field label="Quién" required error={intento && !responsableId ? "Elige quién la lleva" : undefined}>
                <Select
                  id="formato-quien"
                  value={responsableId}
                  onChange={(e) => {
                    setResponsableId(e.target.value);
                    setEquipoIds((ids) => ids.filter((id) => String(id) !== e.target.value));
                    if (!horaAMano) setHora(personas.find((p) => String(p.id) === e.target.value)?.horaEntrada ?? "");
                  }}
                >
                  <option value="">Elige a la persona</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
              <Grupo label="Con quién más" optional>
                <Select
                  id="formato-equipo"
                  aria-label="Con quién más"
                  value=""
                  disabled={!responsableId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    if (id) setEquipoIds((ids) => [...ids, id]);
                  }}
                >
                  <option value="">Sumar a alguien</option>
                  {personas
                    .filter((p) => String(p.id) !== responsableId && !equipoIds.includes(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                </Select>
                {equipoIds.length ? (
                  <div className={s.chips}>
                    {equipoIds.map((id) => {
                      const nombre = shortName(personas.find((p) => p.id === id)?.nombre) || `#${id}`;
                      return (
                        <button
                          key={id}
                          type="button"
                          className={s.chip}
                          aria-label={`Quitar a ${nombre}`}
                          onClick={() => setEquipoIds((ids) => ids.filter((x) => x !== id))}
                        >
                          {nombre}
                          <CloseRoundedIcon fontSize="inherit" />
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </Grupo>
              <Grupo label="Cuándo" required>
                <div className={s.cuando}>
                  <DateInput
                    id="formato-dia"
                    aria-label="Día de inicio"
                    value={fecha}
                    min={hoyMx()}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                  <Input
                    id="formato-hora"
                    type="time"
                    aria-label="Hora de inicio"
                    title="Sin hora, a la de su entrada"
                    value={hora}
                    onChange={(e) => {
                      setHora(e.target.value);
                      setHoraAMano(true);
                    }}
                  />
                </div>
              </Grupo>
              {elegido?.receta.unidad ? (
                <Grupo label={elegido.receta.unidad}>
                  <div className={s.stepper}>
                    <Button
                      icon
                      aria-label={`Menos ${elegido.receta.unidad.toLowerCase()}`}
                      disabled={cantidad <= 1}
                      onClick={() => cambiarCantidad(cantidad - 1)}
                    >
                      <RemoveRoundedIcon fontSize="inherit" />
                    </Button>
                    <Input
                      id="formato-cantidad-aplicar"
                      type="number"
                      min={1}
                      max={MAX_CANTIDAD}
                      aria-label={`Cantidad de ${elegido.receta.unidad.toLowerCase()}`}
                      value={cantidad}
                      onChange={(e) => cambiarCantidad(Number(e.target.value) || 1)}
                    />
                    <Button
                      icon
                      aria-label={`Más ${elegido.receta.unidad.toLowerCase()}`}
                      disabled={cantidad >= MAX_CANTIDAD}
                      onClick={() => cambiarCantidad(cantidad + 1)}
                    >
                      <AddRoundedIcon fontSize="inherit" />
                    </Button>
                  </div>
                </Grupo>
              ) : null}
            </FieldGrid>

            <div className={s.renglones}>
              {renglones.map((r, i) => (
                <div className={s.renglon} key={r.clave}>
                  <div className={s.fila}>
                    <Input
                      id={`renglon-${r.clave}`}
                      aria-label={`Título de la actividad ${i + 1}`}
                      value={r.titulo}
                      maxLength={200}
                      invalid={intento && !r.titulo.trim()}
                      onChange={(e) => cambiarRenglon(r.clave, { titulo: e.target.value })}
                    />
                    <Input
                      id={`minutos-${r.clave}`}
                      type="number"
                      min={5}
                      aria-label={`Minutos de ${r.titulo || `la actividad ${i + 1}`}`}
                      value={r.minutos}
                      end={<span className={s.sufijo}>min</span>}
                      onChange={(e) =>
                        cambiarRenglon(r.clave, { minutos: Math.max(0, Number(e.target.value) || 0), minutosEditado: true })
                      }
                      onBlur={() => cambiarRenglon(r.clave, { minutos: Math.max(5, r.minutos) })}
                    />
                    <button
                      type="button"
                      className={s.evidencia}
                      aria-expanded={abierto === r.clave}
                      title="Cambiar fotos, herramientas e indicaciones"
                      onClick={() => setAbierto((a) => (a === r.clave ? null : r.clave))}
                    >
                      {resumenEvidencia(r)}
                      {r.herramientas.length ? ` · ${plural(r.herramientas.length, "herramienta", "herramientas")}` : ""}
                    </button>
                    <Button
                      size="sm"
                      variant="tertiary"
                      icon
                      aria-label={`Quitar ${r.titulo || `la actividad ${i + 1}`}`}
                      onClick={() => setRenglones((lista) => lista.filter((x) => x.clave !== r.clave))}
                    >
                      <CloseRoundedIcon fontSize="inherit" />
                    </Button>
                  </div>
                  {abierto === r.clave ? (
                    <DetalleRenglon id={r.clave} renglon={r} onCambio={(c) => cambiarRenglon(r.clave, c)} />
                  ) : null}
                </div>
              ))}
              <div>
                <Button
                  size="sm"
                  variant="tertiary"
                  iconStart={<AddRoundedIcon fontSize="inherit" />}
                  onClick={() => {
                    const nuevo = renglonParaAplicar(cantidad);
                    setRenglones((lista) => [...lista, nuevo]);
                  }}
                >
                  Agregar actividad
                </Button>
              </div>
            </div>

            <div className={s.pie}>
              <span className={s.total}>
                Total {formatMinutes(total) ?? "0 min"} · cabe en {plural(j, "jornada", "jornadas")}
                {intento && faltante ? <b className={s.falta}> · {faltante}</b> : null}
              </span>
              <Button
                variant="primary"
                loading={enviando}
                disabled={!n || Boolean(resultado)}
                onClick={() => void asignar()}
              >
                {`Asignar ${plural(n, "actividad", "actividades")}`}
              </Button>
            </div>

            {resultado ? (
              <div className={s.listo} role="status">
                {resultado.actividades.length ? (
                  <p>
                    <b>
                      Listo en {segundos} s y {plural(clics, "clic", "clics")}:
                    </b>{" "}
                    {plural(resultado.actividades.length, "actividad", "actividades")} para{" "}
                    {shortName(responsable?.nombre) || "la persona elegida"}
                    {cliente ? ` en ${cliente.name}` : ""}
                    {sucursal.trim() ? ` · ${sucursal.trim()}` : ""}, con fotos y tiempos. Cada una se puede abrir y
                    editar.
                  </p>
                ) : null}
                {resultado.actividades.length ? (
                  <ul className={s.creadas}>
                    {resultado.actividades.map((a) => (
                      <li key={a.id}>
                        <Link href={`/erp/actividades/${a.id}`}>
                          {a.anNumber ? <Badge>{a.anNumber}</Badge> : null} {a.titulo}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {resultado.fallidas.length ? (
                  <Alert tone="danger" role="alert">
                    No se pudieron crear:{" "}
                    {resultado.fallidas.map((f) => `${f.titulo} (${f.motivo})`).join("; ")}
                  </Alert>
                ) : null}
                <div>
                  <Button variant="secondary" onClick={asignarOtro}>
                    Asignar otro
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </ModulePage>
  );

  return (
    <>
      {pantalla}
      {token ? (
        <EditorFormato
          token={token}
          abierto={editor != null}
          formatoId={editor?.id ?? null}
          inicial={editor?.inicial ?? null}
          onCerrar={() => {
            setEditor(null);
            // Editar el formato no es tiempo de asignar.
            if (!resultado) reiniciarReloj();
          }}
          onGuardado={(id) => {
            setEditor(null);
            if (!resultado) reiniciarReloj();
            void cargarFormatos(id);
          }}
        />
      ) : null}
    </>
  );
}

export default function FormatosActividadPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={5} label="Cargando formatos" />}>
      <FormatosActividad />
    </Suspense>
  );
}
