// Loader for the GEO3 container format produced by scripts/pack.py:
//   'GEO3' | uint32 headerLen | header JSON | arrays (4-byte aligned)
// The whole file is gzip-compressed and decoded here with fflate.
import { gunzipSync } from 'fflate'

const CTORS = { uint8: Uint8Array, uint16: Uint16Array, int16: Int16Array, float32: Float32Array, int32: Int32Array }

export async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const total = Number(res.headers.get('content-length')) || 0
  if (!res.body || !onProgress) return new Uint8Array(await res.arrayBuffer())
  const reader = res.body.getReader()
  const chunks = []; let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value); received += value.length
    onProgress(received, total)
  }
  const out = new Uint8Array(received); let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}

export function parseGeo3(gz) {
  const raw = gunzipSync(gz)
  if (String.fromCharCode(raw[0], raw[1], raw[2], raw[3]) !== 'GEO3') throw new Error('Not a GEO3 container')
  const hl = new DataView(raw.buffer, raw.byteOffset + 4, 4).getUint32(0, true)
  const header = JSON.parse(new TextDecoder().decode(raw.subarray(8, 8 + hl)))
  const base = raw.byteOffset + 8 + hl
  const arrays = {}
  for (const a of header.arrays) {
    const C = CTORS[a.dtype]
    const n = a.length / C.BYTES_PER_ELEMENT
    const off = base + a.offset
    // slice to guarantee alignment and independent lifetime
    const view = (off % C.BYTES_PER_ELEMENT === 0) ? new C(raw.buffer, off, n) : new C(raw.buffer.slice(off, off + a.length))
    arrays[a.name] = { meta: a, data: view }
  }
  return { header, arrays }
}

/** Dequantize a uint16 grid to Float32 with NaN for nodata. */
export function dequant(entry) {
  const { meta, data } = entry
  if (!('scale' in meta)) return Float32Array.from(data)
  const out = new Float32Array(data.length)
  const s = meta.scale, add = meta.add, nd = meta.nodata ?? 65535
  for (let i = 0; i < data.length; i++) { const v = data[i]; out[i] = v === nd ? NaN : v * s + add }
  return out
}

/** Load one LOD pack and return a Model-like object with Float32 grids. */
export async function loadLod(url, onProgress) {
  const gz = await fetchWithProgress(url, onProgress)
  const { header, arrays } = parseGeo3(gz)
  const nxn = header.nxn, nyn = header.nyn
  const layers = []
  for (const lm of header.layers) {
    const k = lm.k, id = String(k).padStart(2, '0')
    layers.push({
      k, cells: lm.cells, elevTop: lm.elevTop, elevBot: lm.elevBot, faultCells: lm.faultCells,
      top: dequant(arrays[`top_${id}`]), bot: dequant(arrays[`bot_${id}`]),
      mask: arrays[`mask_${id}`].data, fault: arrays[`fault_${id}`]?.data ?? null,
    })
  }
  return {
    lod: header.lod, factor: header.factor, cellSize: header.cellSize, nxn, nyn, nxc: header.nxc, nyc: header.nyc,
    x: arrays.x.data, y: arrays.y.data, dem: dequant(arrays.dem), outcrop: arrays.outcrop.data, layers,
  }
}

export async function loadContextDem(url) {
  const gz = await fetchWithProgress(url)
  const { header, arrays } = parseGeo3(gz)
  return { origin: header.origin, step: header.step, nxn: header.nxn, nyn: header.nyn, dem: dequant(arrays.dem), attribution: header.attribution }
}
