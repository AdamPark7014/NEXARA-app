"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import PublicIcon from "@/app/components/PublicIcon";
import s from "@/components/sitio/sitio.module.css";
import p from "@/components/sitio/paginas.module.css";
import i from "@/components/sitio/interior.module.css";
import f from "./firmar.module.css";

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

/**
 * La causa del servidor cuando dice algo útil («La cotización está en revisión»). Las frases genéricas de HTTP en
 * inglés y el texto de respaldo se cambian por una indicación en español.
 */
function causaVisible(error: string): string {
  const generica = /^(internal server error|bad gateway|service unavailable|gateway timeout|not found)$/i;
  return generica.test(error.trim()) || error === "No se pudo cargar la cotización."
    ? "Puede ser la conexión. Inténtalo otra vez en un momento."
    : error;
}

const formatMoney = (value: number, currency: string) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);

/** Fecha de calendario de la cotización; en UTC para que medianoche no se recorra al día anterior. */
const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value.slice(0, 10)
    : d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

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
      setError("Nombre y correo son requeridos.");
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
  const estado =
    quote?.status === "APPROVED"
      ? { texto: "Aprobada", clase: f.estadoAprobada }
      : quote?.status === "SENT"
        ? { texto: "Enviada", clase: f.estadoEnviada }
        : { texto: "Borrador", clase: "" };

  return (
    <main className={i.servicioPagina} aria-label="Firma de cotización">
      {loading ? (
        <div className={`${i.panel} ${i.panelAngosto}`}>
          <p className={f.cargando} role="status">
            Cargando cotización…
          </p>
        </div>
      ) : blocking && error ? (
        <div className={`${i.panel} ${i.panelAngosto}`}>
          <span className={i.panelIcono}>
            <PublicIcon name={failure === "missing" ? "search" : "alert"} size={24} />
          </span>
          {failure === "missing" ? (
            <>
              <p className={i.panelTitulo} role="alert">
                {error}
              </p>
              <p className={i.panelTexto}>Revisa que el enlace esté completo o pide a tu asesor uno nuevo.</p>
            </>
          ) : (
            <>
              <p className={i.panelTitulo}>No se pudo cargar la cotización</p>
              <p className={i.panelTexto} role="alert">
                {causaVisible(error)}
              </p>
            </>
          )}
          <div className={i.panelAcciones}>
            {failure === "load" ? (
              <button type="button" className={`${s.boton} ${s.botonPrimario}`} onClick={() => setReloadKey((n) => n + 1)}>
                Reintentar
              </button>
            ) : null}
            <Link href="/contacto" className={`${s.boton} ${s.botonSecundario}`}>
              Contactar a NEXARA
            </Link>
          </div>
        </div>
      ) : !quote ? (
        <div className={`${i.panel} ${i.panelAngosto}`}>
          <p className={i.panelTitulo}>Cotización no disponible.</p>
        </div>
      ) : (
        <div className={i.panel}>
          <header className={f.cabecera}>
            <div>
              <p className={f.antetitulo}>Firma de cotización</p>
              <h1 className={f.folio}>{quote.quoteNumber}</h1>
              <p className={f.cliente}>{quote.clientCompany || "Cliente"}</p>
            </div>
            <span className={`${f.estado} ${estado.clase}`}>{estado.texto}</span>
          </header>

          <div className={f.datos}>
            <div>
              <span>Emisión</span>
              <strong>{formatDate(quote.issueDate)}</strong>
            </div>
            <div>
              <span>Vigencia</span>
              <strong>{formatDate(quote.validUntil)}</strong>
            </div>
            <div>
              <span>Proyecto</span>
              <strong>{quote.projectName || "—"}</strong>
            </div>
          </div>

          <ul className={f.conceptos} aria-label="Conceptos">
            {quote.items.map((item) => (
              <li key={item.id} className={f.concepto}>
                <div>
                  <div className={f.conceptoNombre}>{item.name}</div>
                  <div className={f.conceptoDetalle}>
                    {item.qty} × {formatMoney(item.unitPrice, quote.currency)}
                  </div>
                </div>
                <div className={f.importe}>{formatMoney(item.lineTotal, quote.currency)}</div>
              </li>
            ))}
          </ul>

          <div className={f.totales}>
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
            <div className={f.total}>
              <span>Total</span>
              <span>{formatMoney(quote.total, quote.currency)}</span>
            </div>
          </div>

          <section className={f.firma} aria-labelledby="firma-titulo">
            <h2 id="firma-titulo" className={f.firmaTitulo}>
              Firma digital
            </h2>
            {signed ? (
              <p className={f.listo} role="status" aria-live="polite">
                <PublicIcon name="check" size={20} /> Gracias, tu firma quedó registrada.
              </p>
            ) : (
              <>
                <p className={f.firmaNota}>Al firmar aceptas esta cotización con el nombre y el correo que escribas aquí.</p>
                {error ? (
                  <p className={f.aviso} role="alert">
                    {error}
                  </p>
                ) : null}
                <div className={f.firmaCampos}>
                  <label htmlFor="quote-signer-name" className={p.campo}>
                    Nombre completo
                    <input
                      id="quote-signer-name"
                      type="text"
                      autoComplete="name"
                      aria-required="true"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label htmlFor="quote-signer-email" className={p.campo}>
                    Correo electrónico
                    <input
                      id="quote-signer-email"
                      type="email"
                      autoComplete="email"
                      aria-required="true"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                </div>
                <button type="button" className={`${s.boton} ${s.botonPrimario}`} style={{ justifySelf: "start" }} onClick={handleSign}>
                  Firmar cotización
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
