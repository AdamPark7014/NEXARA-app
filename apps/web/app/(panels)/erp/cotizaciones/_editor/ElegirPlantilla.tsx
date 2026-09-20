"use client";

import { useEffect, useState } from "react";
import { SEGMENTO_LABEL, archivarPlantilla, listarPlantillasGuardadas, type PlantillaGuardadaResumen } from "@/lib/cotizaciones-api";
import { Ayuda } from "./campos";
import styles from "./editor.module.css";

/**
 * «Nueva desde plantilla»: en una cotización nueva, las plantillas de la empresa para empezar con
 * sus textos, secciones, columnas, términos y (si las trae) partidas. Sin plantillas no se muestra.
 */
export default function ElegirPlantilla({
  token,
  elegida,
  onElegir,
  onError,
}: {
  token: string | null;
  elegida: number | null;
  onElegir: (id: number) => Promise<void>;
  onError: (mensaje: string) => void;
}) {
  const [plantillas, setPlantillas] = useState<PlantillaGuardadaResumen[] | null>(null);
  const [cargando, setCargando] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    listarPlantillasGuardadas(token)
      .then((p) => vivo && setPlantillas(p))
      .catch(() => vivo && setPlantillas([]));
    return () => {
      vivo = false;
    };
  }, [token]);

  if (!plantillas?.length) return null;

  return (
    <section className={styles.hoja} aria-labelledby="plantillas-titulo" data-testid="elegir-plantilla">
      <div className={styles.hojaCabeza}>
        <div className={styles.hojaTitulos}>
          <div className={styles.hojaLinea}>
            <h2 id="plantillas-titulo" className={styles.tituloSeccion}>
              Empezar desde una plantilla
            </h2>
            <Ayuda titulo="las plantillas">
              Traen los textos, las secciones, las columnas y los términos guardados; el cliente y las fechas los pones
              tú. Si la plantilla se guardó «con partidas», también llegan sus precios.
            </Ayuda>
          </div>
        </div>
      </div>
      <ul className={styles.listaPlantillas}>
        {plantillas.map((p) => {
          const activa = elegida === p.id;
          return (
            <li key={p.id} className={`${styles.plantillaGuardada} ${activa ? styles.plantillaGuardadaActiva : ""}`}>
              <span className={styles.plantillaGuardadaTextos}>
                <strong>{p.nombre}</strong>
                <span className={styles.pista}>
                  {[SEGMENTO_LABEL[p.segmento], p.conPartidas ? `${p.partidas} partidas` : "sin partidas", p.projectName]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className={styles.hojaAcciones}>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  title="Quitar de la lista"
                  aria-label={`Quitar la plantilla ${p.nombre}`}
                  onClick={async () => {
                    if (!token) return;
                    try {
                      await archivarPlantilla(token, p.id);
                      setPlantillas((lista) => (lista ?? []).filter((x) => x.id !== p.id));
                    } catch (e) {
                      onError(e instanceof Error ? e.message : "No se pudo quitar la plantilla");
                    }
                  }}
                >
                  Quitar
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  disabled={cargando !== null}
                  aria-pressed={activa}
                  onClick={async () => {
                    setCargando(p.id);
                    try {
                      await onElegir(p.id);
                    } finally {
                      setCargando(null);
                    }
                  }}
                >
                  {cargando === p.id ? "Cargando…" : activa ? "En uso" : "Usar"}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
