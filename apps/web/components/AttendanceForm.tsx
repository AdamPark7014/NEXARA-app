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
  const [history, setHistory] = useState<{ type: string; timestamp: string; photoUrl?: string }[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateInput(new Date()));
  const [rangeFrom, setRangeFrom] = useState<string>(() => getWeekRange().from);
  const [rangeTo, setRangeTo] = useState<string>(() => getWeekRange().to);
  const [rangeTotalMinutes, setRangeTotalMinutes] = useState<number>(0);
  const [rangeDays, setRangeDays] = useState<{ date: string; totalMinutes: number }[]>([]);
  
  // Camera states
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraType, setCameraType] = useState<'entrada' | 'salida' | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const gpsWatchIdRef = useRef<number | null>(null);
  const gpsLastSentRef = useRef<number>(0);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

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

  const openCamera = async (tipo: 'entrada' | 'salida') => {
    try {
      setCameraType(tipo);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
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

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
    setCameraType(null);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !cameraType) return;

    try {
      const context = canvasRef.current.getContext('2d');
      if (!context) return;

      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);

      const photoBase64 = canvasRef.current.toDataURL('image/jpeg', 0.8);
      console.log('📸 Foto capturada:', {
        type: cameraType,
        size: photoBase64.length,
        preview: photoBase64.substring(0, 50) + '...'
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
    const fetchDaySummary = async () => {
      try {
        const res = await fetch(buildApiUrl(`attendance/day?date=${selectedDate}`), {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (!res.ok) return;
        const day = await res.json();
        if (!day) {
          setTotalMinutes(0);
          setStartTime(null);
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

  useEffect(() => {
    if (startTime && isToday(selectedDate)) {
      setElapsed(Date.now() - startTime.getTime());
      intervalRef.current = setInterval(() => {
        setElapsed(Date.now() - startTime.getTime());
      }, 1000);
    } else {
      setElapsed(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [startTime, selectedDate]);

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
          setStartTime(new Date(data.day.lastEntryAt));
        } else {
          setStartTime(null);
        }
      } else if (tipo === 'entrada' && isToday(selectedDate)) {
        setStartTime(new Date());
      } else if (tipo === 'salida') {
        setStartTime(null);
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
          padding: 0,
          overflow: 'hidden',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 20, zIndex: 100000, position: 'relative' }}>
            <p style={{ color: 'white', fontSize: 20, marginBottom: 10, fontWeight: 'bold' }}>
              Toma foto de tu {cameraType === 'entrada' ? 'entrada' : 'salida'}
            </p>
          </div>
          <div style={{ 
            position: 'relative', 
            width: '100%', 
            height: '80%', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            backgroundColor: '#000',
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
          <div style={{ display: 'flex', gap: 16, marginTop: 20, zIndex: 100000, position: 'relative' }}>
            <button
              className="button-primary"
              onClick={capturePhoto}
              style={{ padding: '14px 28px', fontSize: 16, fontWeight: 'bold' }}
            >
              📸 Capturar foto
            </button>
            <button
              className="button-secondary"
              onClick={closeCamera}
              style={{ padding: '14px 28px', fontSize: 16, fontWeight: 'bold' }}
            >
              ✕ Cancelar
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Formulario Principal */}
      <div className="card" style={{ maxWidth: 400 }}>
        <h2 style={{ color: 'var(--primary)', marginBottom: 12 }}>Registro de Entrada/Salida</h2>
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: 'var(--muted)', fontSize: 13, display: 'block', marginBottom: 6 }}>Dia</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--muted)' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <button 
            className="button-secondary" 
            onClick={() => openCamera('entrada')} 
            disabled={loading || !!startTime || !isToday(selectedDate)}
            style={{ flex: 1 }}
          >
            Registrar Entrada del Día
          </button>
          <button 
            className="button-primary" 
            onClick={() => openCamera('salida')} 
            disabled={loading || !startTime || !isToday(selectedDate)}
            style={{ flex: 1 }}
          >
            Registrar Salida del Día
          </button>
        </div>
        {startTime && (
          <div style={{ marginBottom: 12, color: 'var(--primary)' }}>
            <strong>Tiempo transcurrido:</strong> {formatElapsed(elapsed)}
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
                <div key={`${item.type}-${item.timestamp}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text)' }}>
                  <span style={{ textTransform: 'capitalize' }}>{item.type}</span>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
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
