import sys, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
S = sys.argv[1]
H = f'{S}/horizons'; Q = f'{S}/qa'
import os; os.makedirs(Q, exist_ok=True)

def show(arr, title, fn, cmap='terrain', vmin=None, vmax=None, step=4):
    a = arr[::step, ::step]
    plt.figure(figsize=(9, 12)); plt.imshow(a, origin='lower', cmap=cmap, vmin=vmin, vmax=vmax)
    plt.colorbar(shrink=0.6); plt.title(title); plt.tight_layout(); plt.savefig(f'{Q}/{fn}', dpi=90); plt.close()

top1 = np.load(f'{H}/top_01.npy')
show(top1, 'Top of layer 1 (ground surface, m AHD)', 'top01.png')
show(np.load(f'{H}/top_12.npy'), 'Top of layer 12 Hutton (m AHD)', 'top12.png', cmap='viridis')
show(np.load(f'{H}/top_21.npy'), 'Top of layer 21 (m AHD)', 'top21.png', cmap='viridis')
show(np.load(f'{H}/bot_21.npy'), 'Bottom of layer 21 (m AHD)', 'bot21.png', cmap='viridis')
# discrepancy (fault) map, max over layers
disc = np.zeros_like(top1)
for k in range(1, 22):
    disc = np.maximum(disc, np.load(f'{H}/disc_{k:02d}.npy'))
show(np.log10(disc + 1), 'log10(1+max corner discrepancy) all layers', 'disc.png', cmap='magma', step=2)
np.save(f'{H}/disc_max.npy', disc)
# XY residual wobble
X = np.load(f'{S}/bin/coord_x.npy'); Y = np.load(f'{S}/bin/coord_y.npy')
J, I = np.mgrid[0:2599, 0:1837]
rx = X - (551024.2415 + 250.001161*I - 0.005403*J); ry = Y - (6795507.7133 - 0.014369*I + 249.999745*J)
show(rx, 'X residual from affine lattice (m)', 'resx.png', cmap='RdBu', vmin=-300, vmax=300)
show(ry, 'Y residual from affine lattice (m)', 'resy.png', cmap='RdBu', vmin=-300, vmax=300)
# a cross-section along a row through the middle
j = 1300
plt.figure(figsize=(16, 6))
cols = plt.cm.tab20(np.linspace(0, 1, 21))
for k in range(1, 22):
    t = np.load(f'{H}/top_{k:02d}.npy')[j]; b = np.load(f'{H}/bot_{k:02d}.npy')[j]
    x = np.arange(t.size) * 0.25
    plt.fill_between(x, b, t, color=cols[k-1], label=f'L{k}', linewidth=0)
plt.legend(ncol=7, fontsize=7); plt.title(f'E-W section at row j={j}'); plt.xlabel('km'); plt.ylabel('m AHD')
plt.tight_layout(); plt.savefig(f'{Q}/section_j{j}.png', dpi=90); plt.close()
print('ok')
