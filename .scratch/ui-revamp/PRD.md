# UI Revamp — flat, minimal, modern

Status: implemented (2026-07-01)

Implementation notes that diverge from the plan below:
- Font subsets are emitted as woff1, not woff2 — fonteditor-core's woff2 encoder returns an empty buffer for hinted TrueType (Literata), and subsets are written with hinting and kerning disabled (its kern table keeps stale pair indices after subset reindexing, collapsing word spacing).
- No cheerio/wasm vendoring was needed: the repo's own `html-fragment.ts` parser walks the fragment, and `fonteditor-core` ships its woff2 wasm (used for decoding only).
- Body font in exports is subset per document (Literata 400/400i/600/700); a math-heavy test export came to ~72 KB total vs. multiple MB with the old all-fonts inlining.

## Context

The app works well but its visual language grew ad-hoc: mixed border radii (`rounded-lg/xl/2xl/full` with no rule), heavy `shadow-2xl shadow-black/50` floating panels, translucent `bg-background/80 backdrop-blur` chrome, a native unstyled `<audio controls>` element, mono-uppercase micro-labels everywhere, and zero shared primitives (every button is a hand-rolled class string). Typography is entirely system-default. There is no light mode.

Goal: a cohesive flat, minimal, modern redesign across the whole app, plus a real light/dark mode system where **light mode always renders a new light variant of the default palette** and the four noctalia themes (Tokyo Night, Catppuccin, Nord, Rosé Pine) remain dark-only.

Decisions already made with the user:
- Mode control: **Auto / Light / Dark** in theme settings; Auto follows `prefers-color-scheme`.
- **Webfonts** (self-hosted via fontsource).
- Drop the mono/uppercase "terminal" motif for a **softer minimal** character.
- In scope: custom audio player, exported-HTML stylesheet, debug overlay.

## Design direction

**Thesis:** this is a reading instrument. The reader column is the product; everything else is quiet furniture around it. The redesign spends its one aesthetic risk on typography — real book typography (Literata) in the reader pane, so an imported paper immediately looks *set*, not rendered — and keeps the chrome disciplined and flat.

### Tokens

**Color** — palettes are kept as-is (that's the user's brand). New: a light variant of the default sage palette, used exclusively by light mode. Approximate values (tune for contrast at implementation; `primary` must hit ≥4.5:1 on `background`):

| token | light default |
|---|---|
| `--background` | `oklch(0.985 0.002 106)` (paper, barely warm — not cream) |
| `--foreground` | `oklch(0.235 0.008 106)` |
| `--card` | `oklch(0.962 0.003 106)` |
| `--popover` | `oklch(1 0 0)` |
| `--primary` | `oklch(0.50 0.08 135)` (sage, darkened from `#7c9a6e`) |
| `--primary-foreground` | `oklch(0.985 0.01 135)` |
| `--secondary` | `oklch(0.945 0.004 106)` |
| `--muted-foreground` | `oklch(0.50 0.01 106)` |
| `--destructive` | `oklch(0.545 0.19 25)` |
| `--border` | `oklch(0.905 0.004 106)` |
| `--tertiary` | `oklch(0.46 0.07 145)` |

**Type** (fontsource variable fonts, imported in `styles.css`):
- UI sans: **Hanken Grotesk Variable** (`@fontsource-variable/hanken-grotesk`) — humanist, soft terminals, distinctly not-Inter. `--font-sans`.
- Reader prose: **Literata Variable** (`@fontsource-variable/literata`, normal + italic) — designed for long-form screen reading, pairs naturally with KaTeX math. `--font-serif`, applied to `.reader-view`.
- Mono: system stack (`ui-monospace`), demoted from decoration to data: timestamps, page counts, event payloads, debug — lowercase, normal tracking, `tabular-nums`. **All `uppercase tracking-[0.x em] font-mono` label styling is removed.** Section labels become sans, `text-xs font-medium text-muted-foreground`, sentence case.

