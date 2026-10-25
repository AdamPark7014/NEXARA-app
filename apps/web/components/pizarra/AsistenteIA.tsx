"use client";

import { useEffect, useMemo, useState } from "react";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { Alert, Badge, Button, ButtonLink, Card, DateInput, Field, Input, Select, Textarea } from "@/components/base";
import ActivityKindIcon from "@/components/ops/ActivityKindIcon";
import DictadoBoton from "@/components/DictadoBoton";
import { unirDictado } from "@/lib/use-dictado";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import { formatMinutes } from "@/lib/activity-labels";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac";
import {
  DURACIONES_MIN,
  agendaFinal,
  bloqueos,
  crearActividad,
  encargoElegido,
  estadoAsistente,
  interpretar,
  pasoEquipo,
  payloadFinal,
  personasAsignables,
  reglaEncargo,
  sumarAlEquipo,
  type Ajustes,
  type Encargo,
  type PersonaAsignable,
  type Prioridad,
  type PropuestaActividad,
  type RespuestaAsistente,
} from "@/lib/asistente-ia-api";
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

/**
 * «Que Antonio vaya a Tox a las 3 con el cliente» → la IA propone tipo, persona, cliente,
 * día, plazo y duración; el CEO revisa, corrige lo que haga falta y confirma una por una o
 * todas juntas. Solo se muestra al CEO y si el servidor tiene la IA activa.
 */
