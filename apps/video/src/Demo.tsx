import React from 'react';
import {AbsoluteFill, Sequence, interpolate, useCurrentFrame} from 'remotion';
import {LEN} from './theme';
import {S1} from './scenes/S1';
import {S2} from './scenes/S2';
import {S3} from './scenes/S3';
import {S4} from './scenes/S4';
import {Winback} from './scenes/Winback';
import {Feedback} from './scenes/Feedback';
import {S5} from './scenes/S5';
import {S6} from './scenes/S6';

export const TOTAL_FRAMES = LEN.s1 + LEN.s2 + LEN.s3 + LEN.s4 + LEN.wb + LEN.fb + LEN.s5 + LEN.s6;
const O2 = LEN.s1;
const O3 = O2 + LEN.s2;
const O4 = O3 + LEN.s3;
const OW = O4 + LEN.s4;
const OF = OW + LEN.wb;
const O5 = OF + LEN.fb;
const O6 = O5 + LEN.s5;

export const Demo: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 10], [1, 0], {extrapolateRight: 'clamp'});
  const fadeOut = interpolate(frame, [TOTAL_FRAMES - 14, TOTAL_FRAMES - 1], [0, 1], {extrapolateLeft: 'clamp'});
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={LEN.s1}><S1 /></Sequence>
      <Sequence from={O2} durationInFrames={LEN.s2}><S2 /></Sequence>
      <Sequence from={O3} durationInFrames={LEN.s3}><S3 /></Sequence>
      <Sequence from={O4} durationInFrames={LEN.s4}><S4 /></Sequence>
      <Sequence from={OW} durationInFrames={LEN.wb}><Winback /></Sequence>
      <Sequence from={OF} durationInFrames={LEN.fb}><Feedback /></Sequence>
      <Sequence from={O5} durationInFrames={LEN.s5}><S5 /></Sequence>
      <Sequence from={O6} durationInFrames={LEN.s6}><S6 /></Sequence>
      {fadeIn > 0 && <AbsoluteFill style={{background: '#fafaf9', opacity: fadeIn}} />}
      {fadeOut > 0 && <AbsoluteFill style={{background: '#0b2233', opacity: fadeOut}} />}
    </AbsoluteFill>
  );
};
