"""Fetch AWS Terrarium terrain tiles (Mapzen/Nextzen, public) covering the model bbox + margin,
reproject to an MGA zone 55 (EPSG:28355) grid at 1 km, save as npy."""
import sys, os, math, io, time
import numpy as np, requests
from PIL import Image
from pyproj import Transformer

S = sys.argv[1]
Z = 9
X0, X1 = 551000 - 120000, 1010000 + 120000
Y0, Y1 = 6795500 - 120000, 7445000 + 120000
STEP = 1000
to_ll = Transformer.from_crs('EPSG:28355', 'EPSG:4326', always_xy=True)

def tile_xy(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y

# corners to lon/lat
cx = [X0, X1, X0, X1]; cy = [Y0, Y0, Y1, Y1]
lons, lats = to_ll.transform(cx, cy)
txs, tys = zip(*[tile_xy(lo, la, Z) for lo, la in zip(lons, lats)])
tx0, tx1 = int(min(txs)), int(max(txs)); ty0, ty1 = int(min(tys)), int(max(tys))
print('tiles x', tx0, tx1, 'y', ty0, ty1, 'count', (tx1-tx0+1)*(ty1-ty0+1))
W = (tx1 - tx0 + 1) * 256; Hh = (ty1 - ty0 + 1) * 256
mosaic = np.full((Hh, W), np.nan, np.float32)
cache = f'{S}/terrarium'; os.makedirs(cache, exist_ok=True)
sess = requests.Session()
for ty in range(ty0, ty1 + 1):
    for tx in range(tx0, tx1 + 1):
        fn = f'{cache}/{Z}_{tx}_{ty}.png'
        if not os.path.exists(fn):
            for attempt in range(4):
                try:
                    r = sess.get(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png', timeout=30)
                    if r.status_code == 200: open(fn, 'wb').write(r.content); break
                except Exception as e: time.sleep(2 ** attempt)
        if os.path.exists(fn):
            im = np.asarray(Image.open(fn).convert('RGB')).astype(np.float32)
            el = im[..., 0] * 256 + im[..., 1] + im[..., 2] / 256 - 32768
            mosaic[(ty-ty0)*256:(ty-ty0+1)*256, (tx-tx0)*256:(tx-tx0+1)*256] = el
print('mosaic', mosaic.shape, np.nanmin(mosaic), np.nanmax(mosaic))
# resample to MGA grid
xs = np.arange(X0, X1 + 1, STEP); ys = np.arange(Y0, Y1 + 1, STEP)
GX, GY = np.meshgrid(xs, ys)
lon, lat = to_ll.transform(GX.ravel(), GY.ravel())
n = 2 ** Z
px = (lon + 180) / 360 * n * 256 - tx0 * 256
py = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / np.pi) / 2 * n * 256 - ty0 * 256
from scipy.ndimage import map_coordinates
vals = map_coordinates(mosaic, [py, px], order=1, mode='nearest').reshape(GY.shape)
np.save(f'{S}/context_dem_1km.npy', vals.astype(np.float32))
print('context dem', vals.shape, vals.min(), vals.max(), 'origin', X0, Y0, 'step', STEP)
