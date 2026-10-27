"""Reduce the ZCORN corner array to per-layer node grids (top and bottom horizons).

Node (I,J), I in 0..NX, J in 0..NY. Values are the mean of the corner depths of the
ACTIVE cells sharing that node. Output in elevation (m AHD) = -depth.
"""
import sys, time, json
import numpy as np

S = sys.argv[1]  # scratchpad dir
NX, NY, NZ = 1836, 2598, 21
zc = np.memmap(f'{S}/bin/zcorn.f32', dtype=np.float32, mode='r', shape=(2*NZ, 2*NY, 2*NX))
act = np.load(f'{S}/scratch_actnum.npy').reshape(NZ, NY, NX).astype(bool)
out = f'{S}/horizons'
import os; os.makedirs(out, exist_ok=True)

def node_grid(block, a):
    """block: (2NY, 2NX) corner depths of one horizon of one layer; a: (NY,NX) active mask."""
    c00 = block[0::2, 0::2]; c10 = block[0::2, 1::2]; c01 = block[1::2, 0::2]; c11 = block[1::2, 1::2]
    s = np.zeros((NY+1, NX+1), np.float64); n = np.zeros((NY+1, NX+1), np.int32)
    mn = np.full((NY+1, NX+1), np.inf, np.float32); mx = np.full((NY+1, NX+1), -np.inf, np.float32)
    af = a.astype(np.float64)
    for c, (j0, i0) in ((c00, (0, 0)), (c10, (0, 1)), (c01, (1, 0)), (c11, (1, 1))):
        sl = (slice(j0, j0+NY), slice(i0, i0+NX))
        s[sl] += np.where(a, c, 0.0); n[sl] += a
        mn[sl] = np.minimum(mn[sl], np.where(a, c, np.inf)); mx[sl] = np.maximum(mx[sl], np.where(a, c, -np.inf))
    with np.errstate(invalid='ignore', divide='ignore'):
        g = (s / n).astype(np.float32)
    g[n == 0] = np.nan
    disc = np.where(n > 0, mx - mn, 0).astype(np.float32)
    return g, disc

stats = []
t0 = time.time()
prev_bot = None
for k in range(NZ):
    a = act[k]
    top, dtop = node_grid(zc[2*k], a)
    bot, dbot = node_grid(zc[2*k+1], a)
    # cell thickness from corner means (active cells only)
    tb = zc[2*k]; bb = zc[2*k+1]
    ct = (tb[0::2, 0::2] + tb[0::2, 1::2] + tb[1::2, 0::2] + tb[1::2, 1::2]) / 4
    cb = (bb[0::2, 0::2] + bb[0::2, 1::2] + bb[1::2, 0::2] + bb[1::2, 1::2]) / 4
    th = np.where(a, cb - ct, np.nan)  # depth positive down, so bottom - top
    thv = th[a]
    conf = np.nan
    if prev_bot is not None:
        both = ~np.isnan(prev_bot) & ~np.isnan(top)
        conf = float(np.abs(prev_bot[both] - top[both]).max()) if both.any() else np.nan
    st = dict(k=k+1, active=int(a.sum()),
              top_elev_min=float(-np.nanmax(top)), top_elev_max=float(-np.nanmin(top)),
              bot_elev_min=float(-np.nanmax(bot)), bot_elev_max=float(-np.nanmin(bot)),
              thick_min=float(thv.min()), thick_max=float(thv.max()), thick_mean=float(thv.mean()),
              thick_median=float(np.median(thv)), zero_thick_cells=int((thv < 0.01).sum()),
              neg_thick_cells=int((thv < -0.01).sum()),
              node_disc_max_top=float(dtop.max()), node_disc_p99_top=float(np.percentile(dtop[dtop > 0], 99)) if (dtop > 0).any() else 0.0,
              nodes_disc_gt1m_top=int((dtop > 1).sum()), nodes_disc_gt10m_top=int((dtop > 10).sum()),
              conformity_prevbot_vs_top_maxdiff=conf)
    stats.append(st)
    print(json.dumps(st), flush=True)
    np.save(f'{out}/top_{k+1:02d}.npy', -top)   # elevation m AHD
    np.save(f'{out}/bot_{k+1:02d}.npy', -bot)
    np.save(f'{out}/disc_{k+1:02d}.npy', np.maximum(dtop, dbot))
    np.save(f'{out}/thick_{k+1:02d}.npy', th.astype(np.float32))
    prev_bot = bot
print('done in', round(time.time()-t0, 1), 's')
json.dump(stats, open(f'{out}/stats.json', 'w'), indent=1)
