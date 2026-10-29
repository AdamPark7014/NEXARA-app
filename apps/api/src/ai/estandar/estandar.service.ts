import { BadRequestException, Injectable } from '@nestjs/common';
import { sitioOficina } from '../../attendance/asistencia-confiable.js';
import { TABLA_ESTANDAR, TOPE_ESTANDAR_MIN } from './tabla-estandar.js';
import { calcularRuta, puntoValido, type ModoTraslado, type Ruta } from './rutas.js';

/** Una ruta cambia poco en una hora: se guarda por destino (redondeado a ~100 m) y modo. */
const CACHE_RUTA_MS = 60 * 60_000;

@Injectable()
export class EstandarService {
  private readonly cache = new Map<string, { hasta: number; ruta: Ruta }>();

  tabla() {
    const oficina = sitioOficina();
    return { reglas: TABLA_ESTANDAR, topeMin: TOPE_ESTANDAR_MIN, origen: { nombre: oficina.nombre } };
  }

  async ruta(body: { lat: number; lng: number; modo?: string; salida?: string | null }): Promise<Ruta & { origen: string }> {
    const destino = { lat: Number(body.lat), lng: Number(body.lng) };
    if (!puntoValido(destino)) throw new BadRequestException('Marca el destino en el mapa.');
    const modo: ModoTraslado = body.modo === 'TRANSPORTE' ? 'TRANSPORTE' : 'AUTO';
    const oficina = sitioOficina();
    const origen = { lat: oficina.latitude, lng: oficina.longitude };
    const clave = `${destino.lat.toFixed(3)},${destino.lng.toFixed(3)}:${modo}`;
    const guardada = this.cache.get(clave);
    if (guardada && guardada.hasta > Date.now()) return { ...guardada.ruta, origen: oficina.nombre };
    const salida = body.salida ? new Date(body.salida) : null;
    const ruta = await calcularRuta(origen, destino, modo, {
      googleKey: process.env.GOOGLE_MAPS_API_KEY,
      osrmUrl: process.env.OSRM_URL,
      salida: salida && !Number.isNaN(salida.getTime()) ? salida : null,
    });
    // Lo aproximado no se guarda: al siguiente intento puede responder la ruta real.
    if (ruta.fuente !== 'aproximado') this.cache.set(clave, { hasta: Date.now() + CACHE_RUTA_MS, ruta });
    return { ...ruta, origen: oficina.nombre };
  }
}
