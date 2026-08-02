# whatimado v2 brand system

Canonical reference for the v2 shell (`/app.html`). Source of truth for tokens: `css/v2/tokens.css`. Surfaces: `css/v2/text-box.css`.

## Text Box (signature shape)

Every framed control uses **three rounded corners and one straight corner**. The straight corner encodes role:

| Variant | CSS class / token | Straight corner | Used for |
|---------|-------------------|-----------------|----------|
| Chrome | `--v2-btn-radius` / `.v2-text-box--chrome` | Top-left | Buttons, logo wordmark, active-path panel, advisor bubbles |
| Prompt | `--v2-prompt-radius` / `.v2-text-box--prompt` | Top-right | Composer textarea, user message bubbles |
| Response | `--v2-response-radius` | Top-left | Same as chrome; advisor/system replies |
| Shell | `.v2-text-box--shell` | Top-left | Sidebar rail, main `whatimado-frame` outer panel |

Do not revert chrome controls to full pill or uniform radius without an explicit brand change.

## Color palette

| Token | Value | Role |
|-------|-------|------|
| `--v2-bg` | `#060a0c` | Page base |
| `--v2-bg-gradient` | teal radial | Atmospheric depth |
| `--v2-teal` | `#2ee8d6` | Primary accent, prompt fill, links |
| `--v2-teal-dim` | `#1a9e92` | Muted teal, labels |
| `--v2-neon-teal` | `#42fff0` | Border glow |
| `--v2-yellow` | `#f5d547` | Hero headline, section labels, wordmark **WHAT** |
| `--v2-yellow-bright` / `--v2-yellow-dim` | gradient ends | Hero + logo depth |
| `--v2-text` | `#e8f4f2` | Body on dark |
| `--v2-text-muted` | `#8aa8a3` | Secondary copy, wordmark **DO** |
| `--v2-border` | neon teal ~48% | Solid frames |
| `--v2-border-dashed` | neon teal ~32% | Dashed panels (undo, paths) |
| `--v2-frame-bg` | `rgba(4,12,14,0.92)` | Text Box fill |

### Wordmark segments (all caps)

- **WHAT** — yellow (`--v2-yellow`), weight 400  
- **IMA** — teal (`--v2-teal`), weight 500  
- **DO** — light text (`--v2-text`), weight 300  

Logo sits inside a **Text Box chrome** frame.

## Typography

| Token | Stack | Use |
|-------|-------|-----|
| `--v2-font` | Inter | Body, composer input text, descriptions |
| `--v2-font-hero` | Montserrat → Avenir Next → Avenir | Hero title, subtitle, buttons, titles, map node labels, wordmark |

- **Hero title**: Montserrat 300, uppercase, wide tracking, yellow gradient  
- **Hero subtitle**: Montserrat 400, sentence case, muted  
- **Chrome (buttons, labels)**: Montserrat, uppercase  

Google Fonts load: Inter 400–700, Montserrat 300–500.

## Map constellation (look + physics)

Visual tokens (`css/v2/map-canvas.css`, `css/v2/tokens.css`):

- Node radii: `--v2-map-node-lg` (8.5), `--v2-map-node-sm` (4.25); support nodes scaled 0.5× visually  
- Drift: `--v2-map-drift-duration` 11s ambient float  
- Connectors: teal dashed, `stroke-width: 0.65`  
- Anchor node: yellow fill + soft blurred aura (SVG filter, no scale ring)  
- Ghost layer opacity: `--v2-map-ghost-opacity` 0.28  
- Labels: hero font, uppercase, 7px SVG text  

Physics (`js/v2/components/whatimado-map.js` — keep in sync with this doc):

- **Drag**: commit drift to base on pointerdown; continuous drift anchor during drag  
- **Glide**: release velocity × `GLIDE_VEL_SCALE` (0.52), friction 0.905, min speed 0.06  
- **Bounds recovery**: out-of-frame nodes ease back with `BOUND_PULL` 0.14; glide damped at edges  
- **View band**: 800×240 SVG; padding from `getMapBounds()`  

## Neon frames

- Border-only pulse/sweep on prompt frame + rails (`css/v2/neon-frames.css`, `js/v2/neon-shine.js`)  
- Left rail must not get `position: relative` on the rail itself (sidebar stability)  

## Layout anchors

- Home/chat frame top: `--whatimado-frame-top` 42vh  
- Kicker reserve under map: `--v2-kicker-reserve`  
- Center columns: `--v2-center-gutter`; chat/home widths per `layout-intent` rule  

## Files map

| Concern | Files |
|---------|--------|
| Tokens | `css/v2/tokens.css` |
| Text Box utility | `css/v2/text-box.css` |
| Shell / sidebar / frame | `css/v2/shell.css`, `sidebar.css`, `frame.css` |
| Map | `css/v2/map-canvas.css`, `js/v2/components/whatimado-map.js` |
| Entry | `app.html`, `js/v2/app.js` |
