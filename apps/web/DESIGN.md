# ServiceLoop web — design system

Dark cinematic world matching the demo video: deep navy surfaces, warm coral for the customer's voice and the single call to action, mint only for confirmed success. Flat color, hairline borders, no gradients on text, no glass, no glow halos.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#06121f` | page canvas |
| `--panel` | `#0b2136` | panels |
| `--panel-2` | `#0e2a44` | raised rows, loop bubbles |
| `--line` | `#1d405f` | hairlines |
| `--text` | `#eef5fa` | primary text |
| `--muted` | `#a7c0d4` | secondary text (tinted, never gray) |
| `--coral` | `#ff6a55` | customer bubbles, primary action |
| `--coral-ink` | `#250d08` | text on coral |
| `--mint` | `#35c37d` | booked/confirmed only |
| `--danger` | `#ff9d94` | errors on `#3a1420` |

Type: Sora for display, Manrope for UI text (Google Fonts, system fallbacks). Display tracking −0.02em. Body measure stays under 75ch.

Rules: one primary action per view; numbers are tabular; motion is one load moment plus chat rise, always off under `prefers-reduced-motion`; focus rings are 3px coral outlines; simulated-workshop labeling is part of the layout, never a footnote that can be missed.
