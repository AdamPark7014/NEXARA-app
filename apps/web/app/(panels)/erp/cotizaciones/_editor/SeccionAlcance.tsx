"use client";

import { useEffect, useRef, useState } from "react";
import type { PlantillasSegmento } from "@/lib/cotizaciones-api";
import {
  esBloqueDePaquete,
  mover,
  nuevoBloque,
  type BloqueEditor,
  type DocumentoCotizacion,
} from "@/lib/cotizacion-documento";
import { Hoja, ListaEditable, TextoAuto, Vacio } from "./campos";
import styles from "./editor.module.css";

type Cambiar = (cambio: (doc: DocumentoCotizacion) => DocumentoCotizacion) => void;

function origen(b: BloqueEditor): string | null {
  if (esBloqueDePaquete(b)) {
    const n = Number(b.parametros?.["cantidad"] ?? 0);
    return `De paquete${n ? ` · ×${n}` : ""}: se reescribe si vuelves a aplicarlo`;
  }
  if (b.clave.startsWith("plantilla:")) return "Desde plantilla";
  return null;
}

/**
 * 02 Alcance del proyecto: el título del proyecto como encabezado, un párrafo de entrada y las
 * subsecciones numeradas (título, párrafo y viñetas), como en la propuesta modelo.
 */
