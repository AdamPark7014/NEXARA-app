import { ConflictException } from '@nestjs/common';
import { RolesController } from './roles.controller.js';

/**
 * El nombre entre comillas es el que ya está guardado (`existing.nombre`),
 * no el que se acaba de escribir. El aviso viejo lo partía en dos frases:
 * «Ya existe un rol llamado "Supervisor". Asigna ese rol o elige otro nombre.»
 */
const TEXTO_VIEJO =
  'Ya existe un rol llamado "Supervisor". Asigna ese rol o elige otro nombre.';

const TEXTO =
  'Ya existe un rol llamado "Supervisor": asigna ese rol o elige otro nombre.';

describe('RolesController.create nombre repetido', () => {
  it('cita el texto viejo «Ya existe un rol llamado "Supervisor". Asigna ese rol o elige otro nombre.» y lo deja en una frase', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 4, nombre: 'Supervisor' });
    const create = jest.fn();
    const controller = new RolesController({ role: { findFirst, create } } as never);

    const error = await controller
      .create({ nombre: 'supervisor', orgRoleKey: 'field_engineer' } as never)
      .then(() => {
        throw new Error('debió rechazar el nombre repetido');
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    const message = (error as ConflictException).message;
    expect(message).toBe(TEXTO);
    expect(message).not.toBe(TEXTO_VIEJO);
    expect(create).not.toHaveBeenCalled();
  });
});
