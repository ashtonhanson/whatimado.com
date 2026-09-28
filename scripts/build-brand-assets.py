#!/usr/bin/env python3
"""
Build the v2 favicon set, app icons, and Open Graph cards into assets/v2/.

  python3 scripts/build-brand-assets.py

Needs Pillow plus local Montserrat (variable) and Inter font files; override the
paths with MONTSERRAT_TTF / INTER_TTF / INTER_MEDIUM_TTF. Shapes follow
docs/v2-brand-system.md: the Text Box keeps one square corner (top-left for
chrome, top-right for the prompt), neon-teal frame, yellow WHAT / W.
"""
import math
import os
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "assets" / "v2" / "icons"
OG = ROOT / "assets" / "v2" / "og"

MONTSERRAT = os.environ.get("MONTSERRAT_TTF", str(Path.home() / "Library/Fonts/Montserrat-VariableFont_wght.ttf"))
INTER = os.environ.get("INTER_TTF", str(ROOT / "Fonts/Inter,Manrope,Nunito/Inter/static/Inter_24pt-Regular.ttf"))
INTER_MEDIUM = os.environ.get("INTER_MEDIUM_TTF", str(ROOT / "Fonts/Inter,Manrope,Nunito/Inter/static/Inter_24pt-Medium.ttf"))

BG = (6, 10, 12)
TILE = (8, 26, 29)
TEAL = (46, 232, 214)
TEAL_DIM = (26, 158, 146)
NEON = (66, 255, 240)
YELLOW = (245, 213, 71)
YELLOW_BRIGHT = (255, 229, 102)
YELLOW_DIM = (230, 192, 48)
BRAND_DO = (47, 102, 96)
TEXT = (232, 244, 242)
TEXT_MUTED = (138, 168, 163)

# ---------- favicon geometry (32-unit grid) ----------

TILE_RADIUS = 8
SMALL = {"border": 2.0, "w_stroke": 3.2}
LARGE = {"border": 1.25, "w_stroke": 2.7}
W_POINTS = [(6.0, 10.0), (10.6, 22.5), (16.0, 12.2), (21.4, 22.5), (26.0, 10.0)]
W_TOP, W_BOTTOM = 10.0, 22.5


def _intersect(p, d, q, e):
    cross = d[0] * e[1] - d[1] * e[0]
    if abs(cross) < 1e-9:
        return p
    t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / cross
    return (p[0] + d[0] * t, p[1] + d[1] * t)


