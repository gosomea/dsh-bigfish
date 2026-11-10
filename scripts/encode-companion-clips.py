"""Encode display WebP with lossless alpha; preserve original PNGs for art review."""
from pathlib import Path
from PIL import Image, ImageChops
import json
root = Path(__file__).resolve().parents[1]
rows = json.loads((root / 'assets/intelligent-pet/catalog.json').read_text())
original = encoded = count = 0
for row in rows:
    source = root / 'assets/intelligent-pet' / row['file']
    if not source.exists():
        continue
    target = source.with_suffix('.webp')
    if True:
        with Image.open(source) as image:
            rgba = image.convert('RGBA')
            rgba.save(target, format='WEBP', quality=90, method=6, exact=True)
            with Image.open(target) as converted:
                result = converted.convert('RGBA')
                if ImageChops.difference(rgba.getchannel('A'), result.getchannel('A')).getbbox():
                    raise RuntimeError(f'WebP changed alpha: {row["id"]}')
    original += source.stat().st_size
    encoded += target.stat().st_size
    count += 1
print(json.dumps({'sequences': count, 'pngBytes': original, 'webpBytes': encoded, 'encoding': 'WebP quality 90, exact alpha verified; originals preserved'}, ensure_ascii=False))
