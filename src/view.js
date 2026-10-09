(function (root) {
  'use strict';
  const P = root.SunProjection;
  class SkyView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.mode = 'dome';
      this.camera = { yaw: -25, pitch: 28 };
      this.points = [];
      this.sun = null;
      this.underground = false;
      this.drag = null;
      this.resizeObserver = new ResizeObserver(() => this.draw());
      this.resizeObserver.observe(canvas);
      canvas.addEventListener('pointerdown', e => {
        if (this.mode !== 'dome') return;
        this.drag = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
        canvas.classList.add('dragging');
      });
      canvas.addEventListener('pointermove', e => {
        if (!this.drag) return;
        this.camera.yaw = (this.camera.yaw + (e.clientX - this.drag.x) * .45) % 360;
        this.camera.pitch = Math.max(8, Math.min(80, this.camera.pitch + (e.clientY - this.drag.y) * .35));
        this.drag = { x: e.clientX, y: e.clientY };
        this.draw();
      });
      const end = () => { this.drag = null; canvas.classList.remove('dragging'); };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
      canvas.addEventListener('lostpointercapture', end);
      canvas.addEventListener('keydown', e => {
        if (this.mode !== 'dome' || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        if (e.key === 'ArrowLeft') this.camera.yaw -= 5;
        if (e.key === 'ArrowRight') this.camera.yaw += 5;
        if (e.key === 'ArrowUp') this.camera.pitch = Math.min(80, this.camera.pitch + 5);
        if (e.key === 'ArrowDown') this.camera.pitch = Math.max(8, this.camera.pitch - 5);
        this.draw();
      });
    }
    reset() { this.camera = { yaw: -25, pitch: 28 }; this.draw(); }
    project(a, h) { return this.mode === 'flat' ? P.flat(a, h, this.frame) : P.dome(a, h, this.camera, this.frame); }
    line(points, width = 1, dash = []) {
      const c = this.ctx;
      c.lineWidth = width; c.setLineDash(dash); c.beginPath();
      points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
      c.stroke(); c.setLineDash([]);
    }
    text(value, x, y, align = 'center') {
      this.ctx.textAlign = align;
      this.ctx.fillText(value, x, y);
    }
    ring(altitude, width, dash = []) {
      const points = [];
      for (let a = 0; a <= 360; a += 3) points.push(this.project(a, altitude));
      this.line(points, width, dash);
    }
    grid() {
      const c = this.ctx, f = this.frame;
      if (this.mode === 'flat') {
        if (this.underground) {
          this.ring(-90, .7, [1, 7]);
          this.ring(-45, .7, [1, 7]);
          const undergroundLabel = this.project(45, -45);
          this.text('−45°', undergroundLabel.x + 5, undergroundLabel.y - 6, 'left');
        }
        [30, 60].forEach(h => {
          this.ring(h, .7, [1, 6]);
          const p = this.project(0, h);
          this.text(`${h}°`, p.x + 8, p.y - 5, 'left');
        });
        for (let a = 0; a < 360; a += 45) {
          const p = this.project(a, this.underground ? -90 : 0);
          this.line([{ x: f.cx, y: f.cy }, p], .6, [1, 7]);
        }
      } else {
        for (let a = 0; a < 360; a += 30) {
          const arc = [];
          for (let h = this.underground ? -90 : 0; h <= 90; h += 3) arc.push(this.project(a, h));
          this.line(arc, .65, [1, 6]);
        }
        [30, 60].forEach(h => this.ring(h, .65, [1, 6]));
        if (this.underground) [-30, -60].forEach(h => this.ring(h, .65, [1, 6]));
        for (const a of [0, 90]) this.line([this.project(a, 0), this.project(a + 180, 0)], .65, [1, 6]);
      }
      this.ring(0, 1.15);
      const top = this.project(0, 90);
      this.text('天顶 90°', top.x, top.y - 15);
      const names = ['北 N', '东 E', '南 S', '西 W'];
      [0, 90, 180, 270].forEach((a, i) => {
        const p = this.project(a, 0);
        let dx = p.x - f.cx, dy = p.y - f.cy;
        const length = Math.hypot(dx, dy) || 1;
        dx = dx / length * 24; dy = dy / length * 24;
        this.text(names[i], p.x + dx, p.y + dy + 4);
      });
      if (this.mode === 'flat') {
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(f.cx - 4, f.cy); c.lineTo(f.cx + 4, f.cy); c.moveTo(f.cx, f.cy - 4); c.lineTo(f.cx, f.cy + 4); c.stroke();
      } else {
        c.fillRect(f.cx-2.5,f.cy-2.5,5,5);
      }
    }
    path() {
      let segment = [], previousNight = null;
      const flush = night => { if (segment.length > 1) this.line(segment, night ? 1.4 : 2.1, night ? [6, 5] : []); };
      for (let i = 1; i < this.points.length; i++) {
        const a = this.points[i - 1], b = this.points[i];
        const night = (a.altitude + b.altitude) / 2 < 0;
        if (night && !this.underground) { flush(previousNight); segment = []; previousNight = null; continue; }
        if (night !== previousNight) { flush(previousNight); segment = [this.project(a.azimuth, a.altitude)]; }
        segment.push(this.project(b.azimuth, b.altitude));
        previousNight = night;
      }
      flush(previousNight);
      // Hour marks convey motion without introducing extra colours.
      for (const point of this.points) {
        if (point.ms % 3600000 > 1 || point.ms === this.points[this.points.length - 1].ms) continue;
        if (point.altitude < 0 && !this.underground) continue;
        const p = this.project(point.azimuth, point.altitude);
        const c = this.ctx;
        c.beginPath(); c.arc(p.x, p.y, 2.2, 0, 2 * Math.PI); c.fill();
      }
    }
    marker() {
      if (!this.sun || (this.sun.altitude < 0 && !this.underground)) return;
      const c = this.ctx, f = this.frame, p = this.project(this.sun.azimuth, this.sun.altitude);
      if (this.mode === 'dome') this.line([{ x: f.cx, y: f.cy }, p], .75, [3, 5]);
      c.fillStyle = this.paper; c.beginPath(); c.arc(p.x, p.y, 10, 0, Math.PI * 2); c.fill();
      c.fillStyle = this.ink; c.lineWidth = 1.8;
      c.beginPath(); c.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
      if (this.sun.altitude >= 0) c.fill(); else c.stroke();
      c.beginPath(); c.arc(p.x, p.y, 9, 0, Math.PI * 2); c.stroke();
    }
    draw() {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const w = rect.width, h = rect.height, dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
        this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      }
      const c = this.ctx;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const style = getComputedStyle(document.documentElement);
      this.ink = style.getPropertyValue('--ink').trim(); this.paper = style.getPropertyValue('--paper').trim();
      c.fillStyle = this.paper; c.fillRect(0, 0, w, h);
      c.fillStyle = this.ink; c.strokeStyle = this.ink; c.font = '11px Arial, Microsoft YaHei, sans-serif'; c.lineJoin = 'round'; c.lineCap = 'round';
      this.canvas.dataset.mode = this.mode;
      const flat = this.mode === 'flat';
      this.frame = { cx: w * .5, cy: h * (this.underground || flat ? .46 : .59), radius: flat ? Math.min(w, h) * (this.underground ? .205 : .38) : Math.min(w * .40, h * (this.underground ? .39 : .50)) };
      this.grid(); this.path(); this.marker();
      if (!flat) {
        // Keep the matching observer label readable even when a winter path
        // passes close to the projected observer.
        c.fillStyle=this.paper;c.fillRect(this.frame.cx-27,this.frame.cy+7,54,15);
        c.fillStyle=this.ink;this.text('观测点',this.frame.cx,this.frame.cy+19);
      }
    }
  }
  root.SkyView = SkyView;
})(globalThis);
