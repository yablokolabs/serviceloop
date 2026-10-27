import React from 'react';
import {Composition} from 'remotion';
import {Demo, TOTAL_FRAMES} from './Demo';

export const Root: React.FC = () => (
  <>
    <Composition
      id="Demo"
      component={Demo}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={TOTAL_FRAMES}
    />
  </>
);
