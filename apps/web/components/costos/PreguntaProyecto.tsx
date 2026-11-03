"use client";

import { useEffect, useState } from "react";
import { Button, Select } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { getSugerenciaDeLiga, ligarActividad, type SugerenciaDeLiga, type TipoLiga } from "@/lib/costos";
import { formatApiError } from "@/lib/erp-api";
import { useAccesoCostos } from "./piezas";
import styles from "./PreguntaProyecto.module.css";

/**
 * Una actividad que nació suelta pregunta una vez de qué proyecto es. La respuesta se guarda como su
 * liga, y con eso sus horas ya cuentan para el costo sin pasar por la bandeja. Solo la ve quien puede
 * ligar; a los demás no se les pregunta lo que no pueden contestar.
 */
export default function PreguntaProyecto({ activityId }: { activityId: number }) {
  const { token } = useUser();
  const acceso = useAccesoCostos(token);
  const [datos, setDatos] = useState<SugerenciaDeLiga | null>(null);
  const [otro, setOtro] = useState(false);
  const [elegido, setElegido] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !acceso?.puedeLigar) return;
    let vivo = true;
    getSugerenciaDeLiga(token, activityId)
      .then((d) => vivo && setDatos(d))
      // Es una ayuda: si falla, la actividad sigue en la bandeja de Costos.
      .catch(() => vivo && setDatos(null));
    return () => {
      vivo = false;
    };
  }, [token, acceso?.puedeLigar, activityId]);

  if (listo) {
    return (
      <p className={styles.listo} role="status">
        {listo}
      </p>
    );
  }
  if (!datos?.pendiente) return null;

  const sugerido = datos.sugerencia?.tipo === "PROYECTO" ? datos.sugerencia : null;
  const verLista = otro || !sugerido;

  const responder = async (tipo: TipoLiga, id: number | null, nombre: string | null) => {
    if (!token) return;
    setOcupado(true);
    setError(null);
    try {
      await ligarActividad(token, activityId, tipo, id);
      setListo(nombre ? `Ligada a ${nombre}. Sus horas ya cuentan para su costo.` : "Quedó como trabajo interno.");
    } catch (e) {
      setError(formatApiError(e, "No se pudo guardar tu respuesta."));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className={styles.caja} aria-label="De qué proyecto es esta actividad">
      {sugerido ? (
        <p className={styles.pregunta}>
          ¿Es del proyecto <strong>{sugerido.nombre}</strong>?
        </p>
      ) : (
        <p className={styles.pregunta}>¿De qué proyecto es esta actividad?</p>
      )}
      <div className={styles.botones}>
        {sugerido && !otro ? (
          <>
            <Button size="sm" variant="primary" disabled={ocupado} onClick={() => void responder("PROYECTO", sugerido.id, sugerido.nombre)}>
              Sí, ligarla
            </Button>
            <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => setOtro(true)}>
              Otro proyecto
            </Button>
          </>
        ) : null}
        {verLista ? (
          <>
            <div className={styles.lista}>
              <Select aria-label="Elegir proyecto" controlSize="sm" value={elegido} onChange={(e) => setElegido(e.target.value)}>
                <option value="">Elegir proyecto…</option>
                {datos.proyectos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              size="sm"
              variant="primary"
              disabled={ocupado || !elegido}
              onClick={() =>
                void responder(
                  "PROYECTO",
                  Number(elegido),
                  datos.proyectos.find((p) => String(p.id) === elegido)?.nombre ?? "su proyecto",
                )
              }
            >
              Ligarla
            </Button>
          </>
        ) : null}
        <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => void responder("INTERNA", null, null)}>
          Es interna
        </Button>
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        <p className={styles.nota}>Tu respuesta se guarda como su liga. Con eso sus horas ya cuentan para el costo del proyecto.</p>
      )}
    </section>
  );
}
