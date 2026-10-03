"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/base";
import { diaCorto, esFinDeSemanaISO, fetchCoberturaGuardias } from "@/lib/guardias-api";

/**
 * Aviso (no bloquea) al asignar una actividad en sábado o domingo a quien no tiene guardia
 * ese día: sin guardia no podrá checar, y su entrada no se generará al iniciarla.
 */
export default function AvisoGuardia({
  token,
  fecha,
  personas,
}: {
  token: string;
  /** AAAA-MM-DD */
  fecha: string;
  personas: Array<{ id: number; nombre: string }>;
}) {
  const [sinGuardia, setSinGuardia] = useState<string[]>([]);
  const finDeSemana = esFinDeSemanaISO(fecha);
  const clave = useMemo(() => personas.map((p) => `${p.id}:${p.nombre}`).join("|"), [personas]);

  useEffect(() => {
    let vigente = true;
    const ids = personas.map((p) => p.id).filter((id) => Number.isInteger(id) && id > 0);
    if (!token || !finDeSemana || !ids.length) {
      setSinGuardia([]);
      return;
    }
    fetchCoberturaGuardias(token, fecha, ids)
      .then((r) => {
        if (!vigente) return;
        const con = new Set(r.conGuardia);
        setSinGuardia(personas.filter((p) => !con.has(p.id)).map((p) => p.nombre));
      })
      // Sin la consulta no se puede afirmar nada: mejor no avisar que avisar de más.
      .catch(() => vigente && setSinGuardia([]));
    return () => {
      vigente = false;
    };
    // `clave` resume `personas`: el arreglo cambia de identidad en cada render de quien lo pasa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, fecha, finDeSemana, clave]);

  if (!finDeSemana || !sinGuardia.length) return null;
  const quien = sinGuardia.length === 1 ? sinGuardia[0] : sinGuardia.join(", ");
  const verbo = sinGuardia.length === 1 ? "no tiene" : "no tienen";
  return (
    <Alert tone="warning" title="Fin de semana sin guardia">
      {`El ${diaCorto(fecha)} es fin de semana y ${quien} ${verbo} guardia: sin guardia no se puede checar ese día. Prográmala en Asistencias → Guardias.`}
    </Alert>
  );
}
