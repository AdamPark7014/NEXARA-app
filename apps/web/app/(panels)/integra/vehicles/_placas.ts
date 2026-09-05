"use client";

/**
 * Lógica del inventario de placas.
 *
 * ── Lo que hace el servidor y hay que respetar ───────────────────────────────
 * `POST /integra/vehicles` (integra-artemis.service.ts → `addVehicle`) en la
 * rama ISAPI hace:
 *
 *     const plate = body.plateNo.trim().toUpperCase();
 *     if (!plate) throw new BadRequestException('Placa requerida');
 *     const vehicleId = `local-${plate.replace(/[^A-Z0-9]/gi, '')}`;
 *     await this.prisma.integraVehicle.upsert({ where: { siteId_vehicleId: … } … })
 *
 * De ahí salen las dos reglas que importan y que no son opinión:
 *
 * 1. La identidad de un vehículo es su placa **sin nada que no sea letra o
 *    número**. `ABC-123` y `ABC 123` son el mismo vehículo para el servidor.
 * 2. Es un `upsert`, no un `create`: dar de alta una placa que ya existe
 *    **sobrescribe la ficha anterior en silencio**, dueño incluido. Por eso la
 *    pantalla lo detecta antes y lo dice, en vez de dejar que pase.
 *
 * `plateNo` es `VARCHAR(40)` en `integra_vehicles`.
 */

/** `integra_vehicles.plateNo` es VARCHAR(40): más no cabe. */
export const PLACA_MAX = 40;

/**
 * Por debajo de esto la placa es casi seguro un dedazo, pero se deja guardar:
 * avisar es correcto, bloquear un dato que el servidor sí acepta no lo es.
 */
export const PLACA_ALFANUM_ESPERADOS = 5;

export type Vehiculo = {
  id: string;
  plate: string;
  personId?: string | null;
  personName?: string | null;
};

export type RespuestaVehiculos = {
  total?: number;
  /** `mirror` = espejo en NEXARA. `live` = leído de la plataforma. */
  source?: string;
  syncNote?: string;
  items?: Vehiculo[];
};

export type PersonaResumen = {
  id: string;
  name: string;
  code?: string;
  orgName?: string;
};

export type RespuestaPersonas = { items?: PersonaResumen[] };

