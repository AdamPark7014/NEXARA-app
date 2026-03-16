"use client";
import React from 'react';
import { ClientTicketsPanel } from './ClientTicketsPanel';
import HelpTab from '@/components/HelpTab';

export default function ClientTicketsPage() {
  return (
    <>
      <HelpTab module="client-tickets" />
      <ClientTicketsPanel />
    </>
  );
}
