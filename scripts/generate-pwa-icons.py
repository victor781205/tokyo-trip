"""Generate the Tokyo Tower PWA icons from the code-native brand geometry."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SCALE = 4


def render(size: int, *, maskable: bool) -> Image.Image:
    canvas_size = size * SCALE
    image = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    inset = 0 if maskable else int(canvas_size * 0.025)
    radius = 0 if maskable else int(canvas_size * 0.21)
    draw.rounded_rectangle(
        (inset, inset, canvas_size - inset, canvas_size - inset),
        radius=radius,
        fill="#07111f",
    )

    def point(x: float, y: float) -> tuple[int, int]:
        return (int(canvas_size * x), int(canvas_size * y))

    draw.ellipse(
        (*point(0.50, 0.10), *point(0.86, 0.46)),
        fill="#c02f26",
    )

    ivory = "#f8f3eb"
    width = max(4, int(canvas_size * 0.045))
    line = {"fill": ivory, "width": width, "joint": "curve"}
    draw.line((point(0.50, 0.13), point(0.25, 0.86)), **line)
    draw.line((point(0.50, 0.13), point(0.75, 0.86)), **line)
    draw.line((point(0.33, 0.63), point(0.67, 0.63)), **line)
    draw.line((point(0.39, 0.45), point(0.61, 0.45)), **line)
    draw.line((point(0.44, 0.28), point(0.56, 0.28)), **line)
    draw.line((point(0.17, 0.86), point(0.83, 0.86)), **line)
    draw.line((point(0.35, 0.86), point(0.50, 0.68), point(0.65, 0.86)), **line)
    dot = int(canvas_size * 0.045)
    cx, cy = point(0.50, 0.13)
    draw.ellipse((cx - dot, cy - dot, cx + dot, cy + dot), fill=ivory)

    return image.resize((size, size), Image.Resampling.LANCZOS)


def _font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont:
    filename = "msjhbd.ttc" if bold else "msjh.ttc"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / filename), size=size)


def render_open_graph() -> Image.Image:
    width, height = 1200, 630
    image = Image.new("RGB", (width, height), "#07111f")
    draw = ImageDraw.Draw(image)

    for x in range(0, width, 42):
        draw.line((x, 0, x, height), fill="#111f32", width=1)
    for y in range(0, height, 42):
        draw.line((0, y, width, y), fill="#111f32", width=1)

    draw.ellipse((785, 54, 1135, 404), fill="#c02f26")
    tower = Image.new("RGBA", (420, 560), (0, 0, 0, 0))
    tower_draw = ImageDraw.Draw(tower)
    ivory = (248, 243, 235, 145)
    tower_draw.line(((210, 20), (58, 526)), fill=ivory, width=23)
    tower_draw.line(((210, 20), (362, 526)), fill=ivory, width=23)
    tower_draw.line(((105, 374), (315, 374)), fill=ivory, width=23)
    tower_draw.line(((135, 270), (285, 270)), fill=ivory, width=23)
    tower_draw.line(((166, 165), (254, 165)), fill=ivory, width=23)
    tower_draw.line(((22, 526), (398, 526)), fill=ivory, width=23)
    tower_draw.line(((120, 526), (210, 410), (300, 526)), fill=ivory, width=23, joint="curve")
    tower_draw.ellipse((192, 2, 228, 38), fill=ivory)
    image.paste(tower, (770, 70), tower)

    draw.text((64, 52), "TOKYO PRIVATE JOURNEY · 2026", font=_font(23, bold=True), fill="#f5aaa2")
    draw.text((64, 128), "東京，", font=_font(96, bold=True), fill="#f8f3eb")
    draw.text((64, 238), "一起出發。", font=_font(96, bold=True), fill="#ff887d")
    draw.text((68, 370), "與毓寧的六天五夜東京旅行", font=_font(30, bold=True), fill="#d8dee8")
    draw.text((68, 422), "航班 · 行程 · 美食 · 旅費 · 離線同步", font=_font(22), fill="#98a6ba")

    draw.rounded_rectangle((64, 500, 705, 574), radius=22, outline="#314059", width=2, fill="#0d1a2c")
    draw.text((92, 515), "TPE  08:30", font=_font(25, bold=True), fill="#f8f3eb")
    draw.line((300, 538, 468, 538), fill="#c02f26", width=3)
    draw.polygon(((458, 530), (478, 538), (458, 546)), fill="#c02f26")
    draw.text((500, 515), "NRT  12:55", font=_font(25, bold=True), fill="#f8f3eb")
    draw.text((852, 532), "SEP 01 — SEP 06", font=_font(20, bold=True), fill="#f8f3eb")
    return image


if __name__ == "__main__":
    render(180, maskable=False).save(PUBLIC / "apple-touch-icon.png", optimize=True)
    render(192, maskable=False).save(PUBLIC / "icon-192.png", optimize=True)
    render(512, maskable=False).save(PUBLIC / "icon-512.png", optimize=True)
    render(512, maskable=True).save(PUBLIC / "icon-maskable-512.png", optimize=True)
    render(256, maskable=False).save(
        ROOT / "src" / "app" / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    render_open_graph().save(ROOT / "src" / "app" / "opengraph-image.png", optimize=True)
