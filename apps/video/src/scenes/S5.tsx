import React from 'react';
import {Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT, SHADOW} from '../theme';
import {Header} from '../components/Header';

// Beats locked to narration (30fps).
const T = {browser: 90, wire1: 105, api: 135, guards: 260, wireG: 270, sqlite: 447, wireS: 460,
  models: 551, wireM: 560, wonder: 620, worker: 702, wireW: 715, pulse: 760, pending: 790};

const Rise: React.FC<{delay: number; children: React.ReactNode}> = ({delay, children}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + 14], [0, 1], {extrapolateRight: 'clamp'});
  const y = interpolate(frame, [delay, delay + 14], [26, 0], {extrapolateRight: 'clamp'});
  return <div style={{opacity: o, transform: `translateY(${y}px)`}}>{children}</div>;
};

const Card: React.FC<{at: number; x: number; y: number; w: number; icon: string; title: string;
  children: React.ReactNode; dashed?: boolean; pending?: boolean}> = ({at, x, y, w, icon, title, children, dashed, pending}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = spring({frame: frame - at, fps, config: {damping: 200}});
  const glow = interpolate(frame, [at, at + 45], [0.55, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const border = pending ? C.accent : C.navy;
  return (
    <div style={{position: 'absolute', left: x, top: y, width: w, background: '#fff',
      border: `3px ${dashed ? 'dashed' : 'solid'} ${border}`, borderRadius: 24, padding: '22px 28px',
      boxShadow: `${SHADOW}, 0 0 0 ${Math.round(glow * 22)}px rgba(239,91,69,${glow})`,
      transform: `scale(${p})`, opacity: p}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8}}>
        <div style={{width: 58, height: 58, borderRadius: 17, background: pending ? C.tint : C.navyTint,
          fontSize: 31, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{icon}</div>
        <div style={{fontSize: 35, fontWeight: 750, letterSpacing: '-0.02em', color: pending ? C.accent : C.navy}}>{title}</div>
      </div>
      <div style={{fontSize: 25, color: C.muted, lineHeight: 1.5}}>{children}</div>
    </div>
  );
};

const Wire: React.FC<{at: number; x1: number; y1: number; x2: number; y2: number; label: string; lx: number; ly: number; anchor?: string}> = ({
  at, x1, y1, x2, y2, label, lx, ly, anchor,
}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + 10], [0, 1], {extrapolateRight: 'clamp'});
  const len = Math.hypot(x2 - x1, y2 - y1);
  const dots = [0, 1].map((k) => {
    const d = (((frame - at) * 9 + (k * len) / 2) % len + len) % len;
    return {x: x1 + ((x2 - x1) * d) / len, y: y1 + ((y2 - y1) * d) / len};
  });
  return (
    <g opacity={o}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.navy} strokeWidth={4}
        strokeDasharray="12 10" strokeDashoffset={-frame * 3} strokeLinecap="round" />
      {frame >= at && dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={9} fill={C.accent} />)}
      <text x={lx} y={ly} fontSize={23} fill={C.muted} fontFamily={FONT} fontWeight={600} textAnchor={anchor ?? 'start'}
        style={{paintOrder: 'stroke', stroke: '#fafaf9', strokeWidth: 7, strokeLinejoin: 'round'}}>{label}</text>
    </g>
  );
};

const Chip: React.FC<{at: number; children: React.ReactNode}> = ({at, children}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + 10], [0, 1], {extrapolateRight: 'clamp'});
  const s = interpolate(frame, [at, at + 10], [0.8, 1], {extrapolateRight: 'clamp'});
  return (
    <span style={{display: 'inline-block', background: C.navyTint, borderRadius: 12, padding: '6px 18px',
      fontSize: 23, fontWeight: 600, color: C.navy, margin: '5px 8px 0 0', opacity: o, transform: `scale(${s})`}}>
      {children}
    </span>
  );
};

