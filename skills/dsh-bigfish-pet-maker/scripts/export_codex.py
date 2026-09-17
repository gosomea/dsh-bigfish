#!/usr/bin/env python3
"""Explicit complete DSH→Codex v2 atlas assembly, with no fabricated missing rows."""
import json,sys
from pathlib import Path
from PIL import Image
root,mapping,out=map(Path,sys.argv[1:4]);m=json.loads((root/'pet.json').read_text());actions={a['id']:a for a in json.loads((root/m['animations']).read_text())};mapping=json.loads(mapping.read_text());out.mkdir(parents=True,exist_ok=True)
rows=[('idle',6),('running-right',8),('running-left',8),('waving',4),('jumping',5),('failed',8),('waiting',6),('running',6),('review',6)]
sheet=Image.new('RGBA',(1536,2288))
def cell(key,index):
    if key not in mapping or mapping[key] not in actions:raise ValueError('Missing mapped action: '+key)
    frames=actions[mapping[key]]['frames']
    if index>=len(frames):raise ValueError('Insufficient frames: '+key)
    f=frames[index];x,y,w,h=f['rect']
    if (w,h)!=(192,208):raise ValueError('Codex export needs aligned 192x208 cells')
    path=(root/m['assets'][f['asset']]['path']).resolve()
    if not path.is_relative_to(root.resolve()):raise ValueError('Unsafe image path')
    im=Image.open(path).convert('RGBA');return im.crop((x,y,x+w,y+h))
for row,(key,count) in enumerate(rows):
    for col in range(count):sheet.alpha_composite(cell(key,col),(col*192,row*208))
for i in range(16):sheet.alpha_composite(cell('look-'+str(i),0),((i%8)*192,(9+i//8)*208))
sheet.save(out/'spritesheet.webp',lossless=True);(out/'pet.json').write_text(json.dumps({'id':m['id'],'displayName':m['name'],'description':m['description'],'spriteVersionNumber':2,'spritesheetPath':'spritesheet.webp'},ensure_ascii=False,indent=2));print('Exported complete Codex v2; inspect direction semantics before installation.')
