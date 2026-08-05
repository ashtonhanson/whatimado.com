# v2 architecture

Entry point: `/app.html` with `js/v2/app.js`.

## Module layout

```
app.html                     # Shell markup (brand copy applied at runtime)
brand/
  whatimado.default.json     # White-label knobs (copy, colors, layout)
  apply-brand.js             # JSON → CSS vars + DOM text
js/v2/
  config.js                  # fetch brand, export getBrand/getExamplePrompts
  app.js                     # Boot: initBrand → components → chat flow
  layout/
    measure-css-var.js       # Shared CSS var probes (keyboard, focus rise)
    notify-frame-layout.js   # Frame + map gravity sync helper
  dock/
    constants.js             # SNAP, glide tuning, mobile timing
    anchors.js               # Anchor measurement + snap resolution
    glide.js                 # Release velocity + easing
    mobile-focus-lift.js     # Composer-focus map/hero stack
    mobile-keyboard.js       # Visual viewport keyboard dock
    frame-dock-controller.js # FrameDockController class
  frame-dock.js              # Barrel re-export (stable import path)
  frame/
    constants.js             # Scroll/placeholder timing
    template.js              # whatimado-frame inner HTML
  map/
    constants.js             # ViewBox + physics constants
    geometry.js              # Bounds, drift, SVG helpers
    pan.js                   # Pan/gravity compute functions
  components/
    whatimado-map.js         # Barrel → whatimado-map/index.js
    whatimado-map/index.js   # Map custom element
    whatimado-frame.js       # Frame custom element
  ui/chat-flow.js            # Phase state, advisor turns, path cards
css/v2/                      # Styles (tokens.css holds default CSS vars)
```

## Data flow

1. `app.js` awaits `initBrand()` — loads JSON, applies copy/colors to DOM.
2. Custom elements register and connect.
3. `initChatFlow()` wires composer, map, and nav events.
4. `FrameDockController` owns frame vertical position; map pan follows via `syncFrameGravity` / focus lift tokens on mobile.

## White-label

Override `brand/whatimado.default.json` or point `config.js` at another JSON file. Keys: `wordmark`, `hero`, `composer.examplePrompts`, `map.youButtonLabel`, `colors.*`, `layout.frameTopDefault`.

See also `docs/v2-brand-system.md`.

## Layout intent

Preserve centered columns (`min(94vw, 720px)` chat, `960px` home). Adjust padding/inset inside columns only — see `.cursor/rules/layout-intent.mdc`.
