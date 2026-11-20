"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/base";
import { obtenerCamposEvidencia, type CampoEvidencia } from "@/lib/evidencia-campos";
import type { Semaforo } from "@/lib/actividad-tiempos";
import {
  armarResumenActividad,
  type ActividadResumenInput,
  type ResumenLinea,
} from "./resumen-actividad";
import s from "./ResumenActividad.module.css";

const SEMAFORO_TONO: Record<Semaforo, "success" | "warning" | "danger"> = {
  verde: "success",
  amarillo: "warning",
  rojo: "danger",
};

const PRIORIDAD_TONO: Record<string, "danger" | "warning" | "success" | "outline"> = {
  ALTA: "danger",
  MEDIA: "warning",
  BAJA: "success",
};

type Props = {
  activity: ActividadResumenInput;
  token?: string;
  activityId?: number;
  /** Si ya tienes los campos, evita otro fetch. */
  camposEvidencia?: CampoEvidencia[] | null;
  baseErp?: string;
};

function tonoClase(tono?: ResumenLinea["tono"]): string | undefined {
  if (tono === "danger") return s.tonoDanger;
  if (tono === "warning") return s.tonoWarning;
  if (tono === "success") return s.tonoSuccess;
  if (tono === "brand") return s.tonoBrand;
  return undefined;
}

export default function ResumenActividad({
  activity,
  token,
  activityId,
  camposEvidencia,
  baseErp = "/erp",
}: Props) {
  const [campos, setCampos] = useState<CampoEvidencia[] | null>(camposEvidencia ?? null);

  useEffect(() => {
    if (camposEvidencia) {
      setCampos(camposEvidencia);
      return;
    }
    if (!token || !activityId) return;
    let vivo = true;
    void obtenerCamposEvidencia(token, activityId)
      .then((rows) => {
        if (vivo) setCampos(rows);
      })
      .catch(() => {
        if (vivo) setCampos([]);
      });
    return () => {
      vivo = false;
    };
  }, [token, activityId, camposEvidencia]);

  const vista = useMemo(
    () =>
      armarResumenActividad({
        activity,
        camposEvidencia: campos,
        baseErp,
      }),
    [activity, campos, baseErp],
  );

  return (
    <section className={s.wrap} aria-label="Resumen de la actividad">
      {vista.cabecera.prioridad || vista.cabecera.tiempo ? (
        <div className={s.cabecera}>
          {vista.cabecera.prioridad ? (
            <Badge tone={PRIORIDAD_TONO[vista.cabecera.prioridad.clave] ?? "outline"}>
              Prioridad {vista.cabecera.prioridad.label.toLowerCase()}
            </Badge>
          ) : null}
          {vista.cabecera.tiempo ? (
            <>
              <Badge tone={SEMAFORO_TONO[vista.cabecera.tiempo.semaforo]} dot>
                {vista.cabecera.tiempo.chip}
              </Badge>
              {vista.cabecera.tiempo.reloj ? (
                <Badge tone="outline">{vista.cabecera.tiempo.reloj}</Badge>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <div className={s.grid}>
        {vista.bloques.map((bloque) => (
          <article key={bloque.id} className={s.bloque}>
            <h2 className={s.etiqueta}>{bloque.etiqueta}</h2>
            {bloque.href ? (
              <Link href={bloque.href} className={`${s.titulo} ${s.tituloLink} ${tonoClase(bloque.tono) ?? ""}`}>
                {bloque.titulo}
              </Link>
            ) : (
              <p className={`${s.titulo} ${tonoClase(bloque.tono) ?? ""}`}>{bloque.titulo}</p>
            )}
            {bloque.lineas.length > 0 ? (
              <ul className={s.lineas}>
                {bloque.lineas.map((linea, i) => (
                  <li key={`${bloque.id}-${i}`} className={`${s.linea} ${tonoClase(linea.tono) ?? ""}`}>
                    {linea.href ? (
                      <Link href={linea.href} className={s.lineaLink}>
                        {linea.texto}
                      </Link>
                    ) : (
                      linea.texto
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
