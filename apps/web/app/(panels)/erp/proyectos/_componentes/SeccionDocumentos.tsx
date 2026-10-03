"use client";

import { useRef, useState, type FormEvent } from "react";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { Alert, Badge, Button, Field, FilterChip, FilterChips, Input, RecordSection, Select, buttonClass } from "@/components/base";
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
import styles from "./secciones.module.css";

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
    <div className={styles.pila}>
      <RecordSection
        title={
          <>
            Documentos<span className={styles.conteo}>{p.documents.length}</span>
          </>
        }
        subtitle="Planos, actas, contratos y minutas del proyecto."
      >
        {p.documents.length ? (
          <FilterChips ariaLabel="Filtrar por tipo">
            <FilterChip active={filtro === ""} count={p.documents.length} onClick={() => setFiltro("")}>
              Todos
            </FilterChip>
            {TIPOS_DOCUMENTO.filter((k) => conteo(k)).map((k) => (
              <FilterChip key={k} active={filtro === k} count={conteo(k)} onClick={() => setFiltro(filtro === k ? "" : k)}>
                {TIPO_DOCUMENTO_LABEL[k]}
              </FilterChip>
            ))}
          </FilterChips>
        ) : null}
        {errorDescarga ? (
          <Alert tone="danger" role="alert" dense onDismiss={() => setErrorDescarga(null)}>
            {errorDescarga}
          </Alert>
        ) : null}
        {visibles.length === 0 ? (
          <p className={styles.vacio}>Todavía no hay documentos. Sube planos, actas, contratos o minutas.</p>
        ) : (
          <ul className={styles.lista}>
            {visibles.map((d) => (
              <li key={d.id} className={styles.fila}>
                <div className={styles.principal}>
                  <span className={styles.tituloFila}>
                    <DescriptionOutlinedIcon fontSize="small" aria-hidden="true" />
                    {d.nombre}
                    <Badge tone="outline" size="sm">
                      {TIPO_DOCUMENTO_LABEL[d.kind] ?? "Otro documento"}
                    </Badge>
                  </span>
                  <span className={styles.meta}>
                    {[formatoTamano(d.fileSizeBytes), d.uploadedBy ? `Subió ${d.uploadedBy.nombre}` : null, formatoFechaHora(d.createdAt)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className={styles.acciones}>
                  <a className={buttonClass("ghost", { size: "sm" })} href={resolveAssetUrl(d.fileUrl)} target="_blank" rel="noopener noreferrer">
                    <OpenInNewRoundedIcon fontSize="small" aria-hidden="true" />
                    Abrir
                  </a>
                  <Button size="sm" variant="ghost" iconStart={<DownloadRoundedIcon />} onClick={() => void descargar(d)}>
                    Descargar
                  </Button>
                  <Button
                    size="sm"
                    variant="danger-ghost"
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
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </RecordSection>

      <form className={styles.alta} onSubmit={subir} aria-labelledby="doc-subir" noValidate>
        <h3 id="doc-subir" className={styles.altaTitulo}>
          Subir documentos
        </h3>
        <div className={styles.campos}>
          <Field label="Tipo">
            <Select id="doc-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)}>
              {TIPOS_DOCUMENTO.map((k) => (
                <option key={k} value={k}>
                  {TIPO_DOCUMENTO_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Archivos (hasta ${MAX_ARCHIVOS_POR_SUBIDA}, 25 MB cada uno)`}>
            {/* El sistema no trae control de archivo: el nativo con la caja punteada del sistema. */}
            <input id="doc-archivos" ref={input} className={styles.archivo} type="file" multiple onChange={(e) => elegir(e.target.files)} />
          </Field>
          <Field label="Nombre para mostrar">
            <Input
              id="doc-nombre"
              value={nombre}
              maxLength={220}
              disabled={archivos.length > 1}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={archivos.length > 1 ? "Con varios archivos se usa el nombre de cada uno" : "Ej. Plano de canalización v2"}
            />
          </Field>
        </div>
        {archivos.length ? (
          <p className={styles.ayuda}>
            {archivos.length === 1 ? archivos[0].name : `${archivos.length} archivos`} · {formatoTamano(archivos.reduce((t, f) => t + f.size, 0))}
          </p>
        ) : null}
        {errorSubida ? (
          <Alert tone="danger" role="alert" dense>
            {errorSubida}
          </Alert>
        ) : null}
        <div className={styles.botonera}>
          <Button type="submit" variant="tonal" loading={ocupado} disabled={!archivos.length || Boolean(errorSubida)} iconStart={<CloudUploadOutlinedIcon />}>
            Subir
          </Button>
        </div>
      </form>
    </div>
  );
}
