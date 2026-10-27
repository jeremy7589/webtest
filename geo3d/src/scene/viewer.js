// Viewer: renderer, camera, controls, lighting, post-processing and on-demand rendering.
import * as THREE from 'three'
import CameraControls from 'camera-controls'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer, RenderPass, EffectPass, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode } from 'postprocessing'
import { N8AOPostPass } from 'n8ao'

CameraControls.install({ THREE })

export class Viewer extends THREE.EventDispatcher {
  constructor(container, opts = {}) {
    super()
    this.container = container
    const canvas = document.createElement('canvas'); canvas.className = 'gl'; container.appendChild(canvas)
    this.canvas = canvas
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance', stencil: false, depth: true, preserveDrawingBuffer: false })
    this.renderer = renderer
    this.dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr ?? 2)
    renderer.setPixelRatio(this.dpr)
    renderer.localClippingEnabled = true
    renderer.shadowMap.enabled = opts.shadows ?? true
    renderer.shadowMap.type = THREE.PCFShadowMap
    // tone mapping is applied by a ToneMappingEffect at the end of the composer (materials rendered
    // into a render target skip the renderer's own tone mapping)
    renderer.toneMapping = THREE.NoToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene(); this.scene = scene
    const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 60000); camera.up.set(0, 0, 1); this.camera = camera
    camera.position.set(300, -900, 600)

    const controls = new CameraControls(camera, canvas); this.controls = controls
    controls.updateCameraUp()
    controls.dollyToCursor = true
    controls.infinityDolly = false
    controls.minDistance = 2; controls.maxDistance = 9000
    controls.minPolarAngle = 0.02; controls.maxPolarAngle = Math.PI * 0.92
    controls.smoothTime = 0.22; controls.draggingSmoothTime = 0.08
    controls.dollySpeed = 0.9; controls.truckSpeed = 2.2
    controls.mouseButtons.right = CameraControls.ACTION.TRUCK
    controls.mouseButtons.middle = CameraControls.ACTION.DOLLY
    controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY_TRUCK

    // lighting
    const hemi = new THREE.HemisphereLight(0xd6e4ff, 0x3a2f28, 0.55); hemi.position.set(0, 0, 1); scene.add(hemi); this.hemi = hemi
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4); this.sun = sun
    sun.position.set(-350, 420, 760)
    sun.castShadow = renderer.shadowMap.enabled
    const sc = sun.shadow.camera; sc.left = -480; sc.right = 480; sc.top = 480; sc.bottom = -480; sc.near = 10; sc.far = 3000
    sun.shadow.mapSize.set(opts.shadowMapSize ?? 4096, opts.shadowMapSize ?? 4096)
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; sun.shadow.radius = 2
    scene.add(sun); scene.add(sun.target)
    const fill = new THREE.DirectionalLight(0x9fb7ff, 0.35); fill.position.set(500, -300, 200); scene.add(fill)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const buildEnv = () => { const p = new THREE.PMREMGenerator(renderer); scene.environment = p.fromScene(new RoomEnvironment(), 0.04).texture; p.dispose() }
    buildEnv()
    scene.environmentIntensity = 0.38
    scene.environmentRotation.set(Math.PI / 2, 0, 0)   // RoomEnvironment is Y-up; the scene is Z-up
    pmrem.dispose()
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault() })
    canvas.addEventListener('webglcontextrestored', () => { buildEnv(); this.requestRender() })

    // post-processing
    const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 }); this.composer = composer
    composer.addPass(new RenderPass(scene, camera))
    const n8ao = new N8AOPostPass(scene, camera, 1, 1); this.n8ao = n8ao
    n8ao.configuration.screenSpaceRadius = true
    n8ao.configuration.aoRadius = 28
    n8ao.configuration.distanceFalloff = 0.25
    n8ao.configuration.intensity = 2.6
    n8ao.configuration.halfRes = true
    n8ao.configuration.color = new THREE.Color(0x05070c)
    n8ao.configuration.transparencyAware = false
    n8ao.enabled = opts.ao ?? true
    composer.addPass(n8ao)
    const smaa = new SMAAEffect({ preset: SMAAPreset.HIGH }); this.smaa = smaa
    // Khronos neutral keeps the categorical formation colours true (ACES desaturates them)
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL })
    renderer.toneMappingExposure = 1.12
    composer.addPass(new EffectPass(camera, tone, smaa))

    this.timer = new THREE.Timer()
    this.needsRender = true
    this._animating = 0
    this._resize = this._resize.bind(this)
    this.ro = new ResizeObserver(this._resize); this.ro.observe(container)
    this._resize()
    controls.addEventListener('update', () => this.requestRender())
    controls.addEventListener('control', () => this.requestRender())
    this._loop = this._loop.bind(this)
    requestAnimationFrame(this._loop)
  }

  _resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix()
    this.requestRender()
  }

  requestRender() { this.needsRender = true }
  /** Keep rendering continuously while n animations are active. */
  holdAnimation(on) { this._animating += on ? 1 : -1; if (this._animating < 0) this._animating = 0; this.requestRender() }

  _loop() {
    requestAnimationFrame(this._loop)
    this.timer.update()
    const delta = Math.min(0.1, this.timer.getDelta())
    const updated = this.controls.update(delta)
    if (updated || this.needsRender || this._animating > 0) {
      // adaptive near/far keeps depth precision (and N8AO) usable from 5 km to 3000 km away
      const dist = this.controls.distance
      const near = THREE.MathUtils.clamp(dist * 0.004, 0.05, 40), far = Math.max(6000, dist * 60)
      if (Math.abs(near - this.camera.near) > near * 0.2 || Math.abs(far - this.camera.far) > far * 0.2) { this.camera.near = near; this.camera.far = far; this.camera.updateProjectionMatrix() }
      this.needsRender = false
      this.dispatchEvent({ type: 'beforerender', delta })
      this.composer.render(delta)
      this.dispatchEvent({ type: 'rendered' })
    }
  }

  setShadows(on) { this.renderer.shadowMap.enabled = on; this.sun.castShadow = on; this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true }); this.requestRender() }
  setAO(on) { this.n8ao.enabled = on; this.requestRender() }
  setDpr(d) { this.dpr = d; this.renderer.setPixelRatio(d); this._resize() }

  flyTo(pos, target, transition = true) { return this.controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, transition) }
  fitBox(box, transition = true, padding = 0.08) {
    const size = new THREE.Vector3(); box.getSize(size)
    return this.controls.fitToBox(box, transition, { paddingLeft: size.x * padding, paddingRight: size.x * padding, paddingTop: size.y * padding, paddingBottom: size.y * padding })
  }

  screenshot(type = 'image/png') {
    this.composer.render(0)
    return this.canvas.toDataURL(type, 0.92)
  }

  /** Camera azimuth (radians) for the compass: direction the camera looks at, projected on XY. */
  get azimuth() { return this.controls.azimuthAngle }
}
