export default async function ActividadEvidenciasPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return (
    <article>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0 }}>Evidencias</h2>
      <p style={{ color: '#64748b' }}>
        Fotos antes/durante/después, PDFs firmados, geolocalización y sello temporal.
        Esta sección ahora vive embebida en la actividad (consolidación Phase 3).
      </p>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>
        Consume <code>/api/activity-evidence?activityId={id}</code>.
      </p>
    </article>
  );
}
