import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClientCreationForm from './ClientCreationForm';

const useUser = vi.hoisted(() => vi.fn());
vi.mock('./UserContext', () => ({ useUser }));

// El componente abre un socket de realtime al montar; en test no hay servidor.
vi.mock('@/lib/realtime-socket', () => ({
  createRealtimeSocket: () => ({ on: vi.fn(), disconnect: vi.fn() }),
}));

const crearCliente = () => screen.getByRole('button', { name: 'Crear cliente' });
const campo = (placeholder: string) => screen.getByPlaceholderText(placeholder);

describe('ClientCreationForm · validación de alta de cliente', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useUser.mockReturnValue({ user: { token: 'jwt-de-prueba' } });
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 1 }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('el nombre es obligatorio: sin él avisa y no llama al API', async () => {
    render(<ClientCreationForm />);
    await userEvent.click(crearCliente());
    expect(await screen.findByText('Nombre del cliente es requerido')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin sesión no envía nada ni muestra error de validación', async () => {
    useUser.mockReturnValue({ user: null });
    render(<ClientCreationForm />);
    await userEvent.click(crearCliente());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Nombre del cliente es requerido')).not.toBeInTheDocument();
  });

  it('con nombre envía un POST a service-clients con el token', async () => {
    render(<ClientCreationForm />);
    await userEvent.type(campo('Nombre del cliente *'), 'CFE');
    await userEvent.click(crearCliente());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('service-clients');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer jwt-de-prueba');
  });

  it('solo manda los campos opcionales que el usuario rellenó', async () => {
    render(<ClientCreationForm />);
    await userEvent.type(campo('Nombre del cliente *'), 'CFE');
    await userEvent.type(campo('Ciudad'), 'Monterrey');
    await userEvent.click(crearCliente());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get('name')).toBe('CFE');
    expect(body.get('city')).toBe('Monterrey');
    expect(body.has('contactEmail')).toBe(false);
    expect(body.get('isActive')).toBe('true');
  });

  it('propaga el mensaje de error del backend', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Ya existe un cliente con ese código' }), { status: 409 }),
    );
    render(<ClientCreationForm />);
    await userEvent.type(campo('Nombre del cliente *'), 'CFE');
    await userEvent.click(crearCliente());
    expect(await screen.findByText('Ya existe un cliente con ese código')).toBeInTheDocument();
  });

  it('tiene un mensaje genérico cuando el backend falla sin cuerpo', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    render(<ClientCreationForm />);
    await userEvent.type(campo('Nombre del cliente *'), 'CFE');
    await userEvent.click(crearCliente());
    expect(await screen.findByText('No se pudo crear el cliente')).toBeInTheDocument();
  });

  it('al crear con éxito limpia el formulario y avisa al padre', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onClientCreated = vi.fn();
    render(<ClientCreationForm onClientCreated={onClientCreated} />);
    const nombre = campo('Nombre del cliente *') as HTMLInputElement;
    await userEvent.type(nombre, 'CFE');
    await userEvent.click(crearCliente());

    expect(await screen.findByText('Cliente creado exitosamente')).toBeInTheDocument();
    expect(nombre.value).toBe('');
    await vi.advanceTimersByTimeAsync(600);
    expect(onClientCreated).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('muestra las credenciales de portal que devuelve el backend', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 1, credentials: { email: 'cfe@portal.mx', password: 'temporal' } }), { status: 201 }),
    );
    render(<ClientCreationForm />);
    await userEvent.type(campo('Nombre del cliente *'), 'CFE');
    await userEvent.click(crearCliente());
    // Aparece dos veces: en el aviso de credenciales y en el mensaje de éxito.
    expect((await screen.findAllByText(/cfe@portal\.mx/)).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Guarda estas credenciales/)).toBeInTheDocument();
  });
});
