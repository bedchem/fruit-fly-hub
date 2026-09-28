"""Download the curated CS2 skin pool, preserving alpha and serving it locally.
Run: python3 tools/fetch-cs2-skins.py (requires Pillow). No browser API calls.
Artwork belongs to Valve / its workshop contributors; metadata: ByMykel/CSGO-API.
"""
import io
import json
import re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.request import urlopen
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json'
NAMES = json.loads((ROOT / 'tools/cs2-skin-selection.json').read_text())
COLLECTORS = json.loads((ROOT / 'tools/cs2-collector-selection.json').read_text())
OUT = ROOT / 'public/skins/cs2'
OUT.mkdir(parents=True, exist_ok=True)
with urlopen(SOURCE, timeout=45) as response:
    catalog = json.load(response)

specs = [{'skin': next(s for s in catalog if s['name'] == name)} for name in NAMES]
specs += [{'skin': next(s for s in catalog if s['name'] == name), 'collector': True} for name in COLLECTORS['guns']]
for knife in COLLECTORS['knives']:
    for finish in COLLECTORS['finishes']:
        skin = next((s for s in catalog if s['name'] == f"★ {knife} | {finish['finish']}" and s.get('phase') == finish.get('phase')), None)
        if skin:
            specs.append({'skin': skin, 'collector': True})
for gem in COLLECTORS['blueGems']:
    skin = next(s for s in catalog if s['name'] == gem['name'])
    page = f"https://skinory.io/en/items/{gem['slug']}/seed/{gem['pattern']}"
    with urlopen(page, timeout=45) as response:
        html = response.read().decode()
    image = re.search(r'https://skinory.io/render/[^"\s<>]+/fn\.webp[^"\s<>]*', html)
    if not image:
        raise RuntimeError(f'No verified pattern render on {page}')
    specs.append({'skin': skin, 'collector': True, 'fixedPattern': gem['pattern'], 'image': image.group(0), 'sourcePage': page})
# Preserve existing IDs so previously collected skins remain valid.
unique = {}
for spec in specs:
    item_id = spec['skin']['id'] + (f"-bluegem-{spec['fixedPattern']}" if 'fixedPattern' in spec else '')
    unique[item_id] = {**spec, 'id': item_id}

def download(spec):
    skin = spec['skin']
    filename = spec['id'] + '.webp'
    source = spec.get('image', skin['image'])
    with urlopen(source, timeout=45) as response:
        im = Image.open(io.BytesIO(response.read())).convert('RGBA')
        # Normalize transparent margins without changing the skin artwork.
        bbox = im.getbbox()
        if bbox:
            im = im.crop(bbox)
        im.thumbnail((512, 384), Image.Resampling.LANCZOS)
        im.save(OUT / filename, 'WEBP', quality=84, method=6)
    knife = skin['category']['name'] == 'Knives'
    rarity = 'rare' if knife or 'fixedPattern' in spec else {'Mil-Spec Grade':'milspec','Restricted':'restricted','Classified':'classified','Covert':'covert','Contraband':'covert'}[skin['rarity']['name']]
    suffix = f" · Blue Gem #{spec['fixedPattern']}" if 'fixedPattern' in spec else f" · {skin['phase']}" if skin.get('phase') else ''
    return {'id':spec['id'], 'name':skin['name'] + suffix, 'weapon':skin['weapon']['name'],
            'finish':skin['pattern']['name'] + suffix, 'rarity':rarity,
            'image':'/skins/cs2/' + filename, 'minFloat':skin['min_float'],
            'maxFloat':skin['max_float'], 'stattrak':skin['stattrak'],
            **({'phase':skin['phase']} if skin.get('phase') else {}),
            **({'collector':True} if spec.get('collector') else {}),
            **({'fixedPattern':spec['fixedPattern']} if 'fixedPattern' in spec else {}),
            'source': source, **({'sourcePage':spec['sourcePage']} if 'sourcePage' in spec else {})}

with ThreadPoolExecutor(max_workers=6) as executor:
    skins = list(executor.map(download, unique.values()))
(ROOT / 'src/game/csSkins.json').write_text(json.dumps([{k:v for k,v in s.items() if k not in ('source', 'sourcePage')} for s in skins], ensure_ascii=False, indent=2) + '\n')
(OUT / 'credits.json').write_text(json.dumps({'metadata':SOURCE,'artwork':'Valve Corporation and contributing skin artists. Counter-Strike is a Valve trademark. Unofficial fan simulation.', 'images':[{ 'name':s['name'],'file':s['image'],'source':s['source']} for s in skins]},ensure_ascii=False,indent=2) + '\n')
print(f"Downloaded {len(skins)} skins: {sum(p.stat().st_size for p in OUT.glob('*.webp')) / 1024:.0f} KiB")