**Flatness rules** (the system, applied everywhere):
- One radius scale: `--radius-sm: 6px` (buttons, inputs, badges), `--radius-md: 10px` (cards, popovers, dialogs). `rounded-full` reserved for the segmented mode control, theme swatches, and the narration play button. No `rounded-2xl/3xl`.
- **No decorative shadows.** Elevation = surface steps (`background` → `card` → `popover`) + 1px `border`. Single exception: one `--shadow-overlay` token (`0 4px 16px oklch(0 0 0 / 0.08)`) for popovers/dialogs/drawer **in light mode only** (hairlines alone don't separate white-on-white); dark mode uses borders only.
- **No translucency/backdrop-blur.** Floating chrome gets solid `bg-popover` (or `bg-background`) + border.
- Active/selected recipe, one idiom app-wide: `bg-primary/10 text-primary` (no rings, no `border-primary/40` halos). Destructive equivalent: `bg-destructive/10 text-destructive`.
- Motion: 150ms color/opacity transitions; 200ms ease-out for drawer/collapsible; define the missing `collapsible-down/up` keyframes; a global `prefers-reduced-motion` block disables transitions/animations.

**Layout:** structures are sound and stay — library single column (tighten `max-w-4xl` → `max-w-2xl`), reader 3-column grid `[18rem_1fr_1fr]`, off-canvas mobile sidebar. The revamp is about surface consistency, not re-architecture.

**Signature element — the narration strip.** Replace the floating glass card + native `<audio controls>` with a slim flat bar docked to the bottom of the reader column: a 2px progress line running along its top edge (primary color, fills in real time, seekable), then `[play/pause] Block 12 · reading  1:24 / 2:10 [tabular-nums]  [close]`. It's the app's defining feature (papers you can hear) rendered as its most crafted component. Word-level highlight in the prose remains the second half of the signature.

## Architecture: light/dark mode

Currently no mode concept exists; all five themes are dark. Touch points are exactly three files plus the FOUC bootstrap.

1. **`apps/web/src/styles.css`**
   - Add the light default palette as `:root[data-mode="light"] { … }` **after** all `[data-color-theme]` blocks so it wins regardless of palette attribute. Derived tokens (`--muted`, `--accent`, `--dim` via `color-mix`) recompute automatically.
   - Add `color-scheme: dark` / `light` per mode so form controls/scrollbars follow.
2. **`apps/web/src/features/theme/color-theme.ts`** — extend the store:
   - State: `palette` (existing signal, localStorage `color-theme`) + `mode: "auto" | "light" | "dark"` (new signal, localStorage `color-mode`, default `"auto"`).
   - `resolvedMode()`: `mode === "auto"` ? follow `matchMedia("(prefers-color-scheme: light)")` (with change listener) : mode.
   - Effect: set `document.documentElement.dataset.mode = resolvedMode()`. Palette attribute keeps reflecting the stored palette — CSS ordering makes light win. Switching back to dark restores the chosen palette with no extra state.
3. **`apps/web/index.html`** — extend the pre-paint bootstrap: read both keys, resolve auto via `matchMedia`, set `data-color-theme` **and** `data-mode`.
4. **`ThemeSettings.tsx`** — rebuild on Kobalte popover primitives (gets focus management/Escape/outside-click for free; delete the hand-rolled listeners). Contents: a segmented **Auto / Light / Dark** control on top; the five palette swatches below. When `resolvedMode() === "light"`, palette rows render disabled with the caption "Palettes apply in dark mode".

## Design-system foundations

New/updated files in `apps/web/src/components/ui/` (built on Kobalte where a behavior exists, using the existing `cn()` from `src/lib/utils.ts`):

- `button.tsx` — variants `primary | outline | ghost | destructive-ghost`, sizes `sm | md | icon`. Replaces the ~6 scattered class-string helpers (`sidebarActionClass`, `mobileViewButtonClass`, `tabClass`, pill buttons, `AddDocumentButton` CTA…).
- `popover.tsx` — Kobalte popover wrapper (theme settings, future menus).
- `progress.tsx` — flat 2px bar, determinate + indeterminate; replaces `ProgressBar` in `DocumentProcessing.tsx` and the creation-flow bar.
- `skeleton.tsx` — standard `animate-pulse rounded-[--radius-md] bg-card` block.
- `field.tsx` (or plain shared classes) — input/select/checkbox styling for the configure form and auth panel.
- `dialog.tsx` — restyle existing wrapper flat (solid `bg-popover`, border, `--shadow-overlay` in light, no `shadow-2xl`).
- `collapsible.tsx` — keep; define the currently-missing `--animate-collapsible-down/up` keyframes in `styles.css` so it actually animates.

This is deliberate consolidation of massively repeated invocations, not thin wrapping (per CLAUDE.md).

## Per-view work

All under `apps/web/src/` unless noted. Every view: radii/shadow/blur rules above, mono-uppercase labels → sans sentence-case labels, shared Button.

- **`features/documents/DocumentLibrary.tsx`** — keep the border-separated row-list concept (it's already minimal and good). Wordmark/section labels lose mono/uppercase. Hover-revealed `Details/Delete/Open ↗` become quiet icon-adjacent text buttons, visible-on-focus preserved. Landing hero: headline set in Literata (the one display use of the serif — ties the landing to the reader), body in Hanken Grotesk.
- **`features/auth/AuthPanel.tsx`** — flat card, shared field styles, tab toggle → understated segmented control.
- **`features/documents/DocumentCreationFlow.tsx`** — dropzone `rounded-[--radius-md]` dashed, hover = `border-primary` + `bg-primary/5` (no scale/shadow). Configure modal uses restyled Dialog + field.tsx; progress uses `progress.tsx`.
- **`features/documents/DocumentProcessing.tsx` + `ProcessingEventsList.tsx`** — phase pills → flat chips with the standard active recipe; glyphs (✓ ✕ ! ▸ ·) → small lucide icons; severity badges standardized (`bg-destructive/10 text-destructive` etc.); event metadata in system mono `tabular-nums`. Preserve the exhaustive event→phase mapping untouched (see processing-phase invariant).
- **`features/documents/DocumentPage.tsx`** — mobile chrome pills → solid `bg-background` bordered controls, no blur; events drawer → solid surface, border-left, no `shadow-2xl` (light mode: `--shadow-overlay`).
- **`features/documents/DocumentSidebar.tsx` + `DocumentTableOfContentsList.tsx`** — quieter sidebar: `bg-background`, hairline right border; actions use ghost Button; TOC active entry gets the standard active recipe plus a 2px primary left bar; depth indentation kept.
- **`features/documents/DocumentReaderView.tsx`** — `.reader-view` prose moves to Literata: `font-size: 1.0625rem`, `line-height: 1.75`, headings in Literata semibold (not 650 sans), tables/captions in the sans. **Narration strip** (signature, described above) replaces the floating card + native audio element: custom play/pause + seek on the top-edge progress line + time readout, driven by the existing audio element kept off-DOM (`<audio>` without `controls`), preserving the VTT/word-highlight wiring in `narration-word-highlighting.ts`. Active block keeps `bg-primary/10` but drops `ring-1`.
- **`features/documents/DocumentSourceView.tsx`** — page canvases: keep `shadow` off, use 1px border + `bg-white` cards (source pages are inherently paper); zoom pill → flat bordered segmented control; captions in sans.
- **`features/documents/DocumentDebug.tsx`** — restyle stats panel/overlay chrome to tokens (solid surfaces, radius-sm, system mono for data); overlay geometry logic untouched.
- **`features/theme/ThemeSettings.tsx`** — as in the mode section.
- **`routes/index.tsx` / `__root.tsx` / `document-page-ui.tsx`** — spacing/width tweaks, FullPageMessage restyle.

## Exported HTML

Two parts: the stylesheet, and shipping real fonts with subsetting (ported from the old `../academic-reader` repo).

**Stylesheet (`apps/api/src/styles/standalone-reader.css`):** port the new reader look so exports match the app — light-default token values as plain CSS custom properties, same prose scale, Literata for prose (with `Charter, Georgia, serif` fallback), sage `--primary` for links/h2 accents, flat tables/blockquotes/code. Keep `.inline-citation` and `.katex-display` handling.

**Font embedding + subsetting (`apps/api`):** the current `document-download.ts` (`inlineKatexFontUrls`) base64-inlines *every* font katex.min.css references — all ~20 KaTeX families in woff2 + woff + ttf, used or not — megabytes of dead weight. Replace it by porting the old repo's pipeline (`../academic-reader/apps/api/src/utils/font-subsetting.ts`, plus its `types/assets.d.ts` module declarations and `src/wasm/woff2.wasm`):

- Deps: `fonteditor-core` (subsetting + woff2 wasm), `cheerio` (or the HTML parser already used in `block-content.ts` if it can walk the fragment), static-weight font packages for export embedding — `@fontsource/literata` (400, 400-italic, 600) and the sans for captions/tables. Static instances, not the variable fonts: `fonteditor-core`'s variable-axis support is unreliable, and subsets of static weights are smaller anyway.
- KaTeX: extract per-font character usage from the rendered `.katex-html` (the old repo's `KATEX_FONT_MAP` class→family/weight/style mapping), subset each used font to its code points, emit `@font-face` blocks with base64 woff2 data URIs, and strip the original `@font-face` rules from katex.min.css (`getKatexCssRules`). Unused families ship nothing.
- Body text: collect the fragment's text content and subset Literata (and the caption sans) to those code points with the same `subsetFontBuffer` path — improving on the old repo, which embedded the body font whole.
- Assembly stays in `standaloneHtmlDocument()` at download time; keep the existing `cachedKatexCss`-style memoization where it still applies (base fonts can be cached; per-document subsets cannot).

## Implementation phases

1. **Foundations** — `styles.css` rewrite (theme blocks kept, light block + `data-mode`, radius/shadow/motion/font tokens, reduced-motion block, collapsible keyframes, new `.reader-view` prose), fontsource deps (`bun add @fontsource-variable/hanken-grotesk @fontsource-variable/literata`), `index.html` bootstrap, `color-theme.ts` mode store.
2. **Primitives** — `components/ui/` additions + dialog/collapsible restyle.
3. **Theme settings** — Kobalte popover rebuild with mode segmented control.
4. **Library surface** — DocumentLibrary, AuthPanel, DocumentCreationFlow, DocumentProcessing, ProcessingEventsList, routes/index.
5. **Document surface** — DocumentPage, DocumentSidebar, TOC list, DocumentReaderView + narration strip, DocumentSourceView, document-page-ui.
6. **Edges** — DocumentDebug, standalone-reader.css, export font subsetting pipeline in `apps/api`.
7. **Polish pass** — focus-visible audit (visible `ring-2 ring-ring` on all interactive elements), mobile walkthrough, contrast check of the light palette, remove now-dead helpers (`sidebarActionClass` etc.), `text-tertiary` single-use review.

Each phase leaves the app working; phases 4–6 are independent after 1–3.

## Verification

- `bun run typecheck && biome check` in `apps/web` after each phase.
- `bun run dev` → walk both routes signed-out and signed-in: upload → configure → processing → reader → narration playback (word highlight + strip seek) → downloads → delete.
- Theme matrix: all 5 palettes in dark; light via DevTools `prefers-color-scheme` emulation with mode=Auto, then manual Light/Dark override; confirm light always renders default-light regardless of selected palette, and switching back to dark restores the palette. Reload each state to confirm no FOUC.
- Keyboard: theme popover, dialog, narration strip (play/pause/seek focusable); visible focus rings.
- `prefers-reduced-motion` emulation: no drawer/collapsible animation.
- Export check: download HTML for a math-heavy document and open it offline — Literata + KaTeX render correctly, glyphs aren't missing (subsetting bug symptom: tofu/fallback glyphs), and file size is sane (compare before/after; today's all-fonts inlining is the baseline). Also export a no-math document and confirm zero KaTeX payload.
- Screenshots at each phase for review.

## Out of scope

- Uncommitted API changes in `apps/api/src/document-exports.ts` / `documents.ts` (unrelated; don't touch beyond the stylesheet).
- New features (glossary, settings page), data-layer changes, `window.confirm` → custom dialog (possible follow-up).
