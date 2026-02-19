// Simple ErrorAlert component placeholder
export function ErrorAlert({ error }: { error: any }) {
  return (
    <div style={{ color: 'red', background: '#fee', padding: 8, borderRadius: 4, margin: '8px 0' }}>
      <strong>Error:</strong> {error?.message || 'Ocurrió un error'}
    </div>
  );
}
