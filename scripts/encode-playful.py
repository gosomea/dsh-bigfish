#!/usr/bin/env python3
"""Encode a pet-only GIF from capture-playful.mjs keyframe samples."""
import argparse
import json
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('capture_dir', type=Path)
parser.add_argument('--output', type=Path, default=Path('docs/media'))
args = parser.parse_args()
samples = json.loads((args.capture_dir / 'samples.json').read_text())
frames = []
for sample in samples:
    image = Image.open(sample['file']).convert('RGB')
    # The empty rope compartment is absent from the asset preview.
    left = round(image.width * 90 / 280)
    frames.append(image.crop((left, 0, image.width, image.height)).resize((285, 310), Image.Resampling.LANCZOS))
args.output.mkdir(parents=True, exist_ok=True)
frames[0].save(args.output / 'playful-motions.gif', save_all=True, append_images=frames[1:],
               duration=[s['durationMs'] for s in samples], loop=0, optimize=True)
frames[3].save(args.output / 'playful-sign.png')
