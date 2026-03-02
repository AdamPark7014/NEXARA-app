"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { getSocketBaseUrl } from '@/lib/api-base';

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
    return new Promise<void>((resolve, reject) => {
      const existing = document.getElementById('google-maps-script');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Error al cargar Google Maps')));
        return;
      }
      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsKey}&v=weekly&libraries=places,marker&loading=async`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        // Espera a que google.maps esté completamente inicializado
        setTimeout(() => {
          if (window.google?.maps) {
            resolve();
          } else {
            reject(new Error('Google Maps no se inicializó correctamente'));
          }
        }, 100);
      };
      script.onerror = () => reject(new Error('Error al cargar Google Maps'));
      document.body.appendChild(script);
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
    if (mapsLib?.marker?.AdvancedMarkerElement) {
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
      transports: ['polling'],
      upgrade: false,
      timeout: 20000,
      reconnectionAttempts: 8,
    });

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (payload?.model === 'LocationTracking' || payload?.model === 'User') {
        refreshMe().catch(() => null);
        refreshTeam().catch(() => null);
      }
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
        const ctor = await resolveMapCtor();
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
    if (myMapRef.current && !myMapInstance.current) {
      myMapInstance.current = new mapCtor(myMapRef.current, {
        center: { lat: 19.4326, lng: -99.1332 },
        zoom: 14,
        zoomControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
      });
    }
    if (teamMapRef.current && !teamMapInstance.current) {
      teamMapInstance.current = new mapCtor(teamMapRef.current, {
        center: { lat: 19.4326, lng: -99.1332 },
        zoom: 12,
        zoomControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
      });
    }
  }, [mapsReady, mapCtor]);

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

  const shellStyle: React.CSSProperties = {
    display: 'grid',
    gap: 16,
  };

  const heroStyle: React.CSSProperties = {
    display: 'grid',
    gap: 12,
    background: 'linear-gradient(135deg, rgba(15,106,214,0.14) 0%, rgba(22,169,110,0.08) 100%)',
    border: '1px solid rgba(15,106,214,0.2)',
    boxShadow: '0 12px 30px rgba(15,106,214,0.12)',
  };

  const mapShellStyle: React.CSSProperties = {
    width: '100%',
    height: 340,
    background: 'linear-gradient(180deg, rgba(15,106,214,0.08) 0%, rgba(22,169,110,0.08) 100%)',
    borderRadius: 16,
    border: '1px solid rgba(15,106,214,0.12)',
    display: 'grid',
    placeItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  };

  const teamMapShellStyle: React.CSSProperties = {
    ...mapShellStyle,
    height: 420,
  };

  const statCardStyle: React.CSSProperties = {
    padding: 14,
    background: 'linear-gradient(135deg, rgba(15,106,214,0.12), rgba(22,169,110,0.08))',
    border: '1px solid rgba(15,106,214,0.22)',
    boxShadow: '0 12px 22px rgba(15,106,214,0.12)',
  };

  const teamCardStyle: React.CSSProperties = {
    padding: 14,
    background: 'linear-gradient(135deg, rgba(15,106,214,0.16), rgba(22,169,110,0.12))',
    border: '1px solid rgba(15,106,214,0.28)',
    boxShadow: '0 14px 26px rgba(15,106,214,0.16)',
  };

  const helperTextStyle: React.CSSProperties = {
    color: 'var(--text-secondary)',
    fontSize: 12,
  };

  return (
    <div style={shellStyle}>
      <div className="card" style={heroStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ color: 'var(--primary)', marginBottom: 6, letterSpacing: 0.2 }}>GPS en tiempo real</h2>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              {isHighLevel
                ? 'Vista gerencial con el resumen del equipo en tiempo real.'
                : 'La ubicacion se comparte automaticamente al registrar entrada.'}
            </div>
          </div>
          {!isHighLevel && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className={`badge ${consent ? 'approved' : 'pending'}`}>
                {consent ? 'Compartiendo' : 'Privado'}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            {isHighLevel
              ? 'Solo visualizas a usuarios con consentimiento y nivel inferior.'
              : 'Solo puedes ver tu ubicacion y, si eres administrador, la de usuarios bajo tu jerarquia.'}
          </div>
          {!isHighLevel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: consent ? 'var(--accent)' : 'var(--info)',
                  boxShadow: consent ? '0 0 0 4px rgba(32,185,129,0.18)' : '0 0 0 4px rgba(31,141,242,0.16)',
                }}
              />
              {loading ? 'Sincronizando...' : consent ? 'Ubicacion activa' : 'Ubicacion pausada'}
            </div>
          )}
        </div>
        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
        {statusMsg && <div style={{ color: 'var(--accent)' }}>{statusMsg}</div>}
      </div>

      {!isHighLevel && (
        <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ marginBottom: 4 }}>Mi ubicacion</h3>
            <div style={helperTextStyle}>
              {myLocation?.ultimaActualizacion
                ? `Ultima actualizacion: ${new Date(myLocation.ultimaActualizacion).toLocaleString()}`
                : 'Sin ubicacion registrada'}
            </div>
          </div>
          <div style={helperTextStyle}>
            {loading ? 'Cargando...' : consent ? 'En tiempo real' : 'Ubicacion privada'}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div className="card" style={statCardStyle}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Latitud</div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              {toNumber(myLocation?.latitud) ?? '-'}
            </div>
          </div>
          <div className="card" style={statCardStyle}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Longitud</div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              {toNumber(myLocation?.longitud) ?? '-'}
            </div>
          </div>
          <div className="card" style={statCardStyle}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Velocidad</div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              {toNumber(myLocation?.velocidadKmh) ? `${Number(myLocation?.velocidadKmh).toFixed(1)} km/h` : '-'}
            </div>
          </div>
        </div>
        <div ref={myMapRef} style={mapShellStyle}>
          {!canUseMaps && (
            <span style={{ color: 'var(--text-secondary)' }}>
              Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.
            </span>
          )}
        </div>
        </div>
      )}

      {isAdmin && (
        <div className="card" style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ marginBottom: 4 }}>Ubicaciones del equipo</h3>
              <div style={helperTextStyle}>
                Usuarios visibles: {teamLocations.length}
              </div>
            </div>
            <div style={helperTextStyle}>
              Solo usuarios con consentimiento y nivel inferior.
            </div>
          </div>
          <div ref={teamMapRef} style={teamMapShellStyle}>
            {!canUseMaps && (
              <span style={{ color: 'var(--text-secondary)' }}>
                Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {teamLocations.length ? (
              teamLocations.map((location) => (
                <div
                  key={location.id}
                  className="card"
                  style={teamCardStyle}
                >
                  <div style={{ fontWeight: 700, color: 'var(--foreground)' }}>{location.usuario?.nombre || 'Usuario'}</div>
                  <div style={helperTextStyle}>
                    {location.usuario?.role?.nombre || 'Sin rol'}
                  </div>
                  <div style={helperTextStyle}>
                    {location.usuario?.department?.nombre || 'Sin departamento'}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
                    Ultima ubicacion: {location.ultimaActualizacion ? new Date(location.ultimaActualizacion).toLocaleString() : '-'}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--text-secondary)' }}>No hay ubicaciones visibles por ahora.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GpsMap;
