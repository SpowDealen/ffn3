export default function Home() {
  return (
    <main style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#0b0b0b", color: "white", minHeight: "100vh" }}>
      <header
        style={{
          borderBottom: "1px solid #222",
          padding: "20px 40px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "28px", fontWeight: "bold" }}>FULL FIGHT NEWS</h1>
        <nav style={{ display: "flex", gap: "20px", fontSize: "14px" }}>
          <span>Home</span>
          <span>News</span>
          <span>Fighters</span>
          <span>Events</span>
          <span>Results</span>
        </nav>
      </header>

      <section style={{ padding: "60px 40px", borderBottom: "1px solid #222" }}>
        <p style={{ color: "#999", textTransform: "uppercase", fontSize: "12px", letterSpacing: "2px" }}>
          Combat Sports Platform
        </p>
        <h2 style={{ fontSize: "48px", maxWidth: "800px", margin: "10px 0" }}>
          The latest news, events and fight results from UFC, MMA and Boxing.
        </h2>
        <p style={{ color: "#bbb", maxWidth: "700px", lineHeight: 1.6 }}>
          Full Fight News is being built to track breaking combat sports news, upcoming events, fighter profiles and fight results in one place.
        </p>
      </section>

      <section style={{ padding: "40px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>
        <div style={{ backgroundColor: "#111", padding: "20px", border: "1px solid #222", borderRadius: "12px" }}>
          <h3>Latest News</h3>
          <p style={{ color: "#aaa" }}>Daily stories, headlines and updates from the fight world.</p>
        </div>

        <div style={{ backgroundColor: "#111", padding: "20px", border: "1px solid #222", borderRadius: "12px" }}>
          <h3>Upcoming Events</h3>
          <p style={{ color: "#aaa" }}>Track the next UFC, MMA and boxing cards.</p>
        </div>

        <div style={{ backgroundColor: "#111", padding: "20px", border: "1px solid #222", borderRadius: "12px" }}>
          <h3>Fight Results</h3>
          <p style={{ color: "#aaa" }}>See results, winners, methods and round details.</p>
        </div>
      </section>
    </main>
  );
}