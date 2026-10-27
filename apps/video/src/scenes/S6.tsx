import React from 'react';
import {Audio, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {C, FONT, SHADOW} from '../theme';

const BARS = [60, 92, 70, 104, 56, 84, 66, 96, 52, 76, 88, 62, 98, 70, 80];

const Rise: React.FC<{delay: number; children: React.ReactNode}> = ({delay, children}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + 16], [0, 1], {extrapolateRight: 'clamp'});
  const y = interpolate(frame, [delay, delay + 16], [30, 0], {extrapolateRight: 'clamp'});
  return <div style={{opacity: o, transform: `translateY(${y}px)`}}>{children}</div>;
};

export const S6: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{width: 1920, height: 1080, display: 'flex', fontFamily: FONT, overflow: 'hidden'}}>
      <Audio src={staticFile('audio/s6.wav')} />
      <div style={{width: 820, background: 'linear-gradient(150deg,#0b2233 0%,#0f3d5c 60%,#14506f 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 44}}>
        <Rise delay={10}>
          <Img src={staticFile('logo.png')} style={{width: 460, background: '#fff', borderRadius: 28,
            padding: '26px 36px', boxShadow: SHADOW}} />
        </Rise>
        <div style={{display: 'flex', alignItems: 'center', gap: 9, height: 100}}>
          {BARS.map((h, i) => {
            const s = 0.25 + 0.75 * Math.abs(Math.sin(frame * 0.2 + i * 0.8));
            return <i key={i} style={{width: 12, height: h * s, borderRadius: 6, background: '#fff', opacity: 0.4 + h / 180}} />;
          })}
        </div>
        <Rise delay={30}>
          <div style={{color: '#9fb8cc', fontSize: 30}}>Simulated workshop · honest labels</div>
        </Rise>
      </div>
      <div style={{flex: 1, background: C.bg, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '0 110px'}}>
        <Rise delay={18}>
          <h1 style={{fontSize: 118, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.04, color: C.ink}}>
            Stop chasing.
            <br />
            <span style={{color: C.accent}}>Start scheduling.</span>
          </h1>
        </Rise>
        <Rise delay={30}>
          <div style={{fontSize: 38, color: '#475569', marginTop: 28}}>
            Deterministic checks book, you approve.
          </div>
        </Rise>
        <Rise delay={42}>
          <div style={{marginTop: 44}}>
            <span style={{fontSize: 30, fontWeight: 600, color: C.navy, background: C.navyTint,
              borderRadius: 999, padding: '14px 36px'}}>ServiceLoop · conversation-first booking</span>
          </div>
        </Rise>
      </div>
    </div>
  );
};
