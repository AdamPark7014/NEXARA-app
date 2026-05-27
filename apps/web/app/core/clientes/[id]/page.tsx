export default async function ClienteDatosPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return (
    <article>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0 }}>Datos generales</h2>
      <p style={{ color: '#64748b' }}>Razón social, RFC, contactos, dirección fiscal, condiciones comerciales.</p>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>ID: {id}</p>
    </article>
  );
}
