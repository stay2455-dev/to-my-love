"""Publish optimized copies of completed keepsakes; leave source work untouched."""
import hashlib
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'planning/runtime'))
import imageio_ffmpeg

OUT = ROOT / 'assets/keepsakes'
SOURCES = [
    ('together', 'proposal-montage-hero-v1.png', '우리', '바다와 놀이공원, 함께 지나온 계절의 사진'),
    ('seaside', 'montage-seaside-v1.png', '바다 곁에서', '노을 진 바다 앞에서 함께 찍은 사진'),
    ('carousel', 'montage-carousel-v1.png', '반짝이던 밤', '회전목마와 불빛 아래에서 함께 찍은 사진'),
    ('seasons', 'montage-seasons-v1.png', '같은 계절', '나무와 폭포, 햇빛이 비치는 길에서 함께 찍은 사진'),
    ('spring', 'montage-spring-v1.png', '우리의 봄', '벚꽃과 사진관, 분홍빛 옷을 입고 함께 찍은 사진'),
]
FILMS = [
    ('promise-174', '너의_행복을_약속할게_본편_2분54초_공유용_720p.mp4', '너의 행복을 약속할게.', 174, 44),
    ('our-days', '우리의_모든_날들_시간순_1080p.mp4', '우리의 모든 날들', 510, 57),
]
CREDIT = ('Piano samples: Salamander Grand Piano V3, Alexander Holm, CC BY 3.0; '
          'https://github.com/sfzinstruments/SalamanderGrandPiano ; '
          'https://creativecommons.org/licenses/by/3.0/ . '
          'Resampled, mixed, equalized and reverberated. '
          'Strings: VSCO 2 CE, Versilian Studios (Sam Gossner, Simon Dalzell; '
          'sample cutting Elan Hickler/Soundemote), CC0 1.0; '
          'https://github.com/sgossner/VSCO-2-CE . '
          'Full attribution: https://stay2455-dev.github.io/to-my-love/assets/keepsakes/music-credits.txt')

def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def image_copies(entry):
    id, filename, title, alt = entry
    source = ROOT / 'assets/images' / filename
    before = checksum(source)
    with Image.open(source) as original:
        im = ImageOps.exif_transpose(original).convert('RGB')
        dimensions = im.size
        for suffix, edge, quality in [('', 2048, 88), ('-small', 720, 80)]:
            copy = im.copy()
            copy.thumbnail((edge, edge), Image.Resampling.LANCZOS)
            clean = Image.new('RGB', copy.size)
            clean.paste(copy)
            clean.save(OUT / f'{id}{suffix}.webp', 'WEBP', quality=quality, method=6)
    assert checksum(source) == before
    return dict(id=id, title=title, alt=alt, src=f'assets/keepsakes/{id}.webp',
                thumb=f'assets/keepsakes/{id}-small.webp', width=dimensions[0], height=dimensions[1])

def film_copy(entry):
    id, filename, title, duration, poster_time = entry
    source = ROOT / '결과물' / filename
    before = checksum(source)
    dest = OUT / f'{id}.mp4'
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    if not dest.exists():
        encoding = ['-c', 'copy'] if id == 'promise-174' else [
            '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium',
            '-crf', '24', '-maxrate', '1600k', '-bufsize', '3200k', '-threads', '2',
            '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709',
            '-colorspace', 'bt709', '-c:a', 'aac', '-b:a', '160k']
        subprocess.run([ffmpeg, '-y', '-v', 'error', '-nostdin', '-i', str(source),
                        '-map', '0:v:0', '-map', '0:a:0', '-map_metadata', '-1', '-map_chapters', '-1',
                        *encoding,
                        '-metadata', f'title={title}', '-metadata', f'copyright={CREDIT}',
                        '-movflags', '+faststart', str(dest)], check=True)
    assert dest.stat().st_size < 100 * 1024 * 1024
    subprocess.run([ffmpeg, '-y', '-v', 'error', '-ss', str(poster_time), '-i', str(source),
                    '-frames:v', '1', '-vf', 'scale=1280:720', '-c:v', 'libwebp',
                    '-quality', '85', str(OUT / f'{id}-poster.webp')], check=True)
    assert checksum(source) == before
    raw = dest.read_bytes()
    assert raw.index(b'moov') < raw.index(b'mdat')
    print(f'{id}: {dest.stat().st_size / 1024 / 1024:.1f} MB; original preserved', flush=True)
    return dict(id=id, title=title, duration=duration, src=f'assets/keepsakes/{id}.mp4',
                poster=f'assets/keepsakes/{id}-poster.webp')

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    montages = [image_copies(entry) for entry in SOURCES]
    with ThreadPoolExecutor(max_workers=2) as pool:
        films = list(pool.map(film_copy, FILMS))
    (ROOT / 'data/keepsakes.json').write_text(json.dumps(dict(montages=montages, films=films),
                                           ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Five keepsakes and two films ready.', flush=True)

if __name__ == '__main__':
    main()
