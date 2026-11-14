#!/usr/bin/env python3
"""Download the CC0 Poly Haven assets used by the browser harness into web/public/assets.
Run: python3 scripts/fetch-assets.py   (re-runnable; skips files that already exist)
All assets are CC0 (https://polyhaven.com/license) — recorded in docs/ASSET_LICENSING.md."""
import json, os, sys, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), '..', 'web', 'public', 'assets')
API = 'https://api.polyhaven.com/files/'
TEXTURES = {  # id: resolution
    'leafy_grass': '2k',
    'concrete_floor_02': '1k',
    'white_plaster_02': '1k',
    'red_brick_03': '1k',
    'precast_stone_paving': '1k',
    'wood_table_001': '1k',
    'leather_red_02': '1k',
}
MAPS = {'Diffuse': 'color', 'nor_gl': 'normal', 'Rough': 'roughness', 'AO': 'ao'}
MODELS = {'shrub_02': '1k', 'potted_plant_02': '1k', 'planter_box_01': '1k'}
HDRI = ('kloofendal_48d_partly_cloudy_puresky', '2k')

UA = {'User-Agent': 'rally-club-asset-fetch/1.0'}

def open_url(url, timeout):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout)

def get(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open_url(url, 180) as r, open(dest, 'wb') as f:
        f.write(r.read())
    print('  ', os.path.relpath(dest, ROOT), os.path.getsize(dest) // 1024, 'kB')

def files(asset_id):
    with open_url(API + asset_id, 60) as r:
        return json.load(r)

for tid, res in TEXTURES.items():
    info = files(tid)
    for key, name in MAPS.items():
        if key in info and res in info[key]:
            get(info[key][res]['jpg']['url'], os.path.join(ROOT, 'textures', tid, name + '.jpg'))
for mid, res in MODELS.items():
    g = files(mid)['gltf'][res]['gltf']
    get(g['url'], os.path.join(ROOT, 'models', mid, mid + '.gltf'))
    for rel, inc in g.get('include', {}).items():
        get(inc['url'], os.path.join(ROOT, 'models', mid, rel))
hid, hres = HDRI
get(files(hid)['hdri'][hres]['hdr']['url'], os.path.join(ROOT, 'hdri', 'sky_2k.hdr'))
print('done')
