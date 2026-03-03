"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { getSocketBaseUrl } from '@/lib/api-base';
import styles from './GpsMap.module.css';

const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-script';

type GpsUser = {
  id: number;
  nombre: string;
  email?: string;
  role?: { nombre?: string };
  department?: { nombre?: string };
};

type GpsLocation = {
  id: number;
  usuarioId: number;
  latitud: string | number;
  longitud: string | number;
  velocidadKmh?: string | number | null;
  ultimaActualizacion?: string | null;
  usuario?: GpsUser;
  actividad?: { id: number; titulo?: string; anNumber?: string } | null;
};

const GpsMap = () => {
  const { user } = useUser();
  const [consent, setConsent] = useState(false);
  const [myLocation, setMyLocation] = useState<GpsLocation | null>(null);
  const [teamLocations, setTeamLocations] = useState<GpsLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [mapCtor, setMapCtor] = useState<any>(null);
  const isAdmin = hasPermission(user, PERMISSIONS.GPS_MANAGE);
  const isHighLevel = Boolean(user?.isSuperAdmin || hasPermission(user, PERMISSIONS.CONSOLE_ADMIN));

  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const myMapRef = useRef<HTMLDivElement>(null);
  const teamMapRef = useRef<HTMLDivElement>(null);
  const myMapInstance = useRef<any>(null);
  const teamMapInstance = useRef<any>(null);
  const myMarkersRef = useRef<Map<string, any>>(new Map());
  const teamMarkersRef = useRef<Map<string, any>>(new Map());

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const googleMapsMapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || '';

  const canUseMaps = useMemo(() => Boolean(googleMapsKey), [googleMapsKey]);

  const resolveMapCtor = async () => {
    const mapsAny = window.google?.maps as any;
    if (!mapsAny) return null;
    if (typeof mapsAny.Map === 'function') return mapsAny.Map;
    if (typeof mapsAny.importLibrary === 'function') {
      const mapsLibrary = await mapsAny.importLibrary('maps');
      if (mapsLibrary?.Map) return mapsLibrary.Map;
    }
    return null;
  };

  const loadGoogleMaps = () => {
    if (!canUseMaps) return Promise.reject(new Error('API key no configurada'));
    if (window.google?.maps) return Promise.resolve();

    const injectScript = () =>
      new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.id = GOOGLE_MAPS_SCRIPT_ID;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsKey}&v=weekly&libraries=places,marker&loading=async`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
          window.setTimeout(() => {
            if (window.google?.maps) {
              resolve();
            } else {
              reject(new Error('Google Maps no se inicializó correctamente'));
            }
          }, 120);
        };
        script.onerror = () => reject(new Error('Error al cargar Google Maps'));
        document.body.appendChild(script);
      });

    const removeExistingScript = () => {
      const stale = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
      stale?.parentElement?.removeChild(stale);
    };

    return new Promise<void>((resolve, reject) => {
      const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
      if (existing) {
        if (window.google?.maps) {
          resolve();
          return;
        }

        const start = Date.now();
        const checkGoogle = window.setInterval(() => {
          if (window.google?.maps) {
            window.clearInterval(checkGoogle);
            resolve();
            return;
          }

          if (Date.now() - start > 12000) {
            window.clearInterval(checkGoogle);
            removeExistingScript();
            injectScript().then(resolve).catch(reject);
          }
        }, 120);

        existing.addEventListener('error', () => {
          window.clearInterval(checkGoogle);
          removeExistingScript();
          injectScript().then(resolve).catch(reject);
        }, { once: true });
        return;
      }
      injectScript().then(resolve).catch(reject);
    });
  };

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('');
  };

  const toNumber = (value?: string | number | null) => {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const createMapMarker = (mapsLib: any, map: any, position: { lat: number; lng: number }, label?: string) => {
    if (googleMapsMapId && mapsLib?.marker?.AdvancedMarkerElement) {
      return new mapsLib.marker.AdvancedMarkerElement({
        map,
        position,
        title: label,
      });
    }
    return new mapsLib.Marker({
      map,
      position,
      label,
    } as any);
  };

  const setMapMarkerPosition = (marker: any, position: { lat: number; lng: number }) => {
    if (!marker) return;
    if (typeof marker.setPosition === 'function') {
      marker.setPosition(position);
      return;
    }
    marker.position = position;
  };

  const setMapMarkerInstanceMap = (marker: any, map: any) => {
    if (!marker) return;
    if (typeof marker.setMap === 'function') {
      marker.setMap(map);
      return;
    }
    marker.map = map;
  };

  const refreshMe = async () => {
    if (!user?.token) return;
    const res = await fetch(buildApiUrl('gps/me'), {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    if (!res.ok) throw new Error('No autorizado');
    const data = await res.json();
    setConsent(Boolean(data?.consent));
    setMyLocation(data?.location || null);
  };

  const refreshTeam = async () => {
    if (!user?.token || !isAdmin) return;
    const res = await fetch(buildApiUrl('gps/team'), {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    if (!res.ok) throw new Error('No autorizado');
    const data = await res.json();
    setTeamLocations(Array.isArray(data) ? data : []);
  };

  const sendLocation = async (payload: { latitud: number; longitud: number; velocidadKmh?: number | null }) => {
    if (!user?.token) return;
    const now = Date.now();
    if (now - lastSentRef.current < 4000) return;
    lastSentRef.current = now;
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

  const stopTracking = () => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('Tu navegador no soporta geolocalizacion.');
      return;
    }
    if (watchIdRef.current !== null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const payload = {
          latitud: pos.coords.latitude,
          longitud: pos.coords.longitude,
          velocidadKmh: pos.coords.speed ? pos.coords.speed * 3.6 : null,
        };
        setMyLocation((prev) => ({
          ...(prev || { id: -1, usuarioId: user?.id || 0 }),
          ...payload,
          ultimaActualizacion: new Date().toISOString(),
          usuario: prev?.usuario || (user ? { id: user.id, nombre: user.nombre } : undefined),
        } as GpsLocation));
        try {
          await sendLocation(payload);
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

  const handleConsentChange = async (nextValue: boolean) => {
    if (!user?.token) return;
    setError(null);
    setStatusMsg(null);
    if (nextValue && !isHighLevel) {
      if (!navigator.geolocation) {
        setError('Tu navegador no soporta geolocalizacion.');
        return;
      }
      try {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            () => reject(new Error('Permiso denegado')),
            { enableHighAccuracy: true, timeout: 10000 }
          );
        });
      } catch {
        setError('Debes habilitar la ubicacion para compartir en tiempo real.');
        return;
      }
    }

    const res = await fetch(buildApiUrl('gps/consent'), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ enabled: nextValue }),
    });
    if (!res.ok) {
      setError('No se pudo actualizar el consentimiento.');
      return;
    }
    const data = await res.json();
    setConsent(Boolean(data?.consent));
    setStatusMsg(nextValue ? 'Compartiendo ubicacion en tiempo real.' : 'Ubicacion compartida desactivada.');
  };

  useEffect(() => {
    if (!user?.token) return;
    setLoading(true);
    Promise.all([refreshMe(), refreshTeam()])
      .catch(() => setError('No se pudo cargar la informacion de GPS.'))
      .finally(() => setLoading(false));
  }, [user?.token]);

  useEffect(() => {
    const handleConsentEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      if (typeof detail?.enabled !== 'boolean') return;
      setConsent(detail.enabled);
      if (!detail.enabled) {
        setMyLocation(null);
      }
    };
    window.addEventListener('gps:consent', handleConsentEvent as EventListener);
    return () => window.removeEventListener('gps:consent', handleConsentEvent as EventListener);
  }, []);

  useEffect(() => {
    if (!user?.token) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      upgrade: true,
      timeout: 12000,
      reconnectionAttempts: 3,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 5000,
    });

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (payload?.model === 'LocationTracking' || payload?.model === 'User') {
        refreshMe().catch(() => null);
        refreshTeam().catch(() => null);
      }
    });

    socket.on('connect_error', () => {
      setStatusMsg('Sin conexion en tiempo real con el servidor.');
    });

    socket.on('connect', () => {
      setStatusMsg(null);
    });

    socket.io.on('reconnect_failed', () => {
      socket.disconnect();
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.token, isAdmin]);

  useEffect(() => {
    if (consent) {
      startTracking();
    } else {
      stopTracking();
    }
    return () => stopTracking();
  }, [consent]);

  useEffect(() => {
    if (!canUseMaps) return;
    loadGoogleMaps()
      .then(async () => {
        let ctor: any = null;
        for (let attempt = 0; attempt < 25; attempt += 1) {
          ctor = await resolveMapCtor();
          if (ctor) break;
          await new Promise((resolve) => window.setTimeout(resolve, 120));
        }
        if (!ctor) {
          throw new Error('Google Maps Map constructor no disponible');
        }
        setMapCtor(() => ctor);
        setMapsReady(true);
      })
      .catch((err) => setError(err.message));
  }, [canUseMaps]);

  useEffect(() => {
    if (!mapsReady || !window.google?.maps || !mapCtor) return;
    if (typeof mapCtor !== 'function') {
      setMapsReady(false);
      setError('Constructor de Google Maps no disponible. Reintentando...');
      return;
    }
    if (myMapRef.current && !myMapInstance.current) {
      try {
        myMapInstance.current = new mapCtor(myMapRef.current, {
          center: { lat: 19.4326, lng: -99.1332 },
          zoom: 14,
          ...(googleMapsMapId ? { mapId: googleMapsMapId } : {}),
          zoomControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
        });
      } catch {
        setMapsReady(false);
        setError('No se pudo crear el mapa personal. Reintentando...');
        return;
      }
    }
    if (teamMapRef.current && !teamMapInstance.current) {
      try {
        teamMapInstance.current = new mapCtor(teamMapRef.current, {
          center: { lat: 19.4326, lng: -99.1332 },
          zoom: 12,
          ...(googleMapsMapId ? { mapId: googleMapsMapId } : {}),
          zoomControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
        });
      } catch {
        setMapsReady(false);
        setError('No se pudo crear el mapa de equipo. Reintentando...');
        return;
      }
    }
  }, [mapsReady, mapCtor, googleMapsMapId]);

  useEffect(() => {
    return () => {
      myMarkersRef.current.forEach((marker) => setMapMarkerInstanceMap(marker, null));
      teamMarkersRef.current.forEach((marker) => setMapMarkerInstanceMap(marker, null));
      myMarkersRef.current.clear();
      teamMarkersRef.current.clear();
      myMapInstance.current = null;
      teamMapInstance.current = null;
      setMapCtor(null);
      setMapsReady(false);
    };
  }, []);

  useEffect(() => {
    if (!myMapInstance.current || !myLocation || !window.google?.maps) return;
    const mapsLib = window.google.maps as any;
    const lat = toNumber(myLocation.latitud);
    const lng = toNumber(myLocation.longitud);
    if (lat === null || lng === null) return;
    const markerKey = 'me';
    const marker = myMarkersRef.current.get(markerKey);
    if (!marker) {
      const nextMarker = createMapMarker(mapsLib, myMapInstance.current as unknown, { lat, lng }, 'Yo');
      myMarkersRef.current.set(markerKey, nextMarker);
    } else {
      setMapMarkerPosition(marker, { lat, lng });
    }
    myMapInstance.current.setCenter({ lat, lng });
  }, [myLocation]);

  useEffect(() => {
    if (!teamMapInstance.current || !window.google?.maps) return;
    const mapsLib = window.google.maps as any;
    const activeKeys = new Set<string>();
    teamLocations.forEach((location) => {
      const lat = toNumber(location.latitud);
      const lng = toNumber(location.longitud);
      if (lat === null || lng === null) return;
      const key = String(location.usuarioId);
      activeKeys.add(key);
      const existing = teamMarkersRef.current.get(key);
      if (!existing) {
        const marker = createMapMarker(mapsLib, teamMapInstance.current, { lat, lng }, getInitials(location.usuario?.nombre));
        teamMarkersRef.current.set(key, marker);
      } else {
        setMapMarkerPosition(existing, { lat, lng });
      }
    });

    teamMarkersRef.current.forEach((marker, key) => {
      if (!activeKeys.has(key)) {
        setMapMarkerInstanceMap(marker, null);
        teamMarkersRef.current.delete(key);
      }
    });

    if (teamLocations.length && teamMapInstance.current) {
      const first = teamLocations[0];
      const lat = toNumber(first.latitud);
      const lng = toNumber(first.longitud);
      if (lat !== null && lng !== null) {
        teamMapInstance.current.setCenter({ lat, lng });
      }
    }
  }, [teamLocations]);

  return (
    <div className={styles.shell}>
      <div className={`card ${styles.hero}`}>
        <div className={styles.rowBetween}>
          <div>
            <h2 className={styles.title}>GPS en tiempo real</h2>
            <div className={styles.subtitle}>
              {isHighLevel
                ? 'Vista gerencial con el resumen del equipo en tiempo real.'
                : 'La ubicacion se comparte automaticamente al registrar entrada.'}
            </div>
          </div>
          {!isHighLevel && (
            <div className={styles.statusRow}>
              <span className={`badge ${consent ? 'approved' : 'pending'}`}>
                {consent ? 'Compartiendo' : 'Privado'}
              </span>
            </div>
          )}
        </div>
        <div className={styles.rowBetweenSmall}>
          <div className={styles.helperText}>
            {isHighLevel
              ? 'Solo visualizas a usuarios con consentimiento y nivel inferior.'
              : 'Solo puedes ver tu ubicacion y, si eres administrador, la de usuarios bajo tu jerarquia.'}
          </div>
          {!isHighLevel && (
            <div className={styles.syncStatus}>
              <span className={`${styles.dot} ${consent ? styles.dotActive : styles.dotPaused}`} />
              {loading ? 'Sincronizando...' : consent ? 'Ubicacion activa' : 'Ubicacion pausada'}
            </div>
          )}
        </div>
        {error && <div className={styles.errorText}>{error}</div>}
        {statusMsg && <div className={styles.successText}>{statusMsg}</div>}
      </div>

      {!isHighLevel && (
        <div className={`card ${styles.sectionCard}`}>
        <div className={styles.rowBetweenSmall}>
          <div>
            <h3 className={styles.sectionTitle}>Mi ubicacion</h3>
            <div className={styles.helperText}>
              {myLocation?.ultimaActualizacion
                ? `Ultima actualizacion: ${new Date(myLocation.ultimaActualizacion).toLocaleString()}`
                : 'Sin ubicacion registrada'}
            </div>
          </div>
          <div className={styles.helperText}>
            {loading ? 'Cargando...' : consent ? 'En tiempo real' : 'Ubicacion privada'}
          </div>
        </div>
        <div className={styles.statsGrid}>
          <div className={`card ${styles.statCard}`}>
            <div className={styles.statLabel}>Latitud</div>
            <div className={styles.statValue}>
              {toNumber(myLocation?.latitud) ?? '-'}
            </div>
          </div>
          <div className={`card ${styles.statCard}`}>
            <div className={styles.statLabel}>Longitud</div>
            <div className={styles.statValue}>
              {toNumber(myLocation?.longitud) ?? '-'}
            </div>
          </div>
          <div className={`card ${styles.statCard}`}>
            <div className={styles.statLabel}>Velocidad</div>
            <div className={styles.statValue}>
              {toNumber(myLocation?.velocidadKmh) ? `${Number(myLocation?.velocidadKmh).toFixed(1)} km/h` : '-'}
            </div>
          </div>
        </div>
        <div ref={myMapRef} className={styles.mapShell}>
          {!canUseMaps && (
            <span className={styles.mapHint}>
              Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.
            </span>
          )}
        </div>
        </div>
      )}

      {isAdmin && (
        <div className={`card ${styles.sectionCard}`}>
          <div className={styles.rowBetweenSmall}>
            <div>
              <h3 className={styles.sectionTitle}>Ubicaciones del equipo</h3>
              <div className={styles.helperText}>
                Usuarios visibles: {teamLocations.length}
              </div>
            </div>
            <div className={styles.helperText}>
              Solo usuarios con consentimiento y nivel inferior.
            </div>
          </div>
          <div ref={teamMapRef} className={styles.teamMapShell}>
            {!canUseMaps && (
              <span className={styles.mapHint}>
                Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.
              </span>
            )}
          </div>
          <div className={styles.teamGrid}>
            {teamLocations.length ? (
              teamLocations.map((location) => (
                <div key={location.id} className={`card ${styles.teamCard}`}>
                  <div className={styles.teamName}>{location.usuario?.nombre || 'Usuario'}</div>
                  <div className={styles.teamMeta}>
                    {location.usuario?.role?.nombre || 'Sin rol'}
                  </div>
                  <div className={styles.teamMeta}>
                    {location.usuario?.department?.nombre || 'Sin departamento'}
                  </div>
                  <div className={styles.teamUpdated}>
                    Ultima ubicacion: {location.ultimaActualizacion ? new Date(location.ultimaActualizacion).toLocaleString() : '-'}
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.emptyTeam}>No hay ubicaciones visibles por ahora.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GpsMap;
