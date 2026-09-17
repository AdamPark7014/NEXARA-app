import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { auditarNomenclatura, validarDatosRrhh, type EstadoNomenclatura } from './nomenclatura.js';
import { NON_EMPLOYEE_EMAILS } from '../common/platform-accounts.js';

export type FilaAuditoriaNomenclatura = {
  userId: number;
  nombre: string;
  puesto: string | null;
  numeroEmpleado: string | null;
  esperado: string | null;
  estado: EstadoNomenclatura;
  observaciones: string[];
  /** Solo qué falta o está mal (RFC, CURP, NSS, correo); nunca los valores. */
  datosRrhh: string[];
  origen: string | null;
  documentosPendientes: boolean;
};

/**
 * Auditoría en vivo del número de empleado: compara la clave registrada con el nombre, la CURP
 * (o fecha de nacimiento) y la fecha de ingreso. No corrige nada: RH decide.
 */
@Injectable()
export class NomenclaturaAuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  async auditar(hoy = new Date()): Promise<{ resumen: Record<EstadoNomenclatura, number>; filas: FilaAuditoriaNomenclatura[] }> {
    const usuarios = await this.prisma.user.findMany({
      where: { email: { notIn: [...NON_EMPLOYEE_EMAILS] } },
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        nombre: true,
        puesto: true,
        employeeNumber: true,
        fechaIngreso: true,
        isActive: true,
        perfil: {
          select: {
            curp: true,
            rfc: true,
            nss: true,
            correoContacto: true,
            fechaNacimiento: true,
            documentosPendientes: true,
            nomenclaturaOrigen: true,
          },
        },
      },
    });

    const resumen: Record<EstadoNomenclatura, number> = { ok: 0, diferente: 0, invalida: 0, sin_datos: 0 };
    const filas = usuarios.map((u) => {
      const p = u.perfil;
      const r = auditarNomenclatura({
        codigo: u.employeeNumber,
        nombre: u.nombre,
        curp: p?.curp,
        fechaNacimiento: p?.fechaNacimiento,
        fechaIngreso: u.fechaIngreso,
        hoy,
      });
      resumen[r.estado] += 1;
      return {
        userId: u.id,
        nombre: u.nombre,
        puesto: u.puesto ?? null,
        numeroEmpleado: u.employeeNumber ?? null,
        esperado: r.esperado ?? null,
        estado: r.estado,
        observaciones: u.isActive ? r.observaciones : ['Alta sin acceso', ...r.observaciones],
        datosRrhh: validarDatosRrhh({ rfc: p?.rfc, curp: p?.curp, nss: p?.nss, correo: p?.correoContacto }),
        origen: p?.nomenclaturaOrigen ?? null,
        documentosPendientes: p?.documentosPendientes ?? false,
      };
    });
    return { resumen, filas };
  }
}
