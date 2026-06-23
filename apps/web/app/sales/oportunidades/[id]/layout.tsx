import type { ReactNode } from 'react';
import { TabBar, type TabItem } from '@/components/rbac/TabBar';

export default async function OportunidadDetailLayout(props: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const base = `/sales/oportunidades/${id}`;

  const tabs: TabItem[] = [
    { id: 'detalle', label: 'Detalle', href: base },
    { id: 'notas', label: 'Notas', href: `${base}/notas` },
    { id: 'cotizaciones', label: 'Cotizaciones', href: `${base}/cotizaciones` },
    { id: 'adjuntos', label: 'Adjuntos', href: `${base}/adjuntos` },
    { id: 'historial', label: 'Historial', href: `${base}/historial` },
  ];

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 16 }}>
        <a href="/sales/oportunidades" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none' }}>← Oportunidades</a>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0 0' }}>Oportunidad #{id}</h1>
      </header>
      <TabBar tabs={tabs} />
      <section>{props.children}</section>
    </div>
  );
}
