"use client";

import PreguntaProyecto from "@/components/costos/PreguntaProyecto";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import MicNoneOutlinedIcon from "@mui/icons-material/MicNoneOutlined";
import { Alert, Badge, Button, ButtonLink, Card, DateInput, Field, Input, Select, Textarea } from "@/components/base";
import ActivityKindIcon from "@/components/ops/ActivityKindIcon";
import DictadoBoton from "@/components/DictadoBoton";
import OndaVoz from "@/app/(panels)/erp/reuniones/OndaVoz";
import { unirDictado } from "@/lib/use-dictado";
import { useDictadoVivo } from "@/lib/use-dictado-vivo";
import { useUser } from "@/components/UserContext";
import { useCronometroProceso } from "@/lib/cronometro-proceso";
import { formatApiError } from "@/lib/erp-api";
import { AvisoParecidos } from "@/components/erp/ClienteRapido";
import { buscarClientesParecidos, type ClienteParecido } from "@/lib/sales-api";
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
  clientePendiente,
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
  tareaEquivalente,
  textoCorreccion,
  textoCuando,
  textoTipo,
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
/** «+ Escribir otro cliente…»: abre un campo para dar de alta uno que la frase no dijo. */
const OTRO_CLIENTE = "__otro__";

/** Etapa del proyecto que se propuso para una tarjeta (como «Asignar»). */
type EtapaPropuesta = { nombre: string | null };

/**
 * Un dato de la tarjeta: se lee de un vistazo y el lápiz lo abre ahí mismo para cambiarlo. Lo que la
 * IA supuso lleva un punto ámbar. `obligado` = falta para confirmar: se queda abierto hasta llenarse.
 */
