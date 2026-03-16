"use client";


import { RoleGuard } from '../../../../components/RoleGuard';
import dynamic from "next/dynamic";
const UserForm = dynamic(() => import("./UserForm"), { ssr: false });
const ListUsers = dynamic(() => import("./list-users"), { ssr: false });

import { useUser } from '@/components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';

export default function UsersPage() {
  const { user } = useUser();
  return (
    <RoleGuard permissions={[PERMISSIONS.USERS_MANAGE]}>
      <h2 style={{ fontSize: '2rem', color: 'var(--primary)', marginBottom: 24 }}>Gestión de Usuarios</h2>
      {hasPermission(user, PERMISSIONS.USERS_MANAGE) && <UserForm />}
      <ListUsers />
      <HelpTab module="users" user={user} />
    </RoleGuard>
  );
}
