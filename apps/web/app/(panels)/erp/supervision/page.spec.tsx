import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SupervisionPage from './page';

vi.mock('@/components/UserContext', () => ({ useUser: () => ({ token: 'tok', user: { id: 7 } }) }));

const fetchPlanes = vi.fn();
const fetchCierre = vi.fn();
vi.mock('@/lib/supervision-api', () => ({
  fetchPlanes: (...a: unknown[]) => fetchPlanes(...a),
  fetchCierre: (...a: unknown[]) => fetchCierre(...a),
  enviarPlan: vi.fn(),
  marcarProgramado: vi.fn(),
  devolverPlan: vi.fn(),
  entregarCierre: vi.fn(),
  mananaLocal: () => '2026-11-17',
  hoyLocal: () => '2026-11-16',
}));

describe('SupervisionPage', () => {
  beforeEach(() => {
    fetchPlanes.mockReset();
    fetchCierre.mockReset();
  });

  it('renderiza pestaña Plan de mañana con planes del supervisor', async () => {
    fetchPlanes.mockResolvedValue({
      rol: 'supervisor',
      fecha: '2026-11-17',
      planes: [{ id: 1, fecha: '2026-11-17', texto: 'Instalar en IPADE', estado: 'ENVIADO', autor: { id: 20, nombre: 'David' } }],
      faltantes: [{ id: 21, nombre: 'José', email: 'jose@nexara.com.mx' }],
    });
    render(<SupervisionPage />);
    expect(await screen.findByRole('heading', { name: 'Supervisión' })).toBeTruthy();
    expect(await screen.findByText('Instalar en IPADE')).toBeTruthy();
    expect(screen.getByText('José')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Programar actividades/i })).toBeTruthy();
  });

  it('cambia a Cierre del día y muestra totales', async () => {
    fetchPlanes.mockResolvedValue({ rol: 'autor', fecha: '2026-11-17', planes: [], faltantes: [] });
    fetchCierre.mockResolvedValue({
      rol: 'supervisor',
      fecha: '2026-11-16',
      personas: [{ userId: 30, nombre: 'Técnico', programadas: 2, terminadas: 1, en_revision: 0, no_cumplidas: 0, sin_empezar: 1, en_curso: 0, checo: true, retardo: false, minutosTarde: 0, falta: false }],
      totales: { programadas: 2, terminadas: 1, en_revision: 0, no_cumplidas: 0, sin_empezar: 1, en_curso: 0, checadas: 1, retardos: 0, faltas: 0 },
      cierre: null,
      puedeEntregar: true,
    });
    const user = userEvent.setup();
    render(<SupervisionPage />);
    await screen.findByRole('heading', { name: 'Supervisión' });
    await user.click(screen.getByRole('button', { name: 'Cierre del día' }));
    expect(await screen.findByText('Técnico')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entregar a dirección' })).toBeTruthy();
  });
});