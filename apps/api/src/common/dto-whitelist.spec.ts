import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CreateBankAccountDto } from '../accounting/dto/banking.dto.js';
import { CreateSupplierDto } from '../procurement/dto/supplier.dto.js';
import { AssignViaticoDto } from '../viaticos/dto/assign-viatico.dto.js';
import { CreateViaticoDto } from '../viaticos/dto/create-viatico.dto.js';
import { UpdateViaticoDto } from '../viaticos/dto/update-viatico.dto.js';
import { UpdateEmployeePaymentDto } from '../employee-payments/dto/update-employee-payment.dto.js';

/**
 * El `ValidationPipe` global corre con `whitelist` y `forbidNonWhitelisted`
 * (`main.ts`). Con esa combinación, una propiedad **sin** metadata de
 * class-validator no está en la lista blanca y el pipe devuelve 400
 * («property X should not exist») antes de que el controlador vea nada.
 *
 * El efecto es traicionero: la clase DTO existe, compila, el formulario manda
 * justo esos campos… y el alta rebota siempre. Así estaban viáticos y la
 * edición de pagos a personal, y así estaba la cuenta bancaria mandando un
 * `currentBalance` que el contrato no declaraba.
 *
 * Esta prueba captura el cuerpo real que manda cada pantalla y exige que pase
 * limpio. Si alguien vuelve a añadir un campo al formulario sin declararlo en
 * el DTO —o crea un DTO sin decoradores— falla aquí y no en producción.
 */
const OPCIONES = { whitelist: true, forbidNonWhitelisted: true } as const;

function erroresDe<T extends object>(cls: new () => T, cuerpo: Record<string, unknown>) {
  const instancia = plainToInstance(cls, cuerpo, { enableImplicitConversion: true });
  return validateSync(instancia as object, OPCIONES).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );
}

describe('Contratos de alta contra whitelist + forbidNonWhitelisted', () => {
  it('cuenta bancaria: el alta incluye el saldo inicial que pide el formulario', () => {
    expect(
      erroresDe(CreateBankAccountDto, {
        name: 'Cuenta operativa MXN',
        bankName: 'Banorte',
        accountNumber: '0123456789',
        clabe: '072000001234567890',
        currency: 'MXN',
        accountType: 'CHEQUES',
        currentBalance: 152340.55,
      }),
    ).toEqual([]);
  });

  it('proveedor: nombre y RFC pasan; un RFC con forma inválida no', () => {
    expect(
      erroresDe(CreateSupplierDto, {
        name: 'Distribuidora del Norte S.A. de C.V.',
        rfc: 'DNO920101AB1',
        description: 'Material eléctrico',
      }),
    ).toEqual([]);

    expect(erroresDe(CreateSupplierDto, { name: 'Sin RFC' })).toEqual([]);
    expect(erroresDe(CreateSupplierDto, { name: 'Malo', rfc: '123' })).not.toEqual([]);
    expect(erroresDe(CreateSupplierDto, { name: '' })).not.toEqual([]);
  });

  it('viático: pasa el cuerpo JSON y el de multipart, que manda todo como texto', () => {
    // Rama JSON: los enlaces sin elegir viajan como null, no se omiten.
    expect(
      erroresDe(CreateViaticoDto, {
        usuarioId: 12,
        actividadId: null,
        projectId: 40,
        vehicleId: null,
        categoria: 'COMBUSTIBLE',
        motivo: 'Carga de diésel camino a obra',
        montoSolicitado: 1500,
        ticketEvidenciaUrl: 'https://ejemplo/ticket.jpg',
      }),
    ).toEqual([]);

    // Rama multipart: FormData convierte todo a cadena.
    expect(
      erroresDe(CreateViaticoDto, {
        usuarioId: '12',
        projectId: '40',
        categoria: 'CASETA',
        motivo: 'Casetas del tramo',
        montoSolicitado: '340.50',
      }),
    ).toEqual([]);

    // Un importe en cero no es un viático.
    expect(erroresDe(CreateViaticoDto, { motivo: 'x', montoSolicitado: 0 })).not.toEqual([]);
  });

  it('viático: asignar y editar también cruzan el pipe', () => {
    expect(
      erroresDe(AssignViaticoDto, {
        usuarioId: 7,
        actividadId: null,
        projectId: null,
        vehicleId: null,
        categoria: 'HOSPEDAJE',
        motivo: 'Noche en Pachuca',
        montoSolicitado: 900,
      }),
    ).toEqual([]);

    expect(
      erroresDe(UpdateViaticoDto, { montoSolicitado: '1200', motivo: 'Corrección de monto' }),
    ).toEqual([]);
  });

  it('pago a personal: la edición pasa con lo que manda su formulario', () => {
    expect(
      erroresDe(UpdateEmployeePaymentDto, {
        concepto: 'Quincena',
        periodFrom: '2026-09-01',
        periodTo: '2026-09-15',
        amount: '8400',
        totalMinutes: 4800,
        note: 'Incluye horas extra',
        status: 'Borrador',
      }),
    ).toEqual([]);
  });

  it('un campo que el contrato no declara sigue rebotando', () => {
    expect(
      erroresDe(CreateBankAccountDto, {
        name: 'Cuenta',
        bankName: 'Banorte',
        accountNumber: '1',
        campoInventado: 'x',
      }),
    ).toEqual([expect.stringContaining('campoInventado')]);
  });
});
