"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { listSalesClients, provisionSalesServiceClient, type SalesClient } from "@/lib/sales-api";
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
import styles from "../proyectos.module.css";

let secuencia = 0;
const nuevaClave = () => `r${Date.now().toString(36)}${(secuencia++).toString(36)}`;

function mover<T>(lista: T[], desde: number, hacia: number): T[] {
  if (hacia < 0 || hacia >= lista.length) return lista;
  const copia = [...lista];
  const [item] = copia.splice(desde, 1);
  copia.splice(hacia, 0, item);
  return copia;
}

function AsistenteNuevoProyecto() {
  const router = useRouter();
  const search = useSearchParams();
  const { user, token } = useUser();
  const hoy = useMemo(() => hoyISO(), []);

  const [b, setB] = useState<BorradorProyecto>(() => ({
    ...borradorVacio(hoy, user?.id ? String(user.id) : ""),
    clienteId: search.get("clienteId") ?? "",
    cotizacionId: search.get("cotizacionId") ?? "",
  }));
  const [paso, setPaso] = useState<PasoAlta>("datos");
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientes, setClientes] = useState<SalesClient[]>([]);
  const [cargandoClientes, setCargandoClientes] = useState(true);
  const [errorClientes, setErrorClientes] = useState<string | null>(null);
  const [buscarCliente, setBuscarCliente] = useState("");
  const [cotizaciones, setCotizaciones] = useState<CotizacionRow[]>([]);
  const [errorCotizaciones, setErrorCotizaciones] = useState<string | null>(null);

  const yo = useMemo(() => (user?.id ? { id: user.id, nombre: user.nombre } : null), [user?.id, user?.nombre]);
  const { personas, aviso: avisoPersonas } = usePersonasAsignables(token, yo);

  const tituloPaso = useRef<HTMLHeadingElement>(null);
  const primerRender = useRef(true);

  // El usuario puede llegar después del primer render: el responsable por omisión es quien crea.
  useEffect(() => {
    if (user?.id && !b.responsableId) setB((prev) => ({ ...prev, responsableId: String(user.id) }));
  }, [user?.id, b.responsableId]);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    setCargandoClientes(true);
    listSalesClients(token)
      .then((rows) => {
        if (!vivo) return;
        setClientes([...rows].sort((x, y) => x.name.localeCompare(y.name, "es")));
        setErrorClientes(null);
      })
      .catch((e) => vivo && setErrorClientes(e instanceof Error ? e.message : "No se pudieron cargar los clientes"))
      .finally(() => vivo && setCargandoClientes(false));
    listarCotizaciones(token)
      .then((rows) => vivo && setCotizaciones(rows))
      .catch(() => vivo && setErrorCotizaciones("No se pudieron cargar las cotizaciones; puedes ligarla después."));
    return () => {
      vivo = false;
    };
  }, [token]);

  // Al cambiar de paso, el foco va al título: quien usa lector de pantalla sabe dónde está.
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    tituloPaso.current?.focus();
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
            `«${cliente.name}» todavía no está activo en operación y no se pudo activar (${
              e instanceof Error ? e.message : "sin detalle"
            }). Pídeselo a administración o elige otro cliente.`,
          );
        }
      }
      const creado = await crearProyecto(token, cuerpoDeAlta(b, clientId));
      router.replace(`/erp/proyectos/${creado.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el proyecto");
      setGuardando(false);
    }
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
    return (
      <>
        <div>
          <label className={styles.fieldLabel} htmlFor="titulo">
            Nombre del proyecto *
          </label>
          <input
            id="titulo"
            className={styles.input}
            value={b.title}
            onChange={(e) => cambiar("title", e.target.value)}
            placeholder="Ej. Videovigilancia Plaza Norte, etapa 2"
            maxLength={220}
            required
          />
        </div>

        <div>
          <label className={styles.fieldLabel} htmlFor="buscarCliente">
            Cliente *
          </label>
          <div className={styles.grid2}>
            <input
              id="buscarCliente"
              className={styles.input}
              type="search"
              value={buscarCliente}
              onChange={(e) => setBuscarCliente(e.target.value)}
              // Enter aquí es «buscar», no «siguiente paso».
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              placeholder="Buscar por nombre, razón social o RFC"
              aria-label="Buscar cliente"
            />
            <select
              id="cliente"
              className={styles.select}
              value={b.clienteId}
              onChange={(e) => cambiar("clienteId", e.target.value)}
              aria-label="Cliente"
              required
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
            </select>
          </div>
          {errorClientes ? <p className={styles.error}>{errorClientes}</p> : null}
          {clienteElegido && !clienteElegido.serviceClientId ? (
            <p className={styles.hint}>
              Este cliente todavía no está activo en operación: se activará al crear el proyecto.
            </p>
          ) : null}
          {!cargandoClientes && !clientes.length && !errorClientes ? (
            <p className={styles.hint}>
              No tienes clientes a la vista. <Link href="/erp/clientes/nuevo?sector=proyecto">Da de alta uno</Link> y
              vuelve aquí.
            </p>
          ) : null}
        </div>

        <div className={styles.grid2}>
          <div>
            <label className={styles.fieldLabel} htmlFor="tipo">
              Tipo de proyecto
            </label>
            <select
              id="tipo"
              className={styles.select}
              value={b.projectType}
              onChange={(e) => cambiar("projectType", e.target.value)}
            >
              {SERVICE_PROJECT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className={styles.hint}>
              {SERVICE_PROJECT_TYPE_OPTIONS.find((o) => o.value === b.projectType)?.description}
            </p>
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="sitios">
              Número de sitios
            </label>
            <input
              id="sitios"
              className={styles.input}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={b.siteCount}
              onChange={(e) => cambiar("siteCount", e.target.value)}
              placeholder="Ej. 3 sucursales"
            />
          </div>
        </div>

        <div>
          <label className={styles.fieldLabel} htmlFor="descripcion">
            Descripción
          </label>
          <textarea
            id="descripcion"
            className={styles.textarea}
            value={b.description}
            onChange={(e) => cambiar("description", e.target.value)}
            placeholder="Qué se va a hacer, en pocas palabras."
          />
        </div>

        <div>
          <label className={styles.fieldLabel} htmlFor="objetivo">
            Objetivo
          </label>
          <textarea
            id="objetivo"
            className={styles.textarea}
            value={b.objective}
            onChange={(e) => cambiar("objective", e.target.value)}
            placeholder="Para qué lo quiere el cliente, en sus palabras. Ej. «Ver todas las entradas desde la oficina central»."
          />
        </div>
      </>
    );
  }

  function pasoFechas() {
    const importe = leerImporte(b.budget);
    return (
      <>
        <div className={styles.grid2}>
          <div>
            <label className={styles.fieldLabel} htmlFor="inicio">
              Inicio planeado *
            </label>
            <input
              id="inicio"
              className={styles.input}
              type="date"
              value={b.startDate}
              onChange={(e) => cambiar("startDate", e.target.value)}
              required
            />
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="fin">
              Fin planeado
            </label>
            <input
              id="fin"
              className={styles.input}
              type="date"
              value={b.endDate}
              min={b.startDate || undefined}
              onChange={(e) => cambiar("endDate", e.target.value)}
            />
            <p className={styles.hint}>Sin fin planeado no se puede saber si el proyecto va a tiempo.</p>
          </div>
        </div>

        <div>
          <label className={styles.fieldLabel} htmlFor="responsable">
            Responsable del proyecto *
          </label>
          <PersonaSelect
            id="responsable"
            value={b.responsableId}
            onChange={(v) => cambiar("responsableId", v)}
            personas={personas}
            vacio="Elige al responsable"
            required
          />
          <p className={styles.hint}>A quién se le pregunta por el proyecto. Entra solo al equipo.</p>
          {avisoPersonas ? <p className={styles.hint}>{avisoPersonas}</p> : null}
        </div>

        <div className={styles.grid2}>
          <div>
            <label className={styles.fieldLabel} htmlFor="presupuesto">
              Presupuesto autorizado
            </label>
            <input
              id="presupuesto"
              className={styles.input}
              inputMode="decimal"
              value={b.budget}
              onChange={(e) => cambiar("budget", e.target.value)}
              placeholder="Ej. 250,000"
            />
            {importe !== null && Number.isFinite(importe) ? (
              <p className={styles.hint}>{formatoMoneda(importe, b.currency)}</p>
            ) : null}
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="moneda">
              Moneda
            </label>
            <select
              id="moneda"
              className={styles.select}
              value={b.currency}
              onChange={(e) => cambiar("currency", e.target.value)}
            >
              <option value="MXN">Pesos mexicanos (MXN)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          </div>
        </div>

        <div>
          <label className={styles.fieldLabel} htmlFor="cotizacion">
            Cotización de origen (opcional)
          </label>
          <select
            id="cotizacion"
            className={styles.select}
            value={b.cotizacionId}
            onChange={(e) => cambiar("cotizacionId", e.target.value)}
          >
            <option value="">Sin cotización</option>
            {cotizacionesOrdenadas.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.folio} · {c.clienteNombre || c.clienteEmpresa || "Sin cliente"} · {c.estadoEtiqueta}
              </option>
            ))}
          </select>
          {errorCotizaciones ? <p className={styles.hint}>{errorCotizaciones}</p> : null}
          <label className={styles.check} style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={b.importarAlcance}
              disabled={!b.cotizacionId}
              onChange={(e) => cambiar("importarAlcance", e.target.checked)}
            />
            Traer el alcance de la cotización como entregables
          </label>
          {b.cotizacionId && b.importarAlcance ? (
            <p className={styles.hint}>
              Al crear el proyecto se copian los bloques de alcance de la cotización. Así lo que se cotizó y lo
              que se entrega dicen lo mismo.
            </p>
          ) : null}
        </div>
      </>
    );
  }

  function pasoCronograma() {
    return (
      <>
        <p className={styles.sub} style={{ margin: 0 }}>
          Divide el proyecto en etapas con fecha y responsable. Cada etapa va desde que termina la anterior
          hasta su fecha. Cuando se cumpla, se marca en el proyecto y el avance se mueve solo.
        </p>
        <div className={styles.acciones}>
          <button type="button" className={styles.secondaryBtn} onClick={() => agregarEtapa()}>
            Agregar etapa
          </button>
          {b.etapas.length === 0 ? (
            <button type="button" className={styles.secondaryBtn} onClick={usarEtapasTipicas}>
              Usar etapas típicas
            </button>
          ) : null}
        </div>

        {b.etapas.length ? (
          <ol className={styles.editor}>
            {b.etapas.map((e, i) => (
              <li key={e.clave} className={styles.editorRow}>
                <div>
                  <label className={styles.fieldLabel} htmlFor={`etapa-${e.clave}`}>
                    Etapa {i + 1}
                  </label>
                  <input
                    id={`etapa-${e.clave}`}
                    className={styles.input}
                    value={e.name}
                    onChange={(ev) =>
                      cambiar("etapas", b.etapas.map((x) => (x.clave === e.clave ? { ...x, name: ev.target.value } : x)))
                    }
                    placeholder="Ej. Instalación de cámaras"
                    maxLength={200}
                  />
                </div>
                <div>
                  <label className={styles.fieldLabel} htmlFor={`etapa-fecha-${e.clave}`}>
                    Fecha planeada
                  </label>
                  <input
                    id={`etapa-fecha-${e.clave}`}
                    className={styles.input}
                    type="date"
                    value={e.plannedDate}
                    onChange={(ev) =>
                      cambiar(
                        "etapas",
                        b.etapas.map((x) => (x.clave === e.clave ? { ...x, plannedDate: ev.target.value } : x)),
                      )
                    }
                  />
                </div>
                <div>
                  <label className={styles.fieldLabel} htmlFor={`etapa-resp-${e.clave}`}>
                    Responsable
                  </label>
                  <PersonaSelect
                    id={`etapa-resp-${e.clave}`}
                    value={e.responsableId}
                    onChange={(v) =>
                      cambiar("etapas", b.etapas.map((x) => (x.clave === e.clave ? { ...x, responsableId: v } : x)))
                    }
                    personas={personas}
                  />
                </div>
                <div className={styles.editorActions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => cambiar("etapas", mover(b.etapas, i, i - 1))}
                    disabled={i === 0}
                    aria-label={`Subir la etapa ${i + 1}`}
                    title="Subir"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => cambiar("etapas", mover(b.etapas, i, i + 1))}
                    disabled={i === b.etapas.length - 1}
                    aria-label={`Bajar la etapa ${i + 1}`}
                    title="Bajar"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => cambiar("etapas", b.etapas.filter((x) => x.clave !== e.clave))}
                    aria-label={`Quitar la etapa ${i + 1}`}
                    title="Quitar"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className={styles.empty}>Todavía no hay etapas. Puedes crear el proyecto sin ellas y agregarlas después.</div>
        )}

        {b.etapas.some((e) => e.plannedDate) ? (
          <div className={styles.panel} style={{ background: "var(--bg)" }}>
            <h3 className={styles.panelTitle}>Así se ve el cronograma</h3>
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
        <div>
          <label className={styles.fieldLabel} htmlFor="resumenAlcance">
            El alcance en una frase
          </label>
          <input
            id="resumenAlcance"
            className={styles.input}
            value={b.scopeSummary}
            onChange={(e) => cambiar("scopeSummary", e.target.value)}
            placeholder="Ej. Suministro e instalación de 32 cámaras IP con grabación centralizada"
          />
        </div>

        {b.cotizacionId && b.importarAlcance ? (
          <p className={styles.hint}>
            También se agregarán los entregables de la cotización {cotizacionElegida?.folio ?? ""} al crear el
            proyecto.
          </p>
        ) : null}

        {TIPOS_ALCANCE.map((kind) => {
          const renglones = b.alcance.filter((a) => a.kind === kind);
          return (
            <section key={kind} className={styles.panel} style={{ background: "var(--bg)" }} aria-labelledby={`alc-${kind}`}>
              <div className={styles.panelHead}>
                <div>
                  <h3 id={`alc-${kind}`} className={styles.panelTitle}>
                    {TIPO_ALCANCE_LABEL[kind]}
                  </h3>
                  <p className={styles.hint}>{TIPO_ALCANCE_AYUDA[kind]}</p>
                </div>
                <button type="button" className={styles.smallBtn} onClick={() => agregarAlcance(kind)}>
                  Agregar
                </button>
              </div>
              {renglones.length ? (
                <ul className={styles.editor}>
                  {renglones.map((a) => (
                    <li key={a.clave} className={styles.editorRow2}>
                      <div>
                        <label className={styles.fieldLabel} htmlFor={`alc-t-${a.clave}`}>
                          Qué
                        </label>
                        <input
                          id={`alc-t-${a.clave}`}
                          className={styles.input}
                          value={a.titulo}
                          maxLength={240}
                          onChange={(ev) =>
                            cambiar("alcance", b.alcance.map((x) => (x.clave === a.clave ? { ...x, titulo: ev.target.value } : x)))
                          }
                        />
                      </div>
                      <div>
                        <label className={styles.fieldLabel} htmlFor={`alc-d-${a.clave}`}>
                          Detalle (opcional)
                        </label>
                        <input
                          id={`alc-d-${a.clave}`}
                          className={styles.input}
                          value={a.detalle}
                          onChange={(ev) =>
                            cambiar("alcance", b.alcance.map((x) => (x.clave === a.clave ? { ...x, detalle: ev.target.value } : x)))
                          }
                        />
                      </div>
                      <div className={styles.editorActions}>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() => cambiar("alcance", b.alcance.filter((x) => x.clave !== a.clave))}
                          aria-label={`Quitar «${a.titulo || "renglón vacío"}»`}
                          title="Quitar"
                        >
                          ✕
                        </button>
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
        <p className={styles.sub} style={{ margin: 0 }}>
          Lo que hace falta para poder entregar: papeles, permisos, anticipos, información del cliente. En el
          proyecto se palomean conforme se consiguen.
        </p>
        {sugeridos.length ? (
          <div className={styles.chips} role="group" aria-label="Requerimientos frecuentes">
            {sugeridos.map((s) => (
              <button key={s} type="button" className={styles.filterBtn} onClick={() => agregarRequerimiento(s)}>
                + {s}
              </button>
            ))}
          </div>
        ) : null}
        <div className={styles.acciones}>
          <button type="button" className={styles.secondaryBtn} onClick={() => agregarRequerimiento()}>
            Agregar requerimiento
          </button>
        </div>
        {b.requerimientos.length ? (
          <ul className={styles.editor}>
            {b.requerimientos.map((r, i) => (
              <li key={r.clave} className={styles.editorRow}>
                <div>
                  <label className={styles.fieldLabel} htmlFor={`req-${r.clave}`}>
                    Qué hace falta
                  </label>
                  <input
                    id={`req-${r.clave}`}
                    className={styles.input}
                    value={r.titulo}
                    maxLength={240}
                    onChange={(ev) =>
                      cambiar(
                        "requerimientos",
                        b.requerimientos.map((x) => (x.clave === r.clave ? { ...x, titulo: ev.target.value } : x)),
                      )
                    }
                  />
                </div>
                <div>
                  <label className={styles.fieldLabel} htmlFor={`req-f-${r.clave}`}>
                    Fecha límite
                  </label>
                  <input
                    id={`req-f-${r.clave}`}
                    className={styles.input}
                    type="date"
                    value={r.dueDate}
                    onChange={(ev) =>
                      cambiar(
                        "requerimientos",
                        b.requerimientos.map((x) => (x.clave === r.clave ? { ...x, dueDate: ev.target.value } : x)),
                      )
                    }
                  />
                </div>
                <div>
                  <label className={styles.fieldLabel} htmlFor={`req-r-${r.clave}`}>
                    Quién lo consigue
                  </label>
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
                </div>
                <div className={styles.editorActions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => cambiar("requerimientos", b.requerimientos.filter((x) => x.clave !== r.clave))}
                    aria-label={`Quitar el requerimiento ${i + 1}`}
                    title="Quitar"
                  >
                    ✕
                  </button>
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
        <p className={styles.sub} style={{ margin: 0 }}>
          Quiénes trabajan en el proyecto y con qué papel. Solo puedes sumar a gente de tu equipo; si alguien
          queda fuera, el sistema te lo dirá al crear.
        </p>
        <ul className={styles.items}>
          <li className={styles.item}>
            <div className={styles.itemMain}>
              <span className={styles.itemTitle}>{nombrePersona(b.responsableId) || "Sin responsable"}</span>
              <span className={styles.rowSub}>Responsable · se elige en «Fechas y presupuesto»</span>
            </div>
          </li>
        </ul>
        <div className={styles.acciones}>
          <button type="button" className={styles.secondaryBtn} onClick={agregarMiembro}>
            Agregar persona
          </button>
        </div>
        {b.equipo.length ? (
          <ul className={styles.editor}>
            {b.equipo.map((m, i) => (
              <li key={m.clave} className={styles.editorRow}>
                <div>
                  <label className={styles.fieldLabel} htmlFor={`eq-${m.clave}`}>
                    Persona
                  </label>
                  <PersonaSelect
                    id={`eq-${m.clave}`}
                    value={m.userId}
                    onChange={(v) => cambiar("equipo", b.equipo.map((x) => (x.clave === m.clave ? { ...x, userId: v } : x)))}
                    personas={personas}
                    vacio="Elige a alguien"
                    excluir={[responsableNum, ...idsEnEquipo]}
                  />
                </div>
                <div>
                  <label className={styles.fieldLabel} htmlFor={`eq-rol-${m.clave}`}>
                    Papel
                  </label>
                  <select
                    id={`eq-rol-${m.clave}`}
                    className={styles.select}
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
                  </select>
                </div>
                <div>
                  <label className={styles.fieldLabel} htmlFor={`eq-n-${m.clave}`}>
                    Notas
                  </label>
                  <input
                    id={`eq-n-${m.clave}`}
                    className={styles.input}
                    value={m.notas}
                    maxLength={300}
                    onChange={(ev) => cambiar("equipo", b.equipo.map((x) => (x.clave === m.clave ? { ...x, notas: ev.target.value } : x)))}
                    placeholder="Ej. Solo turno nocturno"
                  />
                </div>
                <div className={styles.editorActions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => cambiar("equipo", b.equipo.filter((x) => x.clave !== m.clave))}
                    aria-label={`Quitar a la persona ${i + 1}`}
                    title="Quitar"
                  >
                    ✕
                  </button>
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
          <div className={styles.errorBox} role="alert">
            Antes de crear, corrige esto:
            <ul>
              {PASOS_ALTA.flatMap((p) =>
                erroresDelPaso(p.id, b).map((texto) => (
                  <li key={`${p.id}-${texto}`}>
                    {texto}{" "}
                    <button type="button" className={styles.linkBtn} onClick={() => irA(p.id)}>
                      Ir a «{p.titulo}»
                    </button>
                  </li>
                )),
              )}
            </ul>
          </div>
        ) : null}

        <div className={styles.resumenAlta}>
          <div className={styles.panel} style={{ background: "var(--bg)" }}>
            <h3 className={styles.panelTitle}>{b.title.trim() || "Sin nombre"}</h3>
            <span className={styles.rowWrap}>Cliente: {clienteElegido?.name ?? "—"}</span>
            <span className={styles.rowWrap}>Tipo: {getServiceProjectTypeLabel(b.projectType)}</span>
            {b.siteCount ? <span className={styles.rowWrap}>Sitios: {b.siteCount}</span> : null}
            <span className={styles.rowWrap}>Responsable: {nombrePersona(b.responsableId) || "—"}</span>
          </div>
          <div className={styles.panel} style={{ background: "var(--bg)" }}>
            <h3 className={styles.panelTitle}>Fechas y dinero</h3>
            <span className={styles.rowWrap}>
              Plan: {formatoFecha(b.startDate)} → {b.endDate ? formatoFecha(b.endDate) : "sin fin planeado"}
            </span>
            <span className={styles.rowWrap}>
              Presupuesto: {importe !== null && Number.isFinite(importe) ? formatoMoneda(importe, b.currency) : "sin capturar"}
            </span>
            <span className={styles.rowWrap}>
              Cotización: {cotizacionElegida ? cotizacionElegida.folio : "ninguna"}
              {cotizacionElegida && b.importarAlcance ? " (se trae su alcance)" : ""}
            </span>
          </div>
          <div className={styles.panel} style={{ background: "var(--bg)" }}>
            <h3 className={styles.panelTitle}>Plan de trabajo</h3>
            <span className={styles.rowWrap}>{b.etapas.filter((e) => e.name.trim()).length} etapas en el cronograma</span>
            <span className={styles.rowWrap}>
              Alcance: {conteo("ENTREGABLE")} entregables · {conteo("EXCLUSION")} exclusiones · {conteo("SUPUESTO")} supuestos
            </span>
            <span className={styles.rowWrap}>{b.requerimientos.filter((r) => r.titulo.trim()).length} requerimientos</span>
            <span className={styles.rowWrap}>
              Equipo: responsable + {b.equipo.filter((m) => m.userId).length} persona(s)
            </span>
          </div>
        </div>

        <p className={styles.hint}>
          El proyecto nace como «Planeado». Cuando arranque, cámbialo a «En curso» desde su página.
        </p>
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

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <div>
          <Link className={styles.migas} href="/erp/proyectos">
            ← Proyectos
          </Link>
          <h1 className={styles.title}>Nuevo proyecto</h1>
          <p className={styles.sub}>
            Todo en un solo paso al final: datos, fechas, cronograma, alcance, requerimientos y equipo. Lo que no
            tengas ahora lo puedes agregar después.
          </p>
        </div>
        <Link className={styles.secondaryBtn} href="/erp/proyectos">
          Cancelar
        </Link>
      </div>

      <nav aria-label="Pasos del asistente">
        <ol className={styles.stepper}>
          {PASOS_ALTA.map((p, i) => {
            const activo = p.id === paso;
            const hecho = i < indice && erroresDelPaso(p.id, b).length === 0;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={`${styles.step} ${activo ? styles.stepOn : ""} ${hecho ? styles.stepDone : ""}`}
                  aria-current={activo ? "step" : undefined}
                  onClick={() => irA(p.id)}
                >
                  <span className={styles.stepNum} aria-hidden="true">
                    {hecho ? "✓" : i + 1}
                  </span>
                  {p.titulo}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <form
        className={styles.panel}
        onSubmit={(e) => {
          e.preventDefault();
          if (esUltimo) void crear();
          else siguiente();
        }}
        noValidate
      >
        <h2 ref={tituloPaso} tabIndex={-1} className={styles.panelTitle} style={{ outline: "none" }}>
          Paso {indice + 1} de {PASOS_ALTA.length}: {PASOS_ALTA[indice]?.titulo}
        </h2>

        {contenido[paso]()}

        {mostrarErrores && erroresActuales.length && !esUltimo ? (
          <div className={styles.errorBox} role="alert">
            <ul>
              {erroresActuales.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <p className={styles.errorBox} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.wizardNav}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => indice > 0 && irA(PASOS_ALTA[indice - 1].id)}
            disabled={indice === 0 || guardando}
          >
            ← Anterior
          </button>
          <div className={styles.acciones}>
            {!esUltimo ? (
              <button type="button" className={styles.linkBtn} onClick={() => irA("revisar")}>
                Ir a revisar
              </button>
            ) : null}
            <button type="submit" className={styles.primaryBtn} disabled={guardando || !token}>
              {esUltimo ? (guardando ? "Creando proyecto…" : "Crear proyecto") : "Siguiente →"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function NuevoProyectoPage() {
  return (
    <Suspense fallback={<p className={styles.sub}>Cargando…</p>}>
      <AsistenteNuevoProyecto />
    </Suspense>
  );
}
