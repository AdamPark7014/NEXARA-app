'use client';

import React, { useState, useEffect } from 'react';
import { useUser } from './UserContext';
import PDFViewer from './PDFViewer';
import styles from './QuoteGenerator.module.css';

interface Quote {
  id: number;
  opportunity?: { id: number; title: string; description: string };
  client?: { id: number; name: string };
  quoteNumber?: string;
  total?: number;
  pdfUrl?: string;
}

interface Client {
  id: number;
  name: string;
  legalName?: string;
  taxId?: string;
  fiscalAddress?: string;
  billingEmail?: string;
}

interface Opportunity {
  id: number;
  title: string;
  description?: string;
  value: number;
}

interface OrderTemplate {
  id: number;
  name: string;
  isDefault: boolean;
}

interface QuoteGeneratorProps {
  onQuoteGenerated?: () => void | Promise<void>;
}

export default function QuoteGenerator({ onQuoteGenerated }: QuoteGeneratorProps) {
  const { user } = useUser();
  const token = user?.token;
  const [step, setStep] = useState(1); // 1: select, 2: preview, 3: success
  const [opportunityQuoteId, setOpportunityQuoteId] = useState<number | null>(null);
  const [clientId, setClientId] = useState<number | null>(null);
  const [templateId, setTemplateId] = useState<number | null>(null);

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [templates, setTemplates] = useState<OrderTemplate[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedPdf, setGeneratedPdf] = useState<{
    pdfUrl: string;
    fileName: string;
    size: number;
  } | null>(null);

  useEffect(() => {
    if (!token) return;
    loadInitialData();
  }, [token]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [quotesRes, clientsRes, templatesRes] = await Promise.all([
        fetch('/api/ventas/cotizaciones', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/ventas/clientes', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/ventas/templates', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const quotesData = await quotesRes.json();
      const clientsData = await clientsRes.json();
      const templatesData = await templatesRes.json();

      setQuotes(Array.isArray(quotesData) ? quotesData : []);
      setClients(Array.isArray(clientsData) ? clientsData : []);
      setTemplates(Array.isArray(templatesData) ? templatesData : []);
    } catch (err) {
      setError('Error loading data: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setLoading(false);
    }
  };

  const generateQuote = async () => {
    if (!opportunityQuoteId || !clientId) {
      setError('Please select both a quote and a client');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/ventas/cotizaciones/generar-pdf', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          opportunityQuoteId,
          clientId,
          templateId: templateId || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const data = await response.json();
      setGeneratedPdf(data);
      setStep(3);
      
      // Callback para refrescar lista si el padre lo proporciona
      if (onQuoteGenerated) {
        await onQuoteGenerated();
      }
    } catch (err) {
      setError('Error generating quote: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    if (!generatedPdf) return;

    try {
      const response = await fetch(generatedPdf.pdfUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = generatedPdf.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError('Error downloading PDF: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h2 className={styles.title}>📄 Generar Cotización Dinámica</h2>
        <p className={styles.subtitle}>Crea cotizaciones profesionales con datos embebidos del cliente</p>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {step === 1 && (
          <div className={styles.selectionPanel}>
            {/* SELECT QUOTE */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Cotización Base *</label>
              <select
                value={opportunityQuoteId || ''}
                onChange={(e) => setOpportunityQuoteId(Number(e.target.value))}
                className={styles.select}
                disabled={loading}
              >
                <option value="">Selecciona una cotización...</option>
                {quotes.map((quote) => (
                  <option key={quote.id} value={quote.id}>
                    {`${quote.quoteNumber || `COT-${quote.id}`} - $${quote.total?.toFixed(2)}`}
                  </option>
                ))}
              </select>
              {opportunityQuoteId && (
                <div className={styles.hint}>
                  Se usarán los items y totales de esta cotización
                </div>
              )}
            </div>

            {/* SELECT CLIENT */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Cliente *</label>
              <select
                value={clientId || ''}
                onChange={(e) => setClientId(Number(e.target.value))}
                className={styles.select}
                disabled={loading}
              >
                <option value="">Selecciona un cliente...</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {`${client.name}${client.legalName ? ` (${client.legalName})` : ''}`}
                  </option>
                ))}
              </select>
              {clientId && (
                <div className={styles.hint}>
                  Se embeerán: nombre, RFC, domicilio, email, teléfono
                </div>
              )}
            </div>

            {/* SELECT TEMPLATE */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Plantilla (Opcional)</label>
              <select
                value={templateId || ''}
                onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : null)}
                className={styles.select}
                disabled={loading}
              >
                <option value="">Usa plantilla predeterminada</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {`${t.name}${t.isDefault ? ' (predeterminada)' : ''}`}
                  </option>
                ))}
              </select>
              <div className={styles.hint}>
                Colores, logo y formato personalizados
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className={styles.actions}>
              <button
                onClick={generateQuote}
                disabled={!opportunityQuoteId || !clientId || loading}
                className={styles.primaryButton}
              >
                {loading ? 'Generando...' : '✨ Generar PDF'}
              </button>
              <button onClick={() => setStep(2)} className={styles.secondaryButton}>
                Vista Previa
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className={styles.previewPanel}>
            <div className={styles.previewContainer}>
              <h3>Vista Previa del PDF</h3>
              {generatedPdf ? (
                <PDFViewer 
                  pdfUrl={generatedPdf.pdfUrl} 
                  fileName={generatedPdf.fileName}
                  height="700px"
                />
              ) : (
                <div className={styles.noPreview}>
                  <p>Genera un PDF para ver la vista previa</p>
                </div>
              )}
            </div>
            <div className={styles.actions}>
              <button onClick={() => setStep(1)} className={styles.secondaryCta}>
                ← Atrás
              </button>
            </div>
          </div>
        )}

        {step === 3 && generatedPdf && (
          <div className={styles.successPanel}>
            <div className={styles.successIcon}>✅</div>
            <h3>PDF Generado Correctamente</h3>
            <div className={styles.details}>
              <p><strong>Archivo:</strong> {generatedPdf.fileName}</p>
              <p><strong>Tamaño:</strong> {(generatedPdf.size / 1024).toFixed(2)} KB</p>
            </div>

            <div className={styles.pdfPreview}>
              <PDFViewer 
                pdfUrl={generatedPdf.pdfUrl} 
                fileName={generatedPdf.fileName}
                height="500px"
              />
            </div>

            <div className={styles.actions}>
              <button onClick={downloadPdf} className={styles.primaryButton}>
                📥 Descargar PDF
              </button>
              <button
                onClick={() => {
                  setStep(1);
                  setGeneratedPdf(null);
                  setOpportunityQuoteId(null);
                  setClientId(null);
                  setTemplateId(null);
                }}
                className={styles.secondaryButton}
              >
                ➕ Nueva Cotización
              </button>
            </div>

            <div className={styles.nextSteps}>
              <h4>Próximos Pasos:</h4>
              <ul>
                <li>✅ Envía el PDF al cliente por email</li>
                <li>✅ Espera confirmación del cliente</li>
                <li>✅ Crea un Proyecto cuando sea aprobada</li>
                <li>✅ Gestiona costos y presupuesto</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
