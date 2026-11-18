"use client";
import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function PublicTracking() {
  const [id, setId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function track(e: any) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`${API}/api/public/track/${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Shipment not found");
      setResult(data);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  const shipment = result?.shipment;
  return (
    <main className="public-page">
      <header><a href="/" className="brand"><span className="brand-mark small">T</span><span>tracenet<small>LOGISTICS INTELLIGENCE</small></span></a><span>PUBLIC SHIPMENT TRACKING</span></header>
      <section className="public-hero">
        <p className="eyebrow">END-TO-END VISIBILITY</p>
        <h1>Know where it is.<br/><span>Know it’s authentic.</span></h1>
        <p>Enter a TraceNet tracking ID to see the shipment journey and its verified checkpoint history.</p>
        <form onSubmit={track}>
          <input value={id} onChange={e => setId(e.target.value)} placeholder="Enter tracking ID, e.g. TRC-100" required />
          <button className="primary">{loading ? "Searching…" : "Track shipment →"}</button>
        </form>
        {error && <div className="alert error">{error}</div>}
      </section>
      {shipment && <section className="public-result">
        <div className="public-result-head"><div><p className="eyebrow">SHIPMENT {shipment.shipmentId}</p><h2>{shipment.productName || "Shipment"}</h2></div><span className={`badge ${String(shipment.status).toLowerCase()}`}>{String(shipment.status).replaceAll("_", " ")}</span></div>
        <div className="public-route"><div><small>ORIGIN</small><b>{shipment.source}</b></div><span>→</span><div><small>DESTINATION</small><b>{shipment.destination}</b></div><div><small>ESTIMATED ARRIVAL</small><b>{shipment.eta ? new Date(shipment.eta).toLocaleDateString() : "Not provided"}</b></div></div>
        <h3>Shipment journey</h3>
        <div className="public-timeline">{(shipment.checkpoints || []).map((checkpoint: any, index: number) => <div className="public-stop" key={index}><i className={checkpoint.scanned ? "done" : ""}/><div><b>{checkpoint.location}</b><small>{checkpoint.scanned ? (checkpoint.scannedAt ? new Date(checkpoint.scannedAt).toLocaleString() : "Checkpoint scanned") : "Upcoming checkpoint"}</small></div><span className={checkpoint.scanned ? "verified" : "muted"}>{checkpoint.scanned ? "✓ Scanned" : "Pending"}</span></div>)}</div>
        <h3>Blockchain proofs</h3>
        {(result.events || []).map((event: any) => <div className="proof-row" key={event.eventId}><span className={event.anchorStatus === "CONFIRMED" ? "verified" : "muted"}>{event.anchorStatus === "CONFIRMED" ? "✓" : "◷"} {event.anchorStatus}</span><code>{event.eventHash}</code><small>{event.createdAt ? new Date(event.createdAt).toLocaleString() : ""}</small></div>)}
        {!(result.events || []).length && <p className="muted">No checkpoint proofs recorded yet.</p>}
      </section>}
      <footer className="public-footer">Protected by TraceNet · Blockchain anchored tracking history</footer>
    </main>
  );
}
