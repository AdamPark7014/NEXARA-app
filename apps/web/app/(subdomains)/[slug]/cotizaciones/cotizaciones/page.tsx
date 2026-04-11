"use client";

import { buildApiUrl } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import QuoteGenerator from "@/components/QuoteGenerator";
import styles from "./page.module.css";

type Cotizacion = {
  id: number;
  quoteNumber: string;
  clientName?: string;
  clientCompany?: string;
  projectName?: string;
  total: string;
  status: string;
  issueDate: string;
  items: Array<{ id: number; name: string; qty: number }>;
};

type LinkState = {
  cotizacionId: number;
  opportunityId: string;
  versionLabel: string;
};

export default function VentasCotizacionesPage() {
  const { user } = useUser();
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [filteredCotizaciones, setFilteredCotizaciones] = useState<Cotizacion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchClient, setSearchClient] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [linkModal, setLinkModal] = useState<LinkState | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchCotizaciones = async () => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const url = new URL(buildApiUrl("ventas/cotizaciones"));
      if (searchClient) url.searchParams.append("clientName", searchClient);
      if (filterStatus) url.searchParams.append("status", filterStatus);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) throw new Error("No se pudieron cargar las cotizaciones");
      const data = await res.json();
      setCotizaciones(Array.isArray(data) ? data : []);
      setFilteredCotizaciones(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  // Fetch on component mount and when filters change
  useEffect(() => {
    fetchCotizaciones();
  }, [user?.token, searchClient, filterStatus]);

  const handleLinkCotizacion = async () => {
    if (!user?.token || !linkModal) return;
    if (!linkModal.opportunityId.trim()) {
      setError("ID de oportunidad es requerido");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        buildApiUrl(`ventas/cotizaciones/${linkModal.cotizacionId}/link/${Number(linkModal.opportunityId)}`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify({
            versionLabel: linkModal.versionLabel || `v${Date.now()}`,
          }),
        }
      );

      if (!res.ok) throw new Error("No se pudo vincular la cotización");
      const quote = await res.json();
      setLinkModal(null);
      await fetchCotizaciones();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = (cotizacionId: number) => {
    const link = document.createElement("a");
    link.href = buildApiUrl(`cotizaciones/${cotizacionId}/pdf`);
    link.download = `cotizacion-${cotizacionId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Cotizaciones disponibles</h1>
        <p>Busca, filtra y vincula cotizaciones a tus oportunidades de venta</p>
      </div>

      {/* Generador de PDFs dinámicos */}
      <div style={{ marginBottom: "2rem", padding: "1.5rem", backgroundColor: "#f8f9fa", borderRadius: "8px" }}>
        <QuoteGenerator onQuoteGenerated={fetchCotizaciones} />
      </div>

      <div className={styles.filters}>
        <input
          className={styles.input}
          type="text"
          placeholder="Buscar por cliente o empresa..."
          value={searchClient}
          onChange={(e) => setSearchClient(e.target.value)}
        />
        <select className={styles.input} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="DRAFT">Borrador</option>
          <option value="SENT">Enviado</option>
          <option value="SIGNED">Firmado</option>
          <option value="REJECTED">Rechazado</option>
        </select>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.list}>
        {loading && <p className={styles.loading}>cargando...</p>}
        {!loading && cotizaciones.length === 0 && <p className={styles.empty}>No hay cotizaciones disponibles</p>}

        {cotizaciones.map((cot) => (
          <div key={cot.id} className={styles.card}>
            <div className={styles.cardHeader} onClick={() => setExpandedId(expandedId === cot.id ? null : cot.id)}>
              <div className={styles.cardTitle}>
                <h3>{cot.quoteNumber}</h3>
                <span className={`${styles.badge} ${styles[`badge-${cot.status.toLowerCase()}`]}`}>{cot.status}</span>
              </div>
              <div className={styles.cardMeta}>
                <span>{cot.clientCompany || cot.clientName || "Cliente sin especificar"}</span>
                <span className={styles.total}>${Number(cot.total).toLocaleString("es-MX")}</span>
              </div>
            </div>

            {expandedId === cot.id && (
              <div className={styles.cardExpanded}>
                <div className={styles.expandedContent}>
                  <div className={styles.detailsGrid}>
                    <div>
                      <p className={styles.detailLabel}>Proyecto</p>
                      <p>{cot.projectName || "No especificado"}</p>
                    </div>
                    <div>
                      <p className={styles.detailLabel}>Fecha de emisión</p>
                      <p>{new Date(cot.issueDate).toLocaleDateString("es-MX")}</p>
                    </div>
                    <div>
                      <p className={styles.detailLabel}>Contacto</p>
                      <p>{cot.clientName || "N/A"}</p>
                    </div>
                    <div>
                      <p className={styles.detailLabel}>Cantidad de items</p>
                      <p>{cot.items?.length || 0} productos/servicios</p>
                    </div>
                  </div>

                  {cot.items && cot.items.length > 0 && (
                    <div className={styles.itemsList}>
                      <p className={styles.detailLabel}>Items incluidos</p>
                      <ul>
                        {cot.items.slice(0, 5).map((item) => (
                          <li key={item.id}>
                            • {item.name} (Cantidad: {item.qty})
                          </li>
                        ))}
                        {cot.items.length > 5 && <li>...y {cot.items.length - 5} items más</li>}
                      </ul>
                    </div>
                  )}

                  <div className={styles.actions}>
                    <button className={styles.primaryButton} onClick={() => handleDownloadPdf(cot.id)}>
                      Descargar PDF
                    </button>
                    <button
                      className={styles.secondaryButton}
                      onClick={() =>
                        setLinkModal({
                          cotizacionId: cot.id,
                          opportunityId: "",
                          versionLabel: `${cot.quoteNumber}`,
                        })
                      }
                    >
                      Vincular a oportunidad
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {linkModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>Vincular cotización a oportunidad</h3>
            <p>Cotización: {linkModal.versionLabel}</p>

            <div className={styles.formGroup}>
              <label>ID de la oportunidad *</label>
              <input
                type="number"
                placeholder="Ej: 3"
                value={linkModal.opportunityId}
                onChange={(e) => setLinkModal({ ...linkModal, opportunityId: e.target.value })}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Etiqueta de versión</label>
              <input
                type="text"
                placeholder="Ej: v1, v2 (opcional)"
                value={linkModal.versionLabel}
                onChange={(e) => setLinkModal({ ...linkModal, versionLabel: e.target.value })}
              />
            </div>

            <div className={styles.modalActions}>
              <button className={styles.primaryButton} onClick={handleLinkCotizacion} disabled={loading}>
                Vincular
              </button>
              <button className={styles.ghostButton} onClick={() => setLinkModal(null)} disabled={loading}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
