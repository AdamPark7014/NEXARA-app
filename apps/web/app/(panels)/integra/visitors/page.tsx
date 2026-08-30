"use client";

import { useMemo, useState } from "react";
import { DashPage, DashHero, DashPanel, DashGrid, DashCol } from "@/components/dashboard/DashKit";
import styles from "../integra.module.css";
import {
  btnGhost,
  btnPrimary,
  defaultRangeHours,
  fromDatetimeLocalValue,
  inputStyle,
  integraApi,
  selectStyle,
} from "../_lib";

export default function IntegraVisitorsPage() {
  const range0 = useMemo(() => defaultRangeHours(8), []);
  const [visitorName, setVisitorName] = useState("");
  const [phoneNo, setPhoneNo] = useState("");
  const [gender, setGender] = useState("1");
  const [visitStart, setVisitStart] = useState(range0.start);
  const [visitEnd, setVisitEnd] = useState(range0.end);
  const [receptionistId, setReceptionistId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [orderId, setOrderId] = useState("");
  const [qrOut, setQrOut] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const register = async () => {
    setError(null);
    try {
      const visitor: Record<string, unknown> = {
        visitorName,
        phoneNo,
        gender: Number(gender) || 1,
      };
      const body: Record<string, unknown> = {
        visitorInfoList: [visitor],
      };
      const st = fromDatetimeLocalValue(visitStart);
      const et = fromDatetimeLocalValue(visitEnd);
      if (st) body.visitStartTime = st;
      if (et) body.visitEndTime = et;
      if (receptionistId.trim()) body.receptionistId = receptionistId.trim();
      if (purpose.trim()) body.visitPurpose = purpose.trim();

      const data = await integraApi<any>("integra/visitors/register", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(JSON.stringify(data, null, 2));
      const oid =
        data?.orderId ||
        data?.data?.orderId ||
        data?.appointRecordId ||
        data?.data?.appointRecordId;
      if (oid) setOrderId(String(oid));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  const fetchQr = async () => {
    setError(null);
    try {
      const body = orderId.trim() ? { orderId: orderId.trim() } : {};
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
        eyebrow="Visitas"
        title="Citas y QR"
        subtitle="appointment/registration con ventana, anfitrión y propósito · visitor/qr/get."
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <DashGrid>
        <DashCol span={6}>
          <DashPanel title="Registrar visita">
            <div className={styles.filterBar} style={{ border: "none", padding: 0, background: "transparent" }}>
              <div className={styles.filterField} style={{ flex: "1 1 160px" }}>
                <span className={styles.filterLabel}>Nombre *</span>
                <input value={visitorName} onChange={(e) => setVisitorName(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
              </div>
              <div className={styles.filterField} style={{ flex: "1 1 140px" }}>
                <span className={styles.filterLabel}>Teléfono</span>
                <input value={phoneNo} onChange={(e) => setPhoneNo(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>Género</span>
                <select value={gender} onChange={(e) => setGender(e.target.value)} style={selectStyle}>
                  <option value="1">Masculino</option>
                  <option value="2">Femenino</option>
                  <option value="0">Desconocido</option>
                </select>
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>Inicio visita</span>
                <input type="datetime-local" value={visitStart} onChange={(e) => setVisitStart(e.target.value)} style={inputStyle} />
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>Fin visita</span>
                <input type="datetime-local" value={visitEnd} onChange={(e) => setVisitEnd(e.target.value)} style={inputStyle} />
              </div>
              <div className={styles.filterField} style={{ flex: "1 1 160px" }}>
                <span className={styles.filterLabel}>receptionistId</span>
                <input
                  placeholder="personId anfitrión"
                  value={receptionistId}
                  onChange={(e) => setReceptionistId(e.target.value)}
                  style={{ ...inputStyle, maxWidth: "100%" }}
                />
              </div>
              <div className={styles.filterField} style={{ flex: "1 1 200px" }}>
                <span className={styles.filterLabel}>Propósito</span>
                <input value={purpose} onChange={(e) => setPurpose(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
              </div>
            </div>
            <button
              type="button"
              style={{ ...btnPrimary, marginTop: 12 }}
              disabled={!visitorName.trim()}
              onClick={() => void register()}
            >
              Registrar
            </button>
            {result && (
              <pre style={{ fontSize: 11, marginTop: 12, overflow: "auto", maxHeight: 220 }}>{result}</pre>
            )}
          </DashPanel>
        </DashCol>
        <DashCol span={6}>
          <DashPanel title="QR visita">
            <div className={styles.filterField}>
              <span className={styles.filterLabel}>orderId</span>
              <input
                placeholder="Se rellena tras registrar si Artemis lo devuelve"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                style={{ ...inputStyle, maxWidth: "100%" }}
              />
            </div>
            <button type="button" style={{ ...btnGhost, marginTop: 10 }} onClick={() => void fetchQr()}>
              Obtener QR
            </button>
            {qrOut && (
              <pre style={{ fontSize: 11, marginTop: 12, overflow: "auto", maxHeight: 280 }}>{qrOut}</pre>
            )}
          </DashPanel>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}
