"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, DateInput, Field, FieldGrid, Input, RecordSection, Select, Textarea } from "@/components/base";
import { actualizarProyecto, type ActualizarProyecto } from "@/lib/proyectos-api";
import { SERVICE_PROJECT_TYPE_OPTIONS } from "@/lib/service-project-types";
import { sugerirNombreProyecto } from "@/lib/proyecto-nombre";
import { PersonaSelect } from "./personas";
import type { SeccionProps } from "./tipos";
import styles from "./secciones.module.css";

const CAMPOS = [
  ["nombre_descriptivo", "Nombre descriptivo", "cf-nombre"], ["cliente_valido", "Cliente válido", "cf-cliente"],
  ["tipo", "Tipo de proyecto", "cf-tipo"], ["responsable", "Responsable", "cf-responsable"],
  ["fecha_inicio", "Inicio planeado", "cf-inicio"], ["fecha_fin", "Fin planeado", "cf-fin"],
] as const;

export default function CompletarFicha({ proyecto: p, token, personas, ocupado, mutar, irA }: SeccionProps) {
  const c = p.resumen.completitud;
  const [f, setF] = useState(() => ({ title: p.title, projectType: p.projectType || "OTRO", description: p.description || "", responsableId: String(p.responsableId || ""), startDate: p.startDate?.slice(0, 10) || "", endDate: p.endDate?.slice(0, 10) || "" }));
  useEffect(() => { setF({ title: p.title, projectType: p.projectType || "OTRO", description: p.description || "", responsableId: String(p.responsableId || ""), startDate: p.startDate?.slice(0, 10) || "", endDate: p.endDate?.slice(0, 10) || "" }); }, [p.title, p.projectType, p.description, p.responsableId, p.startDate, p.endDate]);
  const marco = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("completar") !== "1") return;
    const primero = CAMPOS.find(([clave]) => c?.faltantes.some((f) => f.clave === clave));
    if (primero) marco.current?.querySelector<HTMLElement>(`#${primero[2]}`)?.focus();
  }, [c]);
  if (!c) return null;
  const pendientes = new Set(c.faltantes.map((f) => f.clave));
  const n = CAMPOS.filter(([clave]) => pendientes.has(clave)).length;
  const sugerencia = sugerirNombreProyecto(f.projectType, p.client?.name || "");
  const cambiar = (clave: keyof typeof f, valor: string) => setF((antes) => ({ ...antes, [clave]: valor }));
  return <div ref={marco} className={styles.pila}>
    <ol aria-label="Completitud del proyecto" className={styles.alcanceCorto}>
      {[["FICHA", c.fichaOk], ["PLAN", c.planOk], ["LISTO", c.listoOk]].map(([nombre, ok]) => <li key={String(nombre)} aria-current={c.nivel === nombre ? "step" : undefined}>{ok ? "✓" : "○"} {nombre}</li>)}
    </ol>
    {!c.fichaOk ? <RecordSection title={`Para que este proyecto cuente le faltan ${n} datos`}>
      <ul>{CAMPOS.map(([clave, etiqueta]) => <li key={clave}>{pendientes.has(clave) ? "○" : "✓"} {etiqueta}</li>)}</ul>
      <form className={styles.pila} onSubmit={(e) => { e.preventDefault(); const datos: ActualizarProyecto = {};
          if (f.title !== p.title) datos.title = f.title;
          if (f.projectType !== p.projectType) datos.projectType = f.projectType;
          if (f.description !== (p.description || "")) datos.description = f.description;
          if (Number(f.responsableId) !== (p.responsableId || 0)) datos.responsableId = Number(f.responsableId) || null;
          if (f.startDate !== (p.startDate?.slice(0, 10) || "")) datos.startDate = f.startDate || null;
          if (f.endDate !== (p.endDate?.slice(0, 10) || "")) datos.endDate = f.endDate || null;
          void mutar(() => actualizarProyecto(token, p.id, datos), "Ficha guardada."); }}>
        <Field label="Nombre descriptivo" hint="Di qué se hace y dónde."><Input id="cf-nombre" value={f.title} onChange={(e) => cambiar("title", e.target.value)} /></Field>
        {sugerencia ? <Button variant="tertiary" onClick={() => cambiar("title", sugerencia)}>Usar sugerencia: {sugerencia}</Button> : null}
        {pendientes.has("cliente_valido") ? <Alert tone="warning"><span id="cf-cliente" tabIndex={-1}>El cliente no es válido. Corrígelo en el padrón de clientes antes de continuar.</span></Alert> : null}
        <FieldGrid>
          <Field label="Tipo"><Select id="cf-tipo" value={f.projectType} onChange={(e) => cambiar("projectType", e.target.value)}>{SERVICE_PROJECT_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
          <Field label="Responsable"><PersonaSelect id="cf-responsable" personas={personas} value={f.responsableId} onChange={(v) => cambiar("responsableId", v)} vacio="Sin asignar" /></Field>
          <Field label="Inicio planeado"><DateInput id="cf-inicio" value={f.startDate} onChange={(e) => cambiar("startDate", e.target.value)} /></Field>
          <Field label="Fin planeado"><DateInput id="cf-fin" min={f.startDate || undefined} value={f.endDate} onChange={(e) => cambiar("endDate", e.target.value)} /></Field>
        </FieldGrid>
        <Field label="Descripción del tipo de proyecto"><Textarea value={f.description} onChange={(e) => cambiar("description", e.target.value)} /></Field>
        <Button type="submit" loading={ocupado}>Guardar ficha</Button>
      </form>
    </RecordSection> : null}
    {c.faltantes.filter((f) => !CAMPOS.some(([clave]) => clave === f.clave)).map((f) => <Alert key={f.clave} tone="warning" title={f.etiqueta}>{f.ayuda} <Button variant="tertiary" onClick={() => irA?.(f.clave === "cronograma" || f.clave === "trabajo_cerrado" ? "cronograma" : f.clave === "alcance" ? "alcance" : f.clave === "acta" ? "documentos" : "actividades")}>Completar</Button></Alert>)}
  </div>;
}
