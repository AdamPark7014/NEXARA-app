import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { appUrls, APP_URLS_SIN_CORE, APP_URLS_FUERA_DE_PANEL } from './app-urls.js';

/**
 * Ningún aviso puede apuntar a un panel borrado.
 *
 * `/ops`, `/crm`, `/studio`, `/lab` e `/integra` ya no existen. El middleware de Core
 * manda esas rutas a `/erp/pizarra` **tirando el `highlight`/id por el camino**: el aviso
 * llega, la persona lo toca y aterriza en la pizarra sin el registro que lo originó.
 * Dieciséis avisos de viáticos, cotizaciones, clientes y actividades estaban así.
 *
 * Estas pruebas son la red: si alguien vuelve a escribir una ruta de panel muerto en un
 * `relatedUrl` / `deepLink` / `href`, aquí revienta y no en el teléfono de un ingeniero.
 */

const PANELES_MUERTOS = /\/(ops|crm|studio|lab|integra)(\/|\?|$)/;

describe('appUrls: toda ruta de aviso vive en /erp', () => {
  /** Argumentos de muestra por aridad; el id 42 es el que debe sobrevivir al redirect. */
  const invocar = (fn: (...args: any[]) => string): string[] => {
    const salidas = [fn(42), fn()];
    return salidas.filter((s): s is string => typeof s === 'string');
  };

  const sinCore = new Set<string>(APP_URLS_SIN_CORE);
  const fueraDePanel = new Set<string>(APP_URLS_FUERA_DE_PANEL);

  const entradas = Object.entries(appUrls) as [string, (...a: any[]) => string][];

  it('el catálogo no se quedó vacío (si esto falla, la prueba dejó de mirar nada)', () => {
    expect(entradas.length).toBeGreaterThan(25);
  });

  for (const [nombre, fn] of entradas) {
    if (fueraDePanel.has(nombre)) continue;

    const esperadoEnCore = !sinCore.has(nombre);

    it(`${nombre} → ${esperadoEnCore ? 'queda dentro de /erp' : 'sigue sin pantalla en Core'}`, () => {
      for (const url of invocar(fn)) {
        if (esperadoEnCore) {
          expect(url.startsWith('/erp/') || url === '/erp').toBe(true);
          expect(url).not.toMatch(PANELES_MUERTOS);
        } else {
          // Documentado en APP_URLS_SIN_CORE: no hay destino que inventar todavía.
          expect(url).toMatch(PANELES_MUERTOS);
        }
      }
    });
  }

  it('conserva el identificador del registro (si no, el aviso no lleva a nada)', () => {
    expect(appUrls.erpActividad(42)).toBe('/erp/actividades/42');
    expect(appUrls.erpActividadEvidencias(42)).toBe('/erp/actividades/42/evidencias');
    expect(appUrls.erpClientes(42)).toBe('/erp/clientes/42');
    expect(appUrls.erpCotizaciones(42)).toBe('/erp/cotizaciones/42');
    expect(appUrls.erpProyectos(42)).toBe('/erp/proyectos/42');
    expect(appUrls.erpFinanceViatics(42)).toBe('/erp/finance/viatics?highlight=42');
  });

  it('los alias viejos llevan al mismo sitio que el constructor de Core', () => {
    expect(appUrls.opsActivity(42)).toBe(appUrls.erpActividad(42));
    expect(appUrls.opsActivityEvidences(42)).toBe(appUrls.erpActividadEvidencias(42));
    expect(appUrls.opsEvidencesReview(42)).toBe(appUrls.erpActividadEvidencias(42));
    expect(appUrls.opsMyEvidences(42)).toBe(appUrls.erpActividadEvidencias(42));
    expect(appUrls.opsProject(42)).toBe(appUrls.erpProyectos(42));
    expect(appUrls.opsViatic(42)).toBe(appUrls.erpFinanceViatics(42));
    expect(appUrls.crmClient(42)).toBe(appUrls.erpClientes(42));
    expect(appUrls.crmQuote(42)).toBe(appUrls.erpCotizaciones(42));
    expect(appUrls.crmProject(42)).toBe(appUrls.erpProyectos(42));
  });

  it('sin id concreto, evidencias propias abren «Mis actividades», no la pizarra', () => {
    expect(appUrls.opsMyEvidences()).toBe('/erp/mis-actividades');
  });
});

/**
 * Segunda red: rutas de panel muerto escritas a mano en el código, sin pasar por appUrls.
 * Así estaban los 16 avisos originales.
 */
describe('nadie escribe a mano una ruta de panel muerto', () => {
  const SRC = join(__dirname, '..');

  /**
   * Ficheros que contienen esas rutas por un motivo que no es un enlace de aviso:
   * la matriz RBAC (qué URL abre cada rol), el mapa de navegación y las rutas HTTP de
   * un controlador. No son enlaces que se guarden en una notificación.
   */
  const FICHEROS_EXENTOS = [
    'common/rbac/url-matrix.ts',
    'common/app-urls.ts', // sus excepciones ya las cubre APP_URLS_SIN_CORE, arriba
    'me/me.service.ts',
    'me/navigation-module-map.ts',
    'integra/access-schedule-defaults.ts', // ruta del editor de Integra, no un aviso
    'integra/integra.controller.ts', // rutas HTTP de la API + comentarios
    'page-content/page-content.controller.ts', // @Controller('studio/page-content'): endpoint, no panel
  ];

  /**
   * Enlaces que siguen apuntando fuera de `/erp` porque Core no tiene esa pantalla.
   * Cada uno manda hoy a `/erp/pizarra`; están aquí para que se vean, no para tolerarlos.
   */
  const PENDIENTES_SIN_DESTINO = [
    { fichero: 'activity-feed/activity-feed.service.ts', ruta: '/crm/agenda' },
    { fichero: 'integra/acs-ops-bridge.service.ts', ruta: '/integra/events' },
  ];

  const listarTs = (dir: string, acc: string[] = []): string[] => {
    for (const entrada of readdirSync(dir)) {
      const ruta = join(dir, entrada);
      if (statSync(ruta).isDirectory()) {
        listarTs(ruta, acc);
      } else if (entrada.endsWith('.ts') && !entrada.endsWith('.spec.ts')) {
        acc.push(ruta);
      }
    }
    return acc;
  };

  const rel = (ruta: string) => ruta.slice(SRC.length + 1).split('\\').join('/');

  // Literal de cadena (comilla simple, doble o plantilla) que empieza por un panel muerto.
  const LITERAL = /['"`]\/(ops|crm|studio|lab|integra)(\/|\?)/g;

  const hallazgos: string[] = [];
  let ficherosRevisados = 0;

  for (const ruta of listarTs(SRC)) {
    const relativo = rel(ruta);
    if (FICHEROS_EXENTOS.includes(relativo)) continue;
    ficherosRevisados += 1;

    const contenido = readFileSync(ruta, 'utf8');
    for (const linea of contenido.split('\n')) {
      LITERAL.lastIndex = 0;
      if (!LITERAL.test(linea)) continue;
      const tolerado = PENDIENTES_SIN_DESTINO.some(
        (p) => p.fichero === relativo && linea.includes(p.ruta),
      );
      if (!tolerado) hallazgos.push(`${relativo}: ${linea.trim()}`);
    }
  }

  it('revisó de verdad el árbol de la API', () => {
    expect(ficherosRevisados).toBeGreaterThan(100);
  });

  it('no queda ninguna ruta /ops, /crm, /studio, /lab o /integra sin justificar', () => {
    expect(hallazgos).toEqual([]);
  });
});
