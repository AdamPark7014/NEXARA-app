"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";

type PublicQuote = {
  quoteNumber: string;
  issueDate: string;
  validUntil?: string | null;
  status: string;
  clientName?: string | null;
  clientCompany?: string | null;
  clientEmail?: string | null;
  projectName?: string | null;
  currency: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  iepsTotal?: number;
  retentionTotal?: number;
  total: number;
  items: Array<{ id: number; name: string; qty: number; unitPrice: number; lineTotal: number }>;
};

/** La causa que dio el servidor; sin red o con una respuesta ilegible, el texto de respaldo. */
function causaDelError(e: unknown, respaldo: string): string {
  return e instanceof TypeError ? respaldo : formatApiError(e, respaldo);
}

const formatMoney = (value: number, currency: string) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);

export default function FirmarCotizacionPage() {
  const params = useParams();
  const token = params?.token as string | undefined;
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [signed, setSigned] = useState(false);
  // «missing»: el enlace no existe (404) y reintentar no sirve; «load»: no se pudo cargar y sí se reintenta.
  const [failure, setFailure] = useState<"missing" | "load" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setFailure(null);
    fetch(buildApiUrl(`cotizaciones/public/${token}`))
      .then(async (res) => {
        if (res.status === 404) {
          setFailure("missing");
          setError("No se encontró la cotización.");
          return;
        }
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setQuote(data);
        setName(data.clientName || "");
        setEmail(data.clientEmail || "");
      })
      .catch((e: unknown) => {
        setFailure("load");
        setError(causaDelError(e, "No se pudo cargar la cotización."));
      })
      .finally(() => setLoading(false));
  }, [token, reloadKey]);

  const handleSign = async () => {
    if (!token) return;
    if (!name || !email) {
      setError("Nombre y email son requeridos.");
      return;
    }
    setError(null);
    try {
      const res = await fetch(buildApiUrl(`cotizaciones/public/${token}/sign`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSigned(true);
    } catch (e) {
      // El aviso se queda junto al formulario: si el servidor rechazó el correo, se corrige ahí mismo
      // y «Firmar cotización» vuelve a intentarlo.
      setError(causaDelError(e, "No se pudo firmar la cotización."));
    }
  };

  const blocking = failure !== null;

  return (
    <main className="quoteShell" aria-label="Firma de cotización">
      {loading ? (
        "Cargando cotización…"
      ) : blocking && error ? (
        <div className="errorBox">
          <p role="alert">{error}</p>
          {failure === "load" ? (
            <button type="button" onClick={() => setReloadKey((n) => n + 1)}>
              Reintentar
            </button>
          ) : null}
        </div>
      ) : !quote ? (
        "Cotización no disponible."
      ) : (
      <div className="quoteCard">
        <header className="quoteHeader">
          <div>
            <p className="eyebrow">Firma de cotización</p>
            <h1>{quote.quoteNumber}</h1>
            <p className="subline">{quote.clientCompany || "Cliente"}</p>
          </div>
          <div className={`statusPill ${quote.status?.toLowerCase() || "draft"}`}>
            {quote.status === "APPROVED" ? "Aprobada" : quote.status === "SENT" ? "Enviada" : "Borrador"}
          </div>
        </header>

        <div className="metaRow">
          <div>
            <span>Emision</span>
            <strong>{quote.issueDate?.slice(0, 10)}</strong>
          </div>
          <div>
            <span>Vigencia</span>
            <strong>{quote.validUntil?.slice(0, 10) || "-"}</strong>
          </div>
          <div>
            <span>Proyecto</span>
            <strong>{quote.projectName || "-"}</strong>
          </div>
        </div>

        <div className="itemsList">
          {quote.items.map((item) => (
            <div key={item.id} className="itemRow">
              <div>
                <div className="itemName">{item.name}</div>
                <div className="itemMeta">{item.qty} x {formatMoney(item.unitPrice, quote.currency)}</div>
              </div>
              <div className="itemAmount">{formatMoney(item.lineTotal, quote.currency)}</div>
            </div>
          ))}
        </div>

        <div className="totals">
          <div>
            <span>Subtotal</span>
            <span>{formatMoney(quote.subtotal, quote.currency)}</span>
          </div>
          <div>
            <span>Descuento</span>
            <span>{formatMoney(quote.discountTotal, quote.currency)}</span>
          </div>
          <div>
            <span>IVA</span>
            <span>{formatMoney(quote.taxTotal, quote.currency)}</span>
          </div>
          <div>
            <span>IEPS</span>
            <span>{formatMoney(quote.iepsTotal || 0, quote.currency)}</span>
          </div>
          <div>
            <span>Retenciones</span>
            <span>- {formatMoney(quote.retentionTotal || 0, quote.currency)}</span>
          </div>
          <div className="totalRow">
            <span>Total</span>
            <span>{formatMoney(quote.total, quote.currency)}</span>
          </div>
        </div>

        <div className="signCard">
          <h2>Firma digital</h2>
          {signed ? (
            <p role="status" aria-live="polite">Gracias, tu firma quedó registrada.</p>
          ) : (
            <>
              {error ? <p role="alert">{error}</p> : null}
              <label htmlFor="quote-signer-name">
                Nombre completo
                <input id="quote-signer-name" type="text" autoComplete="name" aria-required="true" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label htmlFor="quote-signer-email">
                Email
                <input id="quote-signer-email" type="email" autoComplete="email" aria-required="true" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <button type="button" onClick={handleSign}>Firmar cotización</button>
            </>
          )}
        </div>
      </div>
      )}

      <style jsx>{`
        .quoteShell {
          min-height: 100vh;
          background: radial-gradient(circle at top, rgba(29, 75, 130, 0.35), rgba(8, 14, 24, 0.95));
          display: grid;
          place-items: center;
          padding: 32px 16px;
          font-family: var(--panel-font-family);
          color: #e6f0ff;
        }

        .quoteCard {
          width: min(860px, 100%);
          background: rgba(12, 28, 52, 0.95);
          border: 1px solid rgba(90, 140, 210, 0.25);
          border-radius: 20px;
          padding: clamp(14px, 3.5vw, 24px);
          box-shadow: 0 24px 48px rgba(4, 10, 22, 0.45);
          display: grid;
          gap: 18px;
        }

        .quoteHeader {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          align-items: center;
        }

        .eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.3em;
          font-size: 11px;
          margin: 0 0 6px;
          color: rgba(230, 240, 255, 0.6);
        }

        .subline {
          margin: 0;
          color: rgba(230, 240, 255, 0.7);
        }

        .statusPill {
          padding: 6px 14px;
          border-radius: 999px;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          background: rgba(255, 255, 255, 0.08);
        }

        .statusPill.sent {
          background: rgba(31, 140, 255, 0.2);
          color: #9bd2ff;
        }

        .statusPill.approved {
          background: rgba(34, 196, 121, 0.18);
          color: #9ef3c8;
        }

        .metaRow {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 10px;
          background: rgba(6, 14, 26, 0.65);
          border-radius: 12px;
          padding: 12px;
          font-size: 12px;
          color: rgba(230, 240, 255, 0.7);
        }

        @media (max-width: 390px) {
          .metaRow {
            grid-template-columns: 1fr;
          }
        }

        .metaRow strong {
          display: block;
          color: #fff;
          font-size: 14px;
          margin-top: 4px;
        }

        .itemsList {
          display: grid;
          gap: 12px;
        }

        .itemRow {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .itemName {
          font-weight: 600;
        }

        .itemMeta {
          font-size: 12px;
          color: rgba(230, 240, 255, 0.65);
        }

        .itemAmount {
          font-weight: 600;
        }

        .totals {
          display: grid;
          gap: 6px;
          font-size: 13px;
        }

        .totals div {
          display: flex;
          justify-content: space-between;
        }

        .totalRow {
          margin-top: 6px;
          font-size: 16px;
          font-weight: 700;
          color: #fff;
        }

        .signCard {
          background: rgba(8, 20, 36, 0.9);
          border: 1px solid rgba(90, 140, 210, 0.25);
          border-radius: 16px;
          padding: 16px;
          display: grid;
          gap: 12px;
        }

        .signCard h2 {
          margin: 0;
          font-size: 16px;
        }

        .signCard label {
          display: grid;
          gap: 6px;
          font-size: 13px;
        }

        .signCard input {
          background: rgba(6, 14, 26, 0.8);
          border: 1px solid rgba(90, 140, 210, 0.35);
          border-radius: 10px;
          padding: 10px 12px;
          color: #e6f0ff;
          font-family: inherit;
        }

        .errorBox {
          width: min(860px, 100%);
          display: grid;
          gap: 12px;
          justify-items: start;
        }

        .errorBox p {
          margin: 0;
        }

        .signCard button,
        .errorBox button {
          border: none;
          border-radius: 12px;
          padding: 10px 16px;
          font-weight: 600;
          cursor: pointer;
          background: linear-gradient(135deg, #1f8cff, #2563eb);
          color: #fff;
          justify-self: start;
        }
      `}</style>
    </main>
  );
}

