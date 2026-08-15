import { BadRequestException } from '@nestjs/common';
import {
  buildRoleData,
  listRoleTemplates,
  resolveTemplateOrThrow,
  validTemplateKeys,
} from './role-template.js';

describe('listRoleTemplates', () => {
  it('expone las plantillas con lo que necesita la interfaz', () => {
    const templates = listRoleTemplates();
    expect(templates.length).toBeGreaterThan(0);
    for (const t of templates) {
      expect(t.orgRoleKey).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(typeof t.nivelAutoridad).toBe('number');
    }
  });
});

describe('resolveTemplateOrThrow', () => {
  it('resuelve por clave explícita', () => {
    const t = resolveTemplateOrThrow({ orgRoleKey: 'ceo' });
    expect(t.orgRoleKey).toBe('ceo');
  });

  it('resuelve por nombre de plantilla conocido', () => {
    // Compatibilidad con los formularios que solo mandaban el nombre.
    const t = resolveTemplateOrThrow({ nombre: 'CEO' });
    expect(t.orgRoleKey).toBe('ceo');
  });

  it('rechaza una plantilla inexistente y dice cuáles valen', () => {
    // El fallo de origen: un rol sin plantilla no resuelve contra la matriz v2
    // y se quedaba sin ninguna linea base de permisos.
    expect(() => resolveTemplateOrThrow({ orgRoleKey: 'inventado' })).toThrow(BadRequestException);
    try {
      resolveTemplateOrThrow({ orgRoleKey: 'inventado' });
    } catch (e) {
      expect((e as Error).message).toContain('ceo');
    }
  });

  it('rechaza un alta sin plantilla ni nombre reconocible', () => {
    expect(() => resolveTemplateOrThrow({ nombre: 'Rol improvisado' })).toThrow(BadRequestException);
    expect(() => resolveTemplateOrThrow({})).toThrow(BadRequestException);
  });

  it('todas las claves publicadas resuelven', () => {
    for (const key of validTemplateKeys()) {
      expect(resolveTemplateOrThrow({ orgRoleKey: key }).orgRoleKey).toBe(key);
    }
  });
});

describe('puente plantilla -> matriz v2', () => {
  it('toda plantilla publicada mapea a un rol de la matriz', () => {
    // Las plantillas usan vocabulario propio (field_engineer) y la matriz otro
    // (ing_campo). LEGACY_TO_V2 es el puente: si una plantilla no esta ahi, el
    // rol creado con ella no resolveria y quedaria sin permisos.
    const { LEGACY_TO_V2 } = require('../common/rbac/roles.v2.js');
    for (const key of validTemplateKeys()) {
      expect(LEGACY_TO_V2[key]).toBeDefined();
    }
  });
});

describe('buildRoleData', () => {
  const template = resolveTemplateOrThrow({ orgRoleKey: 'field_engineer' });

  it('sella orgRoleKey y nivelAutoridad desde la plantilla', () => {
    const data = buildRoleData(template, { nombre: 'Técnico Norte' });
    expect(data.orgRoleKey).toBe('field_engineer');
    expect(data.nivelAutoridad).toBe(template.nivelAutoridad);
  });

  it('ignora intentos de sobrescribir la plantilla desde el formulario', () => {
    // Si el cliente pudiera fijar orgRoleKey a mano volveriamos al problema:
    // un rol con una clave que la matriz no reconoce.
    const data = buildRoleData(template, {
      nombre: 'Técnico Norte',
      orgRoleKey: 'ceo',
      nivelAutoridad: 99,
    });
    expect(data.orgRoleKey).toBe('field_engineer');
    expect(data.nivelAutoridad).toBe(template.nivelAutoridad);
  });

  it('parte de las banderas de la plantilla', () => {
    const data = buildRoleData(template, { nombre: 'Técnico Norte' });
    for (const [flag, value] of Object.entries(template.flags)) {
      expect(data[flag]).toBe(value);
    }
  });

  it('permite afinar banderas concretas sin perder la plantilla', () => {
    const data = buildRoleData(template, { nombre: 'Técnico Norte', accesoGps: true });
    expect(data.accesoGps).toBe(true);
    expect(data.orgRoleKey).toBe('field_engineer');
  });

  it('conserva el nombre enviado', () => {
    expect(buildRoleData(template, { nombre: 'Técnico Norte' }).nombre).toBe('Técnico Norte');
  });
});
