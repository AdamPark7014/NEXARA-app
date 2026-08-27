import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanySwitcher from './CompanySwitcher';
import { getActiveCompanyId, setActiveCompanyId } from '@/lib/tenant';

const useUser = vi.hoisted(() => vi.fn());
vi.mock('@/components/UserContext', () => ({ useUser }));

const NEXARA = { id: 1, legalName: 'NEXARA SA de CV', tradeName: 'NEXARA', isPrimary: true };
const CONDUIT = { id: 2, legalName: 'CONDUIT SA de CV', tradeName: 'CONDUIT', isPrimary: false };

/** Los parámetros van tipados a propósito: sin ellos `mock.calls` se infiere
 *  como tupla vacía y `tsc --noEmit` del CI rompe al leer calls[0][1]. */
function mockCompanies(companies: unknown[], ok = true) {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    ok
      ? new Response(JSON.stringify(companies), { status: 200 })
      : new Response('nope', { status: 403 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('CompanySwitcher · cambio de empresa activa', () => {
  beforeEach(() => {
    useUser.mockReturnValue({ user: { token: 'jwt-de-prueba' } });
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no se pinta con una sola empresa: no hay nada que elegir', async () => {
    mockCompanies([NEXARA]);
    const { container } = render(<CompanySwitcher />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('no se pinta sin sesión y no llama al API', () => {
    useUser.mockReturnValue({ user: null });
    const fetchMock = mockCompanies([NEXARA, CONDUIT]);
    const { container } = render(<CompanySwitcher />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('con dos empresas muestra la primaria como activa por defecto', async () => {
    mockCompanies([NEXARA, CONDUIT]);
    render(<CompanySwitcher />);
    expect(await screen.findByRole('button', { name: /NEXARA/ })).toBeInTheDocument();
  });

  it('pide las empresas del usuario con su token', async () => {
    const fetchMock = mockCompanies([NEXARA, CONDUIT]);
    render(<CompanySwitcher />);
    await screen.findByRole('button', { name: /NEXARA/ });
    expect(String(fetchMock.mock.calls[0][0])).toContain('company/mine');
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt-de-prueba');
  });

  it('cae al listado público si /company/mine responde 403', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) =>
      String(url).includes('company/mine')
        ? new Response('denegado', { status: 403 })
        : new Response(JSON.stringify([NEXARA, CONDUIT]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<CompanySwitcher />);
    expect(await screen.findByRole('button', { name: /NEXARA/ })).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[1][0])).toContain('company-public/list');
  });

  it('el desplegable lista todas las empresas', async () => {
    mockCompanies([NEXARA, CONDUIT]);
    render(<CompanySwitcher />);
    await userEvent.click(await screen.findByRole('button', { name: /NEXARA/ }));
    expect(screen.getByText('Cambiar empresa activa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CONDUIT/ })).toBeInTheDocument();
  });

  it('elegir una empresa secundaria la guarda como activa', async () => {
    mockCompanies([NEXARA, CONDUIT]);
    render(<CompanySwitcher />);
    await userEvent.click(await screen.findByRole('button', { name: /NEXARA/ }));
    await userEvent.click(screen.getByRole('button', { name: /CONDUIT/ }));
    expect(getActiveCompanyId()).toBe(2);
    expect(await screen.findByRole('button', { name: /CONDUIT/ })).toBeInTheDocument();
  });

  it('volver a la primaria limpia el tenant en vez de fijar su id', async () => {
    // La primaria es el estado "sin override": guardar su id dejaría el header
    // X-Company-Id puesto para siempre aunque el usuario no haya elegido nada.
    setActiveCompanyId(2);
    mockCompanies([NEXARA, CONDUIT]);
    render(<CompanySwitcher />);
    await userEvent.click(await screen.findByRole('button', { name: /CONDUIT/ }));
    await userEvent.click(screen.getByRole('button', { name: /NEXARA/ }));
    expect(getActiveCompanyId()).toBeNull();
  });

  it('reacciona a un cambio de empresa hecho fuera del componente', async () => {
    mockCompanies([NEXARA, CONDUIT]);
    render(<CompanySwitcher />);
    await screen.findByRole('button', { name: /NEXARA/ });
    // El cambio llega por el bus de `lib/tenant`, no por un click: sin act()
    // React avisa de una actualización de estado fuera del ciclo del test.
    act(() => setActiveCompanyId(2));
    expect(await screen.findByRole('button', { name: /CONDUIT/ })).toBeInTheDocument();
  });

  it('si el API falla no rompe el panel', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('red caída'); }));
    const { container } = render(<CompanySwitcher />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