export const S5: React.FC = () => {
  const frame = useCurrentFrame();
  const hot = interpolate(frame, [T.wonder, T.wonder + 12, T.wonder + 40, T.wonder + 52], [0, 1, 1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const pulse = frame >= T.pulse && frame < T.pulse + 70
    ? 0.5 + 0.5 * Math.sin(((frame - T.pulse) / 70) * Math.PI * 4)
    : 0;
  return (
    <div style={{width: 1920, height: 1080, background: C.bg, fontFamily: FONT, padding: '56px 110px', position: 'relative', overflow: 'hidden'}}>
      <Sequence from={15}><Audio src={staticFile('audio/s5i.wav')} /></Sequence>
      <Sequence from={86}><Audio src={staticFile('audio/s5a.wav')} /></Sequence>
      <Sequence from={260}><Audio src={staticFile('audio/s5g.wav')} /></Sequence>
      <Sequence from={447}><Audio src={staticFile('audio/s5d.wav')} /></Sequence>
      <Sequence from={551}><Audio src={staticFile('audio/s5m.wav')} /></Sequence>
      <Sequence from={702}><Audio src={staticFile('audio/s5w.wav')} /></Sequence>
      <Header section="ARCHITECTURE" />
      <Rise delay={16}>
        <div style={{fontSize: 34, color: C.accent, fontWeight: 600, margin: '26px 0 8px'}}>Under the hood</div>
      </Rise>
      <Rise delay={22}>
        <h1 style={{fontSize: 88, fontWeight: 800, letterSpacing: '-0.035em', color: C.ink}}>
          Guards validate. <span style={{color: C.accent}}>Models interpret.</span>
        </h1>
      </Rise>
      <svg style={{position: 'absolute', left: 0, top: 0, width: 1920, height: 1080}} viewBox="0 0 1920 1080">
        <Wire at={T.wire1} x1={512} y1={505} x2={596} y2={505} label="POST" lx={516} ly={488} />
        <Wire at={T.wireG} x1={815} y1={600} x2={815} y2={646} label="validates" lx={700} ly={630} />
        <Wire at={T.wireS} x1={1032} y1={770} x2={1116} y2={770} label="persists" lx={1112} ly={800} anchor="end" />
        <Wire at={T.wireM} x1={1032} y1={505} x2={1116} y2={505} label="chat" lx={1036} ly={488} />
        <Wire at={T.wireW} x1={596} y1={770} x2={512} y2={770} label="polls" lx={512} ly={800} />
      </svg>
      <Card at={T.browser} x={110} y={400} w={400} icon="✉" title="Browser chat">
        React UI · text + voice-note upload · simulated-workshop label
      </Card>
      <Card at={T.api} x={600} y={400} w={430} icon="⚙" title="Node API :3101">
        turns · proposals · confirm · cancel · snooze · opt-out
      </Card>
      <Card at={T.models} x={1120} y={400} w={430} icon="✦" title="Meta direct">
        Spark 1.3 reads each message
        <br />
        <span style={{background: `rgba(239,91,69,${0.25 * hot})`, borderRadius: 8, padding: '0 8px',
          fontWeight: hot > 0.3 ? 750 : 400, color: hot > 0.3 ? C.accent : C.muted}}>
          Wonder 1.0 joins on ambiguity
        </span>
      </Card>
      <Card at={T.pending} x={1600} y={400} w={210} icon="⚑" title="Labels" pending>
        WhatsApp pending · no live calls · simulated data
      </Card>
      <Card at={T.guards} x={600} y={652} w={430} icon="◈" title="Deterministic guards" dashed>
        <Chip at={T.guards + 15}>ledger</Chip>
        <Chip at={T.guards + 30}>bay+pickup solver</Chip>
        <Chip at={T.guards + 45}>approval tokens</Chip>
        <Chip at={T.guards + 60}>idempotency</Chip>
      </Card>
      <Card at={T.sqlite} x={1120} y={652} w={430} icon="▤" title="SQLite (WAL)">
        ledger · holds · bookings · jobs · UTC storage
      </Card>
      {pulse > 0 && (
        <div style={{position: 'absolute', left: 110, top: 652, width: 400, height: 268, borderRadius: 24,
          boxShadow: `0 0 0 ${Math.round(pulse * 18)}px rgba(239,91,69,${pulse * 0.5})`}} />
      )}
      <Card at={T.worker} x={110} y={652} w={400} icon="↻" title="Follow-up worker">
        leased ticks · bounded retries · opt-out recheck
      </Card>
    </div>
  );
};
