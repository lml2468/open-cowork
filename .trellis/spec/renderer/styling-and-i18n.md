# Styling & i18n

## Tailwind only, through design tokens

Styling is Tailwind utility classes exclusively — no CSS modules, styled-components, or
inline color styles. Colors, radii, shadows, type scale, and shell widths are **theme
tokens**, not raw values:

- Tokens are CSS variables defined per theme (dark default + `.light`) in
  `src/renderer/styles/globals.css`, and mapped to Tailwind names in
  `tailwind.config.js` (`theme.extend`).
- Use semantic classes: `bg-surface`, `text-text-primary`, `text-text-muted`,
  `border-border-muted`, `bg-accent`, `text-on-accent`, `rounded-2xl`, `shadow-soft`,
  `text-title` / `text-body-sm` / `text-label`, `w-sidebar`, `max-w-content-narrow`.
- Shared component classes live in the `@layer components` block of `globals.css`:
  `btn`/`btn-primary`, `icon-btn`, `card`, `tag`, `input`, `gutter-x`, `heading-serif`.
  Reuse these instead of re-deriving the same utility stacks.

Never hard-code hex colors or use Tailwind arbitrary color values (`bg-[#...]`,
`text-[rgb(...)]`) in components — that bypasses theming and breaks light/dark. Add or
reuse a token instead.

## Theming

Light/dark is driven by the `light` class on `document.documentElement` (toggled in
`src/renderer/App.tsx` from `settings.theme` + system preference). Because colors are
tokens, correctly-tokened components theme automatically; verify new surfaces in both
themes.

## i18n (i18next) — both locales, always

Every user-facing string goes through `react-i18next`'s `t()`; there are no hard-coded
display strings. Keys are added to **both** locale files:

- `src/renderer/i18n/locales/en.json`
- `src/renderer/i18n/locales/zh.json`

Add the key to both files, keep the same key path, and use interpolation
(`t('welcome.skillPromptTemplate', { name })`) rather than string concatenation. A key
present in only one locale is a bug.

## Anti-patterns

- Raw hex / arbitrary Tailwind color values in components.
- Non-Tailwind styling (CSS modules, styled-components, style objects for color).
- Adding a display string without a `t()` key, or adding a key to only `en`/`zh`.
