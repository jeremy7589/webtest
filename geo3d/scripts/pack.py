"""Pack per-layer horizon grids into compact LOD web assets.

Container format (little endian):
  magic 'GEO3' | uint32 headerLen | header JSON (utf-8, padded to 4 bytes) | arrays (each 4-byte aligned)
Header JSON: {"arrays":[{"name","dtype","shape","offset","length","scale","add","nodata","delta"}], ...}
Whole file is gzipped (decompressed in the browser with fflate).
"""
import sys, os, json, gzip, time
import numpy as np

S = sys.argv[1]; OUT = sys.argv[2]
NX, NY, NZ = 1836, 2598, 21
NYP = 2600  # padded rows so factors 4 and 8 divide
NXP = 1840  # padded cols
H = f'{S}/horizons'
os.makedirs(OUT, exist_ok=True)

act = np.load(f'{S}/scratch_actnum.npy').reshape(NZ, NY, NX).astype(bool)
X = np.load(f'{S}/bin/coord_x.npy'); Y = np.load(f'{S}/bin/coord_y.npy')  # (NY+1, NX+1)

def pad_nodes(g):  # (NY+1, NX+1) -> (NYP+1, NXP+1)
    p = np.full((NYP+1, NXP+1), np.nan, np.float32); p[:NY+1, :NX+1] = g; return p
def pad_cells(m):  # (NY, NX) -> (NYP, NXP)
    p = np.zeros((NYP, NXP), m.dtype); p[:NY, :NX] = m; return p

def block_nanmean_nodes(g, f):
    """Coarse node (I,J) = nanmean of fine nodes in window centred on (fI, fJ), half width f//2."""
    nyn, nxn = NYP // f + 1, NXP // f + 1
    h = f // 2
    gp = np.pad(g, ((h, h), (h, h)), constant_values=np.nan)  # fine node (fI) -> padded index fI + h
    acc = np.zeros((nyn, nxn), np.float64); cnt = np.zeros((nyn, nxn), np.int32)
    for dj in range(-h, h + 1):
        for di in range(-h, h + 1):
            sub = gp[h + dj: h + dj + NYP + 1: f, h + di: h + di + NXP + 1: f]
            ok = ~np.isnan(sub)
            acc[ok] += sub[ok]; cnt += ok
    out = np.full((nyn, nxn), np.nan, np.float32)
    out[cnt > 0] = (acc[cnt > 0] / cnt[cnt > 0])
    return out

