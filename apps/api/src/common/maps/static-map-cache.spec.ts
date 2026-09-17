import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  budgetStatus,
  buildFallbackStaticMapUrl,
  buildGoogleStaticMapUrl,
  cacheKeyFor,
  hasBudget,
  isUsableCoordinate,
  normalizeRequest,
  pruneCache,
  quantize,
  resetBudget,
  samplePath,
} from './static-map-cache';
import { parsePathParam } from './static-map.controller';

describe('static-map-cache', () => {
  describe('cuantización de coordenadas', () => {
    it('redondea a 5 decimales', () => {
      expect(quantize(19.073802875589788)).toBe(19.0738);
      expect(quantize(-98.2778382565653)).toBe(-98.27784);
    });

    it('da la misma clave a dos lecturas del mismo punto', () => {
      // Dos checadas del mismo técnico en la misma puerta: el GPS varía en el
      // sexto decimal (≈10 cm). Sin cuantizar serían dos compras.
      const a = cacheKeyFor({ lat: 19.4326123, lng: -99.1332456, zoom: 16 });
      const b = cacheKeyFor({ lat: 19.4326128, lng: -99.1332451, zoom: 16 });
      expect(a).toBe(b);
    });

    it('separa por zoom, tamaño y tipo de mapa', () => {
      const base = { lat: 19.4326, lng: -99.1332 };
      expect(cacheKeyFor({ ...base, zoom: 16 })).not.toBe(cacheKeyFor({ ...base, zoom: 15 }));
      expect(cacheKeyFor({ ...base, width: 600 })).not.toBe(cacheKeyFor({ ...base, width: 300 }));
      expect(cacheKeyFor({ ...base, mapType: 'roadmap' })).not.toBe(cacheKeyFor({ ...base, mapType: 'hybrid' }));
    });

    it('produce un nombre de archivo seguro incluso con un recorrido largo', () => {
      const points = Array.from({ length: 300 }, (_, i) => ({ lat: 19.4 + i / 10000, lng: -99.1 - i / 10000 }));
      const key = cacheKeyFor({ lat: 19.4, lng: -99.1, path: points });
      expect(key).toMatch(/^[A-Za-z0-9_.,@x-]+$/);
      expect(key.length).toBeLessThan(80);
    });
  });

  describe('normalización', () => {
    it('recorta el tamaño al máximo que acepta la API gratuita', () => {
      expect(normalizeRequest({ lat: 1, lng: 1, width: 4000, height: 4000 })).toMatchObject({
        width: 640,
        height: 640,
      });
    });

    it('rechaza un tipo de mapa desconocido', () => {
      expect(normalizeRequest({ lat: 1, lng: 1, mapType: 'pirata' as never }).mapType).toBe('roadmap');
    });

    it('limita el recorrido a 40 puntos conservando extremos', () => {
      const points = Array.from({ length: 500 }, (_, i) => ({ lat: i / 1000, lng: i / 1000 }));
      const sampled = samplePath(points, 40);
      expect(sampled).toHaveLength(40);
      expect(sampled[0]).toEqual(points[0]);
      expect(sampled[39]).toEqual(points[499]);
    });
  });

  describe('coordenadas utilizables', () => {
    it('descarta null island, nulos y fuera de rango', () => {
      expect(isUsableCoordinate(0, 0)).toBe(false);
      expect(isUsableCoordinate(null, null)).toBe(false);
      expect(isUsableCoordinate(120, 10)).toBe(false);
      expect(isUsableCoordinate(19.4326, -99.1332)).toBe(true);
    });
  });

  describe('URL de Google', () => {
    it('manda un solo marcador para un punto', () => {
      const url = buildGoogleStaticMapUrl({ lat: 19.4326, lng: -99.1332, zoom: 16 }, 'CLAVE');
      expect(url).toContain('center=19.4326%2C-99.1332');
      expect(url).toContain('zoom=16');
      expect(url).toContain('key=CLAVE');
      expect(url.match(/markers=/g)).toHaveLength(1);
    });

    it('con recorrido usa path y deja que Google encuadre', () => {
      const url = buildGoogleStaticMapUrl({
        lat: 19.4,
        lng: -99.1,
        path: [{ lat: 19.4, lng: -99.1 }, { lat: 19.5, lng: -99.2 }],
      }, 'CLAVE');
      expect(url).toContain('path=');
      expect(url).not.toContain('center=');
      expect(url).not.toContain('zoom=');
    });

    it('el proveedor gratuito no lleva clave', () => {
      expect(buildFallbackStaticMapUrl({ lat: 19.4326, lng: -99.1332 })).not.toContain('key=');
    });
  });

  describe('presupuesto diario', () => {
    afterEach(() => {
      delete process.env['STATIC_MAP_DAILY_BUDGET'];
      resetBudget();
    });

    it('arranca con el presupuesto entero', () => {
      resetBudget();
      expect(hasBudget()).toBe(true);
      expect(budgetStatus().spent).toBe(0);
    });

    it('respeta el límite configurado', () => {
      process.env['STATIC_MAP_DAILY_BUDGET'] = '250';
      resetBudget();
      expect(budgetStatus().limit).toBe(250);
    });
  });

  describe('poda', () => {
    let dir: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexara-static-map-'));
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
      delete process.env['STATIC_MAP_TTL_DAYS'];
      delete process.env['STATIC_MAP_CACHE_MAX_MB'];
    });

    it('borra lo caducado', () => {
      const viejo = path.join(dir, 'viejo.png');
      const nuevo = path.join(dir, 'nuevo.png');
      fs.writeFileSync(viejo, Buffer.alloc(64));
      fs.writeFileSync(nuevo, Buffer.alloc(64));
      const hace40Dias = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      fs.utimesSync(viejo, hace40Dias, hace40Dias);

      const result = pruneCache(dir);

      expect(result.removed).toBe(1);
      expect(fs.existsSync(viejo)).toBe(false);
      expect(fs.existsSync(nuevo)).toBe(true);
    });

    it('desaloja lo menos usado al pasarse del techo', () => {
      process.env['STATIC_MAP_CACHE_MAX_MB'] = '0.0002'; // ~200 bytes
      for (const name of ['a.png', 'b.png', 'c.png']) {
        fs.writeFileSync(path.join(dir, name), Buffer.alloc(100));
      }
      const viejoUso = new Date(Date.now() - 60 * 60 * 1000);
      fs.utimesSync(path.join(dir, 'a.png'), viejoUso, new Date());

      pruneCache(dir);

      expect(fs.existsSync(path.join(dir, 'a.png'))).toBe(false);
      expect(fs.readdirSync(dir).length).toBeLessThan(3);
    });

    it('no revienta si el directorio no existe', () => {
      expect(() => pruneCache(path.join(dir, 'no-existe'))).not.toThrow();
    });
  });

  describe('parámetro path del endpoint', () => {
    it('lee pares lat,lng separados por |', () => {
      expect(parsePathParam('19.4,-99.1|19.5,-99.2')).toEqual([
        { lat: 19.4, lng: -99.1 },
        { lat: 19.5, lng: -99.2 },
      ]);
    });

    it('descarta basura y puntos inservibles', () => {
      expect(parsePathParam('19.4,-99.1|0,0|abc|,,')).toEqual([{ lat: 19.4, lng: -99.1 }]);
      expect(parsePathParam(undefined)).toEqual([]);
      expect(parsePathParam('')).toEqual([]);
    });
  });
});
