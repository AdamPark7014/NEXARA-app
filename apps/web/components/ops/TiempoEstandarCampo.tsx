"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ClientLocationPicker, { type ClientLocationValue } from "@/components/ClientLocationPicker";
import { Textarea } from "@/components/base";
import { formatoMinutos } from "@/lib/actividad-tiempos";
import { COMPLEJIDADES, COMPLEJIDAD_UI, esComplejidad } from "@/lib/complejidad";
import { formatApiError } from "@/lib/erp-api";
import {
  MOTIVO_MINIMO,
  calcularEstandar,
  claveEstandar,
  fetchRutaEstandar,
  fetchTablaEstandar,
  motivoValido,
  reglaPara,
  textoFaltan,
  type EstandarGuardado,
  type ModoTraslado,
  type Ruta,
  type TablaEstandar,
} from "@/lib/tiempo-estandar";
import s from "./TiempoEstandarCampo.module.css";

/** La tabla cambia solo cuando Adam mueve tarifas: una vez por carga de página basta. */
let tablaEnMemoria: Promise<TablaEstandar> | null = null;

/** Espera tras mover el pin o cambiar el modo antes de pedir la ruta. */
const ESPERA_RUTA_MS = 600;

/**
 * Tiempo estándar al asignar (canvas «Tiempo estándar» y «Traslado», 28-10): lo que se cuenta en ese
 * tipo de trabajo, el destino si hay que ir a algún lado, y la tarjeta oscura con el total y su
 * desglose. El total llena «¿Cuánto tiempo toma?»; cambiarlo pide motivo y queda registrado.
 */
