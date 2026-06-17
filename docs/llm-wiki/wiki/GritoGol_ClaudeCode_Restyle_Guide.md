# GritoGol — Claude Code **Restyle-Only** Guide

Scope: change **how the app looks**, nothing else. The app's logic, state, data, screen flow, components, file structure, and dependencies stay **exactly as they are**. After this work the app must behave byte-for-byte identically — only colors, fonts, and visual properties change.

> Give this whole file to Claude Code. The "Do not touch" contract in §1 is the most important part — keep it in front of the model.

---

## 1. The contract (read first, do not violate)

**You MAY edit (visual layer only):**
- `src/styles/theme.css` — the design tokens (CSS variables).
- `src/styles/fonts.css` — font imports/families.
- Inside existing JSX, only **visual style values**: color, background, border, border-radius, box-shadow/glow, font-family, font-size/weight, spacing (padding/margin/gap), and Tailwind *appearance* utility classes.

**You MUST NOT touch (the core):**
- Any React logic: `useState`, `useEffect`, timers, event handlers, the `Screen` state machine, `AnimatePresence` wiring.
- The data arrays: `MATCH`, `SIDE_MATCHES`, `IMPACT_TODAY`, `SCHOOLS`, `WALL_ITEMS`.
- Component structure or boundaries — **do not split files, rename, extract, or move anything**.
- `package.json` / dependencies — **add or remove nothing**.
- No new features (no real video, no camera/`getUserMedia`, no routing).
- Do not change layout in a way that alters behavior (e.g. don't remove the phone-frame wrapper, don't change which elements are scrollable/positioned). Visual polish only.
- Do not change any Spanish UI copy.

**Working rule:** if a change would alter what the app *does* (not just how it looks), stop and ask. When in doubt, prefer editing a **token** over editing a component.

---

## 2. Why this is safe here

The app uses **Tailwind v4 with `@theme inline`** (`src/styles/theme.css`), which maps CSS variables to utility classes. Components already use token-backed classes like `bg-background`, `bg-card`, `bg-secondary`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `text-accent`, `border-border`.

**Consequence:** editing a single variable in `theme.css` recolors every element that uses its class — across all seven screens — **without touching a line of JSX or logic.** This is your primary and safest lever.

---

## 3. Tier 1 — Recolor via tokens (preferred, zero-risk)

Edit values in `src/styles/theme.css` under `:root`. Current live values:

| Variable | Current | Controls |
|---|---|---|
| `--background` | `#070C18` | App background |
| `--foreground` | `#EEF2FF` | Primary text |
| `--card` | `#0D1829` | Cards, video tiles, bottom nav |
| `--secondary` / `--muted` / `--input` | `#132240` | Panels, chips, impact block |
| `--muted-foreground` | `#7A8BAD` | Secondary text |
| `--primary` | `#22C55E` | Green: primary buttons, active nav, record |
| `--primary-foreground` | `#030D00` | Text on green |
| `--accent` | `#F5B942` | Gold: logo "GOL", impact label, highlights |
| `--accent-foreground` | `#0D0800` | Text on gold |
| `--destructive` | `#EF4444` | Live dots, record button |
| `--border` | `rgba(255,255,255,0.08)` | Hairline borders |
| `--ring` | `#22C55E` | Focus ring |
| `--radius` | `0.75rem` | Corner roundness (cards/buttons derive from this) |

Change a value here → it cascades automatically. If you flip a background between light/dark, also flip its matching `*-foreground` so text contrast survives (keep ≥ AA).

---

## 4. Tier 2 — Fonts

Defined in `src/styles/fonts.css` (Google Fonts import). Two families:
- **Display** = `'Barlow Condensed'` — headings, numbers, logo, buttons (referenced inline as `fontFamily: "'Barlow Condensed', sans-serif"`).
- **Body** = `'Barlow'` — set on the app root.

To swap a font safely (visual-only):
1. Replace the family in the Google Fonts `@import` URL in `fonts.css`.
2. Do a **literal string replace** of the family name (e.g. `'Barlow Condensed'` → `'Anton'`) wherever it appears. This only changes the font string — it touches no logic.

Do not restructure how fonts are applied; just substitute the name.

---

## 5. Tier 3 — Hard-coded colors not covered by tokens

Some visuals use **literal hex values inline**, so Tier 1 token edits will *not* reach them. If you want those to match a new palette, edit these specific spots — **changing only the color value, nothing else**:

