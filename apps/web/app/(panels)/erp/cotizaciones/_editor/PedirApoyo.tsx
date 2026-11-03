"use client";

/**
 * Pedirle apoyo en esta cotización a quien no tiene el módulo (Velocidad Core, Ola 5): le crea su
 * actividad y le abre solo esta, sin costo ni margen, hasta que la termine.
 */
import { useEffect, useState } from "react";
import { Alert, Button, Select, Textarea } from "@/components/base";
import { toast } from "@/components/Toast";
import { personasAsignables, type PersonaAsignable } from "@/lib/asistente-ia-api";
import { pedirApoyoEnCotizacion } from "@/lib/cotizacion-abierta-api";
import { formatApiError } from "@/lib/erp-api";
import { Campo } from "./campos";
import Dialogo from "./Dialogo";

export default function PedirApoyo({ token, cotizacionId, onCerrar }: { token: string; cotizacionId: number; onCerrar: () => void }) {
  const [personas, setPersonas] = useState<PersonaAsignable[]>([]);
  const [userId, setUserId] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    personasAsignables(token)
      .then(setPersonas)
      .catch((e) => setError(formatApiError(e, "No se pudo traer a tu gente")));
  }, [token]);

  const pedir = async () => {
    setOcupado(true);
    setError(null);
    try {
      await pedirApoyoEnCotizacion(token, cotizacionId, Number(userId), nota);
      toast.success("Le llegó la actividad, con esta cotización abierta.");
      onCerrar();
    } catch (e) {
      setError(formatApiError(e, "No se pudo pedir el apoyo"));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialogo
      titulo="Pedirle apoyo solo en esta cotización"
      onCerrar={onCerrar}
      ocupado={ocupado}
      pie={
        <>
          <Button variant="tertiary" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button variant="primary" loading={ocupado} disabled={!userId} onClick={() => void pedir()}>
            Pedir apoyo
          </Button>
        </>
      }
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Campo etiqueta="A quién" htmlFor="persona-apoyo" pista="Le llega como actividad. Trabaja partidas y precios de esta cotización, sin ver costo ni margen, hasta que la termine.">
        <Select id="persona-apoyo" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Elige a alguien</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Qué necesitas" htmlFor="nota-apoyo">
        <Textarea id="nota-apoyo" rows={3} maxLength={1000} value={nota} onChange={(e) => setNota(e.target.value)} />
      </Campo>
    </Dialogo>
  );
}
