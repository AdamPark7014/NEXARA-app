"use client";

import { useMemo, useState } from "react";
import { lookupSalesFiscalByRfc, type FiscalLookupResult } from "@/lib/sales-api";
import { regimesForRfc } from "@/lib/sat-fiscal";

type Props = {
  token: string | null | undefined;
  rfc: string;
  onRfcChange: (rfc: string) => void;
  fiscalRegime: string;
  onRegimeChange: (code: string) => void;
  onApply?: (data: {
    legalName?: string | null;
    fiscalZipCode?: string | null;
    fiscalRegime?: string | null;
  }) => void;
  inputClassName?: string;
  selectClassName?: string;
  required?: boolean;
  disabled?: boolean;
};

export default function FiscalRfcLookup({
  token,
  rfc,
  onRfcChange,
  fiscalRegime,
  onRegimeChange,
  onApply,
  inputClassName,
  selectClassName,
  required,
  disabled,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const [remoteRegimes, setRemoteRegimes] = useState<Array<{ code: string; name: string }> | null>(null);

  const options = useMemo(() => {
    if (remoteRegimes?.length) return remoteRegimes;
    return regimesForRfc(rfc);
  }, [rfc, remoteRegimes]);

  const consult = async () => {
    if (!token || !rfc.trim()) {
      setOk(false);
      setHint("Escribe un RFC para consultar");
      return;
    }
    setLoading(true);
    setHint(null);
    try {
      const data: FiscalLookupResult = await lookupSalesFiscalByRfc(token, rfc);
      setRemoteRegimes(data.regimes);
      setOk(data.validation.valid);
      setHint(data.message);
      const regime = data.suggestedRegime || data.regimes[0]?.code || fiscalRegime;
      if (regime) onRegimeChange(regime);
      onApply?.({
        legalName: data.legalName,
        fiscalZipCode: data.fiscalZipCode,
        fiscalRegime: regime,
      });
    } catch (e) {
      setOk(false);
      setHint(e instanceof Error ? e.message : "No se pudo consultar");
      setRemoteRegimes(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <label htmlFor="fiscal-rfc" style={{ fontSize: 12, fontWeight: 600 }}>
          RFC {required ? "*" : ""}
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <input
            id="fiscal-rfc"
            className={inputClassName}
            required={required}
            disabled={disabled || loading}
            value={rfc}
            onChange={(e) => {
              setRemoteRegimes(null);
              setOk(null);
              setHint(null);
              onRfcChange(e.target.value.toUpperCase());
            }}
            placeholder="ABC123456XYZ"
            style={{ flex: 1 }}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => void consult()}
            disabled={disabled || loading || !token || !rfc.trim()}
            style={{
              whiteSpace: "nowrap",
              padding: "0 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              cursor: disabled || loading ? "not-allowed" : "pointer",
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            {loading ? "Consultando…" : "Consultar SAT"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        <label htmlFor="fiscal-regime" style={{ fontSize: 12, fontWeight: 600 }}>
          Régimen SAT {required ? "*" : ""}
        </label>
        <select
          id="fiscal-regime"
          className={selectClassName}
          required={required}
          disabled={disabled}
          value={fiscalRegime}
          onChange={(e) => onRegimeChange(e.target.value)}
        >
          <option value="">Selecciona régimen…</option>
          {options.map((r) => (
            <option key={r.code} value={r.code}>
              {r.code} — {r.name}
            </option>
          ))}
        </select>
      </div>

      {hint ? (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.35,
            color: ok === false ? "var(--danger, #b91c1c)" : "var(--text-secondary)",
          }}
        >
          {hint}
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.35 }}>
          Valida el RFC y sugiere régimenes. La razón social automática solo aparece si el servidor tiene
          proveedor de datos fiscales configurado.
        </p>
      )}
    </div>
  );
}
