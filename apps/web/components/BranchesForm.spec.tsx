import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BranchesForm, { type Branch } from './BranchesForm';

// El selector de ubicación monta un mapa; aquí solo estorba.
vi.mock('./ClientLocationPicker', () => ({
  default: () => <div data-testid="location-picker" />,
}));
vi.mock('@/lib/realtime-socket', () => ({
  createRealtimeSocket: () => ({ on: vi.fn(), disconnect: vi.fn() }),
}));
vi.mock('@/lib/export-excel', () => ({ exportToExcel: vi.fn() }));

const SUCURSAL: Branch = {
  id: 4,
  name: 'Centro',
  branchNumber: '001',
  city: 'Monterrey',
  portalEmail: 'centro@cliente.mx',
  isActive: true,
};

const guardar = () => screen.getByRole('button', { name: /Guardar sucursal/ });
const campo = (placeholder: string) => screen.getByPlaceholderText(placeholder);

function renderForm(branches: Branch[] = [], onBranchSaved = vi.fn()) {
  render(<BranchesForm token="jwt-de-prueba" branches={branches} onBranchSaved={onBranchSaved} />);
  return { onBranchSaved };
}

/** Rellena el alta completa dejando fuera el campo indicado. */
async function rellenar(omitir?: 'name' | 'branchNumber' | 'portalEmail' | 'portalPassword', email = 'sucursal@cliente.mx') {
  if (omitir !== 'name') await userEvent.type(campo('Nombre de la sucursal'), 'Sucursal Norte');
  if (omitir !== 'branchNumber') await userEvent.type(campo('Número de sucursal'), '002');
  if (omitir !== 'portalEmail') await userEvent.type(campo('Usuario acceso sucursal (email)'), email);
  if (omitir !== 'portalPassword') await userEvent.type(campo('Password sucursal'), 'secreta123');
}

describe('BranchesForm · validación de alta de sucursal', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 9 }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exige el nombre de la sucursal', async () => {
    renderForm();
    await rellenar('name');
    await userEvent.click(guardar());
    expect(await screen.findByText('El nombre de la sucursal es obligatorio')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exige el número de sucursal', async () => {
    renderForm();
    await rellenar('branchNumber');
    await userEvent.click(guardar());
    expect(await screen.findByText('El número de sucursal es obligatorio')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exige el usuario de acceso al portal', async () => {
    renderForm();
    await rellenar('portalEmail');
    await userEvent.click(guardar());
    expect(await screen.findByText('El usuario de acceso es obligatorio')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('al crear exige password: una sucursal sin credencial no puede entrar al portal', async () => {
    renderForm();
    await rellenar('portalPassword');
    await userEvent.click(guardar());
    expect(await screen.findByText('El password de acceso es obligatorio')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechaza un email de acceso con formato inválido', async () => {
    renderForm();
    await rellenar(undefined, 'sucursal-arroba-cliente');
    await userEvent.click(guardar());
    expect(await screen.findByText(/El email de acceso no es válido/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un nombre de solo espacios no cuenta como nombre', async () => {
    renderForm();
    await userEvent.type(campo('Nombre de la sucursal'), '   ');
    await rellenar('name');
    await userEvent.click(guardar());
    expect(await screen.findByText('El nombre de la sucursal es obligatorio')).toBeInTheDocument();
  });

  it('con el formulario completo hace POST y avisa al padre', async () => {
    const { onBranchSaved } = renderForm();
    await rellenar();
    await userEvent.click(guardar());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('client-portal/branches');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer jwt-de-prueba');

    const body = init.body as FormData;
    expect(body.get('name')).toBe('Sucursal Norte');
    expect(body.get('branchNumber')).toBe('002');
    expect(body.get('portalEmail')).toBe('sucursal@cliente.mx');
    await waitFor(() => expect(onBranchSaved).toHaveBeenCalled());
  });

  it('lista las sucursales que recibe por props', () => {
    renderForm([SUCURSAL]);
    expect(screen.getByText('Centro')).toBeInTheDocument();
    expect(screen.getByText('centro@cliente.mx')).toBeInTheDocument();
  });

  it('al editar el password deja de ser obligatorio y el envío es un PUT', async () => {
    const { onBranchSaved } = renderForm([SUCURSAL]);
    await userEvent.click(screen.getByRole('button', { name: /Editar/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Actualizar sucursal/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('PUT');
    expect(String(url)).toContain('client-portal/branches/4');
    expect((init.body as FormData).has('portalPassword')).toBe(false);
    await waitFor(() => expect(onBranchSaved).toHaveBeenCalled());
  });
});
