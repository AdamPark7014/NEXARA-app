"use client";

import { useEffect, useMemo, useState } from "react";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { Alert, Badge, Button, ButtonLink, Card, Field, Select, Textarea } from "@/components/base";
import ActivityKindIcon from "@/components/ops/ActivityKindIcon";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import { resolveV2RoleKey } from "@/lib/user-access";
import {
  bloqueos,
  crearActividad,
  estadoAsistente,
  interpretar,
  payloadFinal,
  personasAsignables,
  type Ajustes,
  type PersonaAsignable,
  type PropuestaActividad,
  type RespuestaAsistente,
} from "@/lib/asistente-ia-api";
import c from "./comun.module.css";
import s from "./AsistenteIA.module.css";

type Estado = { creando?: boolean; creada?: { id: number; folio?: string }; error?: string; descartada?: boolean };

/**
 * «Que Antonio vaya a Tox a las 3 con el cliente» → la IA propone tipo, persona, cliente y
 * hora; la persona revisa y confirma. Solo se muestra si el servidor tiene la IA activa.
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

  const enviar = async () => {
    if (!texto.trim() || pensando) return;
    setPensando(true);
    setError(null);
    try {
      const r = await interpretar(token, texto);
      setRespuesta(r);
      setAjustes({});
      setEstados({});
    } catch (e) {
      setError(formatApiError(e, "La IA no respondió. Intenta de nuevo."));
    } finally {
      setPensando(false);
    }
  };

  const ajustar = (i: number, cambio: Ajustes) => setAjustes((prev) => ({ ...prev, [i]: { ...prev[i], ...cambio } }));

  const crear = async (i: number, p: PropuestaActividad) => {
    setEstados((prev) => ({ ...prev, [i]: { creando: true } }));
    try {
      const creada = await crearActividad(token, payloadFinal(p, ajustes[i] || {}));
      setEstados((prev) => ({ ...prev, [i]: { creada: { id: creada.id, folio: creada.anNumber } } }));
      onCreada?.();
    } catch (e) {
      setEstados((prev) => ({ ...prev, [i]: { error: formatApiError(e, "No se pudo crear.") } }));
    }
  };

  const propuestas = respuesta?.propuestas ?? [];
  const pendientes = propuestas.filter((_, i) => !estados[i]?.creada && !estados[i]?.descartada);

  return (
    <Card pad className={s.caja} aria-label="Asignar con IA">
      <div className={c.pila}>
        <div className={c.fila}>
          <AutoAwesomeOutlinedIcon className={s.icono} aria-hidden />
          <strong>Asignar con IA</strong>
          <span className={c.tenue}>Escríbelo como se lo dirías a alguien. Nada se crea hasta que confirmes.</span>
        </div>
        <Textarea
          rows={2}
          value={texto}
          maxLength={2000}
          placeholder="Ej.: que Antonio vaya a Tox mañana a las 3 con el cliente, y que Carolina revise las cámaras de Banorte Satélite"
          aria-label="Instrucción para la IA"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void enviar();
          }}
        />
        <div className={c.fila}>
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
          const aj = ajustes[i] || {};
          const payload = payloadFinal(p, aj);
          const destino = personas.find((x) => x.id === Number(payload.responsableId));
          const motivos = bloqueos(p, payload, {
            creadorEmail: user?.email,
            destinoEmail: destino ? destino.email ?? null : undefined,
            v2Role: v2,
            isSuperAdmin: user?.isSuperAdmin,
          });
          const opcionesPersona = p.responsableCandidatos.length ? p.responsableCandidatos : personas.map((x) => ({ id: x.id, nombre: x.nombre }));

          return (
            <div key={i} className={s.propuesta}>
              <div className={c.filaEntre}>
                <div className={c.fila}>
                  <ActivityKindIcon kind={p.tipo} />
                  <strong>{p.titulo}</strong>
                  <Badge tone="brand" size="sm">
                    {p.tipoEtiqueta}
                  </Badge>
                </div>
                {!est.creada ? (
                  <Button variant="ghost" size="sm" onClick={() => setEstados((prev) => ({ ...prev, [i]: { descartada: true } }))}>
                    Descartar
                  </Button>
                ) : null}
              </div>
              <p className={s.resumen}>{p.resumen}</p>
              {p.razonTipo ? <p className={c.tenue}>Por qué {p.tipoEtiqueta.toLowerCase()}: {p.razonTipo}</p> : null}

              {!est.creada ? (
                <div className={s.ajustes}>
                  {!p.responsable ? (
                    <Field label="Responsable" required hint={p.textoResponsable ? `Dijiste «${p.textoResponsable}»` : undefined}>
                      <Select
                        value={aj.responsableId ? String(aj.responsableId) : ""}
                        onChange={(e) => ajustar(i, { responsableId: Number(e.target.value) || undefined })}
                      >
                        <option value="">Elige a quién</option>
                        {opcionesPersona.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.nombre}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}
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
                    disabled={motivos.length > 0 || est.creando}
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
