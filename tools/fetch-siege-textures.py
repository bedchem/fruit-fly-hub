"""Fetch three CC0 Poly Haven material photos for the original Siege lodge."""
import io
import json
from pathlib import Path
from urllib.request import Request, urlopen
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/textures/siege'
OUT.mkdir(parents=True, exist_ok=True)
HEADERS = {'User-Agent': 'FlyLab-build/1.0 (github.com/bedchem/fruit-fly-slot-machine)'}
credits = []
for name, asset in [('plaster', 'plastered_wall_02'), ('wood', 'wood_planks'), ('brick', 'brick_wall_001')]:
    with urlopen(Request('https://api.polyhaven.com/files/' + asset, headers=HEADERS), timeout=40) as response:
        files = json.load(response)
    source = (files.get('diff') or files.get('Diffuse'))['1k']['jpg']['url']
    with urlopen(Request(source, headers=HEADERS), timeout=40) as response:
        im = Image.open(io.BytesIO(response.read())).convert('RGB')
        im.thumbnail((512, 512), Image.Resampling.LANCZOS)
        im.save(OUT / (name + '.webp'), 'WEBP', quality=82, method=6)
    credits.append({'name':name, 'source':'https://polyhaven.com/a/' + asset, 'image':source, 'license':'CC0 1.0'})
    print(name, (OUT / (name + '.webp')).stat().st_size)
(OUT / 'credits.json').write_text(json.dumps(credits, indent=2) + '\n')
