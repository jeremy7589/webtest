// Layer material: MeshStandardMaterial with injected colour modes, contour lines and wall shading.
import * as THREE from 'three'
import { COLORMAPS, rampTextureData } from '../data/colormaps.js'

export const MODE = { LAYER: 0, ELEV: 1, THICK: 2, DEPTH: 3 }

const rampCache = new Map()
export function rampTexture(name) {
  if (rampCache.has(name)) return rampCache.get(name)
  const tex = new THREE.DataTexture(rampTextureData(COLORMAPS[name].stops), 256, 1, THREE.RGBAFormat)
  tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true; rampCache.set(name, tex); return tex
}

/** Shared uniforms object so every layer material follows the global colour mode. */
export function createSharedUniforms() {
  return {
    uMode: { value: MODE.LAYER },
    uRange: { value: new THREE.Vector2(-8400, 1300) },
    uRamp: { value: rampTexture('batlow') },
    uContour: { value: 0 },            // metres, 0 = off
    uWallDarken: { value: 0.88 },
    uGround: { value: null },           // optional ground DEM texture for depth mode
    uHighlight: { value: 0 },
  }
}

export function createLayerMaterial(color, shared, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color), roughness: 0.82, metalness: 0.0, flatShading: false,
    side: THREE.FrontSide, clipShadows: true, transparent: false, opacity: 1,
    ...opts,
  })
  mat.userData.uLayerColor = { value: new THREE.Color(color) }
  mat.userData.uHighlight = { value: 0 }
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared)
    shader.uniforms.uLayerColor = mat.userData.uLayerColor
    shader.uniforms.uHighlight = mat.userData.uHighlight
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aThick; attribute float aKind;
        varying float vElev; varying float vThick; varying float vKind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vElev = position.z * 1000.0; vThick = aThick; vKind = aKind;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform int uMode; uniform vec2 uRange; uniform sampler2D uRamp; uniform float uContour;
        uniform float uWallDarken; uniform vec3 uLayerColor; uniform float uHighlight;
        varying float vElev; varying float vThick; varying float vKind;
        vec3 rampColor(float t) { return texture2D(uRamp, vec2(clamp(t, 0.001, 0.999), 0.5)).rgb; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 base = uLayerColor;
        if (uMode == 1) base = rampColor((vElev - uRange.x) / (uRange.y - uRange.x));
        else if (uMode == 2) base = rampColor((vThick - uRange.x) / (uRange.y - uRange.x));
        if (vKind > 1.5) base *= uWallDarken;
        if (uContour > 0.0 && vKind < 0.5) {
          float f = vElev / uContour; float g = fract(f); float d = min(g, 1.0 - g);
          float aw = fwidth(f) * 1.2; float line = 1.0 - smoothstep(0.0, aw, d);
          base = mix(base, base * 0.45, line * 0.85);
        }
        base = mix(base, vec3(1.0), uHighlight * 0.35);
        diffuseColor.rgb = base;`)
  }
  mat.customProgramCacheKey = () => 'geo-layer'
  return mat
}

/** Material for section caps and fence ribbons: same colour modes, double sided, no clipping. */
export function createCapMaterial(color, shared) {
  const m = createLayerMaterial(color, shared, { side: THREE.DoubleSide, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
  m.userData.isCap = true
  return m
}
