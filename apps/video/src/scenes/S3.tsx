import React from 'react';
import {Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT, SHADOW} from '../theme';
import {Header} from '../components/Header';

// Beats locked to narration (30fps).
const INTRO = 12;
const BEATS = [63, 179, 347, 519, 658, 786];
const RULE = 886;
const END = 1020;
const CLIPS = ['s3s1', 's3s2', 's3s3', 's3s4', 's3s5', 's3s6'];
const STEPS = [
  {n: 1, t: 'Remind', d: 'Workshop pings when due'},
  {n: 2, t: 'Interpret', d: 'Spark reads, Wonder on doubt'},
  {n: 3, t: 'Ledger', d: 'Preferences as revisions'},
  {n: 4, t: 'Solve', d: 'Bay plus driver fit'},
  {n: 5, t: 'Approve', d: 'Token bound to slot'},
  {n: 6, t: 'Book', d: 'Idempotent confirm'},
];
const next = (i: number) => (i + 1 < BEATS.length ? BEATS[i + 1] : RULE);

const Rise: React.FC<{delay: number; children: React.ReactNode}> = ({delay, children}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + 14], [0, 1], {extrapolateRight: 'clamp'});
  const y = interpolate(frame, [delay, delay + 14], [26, 0], {extrapolateRight: 'clamp'});
  return <div style={{opacity: o, transform: `translateY(${y}px)`}}>{children}</div>;
};

const RailRow: React.FC<{i: number}> = ({i}) => {
  const frame = useCurrentFrame();
  const appear = INTRO + 4 + i * 7;
  const inO = interpolate(frame, [appear, appear + 10], [0, 1], {extrapolateRight: 'clamp'});
  const active = frame >= BEATS[i] && frame < next(i);
  const done = frame >= next(i);
  const s = STEPS[i];
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 18, background: active ? '#fff' : 'transparent',
      border: active ? `3px solid ${C.accent}` : '3px solid transparent',
      borderRadius: 20, padding: '12px 20px 12px 12px', opacity: inO * (active || done ? 1 : 0.5),
      boxShadow: active ? SHADOW : 'none'}}>
      <div style={{width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
        background: active ? C.accent : done ? C.navy : '#e8edf1',
        color: active || done ? '#fff' : C.muted, fontWeight: 800, fontSize: 26,
        display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        {done ? '✓' : s.n}
      </div>
      <div>
        <div style={{fontSize: 30, fontWeight: 750, color: C.ink, letterSpacing: '-0.01em'}}>{s.t}</div>
        <div style={{fontSize: 22, color: C.muted}}>{s.d}</div>
      </div>
    </div>
  );
};

