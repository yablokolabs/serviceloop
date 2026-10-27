import React from 'react';
import {Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {C, FONT, SHADOW} from '../theme';

const CAPS: {from: number; to: number; text: string}[] = [
  {from: 0, to: 105, text: 'It starts with a scheduled workshop reminder'},
  {from: 105, to: 245, text: 'Vague reply in → clear question out'},
  {from: 420, to: 634, text: 'Ambiguous cutoff flagged, not guessed'},
  {from: 780, to: 928, text: 'Full request → real slot: pickup 10:00, service 10:30'},
  {from: 975, to: 1111, text: 'Hold it, approve with your token'},
  {from: 1260, to: 1372, text: 'Booked — receipt confirms every detail'},
];

const Caption: React.FC<{from: number; to: number; text: string}> = ({from, to, text}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const o = interpolate(frame, [from, from + 8, to - 8, to], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const y = interpolate(frame, [from, from + 10], [20, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', left: 140, bottom: 64, background: 'rgba(11,34,51,.88)', color: '#fff',
      borderRadius: 20, padding: '20px 36px', fontSize: 33, fontWeight: 600, opacity: o,
      transform: `translateY(${y}px)`, boxShadow: SHADOW, backdropFilter: 'blur(4px)'}}>
      {text}
    </div>
  );
};

export const S4: React.FC = () => {
  const frame = useCurrentFrame();
  const chromeO = interpolate(frame, [6, 18], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <div style={{width: 1920, height: 1080, background: '#e8edf1', fontFamily: FONT, position: 'relative', overflow: 'hidden'}}>
      <Sequence from={105}><Audio src={staticFile('audio/s4a.wav')} /></Sequence>
      <Sequence from={420}><Audio src={staticFile('audio/s4c.wav')} /></Sequence>
      <Sequence from={780}><Audio src={staticFile('audio/s4d.wav')} /></Sequence>
      <Sequence from={975}><Audio src={staticFile('audio/s4b.wav')} /></Sequence>
      <Sequence from={1260}><Audio src={staticFile('audio/s4e.wav')} /></Sequence>
      <div style={{position: 'absolute', left: 96, top: 0, width: 1728, height: 1080,
        boxShadow: '0 0 90px rgba(11,34,51,.35)'}}>
        <OffthreadVideo
          src={staticFile('footage/s4-demo.webm')}
          volume={0}
          style={{width: 1728, height: 1080}}
        />
      </div>
      <div style={{position: 'absolute', top: 26, left: 0, right: 0, display: 'flex',
        justifyContent: 'center', opacity: chromeO}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 18, background: 'rgba(255,255,255,.94)',
          borderRadius: 999, padding: '12px 30px 12px 24px', boxShadow: SHADOW}}>
          <span style={{display: 'flex', gap: 8}}>
            {['#ef5b45', '#f5a623', '#1e7e34'].map((c) => (
              <i key={c} style={{width: 18, height: 18, borderRadius: '50%', background: c, display: 'block'}} />
            ))}
          </span>
          <span style={{fontSize: 25, color: C.muted, fontWeight: 600}}>127.0.0.1:5173 · simulated workshop — no real appointment</span>
        </div>
      </div>
      <div style={{position: 'absolute', top: 26, left: 140, display: 'flex', alignItems: 'center', gap: 12,
        background: C.accent, color: '#fff', borderRadius: 999, padding: '12px 28px',
        fontSize: 25, fontWeight: 800, letterSpacing: 2, opacity: chromeO, boxShadow: SHADOW}}>
        <span style={{width: 14, height: 14, borderRadius: '50%', background: '#fff'}} /> LIVE DEMO
      </div>
      {CAPS.map((c, i) => <Caption key={i} {...c} />)}
    </div>
  );
};
