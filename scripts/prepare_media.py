"""Build a deduplicated, metadata-free public album; never modify originals.

Requires Pillow and imageio-ffmpeg. Run catalog_media.py first when sources change.
The private inventory and source mapping stay in the ignored planning directory.
"""
from __future__ import annotations

import csv
import io
import json
import re
import subprocess
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageCms, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / 'planning'
OUT = ROOT / 'assets' / 'album'
sys.path.insert(0, str(PLAN / 'runtime'))


def public_image(item):
    stem = item['id']
    full_path = OUT / 'photos' / f'{stem}.webp'
    thumb_path = OUT / 'thumbs' / f'{stem}.webp'
    with Image.open(ROOT / item['source']) as source:
        im = ImageOps.exif_transpose(source)
        profile = source.info.get('icc_profile')
        if profile:
            try:
                im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(profile)),
                                               ImageCms.createProfile('sRGB'), outputMode='RGB')
            except (OSError, ValueError, ImageCms.PyCMSError):
                im = im.convert('RGB')
        else:
            im = im.convert('RGB')
        width, height = im.size
        # New pixel-only images remove EXIF, GPS, XMP, comments and device metadata.
        for path, side, quality in [(full_path, 1800, 86), (thumb_path, 680, 79)]:
            if path.exists():
                continue
            resized = im.copy()
            resized.thumbnail((side, side), Image.Resampling.LANCZOS)
            clean = Image.new('RGB', resized.size)
            clean.paste(resized)
            clean.save(path, 'WEBP', quality=quality, method=5)
    return {
        'id': stem, 'kind': 'image', 'date': item['date'],
        'width': width, 'height': height,
        'src': full_path.relative_to(ROOT).as_posix(),
        'thumb': thumb_path.relative_to(ROOT).as_posix(),
    }


def public_video(item):
    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    src = str(ROOT / item['source'])
    dest = OUT / 'videos' / f"{item['id']}.mp4"
    poster = OUT / 'posters' / f"{item['id']}.webp"
    probe = subprocess.run([ffmpeg, '-hide_banner', '-i', src], capture_output=True, text=True,
                           encoding='utf-8', errors='replace').stderr
    duration_match = re.search(r'Duration: (\d+):(\d+):([\d.]+)', probe)
    duration = 0
    if duration_match:
        h, m, s = map(float, duration_match.groups())
        duration = h * 3600 + m * 60 + s
    if not dest.exists():
        subprocess.run([
            ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', src,
            '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-map_chapters', '-1',
            '-vf', 'scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2',
            '-c:v', 'libx264', '-crf', '23', '-preset', 'medium', '-pix_fmt', 'yuv420p',
            '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
            '-threads', '2', str(dest),
        ], check=True)
    if not poster.exists():
        subprocess.run([
            ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
            '-ss', str(min(1.5, duration / 3)), '-i', str(dest), '-frames:v', '1',
            '-vf', 'scale=960:960:force_original_aspect_ratio=decrease',
            '-map_metadata', '-1', '-c:v', 'libwebp', '-quality', '84', str(poster),
        ], check=True)
    with Image.open(poster) as im:
        width, height = im.size
    print(f"Video ready: {item['id']} ({duration:.1f}s)", flush=True)
    return {
        'id': item['id'], 'kind': 'video', 'date': item['date'],
        'width': width, 'height': height, 'duration': round(duration, 2),
        'src': dest.relative_to(ROOT).as_posix(),
        'thumb': poster.relative_to(ROOT).as_posix(),
    }


def main():
    for directory in ['photos', 'thumbs', 'videos', 'posters']:
        (OUT / directory).mkdir(parents=True, exist_ok=True)
    (ROOT / 'data').mkdir(exist_ok=True)
    originals = json.loads((PLAN / 'media-inventory.json').read_text(encoding='utf-8'))
    overrides = json.loads((ROOT / 'scripts/date-overrides.json').read_text(encoding='utf-8'))
    for item in originals:
        item.update(overrides.get(item['id'], {}))
    unique = {item['id']: item for item in reversed(originals)}
    items = sorted(unique.values(), key=lambda x: (x['date'] or '9999', x['id']))
    photos = [x for x in items if x['kind'] == 'image']
    videos = [x for x in items if x['kind'] == 'video']
    output = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for index, result in enumerate(pool.map(public_image, photos), 1):
            output.append(result)
            if index % 24 == 0:
                print(f'Photos ready: {index}/{len(photos)}', flush=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        output.extend(pool.map(public_video, videos))
    output.sort(key=lambda x: (x['date'] or '9999', x['id']))
    # Public dates intentionally contain no capture time, GPS, source filenames or device details.
    for item in output:
        if item['date']:
            item['date'] = item['date'][:10]
    dates = [x['date'] for x in output if x['date']]
    data = {'title': '우리 사진첩', 'range': [min(dates), max(dates)], 'items': output}
    (ROOT / 'data/memories.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    with (PLAN / '촬영일-분류표.csv').open('w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow(['식별자', '원본 파일', '종류', '촬영일', '날짜 근거', '원본 중복 수', '공개 파일'])
        counts = Counter(x['id'] for x in originals)
        paths = {x['id']: x['src'] for x in output}
        for item in items:
            writer.writerow([item['id'], item['source'], item['kind'], item['date'] or '',
                             item['dateSource'] or '확인 필요', counts[item['id']], paths[item['id']]])
    stats = {
        'originals': len(originals), 'unique': len(items), 'duplicateCopies': len(originals) - len(items),
        'photos': len(photos), 'datedPhotos': sum(bool(x['date']) for x in photos),
        'undatedPhotos': sum(not x['date'] for x in photos), 'videos': len(videos),
        'range': data['range'],
        'publicMegabytes': round(sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file()) / 1024**2, 1),
    }
    (PLAN / 'album-summary.json').write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(stats, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    main()
