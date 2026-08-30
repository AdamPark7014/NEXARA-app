export default function PanelLoading() {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "40vh",
        padding: 32,
        fontFamily: "var(--nx-font-ui, system-ui)",
        color: "var(--text-secondary, #64748b)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          aria-hidden
          style={{
            width: 28,
            height: 28,
            margin: "0 auto 12px",
            borderRadius: "50%",
            border: "2.5px solid var(--border, #e2e8f0)",
            borderTopColor: "var(--primary, #0ea5e9)",
            animation: "nx-spin 0.7s linear infinite",
          }}
        />
        <div style={{ fontSize: 13, fontWeight: 600 }}>Cargando…</div>
        <style>{`@keyframes nx-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
