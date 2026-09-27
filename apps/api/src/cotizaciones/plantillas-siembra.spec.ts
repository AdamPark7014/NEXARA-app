import { normalizarContenidoPlantilla } from './personalizacion.js';
import { PLANTILLAS_BASE } from './plantillas-base.js';
import {
  SEMILLA_ORIGEN,
  claveNombre,
  contenidoParaGuardar,
  diferenciasDeContenido,
  hashContenido,
  planificarSiembra,
  resumirSiembra,
  type FilaPlantilla,
} from './plantillas-siembra.js';

/** Qué hace la siembra con lo que ya hay en la empresa: crear, actualizar u omitir (nunca pisar lo editado). */

const BASE = PLANTILLAS_BASE[0]!;

/** La fila que deja el seed en la base de datos (el JSON viaja por la columna `contenido`). */
const filaSembrada = (base = BASE, id = 1): FilaPlantilla => ({
  id,
  nombre: base.nombre,
  archivadaAt: null,
  contenido: JSON.parse(JSON.stringify(contenidoParaGuardar(base))),
});

const tipos = (filas: FilaPlantilla[]) => planificarSiembra(PLANTILLAS_BASE, filas).map((a) => a.tipo);

describe('siembra de plantillas base', () => {
  it('en una empresa sin plantillas crea todas, en el orden de la base', () => {
    const acciones = planificarSiembra(PLANTILLAS_BASE, []);
    expect(acciones.map((a) => a.clave)).toEqual(PLANTILLAS_BASE.map((p) => p.clave));
    expect(acciones.every((a) => a.tipo === 'CREAR' && a.id === null)).toBe(true);
  });

  it('es idempotente: lo sembrado, al volver a correr, queda «sin cambios»', () => {
    const filas = PLANTILLAS_BASE.map((p, i) => filaSembrada(p, i + 1));
    expect(tipos(filas).every((t) => t === 'SIN_CAMBIOS')).toBe(true);
    expect(resumirSiembra(planificarSiembra(PLANTILLAS_BASE, filas))).toEqual({
      CREAR: 0,
      ACTUALIZAR: 0,
      SIN_CAMBIOS: PLANTILLAS_BASE.length,
      OMITIR_EDITADA: 0,
      OMITIR_ARCHIVADA: 0,
    });
  });

  it('el marcador no cambia lo que lee la API: el contenido normalizado es idéntico al de la base', () => {
    for (const p of PLANTILLAS_BASE) {
      const guardado = contenidoParaGuardar(p);
      expect(guardado._semilla).toMatchObject({ origen: SEMILLA_ORIGEN, clave: p.clave });
      expect(normalizarContenidoPlantilla(guardado)).toEqual(p.contenido);
    }
  });

  it('solo crea las que faltan', () => {
    const filas = [filaSembrada(PLANTILLAS_BASE[0]!, 1), filaSembrada(PLANTILLAS_BASE[3]!, 2)];
    const t = tipos(filas);
    expect(t.filter((x) => x === 'SIN_CAMBIOS')).toHaveLength(2);
    expect(t.filter((x) => x === 'CREAR')).toHaveLength(PLANTILLAS_BASE.length - 2);
  });

  it('actualiza una sembrada que nadie editó cuando la base cambió', () => {
    const viejo = { ...BASE.contenido, scope: 'Texto de una versión anterior de la base.' };
    const fila: FilaPlantilla = {
      id: 7,
      nombre: BASE.nombre,
      archivadaAt: null,
      contenido: { ...viejo, _semilla: { origen: SEMILLA_ORIGEN, clave: BASE.clave, hash: hashContenido(viejo) } },
    };
    const [accion] = planificarSiembra([BASE], [fila]);
    expect(accion).toMatchObject({ tipo: 'ACTUALIZAR', id: 7 });
  });

  it('NO pisa una sembrada que el usuario editó después: la omite y dice en qué difiere', () => {
    const editada = { ...(JSON.parse(JSON.stringify(contenidoParaGuardar(BASE))) as object), scope: 'Lo reescribió el usuario.' };
    const [accion] = planificarSiembra([BASE], [{ id: 3, nombre: BASE.nombre, archivadaAt: null, contenido: editada }]);
    expect(accion).toMatchObject({ tipo: 'OMITIR_EDITADA', id: 3, diferencias: ['scope'] });
    expect(accion!.motivo).toMatch(/editó/);
  });

  it('NO pisa una creada a mano con el mismo nombre (sin marcador) y lista todo lo que difiere', () => {
    const aMano = { ...BASE.contenido, projectName: 'Mi proyecto', items: BASE.contenido.items.slice(0, 2), depositPercent: 30 };
    const [accion] = planificarSiembra([BASE], [{ id: 9, nombre: BASE.nombre, archivadaAt: null, contenido: aMano }]);
    expect(accion).toMatchObject({ tipo: 'OMITIR_EDITADA', id: 9 });
    expect(accion!.motivo).toMatch(/a mano/);
    expect([...accion!.diferencias].sort()).toEqual(['depositPercent', 'items', 'projectName']);
  });

  it('una creada a mano idéntica a la base cuenta como «sin cambios»', () => {
    const [accion] = planificarSiembra([BASE], [{ id: 2, nombre: BASE.nombre, archivadaAt: null, contenido: BASE.contenido }]);
    expect(accion!.tipo).toBe('SIN_CAMBIOS');
  });

  it('un marcador de otro origen no cuenta: se trata como creada a mano', () => {
    const contenido = {
      ...BASE.contenido,
      scope: 'Otro texto.',
      _semilla: { origen: 'otro-sistema', clave: BASE.clave, hash: hashContenido({ ...BASE.contenido, scope: 'Otro texto.' }) },
    };
    const [accion] = planificarSiembra([BASE], [{ id: 4, nombre: BASE.nombre, archivadaAt: null, contenido }]);
    expect(accion!.tipo).toBe('OMITIR_EDITADA');
  });

  it('respeta las archivadas: no las resucita ni crea otra con el mismo nombre', () => {
    const [accion] = planificarSiembra([BASE], [{ ...filaSembrada(BASE, 5), archivadaAt: new Date('2026-09-01T00:00:00Z') }]);
    expect(accion).toMatchObject({ tipo: 'OMITIR_ARCHIVADA', id: 5 });
  });

  it('si hay una viva y una archivada con el mismo nombre, manda la viva', () => {
    const filas = [{ ...filaSembrada(BASE, 5), archivadaAt: '2026-09-01T00:00:00.000Z' }, filaSembrada(BASE, 6)];
    expect(planificarSiembra([BASE], filas)[0]).toMatchObject({ tipo: 'SIN_CAMBIOS', id: 6 });
  });

  it('con duplicados vivos manda la más reciente', () => {
    const vieja = { ...filaSembrada(BASE, 2), contenido: { ...BASE.contenido, scope: 'Vieja.' } };
    const nueva = filaSembrada(BASE, 8);
    expect(planificarSiembra([BASE], [vieja, nueva])[0]).toMatchObject({ tipo: 'SIN_CAMBIOS', id: 8 });
  });

  it('compara el nombre sin acentos, mayúsculas ni espacios de más', () => {
    const fila = { ...filaSembrada(BASE, 1), nombre: `  ${BASE.nombre.toUpperCase().replace('Ó', 'O')}  ` };
    expect(claveNombre(fila.nombre)).toBe(claveNombre(BASE.nombre));
    expect(planificarSiembra([BASE], [fila])[0]!.tipo).toBe('SIN_CAMBIOS');
  });

  it('no toca las plantillas de la empresa que no son de la base', () => {
    const propias: FilaPlantilla[] = [{ id: 40, nombre: 'Mi plantilla especial', archivadaAt: null, contenido: {} }];
    expect(planificarSiembra(PLANTILLAS_BASE, propias).every((a) => a.tipo === 'CREAR')).toBe(true);
  });

  it('no muta lo que recibe', () => {
    const filas = PLANTILLAS_BASE.map((p, i) => filaSembrada(p, i + 1));
    const antes = JSON.stringify(filas);
    planificarSiembra(PLANTILLAS_BASE, filas);
    expect(JSON.stringify(filas)).toBe(antes);
  });

  describe('hash y diferencias', () => {
    it('el hash no depende del orden de las llaves ni del viaje por JSON', () => {
      const c = BASE.contenido;
      const reordenado = Object.fromEntries(Object.entries(c).reverse());
      expect(hashContenido(reordenado)).toBe(hashContenido(c));
      expect(hashContenido(JSON.parse(JSON.stringify(c)))).toBe(hashContenido(c));
    });

    it('el hash cambia con cualquier cambio de contenido e ignora el marcador', () => {
      const c = BASE.contenido;
      expect(hashContenido({ ...c, scope: `${c.scope} Más.` })).not.toBe(hashContenido(c));
      expect(hashContenido({ ...c, items: c.items.slice(1) })).not.toBe(hashContenido(c));
      expect(hashContenido(contenidoParaGuardar(BASE))).toBe(hashContenido(c));
    });

    it('las plantillas base tienen hashes distintos entre sí', () => {
      const hashes = PLANTILLAS_BASE.map((p) => hashContenido(p.contenido));
      expect(new Set(hashes).size).toBe(hashes.length);
    });

    it('diferenciasDeContenido lista las llaves de primer nivel que cambian', () => {
      expect(diferenciasDeContenido(BASE.contenido, BASE.contenido)).toEqual([]);
      expect(diferenciasDeContenido({ ...BASE.contenido, note: 'Otra nota.' }, BASE.contenido)).toEqual(['note']);
      expect(diferenciasDeContenido(null, BASE.contenido).length).toBeGreaterThan(3);
    });
  });
});
