import { useEffect, useRef, useState } from 'react';

interface Candidate {
  id: string;
  serviceStartMin: number;
  pickupMin?: number;
  bayId: string;
  driverId?: string;
  violatedPreference: string;
}
interface Msg {
  from: 'you' | 'loop';
  text: string;
}
interface Proposal {
  proposalId: string;
  approvalToken: string;
  candidate: Candidate;
}

const CONVO = new URLSearchParams(window.location.search).get('convo') ?? `demo-${Date.now().toString(36)}`;
const NOW = () => new Date().toISOString();

function fmt(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

async function post(path: string, body: unknown): Promise<any> {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

export default function App() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: 'loop', text: 'ServiceLoop demo. Workshop reminders land here; tell me when your car is due.' },
  ]);
  const inboxSeen = useRef(0);

  // Outbound-first: workshop messages (reminders, follow-ups) arrive via the
  // inbox and render in this chat as they are delivered.
  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/inbox?conversationId=${encodeURIComponent(CONVO)}`);
        const j = (await r.json()) as { messages: { text: string }[] };
        if (!live) return;
        const fresh = j.messages.slice(inboxSeen.current);
        if (fresh.length) {
          inboxSeen.current = j.messages.length;
          fresh.forEach((m) => say({ from: 'loop', text: m.text }));
        }
      } catch {
        // API down: keep the local chat usable.
      }
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);
  const [input, setInput] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [compromises, setCompromises] = useState<Candidate[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [cancelToken, setCancelToken] = useState('');
  const [idem] = useState(() => `web-${Date.now()}`);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLElement>(null);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [msgs, sending]);

  const say = (m: Msg) => setMsgs((p) => [...p, m]);

  async function sendText(text: string) {
    if (!text.trim()) return;
    say({ from: 'you', text });
    setInput('');
    setError('');
    setSending(true);
    try {
      const r = await post('/api/turns', { conversationId: CONVO, text, nowIso: NOW() });
      if (r.booking) {
        setBookingId(r.booking.bookingId);
        say({ from: 'loop', text: `Booked. Confirmation ${r.booking.bookingId}.` });
        return;
      }
      if (r.question) say({ from: 'loop', text: r.question });
      if (r.candidates) {
        setCandidates(r.candidates);
        setCompromises(r.compromises ?? []);
        if (r.candidates.length > 0) say({ from: 'loop', text: `${r.candidates.length} slot(s) fit your confirmed preferences.` });
      }
    } catch {
      setError('Request failed. API reachable?');
    } finally {
      setSending(false);
    }
  }

  async function propose(id: string) {
    const r = await post('/api/proposals', { conversationId: CONVO, candidateId: id });
    if (r.proposalId) {
      setProposal(r);
      say({ from: 'loop', text: `Held slot. Approve to book ${r.candidate.bayId} at ${fmt(r.candidate.serviceStartMin)}.` });
    } else {
      setError(`Proposal refused: ${r.error ?? 'unknown'}`);
    }
  }

  async function approve() {
    if (!proposal) return;
    const r = await post('/api/confirm', {
      proposalId: proposal.proposalId,
      approvalToken: proposal.approvalToken,
      idempotencyKey: idem,
    });
    if (r.ok) {
      setBookingId(r.bookingId);
      setCancelToken(r.cancelToken);
      setProposal(null);
      say({ from: 'loop', text: `Booked. Confirmation ${r.bookingId}.` });
    } else {
      setError(`Confirm refused: ${r.error ?? 'unknown'}. Pick a slot again.`);
      setProposal(null);
    }
  }

  async function cancel() {
    const r = await post('/api/cancel', { bookingId, cancelToken });
    if (r.ok) {
      setBookingId(null);
      say({ from: 'loop', text: 'Booking cancelled.' });
    } else setError('Nothing to cancel.');
  }

  async function uploadAudio(f: File) {
    const fd = new FormData();
    fd.append('audio', f);
    const r = await fetch('/api/voice', { method: 'POST', body: fd });
    const j = await r.json();
    say({ from: 'loop', text: `Voice note not transcribed yet: ${j.error}. Type your message instead.` });
  }

  return (
    <main>
      <header className="top">
        <img src="/serviceloop-logo.png" alt="ServiceLoop" className="brand" />
        <p>Car-service booking by conversation. You approve, deterministic checks book.</p>
        <span className="mode">Browser demo · simulated workshop — no real appointment</span>
      </header>
      <section className="chat" aria-label="conversation" ref={chatRef}>
        {msgs.map((m, i) => (
          <p key={i} className={`bubble ${m.from}`}>
            <span className="who">{m.from === 'you' ? 'You' : 'ServiceLoop'}: </span>
            {m.text}
          </p>
        ))}
        {sending && (
          <p className="bubble loop" aria-label="typing">
            <span className="typing" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </p>
        )}
      </section>
      {error && <p className="error">{error}</p>}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          sendText(input);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. service Saturday morning with pickup at 10" aria-label="message" />
        <button type="submit" className="primary">Send</button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Voice note
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadAudio(f);
          }}
        />
      </form>
      {candidates.length > 0 && (
        <section aria-label="slots" className="card">
          <h2>Available slots</h2>
          {candidates.map((c) => (
            <div key={c.id} className="slot">
              <div>
                <div className="when">Service {fmt(c.serviceStartMin)}</div>
                <div className="meta">
                  {c.pickupMin !== undefined && `Pickup ${fmt(c.pickupMin)} (${c.driverId}) · `}Bay {c.bayId.replace('bay-', '')} · simulated
                </div>
              </div>
              <button onClick={() => propose(c.id)}>Hold this slot</button>
            </div>
          ))}
        </section>
      )}
      {compromises.length > 0 && (
        <section aria-label="compromises" className="card">
          <h2>No exact fit — compromises</h2>
          {compromises.map((c) => (
            <p key={c.id} className="compromise">
              Service {fmt(c.serviceStartMin)}
              {c.pickupMin !== undefined && ` · pickup ${fmt(c.pickupMin)}`} — relaxes: {c.violatedPreference}. Ask in chat to change a preference first.
            </p>
          ))}
        </section>
      )}
      {proposal && (
        <section aria-label="approval" className="card">
          <h2>Approve booking</h2>
          <p>
            Bay {proposal.candidate.bayId} at {fmt(proposal.candidate.serviceStartMin)}
            {proposal.candidate.pickupMin !== undefined && `, pickup ${fmt(proposal.candidate.pickupMin)}`}.
          </p>
          <button onClick={approve} className="primary">Approve and book</button>
        </section>
      )}
      {bookingId !== null && (
        <section aria-label="receipt" className="card receipt">
          <h2>Receipt</h2>
          <p className="big">Booking {bookingId}</p>
          <p>
            Simulated workshop · Asia/Kolkata times shown, stored as UTC.
          </p>
          <button onClick={cancel}>Cancel booking</button>
        </section>
      )}
    </main>
  );
}
