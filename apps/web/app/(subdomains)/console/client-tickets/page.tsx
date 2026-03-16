"use client";
import React from 'react';
import { ClientTicketsPanel } from './ClientTicketsPanel';
import HelpTab from '@/components/HelpTab';
import { useUser } from '@/components/UserContext';

export default function ClientTicketsPage() {
  const { user } = useUser();

  return (
    <>
      <HelpTab module="client-tickets" user={user} />
      <ClientTicketsPanel />
    </>
  );
}
