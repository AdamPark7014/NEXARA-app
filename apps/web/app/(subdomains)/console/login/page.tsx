"use client";

import PanelLogin from "@/components/PanelLogin";
import HelpTab from '@/components/HelpTab';

export default function ConsoleLoginPage() {
  return (
    <>
      <HelpTab module="login" />
      <PanelLogin redirectTo="/dashboard" />
    </>
  );
}
