"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { Alert, Button, DateInput, Field, Segmented, Textarea } from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import { MOTIVO_REGISTRO_MINIMO, registrarChecadaAsistida } from "@/lib/asistencia-confiable-api";
import estilo from "./asistencia-confiable.module.css";

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
    <Modal
      open
      onClose={onClose}
      title={`Registrar checada de ${persona.nombre}`}
      maxWidth={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={motivoCorto || guardando} loading={guardando} onClick={() => void guardar()}>
            {guardando ? "Registrando…" : "Registrar"}
          </Button>
        </>
      }
    >
      <div className={estilo.cuerpo}>
        <p className={estilo.nota}>
          Úsalo solo cuando la persona no pudo checar desde su teléfono. Queda registrado con tu nombre y el
          motivo, y la checada sale marcada para revisión: nadie midió su ubicación.
        </p>

        <Field label="Qué registrar">
          <Segmented
            ariaLabel="Qué registrar"
            value={tipo}
            onChange={setTipo}
            items={[
              { id: "entrada", label: "Entrada" },
              { id: "salida", label: "Salida" },
            ]}
          />
        </Field>

        <Field label="Hora" hint="Vacío = ahora">
          <DateInput type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </Field>

        <Field label="Motivo" required hint={`Al menos ${MOTIVO_REGISTRO_MINIMO} caracteres.`}>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Se le descompuso el teléfono en la obra"
          />
        </Field>

        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}
