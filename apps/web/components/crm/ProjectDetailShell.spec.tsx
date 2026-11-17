import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import ProjectDetailShell from './ProjectDetailShell';

const mocks = vi.hoisted(() => { const replace = vi.fn(); return { replace, router: { replace }, resumen: vi.fn() }; });
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }));
vi.mock('@/components/UserContext', () => ({ useUser: () => ({ user: { token: 'token-prueba' } }) }));
vi.mock('@/lib/sales-api', () => ({ getSalesProjectSummary: mocks.resumen }));

describe('detalle comercial retirado', () => {
  beforeEach(() => vi.clearAllMocks());
  it('resuelve el id operativo sin usar el id comercial como si fuera del maestro', async () => {
    mocks.resumen.mockResolvedValue({ project: { name: 'Obra' }, operational: { id: 99 } });
    render(<ProjectDetailShell id="7"><span>Formulario comercial antiguo</span></ProjectDetailShell>);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/erp/proyectos/99'));
    expect(screen.queryByText('Formulario comercial antiguo')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '‹ Proyectos' })).toHaveAttribute('href', '/erp/proyectos');
  });
  it('muestra el error del servidor y permite reintentar la resolución', async () => {
    mocks.resumen.mockRejectedValue(new Error('Sin permiso para este proyecto'));
    render(<ProjectDetailShell id="7">Antiguo</ProjectDetailShell>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin permiso para este proyecto');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
