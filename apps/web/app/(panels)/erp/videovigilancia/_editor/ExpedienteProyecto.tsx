"use client";

/**
 * Expediente del proyecto (Ola 5, mockup aprobado el 15-11-2026): datos del sitio, documentos de soporte
 * (planos, fotos, fichas, Excel, Word, PowerPoint, CAD) y «Qué falta para entregar». Un plano o una
 * imagen se pasa a croquis y la IA lo digitaliza. Lo editado se guarda con el diseño (`plano.expediente`).
 */
import { useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import { Alert, Button } from "@/components/base";
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

const campo = { display: "grid", gap: 4, fontSize: 13, color: "var(--ui-fg-2)" } as const;
const entrada = { height: 38, border: "1px solid var(--ui-border)", borderRadius: 8, padding: "0 10px", font: "inherit", color: "inherit", background: "var(--ui-surface)" } as const;

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
      cambiarDoc(d.id, { digitalizado: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo digitalizar ese documento.");
    } finally {
      setDigitalizando(null);
    }
  }

  const listos = pendientes.filter((p) => p.hecho).length;

  return (
    <Modal open={abierto} onClose={onCerrar} title="Expediente del proyecto" description={cliente ? `Cliente: ${cliente}` : "Datos, documentos y lo que falta para entregar."} maxWidth={1120}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }} data-testid="expediente">
        <section style={{ flex: "999 1 520px", minWidth: 0, display: "grid", gap: 14, alignContent: "start" }}>
          <div
            style={{ display: "grid", justifyItems: "center", gap: 6, padding: 20, border: "2px dashed #93c5fd", borderRadius: 12, background: "#eff6ff", color: "#1e3a8a", textAlign: "center" }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void subir(e.dataTransfer.files);
            }}
          >
            <strong style={{ fontSize: 14 }}>Sube lo que tengas del sitio</strong>
            <span style={{ fontSize: 13 }}>Planos (PDF o imagen), croquis, fotos de cámaras, fichas, Excel, Word, PowerPoint o CAD · hasta 25 MB c/u</span>
            <Button variant="primary" loading={subiendo} onClick={() => archivo.current?.click()}>
              Elegir archivos
            </Button>
            <input ref={archivo} type="file" multiple accept={TIPOS_DOCUMENTO_ACEPTADOS} hidden aria-label="Documentos del expediente" onChange={(e) => void subir(e.target.files)} />
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div style={{ display: "grid", gap: 6 }}>
            <strong style={{ fontSize: 14 }}>Documentos ({expediente.documentos.length})</strong>
            {expediente.documentos.length === 0 ? <span style={{ fontSize: 13, color: "var(--ui-fg-3)" }}>Aún no hay documentos.</span> : null}
            {expediente.documentos.map((d) => (
              <div key={d.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: 10, border: "1px solid var(--ui-border)", borderRadius: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "var(--ui-surface-2)" }}>{ETIQUETA_TIPO_DOCUMENTO[d.tipo]}</span>
                <a href={resolveAssetUrl(d.url) || d.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, flex: "1 1 180px", minWidth: 0, overflowWrap: "anywhere" }}>
                  {d.nombre}
                </a>
                <span style={{ fontSize: 12, color: "var(--ui-fg-3)" }}>{tamanoLegible(d.bytes)}</span>
                <input aria-label={`Qué es ${d.nombre}`} value={d.descripcion ?? ""} placeholder="Qué es (Plano nivel 1, Alcance…)" onChange={(e) => cambiarDoc(d.id, { descripcion: e.target.value })} style={{ ...entrada, height: 32, flex: "1 1 160px", minWidth: 0 }} />
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
        <aside style={{ flex: "1 1 320px", minWidth: 0, display: "grid", gap: 14, alignContent: "start" }}>
          <div style={{ display: "grid", gap: 10, padding: 16, border: "1px solid var(--ui-border)", borderRadius: 12 }}>
            <strong style={{ fontSize: 14 }}>Datos del proyecto</strong>
            <label style={campo}>
              Sitio
              <input value={expediente.sitio ?? ""} onChange={(e) => cambiar({ sitio: e.target.value })} placeholder="Campus, planta o dirección" style={entrada} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <label style={campo}>
                Responsable
                <input value={expediente.responsable ?? ""} onChange={(e) => cambiar({ responsable: e.target.value })} style={entrada} />
              </label>
              <label style={campo}>
                Entrega
                <input type="date" value={expediente.entrega ?? ""} onChange={(e) => cambiar({ entrega: e.target.value || null })} style={entrada} />
              </label>
            </div>
            <label style={campo}>
              Requerimientos del cliente
              <textarea value={expediente.requerimientos ?? ""} onChange={(e) => cambiar({ requerimientos: e.target.value })} rows={3} placeholder="Días de grabación, placas, zonas críticas…" style={{ ...entrada, height: "auto", padding: "8px 10px", resize: "vertical" }} />
            </label>
          </div>
          <div style={{ display: "grid", gap: 8, padding: 16, border: "1px solid var(--ui-border)", borderRadius: 12 }} aria-label="Qué falta para entregar">
            <strong style={{ fontSize: 14 }}>
              Qué falta para entregar ({listos} de {pendientes.length})
            </strong>
            {pendientes.map((p) => (
              <div key={p.texto} style={{ display: "flex", gap: 8, fontSize: 13 }}>
                <span aria-hidden="true" style={{ fontWeight: 700, color: p.hecho ? "#166534" : "#9a3412" }}>
                  {p.hecho ? "✓" : "!"}
                </span>
                <span>
                  {p.texto}
                  <span style={{ position: "absolute", left: -9999 }}>{p.hecho ? " (listo)" : " (pendiente)"}</span>
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Modal>
  );
}
