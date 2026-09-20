import { describe, expect, it } from 'vitest';
import { coreSurfaceRedirect } from './core-surface';
import {
  LEGACY_PANEL_PREFIX_MAP,
  normalizeLegacyPath,
  normalizeLegacyRelatedUrl,
  remapLegacySlugs,
} from './legacy-path-remap';

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

  it('los proyectos de Core se quedan en /erp/proyectos', () => {
    // Sin el atajo, el alias `proyectos`→`projects` mandaba la página a `/erp/projects`
    // (308 del middleware a una ruta que no existe).
    expect(normalizeLegacyPath('/erp/proyectos')).toBe('/erp/proyectos');
    expect(normalizeLegacyPath('/erp/proyectos/nuevo')).toBe('/erp/proyectos/nuevo');
    expect(normalizeLegacyPath('/erp/proyectos/42')).toBe('/erp/proyectos/42');
    expect(remapLegacySlugs('/erp/proyectos/42')).toBe('/erp/proyectos/42');
    expect(normalizeLegacyPath('/erp/projects')).toBe('/erp/proyectos');
    expect(normalizeLegacyPath('/erp/projects/42')).toBe('/erp/proyectos/42');
    // Las actividades de proyecto siguen siendo su propio bucket.
    expect(normalizeLegacyPath('/erp/actividades/proyectos')).toBe('/erp/actividades/proyectos');
  });

  it('en superficie Core, los proyectos de OPS abren el mismo proyecto en /erp', () => {
    expect(coreSurfaceRedirect('/ops/projects')).toBe('/erp/proyectos');
    expect(coreSurfaceRedirect('/ops/projects/42')).toBe('/erp/proyectos/42');
    expect(coreSurfaceRedirect('/ops/proyectos/42/')).toBe('/erp/proyectos/42');
    // Lo que ya vive en /erp no se toca.
    expect(coreSurfaceRedirect('/erp/proyectos/42')).toBeNull();
    // Otras rutas de OPS siguen cayendo en la pizarra.
    expect(coreSurfaceRedirect('/ops/work-projects')).toBe('/erp/pizarra');
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
  });

  it('los recursos de Core se quedan en sus rutas en español', () => {
    // Sin el atajo, `almacen`→`warehouse`, `vehiculos`→`vehicles` y `herramientas`→`tools`
    // los sacaban de su página a rutas que en Core rebotan.
    for (const path of [
      '/erp/almacen',
      '/erp/almacen/herramientas',
      '/erp/vehiculos',
      '/erp/vehiculos/12',
      '/erp/vehiculos/mis-vehiculos',
      '/erp/vehiculos/gps',
      '/erp/organigrama',
    ]) {
      expect(normalizeLegacyPath(path)).toBe(path);
      expect(remapLegacySlugs(path)).toBe(path);
    }
    // Los atajos viejos del organigrama llevan a la lectura de Core.
    expect(normalizeLegacyPath('/erp/orgchart')).toBe('/erp/organigrama');
    expect(normalizeLegacyPath('/erp/mi-area')).toBe('/erp/organigrama');
    expect(normalizeLegacyPath('/core/almacen')).toBe('/erp/almacen');
    expect(normalizeLegacyPath('/panel/herramientas')).toBe('/erp/almacen/herramientas');
    expect(normalizeLegacyPath('/panel/vehiculos/3')).toBe('/erp/vehiculos/3');
    // El organigrama de RH (con edición) sigue existiendo fuera de Core.
    expect(normalizeLegacyPath('/erp/hr/orgchart')).toBe('/erp/hr/orgchart');
  });

  it('en superficie Core, vehiculos, herramientas, almacen y organigrama abren su pagina de /erp', () => {
    expect(coreSurfaceRedirect('/ops/vehicles')).toBe('/erp/vehiculos');
    expect(coreSurfaceRedirect('/ops/vehicles/7')).toBe('/erp/vehiculos/7');
    expect(coreSurfaceRedirect('/ops/my-vehicles')).toBe('/erp/vehiculos/mis-vehiculos');
    expect(coreSurfaceRedirect('/ops/mis-vehiculos/')).toBe('/erp/vehiculos/mis-vehiculos');
    expect(coreSurfaceRedirect('/ops/tools')).toBe('/erp/almacen/herramientas');
    expect(coreSurfaceRedirect('/ops/tools/new-inventory')).toBe('/erp/almacen/herramientas');
    expect(coreSurfaceRedirect('/erp/warehouse')).toBe('/erp/almacen');
    expect(coreSurfaceRedirect('/erp/warehouse/stock')).toBe('/erp/almacen');
    expect(coreSurfaceRedirect('/erp/hr/orgchart')).toBe('/erp/organigrama');
    // Lo que ya vive en su ruta de Core no se toca, y el resto de /erp/hr tampoco.
    expect(coreSurfaceRedirect('/erp/almacen')).toBeNull();
    expect(coreSurfaceRedirect('/erp/vehiculos/mis-vehiculos')).toBeNull();
    expect(coreSurfaceRedirect('/erp/hr/fines')).toBeNull();
    // El GPS de OPS no es el de la flotilla: sigue cayendo en la pizarra.
    expect(coreSurfaceRedirect('/ops/gps')).toBe('/erp/pizarra');
  });

  it('los avisos viejos de vehiculos, herramientas y almacen conservan su query', () => {
    expect(normalizeLegacyRelatedUrl('/ops/my-vehicles?highlight=5')).toBe('/erp/vehiculos/mis-vehiculos?highlight=5');
    expect(normalizeLegacyRelatedUrl('/ops/tools?tab=requests&highlight=9')).toBe(
      '/erp/almacen/herramientas?tab=requests&highlight=9',
    );
    expect(normalizeLegacyRelatedUrl('/ops/vehicles?tab=requests&highlight=2')).toBe(
      '/erp/vehiculos?tab=requests&highlight=2',
    );
    expect(normalizeLegacyRelatedUrl('/erp/warehouse?movementId=4')).toBe('/erp/almacen?movementId=4');
    // Las URLs nuevas del API ya llegan en su sitio.
    expect(normalizeLegacyRelatedUrl('/erp/almacen/herramientas?tab=renewals&highlight=1')).toBe(
      '/erp/almacen/herramientas?tab=renewals&highlight=1',
    );
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
    for (const path of ['/erp/contabilidad', '/crm/quotes/12', '/ops/activities', '/tickets/4']) {
      expect(normalizeLegacyPath(path)).toBe(path);
      expect(normalizeLegacyPath(normalizeLegacyPath(path))).toBe(path);
    }
  });

  it('manda /erp/accounting al escritorio Contadora', () => {
    expect(normalizeLegacyPath('/erp/accounting')).toBe('/erp/contabilidad');
    expect(normalizeLegacyPath('/erp/accounting/')).toBe('/erp/contabilidad');
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
