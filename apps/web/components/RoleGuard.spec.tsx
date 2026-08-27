import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RoleGuard from './RoleGuard';
import { PERMISSIONS } from '@/lib/permissions';

const useUser = vi.hoisted(() => vi.fn());
vi.mock('./UserContext', () => ({ useUser }));

function renderGuard(props: React.ComponentProps<typeof RoleGuard>) {
  return render(<RoleGuard {...props} />);
}

const secreto = <span>contenido protegido</span>;

describe('RoleGuard · ocultar UI por permisos', () => {
  it('sin sesión no pinta nada', () => {
    useUser.mockReturnValue({ user: null });
    renderGuard({ permissions: [PERMISSIONS.GPS_VIEW], children: secreto });
    expect(screen.queryByText('contenido protegido')).not.toBeInTheDocument();
  });

  it('exige TODOS los permisos de `permissions`', () => {
    useUser.mockReturnValue({ user: { permissions: [PERMISSIONS.GPS_VIEW] } });
    renderGuard({ permissions: [PERMISSIONS.GPS_VIEW, PERMISSIONS.GPS_MANAGE], children: secreto });
    expect(screen.queryByText('contenido protegido')).not.toBeInTheDocument();
  });

  it('muestra el contenido con la lista completa de permisos', () => {
    useUser.mockReturnValue({ user: { permissions: [PERMISSIONS.GPS_VIEW, PERMISSIONS.GPS_MANAGE] } });
    renderGuard({ permissions: [PERMISSIONS.GPS_VIEW, PERMISSIONS.GPS_MANAGE], children: secreto });
    expect(screen.getByText('contenido protegido')).toBeInTheDocument();
  });

  it('con `anyPermissions` basta uno', () => {
    useUser.mockReturnValue({ user: { permissions: [PERMISSIONS.ATTENDANCE_MANAGE] } });
    renderGuard({ anyPermissions: [PERMISSIONS.GPS_MANAGE, PERMISSIONS.ATTENDANCE_MANAGE], children: secreto });
    expect(screen.getByText('contenido protegido')).toBeInTheDocument();
  });

  it('con `anyPermissions` y ninguno, se oculta', () => {
    useUser.mockReturnValue({ user: { permissions: ['otra.cosa'] } });
    renderGuard({ anyPermissions: [PERMISSIONS.GPS_MANAGE, PERMISSIONS.ATTENDANCE_MANAGE], children: secreto });
    expect(screen.queryByText('contenido protegido')).not.toBeInTheDocument();
  });

  it('el superadmin pasa cualquier comprobación', () => {
    useUser.mockReturnValue({ user: { isSuperAdmin: true, permissions: [] } });
    renderGuard({ permissions: [PERMISSIONS.ACCOUNTING_CLOSE_PERIOD], children: secreto });
    expect(screen.getByText('contenido protegido')).toBeInTheDocument();
  });

  it('sin restricciones declaradas, un usuario con sesión ve el contenido', () => {
    useUser.mockReturnValue({ user: { permissions: [] } });
    renderGuard({ children: secreto });
    expect(screen.getByText('contenido protegido')).toBeInTheDocument();
  });

  it('un array de permisos vacío no bloquea', () => {
    useUser.mockReturnValue({ user: { permissions: [] } });
    renderGuard({ permissions: [], anyPermissions: [], children: secreto });
    expect(screen.getByText('contenido protegido')).toBeInTheDocument();
  });
});
