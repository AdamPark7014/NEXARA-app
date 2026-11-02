"use client";

import { useState } from "react";
import { Button, DateInput, Field, Input } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { Dialogo } from "@/components/mesa-contable/piezas";
import { crearActividadDeProyecto, obtenerProyecto } from "@/lib/proyectos-api";
import { PersonaSelect } from "./personas";
import type { SeccionProps } from "./tipos";
import styles from "./secciones.module.css";

/**
 * Una actividad que nace del proyecto ya sabe de quién es: cliente y proyecto se heredan y solo se
 * pregunta qué, quién y cuándo. Con eso sus horas cuentan para el costo sin pasar por la bandeja.
 */
export default function NuevaActividad({
  proyecto: p,
  token,
  personas,
  ocupado,
  mutar,
  abierto,
  onCerrar,
  onCreada,
}: Pick<SeccionProps, "proyecto" | "token" | "personas" | "ocupado" | "mutar"> & {
  abierto: boolean;
  onCerrar: () => void;
  onCreada?: () => void;
}) {
  const { user } = useUser();
  const [titulo, setTitulo] = useState("");
  const [responsable, setResponsable] = useState("");
  const [fecha, setFecha] = useState("");
  const quien = responsable || String(p.responsable?.id ?? user?.id ?? "");
  const lista = titulo.trim().length >= 3 && Boolean(quien);

  const crear = async () => {
    if (!lista) return;
    const ok = await mutar(async () => {
      await crearActividadDeProyecto(token, p.id, {
        titulo: titulo.trim(),
        responsableId: Number(quien),
        fecha: fecha || undefined,
      });
      return obtenerProyecto(token, p.id);
    }, "Actividad creada y ligada al proyecto.");
    if (!ok) return;
    setTitulo("");
    setResponsable("");
    setFecha("");
    onCerrar();
    onCreada?.();
  };

  return (
    <Dialogo
      abierto={abierto}
      titulo="Nueva actividad"
      onCerrar={onCerrar}
      onEnviar={() => void crear()}
      acciones={
        <>
          <Button variant="tertiary" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={ocupado} disabled={!lista}>
            Crear actividad
          </Button>
        </>
      }
    >
      <dl className={styles.heredado}>
        {p.client?.name ? (
          <div>
            <dt>Cliente</dt>
            <dd>{p.client.name}</dd>
            <span>Del proyecto</span>
          </div>
        ) : null}
        <div>
          <dt>Proyecto</dt>
          <dd>{p.title}</dd>
          <span>Del proyecto</span>
        </div>
      </dl>
      <Field label="¿Qué hay que hacer?" required>
        <Input
          value={titulo}
          maxLength={240}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej. Instalar cámaras del acceso principal"
        />
      </Field>
      <div className={styles.dosCampos}>
        <Field label="¿Quién?" required>
          <PersonaSelect value={quien} onChange={setResponsable} personas={personas} vacio={null} />
        </Field>
        <Field label="¿Cuándo?">
          <DateInput value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
      </div>
    </Dialogo>
  );
}
