"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import MicNoneOutlinedIcon from "@mui/icons-material/MicNoneOutlined";
import { Alert, Badge, Button, ButtonLink, Card, DateInput, Field, Input, Select, Textarea } from "@/components/base";
import ActivityKindIcon from "@/components/ops/ActivityKindIcon";
import DictadoBoton from "@/components/DictadoBoton";
import OndaVoz from "@/app/(panels)/erp/reuniones/OndaVoz";
import { unirDictado } from "@/lib/use-dictado";
import { useDictadoVivo } from "@/lib/use-dictado-vivo";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import { formatMinutes } from "@/lib/activity-labels";
import { kindsForAssignment } from "@/lib/activity-kinds";
import { periodoPorOmision } from "@/lib/actividad-periodo";
import { hoyISO } from "@/lib/proyecto-plan";
import { obtenerProgramacion } from "@/lib/proyectos-api";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES, type RoleKey } from "@/lib/rbac";
import {
  DURACIONES_MIN,
  ETIQUETA_TIPO,
  altaRapidaCliente,
  SUBTIPOS_TAREA,
  TIPOS,
  TIPOS_SERVICIO,
  agendaFinal,
  bloqueos,
  compromisoValido,
  conProyecto,
  correccionDe,
  crearActividad,
  encargoElegido,
  estadoAsistente,
  interpretar,
  lugarEfectivo,
  nombreComparable,
  nombreParaAlta,
  pasoEquipo,
  payloadFinal,
  personasAsignables,
  proyectoEfectivo,
  reglaEncargo,
  subtipoEfectivo,
  sumarAlEquipo,
  textoCorreccion,
  tipoEfectivo,
  type Ajustes,
  type Encargo,
  type PersonaAsignable,
  type Prioridad,
  type PropuestaActividad,
  type Referencia,
  type RespuestaAsistente,
} from "@/lib/asistente-ia-api";
import type { ActivityKind } from "@/lib/activity-kinds";
import c from "./comun.module.css";
import s from "./AsistenteIA.module.css";

type Estado = {
  creando?: boolean;
  creada?: { id: number; folio?: string };
  /** Se creó, pero no se pudo guardar el tiempo estimado del responsable. */
  avisoEquipo?: string;
  error?: string;
  descartada?: boolean;
};

/** Valor de la opción «+ Agregar cliente "…"» del selector de cliente. */
const ALTA_CLIENTE = "__alta__";

/** Etapa del proyecto que se propuso para una tarjeta (como «Asignar»). */
type EtapaPropuesta = { nombre: string | null };

/**
 * «Asignar con IA», hasta arriba de Actividades para el CEO. Se dicta con un toque (el texto
 * aparece en vivo y al callar se prepara solo) o se escribe y «Preparar actividades». La IA
 * propone tipo, persona, cliente, día, plazo y duración; los nombres mal oídos los corrige el
 * API contra el catálogo y lo dice («Corregido de "talks"»). Cada campo se corrige a mano en
 * la tarjeta, sin volver a escribir la instrucción, y se confirma una por una o todas. Solo se
 * muestra al CEO y si el servidor tiene la IA activa.
 */