export default function AsistenteIA({ onCreada }: { onCreada?: () => void }) {
  const { user, token } = useUser();
  const [disponible, setDisponible] = useState(false);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState<RespuestaAsistente | null>(null);
  const [ajustes, setAjustes] = useState<Record<number, Ajustes>>({});
  const [estados, setEstados] = useState<Record<number, Estado>>({});
  const [editandoTexto, setEditandoTexto] = useState<Record<number, boolean>>({});
  const [creandoTodas, setCreandoTodas] = useState(false);
  const [personas, setPersonas] = useState<PersonaAsignable[]>([]);
  const v2 = useMemo(() => resolveV2RoleKey(user), [user]);
  // Solo el CEO asigna con IA (la matriz del API lo vuelve a exigir).
  const esCeo = v2 === ROLES.CEO || Boolean(user?.isSuperAdmin);
  const personasOrdenadas = useMemo(() => [...personas].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [personas]);

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

  const enviar = async () => {
    if (!texto.trim() || pensando) return;
    setPensando(true);
    setError(null);
    try {
      const r = await interpretar(token, texto);
      setRespuesta(r);
      setAjustes({});
      setEstados({});
      setEditandoTexto({});
    } catch (e) {
      // Lo escrito o dictado no se borra: basta volver a tocar «Interpretar».
      const motivo = formatApiError(e, "La IA no respondió").replace(/\.+$/, "");
      setError(`${motivo} y tu instrucción sigue aquí: vuelve a tocar «Interpretar».`);
    } finally {
      setPensando(false);
    }
  };

  const ajustar = (i: number, cambio: Ajustes) => setAjustes((prev) => ({ ...prev, [i]: { ...prev[i], ...cambio } }));

  /** Todo lo que la tarjeta necesita para mostrarse y crearse con lo que se eligió. */
  const armar = (p: PropuestaActividad, i: number) => {
    const aj = ajustes[i] || {};
    const responsableId = aj.responsableId ?? p.responsable?.id;
    const destino = personas.find((x) => x.id === responsableId);
    // Sin la lista de personas no se sabe a quién va: no se aplican las reglas por persona.
    const destinoEmail = destino ? destino.email ?? null : undefined;
    const payload = payloadFinal(p, aj, { destinoEmail });
    const agenda = agendaFinal(p, aj);
    const motivos = bloqueos(p, payload, {
      creadorEmail: user?.email,
      destinoEmail,
      v2Role: v2,
      isSuperAdmin: user?.isSuperAdmin,
      agenda,
    });
    return { aj, payload, agenda, destinoEmail, motivos };
  };

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

  const propuestas = respuesta?.propuestas ?? [];
  const pendientes = propuestas.map((p, i) => ({ p, i })).filter(({ i }) => !estados[i]?.creada && !estados[i]?.descartada);
  const listas = pendientes.filter(({ p, i }) => armar(p, i).motivos.length === 0);

  const crearTodas = async () => {
    if (creandoTodas) return;
    setCreandoTodas(true);
    // Una por una: si alguna falla, las demás siguen y la tarjeta dice por qué.
    for (const { p, i } of listas) await crear(i, p);
    setCreandoTodas(false);
  };

  return (
    <Card pad className={s.caja} aria-label="Asignar con IA">
      <div className={c.pila}>
        <div className={c.fila}>
          <AutoAwesomeOutlinedIcon className={s.icono} aria-hidden />
          <strong>Asignar con IA</strong>
          <span className={c.tenue}>
            Escríbelo o díctalo como se lo dirías a alguien: quién, qué, dónde, para cuándo y cuánto tarda, y nada se crea hasta que confirmes.
          </span>
        </div>
        <Textarea
          rows={2}
          value={texto}
          maxLength={2000}
          placeholder="Ej.: que Antonio vaya a Tox mañana a las 3 a revisar las cámaras, le lleva 2 horas; y que Carolina mande la cotización de Banorte para el viernes"
          aria-label="Instrucción para la IA"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void enviar();
          }}
        />
        <div className={c.fila}>
          <DictadoBoton onTexto={(frase) => setTexto((t) => unirDictado(t, frase).slice(0, 2000))} disabled={pensando} />
          <Button variant="primary" className={c.tap} onClick={() => void enviar()} disabled={!texto.trim() || pensando} aria-busy={pensando}>
            {pensando ? "Interpretando…" : "Interpretar"}
          </Button>
          {respuesta ? (
            <Button
              variant="ghost"
              className={c.tap}
              onClick={() => {
                setRespuesta(null);
                setTexto("");
              }}
            >
              Limpiar
            </Button>
          ) : null}
        </div>

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

        {propuestas.map((p, i) => {
          const est = estados[i] || {};
          if (est.descartada) return null;
          const { aj, payload, agenda, destinoEmail, motivos } = armar(p, i);
          const falta = (campo: string) => p.faltantes.includes(campo);
          const regla = reglaEncargo(p.tipo, destinoEmail, encargoElegido(p, aj));
          const editando = Boolean(editandoTexto[i]);
          const titulo = String(payload.titulo ?? p.titulo);
          const indicaciones = typeof payload.indicaciones === "string" ? payload.indicaciones : "";
          const duracion = Number(payload.tiempoEstimadoMin) || 0;
          const opcionesDuracion = duracion && !DURACIONES_MIN.includes(duracion) ? [...DURACIONES_MIN, duracion].sort((a, b) => a - b) : DURACIONES_MIN;
          const responsableId = aj.responsableId ?? p.responsable?.id;
          const sugeridas = p.responsable ? [] : p.responsableCandidatos;
          const resto = personasOrdenadas.filter((x) => !sugeridas.some((o) => o.id === x.id));
          const responsableFuera = p.responsable && !personas.some((x) => x.id === p.responsable!.id) ? [p.responsable] : [];
          const pide = (campo: string, nota: string) => (falta(campo) ? `No lo dijiste: ${nota}` : undefined);

          return (
            <div key={i} className={s.propuesta}>
              <div className={c.filaEntre}>
                <div className={c.fila}>
                  <ActivityKindIcon kind={p.tipo} />
                  <strong>{titulo}</strong>
                  <Badge tone="brand" size="sm">
                    {p.tipoEtiqueta}
                  </Badge>
                </div>
                {!est.creada ? (
                  <div className={c.fila}>
                    <Button variant="ghost" size="sm" onClick={() => setEditandoTexto((prev) => ({ ...prev, [i]: !editando }))} aria-expanded={editando}>
                      {editando ? "Listo" : "Editar texto"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEstados((prev) => ({ ...prev, [i]: { descartada: true } }))}>
                      Descartar
                    </Button>
                  </div>
                ) : null}
              </div>
              {editando && !est.creada ? (
                <div className={s.texto}>
                  <Field label="Título" required>
                    <Input value={aj.titulo ?? titulo} maxLength={200} onChange={(e) => ajustar(i, { titulo: e.target.value })} />
                  </Field>
                  <Field label="Indicaciones" optional>
                    <Textarea
                      rows={3}
                      value={aj.indicaciones ?? indicaciones}
                      maxLength={4000}
                      placeholder="Detalle para quien la hará: síntoma, cantidades, con quién coordinarse…"
                      onChange={(e) => ajustar(i, { indicaciones: e.target.value })}
                    />
                  </Field>
                </div>
              ) : indicaciones ? (
                <p className={s.indicaciones}>{indicaciones}</p>
              ) : null}
              <p className={s.resumen}>{p.resumen}</p>
              {p.razonTipo ? <p className={c.tenue}>Por qué {p.tipoEtiqueta.toLowerCase()}: {p.razonTipo}</p> : null}

              {!est.creada ? (
                <div className={s.ajustes}>
                  <Field label="Responsable" required hint={!p.responsable && p.textoResponsable ? `Dijiste «${p.textoResponsable}»` : undefined}>
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
                  {!p.cliente && p.clienteCandidatos.length ? (
                    <Field label="Cliente" required={p.tipo === "servicio"} hint={p.textoCliente ? `Dijiste «${p.textoCliente}»` : undefined}>
                      <Select
                        value={aj.clientId ? String(aj.clientId) : ""}
                        onChange={(e) => ajustar(i, { clientId: Number(e.target.value) || null })}
                      >
                        <option value="">{p.tipo === "servicio" ? "Elige el cliente" : "Sin cliente"}</option>
                        {p.clienteCandidatos.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.nombre}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}
                  {!p.proyecto && p.proyectoCandidatos.length ? (
                    <Field label="Proyecto" required>
                      <Select
                        value={aj.projectId ? String(aj.projectId) : ""}
                        onChange={(e) => ajustar(i, { projectId: Number(e.target.value) || null })}
                      >
                        <option value="">Elige el proyecto</option>
                        {p.proyectoCandidatos.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.nombre}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}
                  <Field
                    label={agenda.hasta ? "Del" : "Día"}
                    required={p.tipo === "servicio" || p.tipo === "obra"}
                    hint={agenda.dia ? undefined : pide("fecha", "¿para cuándo?")}
                  >
                    <DateInput value={agenda.dia ?? ""} onChange={(e) => ajustar(i, { dia: e.target.value })} />
                  </Field>
                  <Field label="Hora" hint={agenda.dia && !agenda.horaDicha ? "No la dijiste: revisa la hora" : undefined}>
                    <Input type="time" value={agenda.hora ?? ""} disabled={!agenda.dia} onChange={(e) => ajustar(i, { hora: e.target.value })} />
                  </Field>
                  <Field label="Al (último día, si dura varios)" optional>
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
                    <span className={c.ok}>Creada{est.creada.folio ? ` · ${est.creada.folio}` : ""} y ya se le avisó.</span>
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
