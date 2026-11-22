import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HorarioHoyFicha } from './HorarioHoyFicha';

describe('HorarioHoyFicha', () => {
  it('muestra cargando y sin horario', () => {
    const { rerender } = render(<HorarioHoyFicha cargando />);
    expect(screen.getByText('Cargando horario…')).toBeTruthy();
    rerender(<HorarioHoyFicha horario={null} />);
    expect(screen.getByText('Sin horario')).toBeTruthy();
  });
  it('muestra rango, fuente, gracia y motivo', () => {
    render(<HorarioHoyFicha horario={{ horaEntrada: '10:00', horaSalida: '18:00', fuente: 'horario_dia', graciaMin: 10, motivo: 'Turno IPADE' }} />);
    expect(screen.getByText('10:00–18:00')).toBeTruthy();
    expect(screen.getByText(/Del día/)).toBeTruthy();
    expect(screen.getByText(/gracia 10 min/)).toBeTruthy();
    expect(screen.getByText('Turno IPADE')).toBeTruthy();
  });
  it('botones solo si puedeEditar y hay callbacks', () => {
    const onExtender = vi.fn();
    const onRecortar = vi.fn();
    const { rerender } = render(<HorarioHoyFicha horario={{ horaEntrada: '10:00', horaSalida: '18:00' }} />);
    expect(screen.queryByRole('button', { name: 'Extender' })).toBeNull();
    rerender(<HorarioHoyFicha horario={{ horaEntrada: '10:00', horaSalida: '18:00' }} puedeEditar onExtender={onExtender} onRecortar={onRecortar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Extender' }));
    fireEvent.click(screen.getByRole('button', { name: 'Terminar antes' }));
    expect(onExtender).toHaveBeenCalledTimes(1);
    expect(onRecortar).toHaveBeenCalledTimes(1);
  });
});