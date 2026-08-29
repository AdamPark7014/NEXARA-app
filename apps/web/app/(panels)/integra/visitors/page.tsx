"use client";

import { useState } from "react";
import { DashPage, DashHero, DashPanel } from "@/components/dashboard/DashKit";
import { btnGhost, btnPrimary, inputStyle, integraApi } from "../_lib";

export default function IntegraVisitorsPage() {
  const [visitorName, setVisitorName] = useState("");
  const [phoneNo, setPhoneNo] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [qrPayload, setQrPayload] = useState("");
  const [qrOut, setQrOut] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const register = async () => {
    setError(null);
    try {
      const data = await integraApi<any>("integra/visitors/register", {
        method: "POST",
        body: JSON.stringify({
          visitorInfoList: [{ visitorName, phoneNo }],
        }),
      });
      setResult(JSON.stringify(data, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  const fetchQr = async () => {
    setError(null);
    try {
      let body: Record<string, unknown> = {};
      try {
        body = qrPayload ? JSON.parse(qrPayload) : {};
      } catch {
        body = { orderId: qrPayload };
      }
      const data = await integraApi<any>("integra/visitors/qr", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setQrOut(JSON.stringify(data, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="P3"
        title="Visitas"
        subtitle="appointment/registration + visitor/qr/get. Sin biometría en Postgres."
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <DashPanel title="Registrar visita">
        <div style={{ display: "grid", gap: 8, maxWidth: 360 }}>
          <input
            placeholder="Nombre visitante"
            value={visitorName}
            onChange={(e) => setVisitorName(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Teléfono"
            value={phoneNo}
            onChange={(e) => setPhoneNo(e.target.value)}
            style={inputStyle}
          />
          <button type="button" style={btnPrimary} onClick={() => void register()}>
            Registrar
          </button>
        </div>
        {result && (
          <pre style={{ fontSize: 11, marginTop: 12, overflow: "auto" }}>{result}</pre>
        )}
      </DashPanel>

      <DashPanel title="QR visita">
        <textarea
          placeholder='JSON Artemis o orderId'
          value={qrPayload}
          onChange={(e) => setQrPayload(e.target.value)}
          style={{ ...inputStyle, maxWidth: "100%", height: 80 }}
        />
        <button type="button" style={btnGhost} onClick={() => void fetchQr()}>
          Obtener QR
        </button>
        {qrOut && <pre style={{ fontSize: 11, marginTop: 12, overflow: "auto" }}>{qrOut}</pre>}
      </DashPanel>
    </DashPage>
  );
}
