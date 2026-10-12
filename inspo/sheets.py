"""Contact sheets for tagging: thumbnails of inspo blocks laid out in numbered
grids, so a vision pass can describe sixteen blocks per image.

    python3 inspo/sheets.py mine channel:<slug>   # my blocks and one channel
    python3 inspo/sheets.py next:160              # the next 160 without tags
    python3 inspo/sheets.py next:all batch:25     # everything left, 25 sheets a folder

Writes inspo/.work/sheet-0001.png … and a manifest (sheet -> tile -> block id)
to inspo/.work/manifest.json. Blocks already in inspo/tags.json are skipped.
"""
import base64, json, sys, io, subprocess, concurrent.futures as cf
from pathlib import Path
from PIL import Image, ImageDraw, ImageFile, ImageFont
ImageFile.LOAD_TRUNCATED_IMAGES = True  # GIFs are fetched cut short on purpose

ROOT = Path(__file__).parent
WORK = ROOT / '.work'
GRID, TILE, PAD = 4, 256, 6

TALL = 1.6  # taller than this (height / width) and only the top is shown

def image_url(key, size=TILE, width_only=False):
    resize = {'width': size, 'withoutEnlargement': True} if width_only else {'width': size, 'height': size, 'fit': 'inside', 'withoutEnlargement': True}
    spec = {'bucket': 'arena_images', 'key': key, 'edits': {'resize': resize, 'webp': {'quality': 75}, 'jpeg': {'quality': 75}, 'rotate': None}}
    return 'https://images.are.na/' + base64.b64encode(json.dumps(spec, separators=(',', ':')).encode()).decode()

def fetch(block):
    # curl rather than urllib: python.org builds on macOS ship without the
    # system certificates, and every HTTPS request fails verification.
    # A full-page screenshot fit into a square is a sliver nobody can read.
    # Fetch it at full tile width instead, and keep the top.
    tall = block.get('w') and block['h'] / block['w'] > TALL
    # Are.na's resizer turns an animated GIF into every frame stacked in one
    # tall strip, so GIFs come from the original instead, first frame only.
    gif = block['key'].lower().endswith('.gif')
    url = 'https://d2w9rnfcy7mm78.cloudfront.net/' + block['key'] if gif else image_url(block['key'], width_only=tall)
    # The CDN wants a browser-like agent for originals. A GIF's first frame
    # sits at the front of the file, so only the first 400KB is fetched.
    args = ['curl', '-sfL', '--max-time', '60', '-A', 'Mozilla/5.0'] + (['-r', '0-400000'] if gif else []) + [url]
    r = subprocess.run(args, capture_output=True)
    if r.returncode or not r.stdout:
        print('  miss', block['id'], file=sys.stderr)
        return None
    try:
        im = Image.open(io.BytesIO(r.stdout))
        im.seek(0)
        im = im.convert('RGB')
        if tall and not gif:
            # Very narrow ones are animation strips, frames stacked top to
            # bottom: the first square is the first frame.
            keep = im.width if block['h'] / block['w'] > 4 else int(im.width * TALL)
            im = im.crop((0, 0, im.width, min(im.height, keep)))
        if max(im.size) < TILE:
            # Small art (icons, sprites) is blown up, hard-edged, to fill the tile.
            k = TILE / max(im.size)
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.NEAREST)
        return im
    except Exception:
        print('  miss', block['id'], 'not an image', file=sys.stderr)
        return None

def main():
    data = json.loads((ROOT / 'blocks.json').read_text())
    tags_path = ROOT / 'tags.json'
    tags = json.loads(tags_path.read_text()) if tags_path.exists() else {}
    blocks = [b for b in data['blocks'] if str(b['id']) not in tags]
    # any mix of: mine, channel:<slug>, next:<n>  (default next:160)
    picks = sys.argv[1:] or ['next:160']
    chosen, seen = [], set()
    for pick in picks:
        if pick == 'mine':
            group = [b for b in blocks if b.get('mine')]
        elif pick.startswith('channel:'):
            group = [b for b in blocks if pick[8:] in b['ch']]
        elif pick.startswith('next:'):
            group = blocks if pick[5:] == 'all' else blocks[: int(pick[5:])]
        elif pick.startswith('batch:'):
            continue
        else:
            sys.exit(f'unknown pick {pick}')
        for b in group:
            if b['id'] not in seen:
                seen.add(b['id']); chosen.append(b)
    blocks = chosen
    # batch:<n> puts every n sheets in their own folder, .work/batch-001/ …,
    # each with its own manifest, so parallel taggers can't collide.
    batch = next((int(p[6:]) for p in picks if p.startswith('batch:')), 0)
    WORK.mkdir(exist_ok=True)
    for old in WORK.glob('sheet-*.png'):
        old.unlink()
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 30)
    per = GRID * GRID
    manifests = {}
    done = 0
    # download and lay out in chunks so memory stays flat on big runs
    chunk = per * 40
    sheet_no = 0
    for c0 in range(0, len(blocks), chunk):
        part = blocks[c0:c0 + chunk]
        with cf.ThreadPoolExecutor(48) as pool:
            imgs = list(pool.map(fetch, part))
        pairs = [(b, im) for b, im in zip(part, imgs) if im]
        for s0 in range(0, len(pairs), per):
            sheet_no += 1
            folder = WORK / f'batch-{(sheet_no - 1) // batch + 1:03d}' if batch else WORK
            folder.mkdir(exist_ok=True)
            name = f'sheet-{sheet_no:04d}'
            size = GRID * TILE + (GRID + 1) * PAD
            sheet = Image.new('RGB', (size, size), (40, 40, 40))
            draw = ImageDraw.Draw(sheet)
            m = manifests.setdefault(folder, {})
            m[name] = {}
            for t, (b, im) in enumerate(pairs[s0:s0 + per], 1):
                im.thumbnail((TILE, TILE))
                x = PAD + ((t - 1) % GRID) * (TILE + PAD)
                y = PAD + ((t - 1) // GRID) * (TILE + PAD)
                sheet.paste(im, (x + (TILE - im.width) // 2, y + (TILE - im.height) // 2))
                draw.rectangle([x, y, x + 40, y + 34], fill=(255, 230, 0))
                draw.text((x + 5, y + 1), str(t), fill=(0, 0, 0), font=font)
                m[name][t] = b['id']
            sheet.save(folder / f'{name}.png')
            # a batch folder is finished once it holds its last sheet: write
            # its manifest now so tagging can start while the rest builds
            if batch and sheet_no % batch == 0:
                (folder / 'manifest.json').write_text(json.dumps(m))
                print(f'  ready {folder.name}', flush=True)
        done += len(pairs)
        print(f'  {done} / {len(blocks)}', flush=True)
    for folder, m in manifests.items():
        (folder / 'manifest.json').write_text(json.dumps(m))
    print(f'{done} blocks on {sheet_no} sheets in {len(manifests)} folder(s)')

main()
