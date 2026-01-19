"use client";


import { RoleGuard } from '../../../components/RoleGuard';
import dynamic from "next/dynamic";
const UserForm = dynamic(() => import("./UserForm"), { ssr: false });
const ListUsers = dynamic(() => import("./list-users"), { ssr: false });

export default function UsersPage() {
  return (
    <RoleGuard minLevel={50}>
      <h2 style={{ fontSize: '2rem', color: 'var(--primary)', marginBottom: 24 }}>Gestión de Usuarios</h2>
      {/* Formulario solo visible para CEO (nivel 100) */}
      <UserForm />
      <ListUsers />
    </RoleGuard>
  );
}
