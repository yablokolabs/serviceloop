import { useEffect, useRef, useState } from 'react';

interface Candidate {
  id: string;
  serviceStartMin: number;
  pickupMin?: number;
  bayId: string;
  driverId?: string;
  violatedPreference: string;
  date?: string;
}
interface Msg {
  from: 'you' | 'loop';
  text: string;
}
interface Proposal {
  proposalId: string;
  approvalToken: string;
  candidate: Candidate;
  finalPriceGbp?: number;
}

const CONVO = new URLSearchParams(window.location.search).get('convo') ?? `demo-${crypto.randomUUID()}`;
const NOW = () => new Date().toISOString();

function fmt(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// "Sat 31 Oct 2026" from a YYYY-MM-DD workshop date.
function fmtDate(date?: string): string {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

async function post(path: string, body: unknown): Promise<any> {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  // Failures must be visible: a 429 or 409 is an answer the user needs,
  // not a silently dropped message.
  if (!r.ok) throw new Error(j.error ?? `request failed (${r.status})`);
  return j;
}

const SUGGESTIONS = ['service Saturday morning with pickup at 10', 'car service Saturday please'];

export default function App() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: 'loop', text: 'ServiceLoop demo. Workshop reminders land here; tell me when your car is due.' },
  ]);
  const inboxSeen = useRef(0);
  const reminderSeeded = useRef(false);

  // The workshop writes first: ask the server to schedule this
  // conversation's opening reminder through the same authorized path the
  // recorded demo uses. Idempotent server-side, so reloads do not stack.
  useEffect(() => {
    if (reminderSeeded.current) return;
    reminderSeeded.current = true;
    post('/api/reminders/schedule', { conversationId: CONVO }).catch(() => {
      // API down: the local chat still works; the header says demo mode.
    });
  }, []);

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
  const [bookedTerms, setBookedTerms] = useState<{ candidate: Candidate; finalPriceGbp?: number } | null>(null);
  // One idempotency key per proposal: minted when the slot is held, kept
  // for retries of that same approval, never shared across proposals.
  const idemRef = useRef('');
  const [error, setError] = useState('');
  const [interpreter, setInterpreter] = useState('');
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Chat auto-scrolls only while the conversation is the active stage.
  // Once the button stage takes over (hold / approve / cancel), the chat
  // stops moving so the slots and approval panels hold the user's place.
  const stickChat = useRef(true);

  useEffect(() => {
    if (stickChat.current) chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [msgs, sending]);

  const say = (m: Msg) => setMsgs((p) => [...p, m]);

  async function sendText(text: string) {
    if (!text.trim()) return;
    stickChat.current = true;
    say({ from: 'you', text });
    setInput('');
    setError('');
    setSending(true);
    try {
      const r = await post('/api/turns', { conversationId: CONVO, text, nowIso: NOW() });
      if (r.interpreter) setInterpreter(r.interpreter);
      if (r.booking) {
        setBookingId(r.booking.bookingId);
        // A chat booking carries the same cancellation authority as the
        // button route, so the receipt's Cancel button works for both.
        if (r.booking.cancelToken) setCancelToken(r.booking.cancelToken);
        say({ from: 'loop', text: `Booked. Confirmation ${r.booking.bookingId}.` });
        return;
      }
      if (r.question) say({ from: 'loop', text: r.question });
      if (r.candidates) {
        setCandidates(r.candidates);
        setCompromises(r.compromises ?? []);
        if (r.candidates.length > 0) say({ from: 'loop', text: `${r.candidates.length} slot(s) fit your confirmed preferences.` });
      }
    } catch (e) {
      setError(`Request failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setSending(false);
    }
  }

  async function propose(id: string) {
    stickChat.current = false;
    try {
      const r = await post('/api/proposals', { conversationId: CONVO, candidateId: id });
      if (r.proposalId) {
        idemRef.current = `web-${crypto.randomUUID()}`;
        setProposal(r);
        say({
          from: 'loop',
          text: `Held slot. Approve to book ${r.candidate.bayId} on ${fmtDate(r.candidate.date)} at ${fmt(r.candidate.serviceStartMin)}.`,
        });
      } else {
        setError('Proposal refused. Pick a slot again.');
      }
    } catch (e) {
      setError(`Proposal refused: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }

  async function approve() {
    if (!proposal) return;
    stickChat.current = false;
    try {
      const r = await post('/api/confirm', {
        proposalId: proposal.proposalId,
        approvalToken: proposal.approvalToken,
        idempotencyKey: idemRef.current,
      });
      if (r.ok) {
        setBookingId(r.bookingId);
        setCancelToken(r.cancelToken);
        setBookedTerms({ candidate: proposal.candidate, finalPriceGbp: r.finalPriceGbp ?? proposal.finalPriceGbp });
        setProposal(null);
        say({ from: 'loop', text: `Booked. Confirmation ${r.bookingId}.` });
      } else {
        setError('Confirm refused. Pick a slot again.');
        setProposal(null);
      }
    } catch (e) {
      setError(`Confirm refused: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }

  async function cancel() {
    stickChat.current = false;
    try {
      const r = await post('/api/cancel', { bookingId, cancelToken });
      if (r.ok) {
        setBookingId(null);
        setBookedTerms(null);
        say({ from: 'loop', text: 'Booking cancelled.' });
      } else setError('Nothing to cancel.');
    } catch (e) {
      setError(`Cancel failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }

  async function uploadAudio(f: File) {
    try {
      const fd = new FormData();
      fd.append('audio', f);
      const r = await fetch('/api/voice', { method: 'POST', body: fd });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      say({ from: 'loop', text: `Voice note not transcribed yet: ${j.error ?? `request failed (${r.status})`}. Type your message instead.` });
    } catch {
      setError('Voice upload failed. Type your message instead.');
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brandmark">
          <img src="/serviceloop-icon.png" alt="" className="brandicon" />
          <span className="wordmark">
            ServiceLoop
            <small>Stop chasing. Start scheduling.</small>
          </span>
        </div>
        <span className="mode">Browser demo · simulated workshop — no real appointment</span>
        {interpreter && (
          <span className="mode mode-live">
            Interpretation: {interpreter}
            {interpreter === 'rules-demo' ? ' (labeled demo parser, no model)' : ''}
          </span>
        )}
      </header>

      <section className="hero">
        <h1>
          Stop chasing. <span className="accent">Start scheduling.</span>
        </h1>
        <p className="lede">
          Car-service booking by conversation. The workshop messages first from your reminder schedule; you approve the exact
          slot and price, deterministic checks do the booking.
        </p>
        <ul className="facts">
          <li>Workshop messages first</li>
          <li>You approve, code books</li>
          <li>Times Asia/Kolkata · stored UTC</li>
        </ul>
      </section>

      <div className="layout">
        <section className="panel chat-panel">
          <section className="chat" aria-label="conversation" ref={chatRef}>
            {msgs.map((m, i) => (
              <p key={i} className={`bubble ${m.from}`}>
                <span className="who">{m.from === 'you' ? 'You' : 'ServiceLoop'}</span>
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
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="chips" aria-label="examples">
            <span className="chips-label">Try:</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                onClick={() => {
                  setInput(s);
                  inputRef.current?.focus();
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              sendText(input);
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. service Saturday morning with pickup at 10"
              aria-label="message"
            />
            <button type="submit" className="primary">
              Send
            </button>
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
        </section>

        <aside className="side">
          {candidates.length > 0 && (
            <section aria-label="slots" className="card">
              <h2>Available slots</h2>
              {candidates.map((c) => (
                <div key={c.id} className="slot">
                  <div>
                    <div className="when">
                      {fmtDate(c.date)} · Service {fmt(c.serviceStartMin)}
                    </div>
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
                  {fmtDate(c.date)} · Service {fmt(c.serviceStartMin)}
                  {c.pickupMin !== undefined && ` · pickup ${fmt(c.pickupMin)}`} — relaxes: {c.violatedPreference}. Ask in chat to change a preference first.
                </p>
              ))}
            </section>
          )}
          {proposal && (
            <section aria-label="approval" className="card approval">
              <h2>Approve booking</h2>
              <p>
                {fmtDate(proposal.candidate.date)} · Bay {proposal.candidate.bayId} at {fmt(proposal.candidate.serviceStartMin)} (Asia/Kolkata)
                {proposal.candidate.pickupMin !== undefined && `, pickup ${fmt(proposal.candidate.pickupMin)}`}
                {proposal.finalPriceGbp !== undefined && (
                  <>
                    {' '}
                    · Final price <strong>£{proposal.finalPriceGbp}</strong> (simulated)
                  </>
                )}
                . Approving books exactly these terms.
              </p>
              <button onClick={approve} className="primary">
                Approve and book
              </button>
            </section>
          )}
          {bookingId !== null && (
            <section aria-label="receipt" className="card receipt">
              <h2>Receipt</h2>
              <p className="big">Booking {bookingId}</p>
              {bookedTerms && (
                <p>
                  {fmtDate(bookedTerms.candidate.date)} · Bay {bookedTerms.candidate.bayId} at {fmt(bookedTerms.candidate.serviceStartMin)}
                  {bookedTerms.candidate.pickupMin !== undefined && `, pickup ${fmt(bookedTerms.candidate.pickupMin)}`}
                  {bookedTerms.finalPriceGbp !== undefined && ` · £${bookedTerms.finalPriceGbp}`} (simulated)
                </p>
              )}
              <p>Simulated workshop · Asia/Kolkata times shown, stored as UTC.</p>
              <button onClick={cancel}>Cancel booking</button>
            </section>
          )}
          <section className="card how" aria-label="how it works">
            <h2>How it works</h2>
            <ol>
              <li>
                <strong>Reminder lands.</strong> The workshop writes first, on schedule.
              </li>
              <li>
                <strong>You reply in words.</strong> Interpretation (a live model, or the labeled rules-demo parser shown in the header) turns them into preferences; the ledger keeps every one as a revision.
              </li>
              <li>
                <strong>You approve the exact terms.</strong> Bay plus pickup driver are checked before anything books.
              </li>
            </ol>
            <p className="fineprint">
              Simulated workshop data. WhatsApp is not connected and no live calls are made. Voice notes return a
              not-configured status until transcription is wired in.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
