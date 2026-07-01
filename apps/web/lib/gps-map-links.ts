export type GpsCoordPoint = {
  latitud?: number | string | null;
  longitud?: number | string | null;
};

export function toCoord(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function pointCoords(pt: GpsCoordPoint): { lat: number; lng: number } | null {
  const lat = toCoord(pt.latitud);
  const lng = toCoord(pt.longitud);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

export function googleMapsPointUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** Enlace a Google Maps con ruta por los puntos (entrada → recorrido → salida). */
export function googleMapsRouteUrl(points: { lat: number; lng: number }[]): string | null {
  if (points.length === 0) return null;
  const sampled = samplePathPoints(points, 18);
  const path = sampled.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join("/");
  return `https://www.google.com/maps/dir/${path}`;
}

/** Imagen estática con polyline del recorrido (requiere API key pública). */
export function googleStaticMapPathUrl(
  points: { lat: number; lng: number }[],
  apiKey: string,
  opts?: { width?: number; height?: number },
): string | null {
  if (!apiKey || points.length === 0) return null;
  const sampled = samplePathPoints(points, 80);
  const pathCoords = sampled.map((p) => `${p.lat},${p.lng}`).join("|");
  const w = opts?.width ?? 640;
  const h = opts?.height ?? 280;
  const markers: string[] = [];
  const first = sampled[0];
  const last = sampled[sampled.length - 1];
  if (first) markers.push(`color:green|label:S|${first.lat},${first.lng}`);
  if (last && last !== first) markers.push(`color:red|label:F|${last.lat},${last.lng}`);
  const params = new URLSearchParams({
    size: `${w}x${h}`,
    path: `color:0x2563eb|weight:4|${pathCoords}`,
    key: apiKey,
  });
  for (const m of markers) params.append("markers", m);
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

function samplePathPoints(points: { lat: number; lng: number }[], max: number): { lat: number; lng: number }[] {
  if (points.length <= max) return points;
  const out: { lat: number; lng: number }[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(points[Math.round(i * step)]!);
  }
  return out;
}

export function attendanceMapUrl(
  attendances: { type: string; timestamp: string; entryLatitude?: unknown; entryLongitude?: unknown; exitLatitude?: unknown; exitLongitude?: unknown }[] | undefined,
  type: "entrada" | "salida",
  trajectoryFallback?: GpsCoordPoint[],
): string | null {
  const filtered = (attendances ?? []).filter((a) => a.type === type);
  if (filtered.length > 0) {
    const latest = filtered.reduce((max, a) => (a.timestamp > max.timestamp ? a : max));
    const lat = toCoord(type === "entrada" ? latest.entryLatitude : latest.exitLatitude);
    const lng = toCoord(type === "entrada" ? latest.entryLongitude : latest.exitLongitude);
    if (lat !== null && lng !== null) return googleMapsPointUrl(lat, lng);
  }
  if (type === "salida" && trajectoryFallback?.length) {
    for (let i = trajectoryFallback.length - 1; i >= 0; i--) {
      const c = pointCoords(trajectoryFallback[i]!);
      if (c) return googleMapsPointUrl(c.lat, c.lng);
    }
  }
  return null;
}

type AttendanceLike = {
  attendances?: {
    type: string;
    timestamp: string;
    entryLatitude?: unknown;
    entryLongitude?: unknown;
    exitLatitude?: unknown;
    exitLongitude?: unknown;
  }[];
};

export function buildDayRoutePoints(
  attendances: AttendanceLike["attendances"],
  trajectory: GpsCoordPoint[],
): { lat: number; lng: number }[] {
  const out: { lat: number; lng: number }[] = [];
  const entry = attendanceMapUrl(attendances, "entrada");
  if (entry) {
    const m = entry.match(/q=([\d.-]+),([\d.-]+)/);
    if (m) out.push({ lat: Number(m[1]), lng: Number(m[2]) });
  }
  for (const pt of trajectory) {
    const c = pointCoords(pt);
    if (c) out.push(c);
  }
  const exit = attendanceMapUrl(attendances, "salida", trajectory);
  if (exit) {
    const m = exit.match(/q=([\d.-]+),([\d.-]+)/);
    if (m) {
      const last = { lat: Number(m[1]), lng: Number(m[2]) };
      const prev = out[out.length - 1];
      if (!prev || prev.lat !== last.lat || prev.lng !== last.lng) out.push(last);
    }
  }
  return out;
}
