---
version: alpha
name: 'Open Cowork'
description: 'Cool graphite-neutral design system for the Open Cowork agent desktop app — calm, editorial, modern-agentic. Dark theme is canonical; light theme mirrors every token.'
colors:
  # Interaction — a single disciplined indigo drives all interaction.
  primary: '#6D8BFF' # accent — links, focus, active/selected states, primary fill
  primaryHover: '#8AA0FF' # accent-hover (dark lightens; light theme: #3E5AE8)
  onAccent: '#0B1020' # text/icon on a primary fill (light theme: #FFFFFF)
  accentMuted: 'rgba(109,139,255,0.16)'
  # Surfaces — near-black graphite, layered by lightness, separated by hairline borders.
  background: '#0E0F11' # app canvas
  backgroundSecondary: '#121316' # titlebar, secondary bars
  surface: '#17181B' # cards, panels, inputs
  surfaceHover: '#1F2125'
  surfaceActive: '#262A2F'
  border: '#262A30'
  borderSubtle: 'rgba(255,255,255,0.06)'
  # Text
  text: '#ECEEF1' # primary text
  textSecondary: '#A8AEB8'
  textMuted: '#757C86' # captions, metadata
  # Accents & semantics
  mcp: '#A78BFA' # MCP connectors — a distinct violet, never confused with primary
  success: '#45C08A'
  warning: '#E3B341'
  error: '#F2777A'
  scrim: 'rgba(0,0,0,0.55)' # modal backdrop (light theme: rgba(11,15,25,0.35))
typography:
  display:
    fontFamily: 'Inter'
    fontSize: '2.5rem'
    fontWeight: 600
    lineHeight: '1.08'
    letterSpacing: '-0.03em'
  title:
    fontFamily: 'Inter'
    fontSize: '1.375rem'
    fontWeight: 600
    lineHeight: '1.2'
    letterSpacing: '-0.02em'
  heading:
    fontFamily: 'Inter'
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: '1.3'
    letterSpacing: '-0.01em'
  body:
    fontFamily: 'Inter'
    fontSize: '0.9375rem'
    fontWeight: 400
    lineHeight: '1.55'
    letterSpacing: '-0.006em'
  bodySmall:
    fontFamily: 'Inter'
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: '1.5'
  label:
    fontFamily: 'Inter'
    fontSize: '0.6875rem'
    fontWeight: 500
    lineHeight: '1'
    letterSpacing: '0.1em'
  caption:
    fontFamily: 'Inter'
    fontSize: '0.6875rem'
    fontWeight: 400
    lineHeight: '1.45'
  prose:
    fontFamily: 'Source Serif 4'
    fontSize: '1.0625rem'
    fontWeight: 400
    lineHeight: '1.625'
    letterSpacing: '-0.01em'
  code:
    fontFamily: 'JetBrains Mono'
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: '1.5'
rounded:
  sm: '6px'
  md: '8px'
  lg: '10px'
  xl: '12px'
  2xl: '16px'
  3xl: '20px'
  4xl: '26px'
  5xl: '32px'
  full: '9999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
  xl: '32px'
components:
  button:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.onAccent}'
    typography: '{typography.body}'
    rounded: '{rounded.xl}'
    padding: '8px 16px'
  buttonHover:
    backgroundColor: '{colors.primaryHover}'
    textColor: '{colors.onAccent}'
  buttonSecondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.xl}'
    padding: '8px 16px'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    typography: '{typography.body}'
    rounded: '{rounded.xl}'
    padding: '12px 16px'
  card:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.2xl}'
    padding: '16px'
  tag:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    typography: '{typography.bodySmall}'
    rounded: '{rounded.xl}'
    padding: '8px 12px'
  badge:
    typography: '{typography.label}'
    rounded: '{rounded.full}'
    padding: '2px 8px'
  overlay:
    backgroundColor: '{colors.scrim}'
  messageBubble:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.3xl}'
    padding: '12px 16px'
---

# Open Cowork — Design System

This file is the source of truth for Open Cowork's visual language. The YAML front matter above
holds the exact tokens; the prose below explains _why_ they exist so an agent (or a person) can
extend the UI without re-deriving the intent. Tokens here mirror the runtime tokens in
`src/renderer/styles/globals.css` (CSS variables) and `tailwind.config.js` — keep the three in sync.

## Overview

Open Cowork is a **modern-agentic** desktop app: an autonomous coding/agent surface that should feel
calm, precise, and premium — closer to a well-made instrument than a chat toy. The aesthetic is
**cool graphite neutral**: a near-black graphite canvas, a single disciplined indigo for every
interaction, and generous quiet space. Personality comes from **typography and restraint**, not from
color — the interface recedes so the agent's work is the focus. Serif prose gives the assistant's
voice an editorial, considered texture; the chrome around it stays a neutral grotesk.

Principles: **one accent** (indigo — links, focus, selection, primary actions; nothing else competes
for it), **hairline separation over heavy shadow**, **a fixed radius and type scale** (no magic
numbers), and **legible contrast in both themes** (WCAG AA for text).

## Colors

Dark is the canonical theme; light mirrors every token (see `.light` in `globals.css`). Notable
light-theme deltas: `background #FBFBFC`, `surface #FFFFFF`, `text #14161A`, `primary #4F6BF6` (a
touch deeper so white `onAccent` clears AA), `onAccent #FFFFFF`, `scrim rgba(11,15,25,0.35)`.

- **Graphite surfaces** (`background → surface → surfaceHover → surfaceActive`) are separated by
  lightness _and_ by `border` / `borderSubtle` hairlines. On near-black, borders do the structural
  work that shadow can't.
