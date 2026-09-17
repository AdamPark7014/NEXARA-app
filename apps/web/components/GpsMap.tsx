"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import styles from './GpsMap.module.css';
import { createRealtimeSocket } from '@/lib/realtime-socket';
import { googleMapsMapId, isGoogleMapsConfigured, loadGoogleMaps, loadMapConstructor } from '@/lib/google-maps-loader';
import { useVisibleOnce } from '@/lib/use-visible-once';

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
  const myMapInstance = useRef<any>(null);
  const teamMapInstance = useRef<any>(null);
  const myMarkersRef = useRef<Map<string, any>>(new Map());
  const teamMarkersRef = useRef<Map<string, any>>(new Map());
  /** Resultado de `importLibrary('marker')` — obligatorio si el mapa usa `mapId` (Advanced Markers). */
  const markerLibraryRef = useRef<{ AdvancedMarkerElement?: new (opts: object) => any } | null>(null);

  const mapId = googleMapsMapId();

  const canUseMaps = useMemo(() => isGoogleMapsConfigured(), []);

  /**
   * Un mapa cuesta dinero en cuanto se instancia, así que se instancia solo si
   * hay permiso, hay algo que pintar y el hueco llegó a verse. Un mapa vacío
   * centrado en el Zócalo no le sirve a nadie y se paga igual.
   */
  const [myMapRef, myMapVisible] = useVisibleOnce<HTMLDivElement>({
    enabled: canUseMaps && !isHighLevel && Boolean(myLocation),
  });
  const [teamMapRef, teamMapVisible] = useVisibleOnce<HTMLDivElement>({
    enabled: canUseMaps && isAdmin && teamLocations.length > 0,
  });
  const showMyMap = myMapVisible;
  const showTeamMap = teamMapVisible;
  const wantsMaps = showMyMap || showTeamMap;

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

  const canUseAdvancedMarkers = () =>
    Boolean(mapId && markerLibraryRef.current?.AdvancedMarkerElement);

  const createMapMarker = (map: any, position: { lat: number; lng: number }, label?: string) => {
    const mapsLib = window.google?.maps as any;
    if (!mapsLib) return null;
    const Adv = markerLibraryRef.current?.AdvancedMarkerElement;
    if (mapId && Adv) {
      return new Adv({
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
          setError('No se pudo enviar la ubicación.');
        }
      },
      () => {
        setError('No se pudo obtener la ubicación. Revisa los permisos.');
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
        setError('Debes habilitar la ubicación para compartir en tiempo real.');
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
    setStatusMsg(nextValue ? 'Compartiendo ubicación en tiempo real.' : 'Ubicación compartida desactivada.');
  };

  useEffect(() => {
    if (!user?.token) return;
    setLoading(true);
    Promise.all([refreshMe(), refreshTeam()])
      .catch(() => setError('No se pudo cargar la información de GPS.'))
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
    const socket: Socket = createRealtimeSocket(socketUrl, {
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

  // El SDK no se descarga hasta que uno de los dos mapas está de verdad en
  // pantalla y con algo que dibujar. Antes se cargaba siempre que hubiera clave,
  // incluso para un usuario sin consentimiento y sin permiso de equipo.
  useEffect(() => {
    if (!wantsMaps) return;
    let cancelled = false;
    // Sin `places`: aquí no se busca ninguna dirección.
    loadMapConstructor()
      .then(async (ctor) => {
        if (cancelled) return;
        markerLibraryRef.current = null;
        if (mapId) {
          try {
            const maps = await loadGoogleMaps(['marker']);
            markerLibraryRef.current = (maps['marker'] as typeof markerLibraryRef.current) ?? null;
          } catch {
            markerLibraryRef.current = null;
          }
        }
        if (cancelled) return;
        setMapCtor(() => ctor);
        setMapsReady(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el mapa'));
    return () => { cancelled = true; };
  }, [wantsMaps, mapId]);

  useEffect(() => {
    if (!mapsReady || !window.google?.maps || !mapCtor) return;
    if (typeof mapCtor !== 'function') {
      setMapsReady(false);
      setError('Constructor de Google Maps no disponible. Reintentando...');
      return;
    }
    const mapIdOpts = canUseAdvancedMarkers() ? { mapId } : {};

    if (showMyMap && myMapRef.current && !myMapInstance.current) {
      try {
        myMapInstance.current = new mapCtor(myMapRef.current, {
          center: { lat: 19.4326, lng: -99.1332 },
          zoom: 14,
          ...mapIdOpts,
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
    if (showTeamMap && teamMapRef.current && !teamMapInstance.current) {
      try {
        teamMapInstance.current = new mapCtor(teamMapRef.current, {
          center: { lat: 19.4326, lng: -99.1332 },
          zoom: 12,
          ...mapIdOpts,
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
  }, [mapsReady, mapCtor, mapId, showMyMap, showTeamMap]);

  useEffect(() => {
    return () => {
      myMarkersRef.current.forEach((marker) => setMapMarkerInstanceMap(marker, null));
      teamMarkersRef.current.forEach((marker) => setMapMarkerInstanceMap(marker, null));
      myMarkersRef.current.clear();
      teamMarkersRef.current.clear();
      myMapInstance.current = null;
      teamMapInstance.current = null;
      markerLibraryRef.current = null;
      setMapCtor(null);
      setMapsReady(false);
    };
  }, []);

  useEffect(() => {
    if (!myMapInstance.current || !myLocation || !window.google?.maps) return;
    const lat = toNumber(myLocation.latitud);
    const lng = toNumber(myLocation.longitud);
    if (lat === null || lng === null) return;
    const markerKey = 'me';
    const marker = myMarkersRef.current.get(markerKey);
    if (!marker) {
      const nextMarker = createMapMarker(myMapInstance.current as unknown, { lat, lng }, 'Yo');
      if (nextMarker) myMarkersRef.current.set(markerKey, nextMarker);
    } else {
      setMapMarkerPosition(marker, { lat, lng });
    }
    myMapInstance.current.setCenter({ lat, lng });
  }, [myLocation]);

  useEffect(() => {
    if (!teamMapInstance.current || !window.google?.maps) return;
    const activeKeys = new Set<string>();
    const points: { lat: number; lng: number }[] = [];

    teamLocations.forEach((location) => {
      const lat = toNumber(location.latitud);
      const lng = toNumber(location.longitud);
      if (lat === null || lng === null) return;
      points.push({ lat, lng });
      const key = String(location.usuarioId ?? location.id);
      activeKeys.add(key);
      const existing = teamMarkersRef.current.get(key);
      if (!existing) {
        const marker = createMapMarker(teamMapInstance.current, { lat, lng }, getInitials(location.usuario?.nombre));
        if (marker) teamMarkersRef.current.set(key, marker);
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

    const map = teamMapInstance.current;
    if (!map || points.length === 0) return;

    if (points.length === 1) {
      map.setCenter(points[0]);
      if (typeof map.setZoom === 'function') map.setZoom(14);
    } else {
      const gmaps = window.google.maps as unknown as { LatLngBounds: new () => { extend: (p: { lat: number; lng: number }) => void } };
      const bounds = new gmaps.LatLngBounds();
      points.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds);
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
                : 'La ubicación se comparte automáticamente al registrar entrada.'}
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
              : 'Solo puedes ver tu ubicación y, si eres administrador, la de usuarios bajo tu jerarquía.'}
          </div>
          {!isHighLevel && (
            <div className={styles.syncStatus}>
              <span className={`${styles.dot} ${consent ? styles.dotActive : styles.dotPaused}`} />
              {loading ? 'Sincronizando...' : consent ? 'Ubicación activa' : 'Ubicación pausada'}
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
            <h3 className={styles.sectionTitle}>Mi ubicación</h3>
            <div className={styles.helperText}>
              {myLocation?.ultimaActualizacion
                ? `Última actualización: ${new Date(myLocation.ultimaActualizacion).toLocaleString()}`
                : 'Sin ubicación registrada'}
            </div>
          </div>
          <div className={styles.helperText}>
            {loading ? 'Cargando...' : consent ? 'En tiempo real' : 'Ubicación privada'}
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
          {!canUseMaps ? (
            <span className={styles.mapHint}>
              Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.
            </span>
          ) : !myLocation ? (
            <span className={styles.mapHint}>
              El mapa aparece en cuanto haya una ubicación registrada.
            </span>
          ) : !showMyMap ? (
            <span className={styles.mapHint}>Desliza hasta aquí para cargar el mapa.</span>
          ) : null}
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
            {!canUseMaps ? (
              <span className={styles.mapHint}>
                Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.
              </span>
            ) : teamLocations.length === 0 ? (
              <span className={styles.mapHint}>
                Sin ubicaciones compartidas: no hay nada que mostrar en el mapa.
              </span>
            ) : !showTeamMap ? (
              <span className={styles.mapHint}>Desliza hasta aquí para cargar el mapa.</span>
            ) : null}
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
                    Última ubicación: {location.ultimaActualizacion ? new Date(location.ultimaActualizacion).toLocaleString() : '-'}
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


