"""Read-only checks for the web copies of finished films and montages."""
import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'planning/runtime'))
import imageio_ffmpeg

data = json.loads((ROOT / 'data/keepsakes.json').read_text(encoding='utf-8'))
for image in (ROOT / 'assets/keepsakes').glob('*.webp'):
    with Image.open(image) as im:
        assert not im.getexif() and not any(key in im.info for key in ['exif', 'xmp'])
        im.verify()
print('All public keepsake images decode without EXIF/GPS/XMP.', flush=True)

def verify(film):
    path = ROOT / film['src']
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    probe = subprocess.run([ffmpeg, '-hide_banner', '-i', str(path)], capture_output=True,
                           encoding='utf-8', errors='replace').stderr
    match = re.search(r'Duration: (\d+):(\d+):([\d.]+)', probe)
    duration = int(match[1]) * 3600 + int(match[2]) * 60 + float(match[3])
    assert abs(duration - film['duration']) < .1
    assert 'Video: h264' in probe and '1280x720' in probe and 'yuv420p' in probe
    assert 'Audio: aac' in probe and 'stereo' in probe
    assert 'Alexander Holm' in probe and 'CC BY 3.0' in probe
    assert 'creation_time' not in probe and 'location' not in probe.lower()
    raw = path.read_bytes()
    assert raw.index(b'moov') < raw.index(b'mdat')
    if film['id'] == 'promise-174-v2':
        source = ROOT / '결과물/너의_행복을_약속할게_본편_2분54초_자막_공유용_720p.mp4'
        hashes = []
        for target in [source, path]:
            result = subprocess.run([ffmpeg, '-v', 'error', '-i', str(target), '-map', '0:v:0', '-map', '0:a:0',
                                     '-c', 'copy', '-f', 'streamhash', '-hash', 'sha256', '-'],
                                    check=True, capture_output=True, text=True)
            hashes.append(result.stdout)
        assert hashes[0] == hashes[1], 'Completed main film picture and sound must remain bit-identical.'
        previous = ROOT / '결과물/너의_행복을_약속할게_본편_2분54초_공유용_720p.mp4'
        previous_audio = subprocess.run([ffmpeg, '-v', 'error', '-i', str(previous), '-map', '0:a:0',
                                        '-c', 'copy', '-f', 'streamhash', '-hash', 'sha256', '-'],
                                       check=True, capture_output=True, text=True).stdout.strip().split(',')[-1]
        current_audio = hashes[1].strip().splitlines()[-1].split(',')[-1]
        assert previous_audio == current_audio, 'Approved main-film audio must not change.'
        print('174-second film: encoded picture and audio match the completed source exactly.', flush=True)
    subprocess.run([ffmpeg, '-v', 'error', '-nostdin', '-threads', '2', '-i', str(path),
                    '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], check=True, capture_output=True)
    print(f"{film['id']}: all picture/audio decoded, duration {duration}s, faststart and attribution present.", flush=True)

with ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(verify, data['films']))
