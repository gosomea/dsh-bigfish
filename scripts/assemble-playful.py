#!/usr/bin/env python3
"""Extract already-generated action strips into aligned, bounded .dshpet resources.

No poses are synthesized: the 72 sequences come from 24 generated source sheets.
The five base fallbacks reuse established art and are counted separately.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CELL = 256

def aligned_row(cells):
    boxes = [im.getchannel('A').point(lambda a: 255 if a > 32 else 0).getbbox() for im in cells]
    if any(box is None for box in boxes):
        raise ValueError('Empty generated cell')
    scale = min((CELL - 20) / max(box[2]-box[0] for box in boxes),
                (CELL - 20) / max(box[3]-box[1] for box in boxes))
    output = []
    for image, box in zip(cells, boxes):
        crop = image.crop(box)
        size = (max(1, round(crop.width*scale)), max(1, round(crop.height*scale)))
        crop = crop.resize(size, Image.Resampling.LANCZOS)
        frame = Image.new('RGBA', (CELL, CELL))
        frame.alpha_composite(crop, ((CELL-size[0])//2, CELL-10-size[1]))
        output.append(frame)
    return output

def sign_rect(im):
    """Largest inset cream rectangle; never put runtime lettering across hands or faces."""
    pixels=im.load();heights=[0]*CELL;best=None
    for y in range(105,202):
        for x in range(CELL):
            r,g,b,a=pixels[x,y]
            cream=34<=x<222 and a>180 and r>210 and g>200 and b>165 and r>=b+3 and r-g<22 and g-b<30
            heights[x]=heights[x]+1 if cream else 0
        stack=[]
        for x in range(CELL+1):
            h=heights[x] if x<CELL else 0;left=x
            while stack and stack[-1][1]>h:
                begin,height=stack.pop();width=x-begin
                if width>=42 and height>=16 and (best is None or width*height>best[0]):best=(width*height,begin,y-height+1,width,height)
                left=begin
            if not stack or stack[-1][1]<h:stack.append((left,h))
    if best is None:return None
    _,x,y,w,h=best
    return dict(x=x+4,y=y+3,width=w-8,height=h-6,angle=0)

def seams(image, parts, axis):
    alpha=image.getchannel('A').point(lambda a:255 if a>32 else 0)
    extent=image.height if axis=='y' else image.width
    result=[0]
    for part in range(1,parts):
        center=round(extent*part/parts);radius=round(extent/parts*.18)
        candidates=[]
        for pos in range(max(result[-1]+1,center-radius),min(extent,center+radius)+1):
            strip=alpha.crop((0,pos,image.width,pos+1) if axis=='y' else (pos,0,pos+1,image.height))
            candidates.append((strip.histogram()[255],abs(pos-center),pos))
        result.append(min(candidates)[2])
    return result+[extent]

def assemble(partial=False):
    actions=json.loads((ROOT/'assets/expansion/actions.json').read_text())
    out=ROOT/'examples/bigfish-playful';out.mkdir(parents=True,exist_ok=True)
    assets={};animations=[];dialogue={};sources=[];contacts=[]
    for sheet in range(1,25):
        source=ROOT/f'assets/expansion/source/sheet-{sheet:02}.png'
        if not source.exists():
            if partial:continue
            raise FileNotFoundError(source)
        im=Image.open(source).convert('RGBA')
        if im.getchannel('A').getextrema()[0]!=0:raise ValueError(f'{source} is not transparent')
        atlas=Image.new('RGBA',(6*CELL,3*CELL))
        ys=seams(im,3,'y')
        for row in range(3):
            row_image=im.crop((0,ys[row],im.width,ys[row+1]))
            xs=seams(row_image,6,'x')
            action=actions[(sheet-1)*3+row]
            cells=[row_image.crop((xs[col],0,xs[col+1],row_image.height)) for col in range(6)]
            frames=aligned_row(cells)
            for col,frame in enumerate(frames):atlas.alpha_composite(frame,(col*CELL,row*CELL))
            # Intro, two display poses, exit. holdFrame adapts the display to 5–30 s.
            timings=[450,550,600,4800,1800,700] if action['tags'][0]=='greeting' else [550,650,650,900,1200,850]
            if action['tags'][0]=='near-miss':timings=[140,180,220,220,180,220]
            refs=[]
            for col,frame in enumerate(frames):
                f=dict(asset=f'sheet{sheet:02}',rect=[col*CELL,row*CELL,CELL,CELL],durationMs=timings[col])
                if action['family']=='sign' and col in [3,4]:
                    rect=sign_rect(frame)
                    if rect:f['sign']=rect
                refs.append(f)
            a=dict(id=action['id'],label=action['label'],tags=action['tags'],intensity=action['intensity'],loop=action['loop'],weight=1,cooldownMs=600000 if action['family']=='easter' else 45000 if action['tags'][0]=='greeting' else 12000,speed=[1,1],family=action['family'],frames=refs)
            if action['tags'][0]=='greeting':a['holdFrame']=3
            animations.append(a)
            if action['lines']:dialogue[a['id']]=action['lines']
            contacts.append((action['code'],frames[3]))
        name=f'sheet-{sheet:02}.webp'
        atlas.save(out/name,'WEBP',quality=95,method=6,exact=True)
        assets[f'sheet{sheet:02}']=dict(path=name,width=atlas.width,height=atlas.height)
        sources.append(dict(sheet=sheet,source=str(source.relative_to(ROOT)),sha256=hashlib.sha256(source.read_bytes()).hexdigest(),poses=18))
    layouts=json.loads((ROOT/'assets/sprites/atlas-layout.json').read_text())
    base=Image.new('RGBA',(4*CELL,5*CELL))
    mappings=[('idle','quiet',[0,1,2,1]),('working','motions',[4,5,6,7]),('attention','quiet',[4,5,6,7]),('success','motions',[13,14,15,15]),('error','classic',[2,4,2,2])]
    files={'classic':'bigfish-atlas.png'}
    for row,(role,asset,indexes) in enumerate(mappings):
        src=Image.open(ROOT/'assets/sprites'/files.get(asset,f'bigfish-{asset}.png')).convert('RGBA')
        cells=[]
        for i in indexes:
            r=layouts[asset]['frames'][i];cells.append(src.crop((r['x'],r['y'],r['x']+r['width'],r['y']+r['height'])))
        frames=aligned_row(cells)
        for col,frame in enumerate(frames):base.alpha_composite(frame,(col*CELL,row*CELL))
        animations.append(dict(id=f'bigfish:base-{role}',label={'idle':'安静眨眼（基础）','working':'稳定打字（基础）','attention':'等待确认（基础）','success':'成功收工（基础）','error':'困惑检查（基础）'}[role],tags=[role],intensity=0,loop=role in ['idle','working'],weight=1,cooldownMs=0,speed=[1,1],frames=[dict(asset='base',rect=[col*CELL,row*CELL,CELL,CELL],durationMs=([2200,130,180,130] if role=='idle' else [600,700,1000,1500])[col]) for col in range(4)]))
    base.save(out/'base.webp','WEBP',lossless=True,method=6)
    assets['base']=dict(path='base.webp',width=base.width,height=base.height)
    base.crop((0,0,CELL,CELL)).save(out/'thumbnail.png')
    dialogue['idle']=['我在这里，随时可以开工～','给你的新点子留个位置！','今天也一起做点有趣的事～','小鲸鱼值班中，有事叫我呀！']
    p=dict(format='dsh-pet',formatVersion=1,id='bigfish-playful',name='大肥鱼 · 趣味版',version='1.0.0',author='Codex / gosomea',description=f'{len(animations)-5} 段六姿态演出：举牌小剧场、尾巴日常、工具专属动作与收工反馈；另含五类基础回退。',canvas=dict(width=CELL,height=CELL),assets=assets,thumbnail='thumbnail.png',animations='animations.json',fallbacks={role:f'bigfish:base-{role}' for role,*_ in mappings},dialogue='dialogue.json',capabilities=(['sign'] if any(any('sign' in f for f in a['frames']) for a in animations) else [])+(['air-swing'] if any('near-miss' in a['tags'] for a in animations) else []))
    for name,value in [('pet.json',p),('animations.json',animations),('dialogue.json',dialogue)]: (out/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    (out/'NOTICE.txt').write_text('Generated with built-in image_gen using original Bigfish sprite art as identity reference. Original reference creator remains unconfirmed; see project NOTICE and docs/asset-provenance.md. Five base fallback sequences reuse established project art.\n')
    pixels=sum(v['width']*v['height'] for v in assets.values())
    size=sum(p.stat().st_size for p in out.iterdir() if p.is_file())
    if pixels>32*1024*1024:raise ValueError(f'Too many decoded pixels: {pixels}')
    if size>32*1024*1024:raise ValueError(f'Package exceeds 32 MiB: {size}')
    report=dict(generatedSequences=len(animations)-5,generatedPoses=(len(animations)-5)*6,reusedFallbackSequences=5,frameReferences=sum(len(a['frames']) for a in animations),pixels=pixels,fileBytes=size,sources=sources,signActions=sum(any('sign' in f for f in a['frames']) for a in animations))
    (ROOT/'assets/expansion/assembly.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    # Contact sheet is QA output, never a runtime resource.
    contact=Image.new('RGBA',(8*CELL,((len(contacts)+7)//8)*CELL),(245,247,252,255))
    for index,(_,frame) in enumerate(contacts):contact.alpha_composite(frame,(index%8*CELL,index//8*CELL))
    contact.save(ROOT/'assets/expansion/contact-sheet.png')
    print(json.dumps({k:v for k,v in report.items() if k!='sources'},ensure_ascii=False,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--partial',action='store_true');args=parser.parse_args();assemble(args.partial)
