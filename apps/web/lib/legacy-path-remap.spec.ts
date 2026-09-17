import { describe, expect, it } from 'vitest';
import { LEGACY_PANEL_PREFIX_MAP, normalizeLegacyPath, remapLegacySlugs } from './legacy-path-remap';

describe('normalizeLegacyPath · bookmarks viejos → ruta canónica', () => {
  it('traduce los paneles legacy de primer nivel', () => {
    expect(normalizeLegacyPath('/core')).toBe('/erp/dashboard');
    expect(normalizeLegacyPath('/sales/dashboard')).toBe('/crm/dashboard');
    expect(normalizeLegacyPath('/ventas')).toBe('/crm');
    expect(normalizeLegacyPath('/portal')).toBe('/tickets');
    expect(normalizeLegacyPath('/web')).toBe('/studio');
  });

  it('traduce los slugs en español dentro de un panel canónico', () => {
    expect(normalizeLegacyPath('/crm/cotizaciones')).toBe('/crm/quotes');
    expect(normalizeLegacyPath('/crm/clientes')).toBe('/crm/clients');
    expect(normalizeLegacyPath('/ops/herramientas')).toBe('/ops/tools');
    expect(normalizeLegacyPath('/erp/documentos')).toBe('/erp/documents');
  });

  it('las cotizaciones de Core se quedan en /erp', () => {
    // Antes `/erp/cotizaciones` se remapeaba a `/crm/quotes` y, en superficie Core, acababa
    // rebotando a la pizarra: la página nueva del contrato del viernes era inalcanzable.
    expect(normalizeLegacyPath('/erp/cotizaciones')).toBe('/erp/cotizaciones');
    expect(normalizeLegacyPath('/erp/cotizaciones/12')).toBe('/erp/cotizaciones/12');
    expect(normalizeLegacyPath('/erp/cotizaciones/nueva')).toBe('/erp/cotizaciones/nueva');
    expect(normalizeLegacyPath('/erp/quotes')).toBe('/erp/cotizaciones');
  });

  it('aplica los remapeos cross-panel conservando el resto de la ruta', () => {
    expect(normalizeLegacyPath('/core/cotizaciones/17')).toBe('/crm/quotes/17');
    // Regresión: el destino llevaba '$1' literal y salía '/tickets$1/9', que
    // la whitelist del rol `cliente` no reconoce.
    expect(normalizeLegacyPath('/panel/tickets/9')).toBe('/tickets/9');
    expect(normalizeLegacyPath('/panel/tickets')).toBe('/tickets');
    expect(normalizeLegacyPath('/erp/clientes/3')).toBe('/erp/clientes/3');
    expect(normalizeLegacyPath('/erp/clientes')).toBe('/erp/clientes');
    expect(normalizeLegacyPath('/erp/clients')).toBe('/erp/clientes');
    expect(normalizeLegacyPath('/erp/clients/3')).toBe('/erp/clientes/3');
  });

  it('lleva los módulos de RH a su subárbol', () => {
    expect(normalizeLegacyPath('/erp/asistencia')).toBe('/erp/hr/attendance');
    expect(normalizeLegacyPath('/erp/multas')).toBe('/erp/hr/fines');
    expect(normalizeLegacyPath('/erp/organigrama')).toBe('/erp/hr/orgchart');
  });

  it('no duplica el segmento de panel al encadenar prefijo y slug', () => {
    // `/people/hr/...` llegó a producir `/erp/hr/hr/...`; el dedupe lo evita.
    expect(normalizeLegacyPath('/people/hr')).toBe('/erp/hr');
    expect(normalizeLegacyPath('/people')).toBe('/erp/hr');
  });

  it('descarta querystring y barra final', () => {
    expect(normalizeLegacyPath('/crm/cotizaciones/')).toBe('/crm/quotes');
    expect(normalizeLegacyPath('/crm/cotizaciones?tab=x')).toBe('/crm/quotes');
  });

  it('la raíz sobrevive', () => {
    expect(normalizeLegacyPath('/')).toBe('/');
  });

  it('deja intactas las rutas ya canónicas (es idempotente)', () => {
    for (const path of ['/erp/accounting', '/crm/quotes/12', '/ops/activities', '/tickets/4']) {
      expect(normalizeLegacyPath(path)).toBe(path);
      expect(normalizeLegacyPath(normalizeLegacyPath(path))).toBe(path);
    }
  });

  it('remapLegacySlugs no toca paneles ajenos al ERP', () => {
    expect(remapLegacySlugs('/blog/cotizaciones')).toBe('/blog/cotizaciones');
  });

  it('preserva buckets Core ERP /erp/actividades/* en español', () => {
    for (const path of [
      '/erp/actividades/tareas',
      '/erp/actividades/proyectos',
      '/erp/actividades/servicios',
      '/erp/actividades/diarias',
    ]) {
      expect(remapLegacySlugs(path)).toBe(path);
      expect(normalizeLegacyPath(path)).toBe(path);
    }
  });

  it('preserva /erp/asistencias y no lo confunde con /asistencia', () => {
    expect(normalizeLegacyPath('/erp/asistencias')).toBe('/erp/asistencias');
    expect(remapLegacySlugs('/erp/asistencias')).toBe('/erp/asistencias');
    // singular legacy sigue yendo a HR
    expect(normalizeLegacyPath('/erp/asistencia')).toBe('/erp/hr/attendance');
    // plural mal formado (caché 308 viejo) → Core
    expect(normalizeLegacyPath('/erp/hr/attendances')).toBe('/erp/asistencias');
  });

  it('todo destino del mapa de prefijos es una ruta canónica', () => {
    const canonicalPanels = ['/erp', '/crm', '/ops', '/studio', '/lab', '/tickets'];
    for (const target of Object.values(LEGACY_PANEL_PREFIX_MAP)) {
      expect(canonicalPanels.some((panel) => target === panel || target.startsWith(`${panel}/`))).toBe(true);
    }
  });
});
