"use client";
import { buildApiUrl, getSocketBaseUrl, parseResponseJson } from "@/lib/api-base";
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useUser } from './UserContext';
import styles from './AttendanceForm.module.css';
import { Socket } from 'socket.io-client';
import { createRealtimeSocket } from '@/lib/realtime-socket';
import type { FaltaJustificada } from '@/lib/attendance-justifications';
import { checadaDelTipo, type ChecadaValidable } from '@/lib/attendance-validacion';
import { attendanceMapUrl } from '@/lib/gps-map-links';
import { esFinDeSemanaISO, fetchGuardias } from '@/lib/guardias-api';
import { Alert, Badge, Button, DateInput } from '@/components/base';
import { duracionCorta, horaCorta, minutosCortos } from '@/components/asistencias/formato';
import rec from '@/components/asistencias/recorrido.module.css';
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { fallaDeGeolocalizacion } from '@/lib/attendance-validacion';

/** Lo que trae `attendance/history` de cada checada: hora, foto, punto y marcas del servidor. */
type ChecadaDelDia = ChecadaValidable & {
  type: string;
  timestamp: string;
  photoUrl?: string;
  deviceInfo?: string | null;
  entryLatitude?: unknown;
  entryLongitude?: unknown;
  exitLatitude?: unknown;
  exitLongitude?: unknown;
};

/** Mismo texto que manda el servidor al rechazar una entrada de fin de semana sin guardia. */
const AVISO_FIN_DE_SEMANA = 'Hoy es fin de semana: solo quien tiene guardia puede checar. Pide a tu encargado que te programe.';

