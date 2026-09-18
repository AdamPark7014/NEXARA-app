"use client";

import { useEffect, useMemo, useState } from "react";
import { listAssignableUsers } from "@/lib/ops-activities-api";
import type { Persona } from "@/lib/proyectos-api";
import styles from "../proyectos.module.css";

export type OpcionPersona = { id: number; nombre: string; detalle?: string | null };

/**
 * A quién se le puede asignar algo en un proyecto: la misma lista que usa la pizarra
 * (`users/assignable`) más uno mismo, que en un proyecto sí cuenta. La API vuelve a validar
 * el alcance y contesta 403 con los nombres; esta lista solo evita ofrecer de más.
 */
export function usePersonasAsignables(
  token: string | null | undefined,
  yo: { id: number; nombre: string } | null | undefined,
  extras: Array<Persona | null | undefined> = [],
): { personas: OpcionPersona[]; cargando: boolean; aviso: string | null } {
  const [base, setBase] = useState<OpcionPersona[]>([]);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    setCargando(true);
    listAssignableUsers(token)
      .then((rows) => {
        if (!vivo) return;
        setBase(rows.map((u) => ({ id: u.id, nombre: u.nombre, detalle: u.role?.nombre ?? null })));
        setAviso(null);
      })
      .catch(() => {
        if (!vivo) return;
        setBase([]);
        setAviso("No se pudo cargar tu equipo: por ahora solo puedes elegirte a ti.");
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [token]);

  // Las personas del proyecto llegan como arreglo nuevo en cada render: se comparan por ids.
  const claveExtras = extras.map((p) => (p ? `${p.id}:${p.nombre}` : "")).join("|");
  const personas = useMemo(() => {
    const porId = new Map<number, OpcionPersona>();
    for (const p of base) porId.set(p.id, p);
    // Quien ya está en el proyecto aparece aunque no sea de tu equipo, para no «perderlo» en el select.
    for (const p of extras) if (p?.id && !porId.has(p.id)) porId.set(p.id, { id: p.id, nombre: p.nombre });
    const otros = [...porId.values()]
      .filter((p) => p.id !== yo?.id)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return yo?.id ? [{ id: yo.id, nombre: `${yo.nombre} (yo)` }, ...otros] : otros;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, yo?.id, yo?.nombre, claveExtras]);

  return { personas, cargando, aviso };
}

export function PersonaSelect({
  id,
  value,
  onChange,
  personas,
  vacio = "Sin asignar",
  excluir = [],
  disabled,
  required,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (valor: string) => void;
  personas: OpcionPersona[];
  /** Texto de la opción vacía; `null` para no ofrecerla. */
  vacio?: string | null;
  excluir?: number[];
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
}) {
  const opciones = personas.filter((p) => !excluir.includes(p.id) || String(p.id) === value);
  return (
    <select
      id={id}
      className={styles.select}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      required={required}
      aria-label={ariaLabel}
    >
      {vacio !== null ? <option value="">{vacio}</option> : null}
      {opciones.map((p) => (
        <option key={p.id} value={String(p.id)}>
          {p.nombre}
        </option>
      ))}
    </select>
  );
}
