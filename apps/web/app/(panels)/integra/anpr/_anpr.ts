/**
 * Contrato real de `POST /artemis/api/pms/v1/crossRecords/page`.
 *
 * Fuente: HikCentral Professional OpenAPI V3.0.1 Developer Guide,
 * §5.8.2 (petición y respuesta) y anexo A.1.71 `PassVehicleRecord`.
 * `apps/api` reenvía el cuerpo tal cual (`integra.controller.ts` → `anprRecords`)
 * y `HikCentralArtemisClient.post` ya desenvuelve `data`, así que lo que llega
 * al navegador es exactamente el objeto `data` del manual.
 *
 * Todo lo que hay aquí sale de ese documento. Nada está inventado: si un campo
 * no aparece en la tabla A-73, no se pinta. En concreto, la versión anterior de
 * esta pantalla mostraba una columna «Entrada» leyendo `entranceName`, un campo
 * que NO existe en `PassVehicleRecord`; por eso siempre salía «—».
 */

/** Tabla A-73 · PassVehicleRecord. Todo opcional salvo los dos identificadores. */
export type AnprRecord = {
  /** Req. — id del cruce, hasta 64 caracteres. */
  crossRecordSyscode?: string;
  /** Req. — cámara que leyó la placa. */
  cameraIndexCode?: string;
  plateNo?: string;
  ownerName?: string;
  contact?: string;
  /** Enum «Vehicle Color» del manual. */
  vehicleColor?: number;
  /** Enum «Vehicle Type» del manual. */
  vehicleType?: number;
  /** Enum «Country/Region». No se pinta: no tenemos la tabla completa. */
  country?: number;
  /** URI interna de la foto en la plataforma. NO es una URL de navegador. */
  vehiclePicUri?: string;
  /** ISO 8601 con huso: `2018-07-26T15:00:00+08:00`. */
  crossTime?: string;
  createTime?: string;
  /** 0 otras, 1 acercándose a la cámara, 2 alejándose. */
  vehicleDirectionType?: number;
  /** Enum «Vehicle Brand». No se pinta: la tabla del manual está incompleta. */
  vehicleBrand?: number;
  vehicleSpeed?: number;
};

/** Objeto `data` de la respuesta (§5.8.2). */
export type AnprPageResponse = {
  total?: number;
  pageNo?: number;
  pageSize?: number;
  list?: AnprRecord[];
};

/**
 * Cuerpo de la petición. Los `Opt.` del manual son filtros DE SERVIDOR: al
 * mandarlos, HikCentral acota la búsqueda entera, no la página descargada.
 */
export type AnprQuery = {
  /** Req. — 1 a 2 147 483 647. */
  pageNo: number;
  /** Req. — entre 1 y 500. */
  pageSize: number;
  /** Req. — ISO 8601 con huso. */
  startTime: string;
  /** Req. — ISO 8601 con huso. Máximo 31 días desde `startTime`. */
  endTime: string;
  /**
   * El manual la marca Req., pero el backend reenvía el cuerpo sin tocarlo y
   * la instalación acepta la búsqueda sin cámara (devuelve todas las del
   * parque). Se manda solo si el operador elige una.
   */
  cameraIndexCode?: string;
  /** Filtro de servidor. Hasta 16 caracteres. */
  plateNo?: string;
  /** Filtro de servidor. Hasta 64 caracteres. */
  ownerName?: string;
  /** Único valor admitido por el manual. */
  sortField?: "PassTime";
  /** 0 ascendente · 1 descendente (valor por defecto de la plataforma). */
  orderType?: 0 | 1;
};

/** El manual limita la ventana de búsqueda a 31 días. */
export const ANPR_MAX_RANGE_DAYS = 31;
/** `pageSize` documentado: entre 1 y 500. */
export const ANPR_MAX_PAGE_SIZE = 500;
/** `plateNo` documentado: hasta 16 caracteres. */
export const ANPR_MAX_PLATE_LEN = 16;

/** Enum «Vehicle Type» del manual, traducido. */
const VEHICLE_TYPE: Record<number, string> = {
  0: "Otro",
  1: "Vehículo de pasajeros",
  2: "Camión",
  3: "Sedán",
  4: "Minivan",
  5: "Camioneta ligera",
  6: "Peatón",
  7: "Motocicleta",
  8: "Triciclo",
  9: "SUV / MPV",
  10: "Autobús mediano",
  11: "Vehículo de motor",
  12: "Vehículo sin motor",
  13: "Sedán compacto",
  14: "Sedán mini",
  15: "Pick-up",
  16: "Tráiler de contenedor",
  17: "Camioneta de redilas",
  18: "Camión de volteo",
  19: "Grúa / vehículo de obra",
  20: "Pipa (cisterna)",
  21: "Revolvedora de concreto",
  22: "Grúa de plataforma",
  23: "Hatchback",
  24: "Sedán salón",
  25: "Sedán deportivo",
  26: "Microbús",
};

/** Enum «Vehicle Color» del manual, traducido. */
const VEHICLE_COLOR: Record<number, string> = {
  0: "Otro color",
  1: "Blanco",
  2: "Plata",
  3: "Gris",
  4: "Negro",
  5: "Rojo",
  6: "Azul oscuro",
  7: "Azul",
  8: "Amarillo",
  9: "Verde",
  10: "Café",
  11: "Rosa",
  12: "Morado",
  13: "Gris oscuro",
  14: "Cian",
};

/** `vehicleDirectionType` del manual, en lenguaje de operador. */
const DIRECTION: Record<number, string> = {
  0: "Otra dirección",
  1: "Acercándose a la cámara",
  2: "Alejándose de la cámara",
};

function decode(table: Record<number, string>, v?: number): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  // Un código fuera de tabla se enseña tal cual: mentir con «Otro» esconde que
  // la plataforma devolvió algo que aquí no sabemos leer.
  return table[v] ?? `Código ${v}`;
}

export const anprVehicleType = (v?: number) => decode(VEHICLE_TYPE, v);
export const anprVehicleColor = (v?: number) => decode(VEHICLE_COLOR, v);
export const anprDirection = (v?: number) => decode(DIRECTION, v);

/**
 * ISO 8601 con desplazamiento local — `2026-09-04T18:30:00-06:00`.
 *
 * El manual pide literalmente «+current zone» y da ese ejemplo. `toISOString()`
 * entrega la forma UTC con `Z`; equivalente en el estándar, pero HikCentral es
 * quisquilloso con el formato y esta pantalla venía fallando siempre.
 */
export function toArtemisTime(datetimeLocal: string): string | null {
  if (!datetimeLocal) return null;
  const d = new Date(datetimeLocal);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const offset = `${sign}${pad(offsetMin / 60)}:${pad(offsetMin % 60)}`;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offset}`
  );
}

/** Días (con decimales) entre dos valores de `datetime-local`. */
export function rangeDays(startLocal: string, endLocal: string): number | null {
  const a = new Date(startLocal).getTime();
  const b = new Date(endLocal).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return (b - a) / 86_400_000;
}
