"use client";
import React, { useState } from 'react';



interface VehicleRequestFormProps {
  actividadId: number;
}

const VehicleRequestForm: React.FC<VehicleRequestFormProps> = ({ actividadId }) => {
  const [placas, setPlacas] = useState('');
  const [motivo, setMotivo] = useState('');
  const [evidencia, setEvidencia] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validate = () => {
    if (!placas || placas.length < 3) {
      setError('Las placas deben tener al menos 3 caracteres');
      return false;
    }
    if (!motivo || motivo.length < 3) {
      setError('El motivo debe tener al menos 3 caracteres');
      return false;
    }
    if (!evidencia) {
      setError('Debes adjuntar la evidencia de entrega');
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    setLoading(true);
    try {
      if (!validate()) return;
      // Aquí iría la lógica para enviar la solicitud al backend
      setSuccess('Solicitud enviada correctamente');
    } catch {
      setError('Error al enviar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="actividadId" value={actividadId} />
      <label>Placas del vehículo:
        <input type="text" value={placas} onChange={e => setPlacas(e.target.value)} required disabled={loading} />
      </label>
      <label>Motivo de uso:
        <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} required disabled={loading} />
      </label>
      <label>Evidencia de entrega:
        <input type="file" onChange={e => setEvidencia(e.target.files?.[0] || null)} required disabled={loading} />
      </label>
      <button type="submit" disabled={loading}>{loading ? 'Enviando...' : 'Solicitar Vehículo'}</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}
    </form>
  );
};

export default VehicleRequestForm;
