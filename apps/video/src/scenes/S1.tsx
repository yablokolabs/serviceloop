import React from 'react';
import {Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT} from '../theme';
import {Header} from '../components/Header';

const BARS = [46, 80, 60, 100, 72, 52, 92, 64, 40, 84, 70, 104, 58, 76, 96, 50, 88, 66, 42, 80, 74, 98, 56, 68, 90, 48, 82, 62, 72, 60];

const Rise: React.FC<{delay: number; children: React.ReactNode}> = ({delay, children}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + 16], [0, 1], {extrapolateRight: 'clamp'});
  const y = interpolate(frame, [delay, delay + 16], [30, 0], {extrapolateRight: 'clamp'});
  return <div style={{opacity: o, transform: `translateY(${y}px)`}}>{children}</div>;
};

export const S1: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = (d: number) => spring({frame: frame - d, fps, config: {damping: 200}});
  return (
    <div style={{width: 1920, height: 1080, display: 'flex', background: C.bg, fontFamily: FONT, overflow: 'hidden'}}>
      <Audio src={staticFile('audio/s1.wav')} />
      <div style={{width: 1060, padding: '64px 0 64px 110px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
        <Header section="WORKSHOP BOOKING" />
        <Rise delay={15}>
          <div style={{fontSize: 36, color: C.accent, fontWeight: 600, margin: '50px 0 16px'}}>
            ServiceLoop · car-service booking
          </div>
        </Rise>
        <Rise delay={22}>
          <h1 style={{fontSize: 128, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.02, color: C.ink}}>
            Stop chasing.
            <br />
            <span style={{color: C.accent}}>Start scheduling.</span>
          </h1>
        </Rise>
        <Rise delay={30}>
          <div style={{fontSize: 42, color: '#475569', marginTop: 26}}>Car-service booking by conversation.</div>
        </Rise>
        <Rise delay={36}>
          <div style={{display: 'inline-block', marginTop: 44, fontSize: 30, fontWeight: 600, color: C.navy,
            background: C.navyTint, borderRadius: 999, padding: '14px 36px'}}>About 2½ min</div>
        </Rise>
      </div>
      <div style={{flex: 1, background: 'linear-gradient(150deg,#0b2233 0%,#0f3d5c 55%,#14506f 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40, padding: 60}}>
        <div style={{width: 580, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.16)',
          borderRadius: 28, padding: 36, transform: `scale(${pop(30)})`, opacity: pop(30)}}>
          {[
            {t: 'Your annual service is due — shall we book it in?', me: false, d: 40},
            {t: 'service Saturday morning with pickup at 10', me: true, d: 62},
            {t: '1 slot fits. Pickup 10:00, service 10:30.', me: false, d: 86},
            {t: 'Approved ✓', me: true, d: 110},
          ].map((b, i) => (
            <div key={i} style={{maxWidth: '88%', width: 'fit-content', borderRadius: 22, padding: '20px 26px', fontSize: 29, lineHeight: 1.4,
              marginBottom: i < 3 ? 16 : 0, background: b.me ? C.accent : '#fff', color: b.me ? '#fff' : C.ink,
              marginLeft: b.me ? 'auto' : 0, transform: `scale(${pop(b.d)})`, opacity: pop(b.d)}}>
              {b.t}
            </div>
          ))}
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 9, height: 110}}>
          {BARS.map((h, i) => {
            const s = 0.25 + 0.75 * Math.abs(Math.sin(frame * 0.22 + i * 0.75));
            return <i key={i} style={{width: 13, height: h * s, borderRadius: 7, background: '#fff', opacity: 0.35 + h / 160}} />;
          })}
        </div>
        <Rise delay={40}>
          <div style={{color: '#9fb8cc', fontSize: 28}}>One conversation, start to booked</div>
        </Rise>
      </div>
    </div>
  );
};