const AttendanceForm = ({ compact = false }: { compact?: boolean }) => {
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
  const [openSession, setOpenSession] = useState<{ lastEntryAt: string } | null>(null);
  const [history, setHistory] = useState<ChecadaDelDia[]>([]);
  /** Sábado o domingo: ¿tengo guardia hoy? `null` = no aplica o no se pudo saber. */
  const [sinGuardiaHoy, setSinGuardiaHoy] = useState<boolean | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateInput(new Date()));
  const [rangeFrom, setRangeFrom] = useState<string>(() => getWeekRange().from);
  const [rangeTo, setRangeTo] = useState<string>(() => getWeekRange().to);
  const [rangeTotalMinutes, setRangeTotalMinutes] = useState<number>(0);
  const [rangeDays, setRangeDays] = useState<{ date: string; totalMinutes: number }[]>([]);
  /** Días sin checada que Christian justificó (se muestran aparte: no suman horas). */
  const [rangeFaltas, setRangeFaltas] = useState<FaltaJustificada[]>([]);
  
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
    // Sin segundos en pantalla: basta con avanzar cada 15 s.
    const interval = setInterval(updateElapsed, 15_000);

    return () => clearInterval(interval);
  }, [startTime]);
  // «6 h 41» · «41 min» (sin segundos: el número ya no tiembla).
  const formatElapsed = (ms: number) => duracionCorta(ms);

  // Totales que llegan en minutos.
  const formatTotal = (minutes: number) => minutosCortos(minutes);

  // «8:02 a.m.»
  const formatTime = (iso: string) => {
    const hora = horaCorta(iso);
    return hora === '—' ? '' : hora;
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
    const res = await fetch(buildApiUrl('gps'), {
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
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = Array.isArray(data.message) ? data.message.join(' ') : data.message;
      throw new Error(msg || 'No se pudo enviar la ubicación GPS');
    }
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
      const [dayRes, historyRes, currentRes] = await Promise.all([
        fetch(buildApiUrl(`attendance/day?date=${selectedDate}`), {
          headers: { Authorization: `Bearer ${user.token}` },
        }),
        fetch(buildApiUrl(`attendance/history?date=${selectedDate}`), {
          headers: { Authorization: `Bearer ${user.token}` },
        }),
        fetch(buildApiUrl('attendance/current'), {
          headers: { Authorization: `Bearer ${user.token}` },
        }),
      ]);

      let activeOpen: { lastEntryAt: string } | null = null;
      if (currentRes.ok) {
        const current = await parseResponseJson<{
          isOpen?: boolean;
          lastEntryAt?: string | null;
        }>(currentRes);
        if (current?.isOpen && current.lastEntryAt) {
          activeOpen = { lastEntryAt: current.lastEntryAt };
        }
      }
      setOpenSession(activeOpen);

      if (dayRes.ok) {
        const day = await parseResponseJson<{
          totalMinutes?: number;
          isOpen?: boolean;
          lastEntryAt?: string | null;
        }>(dayRes);
        if (!day) {
          setTotalMinutes(0);
        } else {
          setTotalMinutes(day.totalMinutes || 0);
        }
      }

      if (activeOpen && isToday(selectedDate)) {
        const entryTime = new Date(activeOpen.lastEntryAt);
        setStartTime(entryTime);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          startTimeStr: entryTime.toISOString(),
          date: toLocalDateKey(new Date()),
        }));
      } else if (!activeOpen) {
        setStartTime(null);
        localStorage.removeItem(STORAGE_KEY);
      }

      if (historyRes.ok) {
        const list = await parseResponseJson<ChecadaDelDia[]>(historyRes);
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

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = createRealtimeSocket(socketUrl, { transports: ['polling', 'websocket'] });
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
  }, [user?.token, refreshSelectedDateAttendance]);

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
        const data = await parseResponseJson<{
          totalMinutes?: number;
          days?: typeof rangeDays;
          justificaciones?: FaltaJustificada[];
        }>(res);
        if (!data) return;
        setRangeTotalMinutes(data.totalMinutes || 0);
        if (Array.isArray(data.days)) setRangeDays(data.days);
        setRangeFaltas(Array.isArray(data.justificaciones) ? data.justificaciones : []);
      } catch {
        // No interrumpir la UI si falla la consulta
      }
    };
    fetchRange();
  }, [user, rangeFrom, rangeTo]);

  // Sábado y domingo solo checa quien tiene guardia: avisar antes de intentarlo (el servidor
  // es quien decide; si la consulta falla no se afirma nada).
  useEffect(() => {
    const hoy = new Date().toLocaleDateString('sv-SE');
    if (!user?.token || !user.id || !esFinDeSemanaISO(hoy)) {
      setSinGuardiaHoy(null);
      return;
    }
    let vigente = true;
    fetchGuardias(user.token, { desde: hoy, hasta: hoy })
      .then((r) => {
        if (!vigente) return;
        setSinGuardiaHoy(!(r.items ?? []).some((g) => g.userId === user.id && g.fecha === hoy));
      })
      .catch(() => vigente && setSinGuardiaHoy(null));
    return () => {
      vigente = false;
    };
  }, [user?.token, user?.id]);

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
      let accuracyM: number | undefined;
      // Por qué no hubo ubicación (el jefe lo lee en «Sin ubicación: …»).
      let ubicacionFalla: string | undefined = navigator.geolocation ? undefined : "NO_DISPONIBLE";
      
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
          // Precisión real del navegador: peor que 200 m el servidor lo marca para revisar.
          accuracyM = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined;
        } catch (gpsErr) {
          // Si no puede obtener GPS, continúa sin él, pero dice por qué.
          ubicacionFalla = fallaDeGeolocalizacion(gpsErr);
          console.warn('⚠️ No se pudo obtener ubicación GPS:', gpsErr);
        }
      }

      // La hora la pone el servidor: la web no manda `timestamp` (contrato del
      // viernes 18-09, sección A). `offline: false` porque este formulario solo
      // checa con la API delante; lo que se captura sin red es cosa del teléfono.
      const payload = {
        type: tipo,
        photoBase64: photoBase64 || undefined,
        latitude,
        longitude,
        accuracyM,
        ubicacionFalla: typeof latitude === 'number' ? undefined : ubicacionFalla ?? 'ERROR',
        offline: false,
      };


      const res = await fetch(buildApiUrl('attendance'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      
      
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
          // La checada ya quedó; no asustar con el mismo tono que un fallo de entrada.
          const detail = gpsErr instanceof Error ? gpsErr.message : 'permisos o red';
          setError(`Entrada registrada; GPS no se activó (${detail}).`);
        }
      } else {
        setStatus('✓ Salida registrada correctamente. Se detuvo el compartir ubicación.');
        stopGpsTracking();
        try {
          await updateGpsConsent(false);
          dispatchGpsConsent(false);
        } catch (gpsErr) {
          const detail = gpsErr instanceof Error ? gpsErr.message : 'permisos o red';
          setError(`Salida registrada; GPS no se desactivó (${detail}).`);
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
        } else {
          setStartTime(null);
          localStorage.removeItem(STORAGE_KEY);
        }
      } else if (tipo === 'entrada' && isToday(selectedDate)) {
        const newStartTime = new Date();
        setStartTime(newStartTime);
        // Guardar en localStorage para persistencia
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          startTimeStr: newStartTime.toISOString(),
          date: selectedDate,
        }));
      } else if (tipo === 'salida') {
        setStartTime(null);
        localStorage.removeItem(STORAGE_KEY);
      }

      await refreshSelectedDateAttendance();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('attendance:updated'));
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

  const hasEntryToday = history.some((h) => h.type === 'entrada');
  const hasExitToday = history.some((h) => h.type === 'salida');
  const canRegisterEntry = isToday(selectedDate) && !hasEntryToday && !openSession;
  const canRegisterExit = isToday(selectedDate) && Boolean(openSession);
  const jornadaDone = isToday(selectedDate) && hasEntryToday && hasExitToday;
  const openSessionFromPriorDay = Boolean(
    openSession?.lastEntryAt && !isToday(toLocalDateKey(new Date(openSession.lastEntryAt))),
  );

  const statusLabel = jornadaDone
    ? 'Completada'
    : openSession
      ? openSessionFromPriorDay
        ? 'Abierta (día anterior)'
        : 'En jornada'
      : 'Sin checada';
  const statusTone = jornadaDone ? 'ok' : openSession ? 'live' : 'idle';
  const primaryAction: 'entrada' | 'salida' | null = canRegisterEntry
    ? 'entrada'
    : canRegisterExit
      ? 'salida'
      : null;

  // Lo que se lee de un vistazo: «En jornada desde 8:02 · 6 h 41».
  const elapsedOpen = elapsed || (openSession?.lastEntryAt ? Date.now() - new Date(openSession.lastEntryAt).getTime() : 0);
  const totalHoyMs = totalMinutes * 60_000 + (startTime ? elapsed : 0);
  const estadoLinea = jornadaDone
    ? `Completada · ${formatElapsed(totalHoyMs)}`
    : openSession
      ? openSessionFromPriorDay
        ? `Abierta desde el ${formatDate(openSession.lastEntryAt)} · ${formatTime(openSession.lastEntryAt)}`
        : `En jornada desde ${formatTime(openSession.lastEntryAt)} · ${formatElapsed(elapsedOpen)}`
      : 'Sin checada';
  const mapaEntrada = attendanceMapUrl(history, 'entrada');
  const mapaSalida = attendanceMapUrl(history, 'salida');
  // La checada más reciente que el servidor marcó fuera de sitio (geocerca).
  const fueraDeSitio = [checadaDelTipo(history, 'salida'), checadaDelTipo(history, 'entrada')]
    .filter((c): c is ChecadaValidable => Boolean(c?.fueraDeSitio))
    .sort((a, b) => ((b.timestamp ?? '') > (a.timestamp ?? '') ? 1 : -1))[0];
  const avisoGuardia = isToday(selectedDate) && sinGuardiaHoy === true && canRegisterEntry;

  return (
    <div className={`${styles.root} ${compact ? styles.rootCompact : ''}`}>
      {/* Modal de Cámara */}
      {cameraOpen && typeof window !== 'undefined' && createPortal(
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label={`Foto de ${cameraType === 'entrada' ? 'entrada' : 'salida'}`}>
          <div className={styles.modalHeader}>
            <p className={styles.modalTitle}>
              Foto de {cameraType === 'entrada' ? 'entrada' : 'salida'}
            </p>
            <p className={styles.modalSubtitle}>
              Se captura ubicación GPS al confirmar
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
            <Button size="lg" className={styles.cameraButton} onClick={flipCamera}>
              Voltear
            </Button>
            <Button size="lg" variant="primary" className={`${styles.cameraButton} ${styles.captureButton}`} onClick={capturePhoto}>
              Capturar + GPS
            </Button>
            <Button size="lg" className={styles.cameraButton} onClick={closeCamera}>
              Cancelar
            </Button>
          </div>
        </div>,
        document.body
      )}

      <div className={compact ? styles.cardCompact : styles.card}>
        {!compact && <h2 className={styles.title}>Registro de Entrada/Salida</h2>}

        <div className={styles.statusBar} data-tone={statusTone}>
          <span className={styles.statusDot} aria-hidden="true" />
          <div className={styles.statusText}>
            <div className={styles.statusEyebrow}>Estado hoy · {statusLabel}</div>
            <div className={styles.statusValue}>{estadoLinea}</div>
            {(totalMinutes > 0 || startTime) && !jornadaDone && (
              <div className={styles.totalDay}>Total hoy: {formatElapsed(totalHoyMs)}</div>
            )}
          </div>
          <Badge size="sm" tone="neutral">Foto + GPS</Badge>
        </div>

        {!compact && (
          <div className={styles.fieldBlock}>
            <label className={styles.label} htmlFor="asistencia-dia">Día</label>
            <DateInput
              id="asistencia-dia"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              disabled={isToday(selectedDate)}
              max={toLocalDateInput(new Date())}
              className={styles.dateInput}
              title={isToday(selectedDate) ? 'No puedes cambiar la fecha de hoy' : ''}
            />
          </div>
        )}

        {avisoGuardia ? (
          <Alert tone="warning" title="Fin de semana sin guardia">
            {AVISO_FIN_DE_SEMANA}
          </Alert>
        ) : null}

        <div className={`${styles.actionsRow} ${isMobile ? styles.actionsRowMobile : ''}`}>
          <Button
            size="lg"
            variant={primaryAction === 'entrada' ? 'primary' : 'secondary'}
            className={styles.accion}
            iconStart={<LoginOutlinedIcon fontSize="inherit" aria-hidden="true" />}
            onClick={() => openCamera('entrada')}
            disabled={loading || !canRegisterEntry}
            loading={loading && primaryAction === 'entrada'}
            title={hasEntryToday ? 'Ya registraste entrada hoy' : (openSession ? 'Cierra la jornada abierta primero' : 'Abre cámara y captura GPS')}
          >
            {loading && primaryAction === 'entrada' ? 'Preparando…' : 'Entrada'}
          </Button>
          <Button
            size="lg"
            variant={primaryAction === 'salida' ? 'primary' : 'secondary'}
            className={styles.accion}
            iconStart={<LogoutOutlinedIcon fontSize="inherit" aria-hidden="true" />}
            onClick={() => openCamera('salida')}
            disabled={loading || !canRegisterExit}
            loading={loading && primaryAction === 'salida'}
            title={!openSession ? 'Primero registra entrada' : 'Cierra jornada con foto + GPS'}
          >
            {loading && primaryAction === 'salida' ? 'Preparando…' : 'Salida'}
          </Button>
        </div>

        {compact && primaryAction && (
          <p className={styles.hintLine}>
            {primaryAction === 'entrada'
              ? 'Toca Entrada → foto → se guarda con GPS.'
              : 'Toca Salida → foto → cierra la jornada con GPS.'}
          </p>
        )}

        {(mapaEntrada || mapaSalida) && (
          <div className={styles.mapas}>
            {mapaEntrada ? (
              <a href={mapaEntrada} target="_blank" rel="noopener noreferrer" className={rec.lugar}>
                <PlaceOutlinedIcon aria-hidden="true" />
                Ver entrada en mapa
              </a>
            ) : null}
            {mapaSalida ? (
              <a href={mapaSalida} target="_blank" rel="noopener noreferrer" className={rec.lugar}>
                <PlaceOutlinedIcon aria-hidden="true" />
                Ver salida en mapa
              </a>
            ) : null}
          </div>
        )}

        <div className={styles.avisos}>
          {isToday(selectedDate) && openSession && openSessionFromPriorDay && (
            <Alert tone="warning">
              Jornada abierta desde ayer — registra <strong>Salida</strong> para cerrarla.
            </Alert>
          )}
          {jornadaDone && (
            <Alert tone="success">
              Jornada completada. Entrada y salida registradas.
            </Alert>
          )}
          {fueraDeSitio && (
            <Alert tone="warning" title="Checada fuera de sitio">
              Tu {fueraDeSitio.type === 'salida' ? 'salida' : 'entrada'}
              {fueraDeSitio.timestamp ? ` de las ${formatTime(fueraDeSitio.timestamp)}` : ''} quedó
              {fueraDeSitio.distanciaSitioM != null ? ` a ${fueraDeSitio.distanciaSitioM} m` : ' lejos'}
              {fueraDeSitio.sitioNombre ? ` de ${fueraDeSitio.sitioNombre}` : ' del sitio asignado'}. Tu jefe la verá marcada como «Fuera de sitio».
            </Alert>
          )}
          {status && (
            <Alert tone="success" role="status">
              {status}
            </Alert>
          )}
          {error && (
            <Alert tone="danger" role="alert" title={error === AVISO_FIN_DE_SEMANA ? 'Fin de semana sin guardia' : undefined}>
              {error}
            </Alert>
          )}
        </div>

        {history.length > 0 && (
          <div className={styles.historySection}>
            <div className={styles.sectionLabel}>Hoy</div>
            <ul className={styles.historyList}>
              {history.map((item, index) => (
                <li key={`${item.type}-${item.timestamp}-${index}`} className={styles.historyItem}>
                  <span className={styles.historyType}>{item.type}</span>
                  <span className={styles.mutedText}>{formatTime(item.timestamp)}</span>
                  {item.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.photoUrl}
                      alt=""
                      className={styles.historyPhoto}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <details className={styles.rangeDetails} open={!compact}>
          <summary className={styles.rangeSummary}>
            Resumen semana / mes · {formatTotal(rangeTotalMinutes)}
          </summary>
          <div className={styles.rangeSectionInner}>
            <div className={styles.quickRangeButtons}>
              <Button size="sm" onClick={() => { const r = getWeekRange(); setRangeFrom(r.from); setRangeTo(r.to); }}>Semana</Button>
              <Button size="sm" onClick={() => { const r = getMonthRange(); setRangeFrom(r.from); setRangeTo(r.to); }}>Mes</Button>
            </div>
            <div className={`${styles.rangeGrid} ${isMobile ? styles.rangeGridMobile : ''}`}>
              <DateInput
                aria-label="Desde"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                className={styles.rangeInput}
              />
              <DateInput
                aria-label="Hasta"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                className={styles.rangeInput}
              />
            </div>
            {rangeDays.length > 0 && (
              <ul className={styles.rangeDaysList}>
                {rangeDays.map((day) => (
                  <li key={day.date} className={styles.rangeDayItem}>
                    <span>{formatDate(day.date)}</span>
                    <span className={styles.mutedText}>{formatTotal(day.totalMinutes)}</span>
                  </li>
                ))}
              </ul>
            )}
            {rangeFaltas.length > 0 && (
              <ul className={styles.rangeDaysList}>
                {rangeFaltas.map((falta) => (
                  <li key={`falta-${falta.id}`} className={styles.rangeDayItem}>
                    <span>{formatDate(`${falta.fecha}T12:00:00`)}</span>
                    <span className={styles.mutedText}>
                      Falta justificada · {falta.motivo}
                      {falta.justificadaPor?.nombre ? ` (${falta.justificadaPor.nombre})` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </div>
    </div>
  );
};

export default AttendanceForm;