def block_sum_cells(m, f):
    return m.reshape(NYP // f, f, NXP // f, f).sum(axis=(1, 3))

def nearest_pillar_xy(g, f):
    return g[:NY+1:f, ::f] if False else None

arrays = []
blobs = []
def add(name, arr, dtype, scale=None, add_=None, nodata=None, delta=False, extra=None):
    a = np.ascontiguousarray(arr.astype(dtype))
    b = a.tobytes()
    off = sum(len(x) for x in blobs)
    pad = (-len(b)) % 4
    blobs.append(b + b'\0' * pad)
    e = dict(name=name, dtype=np.dtype(dtype).name, shape=list(arr.shape), offset=off, length=len(b))
    if scale is not None: e.update(scale=scale, add=add_)
    if nodata is not None: e['nodata'] = nodata
    if delta: e['delta'] = True
    if extra: e.update(extra)
    arrays.append(e)

def quant16(g, delta=True):
    ok = ~np.isnan(g)
    if not ok.any():
        return np.full(g.shape, 65535, np.uint16), 1.0, 0.0
    mn, mx = float(g[ok].min()), float(g[ok].max())
    scale = (mx - mn) / 65000.0 if mx > mn else 1.0
    q = np.full(g.shape, 65535, np.uint16)
    q[ok] = np.clip(np.round((g[ok] - mn) / scale), 0, 65000).astype(np.uint16)
    return q, scale, mn

def write_container(path, header):
    hj = json.dumps(header, separators=(',', ':')).encode()
    hj += b' ' * ((-len(hj)) % 4)
    raw = b'GEO3' + np.uint32(len(hj)).tobytes() + hj + b''.join(blobs)
    gz = gzip.compress(raw, compresslevel=9)
    open(path, 'wb').write(gz)
    return len(raw), len(gz)

def build_lod(f, name):
    global arrays, blobs
    arrays, blobs = [], []
    t0 = time.time()
    nyn, nxn = NYP // f + 1, NXP // f + 1
    # node XY: sample the real pillar positions (clip to grid, extrapolate 250 m beyond)
    Jf = np.arange(0, NYP + 1, f); If = np.arange(0, NXP + 1, f)
    Jn = np.minimum(Jf, NY); In = np.minimum(If, NX)
    Xs = X[Jn][:, In].copy(); Ys = Y[Jn][:, In].copy()
    Xs += np.maximum(If - NX, 0)[None, :] * 250.0
    Ys += np.maximum(Jf - NY, 0)[:, None] * 250.0
    add('x', Xs - 0.0, np.float32); add('y', Ys - 0.0, np.float32)
    dem_fine = np.full((NYP + 1, NXP + 1), np.nan, np.float32)
    outcrop = np.zeros((NYP // f, NXP // f), np.uint8)  # uppermost active layer index (1..21), 0 none
    layer_meta = []
    for k in range(1, NZ + 1):
        top = pad_nodes(np.load(f'{H}/top_{k:02d}.npy')); bot = pad_nodes(np.load(f'{H}/bot_{k:02d}.npy'))
        disc = pad_nodes(np.load(f'{H}/disc_{k:02d}.npy'))
        a = pad_cells(act[k - 1])
        dem_fine = np.fmax(dem_fine, top)
        ct = block_nanmean_nodes(top, f); cb = block_nanmean_nodes(bot, f)
        cnt = block_sum_cells(a.astype(np.int32), f)
        mask = cnt >= max(1, (f * f) // 4)
        # ensure every active coarse cell has 4 valid corners; fill from other corners, else drop
        for it in range(2):
            c00 = ct[:-1, :-1]; c10 = ct[:-1, 1:]; c01 = ct[1:, :-1]; c11 = ct[1:, 1:]
            bad = mask & (np.isnan(c00) | np.isnan(c10) | np.isnan(c01) | np.isnan(c11))
            if not bad.any(): break
            # fill NaN nodes adjacent to active cells with nanmean of neighbours
            for g in (ct, cb):
                gp = np.pad(g, 1, constant_values=np.nan)
                nb = np.nanmean(np.stack([gp[:-2, 1:-1], gp[2:, 1:-1], gp[1:-1, :-2], gp[1:-1, 2:]]), axis=0)
                need = np.isnan(g)
                need_mask = np.zeros_like(need)
                jj, ii = np.nonzero(bad)
                for dj, di in ((0, 0), (0, 1), (1, 0), (1, 1)):
                    need_mask[jj + dj, ii + di] = True
                fill = need & need_mask & ~np.isnan(nb)
                g[fill] = nb[fill]
        c00 = ct[:-1, :-1]; c10 = ct[:-1, 1:]; c01 = ct[1:, :-1]; c11 = ct[1:, 1:]
        bad = mask & (np.isnan(c00) | np.isnan(c10) | np.isnan(c01) | np.isnan(c11))
        mask &= ~bad
        b00 = cb[:-1, :-1]; b10 = cb[:-1, 1:]; b01 = cb[1:, :-1]; b11 = cb[1:, 1:]
        badb = mask & (np.isnan(b00) | np.isnan(b10) | np.isnan(b01) | np.isnan(b11))
        mask &= ~badb
        # thickness guard: bottom must be <= top at nodes used
        outcrop[(outcrop == 0) & mask] = k
        qt, st, at = quant16(ct); qb, sb, ab = quant16(cb)
        add(f'top_{k:02d}', qt, np.uint16, st, at, 65535)
        add(f'bot_{k:02d}', qb, np.uint16, sb, ab, 65535)
        add(f'mask_{k:02d}', mask.astype(np.uint8), np.uint8)
        fault = block_sum_cells(pad_cells(np.load(f'{H}/disc_{k:02d}.npy')[:NY, :NX] > 10.0).astype(np.int32), f) > 0
        if fault.any():
            add(f'fault_{k:02d}', fault.astype(np.uint8), np.uint8)
        ok = ~np.isnan(ct)
        layer_meta.append(dict(k=k, cells=int(mask.sum()), elevTop=[float(np.nanmin(ct)), float(np.nanmax(ct))] if ok.any() else None,
                               elevBot=[float(np.nanmin(cb)), float(np.nanmax(cb))] if (~np.isnan(cb)).any() else None,
                               faultCells=int(fault.sum())))
    dem = block_nanmean_nodes(dem_fine, f)
    qd, sd, ad = quant16(dem); add('dem', qd, np.uint16, sd, ad, 65535)
    add('outcrop', outcrop, np.uint8)
    header = dict(lod=name, factor=f, cellSize=250 * f, nxn=nxn, nyn=nyn, nxc=nxn - 1, nyc=nyn - 1, arrays=arrays, layers=layer_meta)
    raw, gz = write_container(f'{OUT}/{name}.bin.gz', header)
    print(f'{name}: factor {f} nodes {nxn}x{nyn} raw {raw/1e6:.1f} MB gz {gz/1e6:.1f} MB in {time.time()-t0:.1f}s', flush=True)
    return header, raw, gz

lods = []
for f, name in ((8, 'lod2k'), (4, 'lod1k')):
    h, raw, gz = build_lod(f, name)
    lods.append(dict(id=name, factor=f, cellSize=250 * f, nxn=h['nxn'], nyn=h['nyn'], file=f'{name}.bin.gz', rawBytes=raw, gzBytes=gz, layers=h['layers']))

stats = json.load(open(f'{H}/stats.json'))
manifest = dict(
    name='OGIA 2017 Surat CMA regional geological model (Rev2B, 250 m)',
    crs='EPSG:28355', crsName='GDA94 / MGA zone 55', verticalDatum='m AHD',
    origin=[551000.0, 6795500.0], cellSize=250, nx=NX, ny=NY, nz=NZ,
    extent=[float(X.min()), float(Y.min()), float(X.max()), float(Y.max())],
    center=[float((X.min() + X.max()) / 2), float((Y.min() + Y.max()) / 2)],
    zRange=[min(s['bot_elev_min'] for s in stats), max(s['top_elev_max'] for s in stats)],
    layerStats=stats, lods=lods,
    source=dict(project='OGIA_Geomodel_2017_Rev2_WorkingFile.pet', grid='3D grid_250m Rev2B', exportedBy='Petrel 2024.9.0', exportDate='2026-03-19'),
)
def _clean(o):
    import math
    if isinstance(o, float) and (math.isnan(o) or math.isinf(o)): return None
    if isinstance(o, dict): return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, list): return [_clean(v) for v in o]
    return o
json.dump(_clean(manifest), open(f'{OUT}/manifest.json', 'w'), indent=1, allow_nan=False)
print('manifest written')
