"use client";

import { useEffect, useState } from 'react';
import ToolRenewalsTable from '@/components/ToolRenewalsTable';
import HelpTab from '@/components/HelpTab';

export default function ToolRenewalsPage() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const sync = () => setIsMobile(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? 12 : 24 }}>
      <HelpTab module="tools-renewals" />
      <ToolRenewalsTable />
    </div>
  );
}
