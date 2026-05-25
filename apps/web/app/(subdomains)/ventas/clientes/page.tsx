"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import {
  createSalesClient,
  listSalesClients,
  provisionSalesServiceClient,
  uploadSalesClientDocuments,
  type SalesClient,
} from "@/lib/sales-api";
import { getApiAssetOrigin } from "@/lib/api-base";
import { getConsoleUrl } from "@/lib/panel-urls";
import { getSalesScope } from "@/lib/sales-scope";
import styles from "./page.module.css";

export default function VentasClientesPage() {
  const { user } = useUser();
  const scope = getSalesScope(user, typeof window === "undefined" ? "" : window.location.search);
  const [clients, setClients] = useState<SalesClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState("Constancia fiscal");
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [provisioningId, setProvisioningId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    legalName: "",
    taxId: "",
    fiscalAddress: "",
    billingEmail: "",
    billingPhone: "",
    industry: "",
    website: "",
    status: "Activo",
    notes: "",
  });
  const fetchClients = async () => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listSalesClients(user.token, { ownerId: scope.ownerId });
      setClients(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [scope.ownerId, user?.token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreate = async () => {
    if (!user?.token) return;
    if (!form.name.trim()) {
      setError("El nombre del cliente es obligatorio");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createSalesClient(user.token, form);
      setForm({
        name: "",
        legalName: "",
        taxId: "",
        fiscalAddress: "",
        billingEmail: "",
        billingPhone: "",
        industry: "",
        website: "",
        status: "Activo",
        notes: "",
      });
      await fetchClients();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const handleProvision = async (clientId: number) => {
    if (!user?.token) return;
    setProvisioningId(clientId);
    setError(null);
    try {
      await provisionSalesServiceClient(user.token, clientId);
      await fetchClients();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setProvisioningId(null);
    }
  };

  const handleDocDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDocDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const pdfs = Array.from(e.dataTransfer.files || []).filter((f) => f.type === "application/pdf");
    if (pdfs.length === 0) {
      setError("Solo se aceptan archivos PDF");
      return;
    }
    setDocFiles(pdfs);
  };

  const handleDocPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setDocFiles(files);
  };

  const handleRemoveFile = (index: number) => {
    setDocFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDocUpload = async () => {
    if (!user?.token || !selectedClientId) return;
    if (!docType.trim()) {
      setError("Define el tipo de documento");
      return;
    }
    if (docFiles.length === 0) {
      setError("Selecciona al menos un PDF");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await uploadSalesClientDocuments(user.token, selectedClientId, docType, docFiles);
      setDocFiles([]);
      await fetchClients();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Clientes comerciales</h1>
          <p className={styles.subtitle}>Datos fiscales, documentos y seguimiento comercial.</p>
        </div>
      </header>

      <div className={styles.card}>
        <h2>Nuevo cliente</h2>
        <div className={styles.formGrid}>
          <input className={styles.input} name="name" value={form.name} onChange={handleChange} placeholder="Nombre comercial" />
          <input className={styles.input} name="legalName" value={form.legalName} onChange={handleChange} placeholder="Razon social" />
          <input className={styles.input} name="taxId" value={form.taxId} onChange={handleChange} placeholder="RFC" />
          <input className={styles.input} name="billingEmail" value={form.billingEmail} onChange={handleChange} placeholder="Correo de facturacion" />
          <input className={styles.input} name="billingPhone" value={form.billingPhone} onChange={handleChange} placeholder="Teléfono" />
          <input className={styles.input} name="industry" value={form.industry} onChange={handleChange} placeholder="Industria" />
          <input className={styles.input} name="website" value={form.website} onChange={handleChange} placeholder="Sitio web" />
          <input className={styles.input} name="status" value={form.status} onChange={handleChange} placeholder="Estado" />
          <textarea className={styles.input} name="fiscalAddress" value={form.fiscalAddress} onChange={handleChange} placeholder="Dirección fiscal" rows={2} />
          <textarea className={styles.input} name="notes" value={form.notes} onChange={handleChange} placeholder="Notas comerciales" rows={2} />
        </div>
        <div className={styles.buttonRow}>
          <button className={styles.primaryButton} type="button" onClick={handleCreate} disabled={loading}>Crear cliente</button>
        </div>
        {error && <p className={styles.error}>{error}</p>}
      </div>

      <div className={styles.card}>
        <h2>Documentos fiscales</h2>
        <p className={styles.subtitle}>Arrastra y suelta PDFs para guardarlos por version.</p>
        <div className={styles.formGrid}>
          <input className={styles.input} value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="Tipo de documento (ej: Constancia Fiscal)" />
          <select className={styles.input} value={selectedClientId ?? ""} onChange={(e) => setSelectedClientId(Number(e.target.value))}>
            <option value="">Selecciona cliente</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </div>

        <div
          className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ""} ${docFiles.length > 0 ? styles.dropZoneHasFiles : ""}`}
          onDragEnter={handleDocDrag}
          onDragLeave={handleDocDrag}
          onDragOver={handleDocDrag}
          onDrop={handleDocDrop}
        >
          <div className={styles.dropZoneContent}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M24 4v32m16-12l-16 16-16-16" />
            </svg>
            <p className={styles.dropZoneMain}>Arrastra PDFs aquí</p>
            <p className={styles.dropZoneSub}>o selecciona archivos del equipo</p>
            <input type="file" accept="application/pdf" multiple onChange={handleDocPick} className={styles.fileInput} />
          </div>
        </div>

        {docFiles.length > 0 && (
          <div className={styles.filesList}>
            <p className={styles.filesListTitle}>Archivos seleccionados:</p>
            <ul>
              {docFiles.map((file, idx) => (
                <li key={idx} className={styles.fileItem}>
                  <span className={styles.fileIcon}>📄</span>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileSize}>({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                  <button className={styles.removeBtn} onClick={() => handleRemoveFile(idx)} type="button">✕</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.buttonRow}>
          <button className={styles.primaryButton} type="button" onClick={handleDocUpload} disabled={loading || docFiles.length === 0}>
            {loading ? "Subiendo..." : `Subir ${docFiles.length} documentos`}
          </button>
        </div>
      </div>

      <div className={styles.list}>
        {loading && <p>cargando...</p>}
        {clients.map((client) => (
          <article key={client.id} className={styles.card}>
            <div className={styles.clientHeader}>
              <div>
                <h3>{client.name}</h3>
                <div className={styles.clientMeta}>{client.legalName || "Sin razon social"}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                <div className={styles.clientMeta}>{client.status || "Sin estado"}</div>
                {client.serviceClient ? (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "color-mix(in srgb, var(--success, #22c55e) 15%, transparent)",
                      color: "var(--success, #22c55e)",
                    }}
                  >
                    En operación
                  </span>
                ) : null}
              </div>
            </div>
            <p className={styles.clientMeta}>{client.billingEmail || ""}</p>
            <p className={styles.clientMeta}>{client.taxId || ""}</p>
            <div className={styles.buttonRow}>
              {client.serviceClient ? (
                <a
                  className={styles.primaryButton}
                  href={getConsoleUrl("/clients")}
                  style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                >
                  Ver en administración
                </a>
              ) : (
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => handleProvision(client.id)}
                  disabled={loading || provisioningId === client.id}
                >
                  {provisioningId === client.id ? "Activando…" : "Activar en operación"}
                </button>
              )}
            </div>
            <div className={styles.docGrid}>
              {client.documents?.map((doc) => (
                <div key={doc.id} className={styles.docCard}>
                  <strong>{doc.type}</strong>
                  <div className={styles.clientMeta}>Version {doc.version}</div>
                  <div className={styles.preview}>
                    <object data={getAssetUrl(doc.fileUrl)} type="application/pdf" width="100%" height="100%">
                      <embed src={getAssetUrl(doc.fileUrl)} type="application/pdf" />
                    </object>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  function getAssetUrl(url?: string | null) {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const base = getApiAssetOrigin().replace(/\/+$/, "");
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  }
}

