/**
 * NEXARA · Vista Ejecutiva (CEO / Directores)
 * --------------------------------------------
 * Tablero embebido con KPIs ejecutivos. Phase 4 scaffold: secciones placeholder
 * que en Phase 5 se conectan a los endpoints reales de analytics.
 */
export default function ExecutiveDashboardPage() {
  const cards: { title: string; subtitle: string }[] = [
    { title: 'Ingresos del mes', subtitle: 'Cobrado vs facturado vs proyectado' },
    { title: 'Pipeline comercial', subtitle: 'Oportunidades por etapa y monto' },
    { title: 'Aprobaciones pendientes', subtitle: 'Mías y delegadas, por categoría' },
    { title: 'Cumplimiento SLA', subtitle: 'On-time vs breaches últimos 30 días' },
    { title: 'Cartera vencida', subtitle: 'Antigüedad de saldos por cliente' },
    { title: 'Productividad de campo', subtitle: 'Actividades cerradas por técnico' },
  ];

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Vista ejecutiva</h1>
        <p style={{ color: '#64748b', margin: '4px 0 0' }}>
          Indicadores consolidados para dirección general.
        </p>
      </header>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {cards.map((c) => (
          <section key={c.title} style={{
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20,
            minHeight: 140, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <header>
              <h3 style={{ margin: 0, fontSize: 14, color: '#64748b', fontWeight: 500 }}>{c.title}</h3>
            </header>
            <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>{c.subtitle}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