export default function TiempoEstandarCampo({
  token,
  coreKind,
  ticketType,
  tipoTarea,
  complejidad,
  sugerencia,
  salida,
  value,
  onChange,
}: {
  token: string;
  coreKind: string;
  ticketType: string | null;
  /** Subtipo de tarea del catálogo («Instalación»…); null fuera de tarea. */
  tipoTarea: string | null;
  complejidad: string;
  /** Lo que la IA leyó del título (viene con la sugerencia de complejidad). */
  sugerencia: { cantidad?: number | null; destino?: string | null } | null;
  /** Inicio previsto (ISO): con Google, la ruta toma el tráfico de esa hora. */
  salida: string | null;
  value: EstandarGuardado | null;
  /** `estandar` es lo que se guarda; `minutos` el tiempo que debe llevar la rueda (null = la rueda es libre). */
  onChange: (estandar: EstandarGuardado | null, minutos: number | null) => void;
}) {
  const [tabla, setTabla] = useState<TablaEstandar | null>(null);
  const [errorTabla, setErrorTabla] = useState(false);
  const [unidad, setUnidad] = useState<string>(value?.unidades?.clave ?? "");
  const [cantidad, setCantidad] = useState<string>(value?.unidades?.cantidad ? String(value.unidades.cantidad) : "");
  /** La cantidad la puso la IA (se dice) hasta que alguien la toca. */
  const [cantidadDeIA, setCantidadDeIA] = useState(false);
  const [lugar, setLugar] = useState<ClientLocationValue>(() =>
    value?.destino ? { address: value.destino.direccion, latitud: value.destino.lat, longitud: value.destino.lng } : {},
  );
  const [modo, setModo] = useState<ModoTraslado>(value?.trasladoModo ?? "AUTO");
  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [buscandoRuta, setBuscandoRuta] = useState(false);
  const [errorRuta, setErrorRuta] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState(Boolean(value?.estandarCambiadoMotivo));
  const [motivo, setMotivo] = useState(value?.estandarCambiadoMotivo ?? "");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const ultimoEnviado = useRef<string>("");

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    tablaEnMemoria ??= fetchTablaEstandar(token);
    tablaEnMemoria
      .then((t) => vivo && setTabla(t))
      .catch(() => {
        tablaEnMemoria = null;
        if (vivo) setErrorTabla(true);
      });
    return () => {
      vivo = false;
    };
  }, [token]);

  const regla = useMemo(
    () => reglaPara(tabla, claveEstandar({ coreKind, ticketType, tipoTarea })),
    [tabla, coreKind, ticketType, tipoTarea],
  );
  const unidadActual = regla?.unidades.find((u) => u.clave === unidad) ?? regla?.unidades[0] ?? null;

  // La IA leyó una cantidad del título: se pone mientras nadie la haya escrito a mano.
  const cantidadAMano = useRef(Boolean(value?.unidades?.cantidad));
  useEffect(() => {
    const n = Number(sugerencia?.cantidad);
    if (!regla?.unidades.length || !Number.isInteger(n) || n <= 0 || cantidadAMano.current) return;
    setCantidad(String(n));
    setCantidadDeIA(true);
  }, [sugerencia?.cantidad, regla?.unidades.length]);
  const escribirCantidad = (texto: string) => {
    cantidadAMano.current = true;
    setCantidadDeIA(false);
    setCantidad(texto);
  };

  // El destino que nombró la IA queda escrito en el buscador para que solo falte elegirlo.
  useEffect(() => {
    const texto = sugerencia?.destino?.trim();
    if (!regla?.destino || !texto) return;
    setLugar((prev) => (prev.address || prev.latitud != null ? prev : { address: texto }));
  }, [sugerencia?.destino, regla?.destino]);

  // Ruta de ida y vuelta desde la oficina cuando hay punto en el mapa.
  const lat = lugar.latitud ?? null;
  const lng = lugar.longitud ?? null;
  useEffect(() => {
    if (!regla?.destino || lat == null || lng == null || !token) {
      setRuta(null);
      return;
    }
    let vivo = true;
    const espera = window.setTimeout(() => {
      setBuscandoRuta(true);
      setErrorRuta(null);
      fetchRutaEstandar(token, { lat, lng, modo, salida })
        .then((r) => vivo && setRuta(r))
        .catch((e) => {
          if (!vivo) return;
          setRuta(null);
          setErrorRuta(formatApiError(e, "No se pudo calcular la ruta"));
        })
        .finally(() => vivo && setBuscandoRuta(false));
    }, ESPERA_RUTA_MS);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
    };
  }, [regla?.destino, lat, lng, modo, salida, token]);

  const resultado = useMemo(
    () =>
      regla
        ? calcularEstandar(
            regla,
            {
              cantidad: Number(cantidad) || null,
              unidad: unidadActual?.clave ?? null,
              complejidad: esComplejidad(complejidad) ? complejidad : null,
              traslado: ruta,
            },
            tabla?.topeMin,
          )
        : null,
    [regla, cantidad, unidadActual?.clave, complejidad, ruta, tabla?.topeMin],
  );
  const cambiado = cambiando && motivoValido(motivo);

  // Lo que se guarda y el tiempo de la rueda; se avisa solo cuando cambia.
  useEffect(() => {
    let estandar: EstandarGuardado | null = null;
    let minutos: number | null = null;
    if (regla && !regla.agenda && resultado) {
      const n = Math.round(Number(cantidad) || 0);
      estandar = {
        unidades: regla.unidades.length && n > 0 && unidadActual ? { clave: unidadActual.clave, cantidad: n } : null,
        destino:
          regla.destino && lat != null && lng != null
            ? { direccion: String(lugar.address ?? "").trim(), lat, lng }
            : null,
        trasladoMin: regla.destino && ruta ? Math.round(ruta.idaMin + ruta.vueltaMin) : null,
        trasladoModo: regla.destino ? modo : null,
        tiempoEstandarMin: resultado.totalMin,
        estandarDesglose: resultado.totalMin != null ? resultado.desglose : null,
        estandarCambiadoMotivo: cambiado ? motivo.trim() : null,
      };
      minutos = cambiado ? null : resultado.totalMin;
    }
    const firma = JSON.stringify([estandar, minutos]);
    if (firma === ultimoEnviado.current) return;
    ultimoEnviado.current = firma;
    onChangeRef.current(estandar, minutos);
  }, [regla, resultado, cantidad, unidadActual, lugar.address, lat, lng, ruta, modo, cambiado, motivo]);

  if (errorTabla || !regla) return null;

  if (regla.agenda) {
    return (
      <p className={s.nota}>
        {regla.nombre}: dura lo que dure la agenda, así que no hay tiempo estándar. Pon su duración en «¿Cuánto tiempo toma?».
      </p>
    );
  }

  const total = resultado?.totalMin ?? null;
  const faltan = textoFaltan(resultado?.faltan ?? [], regla);
  const nCantidad = Math.max(0, Math.round(Number(cantidad) || 0));

  return (
    <div className={s.campo}>
      <div className={s.entradas}>
        <span className={s.etiqueta}>Tiempo estándar · {regla.nombre}</span>

        {cantidadDeIA && nCantidad > 0 && unidadActual ? (
          <div className={s.ia} role="status">
            <AutoAwesomeOutlinedIcon className={s.iaI} aria-hidden="true" />
            <span>
              <strong>La IA leyó el título:</strong> {nCantidad} {nCantidad === 1 ? unidadActual.singular : unidadActual.plural}.
              Confírmalo o corrige la cantidad; el tiempo lo calcula la tabla, no la IA.
            </span>
          </div>
        ) : null}

        {regla.unidades.length > 1 ? (
          <div className={s.segmentos} role="group" aria-label="Qué se cuenta">
            {regla.unidades.map((u) => (
              <button
                key={u.clave}
                type="button"
                className={s.segmento}
                aria-pressed={unidadActual?.clave === u.clave}
                onClick={() => setUnidad(u.clave)}
              >
                {u.plural[0].toUpperCase() + u.plural.slice(1)}
              </button>
            ))}
          </div>
        ) : null}

        {unidadActual ? (
          <div className={s.cantidad}>
            <label htmlFor="oaf-estandar-cantidad" className={s.pregunta}>
              {unidadActual.pregunta}
            </label>
            <div className={s.stepper}>
              <button
                type="button"
                className={s.paso}
                aria-label={`Quitar uno (${unidadActual.plural})`}
                onClick={() => escribirCantidad(String(Math.max(0, nCantidad - 1) || ""))}
              >
                −
              </button>
              <input
                id="oaf-estandar-cantidad"
                className={s.numero}
                inputMode="numeric"
                value={cantidad}
                placeholder="0"
                onChange={(e) => escribirCantidad(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              />
              <button
                type="button"
                className={s.paso}
                aria-label={`Sumar uno (${unidadActual.plural})`}
                onClick={() => escribirCantidad(String(Math.min(9999, nCantidad + 1)))}
              >
                +
              </button>
            </div>
            <span className={s.pista}>
              {unidadActual.porUnidadMin} min por {unidadActual.singular}
              {regla.baseMin ? ` + ${regla.baseMin} min de base` : ""}.
            </span>
          </div>
        ) : null}

        {regla.porComplejidad ? (
          <p className={s.pista}>
            Sale de la complejidad:{" "}
            {COMPLEJIDADES.map((c) => `${COMPLEJIDAD_UI[c].label} ${formatoMinutos(regla.porComplejidad![c])}`).join(" · ")}.
          </p>
        ) : null}

        {regla.destino ? (
          <div className={s.destino}>
            <ClientLocationPicker label="¿A dónde va?" value={lugar} onChange={setLugar} height={200} />
            <div className={s.filaRuta}>
              <div className={s.segmentos} role="group" aria-label="Cómo va">
                {(["AUTO", "TRANSPORTE"] as const).map((m) => (
                  <button key={m} type="button" className={s.segmento} aria-pressed={modo === m} onClick={() => setModo(m)}>
                    {m === "AUTO" ? "En auto" : "En transporte"}
                  </button>
                ))}
              </div>
              {ruta ? (
                <>
                  <span className={s.chip}>
                    Ida {formatoMinutos(ruta.idaMin)} · {ruta.km.toFixed(1)} km
                  </span>
                  <span className={s.chip}>Vuelta {formatoMinutos(ruta.vueltaMin)}</span>
                </>
              ) : null}
              {regla.enLugarMin ? <span className={s.chip}>En el lugar {formatoMinutos(regla.enLugarMin)}</span> : null}
            </div>
            {buscandoRuta ? <span className={s.pista} role="status">Calculando la ruta desde {tabla?.origen.nombre ?? "la oficina"}…</span> : null}
            {errorRuta ? (
              <span className={s.error} role="alert">
                {errorRuta}
              </span>
            ) : null}
            {ruta ? (
              <span className={s.pista}>
                {ruta.fuente === "google"
                  ? `Ruta de Google Maps desde ${ruta.origen}, con el tráfico de la hora de inicio.`
                  : ruta.fuente === "osrm"
                    ? `Ruta en auto desde ${ruta.origen}${ruta.estimado ? "; en transporte se estima a partir de la del auto" : ""}.`
                    : `Ruta aproximada desde ${ruta.origen} (en línea recta): falta la llave de Google con facturación.`}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <section className={s.tarjeta} aria-label="Tiempo estándar">
        <span className={s.tarjetaT}>
          Tiempo estándar{regla.destino ? ` · ${modo === "AUTO" ? "en auto" : "en transporte"}` : ""}
        </span>
        <span className={s.total}>{total != null ? formatoMinutos(total) : "—"}</span>
        {resultado?.desglose.length ? (
          <dl className={s.desglose}>
            {resultado.desglose.map((d) => (
              <div key={d.concepto} className={s.renglon}>
                <dt>{d.concepto}</dt>
                <dd>{formatoMinutos(d.minutos)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {faltan ? <span className={s.faltan}>{faltan}</span> : null}
        {resultado?.topado ? <span className={s.faltan}>Pasa de 12 h: mejor ponle un periodo de varios días.</span> : null}

        {total != null ? (
          cambiando ? (
            <div className={s.motivo}>
              <label htmlFor="oaf-estandar-motivo" className={s.motivoL}>
                ¿Por qué otro tiempo?
              </label>
              <Textarea
                id="oaf-estandar-motivo"
                rows={2}
                value={motivo}
                placeholder="Ej.: el sitio está en obra negra y hay que abrir muro"
                invalid={motivo.length > 0 && !motivoValido(motivo)}
                onChange={(e) => setMotivo(e.target.value)}
              />
              <span className={s.motivoP}>
                {cambiado
                  ? "Ahora el tiempo lo pones tú en la rueda; el estándar queda guardado con este motivo."
                  : `Escribe el motivo (mínimo ${MOTIVO_MINIMO} letras) y luego ajusta la rueda.`}
              </span>
              <button
                type="button"
                className={s.boton}
                onClick={() => {
                  setCambiando(false);
                  setMotivo("");
                }}
              >
                Usar el estándar
              </button>
            </div>
          ) : (
            <button type="button" className={s.boton} onClick={() => setCambiando(true)}>
              Cambiar el tiempo (pide motivo)
            </button>
          )
        ) : null}
      </section>
    </div>
  );
}
