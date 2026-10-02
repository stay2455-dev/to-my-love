"""Read-only pre-deployment checks for original integrity and public media."""
import hashlib
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'planning/runtime'))
import imageio_ffmpeg

inventory = json.loads((ROOT / 'planning/media-inventory.json').read_text(encoding='utf-8'))
album = json.loads((ROOT / 'data/memories.json').read_text(encoding='utf-8'))
overrides = json.loads((ROOT / 'scripts/date-overrides.json').read_text(encoding='utf-8'))
originals = {x['id']: x for x in inventory}

for item in inventory:
    assert hashlib.sha256((ROOT / item['source']).read_bytes()).hexdigest()[:12] == item['id'], item['source']
print(f'Original files unchanged: {len(inventory)}', flush=True)

for item in album['items']:
    original = originals[item['id']]
    expected = overrides.get(item['id'], {}).get('date', original['date'])
    assert item['date'] == (expected[:10] if expected else None), item['id']
    for key in ['src', 'thumb']:
        file = ROOT / item[key]
        assert file.is_file() and file.stat().st_size > 100, file
        if file.suffix == '.webp':
            with Image.open(file) as im:
                assert not im.getexif(), file
                assert not any(k in im.info for k in ['exif', 'xmp', 'XML:com.adobe.xmp']), file
                assert max(im.size) <= (1800 if '/photos/' in item[key] else 960), file
                im.verify()
print('Dates grounded in source evidence; all public images decode and have no EXIF/GPS/XMP.', flush=True)

ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
def verify_video(item):
    filename = str(ROOT / item['src'])
    probe = subprocess.run([ffmpeg, '-hide_banner', '-i', filename], capture_output=True,
                           encoding='utf-8', errors='replace').stderr
    assert 'Video: h264' in probe and 'yuv420p' in probe, item['id']
    assert 'creation_time' not in probe and 'location' not in probe.lower(), item['id']
    subprocess.run([ffmpeg, '-hide_banner', '-v', 'error', '-nostdin', '-i', filename,
                    '-threads', '2', '-f', 'null', '-'], check=True, capture_output=True)
    raw = Path(filename).read_bytes()
    assert raw.index(b'moov') < raw.index(b'mdat'), item['id']
    print(f"Video decoded; H.264 + faststart: {item['id']}", flush=True)

with ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(verify_video, [x for x in album['items'] if x['kind'] == 'video']))
print('Media verification passed.', flush=True)
