"use client";
import React from 'react';
import { useUser } from './UserContext';

interface RoleGuardProps {
  minLevel?: number;
  maxLevel?: number;
  children: React.ReactNode;
}

export const RoleGuard = ({ minLevel = 10, maxLevel = 100, children }: RoleGuardProps) => {
  const { user } = useUser();
  if (!user) return null;
  if (user.nivelAutoridad < minLevel || user.nivelAutoridad > maxLevel) return null;
  return <>{children}</>;
};
