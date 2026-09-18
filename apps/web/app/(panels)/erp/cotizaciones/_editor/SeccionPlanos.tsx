"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  ordenarPlanos,
  quitarPlano,
  subirPlano,
  type CotizacionDetalle,
  type PlanoCotizacion,
} from "@/lib/cotizaciones-api";
import { mover } from "@/lib/cotizacion-documento";
import { Hoja } from "./campos";
import styles from "./editor.module.css";

const ACEPTA = "image/png,image/jpeg,image/webp,application/pdf";

/**
 * 03 Planos: el plano CAD, las fotos del levantamiento, lo que el cliente tiene que ver.
 *
 * Los propios se suben, se nombran y se ordenan; los de la actividad comercial ligada llegan solos
 * (viven en la actividad y aquí solo se ven).
 */
export default function SeccionPlanos({
  cotizacionId,
  token,
  planos,
  editable,
  onDetalle,
  onError,
}: {
  cotizacionId: number | null;
  token: string | null;
  planos: PlanoCotizacion[];
  editable: boolean;
  onDetalle: (d: CotizacionDetalle | null) => void;
  onError: (mensaje: string | null) => void;
}) {
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNombres(Object.fromEntries(planos.map((p) => [p.url, p.nombre ?? ""])));
  }, [planos]);

  const propios = planos.filter((p) => p.origen !== "actividad");
  const heredados = planos.filter((p) => p.origen === "actividad");
  const puede = editable && Boolean(cotizacionId && token);

  async function subir(archivos: FileList | File[]) {
    if (!cotizacionId || !token) return;
    onError(null);
    for (const archivo of Array.from(archivos)) {
      if (!/^image\/|application\/pdf/.test(archivo.type)) {
        onError(`«${archivo.name}» no es imagen ni PDF.`);
        continue;
      }
      setSubiendo(archivo.name);
      try {
        const nombre = archivo.name.replace(/\.[a-z0-9]+$/i, "");
        onDetalle(await subirPlano(token, cotizacionId, archivo, nombre));
      } catch (e) {
        onError(e instanceof Error ? e.message : "No se pudo subir el plano");
      }
    }
    setSubiendo(null);
  }

  async function guardarOrden(lista: PlanoCotizacion[]) {
    if (!cotizacionId || !token) return;
    try {
      await ordenarPlanos(
        token,
        cotizacionId,
        lista.map((p) => ({ url: p.url, nombre: (nombres[p.url] ?? p.nombre ?? "").trim() || p.nombre })),
      );
      onDetalle(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo guardar el orden de los planos");
    }
  }

  async function quitar(url: string) {
    if (!cotizacionId || !token) return;
    try {
      onDetalle(await quitarPlano(token, cotizacionId, url));
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo quitar el plano");
    }
  }

  const alSoltar = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setEncima(false);
    if (puede && e.dataTransfer.files?.length) void subir(e.dataTransfer.files);
  };

  const tarjeta = (p: PlanoCotizacion, i: number, propio: boolean) => (
    <li key={p.url} className={styles.plano}>
      <a href={p.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${p.nombre ?? "plano"}`}>
        {p.tipo === "pdf" ? (
          <span className={styles.planoMiniatura}>PDF</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.planoMiniatura} src={p.url} alt="" loading="lazy" />
        )}
      </a>
      {propio && puede ? (
        <input
          className={styles.input}
          value={nombres[p.url] ?? ""}
          aria-label={`Nombre del plano ${i + 1}`}
          placeholder="Nombre en el PDF"
          onChange={(e) => setNombres((n) => ({ ...n, [p.url]: e.target.value }))}
          onBlur={() => {
            if ((nombres[p.url] ?? "").trim() !== (p.nombre ?? "")) void guardarOrden(propios);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      ) : (
        <strong style={{ fontSize: "0.8rem" }}>{p.nombre ?? "Anexo"}</strong>
      )}
      <div className={styles.planoPie}>
        <span className={styles.planoOrigen}>
          {propio ? `${i + 1} de ${propios.length}` : "Del levantamiento"}
        </span>
        {propio && puede ? (
          <span className={styles.controles}>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label={`Mover antes el plano ${i + 1}`}
              disabled={i === 0}
              onClick={() => void guardarOrden(mover(propios, i, i - 1))}
            >
              ←
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label={`Mover después el plano ${i + 1}`}
              disabled={i === propios.length - 1}
              onClick={() => void guardarOrden(mover(propios, i, i + 1))}
            >
              →
            </button>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.iconBtnPeligro}`}
              aria-label={`Quitar el plano ${i + 1}`}
              onClick={() => void quitar(p.url)}
            >
              ×
            </button>
          </span>
        ) : null}
      </div>
    </li>
  );

  return (
    <Hoja
      id="planos"
      numero="03."
      titulo="Planos"
      ayuda="Plano CAD, sembrado de cámaras, fotos del levantamiento. Cada imagen sale en el PDF a página completa, en el orden de aquí."
    >
      <label
        className={`${styles.zona} ${encima ? styles.zonaActiva : ""} ${puede ? "" : styles.zonaDeshabilitada}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (puede) setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={alSoltar}
      >
        <input
          ref={entrada}
          type="file"
          accept={ACEPTA}
          multiple
          className={styles.soloLector}
          disabled={!puede || Boolean(subiendo)}
          onChange={(e) => {
            const archivos = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (archivos.length) void subir(archivos);
          }}
        />
        <strong>{subiendo ? `Subiendo «${subiendo}»…` : "Arrastra aquí el plano o haz clic para elegirlo"}</strong>
        <span className={styles.pista}>
          {!cotizacionId
            ? "Se habilita en cuanto el borrador se guarda (al escribir el cliente)."
            : !editable
              ? "La cotización ya salió: crea una revisión para cambiar sus planos."
              : "Imagen (PNG, JPG) o PDF, hasta 20 MB."}
        </span>
      </label>

      {propios.length || heredados.length ? (
        <ol className={styles.planos}>
          {propios.map((p, i) => tarjeta(p, i, true))}
          {heredados.map((p, i) => tarjeta(p, i, false))}
        </ol>
      ) : (
        <p className={styles.pista} style={{ marginTop: 10 }}>
          Sin planos todavía. Si ligas la cotización a la actividad comercial del levantamiento, sus fotos
          entran aquí solas.
        </p>
      )}
    </Hoja>
  );
}
