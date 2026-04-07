"use client";
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useUser } from './UserContext';
import styles from './AttendanceForm.module.css';
import { io, Socket } from 'socket.io-client';


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
  const STORAGE_KEY = user?.id ? `nexara_attendance_timer_${user.id}` : 'nexara_attendance_timer_guest';

  // Cargar timer persistente al montar y recuperar de localStorage (user-specific)
  useEffect(() => {
    if (!user?.id) {
      setStartTime(null);
      return;
    }
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
          }
        } else {
          // Si el timer es de otro día, limpiar localStorage
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [user?.id]);

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
          setError('No se pudo enviar la ubicación.');
        }
      },
      () => {
        setError('No se pudo obtener la ubicación. Revisa los permisos.');
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

  const refreshSelectedDateAttendance = useCallback(async () => {
    if (!user) return;

    if (!isToday(selectedDate)) {
      setStartTime(null);
      localStorage.removeItem(STORAGE_KEY);
    }

    try {
      const [dayRes, historyRes] = await Promise.all([
        fetch(buildApiUrl(`attendance/day?date=${selectedDate}`), {
          headers: { Authorization: `Bearer ${user.token}` },
        }),
        fetch(buildApiUrl(`attendance/history?date=${selectedDate}`), {
          headers: { Authorization: `Bearer ${user.token}` },
        }),
      ]);

      if (dayRes.ok) {
        const day = await dayRes.json();
        if (!day) {
          setTotalMinutes(0);
          setStartTime(null);
          localStorage.removeItem(STORAGE_KEY);
        } else {
          setTotalMinutes(day.totalMinutes || 0);
          if (isToday(selectedDate) && day.isOpen && day.lastEntryAt) {
            setStartTime(new Date(day.lastEntryAt));
          } else {
            setStartTime(null);
          }
        }
      }

      if (historyRes.ok) {
        const list = await historyRes.json();
        if (Array.isArray(list)) setHistory(list);
      }
    } catch {
      // No interrumpir la UI si falla la consulta
    }
  }, [user, selectedDate]);

  useEffect(() => {
    refreshSelectedDateAttendance();
  }, [refreshSelectedDateAttendance]);

  useEffect(() => {
    if (!user?.token) return;

    const socketUrl = API_URL.replace(/\/+api\/?$/, '');
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshSelectedDateAttendance();
      }, 300);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['Attendance', 'AttendanceDay'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, API_URL, refreshSelectedDateAttendance]);

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
          if (typeof latitude === 'number' && typeof longitude === 'number') {
            await sendGpsLocation({ latitud: latitude, longitud: longitude, velocidadKmh: null });
          }
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
      // Si el intento de salida falló (sin entrada abierta), limpiar timer fantasma
      if (tipo === 'salida') {
        setStartTime(null);
        localStorage.removeItem(STORAGE_KEY);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.root}>
      {/* Modal de Cámara */}
      {cameraOpen && typeof window !== 'undefined' && createPortal(
        <div className={styles.modalOverlay}>
          <div className={styles.modalHeader}>
            <p className={styles.modalTitle}>
              Toma foto de tu {cameraType === 'entrada' ? 'entrada' : 'salida'}
            </p>
            <p className={styles.modalSubtitle}>
              Ajuste móvil optimizado para captura rápida y táctil
            </p>
          </div>
          <div className={styles.videoWrap}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={styles.video}
            />
          </div>
          <canvas ref={canvasRef} className={styles.hiddenCanvas} />
          <div className={styles.cameraActions}>
            <button
              className={`button-secondary ${styles.cameraButton}`}
              onClick={flipCamera}
            >
              🔄 Voltear
            </button>
            <button
              className={`button-primary ${styles.cameraButton} ${styles.captureButton}`}
              onClick={capturePhoto}
            >
              📸 Capturar
            </button>
            <button
              className={`button-secondary ${styles.cameraButton}`}
              onClick={closeCamera}
            >
              ✕ Cancelar
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Formulario Principal */}
      <div className={`card ${styles.card}`}>
        <h2 className={styles.title}>Registro de Entrada/Salida</h2>
        <div className={styles.fieldBlock}>
          <label className={styles.label}>Dia</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            disabled={isToday(selectedDate)}
            max={toLocalDateInput(new Date())}
            className={`${styles.dateInput} ${isToday(selectedDate) ? styles.dateInputDisabled : ''}`}
            title={isToday(selectedDate) ? 'No puedes cambiar la fecha de hoy' : ''}
          />
        </div>
        <div className={`${styles.actionsRow} ${isMobile ? styles.actionsRowMobile : ''}`}>
          {/* Botón entrada - deshabilitado si ya hay entrada o si no es hoy */}
          <button 
            className={`button-secondary ${styles.flexGrow} ${(loading || !!startTime || !isToday(selectedDate) || history.some(h => h.type === 'entrada')) ? styles.btnDisabledVisual : ''}`} 
            onClick={() => openCamera('entrada')} 
            disabled={loading || !!startTime || !isToday(selectedDate) || history.some(h => h.type === 'entrada')}
            title={history.some(h => h.type === 'entrada') ? 'Ya has registrado entrada hoy' : ''}
          >
            Registrar Entrada del Día
          </button>
          {/* Botón salida - deshabilitado si no hay entrada o si ya hay salida */}
          <button 
            className={`button-primary ${styles.flexGrow} ${(loading || !startTime || !isToday(selectedDate) || history.some(h => h.type === 'salida')) ? styles.btnDisabledVisual : ''}`} 
            onClick={() => openCamera('salida')} 
            disabled={loading || !startTime || !isToday(selectedDate) || history.some(h => h.type === 'salida')}
            title={!startTime ? 'Debes registrar entrada primero' : (history.some(h => h.type === 'salida') ? 'Ya has registrado salida hoy' : '')}
          >
            Registrar Salida del Día
          </button>
        </div>
        {startTime && (
          <div className={styles.elapsed}>
            <strong>Tiempo transcurrido:</strong> {formatElapsed(elapsed)}
          </div>
        )}
        {isToday(selectedDate) && history.some(h => h.type === 'entrada') && !history.some(h => h.type === 'salida') && (
          <div className={styles.infoAlert}>
            ✓ <strong>Entrada registrada.</strong> Estás dentro. Solo puedes registrar salida.
          </div>
        )}
        {isToday(selectedDate) && history.some(h => h.type === 'entrada') && history.some(h => h.type === 'salida') && (
          <div className={styles.successAlert}>
            ✓ <strong>Jornada completada.</strong> Entrada y salida registradas. No puedes registrar más.
          </div>
        )}
        {(totalMinutes > 0 || startTime) && (
          <div className={styles.totalDay}>
            <strong>Total del dia:</strong> {formatTotal(totalMinutes + Math.floor(elapsed / 60000))}
          </div>
        )}
        {status && <p className={styles.statusText}>{status}</p>}
        {error && <p className={styles.errorText}>{error}</p>}
        {history.length > 0 && (
          <div className={styles.historySection}>
            <div className={styles.sectionLabel}><strong>Historial del dia</strong></div>
            <div className={styles.historyList}>
              {history.map((item, index) => (
                <div key={`${item.type}-${item.timestamp}-${index}`} className={styles.historyItem}>
                  <span className={styles.historyType}>{item.type}</span>
                  <span className={styles.deviceInfo}>
                    {item.deviceInfo || 'Dispositivo no disponible'}
                  </span>
                  <span className={styles.mutedText}>{formatTime(item.timestamp)}</span>
                  {item.photoUrl && (
                    <img 
                      src={item.photoUrl} 
                      alt="foto" 
                      className={styles.historyPhoto}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className={styles.rangeSection}>
          <div className={styles.sectionLabel}><strong>Resumen por rango</strong></div>
          <div className={styles.quickRangeButtons}>
            <button className="button-secondary" type="button" onClick={() => { const r = getWeekRange(); setRangeFrom(r.from); setRangeTo(r.to); }}>Semana actual</button>
            <button className="button-secondary" type="button" onClick={() => { const r = getMonthRange(); setRangeFrom(r.from); setRangeTo(r.to); }}>Mes actual</button>
          </div>
          <div className={`${styles.rangeGrid} ${isMobile ? styles.rangeGridMobile : ''}`}>
            <input
              type="date"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className={styles.rangeInput}
            />
            <input
              type="date"
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className={styles.rangeInput}
            />
          </div>
          <div className={`${styles.mutedText} ${styles.fieldBlock}`}>
            <strong>Total rango:</strong> {formatTotal(rangeTotalMinutes)}
          </div>
          {rangeDays.length > 0 && (
            <div className={styles.rangeDaysList}>
              {rangeDays.map((day) => (
                <div key={day.date} className={styles.rangeDayItem}>
                  <span>{formatDate(day.date)}</span>
                  <span className={styles.mutedText}>{formatTotal(day.totalMinutes)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendanceForm;

