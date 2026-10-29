import { BadRequestException, Injectable } from '@nestjs/common';
import { sitioOficina } from '../../attendance/asistencia-confiable.js';
import { TABLA_ESTANDAR, TOPE_ESTANDAR_MIN } from './tabla-estandar.js';
import { calcularRuta, puntoValido, type ModoTraslado, type Ruta } from './rutas.js';

/** Una ruta cambia poco en una hora: se guarda por origen y destino (redondeados a ~100 m) y modo. */
const CACHE_RUTA_MS = 60 * 60_000;
/** Tope de rutas guardadas: al pasarlo sale la que lleva más tiempo sin usarse. */
export const CACHE_RUTA_TOPE = 500;

type CuerpoRuta = {
  lat: number;
  lng: number;
  modo?: string;
  salida?: string | null;
  origenLat?: number | null;
  origenLng?: number | null;
  origenNombre?: string | null;
};

@Injectable()
export class EstandarService {
  private readonly cache = new Map<string, { hasta: number; ruta: Ruta }>();

  tabla() {
    const oficina = sitioOficina();
    return { reglas: TABLA_ESTANDAR, topeMin: TOPE_ESTANDAR_MIN, origen: { nombre: oficina.nombre } };
  }

  /** Cuántas rutas hay guardadas (para las pruebas del tope). */
  get rutasGuardadas(): number {
    return this.cache.size;
  }

  async ruta(body: CuerpoRuta): Promise<Ruta & { origen: string }> {
    const destino = { lat: Number(body.lat), lng: Number(body.lng) };
    if (!puntoValido(destino)) throw new BadRequestException('Marca el destino en el mapa.');
    const modo: ModoTraslado = body.modo === 'TRANSPORTE' ? 'TRANSPORTE' : 'AUTO';
    // La oficina, salvo que la actividad diga de dónde sale.
    const oficina = sitioOficina();
    const propio = body.origenLat != null && body.origenLng != null ? { lat: Number(body.origenLat), lng: Number(body.origenLng) } : null;
    const conPropio = Boolean(propio && puntoValido(propio));
    const origen = conPropio ? propio! : { lat: oficina.latitude, lng: oficina.longitude };
    const nombreOrigen = conPropio ? (body.origenNombre?.trim() || 'el punto de partida') : oficina.nombre;
    const clave = `${origen.lat.toFixed(3)},${origen.lng.toFixed(3)}>${destino.lat.toFixed(3)},${destino.lng.toFixed(3)}:${modo}`;
    const guardada = this.cache.get(clave);
    if (guardada && guardada.hasta > Date.now()) {
      // Usada otra vez: pasa al final (la que sale al llenarse es la de hace más tiempo).
      this.cache.delete(clave);
      this.cache.set(clave, guardada);
      return { ...guardada.ruta, origen: nombreOrigen };
    }
    if (guardada) this.cache.delete(clave);
    const salida = body.salida ? new Date(body.salida) : null;
    const ruta = await calcularRuta(origen, destino, modo, {
      googleKey: process.env.GOOGLE_MAPS_API_KEY,
      osrmUrl: process.env.OSRM_URL,
      salida: salida && !Number.isNaN(salida.getTime()) ? salida : null,
    });
    // Lo aproximado no se guarda: al siguiente intento puede responder la ruta real.
    if (ruta.fuente !== 'aproximado') {
      this.cache.set(clave, { hasta: Date.now() + CACHE_RUTA_MS, ruta });
      while (this.cache.size > CACHE_RUTA_TOPE) this.cache.delete(this.cache.keys().next().value as string);
    }
    return { ...ruta, origen: nombreOrigen };
  }
}
