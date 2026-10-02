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
    subprocess.run([ffmpeg, '-v', 'error', '-nostdin', '-threads', '2', '-i', str(path),
                    '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], check=True, capture_output=True)
    print(f"{film['id']}: all picture/audio decoded, duration {duration}s, faststart and attribution present.", flush=True)

with ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(verify, data['films']))
