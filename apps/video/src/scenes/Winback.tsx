import React from 'react';
import {Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT, SHADOW} from '../theme';
import {Header} from '../components/Header';

// Beats locked to narration: wb1@12, wb2@164, wb3@441 (30fps).
const B1 = 12;
const B2 = 164;
const B3 = 441;

const Rise: React.FC<{delay: number; children: React.ReactNode}> = ({delay, children}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + 14], [0, 1], {extrapolateRight: 'clamp'});
  const y = interpolate(frame, [delay, delay + 14], [26, 0], {extrapolateRight: 'clamp'});
  return <div style={{opacity: o, transform: `translateY(${y}px)`}}>{children}</div>;
};

const Bubble: React.FC<{at: number; children: React.ReactNode; dim?: boolean}> = ({at, children, dim}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = spring({frame: frame - at, fps, config: {damping: 200}});
  return (
    <div style={{background: dim ? '#f4f6f8' : C.navy, color: dim ? C.muted : '#fff', borderRadius: 22,
      padding: '20px 26px', fontSize: 27, lineHeight: 1.45, maxWidth: '94%',
      transform: `scale(${p})`, opacity: p, transformOrigin: 'left center'}}>
      {children}
    </div>
  );
};

const Row: React.FC<{at: number; k: string; v: string; hot?: boolean}> = ({at, k, v, hot}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + 10], [0, 1], {extrapolateRight: 'clamp'});
  const x = interpolate(frame, [at, at + 10], [-16, 0], {extrapolateRight: 'clamp'});
  return (
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      background: hot ? C.tint : '#f4f6f8', borderRadius: 14, padding: '13px 22px', marginBottom: 10,
      opacity: o, transform: `translateX(${x}px)`}}>
      <span style={{fontSize: 25, color: C.muted, fontWeight: 600}}>{k}</span>
      <span style={{fontSize: 26, color: hot ? C.accent : C.ink, fontWeight: 750}}>{v}</span>
    </div>
  );
};

export const Winback: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{width: 1920, height: 1080, background: C.bg, fontFamily: FONT, padding: '56px 110px', overflow: 'hidden'}}>
      <Sequence from={B1}><Audio src={staticFile('audio/wb1.wav')} /></Sequence>
      <Sequence from={B2}><Audio src={staticFile('audio/wb2.wav')} /></Sequence>
      <Sequence from={B3}><Audio src={staticFile('audio/wb3.wav')} /></Sequence>
      <Header section="WIN-BACK" />
      <Rise delay={14}>
        <div style={{fontSize: 34, color: C.accent, fontWeight: 600, margin: '26px 0 8px'}}>Win them back</div>
      </Rise>
      <Rise delay={20}>
        <h1 style={{fontSize: 88, fontWeight: 800, letterSpacing: '-0.035em', color: C.ink, marginBottom: 30}}>
          Silence is not a no
        </h1>
      </Rise>
      <div style={{display: 'flex', gap: 40}}>
        <div style={{flex: 1.05, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 26,
          boxShadow: SHADOW, padding: '36px 40px', display: 'flex', flexDirection: 'column', gap: 20}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span style={{fontSize: 25, letterSpacing: 3, color: C.muted, fontWeight: 700}}>CONVERSATION</span>
            <span style={{fontSize: 23, fontWeight: 700, color: C.accent, background: C.tint,
              borderRadius: 999, padding: '7px 20px', opacity: interpolate(frame, [B1 + 20, B1 + 34], [0, 1], {extrapolateRight: 'clamp'})}}>
              no reply · 30 min
            </span>
          </div>
          <Bubble at={B1}>
            ServiceLoop reminder: your annual car service is due. Reply with a day that suits you.
          </Bubble>
          <Bubble at={B2 + 60}>
            Still deciding? <b>WINBACK10</b> — 10% off, capped at £50. Quote it when you book.
          </Bubble>
          <Bubble at={B3 + 30}>
            No pressure — what is stopping you? Price, timing, pickup… or was our last service not good?
          </Bubble>
        </div>
        <div style={{flex: 1, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 26,
          boxShadow: SHADOW, padding: '36px 40px'}}>
          <div style={{fontSize: 25, letterSpacing: 3, color: C.muted, fontWeight: 700, marginBottom: 18}}>
            SEEDED POLICY · STAFF-CONTROLLED
          </div>
          <div style={{fontFamily: 'Geist Mono, monospace', fontSize: 44, fontWeight: 700, color: C.ink, marginBottom: 18}}>
            WINBACK10
          </div>
          <Row at={B2 + 10} k="Discount" v="10% off" />
          <Row at={B2 + 22} k="Cap" v="£50 max" />
          <Row at={B2 + 34} k="Expires" v="2026-12-31" />
          <Row at={B2 + 46} k="Staff approval" v="required ✓" hot />
          <Row at={B2 + 58} k="£149 basic →" v="£134 on approval" hot />
          <div style={{marginTop: 8, fontSize: 23, color: C.faint, opacity: interpolate(frame, [B2 + 80, B2 + 94], [0, 1], {extrapolateRight: 'clamp'})}}>
            The model cannot invent, raise or extend this offer.
          </div>
        </div>
      </div>
      <div style={{marginTop: 28, display: 'flex', gap: 14, justifyContent: 'center'}}>
        {['Price', 'Timing', 'Pickup', 'Bad last service → staff review'].map((t, i) => {
          const d = B3 + 110 + i * 10;
          const o = interpolate(frame, [d, d + 10], [0, 1], {extrapolateRight: 'clamp'});
          const hot = i === 3;
          return (
            <span key={t} style={{fontSize: 25, fontWeight: 700, borderRadius: 999, padding: '11px 28px',
              background: hot ? C.navy : '#fff', color: hot ? '#fff' : C.navy,
              border: `2px solid ${hot ? C.navy : C.line}`, opacity: o, boxShadow: SHADOW}}>
              {t}
            </span>
          );
        })}
      </div>
    </div>
  );
};
