"use client";
import React from 'react';
import { useUser } from './UserContext';
import { hasAnyPermission, hasPermission } from '../lib/permissions';

interface RoleGuardProps {
  permissions?: string[];
  anyPermissions?: string[];
  children: React.ReactNode;
}

export const RoleGuard = ({ permissions, anyPermissions, children }: RoleGuardProps) => {
  const { user } = useUser();
  if (!user) return null;
  if (permissions && permissions.length > 0 && !permissions.every((permission) => hasPermission(user, permission))) {
    return null;
  }
  if (anyPermissions && anyPermissions.length > 0 && !hasAnyPermission(user, anyPermissions)) {
    return null;
  }
  return <>{children}</>;
};
