"use client";

import { useRef, useState, type FormEvent } from "react";
import { resolveAssetUrl } from "@/lib/evidence-display";
import { triggerFileDownload } from "@/lib/file-download";
import {
  MAX_ARCHIVOS_POR_SUBIDA,
  MAX_BYTES_POR_ARCHIVO,
  TIPOS_DOCUMENTO,
  TIPO_DOCUMENTO_LABEL,
  borrarDocumento,
  formatoFechaHora,
  formatoTamano,
  subirDocumentos,
  type DocumentoProyecto,
  type TipoDocumento,
} from "@/lib/proyectos-api";
import type { SeccionProps } from "./tipos";
import styles from "../proyectos.module.css";

/**
 * Documentos del proyecto. Los archivos viven en `/uploads/project-docs`, que la API protege con
 * JWT: el enlace va por la ruta relativa (el proxy de Next manda la cookie de sesión) y la
 * descarga manda además el token, igual que las evidencias y la hoja de servicio.
 */
export default function SeccionDocumentos({ proyecto: p, token, ocupado, mutar, confirmar }: SeccionProps) {
  const [tipo, setTipo] = useState<TipoDocumento>("PLANO");
  const [nombre, setNombre] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<TipoDocumento | "">("");
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function elegir(lista: FileList | null) {
    const elegidos = Array.from(lista ?? []);
    setErrorSubida(null);
    if (elegidos.length > MAX_ARCHIVOS_POR_SUBIDA) {
      setErrorSubida(`Sube como máximo ${MAX_ARCHIVOS_POR_SUBIDA} archivos a la vez.`);
    } else {
      const pesados = elegidos.filter((f) => f.size > MAX_BYTES_POR_ARCHIVO);
      if (pesados.length) {
        setErrorSubida(
          `Pesan más de 25 MB: ${pesados.map((f) => f.name).join(", ")}. Comprímelos o súbelos por partes.`,
        );
      }
    }
    setArchivos(elegidos);
  }

  async function subir(e: FormEvent) {
    e.preventDefault();
    if (!archivos.length) {
      setErrorSubida("Elige al menos un archivo.");
      return;
    }
    if (errorSubida) return;
    const ok = await mutar(
      () => subirDocumentos(token, p.id, archivos, { kind: tipo, nombre }),
      archivos.length === 1 ? "Documento subido." : `${archivos.length} documentos subidos.`,
    );
    if (ok) {
      setArchivos([]);
      setNombre("");
      if (input.current) input.current.value = "";
    }
  }

  async function descargar(doc: DocumentoProyecto) {
    setErrorDescarga(null);
    try {
      await triggerFileDownload(resolveAssetUrl(doc.fileUrl), doc.nombre, {
        authToken: token,
        mimeType: doc.mimeType ?? undefined,
      });
    } catch {
      setErrorDescarga(`No se pudo descargar «${doc.nombre}». Prueba con «Abrir».`);
    }
  }

  const visibles = filtro ? p.documents.filter((d) => d.kind === filtro) : p.documents;
  const conteo = (k: TipoDocumento) => p.documents.filter((d) => d.kind === k).length;

  return (
    <div className={styles.gantt} style={{ gap: 12 }}>
      <form className={styles.panel} onSubmit={subir} aria-labelledby="doc-subir" noValidate>
        <h3 id="doc-subir" className={styles.panelTitle}>
          Subir documentos
        </h3>
        <div className={styles.grid3}>
          <div>
            <label className={styles.fieldLabel} htmlFor="doc-tipo">
              Tipo
            </label>
            <select id="doc-tipo" className={styles.select} value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)}>
              {TIPOS_DOCUMENTO.map((k) => (
                <option key={k} value={k}>
                  {TIPO_DOCUMENTO_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="doc-archivos">
              Archivos (hasta {MAX_ARCHIVOS_POR_SUBIDA}, 25 MB cada uno)
            </label>
            <input
              id="doc-archivos"
              ref={input}
              className={styles.fileInput}
              type="file"
              multiple
              onChange={(e) => elegir(e.target.files)}
            />
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="doc-nombre">
              Nombre para mostrar
            </label>
            <input
              id="doc-nombre"
              className={styles.input}
              value={nombre}
              maxLength={220}
              disabled={archivos.length > 1}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={archivos.length > 1 ? "Con varios archivos se usa el nombre de cada uno" : "Ej. Plano de canalización v2"}
            />
          </div>
        </div>
        {archivos.length ? (
          <p className={styles.hint}>
            {archivos.length === 1 ? archivos[0].name : `${archivos.length} archivos`} ·{" "}
            {formatoTamano(archivos.reduce((t, f) => t + f.size, 0))}
          </p>
        ) : null}
        {errorSubida ? (
          <p className={styles.error} role="alert">
            {errorSubida}
          </p>
        ) : null}
        <div className={styles.acciones}>
          <button type="submit" className={styles.primaryBtn} disabled={ocupado || !archivos.length || Boolean(errorSubida)}>
            {ocupado ? "Subiendo…" : "Subir"}
          </button>
        </div>
      </form>

      <section className={styles.panel} aria-labelledby="doc-lista">
        <h3 id="doc-lista" className={styles.panelTitle}>
          Documentos ({p.documents.length})
        </h3>
        {p.documents.length ? (
          <div className={styles.filters} role="group" aria-label="Filtrar por tipo">
            <button
              type="button"
              className={`${styles.filterBtn} ${filtro === "" ? styles.filterBtnOn : ""}`}
              aria-pressed={filtro === ""}
              onClick={() => setFiltro("")}
            >
              Todos
            </button>
            {TIPOS_DOCUMENTO.filter((k) => conteo(k)).map((k) => (
              <button
                key={k}
                type="button"
                className={`${styles.filterBtn} ${filtro === k ? styles.filterBtnOn : ""}`}
                aria-pressed={filtro === k}
                onClick={() => setFiltro(filtro === k ? "" : k)}
              >
                {TIPO_DOCUMENTO_LABEL[k]} ({conteo(k)})
              </button>
            ))}
          </div>
        ) : null}
        {errorDescarga ? (
          <p className={styles.error} role="alert">
            {errorDescarga}
          </p>
        ) : null}
        {visibles.length === 0 ? (
          <div className={styles.empty}>Todavía no hay documentos. Sube planos, actas, contratos o minutas.</div>
        ) : (
          <ul className={styles.items}>
            {visibles.map((d) => (
              <li key={d.id} className={styles.item}>
                <div className={styles.itemMain}>
                  <span className={styles.itemTitle}>{d.nombre}</span>
                  <div className={styles.badges}>
                    <span className={styles.badge}>{TIPO_DOCUMENTO_LABEL[d.kind] ?? d.kind}</span>
                  </div>
                  <span className={styles.rowWrap}>
                    {[
                      formatoTamano(d.fileSizeBytes),
                      d.uploadedBy ? `Subió ${d.uploadedBy.nombre}` : null,
                      formatoFechaHora(d.createdAt),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className={styles.itemActions}>
                  <a className={styles.smallBtn} href={resolveAssetUrl(d.fileUrl)} target="_blank" rel="noopener noreferrer">
                    Abrir
                  </a>
                  <button type="button" className={styles.smallBtn} onClick={() => void descargar(d)}>
                    Descargar
                  </button>
                  <button
                    type="button"
                    className={styles.smallDangerBtn}
                    disabled={ocupado}
                    onClick={() =>
                      confirmar({
                        title: "Borrar documento",
                        message: `¿Borrar «${d.nombre}» del proyecto?`,
                        confirmLabel: "Borrar",
                        fn: async () => {
                          await mutar(() => borrarDocumento(token, p.id, d.id), "Documento borrado.");
                        },
                      })
                    }
                  >
                    Borrar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
