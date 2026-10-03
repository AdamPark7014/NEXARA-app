"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import { useUser } from "@/components/UserContext";
import {
  Alert,
  Button,
  ButtonLink,
  Checkbox,
  DateInput,
  Field,
  FieldGrid,
  FormFooter,
  FormPage,
  FormSection,
  Input,
  LinkButton,
  SearchInput,
  Select,
  Textarea,
  type PendingItem,
} from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import { DatosClienteOpcionales } from "@/components/erp/DatosCliente";
import { clientSectorsForUser } from "@/lib/client-sectors";
import {
  createSalesClient,
  getClientPermissions,
  getSalesClient,
  listSalesClients,
  provisionSalesServiceClient,
  type SalesClient,
} from "@/lib/sales-api";
import { listarCotizaciones, type CotizacionRow } from "@/lib/cotizaciones-api";
import {
  ROLES_EQUIPO,
  ROL_EQUIPO_LABEL,
  TIPOS_ALCANCE,
  TIPO_ALCANCE_AYUDA,
  TIPO_ALCANCE_LABEL,
  crearProyecto,
  formatoFecha,
  formatoMoneda,
  type RolEquipo,
  type TipoAlcance,
} from "@/lib/proyectos-api";
import {
  ETAPAS_SUGERIDAS,
  PASOS_ALTA,
  REQUERIMIENTOS_SUGERIDOS,
  borradorVacio,
  cuerpoDeAlta,
  erroresDelBorrador,
  erroresDelPaso,
  leerImporte,
  type BorradorProyecto,
  type PasoAlta,
} from "@/lib/proyecto-alta";
import { hoyISO, repartirFechas } from "@/lib/proyecto-plan";
import { SERVICE_PROJECT_TYPE_OPTIONS, getServiceProjectTypeLabel } from "@/lib/service-project-types";
import LineaDeTiempo from "../_componentes/LineaDeTiempo";
import { PersonaSelect, usePersonasAsignables } from "../_componentes/personas";
import styles from "../alta.module.css";

let secuencia = 0;
const nuevaClave = () => `r${Date.now().toString(36)}${(secuencia++).toString(36)}`;

function mover<T>(lista: T[], desde: number, hacia: number): T[] {
  if (hacia < 0 || hacia >= lista.length) return lista;
  const copia = [...lista];
  const [item] = copia.splice(desde, 1);
  copia.splice(hacia, 0, item);
  return copia;
}

/** Qué se decide en cada paso, en una línea bajo su título. */
const AYUDA_PASO: Record<PasoAlta, string> = {
  datos: "Qué es el proyecto y de qué cliente del padrón cuelga.",
  fechas: "Plan de fechas, quién lo lleva y con cuánto dinero se cuenta.",
  cronograma:
    "Divide el proyecto en etapas con fecha y responsable. Cada etapa va desde que termina la anterior hasta su fecha. Cuando se cumpla, se marca en el proyecto y el avance se mueve solo.",
  alcance: "Lo que se entrega, lo que no y lo que se da por hecho.",
  requerimientos:
    "Lo que hace falta para poder entregar: papeles, permisos, anticipos, información del cliente. En el proyecto se palomean conforme se consiguen.",
  equipo:
    "Quiénes trabajan en el proyecto y con qué papel. Solo puedes sumar a gente de tu equipo; si alguien queda fuera, el sistema te lo dirá al crear.",
  revisar: "Todo en un solo paso al final. Lo que no tengas ahora lo puedes agregar después.",
};