def stroke_outline(points, width):
    """Mitered outline of a polyline. Ends run past the clip band so the caller's clip cuts them flat."""
    pts = list(points)
    first_d = (pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])
    last_d = (pts[-1][0] - pts[-2][0], pts[-1][1] - pts[-2][1])
    pts[0] = (pts[0][0] - first_d[0] * 0.5, pts[0][1] - first_d[1] * 0.5)
    pts[-1] = (pts[-1][0] + last_d[0] * 0.5, pts[-1][1] + last_d[1] * 0.5)
    h = width / 2
    segs = []
    for a, b in zip(pts, pts[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        d = (dx / length, dy / length)
        segs.append((a, b, d, (-d[1], d[0])))
    left, right = [], []
    for side, out in ((1, left), (-1, right)):
        a, _, d, n = segs[0]
        out.append((a[0] + side * n[0] * h, a[1] + side * n[1] * h))
        for (a1, _, d1, n1), (a2, _, d2, n2) in zip(segs, segs[1:]):
            p = (a1[0] + side * n1[0] * h, a1[1] + side * n1[1] * h)
            q = (a2[0] + side * n2[0] * h, a2[1] + side * n2[1] * h)
            out.append(_intersect(p, d1, q, d2))
        _, b, d, n = segs[-1]
        out.append((b[0] + side * n[0] * h, b[1] + side * n[1] * h))
    return left + right[::-1]


def tile_path(x, y, size, radius):
    """SVG path for the chrome Text Box: square top-left, other corners rounded."""
    r = radius
    return (
        f"M{x:g} {y:g}H{x + size - r:g}A{r:g} {r:g} 0 0 1 {x + size:g} {y + r:g}"
        f"V{y + size - r:g}A{r:g} {r:g} 0 0 1 {x + size - r:g} {y + size:g}"
        f"H{x + r:g}A{r:g} {r:g} 0 0 1 {x:g} {y + size - r:g}Z"
    )


def favicon_svg():
    b = SMALL["border"]
    w = " ".join(f"{px:.2f},{py:.2f}" for px, py in stroke_outline(W_POINTS, SMALL["w_stroke"]))
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <style>
    .frame {{ fill: #2ee8d6; }}
    @media (prefers-color-scheme: light) {{ .frame {{ fill: #1a9e92; }} }}
    @media (prefers-color-scheme: dark) {{ .frame {{ fill: #42fff0; }} }}
  </style>
  <clipPath id="w-band"><rect x="0" y="{W_TOP:g}" width="32" height="{W_BOTTOM - W_TOP:g}"/></clipPath>
  <path class="frame" d="{tile_path(0, 0, 32, TILE_RADIUS)}"/>
  <path fill="#081a1d" d="{tile_path(b, b, 32 - 2 * b, TILE_RADIUS - b)}"/>
  <polygon fill="#f5d547" clip-path="url(#w-band)" points="{w}"/>
</svg>
"""


def draw_tile(size, geometry, inset=0.0, glow=False, background=None):
    """Raster favicon at `size` px. `inset` (grid units) leaves room for the glow or a padded app icon."""
    ss = 8 if size <= 64 else 4
    px = size * ss
    unit = px / 32
    img = Image.new("RGBA", (px, px), background + (255,) if background else (0, 0, 0, 0))
    span = 32 - 2 * inset
    scale = span / 32

    def g(v):
        return (inset + v * scale) * unit

    def rounded(draw, off, fill):
        draw.rounded_rectangle(
            (g(off), g(off), g(32 - off), g(32 - off)),
            radius=(TILE_RADIUS - off) * scale * unit,
            fill=fill,
            corners=(False, True, True, True),
        )

    if glow:
        halo = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        rounded(ImageDraw.Draw(halo), 0, NEON + (150,))
        halo = halo.filter(ImageFilter.GaussianBlur(unit * 1.1))
        img = Image.alpha_composite(img, halo)

    layer = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    rounded(draw, 0, TEAL + (255,))
    rounded(draw, geometry["border"], TILE + (255,))
    img = Image.alpha_composite(img, layer)

    mask = Image.new("L", (px, px), 0)
    ImageDraw.Draw(mask).polygon([(g(x), g(y)) for x, y in stroke_outline(W_POINTS, geometry["w_stroke"])], fill=255)
    band = Image.new("L", (px, px), 0)
    ImageDraw.Draw(band).rectangle((0, g(W_TOP), px, g(W_BOTTOM)), fill=255)
    mask = ImageChops.multiply(mask, band)
    img.paste(Image.new("RGBA", (px, px), YELLOW + (255,)), (0, 0), mask)
    return img.resize((size, size), Image.LANCZOS)


def build_icons():
    ICONS.mkdir(parents=True, exist_ok=True)
    (ICONS / "favicon.svg").write_text(favicon_svg())
    small = {s: draw_tile(s, SMALL) for s in (16, 32, 48)}
    small[16].save(ICONS / "favicon-16x16.png")
    small[32].save(ICONS / "favicon-32x32.png")
    small[48].save(ICONS / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[small[16], small[32]])
    # iOS masks its own rounded square, so the touch icon is full-bleed with the tile centred.
    draw_tile(180, LARGE, inset=5, glow=True, background=BG).save(ICONS / "apple-touch-icon.png")
    draw_tile(192, LARGE, inset=1.6, glow=True).save(ICONS / "icon-192.png")
    draw_tile(512, LARGE, inset=1.6, glow=True).save(ICONS / "icon-512.png")
    # Maskable: keep the tile inside Android's 80% safe circle.
    draw_tile(512, LARGE, inset=7, glow=True, background=BG).save(ICONS / "icon-maskable-512.png")


# ---------- Open Graph cards (1200 x 630) ----------

W, H = 1200, 630
S = 2


def font(path, size, weight=None):
    f = ImageFont.truetype(path, int(size * S))
    if weight is not None:
        f.set_variation_by_axes([weight])
    return f


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def radial_background():
    """Brand --v2-bg-gradient: ellipse 120% x 80% at 50% 20%, #0f2a2e -> #060a0c 55% -> #040608."""
    stops = [(0.0, (15, 42, 46)), (0.55, BG), (1.0, (4, 6, 8))]

    def color_at(t):
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t <= t1:
                return lerp(c0, c1, (t - t0) / (t1 - t0))
        return stops[-1][1]

    grad = Image.radial_gradient("L").resize((int(W * 1.2 * S * 2), int(H * 0.8 * S * 2)), Image.BICUBIC)
    mask = Image.new("L", (W * S, H * S), 255)
    mask.paste(grad, (int(W * S / 2 - grad.width / 2), int(H * 0.2 * S - grad.height / 2)))
    channels = [mask.point([color_at(min(1.0, v / 180))[i] for v in range(256)]) for i in range(3)]
    return Image.merge("RGB", channels).convert("RGBA")


def text_width(draw, text, f, tracking=0.0):
    size = f.size
    return sum(draw.textlength(ch, font=f) for ch in text) + tracking * size * max(0, len(text) - 1)


def draw_tracked(draw, xy, text, f, fill, tracking=0.0):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=f, fill=fill)
        x += draw.textlength(ch, font=f) + tracking * f.size
    return x


def wrap(draw, text, f, max_w):
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=f) <= max_w * S or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def glow_shape(img, shape_fn, color, blur, alpha):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    shape_fn(ImageDraw.Draw(layer), color + (alpha,))
    return Image.alpha_composite(img, layer.filter(ImageFilter.GaussianBlur(blur * S)))


def text_box(img, box, radius, square="tl", fill=(4, 12, 14, 235), border=NEON, border_alpha=150, glow=True):
    x0, y0, x1, y1 = [v * S for v in box]
    corners = (square != "tl", square != "tr", True, True)

    def shape(draw, color, width=0):
        kwargs = {"radius": radius * S, "corners": corners}
        if width:
            draw.rounded_rectangle((x0, y0, x1, y1), outline=color, width=width, **kwargs)
        else:
            draw.rounded_rectangle((x0, y0, x1, y1), fill=color, **kwargs)

    if glow:
        img = glow_shape(img, lambda d, c: shape(d, c, width=int(3 * S)), border, 14, 110)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    shape(draw, fill)
    shape(draw, border + (border_alpha,), width=int(1.5 * S))
    return Image.alpha_composite(img, layer)


def wordmark_logo(img, x, y, size=40):
    """Chat-box logo: WHAT / IMA / DO inside a chrome Text Box (square top-left)."""
    probe = ImageDraw.Draw(img)
    parts = [("WHAT", YELLOW, 400), ("IMA", TEAL, 500), ("DO", BRAND_DO, 500)]
    fonts = [font(MONTSERRAT, size, weight) for _, _, weight in parts]
    tracking = 0.12
    widths = [text_width(probe, t, f, tracking) for (t, _, _), f in zip(parts, fonts)]
    gap = tracking * fonts[0].size
    total = sum(widths) + gap * (len(parts) - 1)
    pad_x, pad_y = size * 0.62, size * 0.5
    box_w = total / S + pad_x * 2
    box_h = size + pad_y * 2
    img = text_box(img, (x, y, x + box_w, y + box_h), radius=16)
    draw = ImageDraw.Draw(img)
    cx = (x + pad_x) * S
    top = (y + pad_y) * S
    for (text, color, _), f in zip(parts, fonts):
        bbox = f.getbbox("W")
        cx = draw_tracked(draw, (cx, top - bbox[1] + (size * S - (bbox[3] - bbox[1])) / 2), text, f, color, tracking)
    return img, box_w, box_h


def gradient_text(img, xy, text, f, tracking, top_color, bottom_color):
    draw = ImageDraw.Draw(img)
    w = int(text_width(draw, text, f, tracking)) + 4
    bbox = f.getbbox("HÅ'")
    h = bbox[3] + 8
    mask = Image.new("L", (w, h), 0)
    draw_tracked(ImageDraw.Draw(mask), (0, 0), text, f, 255, tracking)
    fill = Image.new("RGBA", (w, h))
    fd = ImageDraw.Draw(fill)
    for row in range(h):
        fd.line([(0, row), (w, row)], fill=lerp(top_color, bottom_color, row / max(1, h - 1)) + (255,))
    img.paste(fill, (int(xy[0]), int(xy[1])), mask)
    return img


def dashed_line(draw, a, b, color, width=2.0, dash=9.0, gap=7.0):
    ax, ay = a[0] * S, a[1] * S
    bx, by = b[0] * S, b[1] * S
    length = math.hypot(bx - ax, by - ay)
    ux, uy = (bx - ax) / length, (by - ay) / length
    pos = 0.0
    while pos < length:
        end = min(length, pos + dash * S)
        draw.line([(ax + ux * pos, ay + uy * pos), (ax + ux * end, ay + uy * end)], fill=color, width=int(width * S))
        pos = end + gap * S


GRAPH = {
    "you": (880, 452),
    "stabilize": (728, 350),
    "skills": (814, 236),
    "train": (950, 236),
    "explore": (1032, 350),
    "next": (882, 136),
}
EDGES = [("you", "stabilize"), ("you", "skills"), ("you", "train"), ("you", "explore"), ("skills", "next"), ("train", "next")]
LABELS = {
    "stabilize": ("STABILIZE", "left"),
    "skills": ("SKILLS", "left"),
    "train": ("TRAIN", "right"),
    "explore": ("EXPLORE", "right"),
    "next": ("NEXT STEP", "above"),
}


def constellation(img, ghost=False):
    alpha = 70 if ghost else 190
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for a, b in EDGES:
        dashed_line(draw, GRAPH[a], GRAPH[b], TEAL + (alpha,), width=2.2)
    img = Image.alpha_composite(img, layer)

    you = GRAPH["you"]
    img = glow_shape(img, lambda d, c: d.ellipse(((you[0] - 34) * S, (you[1] - 34) * S, (you[0] + 34) * S, (you[1] + 34) * S), fill=c), YELLOW, 18, 150)
    base = ImageDraw.Draw(img)
    for key, (x, y) in GRAPH.items():
        if key != "you":
            base.ellipse(((x - 9) * S, (y - 9) * S, (x + 9) * S, (y + 9) * S), fill=(8, 22, 25, 255))
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    label_font = font(MONTSERRAT, 17, 500)
    for key, (x, y) in GRAPH.items():
        if key == "you":
            continue
        r = 9
        fill = TEAL + ((90 if ghost else 255),)
        draw.ellipse(((x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S), fill=fill)
        text, side = LABELS[key]
        tw = text_width(draw, text, label_font, 0.1) / S
        if side == "left":
            tx, ty = x - r - 14 - tw, y - 10
        elif side == "right":
            tx, ty = x + r + 14, y - 10
        else:
            tx, ty = x - tw / 2, y - r - 34
        draw_tracked(draw, (tx * S, ty * S), text, label_font, TEAL + ((110 if ghost else 255),), 0.1)
    img = Image.alpha_composite(img, layer)
    draw = ImageDraw.Draw(img)
    draw.ellipse(((you[0] - 15) * S, (you[1] - 15) * S, (you[0] + 15) * S, (you[1] + 15) * S), fill=YELLOW + (255,))
    you_font = font(MONTSERRAT, 19, 600)
    tw = text_width(draw, "YOU", you_font, 0.12) / S
    draw_tracked(draw, ((you[0] - tw / 2) * S, (you[1] + 28) * S), "YOU", you_font, YELLOW + (255,), 0.12)
    return img


def composer(img, box, placeholder):
    """Prompt Text Box (square top-right) with a Send chip, like the app composer."""
    img = text_box(img, box, radius=18, square="tr", fill=(10, 40, 42, 235), border=NEON, border_alpha=140, glow=True)
    x0, y0, x1, y1 = box
    draw = ImageDraw.Draw(img)
    f = font(INTER, 21)
    draw.text(((x0 + 22) * S, (y0 + (y1 - y0) / 2) * S), placeholder, font=f, fill=TEXT_MUTED + (255,), anchor="lm")
    send_font = font(MONTSERRAT, 15, 600)
    sw = text_width(draw, "SEND", send_font, 0.12) / S
    chip = (x1 - sw - 44, y0 + 12, x1 - 12, y1 - 12)
    draw.rounded_rectangle([v * S for v in chip], radius=12 * S, outline=TEAL + (200,), width=int(1.5 * S), corners=(False, True, True, True))
    draw_tracked(draw, ((chip[0] + 16) * S, (chip[1] + (chip[3] - chip[1]) / 2 - 9) * S), "SEND", send_font, TEAL + (255,), 0.12)
    return img


def og_card(variant):
    img = radial_background()
    img, _, box_h = wordmark_logo(img, 72, 68, size=38)
    draw = ImageDraw.Draw(img)

    if variant == "map":
        headline = ["MAP THE PATHS", "YOU HAVEN'T", "CONSIDERED."]
        sub = "A free visual map of your options, then mission-by-mission roadmaps with contacts and drafts ready."
    else:
        headline = ["START YOUR MAP", "WITH ONE", "MESSAGE."]
        sub = "Say what's going on. whatimado maps the paths that fit your skills, goals, and situation."

    head_font = font(MONTSERRAT, 56, 300)
    y = 68 + box_h + 54
    for line in headline:
        img = gradient_text(img, (72 * S, y * S), line, head_font, 0.07, YELLOW_BRIGHT, YELLOW_DIM)
        y += 66
    draw = ImageDraw.Draw(img)
    sub_font = font(INTER, 24)
    y += 18
    for line in wrap(draw, sub, sub_font, 560):
        draw.text((72 * S, y * S), line, font=sub_font, fill=(196, 216, 212, 255))
        y += 34

    url_font = font(INTER_MEDIUM, 21)
    draw.text((72 * S, (H - 64) * S), "whatimado.com", font=url_font, fill=TEAL + (255,))

    if variant == "map":
        img = constellation(img)
    else:
        img = constellation(img, ghost=True)
        img = composer(img, (704, 524, 1128, 590), "Share what's going on…")
    return img.convert("RGB").resize((W, H), Image.LANCZOS)


def build_og():
    OG.mkdir(parents=True, exist_ok=True)
    og_card("map").save(OG / "og-card.png", optimize=True)
    og_card("blank").save(OG / "og-blank.png", optimize=True)


if __name__ == "__main__":
    build_icons()
    build_og()
    for path in sorted(list(ICONS.iterdir()) + list(OG.iterdir())):
        print(path.relative_to(ROOT), path.stat().st_size)
