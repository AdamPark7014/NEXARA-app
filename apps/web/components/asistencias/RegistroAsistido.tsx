"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import Button from "@/components/ui/Button";
import { erpInputStyle, formatApiError } from "@/lib/erp-api";
import { MOTIVO_REGISTRO_MINIMO, registrarChecadaAsistida } from "@/lib/asistencia-confiable-api";

/**
 * Un jefe registra la checada de alguien de su equipo.
 *
 * Es la salida de emergencia de «solo se checa desde la app»: teléfono roto, sin
 * batería, olvidado en casa. Sin ella, el día siguiente a un teléfono roto es una falta
 * y la persona la paga en su nómina.
 *
 * No lleva foto —quien la registra no estaba ahí— así que la checada nace marcada para
 * revisión, con el nombre de quien la puso y el motivo. El motivo es obligatorio.
 */

export type PersonaParaRegistro = { id: number; nombre: string };

export default function RegistroAsistido({
  token,
  persona,
  fecha,
  onClose,
  onRegistrada,
}: {
  token: string;
  persona: PersonaParaRegistro;
  /** Día en `AAAA-MM-DD` que se está viendo; la hora la elige quien registra. */
  fecha: string;
  onClose: () => void;
  onRegistrada: () => void;
}) {
  const [tipo, setTipo] = useState<"entrada" | "salida">("entrada");
  const [hora, setHora] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const motivoCorto = motivo.trim().length < MOTIVO_REGISTRO_MINIMO;

  const guardar = async () => {
    if (motivoCorto) return;
    setGuardando(true);
    setError(null);
    try {
      await registrarChecadaAsistida(token, {
        userId: persona.id,
        type: tipo,
        // Sin hora se usa la de ahora, que es lo normal cuando la persona está enfrente.
        timestamp: hora ? new Date(`${fecha}T${hora}:00`).toISOString() : undefined,
        motivo: motivo.trim(),
      });
      onRegistrada();
      onClose();
    } catch (e) {
      setError(formatApiError(e, "No se pudo registrar la checada"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Registrar checada de ${persona.nombre}`} maxWidth={460}>
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" }}>
          Úsalo solo cuando la persona no pudo checar desde su teléfono. Queda registrado con tu nombre y el
          motivo, y la checada sale marcada para revisión: nadie midió su ubicación.
        </p>

        <label style={{ display: "grid", gap: 4, fontSize: 12.5, fontWeight: 600 }}>
          Qué registrar
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value === "salida" ? "salida" : "entrada")}
            style={erpInputStyle}
          >
            <option value="entrada">Entrada</option>
            <option value="salida">Salida</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 4, fontSize: 12.5, fontWeight: 600 }}>
          Hora <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>(vacío = ahora)</span>
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={erpInputStyle} />
        </label>

        <label style={{ display: "grid", gap: 4, fontSize: 12.5, fontWeight: 600 }}>
          Motivo
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Se le descompuso el teléfono en la obra"
            style={{ ...erpInputStyle, resize: "vertical" }}
          />
          <span style={{ fontWeight: 400, fontSize: 11.5, color: "var(--text-tertiary)" }}>
            Al menos {MOTIVO_REGISTRO_MINIMO} caracteres.
          </span>
        </label>

        {error ? <InlineAlert variant="danger" message={error} /> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" disabled={motivoCorto || guardando} onClick={() => void guardar()}>
            {guardando ? "Registrando…" : "Registrar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