/** Lo mismo que hace el servidor antes de guardar: recortar y mayúsculas. */
export function normalizarPlaca(bruta: string): string {
  return bruta.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * La clave con la que el servidor identifica al vehículo. Replica exactamente
 * `plate.replace(/[^A-Z0-9]/gi, '')`: dos placas con la misma clave son, para
 * el backend, el mismo vehículo.
 */
export function claveDePlaca(placa: string): string {
  return normalizarPlaca(placa).replace(/[^A-Z0-9]/g, "");
}

export type ValidacionPlaca = {
  /** Si se puede mandar al servidor. */
  valida: boolean;
  /** Tal y como quedará guardada. */
  normalizada: string;
  /** Motivo por el que no se puede mandar. */
  error: string | null;
  /** Se puede mandar, pero huele raro. No bloquea. */
  aviso: string | null;
};

export function validarPlaca(bruta: string): ValidacionPlaca {
  const normalizada = normalizarPlaca(bruta);
  const base: ValidacionPlaca = { valida: false, normalizada, error: null, aviso: null };

  if (!normalizada) {
    return { ...base, error: "Escribe una placa." };
  }
  if (normalizada.length > PLACA_MAX) {
    return {
      ...base,
      error: `La placa no puede pasar de ${PLACA_MAX} caracteres; esta tiene ${normalizada.length}.`,
    };
  }
  if (!/^[A-Z0-9 -]+$/.test(normalizada)) {
    return {
      ...base,
      error: "Solo se admiten letras, números, espacios y guiones.",
    };
  }

  const alfanumericos = claveDePlaca(normalizada).length;
  if (alfanumericos === 0) {
    // Sin letras ni números el servidor construiría el id `local-`, el mismo
    // para todas: la siguiente alta pisaría a esta.
    return {
      ...base,
      error:
        "Una placa necesita alguna letra o número: el servidor los usa para construir su identificador.",
    };
  }

  return {
    ...base,
    valida: true,
    aviso:
      alfanumericos < PLACA_ALFANUM_ESPERADOS
        ? `Solo ${alfanumericos} caracteres útiles. Se puede guardar, pero una placa suele tener ${PLACA_ALFANUM_ESPERADOS} o más.`
        : null,
  };
}

/**
 * Busca si otra ficha ya ocupa esa placa.
 *
 * `exceptoId` deja fuera la que se está editando: no es un duplicado de sí
 * misma. Compara por clave, no por texto, porque `ABC-123` y `ABC 123` son la
 * misma placa para el servidor.
 */
export function placaDuplicada(
  placa: string,
  vehiculos: Vehiculo[],
  exceptoId?: string | null,
): Vehiculo | null {
  const clave = claveDePlaca(placa);
  if (!clave) return null;
  return (
    vehiculos.find((v) => v.id !== exceptoId && claveDePlaca(v.plate) === clave) ?? null
  );
}

export type FiltroDueno = "" | "con" | "sin";

export type FiltrosVehiculos = {
  q: string;
  dueno: FiltroDueno;
};

export const FILTROS_VEHICULOS_INICIALES: FiltrosVehiculos = { q: "", dueno: "" };

export function esFiltroDueno(v: string): v is FiltroDueno {
  return v === "" || v === "con" || v === "sin";
}

export function tieneDueno(v: Vehiculo): boolean {
  return Boolean(v.personId || v.personName);
}

export function filtrarVehiculos(
  items: Vehiculo[],
  filtros: FiltrosVehiculos,
): Vehiculo[] {
  const q = filtros.q.trim().toLowerCase();
  const claveQ = claveDePlaca(filtros.q);
  return items.filter((v) => {
    if (filtros.dueno === "con" && !tieneDueno(v)) return false;
    if (filtros.dueno === "sin" && tieneDueno(v)) return false;
    if (!q) return true;
    const enTexto =
      v.plate.toLowerCase().includes(q) ||
      (v.personName || "").toLowerCase().includes(q) ||
      (v.personId || "").toLowerCase().includes(q);
    // Buscar «ABC123» también tiene que encontrar «ABC-123».
    const enClave = claveQ.length > 0 && claveDePlaca(v.plate).includes(claveQ);
    return enTexto || enClave;
  });
}

export function hayFiltroVehiculos(filtros: FiltrosVehiculos): boolean {
  return filtros.q.trim() !== "" || filtros.dueno !== "";
}

export type Dueno =
  | { estado: "sin-dueno" }
  /** Persona presente en el padrón que se acaba de cargar. */
  | { estado: "conocido"; id: string; nombre: string; persona: PersonaResumen }
  /** Hay `personId`, pero esa persona ya no está en el padrón. */
  | { estado: "ausente"; id: string; nombre: string | null };

/**
 * Cruza el vehículo con el padrón de personas.
 *
 * `personName` que guarda el servidor es una foto del momento del alta: si la
 * persona se dio de baja del ACS, el nombre sigue ahí y la persona no. Eso se
 * dice, no se disimula, porque una placa cuyo dueño ya no existe es justo lo
 * que hay que revisar.
 */
export function resolverDueno(v: Vehiculo, personas: PersonaResumen[]): Dueno {
  const id = v.personId?.trim();
  if (!id) {
    // Puede haber nombre sin id si vino de la plataforma; se trata como suelto.
    const nombre = v.personName?.trim();
    return nombre ? { estado: "ausente", id: "", nombre } : { estado: "sin-dueno" };
  }
  const persona = personas.find((p) => p.id === id);
  if (persona) return { estado: "conocido", id, nombre: persona.name, persona };
  return { estado: "ausente", id, nombre: v.personName?.trim() || null };
}

/** Nombre + lo que haga falta para distinguir a dos personas que se llaman igual. */
export function etiquetaPersona(p: PersonaResumen): string {
  const extras = [p.code, p.orgName].filter((x): x is string => Boolean(x && x.trim()));
  return extras.length > 0 ? `${p.name} (${extras.join(" · ")})` : p.name;
}

export function contarSinDueno(items: Vehiculo[]): number {
  return items.filter((v) => !tieneDueno(v)).length;
}
