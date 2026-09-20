import { CORE_EXTRA_MODULES, deriveModuleKeysFromPaths } from './navigation-module-map.js';

describe('deriveModuleKeysFromPaths', () => {
  it('emite claves Android y web ModuleIds sin ghost integra-acs', () => {
    const { moduleKeys, webModuleIds } = deriveModuleKeysFromPaths([
      '/ops/viatics/**',
      '/crm/quotes/**',
      '/integra/alarms/**',
      '/integra/**',
    ]);

    expect(moduleKeys).toContain('viatics');
    expect(moduleKeys).toContain('my-viatics');
    expect(moduleKeys).toContain('cotizaciones');
    expect(moduleKeys).toContain('integra-alarms');
    expect(moduleKeys).not.toContain('integra-acs');

    expect(webModuleIds).toContain('ops-viatics');
    expect(webModuleIds).toContain('crm-quotes');
    expect(webModuleIds).toContain('integra-alarms');
    expect(webModuleIds).not.toContain('integra-acs');
  });

  it('emite los modulos de Core que las apps listan en «Mas»', () => {
    const { moduleKeys, webModuleIds } = deriveModuleKeysFromPaths([
      '/erp/cotizaciones/**',
      '/erp/proyectos',
      '/erp/asistencias/indicadores/**',
      '/erp/almacen/**',
      '/erp/almacen/herramientas/**',
      '/erp/vehiculos/**',
      '/erp/organigrama',
    ]);
    for (const key of CORE_EXTRA_MODULES.map((m) => m.key)) {
      expect(moduleKeys).toContain(key);
      expect(webModuleIds).toContain(key);
    }
  });

  it('herramientas no abre el almacen, ni las actividades de proyecto abren Proyectos', () => {
    const { webModuleIds } = deriveModuleKeysFromPaths([
      '/erp/almacen/herramientas',
      '/erp/almacen/herramientas/**',
      '/erp/actividades/proyectos/**',
      '/erp/asistencias/**',
    ]);
    expect(webModuleIds).toContain('erp-herramientas');
    expect(webModuleIds).not.toContain('erp-almacen');
    expect(webModuleIds).not.toContain('erp-proyectos');
    // Ver sus propias asistencias no es ver los KPIs del equipo.
    expect(webModuleIds).not.toContain('kpis-equipo');
  });

  it('un comodin de panel abre todos los modulos de «Mas»', () => {
    for (const rule of ['/erp/**', '/**']) {
      const { moduleKeys } = deriveModuleKeysFromPaths([rule]);
      expect(moduleKeys).toEqual(expect.arrayContaining(CORE_EXTRA_MODULES.map((m) => m.key)));
    }
    // `/erp` sin comodin (RH, Contabilidad) no abre nada por si solo.
    const { moduleKeys } = deriveModuleKeysFromPaths(['/erp']);
    expect(moduleKeys).not.toContain('erp-almacen');
  });

  it('siempre incluye my-profile / dashboard', () => {
    const { moduleKeys, webModuleIds } = deriveModuleKeysFromPaths([]);
    expect(moduleKeys).toEqual(expect.arrayContaining(['my-profile', 'my-preferences', 'dashboard']));
    expect(webModuleIds).toEqual(expect.arrayContaining(['my-profile', 'my-preferences', 'dashboard']));
  });
});
