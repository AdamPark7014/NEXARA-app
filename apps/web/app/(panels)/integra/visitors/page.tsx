"use client";

import { useMemo, useState } from "react";
import {
  IgBtn,
  IgError,
  IgField,
  IgFilters,
  IgPage,
  IgPanel,
  IgSplit,
  IgToolbar,
} from "../_Console";
import {
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

  return (
    <IgPage>
      <IgToolbar title="Visitas" meta="appointment + QR" />
      <IgError>{error}</IgError>
      <IgSplit
        left={
          <IgPanel title="Registrar">
            <IgFilters>
              <IgField label="Nombre *">
                <input value={visitorName} onChange={(e) => setVisitorName(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
              </IgField>
              <IgField label="Teléfono">
                <input value={phoneNo} onChange={(e) => setPhoneNo(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
              </IgField>
              <IgField label="Género">
                <select value={gender} onChange={(e) => setGender(e.target.value)} style={selectStyle}>
                  <option value="1">M</option>
                  <option value="2">F</option>
                  <option value="0">?</option>
                </select>
              </IgField>
              <IgField label="Inicio">
                <input type="datetime-local" value={visitStart} onChange={(e) => setVisitStart(e.target.value)} style={inputStyle} />
              </IgField>
              <IgField label="Fin">
                <input type="datetime-local" value={visitEnd} onChange={(e) => setVisitEnd(e.target.value)} style={inputStyle} />
              </IgField>
              <IgField label="Recepcionista (ID)">
                <input value={receptionistId} onChange={(e) => setReceptionistId(e.target.value)} placeholder="opcional" style={{ ...inputStyle, maxWidth: "100%" }} title="receptionistId" />
              </IgField>
              <IgField label="Propósito">
                <input value={purpose} onChange={(e) => setPurpose(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
              </IgField>
            </IgFilters>
            <IgBtn
              variant="primary"
              disabled={!visitorName.trim()}
              onClick={async () => {
                setError(null);
                try {
                  const body: Record<string, unknown> = {
                    visitorInfoList: [
                      { visitorName, phoneNo, gender: Number(gender) || 1 },
                    ],
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
              }}
            >
              Registrar
            </IgBtn>
            {result && (
              <pre style={{ fontSize: 10, marginTop: 8, maxHeight: 180, overflow: "auto" }}>{result}</pre>
            )}
          </IgPanel>
        }
        right={
          <IgPanel title="QR">
            <IgField label="ID de cita">
              <input value={orderId} onChange={(e) => setOrderId(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} title="orderId" />
            </IgField>
            <IgBtn
              onClick={async () => {
                setError(null);
                try {
                  const data = await integraApi<any>("integra/visitors/qr", {
                    method: "POST",
                    body: JSON.stringify(orderId.trim() ? { orderId: orderId.trim() } : {}),
                  });
                  setQrOut(JSON.stringify(data, null, 2));
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Error");
                }
              }}
            >
              Obtener QR
            </IgBtn>
            {qrOut && (
              <pre style={{ fontSize: 10, marginTop: 8, maxHeight: 280, overflow: "auto" }}>{qrOut}</pre>
            )}
          </IgPanel>
        }
      />
    </IgPage>
  );
}
