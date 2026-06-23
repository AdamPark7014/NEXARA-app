export default async function OportunidadDetallePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return (
    <article>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0 }}>Detalle</h2>
      <p style={{ color: '#64748b' }}>Cliente, monto, etapa de pipeline, probabilidad, fecha estimada de cierre.</p>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>ID: {id}</p>
    </article>
  );
}
