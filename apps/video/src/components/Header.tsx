import React from 'react';
import {Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {C, FONT, SHADOW_SM} from '../theme';

export const Header: React.FC<{section: string; delay?: number}> = ({section, delay = 6}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + 14], [0, 1], {extrapolateRight: 'clamp'});
  const y = interpolate(frame, [delay, delay + 14], [20, 0], {extrapolateRight: 'clamp'});
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 24, opacity: o, transform: `translateY(${y}px)`}}>
      <Img
        src={staticFile('logo.png')}
        style={{height: 72, background: '#fff', borderRadius: 16, padding: '8px 14px', boxShadow: SHADOW_SM}}
      />
      <span style={{fontFamily: FONT, fontSize: 27, letterSpacing: 5, color: C.muted, fontWeight: 600}}>
        SERVICELOOP&nbsp;&nbsp;·&nbsp;&nbsp;{section}
      </span>
    </div>
  );
};
