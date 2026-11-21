import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SupervisionPage from './page';

vi.mock('@/components/UserContext', () => ({
  useUser: () => ({ token: 'tok', user: { id: 7, roleKey: 'dir_operaciones', nombre: 'Luis' } }),
}));

vi.mock('@/components/excel/ExcelExportadorDinamico', () => ({
  default: () => null,
}));

vi.mock('@/components/supervision/BuscadorCliente', () => ({
  default: () => null,
}));

vi.mock('@/components/supervision/BuscadorProyecto', () => ({
  default: () => null,
}));

const fetchPlanes = vi.fn();
const fetchCierre = vi.fn();
const fetchEquipoSupervision = vi.fn();

vi.mock('@/lib/supervision-api', () => ({
  fetchPlanes: (...a: unknown[]) => fetchPlanes(...a),
  fetchCierre: (...a: unknown[]) => fetchCierre(...a),
  fetchEquipoSupervision: (...a: unknown[]) => fetchEquipoSupervision(...a),
  enviarPlan: vi.fn(),
  marcarProgramado: vi.fn(),
  devolverPlan: vi.fn(),
  entregarCierre: vi.fn(),
  programarRenglon: vi.fn(),
  programarTodo: vi.fn(),
  nuevoRenglonLocal: () => ({
    id: 'r1',
    personaId: null,
    personaNombre: '',
    actividad: '',
    como: '',
    porque: '',
    clienteId: null,
    clienteNombre: '',
    proyectoId: null,
    proyectoNombre: '',
    actividadId: null,
    horarioEstimado: '',
    prioridad: 'media',
    actividadCreadaId: null,
  }),
  renglonesDesdeTextoLibreLocal: (t: string) =>
    t
      .split('\n')
      .filter(Boolean)
      .map((linea, i) => ({
        id: `x${i}`,
        personaId: null,
        personaNombre: '',
        actividad: linea,
        como: '',
        porque: '',
        clienteId: null,
        clienteNombre: '',
        proyectoId: null,
        proyectoNombre: '',
        actividadId: null,
        horarioEstimado: '',
        prioridad: 'media',
        actividadCreadaId: null,
      })),
  mananaLocal: () => '2026-11-17',
  hoyLocal: () => '2026-11-16',
}));

describe('SupervisionPage', () => {
  beforeEach(() => {
    fetchPlanes.mockReset();
    fetchCierre.mockReset();
    fetchEquipoSupervision.mockReset();
    fetchEquipoSupervision.mockResolvedValue({ equipo: [{ id: 30, nombre: 'Erick' }] });
  });

  it('renderiza pestaña Plan de mañana con planes del supervisor', async () => {
    fetchPlanes.mockResolvedValue({
      rol: 'supervisor',
      fecha: '2026-11-17',
      puedeEnviar: true,
      planes: [
        {
          id: 1,
          fecha: '2026-11-17',
          texto: 'Instalar en IPADE',
          estado: 'ENVIADO',
          autor: { id: 20, nombre: 'David' },
          renglones: [
            {
              id: 'a1',
              personaId: 30,
              personaNombre: 'Erick',
              actividad: 'Instalar en IPADE',
              como: 'PoE',
              porque: 'Alcance',
              clienteId: null,
              clienteNombre: 'IPADE',
              proyectoId: null,
              proyectoNombre: '',
              actividadId: null,
              horarioEstimado: '09:00',
              prioridad: 'alta',
              actividadCreadaId: null,
            },
          ],
        },
      ],
      faltantes: [{ id: 21, nombre: 'José', email: 'jose@nexara.com.mx' }],
      indicadores: {
        planesRecibidos: 1,
        personasAsignadas: 1,
        personasSinAsignacion: 0,
        actividadesProgramadas: 1,
        conflictosHorario: [],
      },
    });
    render(<SupervisionPage />);
    expect(await screen.findByRole('heading', { name: 'Supervisión' })).toBeTruthy();
    expect(await screen.findByText('Instalar en IPADE')).toBeTruthy();
    expect(screen.getByText('José')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ir a pizarra/i })).toBeTruthy();
  });

  it('cambia a Cierre del día y muestra totales', async () => {
    fetchPlanes.mockResolvedValue({ rol: 'autor', fecha: '2026-11-17', planes: [], faltantes: [], puedeEnviar: true });
    fetchCierre.mockResolvedValue({
      rol: 'supervisor',
      fecha: '2026-11-16',
      personas: [
        {
          userId: 30,
          nombre: 'Técnico',
          programadas: 2,
          terminadas: 1,
          en_revision: 0,
          no_cumplidas: 0,
          sin_empezar: 1,
          en_curso: 0,
          checo: true,
          retardo: false,
          minutosTarde: 0,
          falta: false,
        },
      ],
      totales: {
        programadas: 2,
        terminadas: 1,
        en_revision: 0,
        no_cumplidas: 0,
        sin_empezar: 1,
        en_curso: 0,
        checadas: 1,
        retardos: 0,
        faltas: 0,
      },
      cierre: null,
      puedeEntregar: true,
    });
    const user = userEvent.setup();
    render(<SupervisionPage />);
    await screen.findByRole('heading', { name: 'Supervisión' });
    await user.click(screen.getByRole('tab', { name: 'Cierre del día' }));
    expect(await screen.findByText('Técnico')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entregar a dirección' })).toBeTruthy();
  });
});
