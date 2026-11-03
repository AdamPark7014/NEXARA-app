"use client";

import { useEffect, useRef, useState } from "react";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { Alert, Button, Input } from "@/components/base";
import DictadoBoton from "@/components/DictadoBoton";
import { formatApiError } from "@/lib/erp-api";
import { unirDictado } from "@/lib/use-dictado";
import { redactarTextos } from "@/lib/cotizaciones-api";
import {
  documentoConRedaccion,
  documentoConTextos,
  sinTextosPropios,
  textosDelDocumento,
  type DocumentoCotizacion,
  type TextosGuardados,
} from "@/lib/cotizacion-documento";
import s from "./CotizarConIA.module.css";

type Cambiar = (cambio: (doc: DocumentoCotizacion) => DocumentoCotizacion) => void;
type Resultado = "ia" | "general" | "deshecho";

const MAX_INDICACION = 200;

/**
 * «Redactar con IA» (muestra aprobada por Adam el 02-11): un solo botón para el 01, el 02 y el título
 * si falta, con el texto hecho para estas partidas. No pregunta antes de reemplazar: «Deshacer»
 * regresa lo que había, también lo editado a mano.
 */
export default function RedactarConIA({
  token,
  doc,
  cambiar,
  disparar,
}: {
  token: string | null;
  doc: DocumentoCotizacion;
  cambiar: Cambiar;
  /** Sube al usar «Cotizar con IA»: se redacta solo, si todavía no hay textos. */
  disparar: number;
}) {
  const [indicacion, setIndicacion] = useState("");
  const [pensando, setPensando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const anterior = useRef<TextosGuardados | null>(null);
  const yaDisparado = useRef(0);

  const partidas = doc.partidas.filter((p) => p.name.trim());
  const tus = partidas.length === 1 ? "tu partida" : `tus ${partidas.length} partidas`;

  async function redactar() {
    if (!token || pensando || !partidas.length) return;
    setPensando(true);
    setError(null);
    setResultado(null);
    try {
      const r = await redactarTextos(token, { partidas, segmento: doc.segmento, indicacion });
      cambiar((d) => {
        anterior.current = textosDelDocumento(d);
        return documentoConRedaccion(d, r);
      });
      setResultado(r.via);
    } catch (e) {
      setError(formatApiError(e, "No se pudo redactar"));
    } finally {
      setPensando(false);
    }
  }

  useEffect(() => {
    if (disparar <= yaDisparado.current) return;
    yaDisparado.current = disparar;
    if (sinTextosPropios(doc)) void redactar();
    // Solo responde al aviso: el documento y el token se leen como estén en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disparar]);

  function deshacer() {
    const guardados = anterior.current;
    if (!guardados) return;
    cambiar((d) => documentoConTextos(d, guardados));
    anterior.current = null;
    setResultado("deshecho");
  }

  if (!partidas.length) return null;

  return (
    <section className={s.tarjeta} aria-labelledby="redactar-ia-titulo" data-testid="redactar-con-ia">
      <div className={s.cabeza}>
        <AutoAwesomeOutlinedIcon className={s.icono} aria-hidden="true" />
        <h2 id="redactar-ia-titulo" className={s.titulo}>
          Textos de la propuesta
        </h2>
      </div>
      <div className={s.cuerpo}>
        <span className={s.pista}>
          La IA lee {tus} y escribe el alcance ejecutivo, los puntos técnicos y, si falta, el título del proyecto. Tarda unos 7 segundos.
        </span>
        <div className={s.fila}>
          <div className={s.indicacion}>
            <Input
              value={indicacion}
              maxLength={MAX_INDICACION}
              placeholder="Opcional: algo que deba decir. Ej.: es para el almacén nuevo"
              aria-label="Indicación opcional para la IA"
              onChange={(e) => setIndicacion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void redactar();
                }
              }}
            />
          </div>
          <DictadoBoton disabled={pensando} onTexto={(frase) => setIndicacion((actual) => unirDictado(actual, frase).slice(0, MAX_INDICACION))} />
          <Button variant="primary" iconStart={<AutoAwesomeOutlinedIcon />} onClick={() => void redactar()} loading={pensando}>
            {pensando ? "Redactando…" : sinTextosPropios(doc) ? "Redactar con IA" : "Redactar de nuevo"}
          </Button>
        </div>
        {pensando ? (
          <div className={s.barrita} aria-hidden="true">
            <i />
          </div>
        ) : null}
        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}
        {resultado === "ia" ? (
          <Alert
            tone="success"
            role="status"
            action={
              <Button size="sm" variant="secondary" onClick={deshacer}>
                Deshacer
              </Button>
            }
          >
            Listo: escribí el 01 y el 02 con {tus}. Revísalos antes de enviar.
          </Alert>
        ) : null}
        {resultado === "general" ? (
          <Alert
            tone="warning"
            role="status"
            action={
              <Button size="sm" variant="secondary" onClick={deshacer}>
                Deshacer
              </Button>
            }
          >
            La IA no respondió: dejé el texto general para que lo ajustes, o vuelve a intentarlo en un momento.
          </Alert>
        ) : null}
        {resultado === "deshecho" ? (
          <Alert tone="info" role="status">
            Listo: regresé lo que había.
          </Alert>
        ) : null}
      </div>
    </section>
  );
}