- App shell behind the phone frame: class `bg-[#040810]` (in the root `App` return).
- GOOOL screen background gradient: `background: "linear-gradient(180deg, #070C18 0%, #0D1829 100%)"`.
- Countdown ring glow: `boxShadow: "0 0 32px #F5B94240"` (gold + `40` alpha).
- Record button: `background: recording ? "#fff" : "#EF4444"` and its ring shadows `rgba(239,68,68,0.3)`.
- Uploading spinner SVG strokes: track `#132240`, progress `#22C55E`.
- "Volver al muro" link: class `text-[#7C6FDB]` — note this purple is **off-palette**; consider switching it to `text-primary` or `text-accent` for consistency.

> The per-school accent colors live in the `SCHOOLS` **data** (`color: "#F5B942"`, `"#22C55E"`, `"#A855F7"`). Those are data fields, not styling — under this contract, **leave them unless I explicitly ask**, since editing data is outside "styles only."

---

## 6. Common restyle recipes

- **Change the gold accent app-wide:** edit `--accent` (and `--accent-foreground` if contrast flips) in `theme.css`; then update the inline gold in the countdown glow (§5). Done.
- **Change the green primary:** edit `--primary`, `--primary-foreground`, `--ring`; then the spinner progress stroke `#22C55E` (§5).
- **Soften/sharpen corners:** edit `--radius` only.
- **Darken/lighten the whole UI:** edit `--background`, `--card`, `--secondary` together, keeping `--foreground`/`--muted-foreground` readable; mirror the gradient/shell hexes in §5.
- **Swap the display font:** §4.

---

## 7. Verify (every time)

```bash
npm run dev
```
Open the localhost URL and click through **all seven**: Muro → GOL (floating button) → GOOOL → Grabar → Subiendo → Estado → Impacto, plus the Perfil tab. Confirm:
- Colors/fonts changed as intended.
- **Nothing moved, broke, or changed behavior** — same transitions, same timers, same flow.

If anything other than appearance changed, you went out of scope — revert that edit.

---

## 8. Drop-in CLAUDE.md (styling contract)

Save at repo root:

```markdown
# GritoGol — STYLING WORK ONLY

This repo is a working Vite + React 18 + TS + Tailwind v4 app (Figma Make output).
Current tasks are VISUAL ONLY. The app's logic and behavior are FROZEN.

## You may edit
- src/styles/theme.css (CSS variable tokens) — primary lever; cascades everywhere.
- src/styles/fonts.css (font families).
- Visual style values inside existing JSX: color, background, border, radius,
  shadow/glow, font, size, spacing, and Tailwind appearance classes.

## You must NOT
- Change any logic: useState/useEffect/timers/handlers, the Screen state machine,
  AnimatePresence. Do not edit data arrays (MATCH, SCHOOLS, WALL_ITEMS, etc.).
- Split, rename, move, or extract files/components. Keep the structure as-is.
- Add or remove dependencies. Add no new features (no real video/camera/routing).
- Remove the phone-frame wrapper or change scroll/position behavior.
- Translate or reword Spanish UI copy (voseo: "mostrá", "tocá", "ganate").

## Rule of thumb
Prefer editing a token over a component. If a change affects what the app DOES
(not just how it looks), stop and ask. Run `npm run dev` and verify all 7 screens
look right and behave identically after each change.
```

---

## 9. First prompt to paste into Claude Code

```
Read CLAUDE.md. This is styling-only work — the app's logic, data, structure, and
dependencies are frozen. Do not refactor, split files, or add anything.

The app is themed entirely through CSS variables in src/styles/theme.css mapped via
@theme inline, so recoloring should be done by editing those tokens, not the JSX.

First, just give me a short report: list every token in theme.css with what it
controls, and list any hard-coded hex colors or inline font references in the JSX
that the tokens do NOT cover (so I know what a full restyle would need to touch).
Make no edits yet — wait for my direction on the new palette/fonts.
```

---

### Footnote — non-styling items (out of scope, for your awareness only)
Two tiny **content** issues exist (a `"ganatee"` typo on the GOOOL screen and the sponsor shown as `KUBIKA` vs the brief's `QUBIKA`). These are copy, not styling, so they're **excluded** from this guide. Fix them separately if you want — they don't affect the look or the logic.
