"use client";

/** Ficha › Resumen: lo que el sistema aún no sabe de este vehículo, cada cosa con su atajo. */

import Link from "next/link";
import { VEHICULOS_PATH } from "@/lib/recursos-core";
import { faltantesDeFicha, type Faltante, type FichaVehiculo } from "@/lib/vehiculos-ficha";
import { c, v } from "./piezas";

export default function FaltaPorCapturar({
  ficha,
  onDocumentos,
  onGasolina,
}: {
  ficha: FichaVehiculo;
  onDocumentos: () => void;
  onGasolina: () => void;
}) {
  const faltan = faltantesDeFicha(ficha);
  if (!faltan.length) return null;

  const accion = (x: Faltante) => {
    if (x.accion === "documentos") {
      return (
        <button type="button" className={v.accionFila} onClick={onDocumentos} aria-label={`Agregar ${x.texto}`}>
          Agregar
        </button>
      );
    }
    if (x.accion === "gasolina") {
      return (
        <button type="button" className={v.accionFila} onClick={onGasolina} aria-label="Registrar la primera carga">
          Registrar
        </button>
      );
    }
    if (x.accion === "salida") {
      return (
        <Link className={v.accionFila} href={`${VEHICULOS_PATH}/mis-vehiculos`} aria-label="Ir a Mis vehículos">
          Abrir
        </Link>
      );
    }
    return (
      <Link className={v.accionFila} href={`${VEHICULOS_PATH}/nuevo?vehiculo=${ficha.vehiculo.id}`} aria-label={`Capturar ${x.texto}`}>
        Capturar
      </Link>
    );
  };

  return (
    <section className={c.card} aria-label="Falta por capturar">
      <h2 className={v.titulo}>Falta por capturar</h2>
      <p className={v.nota}>Nada de esto detiene el trabajo: llénalo cuando lo tengas.</p>
      {faltan.map((x) => (
        <div className={v.renglon} key={x.id}>
          <div className={v.renglonTexto}>
            <b>{x.texto}</b>
            <span>{x.para}</span>
          </div>
          {accion(x)}
        </div>
      ))}
    </section>
  );
}
