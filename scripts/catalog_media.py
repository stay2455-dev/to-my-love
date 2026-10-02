"""Read original capture dates without renaming or altering source media."""
from __future__ import annotations
import csv
import hashlib
import json
import math
import re
import struct
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '사진'
PLAN = ROOT / 'planning'
KST = timezone(timedelta(hours=9))

def mp4_date(path):
    """Read the movie header date; never substitute transfer/file timestamps."""
    with path.open('rb') as f:
        length = path.stat().st_size
        def atoms(start, end):
            pos = start
            while pos + 8 <= end:
                f.seek(pos)
                size, kind = struct.unpack('>I4s', f.read(8))
                header = 8
                if size == 1:
                    size = struct.unpack('>Q', f.read(8))[0]
                    header = 16
                if size == 0: size = end - pos
                if size < header or pos + size > end: break
                if kind == b'moov':
                    value = atoms(pos + header, pos + size)
                    if value: return value
                if kind == b'mvhd':
                    f.seek(pos + header)
                    version = f.read(4)[0]
                    seconds = struct.unpack('>Q' if version == 1 else '>I', f.read(8 if version == 1 else 4))[0]
                    if seconds:
                        date = datetime(1904, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=seconds)
                        if 2000 <= date.year <= 2026: return date.astimezone(KST).isoformat()
                pos += size
        return atoms(0, length)

def catalog():
    items=[]
    for p in sorted(SOURCE.rglob('*')):
        if not p.is_file() or p.suffix.lower() not in ['.jpg','.jpeg','.png','.mp4']: continue
        digest=hashlib.sha256(p.read_bytes()).hexdigest()
        item={'id':digest[:12], 'source':p.relative_to(ROOT).as_posix(), 'bytes':p.stat().st_size,
              'kind':'video' if p.suffix.lower()=='.mp4' else 'image', 'date':None, 'dateSource':None}
        if item['kind']=='image':
            with Image.open(p) as im:
                exif=im.getexif()
                details=exif.get_ifd(34665)
                raw=details.get(36867)
                if raw:
                    try:
                        date=datetime.strptime(str(raw)[:19], '%Y:%m:%d %H:%M:%S')
                        if 2000<=date.year<=2026:
                            item['date']=date.isoformat()
                            item['dateSource']='EXIF DateTimeOriginal'
                            item['offset']=str(details.get(36881,'')) or None
                    except ValueError: pass
                corrected=ImageOps.exif_transpose(im)
                item['width'],item['height']=corrected.size
                item['hasGps']=34853 in exif
                item['exifTextDates']={str(k):str(v) for k,v in {**dict(exif),**details}.items() if k in [306,36867,36868]}
        else:
            item['date']=mp4_date(p)
            item['dateSource']='QuickTime movie creation (UTC to Korea)' if item['date'] else None
        items.append(item)
    items.sort(key=lambda x:(x['date'] or '9999',x['source']))
    for i,item in enumerate(items,1):item['number']=i
    PLAN.mkdir(exist_ok=True)
    (PLAN/'media-inventory.json').write_text(json.dumps(items,ensure_ascii=False,indent=2),encoding='utf-8')
    with (PLAN/'촬영일-분류표.csv').open('w',newline='',encoding='utf-8-sig') as f:
        writer=csv.writer(f)
        writer.writerow(['번호','파일','종류','촬영일 또는 영상기록일','날짜 근거','확인 상태','식별자'])
        for x in items:writer.writerow([x['number'],x['source'],x['kind'],x['date'] or '',x['dateSource'] or '', '메타데이터 확인' if x['date'] else '촬영일 확인 필요',x['id']])
    print(json.dumps({'count':len(items),'dated':sum(bool(x['date']) for x in items),'undated':[{k:x.get(k) for k in ['number','source','width','height','exifTextDates']} for x in items if not x['date']], 'range':[next((x['date'] for x in items if x['date']),None),next((x['date'] for x in reversed(items) if x['date']),None)],'months':dict(sorted(Counter(x['date'][:7] if x['date'] else 'unknown' for x in items).items())),'duplicates':[k for k,v in Counter(x['id'] for x in items).items() if v>1]},ensure_ascii=False,indent=2))
    return items

def contact_sheets(items):
    images=[x for x in items if x['kind']=='image']
    font=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',17)
    (PLAN/'contact-sheets').mkdir(exist_ok=True)
    for page in range(math.ceil(len(images)/30)):
        group=images[page*30:(page+1)*30]
        sheet=Image.new('RGB',(1500,6*216+45),'#f6f2ea')
        draw=ImageDraw.Draw(sheet)
        draw.text((14,10),f'Chronological contact sheet {page+1} / {math.ceil(len(images)/30)}',fill='#35312c',font=font)
        for i,x in enumerate(group):
            cx=(i%5)*300;cy=(i//5)*216+40
            with Image.open(ROOT/x['source']) as im:
                im=ImageOps.exif_transpose(im).convert('RGB')
                im.thumbnail((282,175))
                sheet.paste(im,(cx+(300-im.width)//2,cy+(175-im.height)//2))
            draw.text((cx+10,cy+178),f"{x['number']:03d}  {(x['date'] or 'DATE UNKNOWN')[:10]}  {x['id'][:4]}",fill='#35312c',font=font)
        sheet.save(PLAN/'contact-sheets'/f'sheet-{page+1:02d}.jpg',quality=90)

if __name__=='__main__':
    contact_sheets(catalog())