export default function SeccionAlcance({
  doc,
  cambiar,
  editable,
  plantillas,
}: {
  doc: DocumentoCotizacion;
  cambiar: Cambiar;
  editable: boolean;
  plantillas: PlantillasSegmento["bloques"];
}) {
  const [verPlantillas, setVerPlantillas] = useState(false);
  const titulos = useRef(new Map<string, HTMLTextAreaElement>());
  const enfocar = useRef<string | null>(null);

  useEffect(() => {
    if (!enfocar.current) return;
    titulos.current.get(enfocar.current)?.focus();
    enfocar.current = null;
  });

  const bloques = doc.bloques;
  const setBloques = (f: (b: BloqueEditor[]) => BloqueEditor[]) => cambiar((d) => ({ ...d, bloques: f(d.bloques) }));
  const cambiarBloque = (key: string, cambio: Partial<BloqueEditor>) =>
    setBloques((lista) => lista.map((b) => (b.key === key ? { ...b, ...cambio } : b)));

  const agregar = (bloque: BloqueEditor) => {
    enfocar.current = bloque.key;
    setBloques((lista) => [...lista, bloque]);
  };

  const usadas = new Set(bloques.map((b) => b.clave));

  const panel = verPlantillas ? (
    <div className={styles.panelPlantillas}>
      <div className={styles.panelPlantillasCabeza}>
        <span>Subsecciones de la propuesta modelo · se agregan al final y las ajustas</span>
        <button type="button" className={styles.ghostBtn} onClick={() => setVerPlantillas(false)}>
          Cerrar
        </button>
      </div>
      <div className={styles.plantillas}>
        {plantillas.map((p) => {
          const ya = usadas.has(p.clave);
          return (
            <button
              key={p.clave}
              type="button"
              className={styles.plantilla}
              disabled={ya || !editable}
              onClick={() =>
                agregar(nuevoBloque({ clave: p.clave, titulo: p.titulo, texto: p.texto ?? "", vinetas: p.vinetas }))
              }
            >
              <strong>{p.titulo}</strong>
              <span>{ya ? "Ya está en el alcance" : p.vinetas.length ? `${p.vinetas.length} viñetas` : "Párrafo"}</span>
            </button>
          );
        })}
        {!plantillas.length ? <p className={styles.pista}>Cargando plantillas…</p> : null}
      </div>
    </div>
  ) : null;

  return (
    <Hoja
      id="alcance"
      numero="02."
      titulo="Alcance del proyecto"
      ayuda="Qué se hace, subsección por subsección. Cada una lleva su título, uno o más párrafos y, si hace falta, viñetas."
      acciones={
        editable ? (
          <button type="button" className={styles.secondaryBtn} onClick={() => setVerPlantillas((v) => !v)} aria-expanded={verPlantillas}>
            ☰ Plantillas
          </button>
        ) : null
      }
    >
      <label className={styles.soloLector} htmlFor="alc-titulo">
        Título del proyecto (encabezado del alcance)
      </label>
      <TextoAuto
        id="alc-titulo"
        variante="titulo"
        className={styles.encabezadoAlcance}
        value={doc.projectName}
        onValor={(v) => cambiar((d) => ({ ...d, projectName: v.replace(/\n/g, " ") }))}
        placeholder="Título del proyecto (es el mismo de la portada)"
        disabled={!editable}
      />
      <label className={styles.soloLector} htmlFor="alc-intro">
        Introducción del alcance
      </label>
      <TextoAuto
        id="alc-intro"
        value={doc.alcanceIntro}
        onValor={(v) => cambiar((d) => ({ ...d, alcanceIntro: v }))}
        placeholder="El presente proyecto tiene como objetivo… (párrafo de entrada, opcional)"
        disabled={!editable}
      />

      {panel}

      {bloques.length ? (
        <ol className={styles.subsecciones}>
          {bloques.map((b, i) => {
            const nota = origen(b);
            // Como en el PDF: solo las subsecciones con título llevan número.
            const numero = bloques.slice(0, i + 1).filter((x) => x.titulo.trim()).length;
            return (
              <li key={b.key} className={styles.subseccion}>
                <div className={styles.subseccionCabeza}>
                  <span
                    className={styles.subseccionNumero}
                    aria-hidden
                    title={b.titulo.trim() ? undefined : "Sin título sale como párrafo, sin número"}
                  >
                    {b.titulo.trim() ? `${numero}.` : "¶"}
                  </span>
                  <TextoAuto
                    ref={(el) => {
                      if (el) titulos.current.set(b.key, el);
                      else titulos.current.delete(b.key);
                    }}
                    variante="titulo"
                    value={b.titulo}
                    onValor={(v) => cambiarBloque(b.key, { titulo: v.replace(/\n/g, " ") })}
                    placeholder="Título de la subsección"
                    aria-label={`Título de la subsección ${i + 1}`}
                    disabled={!editable}
                  />
                  {editable ? (
                    <span className={styles.controles}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        aria-label={`Subir subsección ${i + 1}`}
                        title="Subir"
                        disabled={i === 0}
                        onClick={() => setBloques((lista) => mover(lista, i, i - 1))}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        aria-label={`Bajar subsección ${i + 1}`}
                        title="Bajar"
                        disabled={i === bloques.length - 1}
                        onClick={() => setBloques((lista) => mover(lista, i, i + 1))}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={`${styles.iconBtn} ${styles.iconBtnPeligro}`}
                        aria-label={`Quitar subsección ${i + 1}`}
                        title="Quitar"
                        onClick={() => setBloques((lista) => lista.filter((x) => x.key !== b.key))}
                      >
                        ×
                      </button>
                    </span>
                  ) : null}
                </div>
                {nota ? <span className={styles.etiquetaOrigen}>{nota}</span> : null}
                <TextoAuto
                  value={b.texto}
                  onValor={(v) => cambiarBloque(b.key, { texto: v })}
                  placeholder="Párrafo: qué se hace y con qué alcance. Enter para otro párrafo."
                  aria-label={`Párrafo de la subsección ${i + 1}`}
                  disabled={!editable}
                />
                {b.vinetas.length || editable ? (
                  <ListaEditable
                    items={b.vinetas}
                    onCambio={(vinetas) => cambiarBloque(b.key, { vinetas })}
                    numerada={false}
                    editable={editable}
                    placeholder="Viñeta"
                    etiquetaAgregar="Viñeta"
                    etiquetaElemento={`Viñeta de la subsección ${i + 1}`}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : editable ? (
        <div style={{ marginTop: 14 }}>
          <Vacio
            titulo="Todavía no hay subsecciones"
            acciones={
              <>
                <button type="button" className={styles.primaryBtn} onClick={() => setVerPlantillas(true)}>
                  Elegir de las plantillas
                </button>
                <button type="button" className={styles.ghostBtn} onClick={() => agregar(nuevoBloque())}>
                  Subsección en blanco
                </button>
              </>
            }
          >
            La propuesta modelo tiene doce: modernización del grabador, mantenimiento, diagnóstico, ampliación,
            analíticos, puesta en marcha, almacenamiento, consideraciones, exclusiones y entrega. Agrega las que
            apliquen y cambia las cifras por las de este proyecto.
          </Vacio>
        </div>
      ) : (
        <p className={styles.pista}>Sin subsecciones: el PDF remite a la sección 04.</p>
      )}

      {bloques.length && editable ? (
        <button type="button" className={styles.agregar} style={{ marginLeft: 0 }} onClick={() => agregar(nuevoBloque())}>
          + Subsección
        </button>
      ) : null}
    </Hoja>
  );
}
