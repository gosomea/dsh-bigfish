#!/usr/bin/env python3
"""Assemble existing RGBA frames only. Does not generate or edit character art."""
import argparse, json, math
from pathlib import Path
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('frames',help='JSON ordered list of image paths');p.add_argument('output');p.add_argument('--width',type=int,required=True);p.add_argument('--height',type=int,required=True);p.add_argument('--columns',type=int,default=8);a=p.parse_args()
paths=json.loads(Path(a.frames).read_text());assert paths and a.width>0 and a.height>0 and a.columns>0
canvas=Image.new('RGBA',(a.width*a.columns,a.height*math.ceil(len(paths)/a.columns)));rects=[]
for i,path in enumerate(paths):
    im=Image.open(Path(a.frames).parent/path).convert('RGBA');im.thumbnail((a.width,a.height),Image.Resampling.LANCZOS)
    x=(i%a.columns)*a.width;y=(i//a.columns)*a.height
    canvas.alpha_composite(im,(x+(a.width-im.width)//2,y+a.height-im.height));rects.append([x,y,a.width,a.height])
canvas.save(a.output);Path(a.output+'.rects.json').write_text(json.dumps(rects));print(json.dumps({'frames':len(paths),'width':canvas.width,'height':canvas.height}))
