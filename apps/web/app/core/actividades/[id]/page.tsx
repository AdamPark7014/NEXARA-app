export default async function ActividadDetallePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return (
    <article>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0 }}>Detalle de actividad</h2>
      <p style={{ color: '#64748b' }}>Información general, cliente, ubicación, técnico asignado, ventana.</p>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>ID: {id}</p>
    </article>
  );
}
