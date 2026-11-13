import time
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

def capture_clam_modal():
    print("1. Capturing 3D Clam Modal...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 720})
        page.goto('http://localhost:3000')
        page.wait_for_selector('#start-btn')
        page.click('#start-btn')
        time.sleep(1.5)
        page.evaluate('() => window.openClamModal()')
        time.sleep(1.2)
        page.screenshot(path=r'd:\dita-metaverse\ss\prototype_clam_modal.png')
        print("[OK] Clam modal captured to ss/prototype_clam_modal.png")
        browser.close()

def build_prototype_board():
    print("\n2. Assembling High-Resolution 2560x1440 Prototype Board PNG...")
    width, height = 2560, 1440
    board = Image.new('RGBA', (width, height), (3, 10, 24, 255))
    draw = ImageDraw.Draw(board)

    # Background gradient: deep ocean blue with subtle turquoise ambient
    for y in range(height):
        factor = y / height
        r = int(2 + factor * 6)
        g = int(12 + factor * 25)
        b = int(28 + factor * 45)
        draw.line([(0, y), (width, y)], fill=(r, g, b, 255))

    # Top Header Banner
    header_h = 190
    draw.rectangle([(0, 0), (width, header_h)], fill=(4, 18, 42, 235))
    draw.line([(0, header_h), (width, header_h)], fill=(56, 189, 248, 180), width=3)

    # Fonts
    try:
        font_title = ImageFont.truetype("arialbd.ttf", 44)
        font_sub = ImageFont.truetype("arial.ttf", 22)
        font_card_title = ImageFont.truetype("arialbd.ttf", 26)
        font_card_desc = ImageFont.truetype("arial.ttf", 17)
        font_tag = ImageFont.truetype("arialbd.ttf", 15)
        font_badge = ImageFont.truetype("arialbd.ttf", 16)
    except Exception:
        font_title = font_sub = font_card_title = font_card_desc = font_tag = font_badge = ImageFont.load_default()

    # Header Titles
    draw.text((70, 42), "Ecoseaverse — Prototype Metaverse Ekosistem Laut Madura", fill=(255, 255, 255, 255), font=font_title)
    draw.text((70, 106), "Media Pembelajaran Sains Digital Twin Berbasis AI & Konservasi Biota Bahari (LIDM 2026)", fill=(56, 189, 248, 255), font=font_sub)

    # Header Tags (Top Right)
    tags = ["Three.js 3D WebGL", "AI Marine Guardian", "Spesimen 3D Kerang Bambu", "7 Misi Konservasi"]
    tag_x = width - 70
    for t in reversed(tags):
        bbox = draw.textbbox((0, 0), t, font=font_tag)
        tw = bbox[2] - bbox[0] + 28
        th = 36
        tag_x -= tw
        draw.rounded_rectangle([(tag_x, 72), (tag_x + tw, 72 + th)], radius=10, fill=(8, 32, 64, 220), outline=(56, 189, 248, 200), width=2)
        draw.text((tag_x + 14, 80), t, fill=(254, 240, 138, 255), font=font_tag)
        tag_x -= 14

    # 4 Prototype Panels (2x2 Grid)
    panel_w = 1170
    panel_h = 530
    margin_x = 75
    gap_x = 70
    margin_y = 230
    gap_y = 50

    def find_img(primary, fallback):
        return primary if os.path.exists(primary) else fallback

    panels_data = [
        {
            "img_path": find_img(r"d:\dita-metaverse\ss\v2_beach_view_beacons.png", r"d:\dita-metaverse\ss\test_beach_palms.png"),
            "tag": "MODUL 1: KAWASAN PESISIR & PANTAI",
            "title": "Eksplorasi Pantai Tropis Berpohon Kelapa Madura",
            "desc": "Mulai ekspedisi dari pasir pantai putih di bawah naungan pohon kelapa, zona bibit mangrove, dan perahu tradisional jukung Madura.",
            "x": margin_x,
            "y": margin_y
        },
        {
            "img_path": find_img(r"d:\dita-metaverse\ss\v2_badge_misi3.png", r"d:\dita-metaverse\ss\test_mission3_chain_ui.png"),
            "tag": "MODUL 2: NAVIGASI BAHARI 3D",
            "title": "3D Floating Number Badges & Light Beacons",
            "desc": "Pin navigasi melayang tinggi dengan medali nomor misi [1] s/d [7] bebas halangan serta pilar cahaya vertikal penuntun alur ekspedisi.",
            "x": margin_x + panel_w + gap_x,
            "y": margin_y
        },
        {
            "img_path": r"d:\dita-metaverse\ss\prototype_clam_modal.png",
            "tag": "MODUL 3: LABORATORIUM SPESIMEN 3D",
            "title": "Laboratorium 3D Kerang Bambu (Lorjuk / Solen grandis)",
            "desc": "Inspeksi 360° biota bioindikator khas pasir pesisir Madura dengan animasi filter feeding katup ganda, sifon aktif, dan materi sains.",
            "x": margin_x,
            "y": margin_y + panel_h + gap_y
        },
        {
            "img_path": find_img(r"d:\dita-metaverse\ss\fix_misi3_opened_via_e.png", r"d:\dita-metaverse\ss\test_mission4_open.png"),
            "tag": "MODUL 4: PEMBELAJARAN INTERAKTIF",
            "title": "Alur 7 Misi Konservasi & Chain Builder Rantai Makanan",
            "desc": "Aktivitas terarah dipandu AI Marine Guardian: aliran energi rantai makanan, deteksi pencemaran, transplantasi karang, dan komitmen lestari.",
            "x": margin_x + panel_w + gap_x,
            "y": margin_y + panel_h + gap_y
        }
    ]

    for p in panels_data:
        x, y = p["x"], p["y"]
        # Card background with glassmorphism border
        draw.rounded_rectangle([(x, y), (x + panel_w, y + panel_h)], radius=20, fill=(6, 22, 48, 230), outline=(56, 189, 248, 140), width=2)

        # Image thumbnail
        if os.path.exists(p["img_path"]):
            thumb = Image.open(p["img_path"]).convert('RGB')
            img_box_w, img_box_h = panel_w - 20, 390
            thumb = thumb.resize((img_box_w, img_box_h), Image.Resampling.LANCZOS)
            board.paste(thumb, (x + 10, y + 10))

        # Bottom info area
        info_y = y + 412
        # Badge tag
        draw.rounded_rectangle([(x + 18, info_y), (x + 18 + draw.textlength(p["tag"], font=font_tag) + 20, info_y + 24)], radius=6, fill=(14, 165, 233, 60), outline=(56, 189, 248, 180), width=1)
        draw.text((x + 28, info_y + 3), p["tag"], fill=(125, 211, 252, 255), font=font_tag)

        # Title
        draw.text((x + 18, info_y + 32), p["title"], fill=(255, 255, 255, 255), font=font_card_title)

        # Desc
        draw.text((x + 18, info_y + 72), p["desc"], fill=(203, 213, 225, 255), font=font_card_desc)

    # Bottom Footer Status Bar
    footer_y = height - 55
    draw.rectangle([(0, footer_y), (width, height)], fill=(2, 8, 20, 250))
    draw.line([(0, footer_y), (width, footer_y)], fill=(56, 189, 248, 100), width=1)
    draw.text((70, footer_y + 16), "Prototype Status: 100% Fully Functional Web Application | Localhost 3000 | ACESFilmic Tone Mapping | Desktop & Touch Mobile Responsive", fill=(148, 163, 184, 255), font=font_card_desc)
    draw.text((width - 490, footer_y + 16), "Tim Pengembang Ecoseaverse — LIDM 2026", fill=(254, 240, 138, 255), font=font_card_desc)

    # Save to ss/ and brain artifacts
    out_local = r"d:\dita-metaverse\ss\prototype_ecoseaverse_board.png"
    out_brain = os.path.join(os.path.dirname(__file__), "ss", "prototype_ecoseaverse_board.png")

    board.save(out_local, format="PNG")
    print(f"[OK] Prototype board saved to:\n  - {out_local}")

    # Also save individual high-res prototype module PNGs for presentations & documents
    module_files = [
        (r"d:\dita-metaverse\ss\v2_beach_view_beacons.png", "prototype_1_pantai_kelapa.png"),
        (r"d:\dita-metaverse\ss\v2_badge_misi3.png", "prototype_2_navigasi_3d.png"),
        (r"d:\dita-metaverse\ss\prototype_clam_modal.png", "prototype_3_laboratorium_kerang_bambu.png"),
        (r"d:\dita-metaverse\ss\fix_misi3_opened_via_e.png", "prototype_4_alur_misi_interaktif.png"),
    ]
    for src, name in module_files:
        if os.path.exists(src):
            img = Image.open(src)
            img.save(os.path.join(r"d:\dita-metaverse\ss", name), format="PNG")
            img.save(os.path.join(r"C:\Users\Toshiba\.gemini\antigravity-ide\brain\8b761e84-44db-40a9-a53f-4607314b34f7", name), format="PNG")
            print(f"[OK] Saved module prototype: {name}")

    # Convert showcase concept jpg to png if available
    jpg_src = r"d:\dita-metaverse\ss\prototype_concept_showcase.png"
    if os.path.exists(jpg_src):
        print("[OK] Verified prototype_concept_showcase.png")

def build_infographic_board():
    print("\n3. Building Ecoseaverse Infographic Prototype Board (dithod format)...")
    import math
    dithod_path = r"d:\dita-metaverse\dithod.png"
    if not os.path.exists(dithod_path):
        print("[Skip] dithod.png not found")
        return

    im = Image.open(dithod_path).convert('RGBA')

    # 1. Update Header Logo
    bg_patch = Image.new('RGBA', (410, 60))
    draw_bg = ImageDraw.Draw(bg_patch)
    for y in range(60):
        factor = y / 60.0
        r = int(237 + factor * 2)
        g = int(249 + factor * 1)
        b = int(253 + factor * 2)
        draw_bg.line([(0, y), (410, y)], fill=(r, g, b, 255))
    im.paste(bg_patch, (55, 8))

    scale = 4
    font_path = r'C:\Windows\Fonts\ARLRDBD.TTF' if os.path.exists(r'C:\Windows\Fonts\ARLRDBD.TTF') else 'arialbd.ttf'
    font_hi = ImageFont.truetype(font_path, 54 * scale)

    # Eco
    mask_eco = Image.new('L', (400 * scale, 80 * scale), 0)
    d_m_eco = ImageDraw.Draw(mask_eco)
    d_m_eco.text((0, 0), 'Eco', fill=255, font=font_hi)
    bb_e = mask_eco.getbbox()
    mask_eco = mask_eco.crop((0, 0, bb_e[2] + 4 * scale, bb_e[3] + 4 * scale))

    grad_eco = Image.new('RGBA', mask_eco.size)
    for y in range(mask_eco.size[1]):
        f = y / mask_eco.size[1]
        r = int(48 * (1-f) + 26 * f)
        g = int(128 * (1-f) + 86 * f)
        b = int(52 * (1-f) + 38 * f)
        for x in range(mask_eco.size[0]):
            grad_eco.putpixel((x, y), (r, g, b, 255))
    grad_eco.putalpha(mask_eco)
    grad_eco = grad_eco.resize((mask_eco.size[0] // scale, mask_eco.size[1] // scale), Image.Resampling.LANCZOS)

    # seaverse
    mask_g = Image.new('L', (400 * scale, 80 * scale), 0)
    d_m_g = ImageDraw.Draw(mask_g)
    d_m_g.text((0, 0), 'seaverse', fill=255, font=font_hi)
    bb_g = mask_g.getbbox()
    mask_g = mask_g.crop((0, 0, bb_g[2] + 4 * scale, bb_g[3] + 4 * scale))

    grad_g = Image.new('RGBA', mask_g.size)
    for y in range(mask_g.size[1]):
        f = y / mask_eco.size[1]
        r = int(18 * (1-f) + 8 * f)
        g = int(98 * (1-f) + 60 * f)
        b = int(195 * (1-f) + 145 * f)
        for x in range(mask_g.size[0]):
            grad_g.putpixel((x, y), (r, g, b, 255))
    grad_g.putalpha(mask_g)
    grad_g = grad_g.resize((mask_g.size[0] // scale, mask_g.size[1] // scale), Image.Resampling.LANCZOS)

    start_x, start_y = 58, 10
    shadow_eco = Image.new('RGBA', grad_eco.size, (10, 40, 20, 80))
    shadow_eco.putalpha(grad_eco.split()[3])
    shadow_eco = shadow_eco.filter(ImageFilter.GaussianBlur(1))

    shadow_g = Image.new('RGBA', grad_g.size, (6, 30, 70, 80))
    shadow_g.putalpha(grad_g.split()[3])
    shadow_g = shadow_g.filter(ImageFilter.GaussianBlur(1))

    im.alpha_composite(shadow_eco, (start_x + 2, start_y + 2))
    im.alpha_composite(grad_eco, (start_x, start_y))

    guard_x = start_x + grad_eco.size[0] + 2
    im.alpha_composite(shadow_g, (guard_x + 2, start_y + 2))
    im.alpha_composite(grad_g, (guard_x, start_y))

    # 2. Update Arch in Mission 1
    crop = im.crop((45, 220, 175, 275))
    w, h = crop.size
    cx, cy = 65, 134
    r_top, r_bot = 135.5, 111.5
    cx_s, cy_s = cx * scale, cy * scale
    r_top_s, r_bot_s = r_top * scale, r_bot * scale

    plate = Image.new('RGBA', (w * scale, h * scale), (0,0,0,0))
    d_p = ImageDraw.Draw(plate)
    pts = []
    for deg in range(-28, 29):
        rad = math.radians(deg)
        pts.append((cx_s + r_top_s * math.sin(rad), cy_s - r_top_s * math.cos(rad)))
    for deg in range(28, -29, -1):
        rad = math.radians(deg)
        pts.append((cx_s + r_bot_s * math.sin(rad), cy_s - r_bot_s * math.cos(rad)))
    d_p.polygon(pts, fill=(26, 88, 36, 255), outline=(92, 168, 96, 255), width=int(1.8 * scale))

    word = 'ECOSEAVERSE'
    font_size = 11.5 * scale
    font_hi_arch = ImageFont.truetype(font_path, int(font_size))
    widths = [font_hi_arch.getbbox(c)[2] - font_hi_arch.getbbox(c)[0] + 1.2 * scale for c in word]
    total_w = sum(widths)
    total_angle = 45.0
    curr_w = 0
    angles = []
    for w_char in widths:
        mid_w = curr_w + w_char / 2.0
        ang = -total_angle / 2.0 + (mid_w / total_w) * total_angle
        angles.append(ang)
        curr_w += w_char

    r_text = (r_top_s + r_bot_s) / 2.0 - 0.5 * scale
    for char, ang in zip(word, angles):
        rad = math.radians(ang)
        tx = cx_s + r_text * math.sin(rad)
        ty = cy_s - r_text * math.cos(rad)
        l_img = Image.new('RGBA', (28 * scale, 28 * scale), (0,0,0,0))
        d_l = ImageDraw.Draw(l_img)
        for ox in [-scale, 0, scale]:
            for oy in [-scale, 0, scale]:
                d_l.text((14 * scale + ox, 14 * scale + oy), char, font=font_hi_arch, fill=(12, 48, 18, 255), anchor='mm')
        d_l.text((14 * scale, 14 * scale), char, font=font_hi_arch, fill=(255, 255, 255, 255), anchor='mm')
        l_rot = l_img.rotate(-ang, expand=True, resample=Image.Resampling.BICUBIC)
        plate.alpha_composite(l_rot, (int(tx - l_rot.size[0] / 2), int(ty - l_rot.size[1] / 2)))

    plate_down = plate.resize((w, h), Image.Resampling.LANCZOS)
    crop.alpha_composite(plate_down, (0, 0))
    im.paste(crop, (45, 220))

    out1 = r'd:\dita-metaverse\dithod_ecoseaverse.png'
    out2 = r'd:\dita-metaverse\ss\prototype_ecoseaverse_infografis.png'
    im.convert('RGB').save(out1, quality=95)
    im.convert('RGB').save(out2, quality=95)
    print(f"[OK] Infographic board saved to:\n  - {out1}\n  - {out2}")

if __name__ == '__main__':
    if not os.path.exists(r'd:\dita-metaverse\ss\prototype_clam_modal.png'):
        capture_clam_modal()
    build_prototype_board()
    build_infographic_board()
