import type {DecisionMemoryEvent} from "../types";
export default function MemoryTimeline({events}: {events: DecisionMemoryEvent[]}) { return <ol className="memory-timeline">{events.map((event) => <li key={event.id}><strong>{event.type}</strong><span>{event.reason}</span><small>{new Date(event.occurredAt).toLocaleString("es-ES")} · {event.actor.id ?? event.actor.type}</small></li>)}</ol>; }
