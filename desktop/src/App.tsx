export default function App() {
  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        gap: 12,
        padding: 12,
        background: "var(--canvas-bg)",
      }}
    >
      {/* Drag region */}
      <div
        className="drag-region"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 40,
          zIndex: 100,
        }}
      />

      {/* Voice Rail */}
      <aside className="glass-panel" style={{ padding: 18, paddingTop: 48 }}>
        <div style={{ color: "var(--text-muted)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
          SEJFA
        </div>
        <div style={{ fontWeight: 600, fontSize: "1.1rem", marginTop: 6 }}>
          Voice + Monitor
        </div>
      </aside>

      {/* Main area */}
      <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 12, paddingTop: 36 }}>
        {/* Loop Canvas */}
        <main className="glass-panel" style={{ padding: 24, display: "grid", placeContent: "center", textAlign: "center" }}>
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Idle — speak the next objective
          </div>
        </main>

        {/* Event Stream */}
        <section className="glass-panel" style={{ padding: 18, minHeight: 160 }}>
          <div style={{ color: "var(--text-muted)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            Event Stream
          </div>
        </section>
      </div>
    </div>
  );
}