- **Indigo `primary` is the sole interaction driver.** Use it for links, focus rings, the
  selected/active state, and primary buttons — and effectively nowhere else. On a filled primary
  surface, text/icons use `onAccent` (dark ink on the light-indigo dark-theme fill; white on the
  deeper light-theme fill). **Never** hardcode `text-white` on an accent fill — use `onAccent`.
- **MCP violet is deliberately off to the side.** Connector UI uses `mcp` so it never reads as a
  primary action.
- **Semantics** (`success / warning / error`) are the only other saturated hues, reserved for state.
  Never reach for a raw Tailwind palette (`amber-500`, `rose-500`, `green-500`) — the semantic tokens
  already theme correctly in light and dark.

## Typography

Three families, each with one job:

- **Inter** — all UI chrome. Loaded with `cv05`/`cv11`/`ss01` and optical sizing for a refined,
  neutral-modern grotesk. Sizes come from the scale: `display` (hero), `title` (view/sidebar
  titles), `heading`, `body` (default 15px), `bodySmall` (13px, dense UI), `label` (11px, uppercase,
  tracked — section headers and eyebrows), `caption` (11px, normal — meta/hints/versions).
- **Source Serif 4** — assistant _prose_ only (`.prose-chat`). The serif gives the agent's output an
  editorial, human texture that sets it apart from the tool chrome. Do not use it for UI controls.
- **JetBrains Mono** — code blocks and inline code.

Prefer the named scale (`text-display`, `text-title`, `text-body`, `text-label`, …) over arbitrary
sizes like `text-[13px]`; the scale carries the correct line-height and letter-spacing.

## Layout & Spacing

Spacing follows a 4/8 rhythm (`xs 4 · sm 8 · md 16 · lg 24 · xl 32`). Primary reading columns are
width-capped and centered via shared tokens: **`max-w-content` (920px)** for the main column (chat
messages + composer + context bar) and **`max-w-content-narrow` (860px)** for the calmer columns
(settings content, the welcome landing) — never hardcode a `max-w-[…px]` reading width. The shell is
a fixed titlebar, a collapsible sidebar (`4.5rem` collapsed / `17.5rem` expanded), a flexible main
column, and an optional context panel that appears only at `xl+`. Shell rails use width tokens:
`w-sidebar` (17.5rem) / `w-sidebar-collapsed` (4.5rem) and `w-context` (18rem) — the context panel and
its loading fallback share `w-context` so there's no width jump on load. In-app view headers use a
shared `h-header` (3rem) so the main-column header and the side-panel header align on one baseline.

## Elevation & Depth

On a near-black canvas, heavy drop-shadows read as grime, so depth is expressed as a **layer stack**:
a lighter `surface`, a hairline `border`/`borderSubtle`, and — for the topmost layer only — a subtle
`shadow-elevated` that pairs a soft ambient shadow with a 1px light ring. Three levels:

- **soft** — resting controls (composer, inline buttons).
- **card** — panels and cards (ambient shadow + hairline ring).
- **elevated** — dialogs, popovers, toasts (the only place a real shadow appears).

Backdrops for modals use the shared `scrim` + `backdrop-blur-sm` (the `.overlay` primitive), not a
per-dialog opacity guess.

## Shapes

One radius scale, softening as elements grow: `sm 6` (chips/tiny) · `md 8` · `lg 10` · `xl 12`
(buttons, inputs, tags) · `2xl 16` (cards) · `3xl 20` (message bubbles) · `4xl 26` (the composer and
hero card) · `5xl 32` (large framed panels / dialogs) · `full` (pills, avatars). Never introduce arbitrary radii like `rounded-[1.75rem]`.

## Components

Reusable primitives live in `globals.css @layer components` and should be preferred over re-styling:

- **`.btn` + `.btn-primary` / `.btn-secondary` / `.btn-ghost`** — the primary variant is
  `primary` fill + `onAccent` text; all share the same focus ring (`ring-accent/50` + offset) and a
  subtle `active:scale-[0.98]` press.
- **`.icon-btn`** — square, icon-only control (caller sets the size, e.g. `w-9 h-9`): muted icon,
  `surfaceHover` on hover, shared focus-visible ring.
- **`.input`** — `surface` fill, hairline border, `accent` focus ring. One recipe for every field.
- **`.card`** / **`.card-elevated`** — panels and dialogs.
- **`.tag`** — chips and quick actions.
- **`.badge`** — status/count pills.
- **`.overlay`** — the single modal scrim wrapper.
- **`.gutter-x`** — the shared horizontal content gutter (`px-5` → `lg:px-8`); use it on a view's
  header/bars and its body so they stay aligned at every breakpoint.
- **`.message-user`** — the right-aligned user bubble (`surface`, `3xl`).

## Do's and Don'ts

**Do**

- Route buttons, inputs, cards, and dialogs through the primitives above.
- Use `onAccent` for anything sitting on an accent fill.
- Use the named type scale and the radius scale.
- Use `success` / `warning` / `error` for state, and `mcp` for connector UI.
- Keep interaction to the single indigo `primary`.

**Don't**

- Don't hardcode `text-white` on accent fills, or raw palette hues (`amber-500`, `rose-500`,
  `green-500`, `bg-red-500`) — use the semantic tokens.
- Don't invent arbitrary radii (`rounded-[1.65rem]`) or font sizes (`text-[13px]`) when a scale token
  fits.
- Don't add heavy drop-shadows on the dark canvas; lean on layered surfaces + hairline borders.
- Don't use the serif (`Source Serif 4`) for UI chrome, or Inter for assistant prose.
- Don't give any accent other than `primary` a call-to-action role.
