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

  it('aplica los remapeos cross-panel conservando el resto de la ruta', () => {
    expect(normalizeLegacyPath('/core/cotizaciones/17')).toBe('/crm/quotes/17');
    // Regresión: el destino llevaba '$1' literal y salía '/tickets$1/9', que
    // la whitelist del rol `cliente` no reconoce.
    expect(normalizeLegacyPath('/panel/tickets/9')).toBe('/tickets/9');
    expect(normalizeLegacyPath('/panel/tickets')).toBe('/tickets');
    expect(normalizeLegacyPath('/erp/clientes/3')).toBe('/crm/clients/3');
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

  it('todo destino del mapa de prefijos es una ruta canónica', () => {
    const canonicalPanels = ['/erp', '/crm', '/ops', '/studio', '/lab', '/tickets'];
    for (const target of Object.values(LEGACY_PANEL_PREFIX_MAP)) {
      expect(canonicalPanels.some((panel) => target === panel || target.startsWith(`${panel}/`))).toBe(true);
    }
  });
});
