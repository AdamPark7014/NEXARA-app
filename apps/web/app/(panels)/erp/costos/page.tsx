"use client";

/**
 * Costos · Horas sin proyecto (mockup aprobado 01-11-2026).
 *
 * El bloqueo del costo por proyecto: casi ninguna hora del reloj dice de qué proyecto es. Aquí se liga
 * lo que quedó suelto, de lo que más pesa hacia abajo, con una sugerencia de las reglas o de la IA.
 * Ligar no toca la actividad y aquí no se enseña dinero. Contrato: `/api/costos/por-ligar`.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import { Button, ButtonLink, EmptyState, SkeletonRows } from "@/components/base";
import { Aviso, Dialogo, Segmentos } from "@/components/mesa-contable/piezas";
import { Banda, Kpi, c, useAccesoCostos } from "@/components/costos/piezas";
import { formatApiError } from "@/lib/erp-api";
import {
  deshacerLiga,
  detalleDeFila,
  filtrarCandidatos,
  getBandeja,
  horas,
  ligarActividad,
  pct,
  sugerirConIa,
  type Bandeja,
  type Candidato,
  type FilaPorLigar,
  type Periodo,
  type TipoLiga,
} from "@/lib/costos";

const PERIODOS: ReadonlyArray<{ id: Periodo; texto: string }> = [
  { id: "semana", texto: "7 días" },
  { id: "mes", texto: "30 días" },
  { id: "todo", texto: "Todo" },
];

export default function HorasSinProyecto() {
  const { token } = useUser();
  const acceso = useAccesoCostos(token);
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [datos, setDatos] = useState<Bandeja | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ligadas, setLigadas] = useState<Record<number, string>>({});
  const [eligiendo, setEligiendo] = useState<FilaPorLigar | null>(null);
  const [ocupada, setOcupada] = useState<number | null>(null);
  const [sugiriendo, setSugiriendo] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      setDatos(await getBandeja(token, periodo));
      setLigadas({});
    } catch (e) {
      setError(formatApiError(e, "No se pudo leer la bandeja."));
    }
  }, [token, periodo]);

  useEffect(() => {
    if (acceso?.puedeLigar) void cargar();
  }, [acceso?.puedeLigar, cargar]);

  async function ligar(fila: FilaPorLigar, tipo: TipoLiga, id: number | null, nombre: string) {
    if (!token) return;
    setOcupada(fila.activityId);
    try {
      await ligarActividad(token, fila.activityId, tipo, id);
      setLigadas((x) => ({ ...x, [fila.activityId]: nombre }));
      setEligiendo(null);
    } catch (e) {
      setError(formatApiError(e, "No se pudo ligar."));
    } finally {
      setOcupada(null);
    }
  }

  async function deshacer(fila: FilaPorLigar) {
    if (!token) return;
    setOcupada(fila.activityId);
    try {
      await deshacerLiga(token, fila.activityId);
      setLigadas(({ [fila.activityId]: _quitada, ...resto }) => resto);
    } catch (e) {
      setError(formatApiError(e, "No se pudo deshacer."));
    } finally {
      setOcupada(null);
    }
  }

  async function sugerir() {
    if (!token) return;
    setSugiriendo(true);
    setAviso(null);
    try {
      const r = await sugerirConIa(token, periodo);
      setAviso(
        r.consultadas
          ? `La IA revisó ${r.consultadas === 1 ? "1 actividad" : `${r.consultadas} actividades`} y sugirió ${r.sugeridas}. Tú decides en cada una.`
          : "Ya no quedan actividades por revisar con IA en este periodo.",
      );
      await cargar();
    } catch (e) {
      setError(formatApiError(e, "La IA no respondió. La bandeja sigue igual."));
    } finally {
      setSugiriendo(false);
    }
  }

  if (acceso && !acceso.puedeLigar) {
    return (
      <div className={c.page}>
        <Banda acceso={acceso} titulo="Costos" />
        <EmptyState
          title="Esta sección es de dirección, contabilidad y coordinación"
          description="Si llevas un proyecto, sus costos están en la pestaña Costos de ese proyecto."
        />
      </div>
    );
  }

  const horasLigadasAhora = (datos?.filas ?? [])
    .filter((f) => ligadas[f.activityId])
    .reduce((a, f) => a + f.horas, 0);
  const r = datos?.resumen;
  const porLigar = r ? Math.max(0, r.horasPorLigar - horasLigadasAhora) : null;
  const pctAhora = r && r.horasTotal > 0 ? ((r.horasLigadas + horasLigadasAhora) / r.horasTotal) * 100 : null;

  return (
    <div className={c.page}>
      <Banda
        acceso={acceso}
        titulo="Horas sin proyecto"
        subtitulo="Cada hora del reloj se le carga a un proyecto, a una cotización o a la oficina. Ligar aquí no cambia la actividad."
      >
        <div className={c.kpis}>
          <Kpi cifra={horas(porLigar)} texto="Horas por ligar" tono={porLigar ? "atencion" : "ok"} />
          <Kpi cifra={pct(pctAhora == null ? null : Math.round(pctAhora * 10) / 10)} texto="De las horas ya tienen a dónde ir" />
          <Kpi cifra={horas(r?.horasTotal)} texto="Horas del reloj en el periodo" />
          <Kpi cifra={r?.conSugerencia ?? "—"} texto="Con sugerencia lista" />
        </div>
      </Banda>

      {error ? <Aviso tono="danger" role="alert">{error}</Aviso> : null}
      {aviso ? <Aviso tono="info">{aviso}</Aviso> : null}

      <div className={c.toolbar}>
        <Segmentos items={PERIODOS} valor={periodo} onCambio={setPeriodo} etiqueta="Periodo" />
        {datos?.iaDisponible ? (
          <Button variant="secondary" size="sm" loading={sugiriendo} onClick={() => void sugerir()}>
            Sugerir con IA
          </Button>
        ) : null}
      </div>

      <section className={`${c.card} ${c.scroll}`} aria-label="Actividades por ligar">
        {!datos ? (
          <SkeletonRows rows={5} />
        ) : !datos.filas.length ? (
          <EmptyState title="Nada por ligar en este periodo" description="Todas las horas ya tienen a dónde ir." />
        ) : (
          datos.filas.map((f) => {
            const hecha = ligadas[f.activityId];
            return (
              <div key={f.activityId} className={c.fila} data-listo={hecha ? "true" : undefined}>
                <span>
                  <Link href={`/erp/actividades/${f.activityId}`}>{f.titulo}</Link>
                  <small>{[f.cliente, detalleDeFila(f)].filter(Boolean).join(" · ")}</small>
                </span>
                <span className={c.der}>{horas(f.horas)}</span>
                {hecha ? (
                  <span className={c.sugerida}>
                    {hecha}
                    <small>Ligado</small>
                  </span>
                ) : f.sugerencia ? (
                  <span className={c.sugerida}>
                    {f.sugerencia.nombre}
                    <small>{f.sugerencia.motivo}</small>
                  </span>
                ) : (
                  <span className={c.sinSugerencia}>
                    Sin sugerencia
                    <small>Elige a dónde va</small>
                  </span>
                )}
                <span className={c.acciones}>
                  {hecha ? (
                    <Button variant="ghost" size="sm" disabled={ocupada === f.activityId} onClick={() => void deshacer(f)}>
                      Deshacer
                    </Button>
                  ) : (
                    <>
                      {f.sugerencia ? (
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={ocupada === f.activityId}
                          onClick={() => void ligar(f, f.sugerencia!.tipo, f.sugerencia!.id, f.sugerencia!.nombre)}
                        >
                          Aceptar
                        </Button>
                      ) : null}
                      <Button variant="secondary" size="sm" onClick={() => setEligiendo(f)}>
                        {f.sugerencia ? "Otro" : "Elegir"}
                      </Button>
                    </>
                  )}
                </span>
              </div>
            );
          })
        )}
      </section>

      <ElegirLiga
        fila={eligiendo}
        candidatos={datos?.candidatos ?? []}
        onCerrar={() => setEligiendo(null)}
        onElegir={(fila, tipo, id, nombre) => void ligar(fila, tipo, id, nombre)}
      />
    </div>
  );
}

function ElegirLiga({
  fila,
  candidatos,
  onCerrar,
  onElegir,
}: {
  fila: FilaPorLigar | null;
  candidatos: readonly Candidato[];
  onCerrar: () => void;
  onElegir: (fila: FilaPorLigar, tipo: TipoLiga, id: number | null, nombre: string) => void;
}) {
  const [texto, setTexto] = useState("");
  useEffect(() => setTexto(""), [fila?.activityId]);
  const lista = filtrarCandidatos(candidatos, texto);
  return (
    <Dialogo
      abierto={Boolean(fila)}
      titulo="¿A dónde va esta actividad?"
      descripcion={fila?.titulo}
      onCerrar={onCerrar}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="secondary" onClick={() => fila && onElegir(fila, "INTERNA", null, "Trabajo interno")}>
            Es trabajo interno
          </Button>
        </>
      }
    >
      <input
        className={c.buscar}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Busca un proyecto, cotización o cliente"
        aria-label="Buscar proyecto o cotización"
      />
      <div className={c.opciones}>
        {lista.map((o) => (
          <div key={`${o.tipo}:${o.id}`}>
            <button type="button" className={c.opcion} onClick={() => fila && onElegir(fila, o.tipo, o.id, o.nombre)}>
              {o.nombre}
              <small>{[o.tipo === "PROYECTO" ? "Proyecto" : "Cotización", o.cliente].filter(Boolean).join(" · ")}</small>
            </button>
          </div>
        ))}
        {!lista.length ? <p className={c.hint}>No hay coincidencias. Si es un trabajo nuevo, primero crea su proyecto.</p> : null}
      </div>
      <p className={c.hint}>
        ¿Es un trabajo nuevo?{" "}
        <ButtonLink href="/erp/proyectos/nuevo" variant="ghost" size="sm">
          Crear proyecto
        </ButtonLink>
      </p>
    </Dialogo>
  );
}
