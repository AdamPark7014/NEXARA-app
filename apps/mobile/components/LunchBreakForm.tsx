"use client";
import React, { useState, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { useLunchBreakNotifications } from '@/lib/notifications';
import styles from './LunchBreakForm.module.css';

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
  const [isMobile, setIsMobile] = useState(false);
  const [isSmallMobile, setIsSmallMobile] = useState(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
    const [useFileFallback, setUseFileFallback] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
    setCameraPermissionDenied(false);
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setUseFileFallback(true);
        return;
      }
      try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      setError(null);
      setCameraFacing(facingMode);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: unknown) {
      const name = err instanceof Error ? (err as { name?: string }).name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraPermissionDenied(true);
        setError(null);
      } else {
          setUseFileFallback(true);
      }
    }
  };

  const flipCamera = async () => {
  const handleFileCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blob = new Blob([file], { type: file.type });
    const url = URL.createObjectURL(blob);
    setPhoto(blob);
    setPhotoPreview(url);
    setStep('confirmation');
    e.target.value = '';
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
          method: isCheckin ? 'POST' : 'PUT',
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

  React.useEffect(() => {
    if (!user) return;

    const socketUrl = (process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
    const socket: Socket = io(socketUrl, {
      auth: { token: user.token },
      transports: ['websocket', 'polling'],
    });

    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
    const onEntityUpdated = (event: { model?: string; entity?: { userId?: number | string }; entityId?: number | string }) => {
      const normalizedModel = event?.model?.toLowerCase();
      if (normalizedModel !== 'lunchbreak') return;
      const eventUserId = event.entity?.userId;
      if (eventUserId !== undefined && Number(eventUserId) !== Number(user.id)) return;

      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 350);
    };

    socket.on('entity:updated', onEntityUpdated);

    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      socket.off('entity:updated', onEntityUpdated);
      socket.disconnect();
    };
  }, [onSuccess, user]);

  React.useEffect(() => {
    const updateViewport = () => {
      if (typeof window === 'undefined') return;
      setIsMobile(window.innerWidth <= 640);
      setIsSmallMobile(window.innerWidth <= 430);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const lunchStatus = isCheckin ? 'De Entrada a Comida' : 'De Regreso al Trabajo';
  const lunchEmoji = isCheckin ? '🍽️ Entrada' : '✅ Regreso';

  return (
    <div className={`card ${styles.cardWrap} ${isMobile ? styles.cardWrapMobile : ''}`}>
      <h2 className={styles.title}>
        {lunchEmoji} - Hora de Comida
      </h2>

      {step === 'camera' ? (
        <>
          <div className={styles.cameraSection}>
            <p className={styles.subtitle}>
              {isCheckin
                ? 'Tómate una foto clara mostrando tu escritorio limpio y listo para el descanso'
                : 'Tómate una foto mostrando que comenzaste a laborar nuevamente'}
            </p>

            {cameraPermissionDenied ? (
              <div className={styles.permissionDenied}>
                <p className={styles.permissionIcon}>📷</p>
                <p className={styles.permissionTitle}>Permiso de cámara requerido</p>
                <p className={styles.permissionText}>
                  Para registrar tu hora de comida necesitas permitir el acceso a la cámara.
                </p>
                <button
                  className={`button-primary ${styles.captureBtn}`}
                  type="button"
                  onClick={() => initCamera()}
                >
                  Permitir cámara
                </button>
                <p className={styles.permissionHint}>
                  Si ya denegaste el permiso, ve a Configuración del dispositivo → Aplicaciones → Nexara → Permisos → Cámara → Permitir.
                </p>
              </div>
            ) : (
              ) : useFileFallback ? (
                <div className={styles.permissionDenied}>
                  <p className={styles.permissionIcon}>📷</p>
                  <p className={styles.permissionTitle}>Usar cámara del dispositivo</p>
                  <p className={styles.permissionText}>
                    Toca el botón para abrir la cámara y tomar la foto.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handleFileCapture}
                  />
                  <button
                    className={`button-primary ${styles.captureBtn}`}
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    📷 Tomar Foto
                  </button>
                </div>
              ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`${styles.video} ${isMobile ? styles.videoMobile : ''}`}
                />

                <canvas
                  ref={canvasRef}
                  width={640}
                  height={480}
                  className={styles.hiddenCanvas}
                />

                {error && <div className={styles.errorText}>{error}</div>}

                <div
                  className={`${styles.captureActions} ${isMobile ? styles.captureActionsMobile : ''} ${isSmallMobile ? styles.captureActionsSmall : ''}`}
                >
                  <button
                    className={`button-primary ${styles.captureBtn} ${isMobile ? styles.captureBtnMobile : ''} ${isSmallMobile ? styles.captureBtnSmall : ''}`}
                    type="button"
                    onClick={capturePhoto}
                  >
                    📷 Capturar Foto
                  </button>
              <button
                className={`button-secondary ${styles.captureBtn} ${isMobile ? styles.captureBtnMobile : ''} ${isSmallMobile ? styles.captureBtnSmall : ''}`}
                type="button"
                onClick={flipCamera}
              >
                🔄 Voltear
              </button>
            </div>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div className={styles.previewSection}>
            <h3 className={styles.previewTitle}>Vista Previa</h3>
            {photoPreview && (
              <img
                src={photoPreview}
                alt="preview"
                className={styles.previewImage}
              />
            )}
          </div>

          <div className={`${styles.confirmActions} ${isMobile ? styles.confirmActionsMobile : ''}`}>
            <button
              className={`button-secondary ${styles.confirmBtn} ${isMobile ? styles.confirmBtnMobile : ''}`}
              type="button"
              onClick={() => {
                setStep('camera');
                setPhoto(null);
                setPhotoPreview(null);
                setTimeout(() => initCamera(cameraFacing), 100);
              }}
              disabled={loading}
            >
              ↻ Nueva Foto
            </button>

            <button
              className={`button-primary ${styles.confirmBtn} ${isMobile ? styles.confirmBtnMobile : ''}`}
              type="button"
              onClick={handleSubmit}
              disabled={loading}
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
