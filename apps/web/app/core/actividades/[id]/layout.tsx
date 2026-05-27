import type { ReactNode } from 'react';
import { TabBar, type TabItem } from '@/components/rbac/TabBar';
import { ROLES } from '@/lib/rbac';

export default async function ActividadDetailLayout(props: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const base = `/core/actividades/${id}`;

  const tabs: TabItem[] = [
    { id: 'detalle', label: 'Detalle', href: base },
    { id: 'evidencias', label: 'Evidencias', href: `${base}/evidencias` },
    {
      id: 'viaticos', label: 'Viáticos', href: `${base}/viaticos`,
      roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.ADMINISTRATIVO, ROLES.ING_CAMPO],
    },
    {
      id: 'aprobaciones', label: 'Aprobaciones', href: `${base}/aprobaciones`,
      roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.COORD_OPERACIONES],
    },
    { id: 'historial', label: 'Historial', href: `${base}/historial` },
  ];

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 16 }}>
        <a href="/core/actividades" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none' }}>← Actividades</a>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0 0' }}>Actividad #{id}</h1>
      </header>
      <TabBar tabs={tabs} />
      <section>{props.children}</section>
    </div>
  );
}