const Panel: React.FC<{i: number; children: React.ReactNode}> = ({i, children}) => {
  const frame = useCurrentFrame();
  const b = BEATS[i];
  const n = next(i);
  const o = interpolate(frame, [b, b + 10, n - 10, n], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const y = interpolate(frame, [b, b + 12], [24, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  if (frame < b || frame >= n) return null;
  return (
    <div style={{position: 'absolute', inset: 0, background: '#fff', border: `1px solid ${C.line}`,
      borderRadius: 26, boxShadow: SHADOW, padding: '40px 44px', opacity: o, transform: `translateY(${y}px)`}}>
      {children}
    </div>
  );
};

const Chip: React.FC<{children: React.ReactNode; hot?: boolean}> = ({children, hot}) => (
  <span style={{display: 'inline-block', fontSize: 24, fontWeight: 600, borderRadius: 999, padding: '8px 22px',
    background: hot ? C.accent : C.navyTint, color: hot ? '#fff' : C.navy}}>{children}</span>
);

const Stagger: React.FC<{beat: number; i: number; children: React.ReactNode}> = ({beat, i, children}) => {
  const frame = useCurrentFrame();
  const d = beat + 12 + i * 9;
  const o = interpolate(frame, [d, d + 10], [0, 1], {extrapolateRight: 'clamp'});
  const x = interpolate(frame, [d, d + 10], [-18, 0], {extrapolateRight: 'clamp'});
  return <div style={{opacity: o, transform: `translateX(${x}px)`}}>{children}</div>;
};

export const S3: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const ruleP = spring({frame: frame - RULE, fps, config: {damping: 200}});
  return (
    <div style={{width: 1920, height: 1080, background: C.bg, fontFamily: FONT, padding: '56px 110px', overflow: 'hidden'}}>
      <Sequence from={INTRO}><Audio src={staticFile('audio/s3i.wav')} /></Sequence>
      {BEATS.map((b, i) => (
        <Sequence key={i} from={b}><Audio src={staticFile(`audio/${CLIPS[i]}.wav`)} /></Sequence>
      ))}
      <Sequence from={RULE}><Audio src={staticFile('audio/s3r.wav')} /></Sequence>
      <Header section="THE WORKFLOW" />
      <Rise delay={14}>
        <div style={{fontSize: 34, color: C.accent, fontWeight: 600, margin: '26px 0 8px'}}>Six stages</div>
      </Rise>
      <Rise delay={20}>
        <h1 style={{fontSize: 88, fontWeight: 800, letterSpacing: '-0.035em', color: C.ink, marginBottom: 26}}>
          Message in, booking out
        </h1>
      </Rise>
      <div style={{display: 'flex', gap: 40, height: 560}}>
        <div style={{width: 520, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center'}}>
          {STEPS.map((_, i) => <RailRow key={i} i={i} />)}
        </div>
        <div style={{flex: 1, position: 'relative'}}>
          <Panel i={0}>
            <div style={{fontSize: 26, letterSpacing: 3, color: C.muted, fontWeight: 700, marginBottom: 22}}>STAGE 1 · REMIND</div>
            <Stagger beat={BEATS[0]} i={0}>
              <div style={{background: C.navyTint, color: C.ink, borderRadius: 22, padding: '24px 30px', fontSize: 31, maxWidth: '92%'}}>
                ServiceLoop reminder: your annual car service is due. Reply with a day that suits you.
              </div>
            </Stagger>
            <Stagger beat={BEATS[0]} i={1}>
              <div style={{background: C.navy, color: '#fff', borderRadius: 22, padding: '24px 30px', fontSize: 33, maxWidth: '90%', marginTop: 18, marginLeft: 'auto'}}>
                service Saturday morning with pickup at 10
              </div>
            </Stagger>
            <Stagger beat={BEATS[0]} i={2}>
              <div style={{marginTop: 22, display: 'flex', gap: 14}}><Chip>scheduled job</Chip><Chip>quiet hours</Chip><Chip hot>opt-out checked →</Chip></div>
            </Stagger>
          </Panel>
          <Panel i={1}>
            <div style={{fontSize: 26, letterSpacing: 3, color: C.muted, fontWeight: 700, marginBottom: 22}}>STAGE 2 · INTERPRET</div>
            <div style={{display: 'flex', gap: 22, alignItems: 'stretch'}}>
              <Stagger beat={BEATS[1]} i={0}>
                <div style={{background: C.navyTint, borderRadius: 20, padding: '26px 30px', width: 420}}>
                  <div style={{fontSize: 34, fontWeight: 750, color: C.navy}}>Spark 1.3</div>
                  <div style={{fontSize: 26, color: C.muted}}>reads every message</div>
                </div>
              </Stagger>
              <div style={{fontSize: 44, color: C.accent, alignSelf: 'center', fontWeight: 800}}>→</div>
              <Stagger beat={BEATS[1]} i={1}>
                <div style={{background: C.tint, borderRadius: 20, padding: '26px 30px', width: 420}}>
                  <div style={{fontSize: 34, fontWeight: 750, color: C.accent}}>Wonder 1.0</div>
                  <div style={{fontSize: 26, color: C.muted}}>joins on ambiguity</div>
                </div>
              </Stagger>
            </div>
            <Stagger beat={BEATS[1]} i={2}>
              <div style={{marginTop: 22}}><Chip hot>ambiguous: “before 10” of what?</Chip></div>
            </Stagger>
          </Panel>
          <Panel i={2}>
            <div style={{fontSize: 26, letterSpacing: 3, color: C.muted, fontWeight: 700, marginBottom: 18}}>STAGE 3 · LEDGER</div>
            {[['r1', 'Saturday'], ['r2', 'Saturday · morning'], ['r3', 'Saturday · morning · pickup 10:00']].map(([r, t], k) => (
              <Stagger key={r} beat={BEATS[2]} i={k}>
                <div style={{display: 'flex', gap: 18, alignItems: 'center', marginBottom: 12,
                  background: k === 2 ? C.navyTint : '#f4f6f8', borderRadius: 16, padding: '14px 24px'}}>
                  <span style={{fontSize: 26, fontWeight: 800, color: k === 2 ? C.navy : C.muted}}>{r}</span>
                  <span style={{fontSize: 28, color: C.ink}}>{t}</span>
                  {k === 2 && <Chip>current ✓</Chip>}
                </div>
              </Stagger>
            ))}
            <Stagger beat={BEATS[2]} i={3}><div style={{marginTop: 10}}><Chip hot>nothing overwritten</Chip></div></Stagger>
          </Panel>
          <Panel i={3}>
            <div style={{fontSize: 26, letterSpacing: 3, color: C.muted, fontWeight: 700, marginBottom: 18}}>STAGE 4 · SOLVE</div>
            <div style={{display: 'flex', gap: 22}}>
              <Stagger beat={BEATS[3]} i={0}>
                <div style={{border: `3px solid ${C.accent}`, borderRadius: 20, padding: '20px 28px', width: 300, background: '#fff', boxShadow: SHADOW}}>
                  <div style={{fontSize: 32, fontWeight: 750}}>Bay 1</div>
                  <div style={{fontSize: 26, color: C.muted}}>Sat 10:30 ✓</div>
                </div>
              </Stagger>
              <Stagger beat={BEATS[3]} i={1}>
                <div style={{border: `3px solid ${C.line}`, borderRadius: 20, padding: '20px 28px', width: 300, opacity: 0.55}}>
                  <div style={{fontSize: 32, fontWeight: 750}}>Bay 2</div>
                  <div style={{fontSize: 26, color: C.muted}}>busy ✕</div>
                </div>
              </Stagger>
              <Stagger beat={BEATS[3]} i={2}>
                <div style={{border: `3px solid ${C.navy}`, borderRadius: 20, padding: '20px 28px', width: 300, background: C.navyTint}}>
                  <div style={{fontSize: 32, fontWeight: 750, color: C.navy}}>Driver 1</div>
                  <div style={{fontSize: 26, color: C.muted}}>pickup 10:00 ✓</div>
                </div>
              </Stagger>
            </div>
            <Stagger beat={BEATS[3]} i={3}><div style={{marginTop: 20}}><Chip hot>travel 20 min counted</Chip></div></Stagger>
          </Panel>
          <Panel i={4}>
            <div style={{fontSize: 26, letterSpacing: 3, color: C.muted, fontWeight: 700, marginBottom: 18}}>STAGE 5 · APPROVE</div>
            <Stagger beat={BEATS[4]} i={0}>
              <div style={{display: 'flex', gap: 20, alignItems: 'center'}}>
                <div style={{fontFamily: 'Geist Mono, monospace', fontSize: 36, fontWeight: 700, background: C.ink,
                  color: '#fff', borderRadius: 16, padding: '18px 30px'}}>tok_7F3A</div>
                <div style={{fontSize: 28, color: C.ink}}>bound to <b>Sat 10:30</b> + <b>pickup 10:00</b></div>
              </div>
            </Stagger>
            <Stagger beat={BEATS[4]} i={1}>
              <div style={{marginTop: 24, display: 'inline-block', background: C.accent, color: '#fff',
                fontSize: 30, fontWeight: 700, borderRadius: 999, padding: '16px 54px', boxShadow: SHADOW}}>
                Approve and book
              </div>
            </Stagger>
          </Panel>
          <Panel i={5}>
            <div style={{fontSize: 26, letterSpacing: 3, color: C.muted, fontWeight: 700, marginBottom: 18}}>STAGE 6 · BOOK</div>
            <Stagger beat={BEATS[5]} i={0}>
              <div style={{background: '#f0fdf4', border: '3px solid #1e7e34', borderRadius: 20, padding: '22px 30px', maxWidth: 640}}>
                <div style={{fontSize: 36, fontWeight: 800, color: '#1e7e34'}}>Booked · Confirmation</div>
                <div style={{fontSize: 26, color: C.muted, marginTop: 6}}>Bay 1 · Sat 10:30 · pickup 10:00 · driver-1</div>
              </div>
            </Stagger>
            <Stagger beat={BEATS[5]} i={1}><div style={{marginTop: 20}}><Chip>retry-safe · idempotent ✓</Chip></div></Stagger>
          </Panel>
        </div>
      </div>
      <div style={{marginTop: 26, background: C.navy, color: '#fff', borderRadius: 22, padding: '20px 40px',
        fontSize: 33, fontWeight: 600, textAlign: 'center', transform: `scale(${ruleP})`, opacity: ruleP}}>
        No model output books anything. <span style={{color: C.accentSoft}}>Deterministic checks book, you approve.</span>
      </div>
      <div style={{display: 'none'}}>{END}</div>
    </div>
  );
};
