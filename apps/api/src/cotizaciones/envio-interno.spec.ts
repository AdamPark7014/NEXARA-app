import {
  MAX_NOTA,
  MENSAJE_PROBLEMA,
  avisoDeTraspaso,
  limpiarNota,
  puedeRecibirCotizacion,
  revisarEnvioInterno,
} from './envio-interno.js';
import { ROLES } from '../common/rbac/roles.v2.js';

/**
 * Envío interno: pasarle la cotización a otro compañero para que la revise o la continúe.
 *
 * Lo que se vigila aquí es que **quién puede recibirla** salga de la clave de rol y no de una lista
 * de correos, y que no se pueda regalar una cotización que ya salió al cliente.
 */

const encargadoObra = { id: 7, nombre: 'Josué', roleKey: ROLES.ARQUITECTO, isActive: true };

describe('a quién se le puede pasar', () => {
  it('los encargados de área la reciben', () => {
    for (const roleKey of [ROLES.ARQUITECTO, ROLES.COORD_OPERACIONES, ROLES.ADMINISTRATIVO, ROLES.ING_SOPORTE]) {
      expect(puedeRecibirCotizacion({ id: 1, roleKey })).toBe(true);
    }
  });

  it('dirección y comercial también (ya cotizaban)', () => {
    for (const roleKey of [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.COORD_VENTAS, ROLES.VENDEDOR]) {
      expect(puedeRecibirCotizacion({ id: 1, roleKey })).toBe(true);
    }
  });

  it('quien no cotiza, no la recibe', () => {
    for (const roleKey of [ROLES.ING_CAMPO, ROLES.DISENADOR, ROLES.RH, ROLES.CLIENTE]) {
      expect(puedeRecibirCotizacion({ id: 1, roleKey })).toBe(false);
    }
  });

  it('una cuenta dada de baja no la recibe aunque su rol cotice', () => {
    expect(puedeRecibirCotizacion({ ...encargadoObra, isActive: false })).toBe(false);
  });

  it('sin rol reconocido, no', () => {
    expect(puedeRecibirCotizacion({ id: 1, roleKey: 'jefe_inventado' })).toBe(false);
    expect(puedeRecibirCotizacion({ id: 1, roleKey: null })).toBe(false);
    expect(puedeRecibirCotizacion(null)).toBe(false);
  });
});

describe('qué impide el traspaso', () => {
  const base = { bloqueada: false, actorId: 3, companyId: 1, destinatario: encargadoObra };

  it('con todo en orden, nada', () => {
    expect(revisarEnvioInterno(base)).toBeNull();
  });

  it('una que ya salió al cliente no se pasa: primero la versión nueva', () => {
    expect(revisarEnvioInterno({ ...base, bloqueada: true })).toBe('BLOQUEADA');
    // El estado manda sobre el destinatario: da igual a quién se la pases.
    expect(revisarEnvioInterno({ ...base, bloqueada: true, destinatario: null })).toBe('BLOQUEADA');
  });

  it('sin destinatario', () => {
    expect(revisarEnvioInterno({ ...base, destinatario: null })).toBe('SIN_DESTINATARIO');
  });

  it('a ti mismo, no', () => {
    expect(revisarEnvioInterno({ ...base, actorId: encargadoObra.id })).toBe('A_TI_MISMO');
  });

  it('a alguien de otra empresa, no', () => {
    expect(
      revisarEnvioInterno({ ...base, destinatario: { ...encargadoObra, companyId: 9 } }),
    ).toBe('OTRA_EMPRESA');
  });

  it('a quien no cotiza, no', () => {
    expect(
      revisarEnvioInterno({ ...base, destinatario: { ...encargadoObra, roleKey: ROLES.ING_CAMPO } }),
    ).toBe('NO_COTIZA');
  });

  it('cada problema tiene un mensaje que se le puede enseñar a una persona', () => {
    for (const mensaje of Object.values(MENSAJE_PROBLEMA)) {
      expect(mensaje.length).toBeGreaterThan(10);
    }
  });
});

describe('la nota del traspaso', () => {
  it('se recorta y se queda en una sola línea de espacios sanos', () => {
    expect(limpiarNota('  falta el precio del NVR  ')).toBe('falta el precio del NVR');
  });

  it('vacía es nula: no se guarda una cadena en blanco', () => {
    expect(limpiarNota('   ')).toBeNull();
    expect(limpiarNota(undefined)).toBeNull();
    expect(limpiarNota(null)).toBeNull();
  });

  it('no pasa del máximo', () => {
    expect(limpiarNota('x'.repeat(MAX_NOTA + 50))).toHaveLength(MAX_NOTA);
  });
});

describe('el aviso que le llega', () => {
  it('dice quién se la pasó y qué pidió', () => {
    const aviso = avisoDeTraspaso({
      folio: 'NEX-LJ75100126-0007',
      deNombre: 'Luis Joel Aguilar',
      nota: 'Revisa el alcance antes de mandarla.',
    });
    expect(aviso.titulo).toBe('Te pasaron una cotización');
    expect(aviso.mensaje).toBe(
      'Luis Joel Aguilar te pasó la cotización NEX-LJ75100126-0007. Revisa el alcance antes de mandarla.',
    );
  });

  it('sin nota, solo el hecho', () => {
    const aviso = avisoDeTraspaso({ folio: 'NEX-JT00000000-0001', deNombre: 'Daniela Hernández' });
    expect(aviso.mensaje).toBe('Daniela Hernández te pasó la cotización NEX-JT00000000-0001.');
  });

  it('sin nombre no inventa a nadie', () => {
    expect(avisoDeTraspaso({ folio: 'NEX-XX00000000-0001' }).mensaje).toBe(
      'Te pasaron la cotización NEX-XX00000000-0001.',
    );
  });
});
