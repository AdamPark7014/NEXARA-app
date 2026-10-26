import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GrabacionService } from './grabacion.service';
import { MAX_DURACION_MS } from './minuta-ia';

const oraciones = (texto: string) =>
  texto
    .split(/(?<=[.!?])\s+/)
    .map((parte) => parte.trim())
    .filter(Boolean);

/** Lo que el API decía en dos frases. El tope sigue siendo 3 horas. */
const TEXTO_VIEJO = [
  'La grabación llegó al máximo de 3 horas. Concluye la reunión.',
  'Esta reunión ya tiene grabación. Bórrala antes de pegar otro texto.',
  'Ningún convocado tiene correo registrado. Agrega asistentes a la reunión.',
  'No se pudo enviar el correo. Intenta de nuevo más tarde.',
] as const;

const FRASE = [
  'La grabación llegó al máximo de 3 horas: concluye la reunión.',
  'Esta reunión ya tiene grabación: bórrala antes de pegar otro texto.',
  'Ningún convocado tiene correo registrado: agrega asistentes a la reunión.',
  'No se pudo enviar el correo: intenta de nuevo más tarde.',
] as const;

const audio = { buffer: Buffer.from([1, 2, 3]), mimetype: 'audio/webm', size: 3 };
const reunion = {
  id: 1,
  tipo: 'operativa',
  titulo: 'Avance de sucursal',
  fecha: new Date('2026-10-25T15:00:00Z'),
  horaInicio: '09:00',
  agenda: '',
  estado: 'PROGRAMADA',
  notas: null,
};

function servicio(prisma: object, email: { send: jest.Mock } = { send: jest.fn() }) {
  return new GrabacionService(
    prisma as never,
    {} as never,
    { url: () => 'http://transcriptor' } as never,
    {} as never,
    {} as never,
    email as never,
  );
}

describe('avisos de la grabación', () => {
  it('deja las cuatro frases en una y cita el texto viejo', async () => {
    expect(MAX_DURACION_MS).toBe(3 * 60 * 60_000);
    const codigo = readFileSync(join(__dirname, 'grabacion.service.ts'), 'utf8');
    for (let i = 0; i < TEXTO_VIEJO.length; i++) {
      expect(oraciones(TEXTO_VIEJO[i])).toHaveLength(2);
      expect(oraciones(FRASE[i])).toEqual([FRASE[i]]);
      expect(FRASE[i]).not.toBe(TEXTO_VIEJO[i]);
      expect(codigo).toContain(FRASE[i]);
      expect(codigo).not.toContain(TEXTO_VIEJO[i]);
    }

    const alTope = servicio({});
    await expect(
      alTope.subirParte(1, { parte: 1, inicioMs: MAX_DURACION_MS, duracionMs: 20_000 }, audio, 7),
    ).rejects.toThrow(FRASE[0]);

    const antes = servicio({
      operationalMeeting: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      antes.subirParte(1, { parte: 1, inicioMs: MAX_DURACION_MS - 1, duracionMs: 20_000 }, audio, 7),
    ).rejects.toThrow('Reunión no encontrada');

    const pegar = servicio({
      operationalMeeting: { findFirst: jest.fn().mockResolvedValue(reunion) },
      meetingRecording: { findUnique: jest.fn().mockResolvedValue({ id: 9 }) },
      meetingRecordingPart: { count: jest.fn().mockResolvedValue(1) },
    });
    await expect(
      pegar.desdeTexto(1, 'El equipo revisó el avance del almacén, los accesos y las cámaras de la sucursal norte.', 7),
    ).rejects.toThrow(FRASE[1]);

    const pdf = jest.spyOn(GrabacionService.prototype, 'pdf').mockResolvedValue({
      pdf: Buffer.from('%PDF'),
      nombre: 'minuta-avance.pdf',
    });
    const sinCorreo = servicio({
      operationalMeeting: {
        findFirst: jest.fn().mockResolvedValue({
          titulo: 'Avance de sucursal',
          fecha: reunion.fecha,
          asistentes: [{ user: { email: '  ' } }, { user: { email: null } }],
        }),
      },
    });
    await expect(sinCorreo.enviar(1, 7)).rejects.toThrow(FRASE[2]);

    const email = { send: jest.fn().mockResolvedValue(false) };
    const fallo = servicio(
      {
        operationalMeeting: {
          findFirst: jest.fn().mockResolvedValue({
            titulo: 'Avance de sucursal',
            fecha: reunion.fecha,
            asistentes: [{ user: { email: 'ana@nexara.mx' } }],
          }),
        },
      },
      email,
    );
    await expect(fallo.enviar(1, 7)).rejects.toThrow(FRASE[3]);
    expect(email.send).toHaveBeenCalled();
    pdf.mockRestore();
  });
});
