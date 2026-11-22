"use client";

/**
 * Expediente del proyecto (Ola 5, mockup aprobado el 15-11-2026): datos del sitio, documentos de soporte
 * (planos, fotos, fichas, Excel, Word, PowerPoint, CAD) y «Qué falta para entregar». Un plano o una
 * imagen se pasa a croquis y la IA lo digitaliza. Lo editado se guarda con el diseño (`plano.expediente`).
 */
import { useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import { Alert, Button, Input, Textarea } from "@/components/base";
import s from "./ExpedienteProyecto.module.css";
import { resolveAssetUrl } from "@/lib/evidence-display";
import { subirDocumentoExpediente } from "@/lib/cctv/api";
import {
  ETIQUETA_TIPO_DOCUMENTO,
  TIPOS_DOCUMENTO_ACEPTADOS,
  sePuedeDigitalizar,
  tamanoLegible,
  type DocumentoExpediente,
  type Expediente,
  type Pendiente,
} from "@/lib/cctv/expediente";

export default function ExpedienteProyecto({
  abierto,
  token,
  disenoId,
  cliente,
  expediente,
  pendientes,
  onCambiar,
  onDigitalizar,
  onCerrar,
}: {
  abierto: boolean;
  token: string;
  disenoId: number;
  cliente: string | null;
  expediente: Expediente;
  pendientes: Pendiente[];
  onCambiar: (e: Expediente) => void;
  /** Pasa el documento a croquis del nivel abierto y abre la digitalización con IA. */
  onDigitalizar: (d: DocumentoExpediente) => Promise<void>;
  onCerrar: () => void;
}) {
  const archivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [digitalizando, setDigitalizando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cambiar = (c: Partial<Expediente>) => onCambiar({ ...expediente, ...c });
  const cambiarDoc = (id: string, c: Partial<DocumentoExpediente>) =>
    cambiar({ documentos: expediente.documentos.map((d) => (d.id === id ? { ...d, ...c } : d)) });

  async function subir(lista: FileList | null) {
    if (!lista?.length) return;
    setSubiendo(true);
    setError(null);
    const nuevos: DocumentoExpediente[] = [];
    try {
      for (const f of Array.from(lista).slice(0, 10)) nuevos.push(await subirDocumentoExpediente(token, disenoId, f));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el archivo.");
    } finally {
      if (nuevos.length) cambiar({ documentos: [...nuevos, ...expediente.documentos] });
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  }

  async function digitalizar(d: DocumentoExpediente) {
    setDigitalizando(d.id);
    setError(null);
    try {
      await onDigitalizar(d);
      // digitalizado lo marca EditorCctv tras el croquis (evita carrera con raiz stale)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo digitalizar ese documento.");
    } finally {
      setDigitalizando(null);
    }
  }

  const listos = pendientes.filter((p) => p.hecho).length;

  return (
    <Modal open={abierto} onClose={onCerrar} title="Expediente del proyecto" description={cliente ? `Cliente: ${cliente}` : "Datos, documentos y lo que falta para entregar."} maxWidth={1120}>
      <div className={s.cuerpo} data-testid="expediente">
        <section className={s.principal}>
          <div
            className={s.zonaSubida}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void subir(e.dataTransfer.files);
            }}
          >
            <strong>Sube lo que tengas del sitio</strong>
            <span>Planos (PDF o imagen), croquis, fotos de cámaras, fichas, Excel, Word, PowerPoint o CAD · hasta 25 MB c/u</span>
            <Button variant="primary" loading={subiendo} onClick={() => archivo.current?.click()}>
              Elegir archivos
            </Button>
            <input ref={archivo} type="file" multiple accept={TIPOS_DOCUMENTO_ACEPTADOS} hidden aria-label="Documentos del expediente" onChange={(e) => void subir(e.target.files)} />
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className={s.docs}>
            <strong className={s.docsTitulo}>Documentos ({expediente.documentos.length})</strong>
            {expediente.documentos.length === 0 ? <span className={s.vacio}>Aún no hay documentos.</span> : null}
            {expediente.documentos.map((d) => (
              <div key={d.id} className={s.doc}>
                <span className={s.chipTipo}>{ETIQUETA_TIPO_DOCUMENTO[d.tipo]}</span>
                <a href={resolveAssetUrl(d.url) || d.url} target="_blank" rel="noreferrer" className={s.docLiga}>
                  {d.nombre}
                </a>
                <span className={s.docMeta}>{tamanoLegible(d.bytes)}</span>
                <Input aria-label={`Qué es ${d.nombre}`} value={d.descripcion ?? ""} placeholder="Qué es (Plano nivel 1, Alcance…)" onChange={(e) => cambiarDoc(d.id, { descripcion: e.target.value })} style={{ flex: "1 1 160px", minWidth: 0 }} />
                {sePuedeDigitalizar(d) ? (
                  <Button size="sm" variant={d.digitalizado ? "ghost" : "tonal"} loading={digitalizando === d.id} onClick={() => void digitalizar(d)}>
                    {d.digitalizado ? "Digitalizar otra vez" : "Digitalizar con IA"}
                  </Button>
                ) : null}
                <Button size="sm" variant="danger-ghost" aria-label={`Quitar ${d.nombre}`} onClick={() => cambiar({ documentos: expediente.documentos.filter((x) => x.id !== d.id) })}>
                  Quitar
                </Button>
              </div>
            ))}
          </div>
        </section>
        <aside className={s.lado}>
          <div className={s.tarjeta}>
            <strong className={s.tarjetaTitulo}>Datos del proyecto</strong>
            <label>
              Sitio
              <Input value={expediente.sitio ?? ""} onChange={(e) => cambiar({ sitio: e.target.value })} placeholder="Campus, planta o dirección" />
            </label>
            <div className={s.grid2}>
              <label>
                Responsable
                <Input value={expediente.responsable ?? ""} onChange={(e) => cambiar({ responsable: e.target.value })} />
              </label>
              <label>
                Entrega a más tardar
                <Input type="date" value={expediente.entrega ?? ""} onChange={(e) => cambiar({ entrega: e.target.value || null })} />
              </label>
            </div>
            <label>
              Requerimientos del cliente
              <Textarea value={expediente.requerimientos ?? ""} onChange={(e) => cambiar({ requerimientos: e.target.value })} rows={3} placeholder="Días de grabación, placas, zonas críticas…" />
            </label>
          </div>
          <div className={s.tarjeta} aria-label="Qué falta para entregar">
            <strong className={s.tarjetaTitulo}>
              Qué falta para entregar ({listos} de {pendientes.length})
            </strong>
            {pendientes.map((p) => (
              <div key={p.texto} className={s.pendiente}>
                <span aria-hidden="true" className={p.hecho ? s.marcaOk : s.marcaPend}>
                  {p.hecho ? "Listo" : "Falta"}
                </span>
                <span>
                  {p.texto}
                  <span className={s.srOnly}>{p.hecho ? " (listo)" : " (pendiente)"}</span>
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Modal>
  );
}