export default function AsistenteIA({ onCreada }: { onCreada?: () => void }) {
  const { user, token } = useUser();
  const [disponible, setDisponible] = useState(false);
  const [personas, setPersonas] = useState<PersonaAsignable[]>([]);
  const v2 = useMemo(() => resolveV2RoleKey(user), [user]);
  // Solo el CEO asigna con IA (la matriz del API lo vuelve a exigir).
  const esCeo = v2 === ROLES.CEO || Boolean(user?.isSuperAdmin);

  useEffect(() => {
    if (!token || !esCeo) return;
    let vivo = true;
    estadoAsistente(token)
      .then((r) => {
        if (!vivo || !r.disponible) return;
        setDisponible(true);
        personasAsignables(token)
          .then((lista) => vivo && setPersonas(Array.isArray(lista) ? lista : []))
          .catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [token, esCeo]);

  if (!esCeo || !disponible || !token) return null;
  return (
    <Contenido
      token={token}
      personas={personas}
      creadorEmail={user?.email ?? null}
      isSuperAdmin={Boolean(user?.isSuperAdmin)}
      v2={v2}
      onCreada={onCreada}
    />
  );
}

function Contenido({
  token,
  personas,
  creadorEmail,
  isSuperAdmin,
  v2,
  onCreada,
}: {
  token: string;
  personas: PersonaAsignable[];
  creadorEmail: string | null;
  isSuperAdmin: boolean;
  v2: RoleKey | null;
  onCreada?: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState<RespuestaAsistente | null>(null);
  const [listoEnMs, setListoEnMs] = useState<number | null>(null);
  const [ajustes, setAjustes] = useState<Record<number, Ajustes>>({});
  const [estados, setEstados] = useState<Record<number, Estado>>({});
  const [etapas, setEtapas] = useState<Record<number, EtapaPropuesta>>({});
  const [creandoTodas, setCreandoTodas] = useState(false);
  /** Clientes dados de alta desde las tarjetas (alta rápida) y el estado de cada alta. */
  const [clientesNuevos, setClientesNuevos] = useState<Referencia[]>([]);
  const [altas, setAltas] = useState<Record<number, { creando?: boolean; error?: string }>>({});
  const personasOrdenadas = useMemo(() => [...personas].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [personas]);
  /** Lo que ya estaba escrito cuando empezó el dictado: lo dicho se agrega después. */
  const base = useRef("");
  const pensandoRef = useRef(false);
  /** Cada interpretación nueva invalida las etapas que se estaban pidiendo para la anterior. */
  const generacion = useRef(0);
  /** Proyecto del que se pidió la etapa, por tarjeta (si cambia, la respuesta vieja se ignora). */
  const etapaPedida = useRef<Record<number, number>>({});

  const enviar = useCallback(
    async (instruccion: string) => {
      const limpio = instruccion.trim();
      if (!limpio || pensandoRef.current) return;
      pensandoRef.current = true;
      setPensando(true);
      setError(null);
      const inicio = performance.now();
      try {
        const r = await interpretar(token, limpio);
        generacion.current += 1;
        etapaPedida.current = {};
        setRespuesta(r);
        setListoEnMs(Math.round(performance.now() - inicio));
        setAjustes({});
        setAltas({});
        setEstados({});
        setEtapas({});
      } catch (e) {
        // Lo escrito o dictado no se borra: basta volver a intentar.
        setError(`${formatApiError(e, "La IA no respondió.")} Tu instrucción sigue aquí: vuelve a tocar «Preparar actividades».`);
      } finally {
        pensandoRef.current = false;
        setPensando(false);
      }
    },
    [token],
  );

  // Dictado: al callar ~2 s (o con un toque) se interpreta solo, una vez por dictado.
  const dictado = useDictadoVivo({
    alTerminar: (dicho) => {
      const completo = unirDictado(base.current, dicho).slice(0, 2000);
      setTexto(completo);
      void enviar(completo);
    },
  });
  const escuchando = dictado.estado === "escuchando";
  const ocupado = dictado.estado !== "inactivo" || pensando;
  const textoVisible = dictado.estado !== "inactivo" ? unirDictado(base.current, dictado.texto) : texto;

  const tocarMicrofono = () => {
    if (escuchando) {
      dictado.detener();
      return;
    }
    // Una instrucción nueva después de preparar empieza en blanco; si había algo escrito, se suma.
    base.current = respuesta ? "" : texto;
    if (respuesta) setRespuesta(null);
    setError(null);
    dictado.iniciar();
  };

  const ajustar = (i: number, cambio: Ajustes) => setAjustes((prev) => ({ ...prev, [i]: { ...prev[i], ...cambio } }));

  const propuestas = useMemo(() => respuesta?.propuestas ?? [], [respuesta]);
  const opciones = respuesta?.opciones;
  const todosLosClientes = useMemo(
    () => [...(opciones?.clientes ?? []), ...clientesNuevos.filter((n) => !(opciones?.clientes ?? []).some((c) => c.id === n.id))],
    [opciones, clientesNuevos],
  );

  /**
   * «+ Agregar cliente "Toks"»: alta rápida (solo el nombre) y queda elegido en la tarjeta; las
   * demás tarjetas que dijeron el mismo nombre y no tienen cliente también lo toman.
   */
  const agregarCliente = async (i: number, nombre: string) => {
    if (altas[i]?.creando) return;
    setAltas((prev) => ({ ...prev, [i]: { creando: true } }));
    try {
      const nuevo = await altaRapidaCliente(token, nombre);
      setClientesNuevos((prev) => [...prev.filter((c) => c.id !== nuevo.id), nuevo]);
      const clave = nombreComparable(nombre);
      setAjustes((prev) => {
        const sig = { ...prev };
        propuestas.forEach((p, j) => {
          const aj = prev[j] || {};
          const mismo = j === i || (!p.cliente && aj.clientId === undefined && nombreComparable(nombreParaAlta(p, aj, []) ?? "") === clave);
          if (!mismo) return;
          // El nombre ya es el cliente: no se repite como lugar.
          const lugarIgual = !p.sucursal && nombreComparable(lugarEfectivo(p, aj)) === clave;
          sig[j] = { ...aj, clientId: nuevo.id, ...(lugarIgual ? { lugar: "" } : {}) };
        });
        return sig;
      });
      setAltas((prev) => ({ ...prev, [i]: {} }));
    } catch (e) {
      setAltas((prev) => ({ ...prev, [i]: { error: formatApiError(e, "No se pudo dar de alta el cliente.") } }));
    }
  };

  /** Todo lo que la tarjeta necesita para mostrarse y crearse con lo que se eligió. */
  const armar = (p: PropuestaActividad, i: number) => {
    const aj = ajustes[i] || {};
    const responsableId = aj.responsableId ?? p.responsable?.id;
    const destino = personas.find((x) => x.id === responsableId);
    // Sin la lista de personas no se sabe a quién va: no se aplican las reglas por persona.
    const destinoEmail = destino ? destino.email ?? null : undefined;
    const payload = payloadFinal(p, aj, { destinoEmail, proyectos: opciones?.proyectos, sucursales: opciones?.sucursales });
    const agenda = agendaFinal(p, aj);
    const motivos = bloqueos(p, payload, { creadorEmail, destinoEmail, v2Role: v2, isSuperAdmin, agenda });
    return { aj, payload, agenda, destinoEmail, motivos };
  };

  // Obra o proyecto sin fechas dichas: el periodo de la etapa vigente, como propone «Asignar».
  const proyectosPorTarjeta = propuestas
    .map((p, i) => {
      const aj = ajustes[i] || {};
      const id = proyectoEfectivo(p, aj);
      return id && !agendaFinal(p, aj).dia && aj.dia === undefined && !etapas[i] ? `${i}:${id}` : null;
    })
    .filter(Boolean)
    .join(",");
  useEffect(() => {
    if (!proyectosPorTarjeta) return;
    const gen = generacion.current;
    for (const par of proyectosPorTarjeta.split(",")) {
      const [i, id] = par.split(":").map(Number);
      etapaPedida.current[i] = id;
      setEtapas((prev) => ({ ...prev, [i]: { nombre: null } }));
      obtenerProgramacion(token, id)
        .then((prog) => {
          if (gen !== generacion.current || etapaPedida.current[i] !== id) return;
          const propuesta = periodoPorOmision(prog.etapas, { inicio: prog.proyecto.inicio, fin: prog.proyecto.fin }, hoyISO());
          if (!propuesta) return;
          const etapa = prog.etapas.find((e) => e.hitoId === propuesta.hitoId);
          setEtapas((prev) => ({ ...prev, [i]: { nombre: etapa?.nombre ?? "Todo el proyecto" } }));
          setAjustes((prev) => ({
            ...prev,
            [i]: { ...prev[i], dia: propuesta.inicio, hasta: propuesta.fin, etapaId: propuesta.hitoId },
          }));
        })
        .catch(() => undefined);
    }
  }, [proyectosPorTarjeta, token]);

  const crear = async (i: number, p: PropuestaActividad) => {
    const { payload, destinoEmail, motivos } = armar(p, i);
    if (motivos.length || estados[i]?.creando || estados[i]?.creada) return false;
    setEstados((prev) => ({ ...prev, [i]: { creando: true } }));
    let creada: { id: number; anNumber?: string };
    try {
      creada = await crearActividad(token, payload);
    } catch (e) {
      setEstados((prev) => ({ ...prev, [i]: { error: formatApiError(e, "No se pudo crear.") } }));
      return false;
    }
    // Como «Asignar»: el responsable queda en el equipo con su tiempo estimado.
    let avisoEquipo: string | undefined;
    const paso = pasoEquipo(p, payload, destinoEmail);
    if (paso) {
      try {
        await sumarAlEquipo(token, creada.id, paso);
      } catch (e) {
        avisoEquipo = `No se guardó el tiempo estimado del responsable: ${formatApiError(e, "error de conexión")}. Ponlo desde la actividad.`;
      }
    }
    setEstados((prev) => ({ ...prev, [i]: { creada: { id: creada.id, folio: creada.anNumber }, avisoEquipo } }));
    onCreada?.();
    return true;
  };

  const pendientes = propuestas.map((p, i) => ({ p, i })).filter(({ i }) => !estados[i]?.creada && !estados[i]?.descartada);
  const listas = pendientes.filter(({ p, i }) => armar(p, i).motivos.length === 0);

  const crearTodas = async () => {
    if (creandoTodas) return;
    setCreandoTodas(true);
    // Una por una: si alguna falla, las demás siguen y la tarjeta dice por qué.
    for (const { p, i } of listas) await crear(i, p);
    setCreandoTodas(false);
  };

  const limpiar = () => {
    dictado.cancelar();
    setRespuesta(null);
    setTexto("");
    setError(null);
    base.current = "";
  };

  const estadoLinea = escuchando
    ? "Te escucho… cuando termines de hablar lo preparo solo."
    : dictado.estado === "terminando" || pensando
      ? "Entendiendo…"
      : respuesta && propuestas.length
        ? null
        : dictado.soportado
          ? "Toca el micrófono y dilo como se lo dirías a alguien: quién, qué, dónde, para cuándo y cuánto tarda."
          : "Escribe la instrucción: quién, qué, dónde, para cuándo y cuánto tarda.";

  return (
    <Card pad className={s.caja} aria-label="Asignar con IA">
      <div className={c.pila}>
        <div className={c.fila}>
          <AutoAwesomeOutlinedIcon className={s.icono} aria-hidden />
          <strong>Asignar con IA</strong>
          <span className={c.tenue}>Nada se crea hasta que confirmes.</span>
        </div>

        <div className={s.entrada}>
          {dictado.soportado ? (
            <div className={s.micro} data-activo={escuchando ? "true" : undefined}>
              <span className={s.anillo} aria-hidden="true" />
              <button
                type="button"
                className={s.botonMicro}
                onClick={tocarMicrofono}
                disabled={!escuchando && ocupado}
                aria-pressed={escuchando}
                aria-label={escuchando ? "Terminar de dictar" : "Dictar la instrucción"}
                title={escuchando ? "Terminar de dictar" : "Dictar la instrucción"}
              >
                {escuchando ? <span className={s.cuadro} aria-hidden="true" /> : <MicNoneOutlinedIcon aria-hidden />}
              </button>
            </div>
          ) : null}

          <div className={s.campo}>
            <Textarea
              rows={2}
              value={textoVisible}
              maxLength={2000}
              readOnly={dictado.estado !== "inactivo"}
              data-vivo={escuchando ? "true" : undefined}
              className={s.instruccion}
              placeholder="Ej.: que Antonio vaya mañana a las 3 a Tox a revisar las cámaras, le lleva 2 horas; y que Carolina mande la cotización de Banorte para el viernes"
              aria-label="Instrucción para la IA"
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void enviar(texto);
              }}
            />
            <div className={s.estado} aria-live="polite" data-vacio={estadoLinea ? undefined : "true"}>
              {escuchando ? <OndaVoz analizador={dictado.analizador} activo={escuchando} /> : null}
              {dictado.estado === "terminando" || pensando ? <span className={s.puntos} aria-hidden="true" /> : null}
              {estadoLinea ? <span className={escuchando ? s.oyendo : c.tenue}>{estadoLinea}</span> : null}
            </div>
          </div>
        </div>

        <div className={c.fila}>
          <Button
            variant={dictado.soportado ? "secondary" : "primary"}
            className={c.tap}
            onClick={() => void enviar(texto)}
            disabled={!texto.trim() || ocupado}
            aria-busy={pensando}
            kbd="Ctrl+Enter"
          >
            {pensando ? "Preparando…" : "Preparar actividades"}
          </Button>
          {!dictado.soportado ? (
            <DictadoBoton
              disabled={pensando}
              onTexto={(frase) => {
                // Respaldo (sin reconocimiento en el navegador): al volver el texto se prepara solo.
                const completo = unirDictado(texto, frase).slice(0, 2000);
                setTexto(completo);
                void enviar(completo);
              }}
            />
          ) : null}
          {respuesta || texto ? (
            <Button variant="ghost" className={c.tap} onClick={limpiar} disabled={pensando}>
              Limpiar
            </Button>
          ) : null}
        </div>
        <p className={s.privacidad}>
          {dictado.soportado
            ? "El dictado usa el reconocimiento de voz de tu navegador."
            : "Si dictas, la voz se pasa a texto en el servidor de NEXARA."}
        </p>

        {dictado.error ? (
          <Alert tone="warning" role="alert">
            {dictado.error}
          </Alert>
        ) : null}
        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}
        {respuesta?.aclaracion ? (
          <Alert tone="info" role="status">
            {respuesta.aclaracion}
          </Alert>
        ) : null}

        {propuestas.length ? (
          <h3 className={s.esto}>
            Esto entendí{propuestas.length > 1 ? ` · ${propuestas.length} actividades` : ""}
            {listoEnMs != null ? <span className={c.tenue}> · listo en {(listoEnMs / 1000).toFixed(1)} s</span> : null}
          </h3>
        ) : null}

        {propuestas.map((p, i) => {
          const est = estados[i] || {};
          if (est.descartada) return null;
          const { aj, payload, agenda, destinoEmail, motivos } = armar(p, i);
          const tipo = tipoEfectivo(p, aj);
          const subtipo = subtipoEfectivo(p, aj);
          const falta = (campo: string) => p.faltantes.includes(campo);
          const regla = reglaEncargo(tipo, destinoEmail, encargoElegido(p, aj));
          const titulo = String(payload.titulo ?? p.titulo);
          const indicaciones = typeof payload.indicaciones === "string" ? payload.indicaciones : "";
          const lugar = lugarEfectivo(p, aj);
          const sucursalesLista = (opciones?.sucursales ?? []).filter((x) => !payload.clientId || x.clientId === Number(payload.clientId));
          const corregidos = (p.correcciones ?? []).filter((x) => x.campo !== "sucursal");
          const duracion = Number(payload.tiempoEstimadoMin) || 0;
          const opcionesDuracion = duracion && !DURACIONES_MIN.includes(duracion) ? [...DURACIONES_MIN, duracion].sort((a, b) => a - b) : DURACIONES_MIN;
          const responsableId = aj.responsableId ?? p.responsable?.id;
          const sugeridas = p.responsable ? [] : p.responsableCandidatos;
          const resto = personasOrdenadas.filter((x) => !sugeridas.some((o) => o.id === x.id));
          const responsableFuera = p.responsable && !personas.some((x) => x.id === p.responsable!.id) ? [p.responsable] : [];
          const pide = (campo: string, nota: string) => (falta(campo) ? `No lo dijiste: ${nota}` : undefined);
          const permitidos = kindsForAssignment({ creatorEmail: creadorEmail, targetEmail: destinoEmail ?? undefined, v2Role: v2, isSuperAdmin });
          const tiposVisibles: ActivityKind[] = TIPOS.filter((t) => permitidos.includes(t) || t === tipo);
          const clienteId = payload.clientId ? Number(payload.clientId) : null;
          const clientesSugeridos = p.cliente ? [p.cliente] : p.clienteCandidatos;
          const otrosClientes = todosLosClientes.filter((x) => !clientesSugeridos.some((o) => o.id === x.id));
          const altaNombre = clienteId ? null : nombreParaAlta(p, aj, todosLosClientes);
          const alta = altas[i] || {};
          const clienteNuevo = clienteId ? clientesNuevos.find((x) => x.id === clienteId) : undefined;
          const proyectoId = proyectoEfectivo(p, aj);
          const proyectosLista = [
            ...(p.proyecto ? [p.proyecto] : []),
            ...p.proyectoCandidatos,
            ...(opciones?.proyectos ?? []),
          ].filter((x, k, arr) => arr.findIndex((y) => y.id === x.id) === k);
          const etapa = etapas[i]?.nombre;
          const corrResponsable = correccionDe(p, "responsable");
          const corrCliente = correccionDe(p, "cliente");
          const corrLugar = correccionDe(p, "lugar") ?? correccionDe(p, "sucursal");

          return (
            <div key={i} className={s.propuesta}>
              <div className={c.filaEntre}>
                <div className={c.fila}>
                  <ActivityKindIcon kind={tipo} />
                  <strong>{titulo}</strong>
                  <Badge tone="brand" size="sm">
                    {ETIQUETA_TIPO[tipo]}
                  </Badge>
                </div>
                {!est.creada ? (
                  <Button variant="ghost" size="sm" onClick={() => setEstados((prev) => ({ ...prev, [i]: { descartada: true } }))}>
                    Descartar
                  </Button>
                ) : null}
              </div>
              {est.creada && indicaciones ? <p className={s.indicaciones}>{indicaciones}</p> : null}
              {/* El resumen es el de la IA: si se cambió el tipo, ya no aplica (los campos lo dicen). */}
              {tipo === p.tipo ? <p className={s.resumen}>{p.resumen}</p> : null}
              {corregidos.length && !est.creada ? (
                <p className={s.corregidos}>
                  Nombres corregidos:{" "}
                  {corregidos.map((x) => (x.como === "apodo" ? `«${x.de}» es ${x.a}` : `«${x.de}» → ${x.a}`)).join(" · ")}
                </p>
              ) : null}

              {!est.creada ? (
                <div className={s.ajustes}>
                  <Field label="Título" required fullWidth>
                    <Input
                      value={aj.titulo ?? titulo}
                      maxLength={200}
                      invalid={aj.titulo !== undefined && !aj.titulo.trim()}
                      onChange={(e) => ajustar(i, { titulo: e.target.value })}
                    />
                  </Field>
                  <Field label="Tipo" required>
                    <Select value={tipo} onChange={(e) => ajustar(i, { tipo: e.target.value as ActivityKind, subtipo: undefined })}>
                      {tiposVisibles.map((t) => (
                        <option key={t} value={t}>
                          {ETIQUETA_TIPO[t]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {tipo === "tarea" || tipo === "servicio" ? (
                    <Field label={tipo === "tarea" ? "Tipo de tarea" : "Tipo de servicio"} required>
                      <Select value={subtipo ?? ""} onChange={(e) => ajustar(i, { subtipo: e.target.value })}>
                        {tipo === "tarea"
                          ? SUBTIPOS_TAREA.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))
                          : TIPOS_SERVICIO.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label}
                              </option>
                            ))}
                      </Select>
                    </Field>
                  ) : null}
                  <Field
                    label="Responsable"
                    required
                    hint={
                      aj.responsableId === undefined && corrResponsable
                        ? textoCorreccion(corrResponsable)
                        : !p.responsable && p.textoResponsable
                          ? `Dijiste «${p.textoResponsable}»`
                          : undefined
                    }
                  >
                    <Select
                      value={responsableId ? String(responsableId) : ""}
                      onChange={(e) => ajustar(i, { responsableId: Number(e.target.value) || undefined })}
                    >
                      <option value="">Elige a quién</option>
                      {sugeridas.length ? (
                        <optgroup label="Coinciden con lo que dijiste">
                          {sugeridas.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.nombre}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      <optgroup label={sugeridas.length ? "Todas las personas" : "Personas"}>
                        {[...responsableFuera, ...resto].map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.nombre}
                          </option>
                        ))}
                      </optgroup>
                    </Select>
                  </Field>
                  {!conProyecto(tipo) && (clientesSugeridos.length || otrosClientes.length || altaNombre) ? (
                    <Field
                      label="Cliente"
                      required={tipo === "servicio"}
                      error={alta.error ?? null}
                      hint={
                        alta.creando
                          ? `Dando de alta «${altaNombre ?? ""}»…`
                          : clienteNuevo
                            ? "Cliente nuevo: completa su ficha en Clientes."
                            : aj.clientId === undefined && corrCliente
                              ? textoCorreccion(corrCliente)
                              : !p.cliente && p.textoCliente
                                ? `«${p.textoCliente}» no está registrado`
                                : undefined
                      }
                    >
                      <Select
                        value={clienteId ? String(clienteId) : ""}
                        disabled={alta.creando}
                        onChange={(e) => {
                          if (e.target.value === ALTA_CLIENTE) {
                            if (altaNombre) void agregarCliente(i, altaNombre);
                            return;
                          }
                          const nuevo = Number(e.target.value) || null;
                          // Otro cliente: la sucursal de la IA ya no aplica (el lugar escrito se queda).
                          ajustar(i, { clientId: nuevo, ...(p.sucursal && aj.lugar === undefined && nuevo !== (p.cliente?.id ?? null) ? { lugar: "" } : {}) });
                        }}
                      >
                        <option value="">{tipo === "servicio" ? "Elige el cliente" : "Sin cliente"}</option>
                        {altaNombre ? <option value={ALTA_CLIENTE}>{`+ Agregar cliente «${altaNombre}»`}</option> : null}
                        {clientesSugeridos.length ? (
                          <optgroup label={p.cliente ? "El que dijiste" : "Coinciden con lo que dijiste"}>
                            {clientesSugeridos.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nombre}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                        {otrosClientes.length ? (
                          <optgroup label="Todos los clientes">
                            {otrosClientes.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nombre}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                      </Select>
                    </Field>
                  ) : null}
                  {!conProyecto(tipo) ? (
                    <Field
                      label="Lugar"
                      optional
                      hint={aj.lugar === undefined && corrLugar ? textoCorreccion(corrLugar) : sucursalesLista.length ? "Sucursal o lugar" : undefined}
                    >
                      <Input
                        value={lugar}
                        maxLength={160}
                        list={sucursalesLista.length ? `asistente-lugares-${i}` : undefined}
                        placeholder="Sucursal, planta o dirección"
                        onChange={(e) => ajustar(i, { lugar: e.target.value })}
                      />
                    </Field>
                  ) : null}
                  {!conProyecto(tipo) && sucursalesLista.length ? (
                    <datalist id={`asistente-lugares-${i}`}>
                      {sucursalesLista.map((x) => (
                        <option key={x.id} value={x.nombre} />
                      ))}
                    </datalist>
                  ) : null}
                  {conProyecto(tipo) ? (
                    <Field label="Proyecto" required>
                      <Select
                        value={proyectoId ? String(proyectoId) : ""}
                        onChange={(e) => {
                          // Otro proyecto: se vuelve a proponer el periodo de su etapa.
                          setEtapas((prev) => {
                            const copia = { ...prev };
                            delete copia[i];
                            return copia;
                          });
                          ajustar(i, { projectId: Number(e.target.value) || null, dia: undefined, hasta: undefined, etapaId: undefined });
                        }}
                      >
                        <option value="">Elige el proyecto</option>
                        {proyectosLista.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.nombre}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}
                  <Field
                    label={agenda.hasta ? "Del" : "Día"}
                    required={tipo === "servicio" || tipo === "obra"}
                    hint={etapa ? `Etapa: ${etapa}` : agenda.dia ? undefined : pide("fecha", "¿para cuándo?")}
                  >
                    <DateInput value={agenda.dia ?? ""} onChange={(e) => ajustar(i, { dia: e.target.value })} />
                  </Field>
                  <Field label="Hora" hint={agenda.dia && !agenda.horaDicha ? "No la dijiste: revísala" : undefined}>
                    <Input type="time" value={agenda.hora ?? ""} disabled={!agenda.dia} onChange={(e) => ajustar(i, { hora: e.target.value })} />
                  </Field>
                  {!agenda.hasta ? (
                    <Field
                      label="Entregar a más tardar"
                      optional
                      hint={agenda.compromiso ? undefined : "Sin hora, el límite es el fin del día."}
                      error={compromisoValido(agenda) ? null : "Tiene que ser después de la hora de inicio."}
                    >
                      <Input
                        type="time"
                        value={agenda.compromiso ?? ""}
                        disabled={!agenda.dia}
                        onChange={(e) => ajustar(i, { compromiso: e.target.value })}
                      />
                    </Field>
                  ) : null}
                  <Field label="Último día" optional>
                    <DateInput
                      value={agenda.hasta ?? ""}
                      min={agenda.dia ?? undefined}
                      disabled={!agenda.dia}
                      invalid={Boolean(agenda.dia && agenda.hasta && agenda.hasta < agenda.dia)}
                      onChange={(e) => ajustar(i, { hasta: e.target.value })}
                    />
                  </Field>
                  <Field label="¿Cuánto tiempo toma?" required hint={duracion ? undefined : pide("duración", "elige cuánto tarda")}>
                    <Select
                      value={duracion ? String(duracion) : ""}
                      onChange={(e) => ajustar(i, { duracionMin: Number(e.target.value) || null })}
                    >
                      <option value="">Elige</option>
                      {opcionesDuracion.map((m) => (
                        <option key={m} value={m}>
                          {formatMinutes(m)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Prioridad">
                    <Select
                      value={String(payload.prioridad ?? "Media")}
                      onChange={(e) => ajustar(i, { prioridad: e.target.value as Prioridad })}
                    >
                      <option value="Alta">Alta</option>
                      <option value="Media">Media</option>
                      <option value="Baja">Baja</option>
                    </Select>
                  </Field>
                  {regla.ofrecer ? (
                    <Field label="Encargo" required>
                      <Select
                        value={regla.valor ?? ""}
                        onChange={(e) => ajustar(i, { encargo: (e.target.value || null) as Encargo | null })}
                      >
                        <option value="">Elige</option>
                        <option value="ejecucion">La hace en persona</option>
                        <option value="despacho">La reparte a su equipo</option>
                      </Select>
                    </Field>
                  ) : regla.fijo ? (
                    <Field label="Encargo">
                      <Input value={regla.valor === "despacho" ? "La reparte a su equipo" : "La hace en persona"} readOnly />
                    </Field>
                  ) : null}
                  <Field label="Indicaciones" optional fullWidth>
                    <Textarea
                      rows={2}
                      value={aj.indicaciones ?? indicaciones}
                      maxLength={4000}
                      placeholder="Detalle para quien la hará: síntoma, cantidades, con quién coordinarse…"
                      onChange={(e) => ajustar(i, { indicaciones: e.target.value })}
                    />
                  </Field>
                </div>
              ) : null}

              {p.avisos.map((a) => (
                <p key={a} className={c.pista}>
                  {a}
                </p>
              ))}
              {!est.creada && motivos.length ? <p className={c.error}>{motivos.join(" ")}</p> : null}
              {est.error ? (
                <Alert tone="danger" role="alert">
                  {est.error}
                </Alert>
              ) : null}
              {est.avisoEquipo ? (
                <Alert tone="warning" role="status">
                  {est.avisoEquipo}
                </Alert>
              ) : null}

              <div className={c.fila}>
                {est.creada ? (
                  <>
                    <span className={c.ok}>Creada{est.creada.folio ? ` · ${est.creada.folio}` : ""}. Ya se le avisó.</span>
                    <ButtonLink href={`/erp/actividades/${est.creada.id}`} size="sm" iconEnd={<ArrowForwardIcon />}>
                      Abrir
                    </ButtonLink>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    className={c.tap}
                    disabled={motivos.length > 0 || est.creando || creandoTodas}
                    aria-busy={est.creando}
                    onClick={() => void crear(i, p)}
                  >
                    {est.creando ? "Creando…" : "Confirmar y asignar"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {pendientes.length > 1 ? (
          <div className={c.fila}>
            <Button variant="primary" className={c.tap} disabled={!listas.length || creandoTodas} aria-busy={creandoTodas} onClick={() => void crearTodas()}>
              {creandoTodas ? "Asignando…" : listas.length === 1 ? "Confirmar la que está lista" : `Confirmar las ${listas.length} que están listas`}
            </Button>
            {listas.length < pendientes.length ? (
              <span className={c.tenue}>
                {pendientes.length - listas.length === 1 ? "Una necesita" : `${pendientes.length - listas.length} necesitan`} datos antes de crearse.
              </span>
            ) : null}
          </div>
        ) : null}
        {respuesta && propuestas.length > 0 && pendientes.length === 0 ? (
          <p className={c.ok}>Listo. Todo quedó asignado.</p>
        ) : null}
        {respuesta?.uso?.usdAprox != null ? (
          <p className={s.costo}>
            Costo de esta consulta: ~US${respuesta.uso.usdAprox.toFixed(4)} ({respuesta.uso.tokensEntrada + respuesta.uso.tokensSalida} tokens)
          </p>
        ) : null}
      </div>
    </Card>
  );
}
