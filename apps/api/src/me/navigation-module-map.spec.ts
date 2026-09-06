import { deriveModuleKeysFromPaths } from './navigation-module-map.js';

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

  it('siempre incluye my-profile / dashboard', () => {
    const { moduleKeys, webModuleIds } = deriveModuleKeysFromPaths([]);
    expect(moduleKeys).toEqual(expect.arrayContaining(['my-profile', 'my-preferences', 'dashboard']));
    expect(webModuleIds).toEqual(expect.arrayContaining(['my-profile', 'my-preferences', 'dashboard']));
  });
});
