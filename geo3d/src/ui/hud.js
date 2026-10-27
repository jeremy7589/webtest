// HUD: compass that follows the camera, a scale bar in km, and a coordinate readout.
import * as THREE from 'three'

export class Hud {
  constructor(viewer, els) {
    this.viewer = viewer; this.els = els
    this.svg = els.compass.querySelector('svg')
    viewer.addEventListener('rendered', () => this.update())
    els.compass.addEventListener('click', () => { viewer.controls.rotateAzimuthTo(0, true) })
    this._tmp = new THREE.Vector3()
  }
  update() {
    const c = this.viewer.controls, cam = this.viewer.camera
    // compass: rotate so that N arrow points to world +Y as seen on screen
    const az = c.azimuthAngle
    this.svg.style.transform = `rotate(${(-az * 180 / Math.PI).toFixed(1)}deg)`
    // scale bar: world km per 100 px at the orbit target distance
    const target = c.getTarget(this._tmp)
    const dist = cam.position.distanceTo(target)
    const h = this.viewer.container.clientHeight
    const kmPerPx = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / h
    const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]
    let km = nice[0]; for (const n of nice) { if (n / kmPerPx <= 140) km = n }
    const px = km / kmPerPx
    this.els.scaleBar.style.width = `${px.toFixed(0)}px`
    this.els.scaleLabel.textContent = km >= 1 ? `${km} km` : `${km * 1000} m`
  }
  setReadout(text) { this.els.readout.textContent = text }
}