/** Botón cuadrado de renglón (subir, bajar, quitar). */
function BotonRenglon({ etiqueta, titulo, onClick, disabled, children }: { etiqueta: string; titulo: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Button variant="ghost" size="sm" icon aria-label={etiqueta} title={titulo} onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

export default function NuevoProyectoPage() {
  const router = useRouter();
  const { user, token } = useUser();
  const hoy = useMemo(() => hoyISO(), []);

  const [b, setB] = useState<BorradorProyecto>(() => borradorVacio(hoy, user?.id ? String(user.id) : ""));

  // Desde una cotización o un cliente: /erp/proyectos/nuevo?clienteId=…&cotizacionId=…
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const clienteId = qs.get("clienteId") ?? "";
    const cotizacionId = qs.get("cotizacionId") ?? "";
    if (clienteId || cotizacionId) {
      setB((prev) => ({
        ...prev,
        clienteId: prev.clienteId || clienteId,
        cotizacionId: prev.cotizacionId || cotizacionId,
      }));
    }
  }, []);
  const [paso, setPaso] = useState<PasoAlta>("datos");
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientes, setClientes] = useState<SalesClient[]>([]);
  const [cargandoClientes, setCargandoClientes] = useState(true);
  const [errorClientes, setErrorClientes] = useState<string | null>(null);
  const [puedeAgregarCliente, setPuedeAgregarCliente] = useState(false);
  const [puedeEditarCliente, setPuedeEditarCliente] = useState(false);
  const [altaNombre, setAltaNombre] = useState("");
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [altaGuardando, setAltaGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const [buscarCliente, setBuscarCliente] = useState("");
  const [cotizaciones, setCotizaciones] = useState<CotizacionRow[]>([]);
  const [errorCotizaciones, setErrorCotizaciones] = useState<string | null>(null);

  const yo = useMemo(() => (user?.id ? { id: user.id, nombre: user.nombre } : null), [user?.id, user?.nombre]);
  const { personas, aviso: avisoPersonas } = usePersonasAsignables(token, yo);

  const primerRender = useRef(true);

  // El usuario puede llegar después del primer render: el responsable por omisión es quien crea.
  useEffect(() => {
    if (user?.id && !b.responsableId) setB((prev) => ({ ...prev, responsableId: String(user.id) }));
  }, [user?.id, b.responsableId]);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    setCargandoClientes(true);
    listSalesClients(token, { sector: "PROYECTO" })
      .then((rows) => {
        if (!vivo) return;
        setClientes([...rows].sort((x, y) => x.name.localeCompare(y.name, "es")));
        setErrorClientes(null);
      })
      .catch((e) => vivo && setErrorClientes(formatApiError(e, "No se pudieron cargar los clientes")))
      .finally(() => vivo && setCargandoClientes(false));
    getClientPermissions(token)
      .then((p) => {
        if (!vivo) return;
        setPuedeAgregarCliente(Boolean(p?.puedeAgregar));
        setPuedeEditarCliente(Boolean(p?.puedeEditar));
      })
      .catch(() => {
        if (!vivo) return;
        setPuedeAgregarCliente(false);
        setPuedeEditarCliente(false);
      });
    listarCotizaciones(token)
      .then((rows) => vivo && setCotizaciones(rows))
      .catch(() => vivo && setErrorCotizaciones("No se pudieron cargar las cotizaciones; puedes ligarla después."));
    return () => {
      vivo = false;
    };
  }, [token]);

  // Llegó desde la ficha de un cliente que todavía no es de proyecto (comercial o corporativo):
  // no viene en la lista de proyecto, pero el proyecto se le abre igual y, al crearlo, el
  // servidor lo deja además como cliente de proyecto.
  useEffect(() => {
    if (!token || cargandoClientes || !b.clienteId) return;
    const id = Number(b.clienteId);
    if (!Number.isInteger(id) || id <= 0 || clientes.some((c) => c.id === id)) return;
    let vivo = true;
    getSalesClient(token, id)
      .then((c) => {
        if (!vivo || !c?.id) return;
        setClientes((prev) =>
          prev.some((x) => x.id === c.id) ? prev : [...prev, c].sort((x, y) => x.name.localeCompare(y.name, "es")),
        );
      })
      // Sin acceso a ese cliente (o ya no existe): se vuelve a pedir que elija uno.
      .catch(() => vivo && setB((prev) => (prev.clienteId === String(id) ? { ...prev, clienteId: "" } : prev)));
    return () => {
      vivo = false;
    };
  }, [token, cargandoClientes, b.clienteId, clientes]);

  // Al cambiar de paso, el foco va al título: quien usa lector de pantalla sabe dónde está.
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    const titulo = document.querySelector<HTMLElement>("#paso-actual h2");
    if (titulo) {
      titulo.tabIndex = -1;
      titulo.focus();
    }
  }, [paso]);

  const cambiar = <K extends keyof BorradorProyecto>(campo: K, valor: BorradorProyecto[K]) =>
    setB((prev) => ({ ...prev, [campo]: valor }));

  const clienteElegido = useMemo(() => clientes.find((c) => String(c.id) === b.clienteId) ?? null, [clientes, b.clienteId]);

  const clientesVisibles = useMemo(() => {
    const t = buscarCliente.trim().toLowerCase();
    const filtrados = t
      ? clientes.filter((c) =>
          [c.name, c.legalName, c.taxId].some((v) => (v ?? "").toLowerCase().includes(t)),
        )
      : clientes;
    // El elegido no desaparece del select aunque el filtro no lo incluya.
    return clienteElegido && !filtrados.includes(clienteElegido) ? [clienteElegido, ...filtrados] : filtrados;
  }, [clientes, buscarCliente, clienteElegido]);

  /** Las cotizaciones del cliente elegido primero; el servidor valida que sea de tu empresa. */
  const cotizacionesOrdenadas = useMemo(() => {
    const nombre = (clienteElegido?.name ?? "").toLowerCase();
    const delCliente = (c: CotizacionRow) =>
      Boolean(nombre) &&
      [c.clienteNombre, c.clienteEmpresa].some((v) => (v ?? "").toLowerCase().includes(nombre));
    return [...cotizaciones].sort((x, y) => Number(delCliente(y)) - Number(delCliente(x)));
  }, [cotizaciones, clienteElegido]);

  const cotizacionElegida = cotizaciones.find((c) => String(c.id) === b.cotizacionId) ?? null;
  const indice = PASOS_ALTA.findIndex((p) => p.id === paso);
  const erroresActuales = erroresDelPaso(paso, b);
  const nombrePersona = (id: string) => personas.find((p) => String(p.id) === id)?.nombre ?? "";
  const marcarInvalido = mostrarErrores && erroresActuales.length > 0;

  function irA(destino: PasoAlta) {
    setMostrarErrores(false);
    setPaso(destino);
  }

  function siguiente() {
    if (erroresActuales.length) {
      setMostrarErrores(true);
      return;
    }
    const proximo = PASOS_ALTA[indice + 1];
    if (proximo) irA(proximo.id);
  }

  async function crear() {
    if (!token) return;
    const pendientes = erroresDelBorrador(b);
    if (pendientes.length) {
      const primero = PASOS_ALTA.find((p) => erroresDelPaso(p.id, b).length);
      if (primero) {
        setPaso(primero.id);
        setMostrarErrores(true);
      }
      return;
    }
    const cliente = clienteElegido;
    if (!cliente) return;
    setGuardando(true);
    setError(null);
    try {
      // El proyecto se liga al cliente de operación. Si aún no existe, se activa (es idempotente).
      let clientId = cliente.serviceClientId ?? null;
      if (!clientId) {
        try {
          const activado = await provisionSalesServiceClient(token, cliente.id);
          clientId = activado.serviceClient.id;
          setClientes((prev) => prev.map((c) => (c.id === cliente.id ? { ...c, serviceClientId: clientId } : c)));
        } catch (e) {
          throw new Error(
            `«${cliente.name}» todavía no está activo en operación y no se pudo activar (${formatApiError(
              e,
              "sin detalle",
            )}). Pídeselo a administración o elige otro cliente.`,
          );
        }
      }
      const creado = await crearProyecto(token, cuerpoDeAlta(b, clientId));
      router.replace(`/erp/proyectos/${creado.id}`);
    } catch (e) {
      setError(formatApiError(e, "No se pudo crear el proyecto"));
      setGuardando(false);
    }
  }

  /** Alta rápida del cliente desde el asistente: el 403 del padrón se enseña tal cual. */
  function crearClienteRapido() {
    if (!token) return;
    setAltaGuardando(true);
    setErrorAlta(null);
    createSalesClient(
      token,
      puedeAgregarCliente && clientSectorsForUser(user).includes("PROYECTO")
        ? { name: altaNombre.trim(), status: "Activo", tipo: "PROYECTO", sectors: ["PROYECTO"] }
        : { name: altaNombre.trim(), status: "Activo", tipo: "PROYECTO", altaProyecto: true },
    )
      .then((creado) => {
        setClientes((prev) =>
          [...prev.filter((c) => c.id !== creado.id), creado].sort((x, y) => x.name.localeCompare(y.name, "es")),
        );
        cambiar("clienteId", String(creado.id));
        setAltaNombre("");
        setAltaAbierta(false);
      })
      .catch((e) => setErrorAlta(formatApiError(e, "No se pudo dar de alta el cliente")))
      .finally(() => setAltaGuardando(false));
  }

  // --- Renglones -----------------------------------------------------------

  const agregarEtapa = (name = "", plannedDate = "") =>
    cambiar("etapas", [...b.etapas, { clave: nuevaClave(), name, plannedDate, responsableId: "" }]);

  const usarEtapasTipicas = () => {
    const fechas = repartirFechas(b.startDate || hoy, b.endDate, ETAPAS_SUGERIDAS.length);
    cambiar(
      "etapas",
      ETAPAS_SUGERIDAS.map((name, i) => ({
        clave: nuevaClave(),
        name,
        plannedDate: fechas[i] ?? "",
        responsableId: b.responsableId,
      })),
    );
  };

  const agregarAlcance = (kind: TipoAlcance) =>
    cambiar("alcance", [...b.alcance, { clave: nuevaClave(), kind, titulo: "", detalle: "" }]);

  const agregarRequerimiento = (titulo = "") =>
    cambiar("requerimientos", [...b.requerimientos, { clave: nuevaClave(), titulo, responsableId: "", dueDate: "" }]);

  const agregarMiembro = () =>
    cambiar("equipo", [...b.equipo, { clave: nuevaClave(), userId: "", role: "APOYO" as RolEquipo, notas: "" }]);

  const idsEnEquipo = b.equipo.map((m) => Number(m.userId)).filter(Boolean);
  const responsableNum = Number(b.responsableId) || 0;

  // --- Pasos ---------------------------------------------------------------

  function pasoDatos() {
    const errorTitulo = marcarInvalido && b.title.trim().length < 3;
    const errorCliente = marcarInvalido && !b.clienteId;
    return (
      <>
        <Field label="Nombre del proyecto" required fullWidth>
          <Input
            id="titulo"
            value={b.title}
            onChange={(e) => cambiar("title", e.target.value)}
            placeholder="Ej. Videovigilancia Plaza Norte, etapa 2"
            maxLength={220}
            invalid={errorTitulo}
          />
        </Field>

        <div className={styles.bloqueCliente}>
          <label className={styles.etiqueta} htmlFor="cliente">
            Cliente <span className={styles.obligatorio} aria-hidden="true">*</span>
          </label>
          <div className={styles.clienteFila}>
            <SearchInput
              id="buscarCliente"
              value={buscarCliente}
              onChange={(e) => setBuscarCliente(e.target.value)}
              // Enter aquí es «buscar», no «siguiente paso».
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              placeholder="Buscar por nombre, razón social o RFC"
              aria-label="Buscar cliente"
            />
            <Select
              id="cliente"
              value={b.clienteId}
              onChange={(e) => cambiar("clienteId", e.target.value)}
              aria-label="Cliente"
              required
              invalid={errorCliente}
            >
              <option value="">
                {cargandoClientes ? "Cargando clientes…" : `Elige un cliente (${clientesVisibles.length})`}
              </option>
              {clientesVisibles.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                  {c.legalName && c.legalName !== c.name ? ` — ${c.legalName}` : ""}
                </option>
              ))}
            </Select>
          </div>
          {errorClientes ? (
            <Alert tone="danger" dense>
              {errorClientes}
            </Alert>
          ) : null}
          {clienteElegido && !clienteElegido.serviceClientId ? (
            <p className={styles.ayuda}>Este cliente todavía no está activo en operación: se activará al crear el proyecto.</p>
          ) : null}
          {!cargandoClientes && !clientes.length && !errorClientes ? (
            <p className={styles.ayuda}>No tienes clientes a la vista. Da de alta uno aquí y sigue con el proyecto.</p>
          ) : null}
          {/* Quien puede crear el proyecto puede dar de alta a su cliente: con sus datos si
              administra el padrón de proyecto; si no, solo con el nombre (alta rápida) y los
              datos se completan después en Clientes. */}
          {token ? (
            altaAbierta ? (
              <div className={styles.altaRapida} role="group" aria-label="Alta rápida de cliente">
                <div className={styles.altaFila}>
                  <Input
                    value={altaNombre}
                    onChange={(e) => {
                      setAltaNombre(e.target.value);
                      if (errorAlta) setErrorAlta(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                    placeholder="Nombre del cliente nuevo"
                    aria-label="Nombre del cliente nuevo"
                    maxLength={160}
                    autoFocus
                  />
                  <Button variant="tertiary" disabled={altaGuardando} onClick={() => setAltaAbierta(false)}>
                    Cerrar
                  </Button>
                  <Button
                    variant="tonal"
                    loading={altaGuardando}
                    disabled={altaNombre.trim().length < 2}
                    onClick={crearClienteRapido}
                  >
                    Crear y usar
                  </Button>
                </div>
                <p className={styles.ayuda}>Solo con el nombre: sus datos fiscales se completan después en Clientes.</p>
                {errorAlta ? (
                  <Alert tone="danger" role="alert" srLabel="Error">
                    {errorAlta}
                  </Alert>
                ) : null}
              </div>
            ) : (
              <div>
                <Button variant="tertiary" size="sm" iconStart={<PersonAddAltOutlinedIcon />} onClick={() => setAltaAbierta(true)}>
                  Dar de alta un cliente
                </Button>
              </div>
            )
          ) : null}
          <DatosClienteOpcionales
            token={token}
            clientId={clienteElegido ? clienteElegido.id : null}
            puedeEditar={puedeEditarCliente && clientSectorsForUser(user).includes("PROYECTO")}
          />
        </div>

        <FieldGrid>
          <Field label="Tipo de proyecto" hint={SERVICE_PROJECT_TYPE_OPTIONS.find((o) => o.value === b.projectType)?.description ?? "Elige el que más se parezca."}>
            <Select id="tipo" value={b.projectType} onChange={(e) => cambiar("projectType", e.target.value)}>
              {SERVICE_PROJECT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Número de sitios">
            <Input
              id="sitios"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={b.siteCount}
              onChange={(e) => cambiar("siteCount", e.target.value)}
              placeholder="Ej. 3 sucursales"
            />
          </Field>
          <Field label="Descripción" fullWidth>
            <Textarea
              id="descripcion"
              rows={3}
              value={b.description}
              onChange={(e) => cambiar("description", e.target.value)}
              placeholder="Qué se va a hacer, en pocas palabras."
            />
          </Field>
          <Field label="Objetivo" fullWidth>
            <Textarea
              id="objetivo"
              rows={3}
              value={b.objective}
              onChange={(e) => cambiar("objective", e.target.value)}
              placeholder="Para qué lo quiere el cliente, en sus palabras. Ej. «Ver todas las entradas desde la oficina central»."
            />
          </Field>
        </FieldGrid>
      </>
    );
  }

  function pasoFechas() {
    const importe = leerImporte(b.budget);
    return (
      <FieldGrid>
        <Field label="Inicio planeado" hint="Opcional. Se puede anotar después, en el proyecto.">
          <DateInput id="inicio" value={b.startDate} onChange={(e) => cambiar("startDate", e.target.value)} />
        </Field>
        <Field label="Fin planeado" hint="Sin fin planeado no se puede saber si el proyecto va a tiempo.">
          <DateInput id="fin" value={b.endDate} min={b.startDate || undefined} onChange={(e) => cambiar("endDate", e.target.value)} />
        </Field>
        <Field
          label="Responsable del proyecto"
          fullWidth
          hint={
            <>
              Opcional. Si lo dejas vacío, el proyecto queda a nombre de quien lo crea.
              {avisoPersonas ? <span className={styles.avisoLinea}>{avisoPersonas}</span> : null}
            </>
          }
        >
          <PersonaSelect
            id="responsable"
            value={b.responsableId}
            onChange={(v) => cambiar("responsableId", v)}
            personas={personas}
            vacio="Sin responsable (queda quien lo crea)"
          />
        </Field>
        {/* La pista siempre está (cambia de texto): si apareciera y desapareciera, el campo se remontaría a media captura. */}
        <Field
          label="Presupuesto autorizado"
          hint={importe !== null && Number.isFinite(importe) ? formatoMoneda(importe, b.currency) : "Con o sin comas, por ejemplo 250,000."}
        >
          <Input id="presupuesto" inputMode="decimal" value={b.budget} onChange={(e) => cambiar("budget", e.target.value)} placeholder="Ej. 250,000" />
        </Field>
        <Field label="Moneda">
          <Select id="moneda" value={b.currency} onChange={(e) => cambiar("currency", e.target.value)}>
            <option value="MXN">Pesos mexicanos (MXN)</option>
            <option value="USD">Dólares (USD)</option>
          </Select>
        </Field>
        <Field label="Cotización de origen (opcional)" fullWidth hint={errorCotizaciones ?? "Las del cliente elegido salen primero."}>
          <Select id="cotizacion" value={b.cotizacionId} onChange={(e) => cambiar("cotizacionId", e.target.value)}>
            <option value="">Sin cotización</option>
            {cotizacionesOrdenadas.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.folio} · {c.clienteNombre || c.clienteEmpresa || "Sin cliente"} · {c.estadoEtiqueta}
              </option>
            ))}
          </Select>
        </Field>
        <div className={styles.completo}>
          <Checkbox
            checked={b.importarAlcance}
            disabled={!b.cotizacionId}
            onChange={(e) => cambiar("importarAlcance", e.target.checked)}
            label="Traer el alcance de la cotización como entregables"
            description={
              b.cotizacionId && b.importarAlcance
                ? "Al crear el proyecto se copian los bloques de alcance de la cotización. Así lo que se cotizó y lo que se entrega dicen lo mismo."
                : undefined
            }
          />
        </div>
      </FieldGrid>
    );
  }

  function pasoCronograma() {
    return (
      <>
        <div className={styles.barra}>
          <Button size="sm" iconStart={<AddRoundedIcon />} onClick={() => agregarEtapa()}>
            Agregar etapa
          </Button>
          {b.etapas.length === 0 ? (
            <Button size="sm" variant="tonal" iconStart={<AutoAwesomeOutlinedIcon />} onClick={usarEtapasTipicas}>
              Usar etapas típicas
            </Button>
          ) : null}
        </div>

        {b.etapas.length ? (
          <ol className={styles.renglones}>
            {b.etapas.map((e, i) => (
              <li key={e.clave} className={styles.renglon}>
                <span className={styles.numero} aria-hidden="true">
                  {i + 1}
                </span>
                <div className={styles.renglonCampos} data-cols="3">
                  <Field label={`Etapa ${i + 1}`}>
                    <Input
                      id={`etapa-${e.clave}`}
                      value={e.name}
                      onChange={(ev) =>
                        cambiar("etapas", b.etapas.map((x) => (x.clave === e.clave ? { ...x, name: ev.target.value } : x)))
                      }
                      placeholder="Ej. Instalación de cámaras"
                      maxLength={200}
                    />
                  </Field>
                  <Field label="Fecha planeada">
                    <DateInput
                      id={`etapa-fecha-${e.clave}`}
                      value={e.plannedDate}
                      onChange={(ev) =>
                        cambiar(
                          "etapas",
                          b.etapas.map((x) => (x.clave === e.clave ? { ...x, plannedDate: ev.target.value } : x)),
                        )
                      }
                    />
                  </Field>
                  <Field label="Responsable">
                    <PersonaSelect
                      id={`etapa-resp-${e.clave}`}
                      value={e.responsableId}
                      onChange={(v) =>
                        cambiar("etapas", b.etapas.map((x) => (x.clave === e.clave ? { ...x, responsableId: v } : x)))
                      }
                      personas={personas}
                    />
                  </Field>
                </div>
                <div className={styles.renglonAcciones}>
                  <BotonRenglon etiqueta={`Subir la etapa ${i + 1}`} titulo="Subir" disabled={i === 0} onClick={() => cambiar("etapas", mover(b.etapas, i, i - 1))}>
                    <ArrowUpwardRoundedIcon fontSize="small" />
                  </BotonRenglon>
                  <BotonRenglon
                    etiqueta={`Bajar la etapa ${i + 1}`}
                    titulo="Bajar"
                    disabled={i === b.etapas.length - 1}
                    onClick={() => cambiar("etapas", mover(b.etapas, i, i + 1))}
                  >
                    <ArrowDownwardRoundedIcon fontSize="small" />
                  </BotonRenglon>
                  <BotonRenglon etiqueta={`Quitar la etapa ${i + 1}`} titulo="Quitar" onClick={() => cambiar("etapas", b.etapas.filter((x) => x.clave !== e.clave))}>
                    <CloseRoundedIcon fontSize="small" />
                  </BotonRenglon>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.vacio}>Todavía no hay etapas. Puedes crear el proyecto sin ellas y agregarlas después.</p>
        )}

        {b.etapas.some((e) => e.plannedDate) ? (
          <div className={styles.hundido}>
            <h3 className={styles.subtitulo}>Así se ve el cronograma</h3>
            <LineaDeTiempo
              inicio={b.startDate}
              fin={b.endDate || null}
              hoy={hoy}
              etapas={b.etapas
                .filter((e) => e.name.trim())
                .map((e, i) => ({
                  id: i,
                  nombre: e.name,
                  plannedDate: e.plannedDate || null,
                  responsable: nombrePersona(e.responsableId).replace(/ \(yo\)$/, "") || null,
                }))}
            />
          </div>
        ) : null}
      </>
    );
  }

  function pasoAlcance() {
    return (
      <>
        <Field label="El alcance en una frase" fullWidth>
          <Input
            id="resumenAlcance"
            value={b.scopeSummary}
            onChange={(e) => cambiar("scopeSummary", e.target.value)}
            placeholder="Ej. Suministro e instalación de 32 cámaras IP con grabación centralizada"
          />
        </Field>

        {b.cotizacionId && b.importarAlcance ? (
          <Alert tone="info" dense>
            También se agregarán los entregables de la cotización {cotizacionElegida?.folio ?? ""} al crear el proyecto.
          </Alert>
        ) : null}

        {TIPOS_ALCANCE.map((kind) => {
          const renglones = b.alcance.filter((a) => a.kind === kind);
          return (
            <section key={kind} className={styles.hundido} aria-labelledby={`alc-${kind}`}>
              <div className={styles.hundidoCabeza}>
                <div>
                  <h3 id={`alc-${kind}`} className={styles.subtitulo}>
                    {TIPO_ALCANCE_LABEL[kind]}
                    {renglones.length ? <span className={styles.conteo}>{renglones.length}</span> : null}
                  </h3>
                  <p className={styles.ayuda}>{TIPO_ALCANCE_AYUDA[kind]}</p>
                </div>
                <Button size="sm" variant="tonal" iconStart={<AddRoundedIcon />} onClick={() => agregarAlcance(kind)} aria-label={`Agregar a ${TIPO_ALCANCE_LABEL[kind]}`}>
                  Agregar
                </Button>
              </div>
              {renglones.length ? (
                <ul className={styles.renglones}>
                  {renglones.map((a) => (
                    <li key={a.clave} className={styles.renglon}>
                      <div className={styles.renglonCampos} data-cols="2">
                        <Field label="Qué">
                          <Input
                            id={`alc-t-${a.clave}`}
                            value={a.titulo}
                            maxLength={240}
                            onChange={(ev) =>
                              cambiar("alcance", b.alcance.map((x) => (x.clave === a.clave ? { ...x, titulo: ev.target.value } : x)))
                            }
                          />
                        </Field>
                        <Field label="Detalle (opcional)">
                          <Input
                            id={`alc-d-${a.clave}`}
                            value={a.detalle}
                            onChange={(ev) =>
                              cambiar("alcance", b.alcance.map((x) => (x.clave === a.clave ? { ...x, detalle: ev.target.value } : x)))
                            }
                          />
                        </Field>
                      </div>
                      <div className={styles.renglonAcciones}>
                        <BotonRenglon
                          etiqueta={`Quitar «${a.titulo || "renglón vacío"}»`}
                          titulo="Quitar"
                          onClick={() => cambiar("alcance", b.alcance.filter((x) => x.clave !== a.clave))}
                        >
                          <CloseRoundedIcon fontSize="small" />
                        </BotonRenglon>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </>
    );
  }

  function pasoRequerimientos() {
    const existentes = new Set(b.requerimientos.map((r) => r.titulo.trim().toLowerCase()));
    const sugeridos = REQUERIMIENTOS_SUGERIDOS.filter((s) => !existentes.has(s.toLowerCase()));
    return (
      <>
        {sugeridos.length ? (
          <div className={styles.sugeridos} role="group" aria-label="Requerimientos frecuentes">
            <span className={styles.sugeridosTitulo}>Frecuentes</span>
            {sugeridos.map((s) => (
              <Button key={s} size="sm" variant="tonal" iconStart={<AddRoundedIcon />} onClick={() => agregarRequerimiento(s)}>
                {s}
              </Button>
            ))}
          </div>
        ) : null}
        <div className={styles.barra}>
          <Button size="sm" iconStart={<AddRoundedIcon />} onClick={() => agregarRequerimiento()}>
            Agregar requerimiento
          </Button>
        </div>
        {b.requerimientos.length ? (
          <ul className={styles.renglones}>
            {b.requerimientos.map((r, i) => (
              <li key={r.clave} className={styles.renglon}>
                <span className={styles.numero} aria-hidden="true">
                  {i + 1}
                </span>
                <div className={styles.renglonCampos} data-cols="3">
                  <Field label="Qué hace falta">
                    <Input
                      id={`req-${r.clave}`}
                      value={r.titulo}
                      maxLength={240}
                      onChange={(ev) =>
                        cambiar(
                          "requerimientos",
                          b.requerimientos.map((x) => (x.clave === r.clave ? { ...x, titulo: ev.target.value } : x)),
                        )
                      }
                    />
                  </Field>
                  <Field label="Fecha límite">
                    <DateInput
                      id={`req-f-${r.clave}`}
                      value={r.dueDate}
                      onChange={(ev) =>
                        cambiar(
                          "requerimientos",
                          b.requerimientos.map((x) => (x.clave === r.clave ? { ...x, dueDate: ev.target.value } : x)),
                        )
                      }
                    />
                  </Field>
                  <Field label="Quién lo consigue">
                    <PersonaSelect
                      id={`req-r-${r.clave}`}
                      value={r.responsableId}
                      onChange={(v) =>
                        cambiar(
                          "requerimientos",
                          b.requerimientos.map((x) => (x.clave === r.clave ? { ...x, responsableId: v } : x)),
                        )
                      }
                      personas={personas}
                    />
                  </Field>
                </div>
                <div className={styles.renglonAcciones}>
                  <BotonRenglon
                    etiqueta={`Quitar el requerimiento ${i + 1}`}
                    titulo="Quitar"
                    onClick={() => cambiar("requerimientos", b.requerimientos.filter((x) => x.clave !== r.clave))}
                  >
                    <CloseRoundedIcon fontSize="small" />
                  </BotonRenglon>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </>
    );
  }

  function pasoEquipo() {
    return (
      <>
        <div className={styles.responsable}>
          <span className={styles.subtitulo}>{nombrePersona(b.responsableId) || "Sin responsable"}</span>
          <span className={styles.ayuda}>Responsable · se elige en «Fechas y presupuesto»</span>
        </div>
        <div className={styles.barra}>
          <Button size="sm" iconStart={<AddRoundedIcon />} onClick={agregarMiembro}>
            Agregar persona
          </Button>
        </div>
        {b.equipo.length ? (
          <ul className={styles.renglones}>
            {b.equipo.map((m, i) => (
              <li key={m.clave} className={styles.renglon}>
                <div className={styles.renglonCampos} data-cols="3">
                  <Field label="Persona">
                    <PersonaSelect
                      id={`eq-${m.clave}`}
                      value={m.userId}
                      onChange={(v) => cambiar("equipo", b.equipo.map((x) => (x.clave === m.clave ? { ...x, userId: v } : x)))}
                      personas={personas}
                      vacio="Elige a alguien"
                      excluir={[responsableNum, ...idsEnEquipo]}
                    />
                  </Field>
                  <Field label="Papel">
                    <Select
                      id={`eq-rol-${m.clave}`}
                      value={m.role}
                      onChange={(ev) =>
                        cambiar(
                          "equipo",
                          b.equipo.map((x) => (x.clave === m.clave ? { ...x, role: ev.target.value as RolEquipo } : x)),
                        )
                      }
                    >
                      {ROLES_EQUIPO.filter((r) => r !== "RESPONSABLE").map((r) => (
                        <option key={r} value={r}>
                          {ROL_EQUIPO_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Notas">
                    <Input
                      id={`eq-n-${m.clave}`}
                      value={m.notas}
                      maxLength={300}
                      onChange={(ev) => cambiar("equipo", b.equipo.map((x) => (x.clave === m.clave ? { ...x, notas: ev.target.value } : x)))}
                      placeholder="Ej. Solo turno nocturno"
                    />
                  </Field>
                </div>
                <div className={styles.renglonAcciones}>
                  <BotonRenglon
                    etiqueta={`Quitar a la persona ${i + 1}`}
                    titulo="Quitar"
                    onClick={() => cambiar("equipo", b.equipo.filter((x) => x.clave !== m.clave))}
                  >
                    <CloseRoundedIcon fontSize="small" />
                  </BotonRenglon>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </>
    );
  }

  function pasoRevisar() {
    const pendientes = erroresDelBorrador(b);
    const importe = leerImporte(b.budget);
    const conteo = (kind: TipoAlcance) => b.alcance.filter((a) => a.kind === kind && a.titulo.trim()).length;
    return (
      <>
        {pendientes.length ? (
          <Alert tone="danger" role="alert" title="Antes de crear, corrige esto:">
            <ul className={styles.lista}>
              {PASOS_ALTA.flatMap((p) =>
                erroresDelPaso(p.id, b).map((texto) => (
                  <li key={`${p.id}-${texto}`}>
                    {texto} <LinkButton onClick={() => irA(p.id)}>Ir a «{p.titulo}»</LinkButton>
                  </li>
                )),
              )}
            </ul>
          </Alert>
        ) : null}

        <div className={styles.resumen}>
          <div className={styles.resumenTarjeta}>
            <h3 className={styles.subtitulo}>{b.title.trim() || "Sin nombre"}</h3>
            <dl className={styles.resumenDatos}>
              <dt>Cliente</dt>
              <dd>{clienteElegido?.name ?? "—"}</dd>
              <dt>Tipo</dt>
              <dd>{getServiceProjectTypeLabel(b.projectType)}</dd>
              {b.siteCount ? (
                <>
                  <dt>Sitios</dt>
                  <dd>{b.siteCount}</dd>
                </>
              ) : null}
              <dt>Responsable</dt>
              <dd>{nombrePersona(b.responsableId) || "—"}</dd>
            </dl>
          </div>
          <div className={styles.resumenTarjeta}>
            <h3 className={styles.subtitulo}>Fechas y dinero</h3>
            <dl className={styles.resumenDatos}>
              <dt>Plan</dt>
              <dd>
                {b.startDate ? formatoFecha(b.startDate) : "sin inicio planeado"} → {b.endDate ? formatoFecha(b.endDate) : "sin fin planeado"}
              </dd>
              <dt>Presupuesto</dt>
              <dd>{importe !== null && Number.isFinite(importe) ? formatoMoneda(importe, b.currency) : "sin capturar"}</dd>
              <dt>Cotización</dt>
              <dd>
                {cotizacionElegida ? cotizacionElegida.folio : "ninguna"}
                {cotizacionElegida && b.importarAlcance ? " (se trae su alcance)" : ""}
              </dd>
            </dl>
          </div>
          <div className={styles.resumenTarjeta}>
            <h3 className={styles.subtitulo}>Plan de trabajo</h3>
            <dl className={styles.resumenDatos}>
              <dt>Cronograma</dt>
              <dd>{b.etapas.filter((e) => e.name.trim()).length} etapas</dd>
              <dt>Alcance</dt>
              <dd>
                {conteo("ENTREGABLE")} entregables · {conteo("EXCLUSION")} exclusiones · {conteo("SUPUESTO")} supuestos
              </dd>
              <dt>Requerimientos</dt>
              <dd>{b.requerimientos.filter((r) => r.titulo.trim()).length}</dd>
              <dt>Equipo</dt>
              <dd>responsable + {b.equipo.filter((m) => m.userId).length} persona(s)</dd>
            </dl>
          </div>
        </div>

        <p className={styles.ayuda}>El proyecto nace como «Planeado». Cuando arranque, cámbialo a «En curso» desde su página.</p>
      </>
    );
  }

  const contenido: Record<PasoAlta, () => ReactNode> = {
    datos: pasoDatos,
    fechas: pasoFechas,
    cronograma: pasoCronograma,
    alcance: pasoAlcance,
    requerimientos: pasoRequerimientos,
    equipo: pasoEquipo,
    revisar: pasoRevisar,
  };

  const esUltimo = paso === "revisar";

  /** Resumen de cada paso en la columna derecha: también sirve para saltar entre ellos. */
  const resumenPaso = (id: PasoAlta): string | undefined => {
    switch (id) {
      case "datos":
        return clienteElegido?.name;
      case "fechas":
        return b.endDate ? `Fin ${formatoFecha(b.endDate)}` : undefined;
      case "cronograma":
        return b.etapas.length ? `${b.etapas.length} etapa${b.etapas.length === 1 ? "" : "s"}` : undefined;
      case "alcance":
        return b.alcance.length ? `${b.alcance.length} renglón${b.alcance.length === 1 ? "" : "es"}` : undefined;
      case "requerimientos":
        return b.requerimientos.length ? `${b.requerimientos.length} requerimiento${b.requerimientos.length === 1 ? "" : "s"}` : undefined;
      case "equipo":
        return b.equipo.length ? `Responsable + ${b.equipo.length}` : undefined;
      default:
        return undefined;
    }
  };
  const pasos: PendingItem[] = PASOS_ALTA.map((p, i) => {
    const conErrores = erroresDelPaso(p.id, b).length > 0;
    const activo = p.id === paso;
    return {
      id: p.id,
      label: p.titulo,
      hint: activo ? "Estás aquí" : resumenPaso(p.id),
      done: i < indice && !conErrores,
      error: conErrores && (i < indice || (activo && mostrarErrores)),
      onSelect: () => irA(p.id),
    };
  });

  return (
    <FormPage
      className={styles.pagina}
      title="Nuevo proyecto"
      breadcrumbs={[{ label: "Proyectos", href: "/erp/proyectos" }, { label: "Nuevo proyecto" }]}
      back={{ href: "/erp/proyectos", label: "Volver a Proyectos" }}
      description="Todo en un solo paso al final: datos, fechas, cronograma, alcance, requerimientos y equipo. Lo que no tengas ahora lo puedes agregar después."
      pendingTitle="Pasos"
      pending={pasos}
      onSubmit={(e) => {
        e.preventDefault();
        if (esUltimo) void crear();
        else siguiente();
      }}
      loading={guardando}
      footer={
        <FormFooter start={<span className={styles.pie}>Paso {indice + 1} de {PASOS_ALTA.length}</span>}>
          <ButtonLink href="/erp/proyectos" variant="tertiary">
            Cancelar
          </ButtonLink>
          <span className={styles.divisor} aria-hidden="true" />
          <Button onClick={() => indice > 0 && irA(PASOS_ALTA[indice - 1].id)} disabled={indice === 0 || guardando}>
            ← Anterior
          </Button>
          {!esUltimo ? (
            <Button variant="tertiary" onClick={() => irA("revisar")}>
              Ir a revisar
            </Button>
          ) : null}
          <Button type="submit" variant="primary" loading={guardando} disabled={!token}>
            {esUltimo ? "Crear proyecto" : "Siguiente →"}
          </Button>
        </FormFooter>
      }
    >
      <FormSection
        id="paso-actual"
        step={indice + 1}
        title={`Paso ${indice + 1} de ${PASOS_ALTA.length}: ${PASOS_ALTA[indice]?.titulo}`}
        description={AYUDA_PASO[paso]}
      >
        <div className={styles.cuerpo}>
          {contenido[paso]()}

          {mostrarErrores && erroresActuales.length && !esUltimo ? (
            <Alert tone="danger" role="alert" srLabel="Error">
              <ul className={styles.lista}>
                {erroresActuales.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {error ? (
            <Alert tone="danger" role="alert" srLabel="Error">
              {error}
            </Alert>
          ) : null}
        </div>
      </FormSection>
    </FormPage>
  );
}
