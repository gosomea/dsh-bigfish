"""Find frame source rectangles from alpha components; never alter generated pixels."""
from pathlib import Path
import json
from PIL import Image
root=Path(__file__).resolve().parents[1]
rows=json.loads((root/'assets/intelligent-pet/catalog.json').read_text())
result={}
for row in rows:
    if row['id']=='lie-down':
        boxes=[(12,10,454,512),(454,125,879,515),(890,142,1328,515),(1328,170,1774,518),(8,550,449,878),(449,580,884,878),(884,580,1329,878),(1329,590,1774,878)]
        result[row['id']]=[dict(x=x,y=y,width=x2-x,height=y2-y) for x,y,x2,y2 in boxes];continue
    with Image.open(root/'assets/intelligent-pet'/row['file']) as im:
        w,h=im.size;mask=im.getchannel('A').tobytes().translate(bytes(1 if value>=64 else 0 for value in range(256)))
    parents=[];boxes=[];areas=[]
    def find(a):
        while parents[a]!=a:
            parents[a]=parents[parents[a]];a=parents[a]
        return a
    def union(a,b):
        a=find(a);b=find(b)
        if a!=b:parents[b]=a
    previous=[]
    for y in range(h):
        line=mask[y*w:(y+1)*w]+b'\x00';runs=[];position=0
        while position<w:
            x=line.find(b'\x01',position)
            if x<0:break
            end=line.find(b'\x00',x);runs.append((x,end));position=end
        current=[];j=0
        for x,end in runs:
            label=len(parents);parents.append(label);boxes.append((x,y,end,y+1));areas.append(end-x);current.append((x,end,label))
            while j<len(previous) and previous[j][1]<x:j+=1
            k=j
            while k<len(previous) and previous[k][0]<=end:
                union(label,previous[k][2]);k+=1
        previous=current
    components={}
    for label,(x,y,x2,y2) in enumerate(boxes):
        key=find(label)
        if key not in components:components[key]=[x,y,x2,y2,areas[label]]
        else:
            b=components[key];b[0]=min(b[0],x);b[1]=min(b[1],y);b[2]=max(b[2],x2);b[3]=max(b[3],y2);b[4]+=areas[label]
    largest=sorted(components.items(),key=lambda item:item[1][4],reverse=True)[:8]
    if len(largest)!=8:
        raise RuntimeError(f'{row["id"]}: expected eight distinct characters')
    ordered=sorted(largest,key=lambda item:(int((item[1][1]+item[1][3])/2>=h/2),(item[1][0]+item[1][2])/2))
    if sum((b[1]+b[3])/2<h/2 for _,b in ordered)!=4:
        raise RuntimeError(f'{row["id"]}: ambiguous row grouping')
    bounds=[b[:4] for _,b in ordered];primary={key for key,_ in ordered}
    for key,b in components.items():
        if key in primary or b[4]<300:continue
        cx,cy=(b[0]+b[2])/2,(b[1]+b[3])/2
        distances=[((cx-(m[0]+m[2])/2)/(w/4))**2+((cy-(m[1]+m[3])/2)/(h/2))**2 for _,m in ordered]
        i=min(range(8),key=lambda i:distances[i])
        if distances[i]>.55:continue
        a=bounds[i];a[0]=min(a[0],b[0]);a[1]=min(a[1],b[1]);a[2]=max(a[2],b[2]);a[3]=max(a[3],b[3])
    result[row['id']]=[dict(x=max(0,x-2),y=max(0,y-2),width=min(w,x2+2)-max(0,x-2),height=min(h,y2+2)-max(0,y-2)) for x,y,x2,y2 in bounds]
(root/'assets/intelligent-pet/frame-bounds.json').write_text(json.dumps(result,indent=2)+'\n')
print(f'Extracted 8 full-figure source rectangles for {len(result)} sequences. Original pixels preserved.')
