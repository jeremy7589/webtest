// Scientific colour maps (Fabio Crameri, MIT licence), sampled to 48 stops, plus a few utilities.
const batlow = [1,25,89,6,33,91,10,42,92,13,49,93,15,56,95,16,62,95,17,68,96,19,73,97,20,78,98,23,83,98,26,87,98,30,93,98,35,96,96,42,101,94,48,104,92,55,107,88,63,110,84,71,113,80,80,116,75,88,118,70,98,121,65,106,123,61,115,126,56,125,129,52,134,131,48,145,134,45,155,137,43,165,139,44,177,141,47,187,143,51,198,145,58,207,147,64,217,149,74,225,151,82,233,153,92,240,156,105,245,159,116,249,163,130,252,167,142,253,172,156,253,175,167,253,179,177,253,183,190,253,187,201,252,191,214,252,195,225,251,200,239,250,204,250]
// viridis (matplotlib, CC0) 16 stops
const viridis = [68,1,84,72,26,108,71,47,125,65,68,135,57,86,140,48,104,142,40,120,142,33,136,141,30,152,138,36,168,131,52,183,121,80,196,105,113,208,85,152,218,61,194,223,39,236,229,27]
// a warm "depth" ramp for thickness: pale sand to deep rust
const thick = [255,247,220,254,232,185,252,214,150,247,190,120,236,160,95,220,128,78,196,98,66,166,70,58,130,46,52,92,26,45]

function stops(arr) { const s = []; for (let i = 0; i < arr.length; i += 3) s.push([arr[i] / 255, arr[i + 1] / 255, arr[i + 2] / 255]); return s }

export const COLORMAPS = {
  batlow: { name: 'Batlow', stops: stops(batlow) },
  viridis: { name: 'Viridis', stops: stops(viridis) },
  thick: { name: 'Sand to rust', stops: stops(thick) },
}

export function sampleRamp(stopsArr, t) {
  t = Math.min(1, Math.max(0, t)); const n = stopsArr.length - 1
  const f = t * n, i = Math.min(n - 1, Math.floor(f)), u = f - i
  const a = stopsArr[i], b = stopsArr[i + 1]
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
}

/** Build a 256x1 RGBA Uint8 array for a DataTexture. */
export function rampTextureData(stopsArr, width = 256) {
  const d = new Uint8Array(width * 4)
  for (let i = 0; i < width; i++) { const c = sampleRamp(stopsArr, i / (width - 1)); d[i * 4] = c[0] * 255; d[i * 4 + 1] = c[1] * 255; d[i * 4 + 2] = c[2] * 255; d[i * 4 + 3] = 255 }
  return d
}

export function rampCss(stopsArr) {
  return `linear-gradient(90deg, ${stopsArr.map((c, i) => `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0}) ${(100 * i / (stopsArr.length - 1)).toFixed(1)}%`).join(', ')})`
}
