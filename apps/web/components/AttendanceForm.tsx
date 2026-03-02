"use client";
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useUser } from './UserContext';


const AttendanceForm = () => {
  const { user } = useUser();
  const toLocalDateInput = (date: Date) => date.toLocaleDateString('sv-SE');
  const getWeekRange = () => {
    const now = new Date();
    const day = (now.getDay() + 6) % 7; // lunes = 0
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { from: toLocalDateInput(start), to: toLocalDateInput(end) };
  };
  const getMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { from: toLocalDateInput(start), to: toLocalDateInput(end) };
  };

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState<number>(0);
  const [totalMinutes, setTotalMinutes] = useState<number>(0);
  const [history, setHistory] = useState<{ type: string; timestamp: string; photoUrl?: string; deviceInfo?: string | null }[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateInput(new Date()));
  const [rangeFrom, setRangeFrom] = useState<string>(() => getWeekRange().from);
  const [rangeTo, setRangeTo] = useState<string>(() => getWeekRange().to);
  const [rangeTotalMinutes, setRangeTotalMinutes] = useState<number>(0);
  const [rangeDays, setRangeDays] = useState<{ date: string; totalMinutes: number }[]>([]);
  
  // Camera states
  const [cameraOpen, setCameraOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [cameraType, setCameraType] = useState<'entrada' | 'salida' | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const gpsWatchIdRef = useRef<number | null>(null);
  const gpsLastSentRef = useRef<number>(0);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const STORAGE_KEY = 'nexara_attendance_timer';

  // Cargar timer persistente al montar y recuperar de localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const { startTimeStr, date } = JSON.parse(stored);
        const today = toLocalDateKey(new Date());
        
        // Solo restaurar si el timer es del día de hoy
        if (date === today || !date) {
          const recoveredStartTime = new Date(startTimeStr);
          if (!Number.isNaN(recoveredStartTime.getTime())) {
            setStartTime(recoveredStartTime);
            console.log('⏱️ Timer recuperado de localStorage:', startTimeStr);
          }
        } else {
          // Si el timer es de otro día, limpiar localStorage
          localStorage.removeItem(STORAGE_KEY);
          console.log('🧹 Timer de otro día detectado y limpiado');
        }
      } catch (err) {
        console.error('Error recuperando timer:', err);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const sync = () => setIsMobile(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

  // Actualizar contador cada segundo si hay entrada activa
  useEffect(() => {
    if (!startTime) {
      setElapsed(0);
      return;
    }

    const updateElapsed = () => {
      const now = new Date();
      const diff = now.getTime() - startTime.getTime();
      setElapsed(Math.max(0, diff));
    };

    updateElapsed(); // Actualizar inmediatamente
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [startTime]);
  // Formato HH:mm:ss
  const formatElapsed = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  // Formato HH:mm para total diario
  const formatTotal = (minutes: number) => {
    const hours = Math.floor(minutes / 60).toString().padStart(2, '0');
    const mins = Math.floor(minutes % 60).toString().padStart(2, '0');
    return `${hours}:${mins}`;
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  };

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const openCamera = async (tipo: 'entrada' | 'salida', facingMode: 'environment' | 'user' = cameraFacing) => {
    try {
      setCameraType(tipo);
      setCameraFacing(facingMode);
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
      });
      streamRef.current = stream;
      setCameraOpen(true);
      
      // Esperar a que React actualice el DOM antes de asignar el stream
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          console.log('✅ Stream de cámara asignado al video element');
        }
      }, 100);
    } catch (err) {
      console.error('❌ Error al acceder a la cámara:', err);
      setError('No se pudo acceder a la cámara. Verifica los permisos.');
      setCameraOpen(false);
    }
  };

  const flipCamera = async () => {
    if (!cameraType) return;
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    await openCamera(cameraType, nextFacing);
  };

  const closeCamera = () => {
    stopCameraStream();
    setCameraOpen(false);
    setCameraType(null);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !cameraType) return;

    try {
      const context = canvasRef.current.getContext('2d');
      if (!context) return;

      // Obtener dimensiones del video y reducirlas para compresión
      const videoWidth = videoRef.current.videoWidth;
      const videoHeight = videoRef.current.videoHeight;
      
      // Reducir a máximo 640x480 manteniendo aspecto
      const maxWidth = 640;
      const maxHeight = 480;
      let destWidth = videoWidth;
      let destHeight = videoHeight;
      
      if (destWidth > maxWidth) {
        destHeight = (destHeight * maxWidth) / destWidth;
        destWidth = maxWidth;
      }
      if (destHeight > maxHeight) {
        destWidth = (destWidth * maxHeight) / destHeight;
        destHeight = maxHeight;
      }

      canvasRef.current.width = Math.floor(destWidth);
      canvasRef.current.height = Math.floor(destHeight);
      context.drawImage(videoRef.current, 0, 0, destWidth, destHeight);

      // Usar calidad baja (0.4 = 40% de calidad) para reducir tamaño
      const photoBase64 = canvasRef.current.toDataURL('image/jpeg', 0.4);
      console.log('📸 Foto capturada y comprimida:', {
        type: cameraType,
        originalSize: videoWidth + 'x' + videoHeight,
        compressedSize: destWidth + 'x' + destHeight,
        base64Length: photoBase64.length,
        dataSize: (photoBase64.length / 1024).toFixed(2) + ' KB',
      });
      closeCamera();

      // Registrar con foto
      await handleRegister(cameraType, photoBase64);
    } catch (err) {
      console.error('❌ Error al capturar foto:', err);
      setError('No se pudo capturar la foto');
    }
  };

  const sendGpsLocation = async (payload: { latitud: number; longitud: number; velocidadKmh?: number | null }) => {
    if (!user?.token) return;
    const now = Date.now();
    if (now - gpsLastSentRef.current < 4000) return;
    gpsLastSentRef.current = now;
    await fetch(buildApiUrl('gps'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        ...payload,
        estaActivo: true,
        ultimaActualizacion: new Date().toISOString(),
      }),
    });
  };

  const updateGpsConsent = async (enabled: boolean) => {
    if (!user?.token) return;
    const res = await fetch(buildApiUrl('gps/consent'), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || 'No se pudo actualizar el consentimiento de GPS');
    }
  };

  const dispatchGpsConsent = (enabled: boolean) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('gps:consent', { detail: { enabled } }));
  };

  const startGpsTracking = () => {
    if (!navigator.geolocation) {
      setError('Tu navegador no soporta geolocalizacion.');
      return;
    }
    if (gpsWatchIdRef.current !== null) return;

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const payload = {
          latitud: pos.coords.latitude,
          longitud: pos.coords.longitude,
          velocidadKmh: pos.coords.speed ? pos.coords.speed * 3.6 : null,
        };
        try {
          await sendGpsLocation(payload);
        } catch {
          setError('No se pudo enviar la ubicacion.');
        }
      },
      () => {
        setError('No se pudo obtener la ubicacion. Revisa los permisos.');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  };

  const stopGpsTracking = () => {
    if (gpsWatchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
  };

  const toLocalDateKey = (value: Date) => value.toLocaleDateString('sv-SE');

  const isToday = (dateStr: string) => {
    const today = toLocalDateKey(new Date());
    return dateStr === today;
  };

  useEffect(() => {
    if (!user) return;
    
    // Si cambio a un día que no es hoy, limpiar el timer
    if (!isToday(selectedDate)) {
      setStartTime(null);
      localStorage.removeItem(STORAGE_KEY);
    }
    
    const fetchDaySummary = async () => {
      try {
        const res = await fetch(buildApiUrl(`attendance/day?date=${selectedDate}`), {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (!res.ok) return;
        const day = await res.json();
        if (!day) {
          setTotalMinutes(0);
          if (!isToday(selectedDate)) setStartTime(null);
          return;
        }
        setTotalMinutes(day.totalMinutes || 0);
        if (isToday(selectedDate) && day.isOpen && day.lastEntryAt) {
          setStartTime(new Date(day.lastEntryAt));
        } else {
          setStartTime(null);
        }
      } catch {
        // No interrumpir la UI si falla la consulta
      }
    };
    const fetchHistory = async () => {
      try {
        const res = await fetch(buildApiUrl(`attendance/history?date=${selectedDate}`), {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (!res.ok) return;
        const list = await res.json();
        if (Array.isArray(list)) setHistory(list);
      } catch {
        // No interrumpir la UI si falla la consulta
      }
    };
    fetchDaySummary();
    fetchHistory();
  }, [user, selectedDate]);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const fetchRange = async () => {
      try {
        const res = await fetch(buildApiUrl(`attendance/range?from=${rangeFrom}&to=${rangeTo}`), {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setRangeTotalMinutes(data.totalMinutes || 0);
        if (Array.isArray(data.days)) setRangeDays(data.days);
      } catch {
        // No interrumpir la UI si falla la consulta
      }
    };
    fetchRange();
  }, [user, rangeFrom, rangeTo]);

  // Cleanup GPS tracking en desmontaje
  useEffect(() => () => stopGpsTracking(), []);

  const handleRegister = async (tipo: 'entrada' | 'salida', photoBase64?: string) => {
    setStatus(null);
    setError(null);
    if (!user) {
      setError('Usuario no autenticado');
      return;
    }
    setLoading(true);
    try {
      // Obtener ubicación GPS actual
      let latitude: number | undefined;
      let longitude: number | undefined;
      
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { 
              enableHighAccuracy: true, 
              timeout: 5000 
            });
          });
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
          console.log('📍 GPS obtenido:', { latitude, longitude });
        } catch (gpsErr) {
          // Si no puede obtener GPS, continúa sin él
          console.warn('⚠️ No se pudo obtener ubicación GPS:', gpsErr);
        }
      }

      const payload = { 
        type: tipo, 
        timestamp: new Date().toISOString(),
        photoBase64: photoBase64 || undefined,
        latitude,
        longitude,
      };

      console.log('📤 Enviando registro de asistencia:', {
        type: tipo,
        hasPhoto: !!photoBase64,
        photoSize: photoBase64?.length || 0,
        hasGPS: !!(latitude && longitude),
      });

      const res = await fetch(buildApiUrl('attendance'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      
      console.log('📥 Respuesta del servidor:', data);
      
      if (!res.ok) {
        throw new Error(data.message || 'Error al registrar asistencia');
      }

      if (tipo === 'entrada') {
        setStatus('✓ Entrada registrada correctamente. Compartiendo ubicación...');
        try {
          await updateGpsConsent(true);
          startGpsTracking();
          dispatchGpsConsent(true);
        } catch (gpsErr) {
          setError(gpsErr instanceof Error ? gpsErr.message : 'No se pudo activar el GPS');
        }
      } else {
        setStatus('✓ Salida registrada correctamente. Se detuvo el compartir ubicación.');
        stopGpsTracking();
        try {
          await updateGpsConsent(false);
          dispatchGpsConsent(false);
        } catch (gpsErr) {
          setError(gpsErr instanceof Error ? gpsErr.message : 'No se pudo desactivar el GPS');
        }
      }

      if (data.day) {
        setTotalMinutes(data.day.totalMinutes || 0);
        if (isToday(selectedDate) && data.day.isOpen && data.day.lastEntryAt) {
          const newStartTime = new Date(data.day.lastEntryAt);
          setStartTime(newStartTime);
          // Guardar en localStorage para persistencia
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            startTimeStr: newStartTime.toISOString(),
            date: selectedDate,
          }));
          console.log('💾 Timer guardado en localStorage:', newStartTime.toISOString());
        } else {
          setStartTime(null);
          localStorage.removeItem(STORAGE_KEY);
          console.log('🧹 Timer limpiado de localStorage');
        }
      } else if (tipo === 'entrada' && isToday(selectedDate)) {
        const newStartTime = new Date();
        setStartTime(newStartTime);
        // Guardar en localStorage para persistencia
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          startTimeStr: newStartTime.toISOString(),
          date: selectedDate,
        }));
        console.log('💾 Timer guardado en localStorage:', newStartTime.toISOString());
      } else if (tipo === 'salida') {
        setStartTime(null);
        localStorage.removeItem(STORAGE_KEY);
        console.log('🧹 Timer limpiado de localStorage (salida registrada)');
      }

      // Refrescar historial
      const historyRes = await fetch(buildApiUrl(`attendance/history?date=${selectedDate}`), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (historyRes.ok) {
        const list = await historyRes.json();
        if (Array.isArray(list)) setHistory(list);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error desconocido');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Modal de Cámara */}
      {cameraOpen && typeof window !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.95)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 99999,
          padding: '10px 8px',
          overflow: 'hidden',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 12, zIndex: 100000, position: 'relative', width: '100%' }}>
            <p style={{ color: 'white', fontSize: 'clamp(16px, 4vw, 20px)', marginBottom: 6, fontWeight: 'bold' }}>
              Toma foto de tu {cameraType === 'entrada' ? 'entrada' : 'salida'}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, margin: 0 }}>
              Ajuste móvil optimizado para captura rápida y táctil
            </p>
          </div>
          <div style={{ 
            position: 'relative', 
            width: '100%',
            maxWidth: '920px',
            height: 'calc(100dvh - 190px)',
            minHeight: '320px',
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            backgroundColor: '#000',
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.15)',
          }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </div>
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 16, zIndex: 100000, position: 'relative', width: 'min(100%, 920px)', justifyItems: 'stretch' }}>
            <button
              className="button-secondary"
              onClick={flipCamera}
              style={{
                minHeight: 52,
                padding: '14px 12px',
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 12,
                touchAction: 'manipulation',
                WebkitAppearance: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
              onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
              onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              🔄 Voltear
            </button>
            <button
              className="button-primary"
              onClick={capturePhoto}
              style={{
                minHeight: 52,
                padding: '14px 12px',
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 12,
                touchAction: 'manipulation',
                WebkitAppearance: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                gridColumn: window.innerWidth < 480 ? 'span 2' : 'span 1',
              }}
              onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
              onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              📸 Capturar
            </button>
            <button
              className="button-secondary"
              onClick={closeCamera}
              style={{
                minHeight: 52,
                padding: '14px 12px',
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 12,
                touchAction: 'manipulation',
                WebkitAppearance: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
              onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
              onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              ✕ Cancelar
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Formulario Principal */}
      <div className="card" style={{ maxWidth: 400, width: '100%' }}>
        <h2 style={{ color: 'var(--primary)', marginBottom: 12 }}>Registro de Entrada/Salida</h2>
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: 'var(--muted)', fontSize: 13, display: 'block', marginBottom: 6 }}>Dia</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            disabled={isToday(selectedDate)}
            max={toLocalDateInput(new Date())}
            style={{ 
              width: '100%', 
              padding: '8px 10px', 
              borderRadius: 8, 
              border: '1px solid var(--muted)',
              opacity: isToday(selectedDate) ? 0.6 : 1,
              cursor: isToday(selectedDate) ? 'not-allowed' : 'pointer',
            }}
            title={isToday(selectedDate) ? 'No puedes cambiar la fecha de hoy' : ''}
          />
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          {/* Botón entrada - deshabilitado si ya hay entrada o si no es hoy */}
          <button 
            className="button-secondary" 
            onClick={() => openCamera('entrada')} 
            disabled={loading || !!startTime || !isToday(selectedDate) || history.some(h => h.type === 'entrada')}
            style={{ 
              flex: 1,
              opacity: (loading || !!startTime || !isToday(selectedDate) || history.some(h => h.type === 'entrada')) ? 0.5 : 1,
            }}
            title={history.some(h => h.type === 'entrada') ? 'Ya has registrado entrada hoy' : ''}
          >
            Registrar Entrada del Día
          </button>
          {/* Botón salida - deshabilitado si no hay entrada o si ya hay salida */}
          <button 
            className="button-primary" 
            onClick={() => openCamera('salida')} 
            disabled={loading || !startTime || !isToday(selectedDate) || history.some(h => h.type === 'salida')}
            style={{ 
              flex: 1,
              opacity: (loading || !startTime || !isToday(selectedDate) || history.some(h => h.type === 'salida')) ? 0.5 : 1,
            }}
            title={!startTime ? 'Debes registrar entrada primero' : (history.some(h => h.type === 'salida') ? 'Ya has registrado salida hoy' : '')}
          >
            Registrar Salida del Día
          </button>
        </div>
        {startTime && (
          <div style={{ marginBottom: 12, color: 'var(--primary)' }}>
            <strong>Tiempo transcurrido:</strong> {formatElapsed(elapsed)}
          </div>
        )}
        {isToday(selectedDate) && history.some(h => h.type === 'entrada') && !history.some(h => h.type === 'salida') && (
          <div style={{ marginBottom: 12, padding: 8, backgroundColor: 'rgba(var(--primary-rgb), 0.1)', borderRadius: 6, color: 'var(--primary)' }}>
            ✓ <strong>Entrada registrada.</strong> Estás dentro. Solo puedes registrar salida.
          </div>
        )}
        {isToday(selectedDate) && history.some(h => h.type === 'entrada') && history.some(h => h.type === 'salida') && (
          <div style={{ marginBottom: 12, padding: 8, backgroundColor: 'rgba(var(--accent-rgb), 0.1)', borderRadius: 6, color: 'var(--accent)' }}>
            ✓ <strong>Jornada completada.</strong> Entrada y salida registradas. No puedes registrar más.
          </div>
        )}
        {(totalMinutes > 0 || startTime) && (
          <div style={{ marginBottom: 12, color: 'var(--muted)' }}>
            <strong>Total del dia:</strong> {formatTotal(totalMinutes + Math.floor(elapsed / 60000))}
          </div>
        )}
        {history.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: 'var(--muted)', marginBottom: 6 }}><strong>Historial del dia</strong></div>
            <div style={{ display: 'grid', gap: 6 }}>
              {history.map((item, index) => (
                <div key={`${item.type}-${item.timestamp}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text)', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ textTransform: 'capitalize' }}>{item.type}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12, minWidth: 190 }}>
                    {item.deviceInfo || 'Dispositivo no disponible'}
                  </span>
                  <span style={{ color: 'var(--muted)' }}>{formatTime(item.timestamp)}</span>
                  {item.photoUrl && (
                    <img 
                      src={item.photoUrl} 
                      alt="foto" 
                      style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--muted)' }}>
          <div style={{ color: 'var(--muted)', marginBottom: 6 }}><strong>Resumen por rango</strong></div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button className="button-secondary" type="button" onClick={() => { const r = getWeekRange(); setRangeFrom(r.from); setRangeTo(r.to); }}>Semana actual</button>
            <button className="button-secondary" type="button" onClick={() => { const r = getMonthRange(); setRangeFrom(r.from); setRangeTo(r.to); }}>Mes actual</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input
              type="date"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--muted)' }}
            />
            <input
              type="date"
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--muted)' }}
            />
          </div>
          <div style={{ color: 'var(--muted)', marginBottom: 8 }}>
            <strong>Total rango:</strong> {formatTotal(rangeTotalMinutes)}
          </div>
          {rangeDays.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              {rangeDays.map((day) => (
                <div key={day.date} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text)' }}>
                  <span>{formatDate(day.date)}</span>
                  <span style={{ color: 'var(--muted)' }}>{formatTotal(day.totalMinutes)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {status && <p style={{ color: 'var(--accent)' }}>{status}</p>}
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>
    </div>
  );
};

export default AttendanceForm;