function Renglon({
  etiqueta,
  valor,
  nota,
  supuesto,
  explicacion,
  abierto,
  obligado,
  onAlternar,
  children,
}: {
  etiqueta: string;
  valor: ReactNode;
  nota?: string;
  supuesto?: boolean;
  /** Por qué se propuso así: se lee al abrir el renglón (y al pasar sobre la nota). */
  explicacion?: string;
  abierto?: boolean;
  obligado?: boolean;
  onAlternar?: () => void;
  children?: ReactNode;
}) {
  const abiertoAhora = Boolean(abierto && children);
  return (
    <div className={s.renglon} data-abierto={abiertoAhora ? "true" : undefined}>
      <span className={s.etiqueta}>{etiqueta}</span>
      {abiertoAhora ? (
        <div className={s.editor}>
          {children}
          {explicacion ? <p className={s.explicacion}>{explicacion}</p> : null}
        </div>
      ) : (
        <>
          <div className={s.valor}>{valor}</div>
          <span className={s.nota} title={explicacion}>
            {nota && supuesto ? <span className={s.punto} aria-hidden="true" /> : null}
            {nota}
          </span>
        </>
      )}
      {children && !obligado ? (
        <button
          type="button"
          className={s.lapiz}
          aria-label={`${abiertoAhora ? "Listo con" : "Editar"} ${etiqueta}`}
          title={abiertoAhora ? "Listo" : "Editar"}
          aria-expanded={abiertoAhora}
          onClick={onAlternar}
        >
          {abiertoAhora ? <CheckIcon aria-hidden /> : <EditOutlinedIcon aria-hidden />}
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

/**
 * «Asignar con IA», hasta arriba de Actividades. Se dicta con un toque (el texto
 * aparece en vivo y al callar se prepara solo) o se escribe y «Preparar actividades». La IA
 * propone tipo, persona, cliente, día, plazo y duración; los nombres mal oídos los corrige el
 * API contra el catálogo y lo dice («Corregido de "talks"»). Cada campo se corrige a mano en
 * la tarjeta, sin volver a escribir la instrucción, y se confirma una por una o todas. Solo se
 * muestra si la API dice que está disponible: a todo mando con gente a cargo y a dirección, con la
 * IA activa. La regla vive allá (`quien-asigna.ts`) y aquí no se repite.
 */
export default function AsistenteIA({ onCreada }: { onCreada?: () => void }) {
  const { user, token } = useUser();
  const [disponible, setDisponible] = useState(false);
  const [personas, setPersonas] = useState<PersonaAsignable[]>([]);
  const v2 = useMemo(() => resolveV2RoleKey(user), [user]);

  useEffect(() => {
    if (!token) return;
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
  }, [token]);

  if (!disponible || !token) return null;
  return (
    <Contenido
      token={token}
      personas={personas}
      creadorEmail={user?.email ?? null}
      isSuperAdmin={Boolean(user?.isSuperAdmin)}
      v2={v2}
      onCreada={onCreada}
      verCosto={v2 === ROLES.CEO || Boolean(user?.isSuperAdmin)}
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
  verCosto,
}: {
  token: string;
  personas: PersonaAsignable[];
  creadorEmail: string | null;
  isSuperAdmin: boolean;
  v2: RoleKey | null;
  onCreada?: () => void;
  verCosto: boolean;
}) {
  /** Desde que empieza a escribir o dictar hasta que confirma cada tarjeta. */
  const cronometro = useCronometroProceso("asignar_ia", token, { manual: true });
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState<RespuestaAsistente | null>(null);
  const [listoEnMs, setListoEnMs] = useState<number | null>(null);
  const [ajustes, setAjustes] = useState<Record<number, Ajustes>>({});
  const [estados, setEstados] = useState<Record<number, Estado>>({});
  const [etapas, setEtapas] = useState<Record<number, EtapaPropuesta>>({});
  /** Renglones abiertos con el lápiz, por tarjeta y campo. */
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [creandoTodas, setCreandoTodas] = useState(false);
  /** Clientes dados de alta al confirmar una tarjeta (alta rápida). */
  const [clientesNuevos, setClientesNuevos] = useState<Referencia[]>([]);
  /** Los que se trajeron del aviso de parecidos: ya existían, no son nuevos. */
  const [clientesTraidos, setClientesTraidos] = useState<Referencia[]>([]);
  const [parecidos, setParecidos] = useState<Record<string, ClienteParecido[]>>({});
  const revisados = useRef(new Set<string>());
  /** Lo que se está escribiendo en «+ Escribir otro cliente…», por tarjeta. */
  const [escribiendo, setEscribiendo] = useState<Record<number, string | undefined>>({});
  const personasOrdenadas = useMemo(() => [...personas].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [personas]);
  /** Lo que ya estaba escrito cuando empezó el dictado: lo dicho se agrega después. */
  const base = useRef("");
  const pensandoRef = useRef(false);
  /** Cada interpretación nueva invalida las etapas que se estaban pidiendo para la anterior. */
  const generacion = useRef(0);
  /** Proyecto del que se pidió la etapa, por tarjeta (si cambia, la respuesta vieja se ignora). */
  const etapaPedida = useRef<Record<number, number>>({});
  /** Clientes ya dados de alta al confirmar: «Confirmar todas» corre sin esperar al estado. */
  const altasHechas = useRef(new Map<string, Referencia>());

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
        setEscribiendo({});
        setAbiertos({});
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
      cronometro.arrancar();
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
  const todosLosClientes = useMemo(() => {
    const base = opciones?.clientes ?? [];
    const extra = [...clientesNuevos, ...clientesTraidos].filter((n, k, arr) => !base.some((c) => c.id === n.id) && arr.findIndex((x) => x.id === n.id) === k);
    return [...base, ...extra];
  }, [opciones, clientesNuevos, clientesTraidos]);

  // ¿El cliente que se va a dar de alta ya existe con otro nombre? Se revisa en cuanto se propone.
  const nombresPorRevisar = propuestas
    .map((p, i) => clientePendiente(p, ajustes[i] || {}))
    .filter((n): n is string => Boolean(n))
    .join("\n");
  useEffect(() => {
    if (!nombresPorRevisar) return;
    for (const nombre of nombresPorRevisar.split("\n")) {
      const clave = nombreComparable(nombre);
      if (revisados.current.has(clave)) continue;
      revisados.current.add(clave);
      buscarClientesParecidos(token, { nombre })
        .then((lista) => setParecidos((prev) => ({ ...prev, [clave]: lista })))
        .catch(() => undefined);
    }
  }, [nombresPorRevisar, token]);

  /** «+ Escribir otro cliente…»: lo escrito queda como cliente a dar de alta al confirmar. */
  const usarEscrito = (i: number) => {
    const nombre = escribiendo[i]?.trim();
    if (!nombre) return;
    agregarCliente(i, nombre);
    setEscribiendo((prev) => ({ ...prev, [i]: undefined }));
  };

  /** «Usar este» del aviso: ese cliente en la tarjeta, sin crear otro. */
  const usarParecido = async (i: number, p: PropuestaActividad, parecido: ClienteParecido) => {
    setEstados((prev) => ({ ...prev, [i]: { creando: true } }));
    try {
      const usado = await altaRapidaCliente(token, parecido.nombre, { tipo: tipoEfectivo(p, ajustes[i] || {}), reutilizarId: parecido.id });
      setClientesTraidos((prev) => [...prev.filter((x) => x.id !== usado.id), usado]);
      ajustar(i, { clientId: usado.id, clienteNuevo: null, clienteNuevoConfirmado: false });
      setEstados((prev) => ({ ...prev, [i]: {} }));
    } catch (e) {
      setEstados((prev) => ({ ...prev, [i]: { error: formatApiError(e, "No se pudo usar ese cliente.") } }));
    }
  };

  /**
   * «+ Agregar cliente "Toks"»: queda elegido para darse de alta al confirmar (solo el nombre); las
   * demás tarjetas que dijeron el mismo nombre y no tienen cliente también lo toman.
   */
  const agregarCliente = (i: number, nombre: string) => {
    const clave = nombreComparable(nombre);
    setAjustes((prev) => {
      const sig = { ...prev };
      propuestas.forEach((p, j) => {
        const aj = prev[j] || {};
        const mismo = j === i || (!p.cliente && aj.clientId === undefined && nombreComparable(nombreParaAlta(p, aj, []) ?? "") === clave);
        if (!mismo) return;
        // El nombre ya es el cliente: no se repite como lugar.
        const lugarIgual = !p.sucursal && nombreComparable(lugarEfectivo(p, aj)) === clave;
        sig[j] = { ...aj, clientId: undefined, clienteNuevo: nombre, ...(lugarIgual ? { lugar: "" } : {}) };
      });
      return sig;
    });
  };

  /** El alta del cliente al confirmar: si otra tarjeta ya lo dio de alta, se reutiliza. */
  const clienteParaCrear = async (nombre: string, opciones: { tipo: ActivityKind; confirmarNuevo: boolean }): Promise<Referencia> => {
    const clave = nombreComparable(nombre);
    const ya = todosLosClientes.find((x) => nombreComparable(x.nombre) === clave) ?? altasHechas.current.get(clave);
    if (ya) return ya;
    const nuevo = await altaRapidaCliente(token, nombre, opciones);
    altasHechas.current.set(clave, nuevo);
    setClientesNuevos((prev) => [...prev.filter((x) => x.id !== nuevo.id), nuevo]);
    return nuevo;
  };

  /** Todo lo que la tarjeta necesita para mostrarse y crearse con lo que se eligió. */
  const armar = (p: PropuestaActividad, i: number) => {
    const aj = ajustes[i] || {};
    const responsableId = aj.responsableId ?? p.responsable?.id;
    const destino = personas.find((x) => x.id === responsableId);
    // Sin la lista de personas no se sabe a quién va: no se aplican las reglas por persona.
    const destinoEmail = destino ? destino.email ?? null : undefined;
    // Sin hora dicha, empieza a la entrada de quien ejecuta (10:00 la oficina, 08:00 la cuadrilla).
    const entrada = destino?.horaEntrada ?? null;
    const payload = payloadFinal(p, aj, { destinoEmail, proyectos: opciones?.proyectos, sucursales: opciones?.sucursales, entrada });
    const agenda = agendaFinal(p, aj, entrada);
    const pendiente = clientePendiente(p, aj);
    const motivos = bloqueos(p, payload, { creadorEmail, destinoEmail, v2Role: v2, isSuperAdmin, agenda, clienteNuevo: pendiente });
    const parecidosCliente = pendiente && !aj.clienteNuevoConfirmado ? parecidos[nombreComparable(pendiente)] ?? [] : [];
    if (parecidosCliente.length) motivos.push(`«${pendiente}» se parece a un cliente que ya existe: elige si es el mismo.`);
    return { aj, payload, agenda, destinoEmail, motivos, pendiente, parecidosCliente };
  };

  // Obra o proyecto sin fechas dichas: el periodo de la etapa vigente, como propone «Asignar».
  const proyectosPorTarjeta = propuestas
    .map((p, i) => {
      const aj = ajustes[i] || {};
      const id = proyectoEfectivo(p, aj);
      const sinFechaDicha = !agendaFinal(p, aj).dia || p.agenda?.diaDicho === false;
      return id && sinFechaDicha && aj.dia === undefined && !etapas[i] ? `${i}:${id}` : null;
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
    const { aj, payload, destinoEmail, motivos, pendiente } = armar(p, i);
    if (motivos.length || estados[i]?.creando || estados[i]?.creada) return false;
    setEstados((prev) => ({ ...prev, [i]: { creando: true } }));
    let creada: { id: number; anNumber?: string };
    try {
      if (pendiente && !payload.clientId) {
        try {
          payload.clientId = (await clienteParaCrear(pendiente, { tipo: tipoEfectivo(p, aj), confirmarNuevo: Boolean(aj.clienteNuevoConfirmado) })).id;
        } catch (e) {
          setEstados((prev) => ({ ...prev, [i]: { error: `No se pudo dar de alta «${pendiente}»: ${formatApiError(e, "error de conexión")}. Elige otro cliente o vuelve a intentar.` } }));
          return false;
        }
      }
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
    cronometro.terminar(creada.id, tipoEfectivo(p, aj));
    // Lo que sigue en la misma instrucción cuenta desde aquí; con la última, el reloj se queda parado.
    if (pendientes.length > 1) cronometro.arrancar();
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
    cronometro.descartar();
    setCreandoTodas(false);
  };

  const limpiar = () => {
    cronometro.descartar();
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
              onChange={(e) => {
                cronometro.arrancar();
                setTexto(e.target.value);
              }}
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
          const { aj, payload, agenda, destinoEmail, motivos, pendiente, parecidosCliente } = armar(p, i);
          const tipo = tipoEfectivo(p, aj);
          const subtipo = subtipoEfectivo(p, aj);
          const regla = reglaEncargo(tipo, destinoEmail, encargoElegido(p, aj));
          const titulo = String(payload.titulo ?? p.titulo);
          const indicaciones = typeof payload.indicaciones === "string" ? payload.indicaciones : "";
          const lugar = lugarEfectivo(p, aj);
          const sucursalesLista = (opciones?.sucursales ?? []).filter((x) => !payload.clientId || x.clientId === Number(payload.clientId));
          const duracion = Number(payload.tiempoEstimadoMin) || 0;
          const opcionesDuracion = duracion && !DURACIONES_MIN.includes(duracion) ? [...DURACIONES_MIN, duracion].sort((a, b) => a - b) : DURACIONES_MIN;
          const responsableId = aj.responsableId ?? p.responsable?.id;
          const sugeridas = p.responsableCandidatos;
          const resto = personasOrdenadas.filter((x) => !sugeridas.some((o) => o.id === x.id));
          const responsableFuera = p.responsable && !personas.some((x) => x.id === p.responsable!.id) && !sugeridas.some((o) => o.id === p.responsable!.id) ? [p.responsable] : [];
          const otraPersona = p.responsableOrigen === "probable" ? sugeridas.find((o) => o.id !== p.responsable?.id) : undefined;
          const permitidos = kindsForAssignment({ creatorEmail: creadorEmail, targetEmail: destinoEmail ?? undefined, v2Role: v2, isSuperAdmin });
          const tiposVisibles: ActivityKind[] = TIPOS.filter((t) => permitidos.includes(t) || t === tipo);
          const clienteId = payload.clientId ? Number(payload.clientId) : null;
          const clientesSugeridos = p.cliente ? [p.cliente] : p.clienteCandidatos;
          const otrosClientes = todosLosClientes.filter((x) => !clientesSugeridos.some((o) => o.id === x.id));
          const altaNombre = clienteId || pendiente ? null : nombreParaAlta(p, aj, todosLosClientes);
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

          const abierto = (campo: string) => Boolean(abiertos[`${i}:${campo}`]);
          const alternar = (campo: string) => setAbiertos((prev) => ({ ...prev, [`${i}:${campo}`]: !prev[`${i}:${campo}`] }));
          const sinPersona = !responsableId;
          const sinClienteDeServicio = tipo === "servicio" && !clienteId && !pendiente;
          const sinTiempo = !duracion;
          const agendaMal = !compromisoValido(agenda) || Boolean(agenda.dia && agenda.hasta && agenda.hasta < agenda.dia) || ((tipo === "servicio" || tipo === "obra") && !agenda.dia);
          const nombrePersona = personas.find((x) => x.id === responsableId)?.nombre ?? (responsableId === p.responsable?.id ? p.responsable?.nombre : undefined);
          const nombreCliente = pendiente ?? (clienteId ? todosLosClientes.find((x) => x.id === clienteId)?.nombre ?? p.cliente?.nombre : undefined);
          const nombreProyecto = proyectosLista.find((x) => x.id === proyectoId)?.nombre;
          // Lo que ya se dice en su renglón no se repite abajo.
          const notasPie = p.avisos.filter((a) => a !== p.notaResponsable && a !== p.notaCliente);

          if (est.creada) {
            return (
              <div key={i} className={s.propuesta}>
                <div className={s.encabezado}>
                  <ActivityKindIcon kind={tipo} />
                  <strong className={s.titulo}>{titulo}</strong>
                  <Badge tone="brand" size="sm">
                    {ETIQUETA_TIPO[tipo]}
                  </Badge>
                </div>
                {indicaciones ? <p className={s.indicaciones}>{indicaciones}</p> : null}
                {est.avisoEquipo ? (
                  <Alert tone="warning" role="status">
                    {est.avisoEquipo}
                  </Alert>
                ) : null}
                <div className={c.fila}>
                  <span className={c.ok}>Creada{est.creada.folio ? ` · ${est.creada.folio}` : ""}. Ya se le avisó.</span>
                  <ButtonLink href={`/erp/actividades/${est.creada.id}`} size="sm" iconEnd={<ArrowForwardIcon />}>
                    Abrir
                  </ButtonLink>
                </div>
                <PreguntaProyecto activityId={est.creada.id} />
              </div>
            );
          }

          return (
            <div key={i} className={s.propuesta}>
              <div className={s.encabezado}>
                <ActivityKindIcon kind={tipo} />
                {abierto("titulo") || !titulo.trim() ? (
                  <Input
                    aria-label="Título"
                    className={s.tituloCampo}
                    value={aj.titulo ?? titulo}
                    maxLength={200}
                    invalid={aj.titulo !== undefined && !aj.titulo.trim()}
                    onChange={(e) => ajustar(i, { titulo: e.target.value })}
                  />
                ) : (
                  <strong className={s.titulo}>{titulo}</strong>
                )}
                <button
                  type="button"
                  className={s.lapiz}
                  aria-label={abierto("titulo") ? "Listo con Título" : "Editar Título"}
                  title={abierto("titulo") ? "Listo" : "Editar"}
                  onClick={() => alternar("titulo")}
                >
                  {abierto("titulo") ? <CheckIcon aria-hidden /> : <EditOutlinedIcon aria-hidden />}
                </button>
                <Button variant="ghost" size="sm" className={s.descartar} onClick={() => setEstados((prev) => ({ ...prev, [i]: { descartada: true } }))}>
                  Descartar
                </Button>
              </div>

              <div className={s.renglones}>
                <Renglon etiqueta="Tipo" valor={textoTipo(tipo, subtipo)} abierto={abierto("tipo")} onAlternar={() => alternar("tipo")}>
                  <div className={s.ajustes}>
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
                  </div>
                </Renglon>

                <Renglon
                  etiqueta="Responsable"
                  valor={nombrePersona ?? <span className={s.vacio}>Elige a quién</span>}
                  nota={
                    aj.responsableId !== undefined
                      ? undefined
                      : corrResponsable
                        ? textoCorreccion(corrResponsable)
                        : otraPersona
                          ? `También puede ser ${otraPersona.nombre}`
                          : p.responsableOrigen === "sugerido"
                            ? "No lo dijiste"
                            : !p.responsable && p.textoResponsable
                              ? `Dijiste «${p.textoResponsable}»`
                              : undefined
                  }
                  supuesto={aj.responsableId === undefined && (p.responsableOrigen === "probable" || p.responsableOrigen === "sugerido")}
                  explicacion={p.notaResponsable ?? undefined}
                  abierto={abierto("responsable") || sinPersona}
                  obligado={sinPersona}
                  onAlternar={() => alternar("responsable")}
                >
                  <Select
                    aria-label="Responsable"
                    value={responsableId ? String(responsableId) : ""}
                    onChange={(e) => {
                      const id = Number(e.target.value) || undefined;
                      const nueva = personas.find((x) => x.id === id);
                      // Lo que esa persona no recibe no se podría confirmar: pasa a la tarea equivalente.
                      const recibe = nueva ? kindsForAssignment({ creatorEmail: creadorEmail, targetEmail: nueva.email ?? undefined, v2Role: v2, isSuperAdmin }) : null;
                      ajustar(i, { responsableId: id, ...(recibe && !recibe.includes(tipo) ? tareaEquivalente(tipo, subtipo) : {}) });
                    }}
                  >
                    <option value="">Elige a quién</option>
                    {sugeridas.length ? (
                      <optgroup label={p.responsableOrigen === "sugerido" ? "Las más probables" : "Coinciden con lo que dijiste"}>
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
                </Renglon>

                {regla.ofrecer ? (
                  <Renglon
                    etiqueta="Encargo"
                    valor={regla.valor === "despacho" ? "La reparte a su equipo" : regla.valor === "ejecucion" ? "La hace en persona" : <span className={s.vacio}>Elige</span>}
                    abierto={abierto("encargo") || !regla.valor}
                    obligado={!regla.valor}
                    onAlternar={() => alternar("encargo")}
                  >
                    <Select aria-label="Encargo" value={regla.valor ?? ""} onChange={(e) => ajustar(i, { encargo: (e.target.value || null) as Encargo | null })}>
                      <option value="">Elige</option>
                      <option value="ejecucion">La hace en persona</option>
                      <option value="despacho">La reparte a su equipo</option>
                    </Select>
                  </Renglon>
                ) : regla.fijo ? (
                  <Renglon etiqueta="Encargo" valor={regla.valor === "despacho" ? "La reparte a su equipo" : "La hace en persona"} />
                ) : null}

                {conProyecto(tipo) ? (
                  <Renglon
                    etiqueta="Proyecto"
                    valor={nombreProyecto ?? <span className={s.vacio}>Elige el proyecto</span>}
                    abierto={abierto("proyecto") || !proyectoId}
                    obligado={!proyectoId}
                    onAlternar={() => alternar("proyecto")}
                  >
                    <Select
                      aria-label="Proyecto"
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
                  </Renglon>
                ) : (
                  <Renglon
                    etiqueta="Cliente"
                    valor={
                      nombreCliente || lugar ? (
                        <>
                          {nombreCliente ?? "Sin cliente"}
                          {lugar ? <span className={s.detalle}> · {lugar}</span> : null}
                        </>
                      ) : (
                        <span className={s.vacio}>{tipo === "servicio" ? "Elige el cliente" : "Sin cliente"}</span>
                      )
                    }
                    nota={
                      pendiente
                        ? "Nuevo: alta al confirmar"
                        : clienteNuevo
                          ? "Cliente nuevo: completa su ficha en Clientes."
                          : aj.clientId === undefined && corrCliente
                            ? textoCorreccion(corrCliente)
                            : aj.lugar === undefined && corrLugar
                              ? textoCorreccion(corrLugar)
                              : !p.cliente && p.textoCliente && !lugar
                                ? `«${p.textoCliente}» no está registrado`
                                : undefined
                    }
                    supuesto={Boolean(pendiente)}
                    explicacion={p.notaCliente ?? undefined}
                    abierto={abierto("cliente") || sinClienteDeServicio || parecidosCliente.length > 0}
                    obligado={sinClienteDeServicio || parecidosCliente.length > 0}
                    onAlternar={() => alternar("cliente")}
                  >
                    <div className={s.ajustes}>
                      <Field label="Cliente" required={tipo === "servicio"}>
                        <Select
                          value={pendiente ? ALTA_CLIENTE : clienteId ? String(clienteId) : ""}
                          onChange={(e) => {
                            if (e.target.value === ALTA_CLIENTE) {
                              if (altaNombre) agregarCliente(i, altaNombre);
                              return;
                            }
                            if (e.target.value === OTRO_CLIENTE) {
                              setEscribiendo((prev) => ({ ...prev, [i]: "" }));
                              return;
                            }
                            const nuevo = Number(e.target.value) || null;
                            // Otro cliente: la sucursal de la IA ya no aplica (el lugar escrito se queda).
                            ajustar(i, { clientId: nuevo, clienteNuevo: null, ...(p.sucursal && aj.lugar === undefined && nuevo !== (p.cliente?.id ?? null) ? { lugar: "" } : {}) });
                          }}
                        >
                          <option value="">{tipo === "servicio" ? "Elige el cliente" : "Sin cliente"}</option>
                          {pendiente ? <option value={ALTA_CLIENTE}>{`${pendiente} (cliente nuevo)`}</option> : null}
                          {altaNombre ? <option value={ALTA_CLIENTE}>{`+ Agregar cliente «${altaNombre}»`}</option> : null}
                          <option value={OTRO_CLIENTE}>+ Escribir otro cliente…</option>
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
                      {escribiendo[i] !== undefined ? (
                        <Field label="Cliente nuevo" hint="Solo el nombre; sus datos se completan después en Clientes.">
                          <div className={s.clienteEscrito}>
                            <Input
                              value={escribiendo[i] ?? ""}
                              maxLength={200}
                              autoFocus
                              placeholder="Nombre del cliente"
                              onChange={(e) => setEscribiendo((prev) => ({ ...prev, [i]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key !== "Enter") return;
                                e.preventDefault();
                                if ((escribiendo[i]?.trim().length ?? 0) >= 2) usarEscrito(i);
                              }}
                            />
                            <Button
                              variant="tonal"
                              size="sm"
                              disabled={(escribiendo[i]?.trim().length ?? 0) < 2}
                              onClick={() => usarEscrito(i)}
                            >
                              Usar
                            </Button>
                          </div>
                        </Field>
                      ) : null}
                      {parecidosCliente.length && pendiente ? (
                        <AvisoParecidos
                          nombre={pendiente}
                          parecidos={parecidosCliente}
                          ocupado={est.creando}
                          onUsar={(parecido) => void usarParecido(i, p, parecido)}
                          onCrearOtro={() => ajustar(i, { clienteNuevoConfirmado: true })}
                        />
                      ) : null}
                      <Field label="Lugar" optional hint={sucursalesLista.length ? "Sucursal o lugar" : undefined}>
                        <Input
                          value={lugar}
                          maxLength={160}
                          list={sucursalesLista.length ? `asistente-lugares-${i}` : undefined}
                          placeholder="Sucursal, planta o dirección"
                          onChange={(e) => ajustar(i, { lugar: e.target.value })}
                        />
                      </Field>
                      {sucursalesLista.length ? (
                        <datalist id={`asistente-lugares-${i}`}>
                          {sucursalesLista.map((x) => (
                            <option key={x.id} value={x.nombre} />
                          ))}
                        </datalist>
                      ) : null}
                    </div>
                  </Renglon>
                )}

                <Renglon
                  etiqueta="Cuándo"
                  valor={agenda.dia ? textoCuando(agenda, hoyISO()) : <span className={s.vacio}>{tipo === "servicio" || tipo === "obra" ? "Indica el día" : "Sin fecha"}</span>}
                  nota={etapa ? `Etapa: ${etapa}` : p.agenda?.diaDicho === false && aj.dia === undefined ? "No dijiste cuándo" : agenda.dia && !agenda.horaDicha ? "Hora sugerida" : undefined}
                  supuesto={!etapa && p.agenda?.diaDicho === false && aj.dia === undefined}
                  abierto={abierto("cuando") || agendaMal}
                  obligado={agendaMal}
                  onAlternar={() => alternar("cuando")}
                >
                  <div className={s.ajustes}>
                    <Field label={agenda.hasta ? "Del" : "Día"} required={tipo === "servicio" || tipo === "obra"}>
                      <DateInput value={agenda.dia ?? ""} onChange={(e) => ajustar(i, { dia: e.target.value })} />
                    </Field>
                    <Field label="Hora">
                      <Input type="time" value={agenda.hora ?? ""} disabled={!agenda.dia} onChange={(e) => ajustar(i, { hora: e.target.value })} />
                    </Field>
                    {!agenda.hasta ? (
                      <Field
                        label="Entregar a más tardar"
                        optional
                        hint={agenda.compromiso ? undefined : "Sin hora, el límite es el fin del día."}
                        error={compromisoValido(agenda) ? null : "Tiene que ser después de la hora de inicio."}
                      >
                        <Input type="time" value={agenda.compromiso ?? ""} disabled={!agenda.dia} onChange={(e) => ajustar(i, { compromiso: e.target.value })} />
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
                  </div>
                </Renglon>

                <Renglon
                  etiqueta="Tiempo"
                  valor={duracion ? formatMinutes(duracion) : <span className={s.vacio}>Elige cuánto tarda</span>}
                  nota={p.duracionOrigen === "estimada" && aj.duracionMin === undefined && duracion ? "Estimado" : undefined}
                  supuesto={p.duracionOrigen === "estimada" && aj.duracionMin === undefined && Boolean(duracion)}
                  explicacion={p.duracionOrigen === "estimada" && p.duracionDetalle ? `Tabla de tiempos: ${p.duracionDetalle}.` : undefined}
                  abierto={abierto("tiempo") || sinTiempo}
                  obligado={sinTiempo}
                  onAlternar={() => alternar("tiempo")}
                >
                  <Select aria-label="Tiempo" value={duracion ? String(duracion) : ""} onChange={(e) => ajustar(i, { duracionMin: Number(e.target.value) || null })}>
                    <option value="">Elige</option>
                    {opcionesDuracion.map((m) => (
                      <option key={m} value={m}>
                        {formatMinutes(m)}
                      </option>
                    ))}
                  </Select>
                </Renglon>

                <Renglon etiqueta="Prioridad" valor={String(payload.prioridad ?? "Media")} abierto={abierto("prioridad")} onAlternar={() => alternar("prioridad")}>
                  <Select aria-label="Prioridad" value={String(payload.prioridad ?? "Media")} onChange={(e) => ajustar(i, { prioridad: e.target.value as Prioridad })}>
                    <option value="Alta">Alta</option>
                    <option value="Media">Media</option>
                    <option value="Baja">Baja</option>
                  </Select>
                </Renglon>

                {indicaciones || aj.indicaciones !== undefined || abierto("indicaciones") ? (
                  <Renglon etiqueta="Indicaciones" valor={indicaciones || <span className={s.vacio}>Sin indicaciones</span>} abierto={abierto("indicaciones")} onAlternar={() => alternar("indicaciones")}>
                    <Textarea
                      aria-label="Indicaciones"
                      rows={2}
                      value={aj.indicaciones ?? indicaciones}
                      maxLength={4000}
                      placeholder="Detalle para quien la hará: síntoma, cantidades, con quién coordinarse…"
                      onChange={(e) => ajustar(i, { indicaciones: e.target.value })}
                    />
                  </Renglon>
                ) : null}
              </div>

              {notasPie.map((a) => (
                <p key={a} className={c.pista}>
                  {a}
                </p>
              ))}
              {motivos.length ? <p className={c.error}>{motivos.join(" ")}</p> : null}
              {est.error ? (
                <Alert tone="danger" role="alert">
                  {est.error}
                </Alert>
              ) : null}

              <div className={s.pie}>
                {!indicaciones && aj.indicaciones === undefined && !abierto("indicaciones") ? (
                  <Button variant="ghost" size="sm" onClick={() => alternar("indicaciones")}>
                    Agregar indicaciones
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  variant="primary"
                  className={c.tap}
                  disabled={motivos.length > 0 || est.creando || creandoTodas}
                  aria-busy={est.creando}
                  onClick={() => void crear(i, p)}
                >
                  {est.creando ? "Creando…" : "Confirmar y asignar"}
                </Button>
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
        {verCosto && respuesta?.uso?.usdAprox != null ? (
          <p className={s.costo}>
            Costo de esta consulta: ~US${respuesta.uso.usdAprox.toFixed(4)} ({respuesta.uso.tokensEntrada + respuesta.uso.tokensSalida} tokens)
          </p>
        ) : null}
      </div>
    </Card>
  );
}
