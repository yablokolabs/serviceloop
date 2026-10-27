import React from 'react';
import {Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT, SHADOW} from '../theme';
import {Header} from '../components/Header';

// Beats locked to narration: s2a@12, s2b@237, s2c@390 (30fps).
const BEATS = [12, 237, 390];

const Rise: React.FC<{delay: number; children: React.ReactNode}> = ({delay, children}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + 16], [0, 1], {extrapolateRight: 'clamp'});
  const y = interpolate(frame, [delay, delay + 16], [30, 0], {extrapolateRight: 'clamp'});
  return <div style={{opacity: o, transform: `translateY(${y}px)`}}>{children}</div>;
};

const Card: React.FC<{beat: number; icon: string; title: string; desc: string; children: React.ReactNode}> = ({
  beat, icon, title, desc, children,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = spring({frame: frame - beat, fps, config: {damping: 200}});
  return (
    <div style={{flex: 1, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 26, padding: '30px 36px',
      boxShadow: SHADOW, transform: `scale(${p}) translateY(${(1 - p) * 30}px)`, opacity: p}}>
      <div style={{width: 76, height: 76, borderRadius: 22, background: C.tint, color: C.accent,
        fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14}}>{icon}</div>
      <h2 style={{fontSize: 44, fontWeight: 750, letterSpacing: '-0.02em', color: C.ink, marginBottom: 10}}>{title}</h2>
      <p style={{fontSize: 28, color: C.muted, lineHeight: 1.45, marginBottom: 16}}>{desc}</p>
      {children}
    </div>
  );
};

const Skel: React.FC<{beat: number; i: number; w: string}> = ({beat, i, w}) => {
  const frame = useCurrentFrame();
  const d = beat + 14 + i * 8;
  const o = interpolate(frame, [d, d + 10], [0, 1], {extrapolateRight: 'clamp'});
  const x = interpolate(frame, [d, d + 10], [-16, 0], {extrapolateRight: 'clamp'});
  return <div style={{height: 26, width: w, borderRadius: 13, background: '#e8edf1', marginBottom: 12, opacity: o, transform: `translateX(${x}px)`}} />;
};

export const S2: React.FC = () => {
  const frame = useCurrentFrame();
  const b = interpolate(frame, [520, 536], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <div style={{width: 1920, height: 1080, background: C.bg, fontFamily: FONT, padding: '60px 110px', overflow: 'hidden'}}>
      <Audio src={staticFile('audio/s2a.wav')} />
      <Sequence from={BEATS[1]}><Audio src={staticFile('audio/s2b.wav')} /></Sequence>
      <Sequence from={BEATS[2]}><Audio src={staticFile('audio/s2c.wav')} /></Sequence>
      <Header section="THE PROBLEM" />
      <Rise delay={14}>
        <div style={{fontSize: 36, color: C.accent, fontWeight: 600, margin: '26px 0 10px'}}>A strong workshop</div>
      </Rise>
      <Rise delay={20}>
        <h1 style={{fontSize: 92, fontWeight: 800, letterSpacing: '-0.035em', color: C.ink, marginBottom: 28}}>
          Bookings fall through the cracks
        </h1>
      </Rise>
      <div style={{display: 'flex', gap: 36}}>
        <Card beat={BEATS[0]} icon="✉" title="Missed messages" desc="Calls, texts and voicemails pile up. Nobody replies in time.">
          <Skel beat={BEATS[0]} i={0} w="92%" /><Skel beat={BEATS[0]} i={1} w="78%" />
          <Skel beat={BEATS[0]} i={2} w="86%" /><Skel beat={BEATS[0]} i={3} w="64%" />
        </Card>
        <Card beat={BEATS[1]} icon="?" title="Guessed details" desc="Staff assume the day, the time, the pickup. Half the time they are wrong.">
          <div style={{display: 'flex', gap: 12, flexWrap: 'wrap'}}>
            {['Saturday?', '10 AM?', 'pickup?'].map((t, i) => {
              const d = BEATS[1] + 14 + i * 8;
              const o = interpolate(frame, [d, d + 10], [0, 1], {extrapolateRight: 'clamp'});
              return (
                <span key={t} style={{fontSize: 26, fontWeight: 600, color: C.accent, background: C.tint,
                  borderRadius: 999, padding: '10px 24px', opacity: o}}>
                  {t} ×
                </span>
              );
            })}
          </div>
        </Card>
        <Card beat={BEATS[2]} icon="◷" title="Lost trust" desc="Drivers wait, bays sit empty, and customers do not come back.">
          <div style={{display: 'flex', gap: 12}}>
            {[0, 1, 2].map((i) => {
              const d = BEATS[2] + 14 + i * 8;
              const o = interpolate(frame, [d, d + 10], [0, 1], {extrapolateRight: 'clamp'});
              return (
                <div key={i} style={{flex: 1, height: 76, borderRadius: 16, border: '3px dashed #cbd5e1',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, color: C.faint, fontWeight: 600, opacity: o}}>
                  Bay {i + 1} · empty
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <div style={{marginTop: 26, background: C.navy, color: '#fff', borderRadius: 22, padding: '18px 40px',
        fontSize: 34, fontWeight: 600, textAlign: 'center', opacity: b}}>
        One conversation fixes it. <span style={{color: C.accentSoft}}>Watch how →</span>
      </div>
    </div>
  );
};
