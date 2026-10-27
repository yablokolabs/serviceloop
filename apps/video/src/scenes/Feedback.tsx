import React from 'react';
import {Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT, SHADOW} from '../theme';
import {Header} from '../components/Header';

// Beats locked to narration: fb1@12, fb2@149 (30fps).
const F1 = 12;
const F2 = 149;

const Rise: React.FC<{delay: number; children: React.ReactNode}> = ({delay, children}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + 14], [0, 1], {extrapolateRight: 'clamp'});
  const y = interpolate(frame, [delay, delay + 14], [26, 0], {extrapolateRight: 'clamp'});
  return <div style={{opacity: o, transform: `translateY(${y}px)`}}>{children}</div>;
};

const StepCard: React.FC<{at: number; icon: string; title: string; children: React.ReactNode; alert?: boolean}> = ({
  at, icon, title, children, alert,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = spring({frame: frame - at, fps, config: {damping: 200}});
  return (
    <div style={{flex: 1, background: '#fff', border: `2px solid ${alert ? C.accent : C.line}`, borderRadius: 26,
      padding: '36px 38px', boxShadow: SHADOW, transform: `scale(${p}) translateY(${(1 - p) * 30}px)`, opacity: p}}>
      <div style={{width: 76, height: 76, borderRadius: 22, background: alert ? C.tint : C.navyTint,
        fontSize: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
        color: alert ? C.accent : C.navy}}>{icon}</div>
      <h2 style={{fontSize: 40, fontWeight: 750, letterSpacing: '-0.02em', color: C.ink, marginBottom: 10}}>{title}</h2>
      <div style={{fontSize: 27, color: C.muted, lineHeight: 1.5}}>{children}</div>
    </div>
  );
};

const Arrow: React.FC<{at: number}> = ({at}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + 10], [0, 1], {extrapolateRight: 'clamp'});
  return <div style={{alignSelf: 'center', fontSize: 46, color: C.accent, fontWeight: 800, opacity: o}}>→</div>;
};

export const Feedback: React.FC = () => {
  const frame = useCurrentFrame();
  const stars = interpolate(frame, [F1 + 50, F1 + 64], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <div style={{width: 1920, height: 1080, background: C.bg, fontFamily: FONT, padding: '56px 110px', overflow: 'hidden'}}>
      <Sequence from={F1}><Audio src={staticFile('audio/fb1.wav')} /></Sequence>
      <Sequence from={F2}><Audio src={staticFile('audio/fb2.wav')} /></Sequence>
      <Header section="FEEDBACK" />
      <Rise delay={14}>
        <div style={{fontSize: 34, color: C.accent, fontWeight: 600, margin: '26px 0 8px'}}>After the service</div>
      </Rise>
      <Rise delay={20}>
        <h1 style={{fontSize: 88, fontWeight: 800, letterSpacing: '-0.035em', color: C.ink, marginBottom: 40}}>
          Feedback, handled honestly
        </h1>
      </Rise>
      <div style={{display: 'flex', gap: 26}}>
        <StepCard at={F1} icon="✓" title="Service completed">
          One consented request goes out — once, never spammed.
          <div style={{marginTop: 16, fontSize: 34, letterSpacing: 4, color: C.accent, opacity: stars}}>
            ★★☆☆☆
          </div>
        </StepCard>
        <Arrow at={F1 + 30} />
        <StepCard at={F2} icon="⚑" title="Poor rating lands" alert>
          “Staff were rude, car came back dirty.” A human reads this, not a script.
        </StepCard>
        <Arrow at={F2 + 30} />
        <StepCard at={F2 + 45} icon="≡" title="Staff review task" alert>
          Persisted and open until staff act.
          <div style={{marginTop: 14}}>
            <span style={{fontSize: 24, fontWeight: 800, color: '#fff', background: C.navy,
              borderRadius: 999, padding: '8px 22px'}}>NO AUTOMATIC REFUND</span>
          </div>
        </StepCard>
      </div>
    </div>
  );
};
