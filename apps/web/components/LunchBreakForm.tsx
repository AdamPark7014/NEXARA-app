"use client";
import React, { useState, useRef, useEffect } from 'react';
import { useUser } from './UserContext';
import { useLunchBreakNotifications } from '@/lib/notifications';

interface LunchBreakFormProps {
  onSuccess?: () => void;
  isCheckin?: boolean;
}

const LunchBreakForm: React.FC<LunchBreakFormProps> = ({ onSuccess, isCheckin = true }) => {
  const { user } = useUser();
  const { initializeNotifications } = useLunchBreakNotifications();
  const [step, setStep] = useState<'camera' | 'confirmation'>('camera');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const initCamera = async (facingMode: 'user' | 'environment' = cameraFacing) => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode },
        audio: false,
      });
      setCameraFacing(facingMode);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      setError('No se pudo acceder a la cámara. Verifica los permisos del navegador.');
    }
  };

  const flipCamera = async () => {
    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    await initCamera(nextFacing);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        context.drawImage(videoRef.current, 0, 0, 640, 480);
        canvasRef.current.toBlob((blob) => {
          if (blob) {
            setPhoto(blob);
            setPhotoPreview(URL.createObjectURL(blob));
            setStep('confirmation');
            stopCamera();
          }
        }, 'image/jpeg', 0.95);
      }
    }
  };

  const handleSubmit = async () => {
    if (!photo || !user) {
      setError('Debes capturar una foto');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Convertir blob a base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Photo = reader.result as string;

        const endpoint = isCheckin ? buildApiUrl('lunch-breaks/checkin') : buildApiUrl('lunch-breaks/checkout');
        const bodyKey = isCheckin ? 'checkinPhotoUrl' : 'checkoutPhotoUrl';
        const timeKey = isCheckin ? 'checkinTime' : 'checkoutTime';

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify({
            [timeKey]: new Date().toISOString(),
            [bodyKey]: base64Photo,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || 'Error al registrar hora de comida');
        }

        setStep('camera');
        setPhoto(null);
        setPhotoPreview(null);
        if (onSuccess) onSuccess();
      };
      reader.readAsDataURL(photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    initializeNotifications();
    initCamera('user');

    return () => {
      stopCamera();
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, []);

  const lunchStatus = isCheckin ? 'De Entrada a Comida' : 'De Regreso al Trabajo';
  const lunchEmoji = isCheckin ? '🍽️ Entrada' : '✅ Regreso';

  return (
    <div className="card" style={{ maxWidth: 680, margin: '0 auto', padding: 'clamp(14px, 3vw, 24px)' }}>
      <h2 style={{ color: 'var(--primary)', marginBottom: 20, textAlign: 'center' }}>
        {lunchEmoji} - Hora de Comida
      </h2>

      {step === 'camera' ? (
        <>
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 12, textAlign: 'center' }}>
              {isCheckin
                ? 'Tómate una foto clara mostrando tu escritorio limpio y listo para el descanso'
                : 'Tómate una foto mostrando que comenzaste a laborar nuevamente'}
            </p>

            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: 'min(58vh, 420px)',
                borderRadius: 14,
                background: '#000',
                border: '1px solid rgba(31,137,252,0.18)',
                marginBottom: 16,
                objectFit: 'cover',
              }}
            />

            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              style={{ display: 'none' }}
            />

            {error && <div style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <button
                className="button-primary"
                onClick={capturePhoto}
                style={{ width: '100%', minHeight: 50, borderRadius: 12, fontWeight: 700, touchAction: 'manipulation' }}
              >
                📷 Capturar Foto
              </button>
              <button
                className="button-secondary"
                onClick={flipCamera}
                style={{ width: '100%', minHeight: 50, borderRadius: 12, fontWeight: 700, touchAction: 'manipulation' }}
              >
                🔄 Voltear cámara
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>Vista Previa</h3>
            {photoPreview && (
              <img
                src={photoPreview}
                alt="preview"
                style={{ width: '100%', borderRadius: 8, marginBottom: 16 }}
              />
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <button
              className="button-secondary"
              onClick={() => {
                setStep('camera');
                setPhoto(null);
                setPhotoPreview(null);
                setTimeout(() => initCamera(cameraFacing), 100);
              }}
              disabled={loading}
              style={{ minHeight: 50, borderRadius: 12, fontWeight: 700, touchAction: 'manipulation' }}
            >
              ↻ Nueva Foto
            </button>

            <button
              className="button-primary"
              onClick={handleSubmit}
              disabled={loading}
              style={{ minHeight: 50, borderRadius: 12, fontWeight: 700, touchAction: 'manipulation' }}
            >
              {loading ? 'Registrando...' : '✓ Confirmar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default LunchBreakForm;
