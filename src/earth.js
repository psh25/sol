(function (root) {
  'use strict';
  const P = root.SunProjection;
  class EarthView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.camera = P.earthCamera();
      // Freeze the auxiliary model's obliquity at launch. Calendar changes
      // affect spin and sunlight, but cannot change the pole direction.
      this.axialRotation = root.SunSolar.earthOrientation(Date.now()).rotation;
      this.orientation = null;
      this.localSun = null;
      this.location = root.SunSolar.BEIJING;
      this.track = [];
      this.sun = null;
      this.drag = null;
      this.resizeObserver = new ResizeObserver(() => this.draw());
      this.resizeObserver.observe(canvas);
      canvas.addEventListener('pointerdown', e => {
        this.drag = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId); canvas.classList.add('dragging');
      });
      canvas.addEventListener('pointermove', e => {
        if (!this.drag) return;
        this.camera = P.turnEarth(this.camera,(e.clientX-this.drag.x)*.55,(e.clientY-this.drag.y)*.4);
        this.drag = { x: e.clientX, y: e.clientY }; this.draw();
      });
      const end = () => { this.drag = null; canvas.classList.remove('dragging'); };
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name => canvas.addEventListener(name, end));
      canvas.addEventListener('keydown', e => {
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const yaw=e.key==='ArrowLeft'?-5:e.key==='ArrowRight'?5:0;
        const pitch=e.key==='ArrowUp'?-5:e.key==='ArrowDown'?5:0;
        this.camera = P.turnEarth(this.camera,yaw,pitch);
        this.draw();
      });
    }
    reset() { this.camera = P.earthCamera(); this.draw(); }
    project(v) {
      const orientation={sidereal:this.orientation?this.orientation.sidereal:0,rotation:this.axialRotation};
      return P.earthScene(P.ecliptic(v,orientation),this.camera,this.frame);
    }
    line(points, width = 1, dash = []) {
      const c = this.ctx;
      c.lineWidth = width; c.setLineDash(dash); c.beginPath();
      points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
      c.stroke(); c.setLineDash([]);
    }
    curve(vectors, width, frontDash = [], backDash = [2, 6]) {
      // Insert the projected limb crossing when front/back visibility changes.
      let path = [], previous = null, behind = null;
      const flush = () => { if (path.length > 1) this.line(path, width, behind ? backDash : frontDash); };
      for (const v of vectors) {
        const p = this.project(v), back = p.depth < 0;
        if (previous && back !== behind) {
          const f = previous.depth / (previous.depth - p.depth);
          const limb = { x: previous.x + f * (p.x - previous.x), y: previous.y + f * (p.y - previous.y) };
          path.push(limb); flush(); path = [limb];
        }
        path.push(p); previous = p; behind = back;
      }
      flush();
    }
    referencePlane() {
      const points = [];
      for (let t=0;t<=360;t+=3) {
        const a=t*Math.PI/180;
        points.push(P.earthScene([1.36*Math.cos(a),1.36*Math.sin(a),0],this.camera,this.frame));
      }
      this.line(points,.8,[2,4]);
    }
    poleLabel(name,point) {
      const c=this.ctx,f=this.frame,dx=point.x-f.cx,dy=point.y-f.cy,length=Math.hypot(dx,dy);
      const x=point.x+(length>8?13*dx/length:name==='N'?13:-13);
      const y=point.y+(length>8?13*dy/length:0)+4;
      c.font='11px Arial, sans-serif';c.textAlign='center';
      c.fillStyle=this.paper;c.fillRect(x-6,y-11,12,14);
      c.fillStyle=this.ink;c.fillText(name,x,y);
    }
    lighting() {
      if (!this.sun) return;
      const c=this.ctx,f=this.frame;
      const p=this.project(P.earthVector(this.sun.latitude,this.sun.longitude));
      // Screen-space sunlight. Surface normals have positive depth on the
      // visible hemisphere. In dark mode brighten day; in light mode dim night.
      const dark=document.documentElement.dataset.theme==='dark',sign=dark?-1:1;
      const sx=sign*(p.x-f.cx)/f.radius,sy=sign*(p.y-f.cy)/f.radius;
      const sz=Math.max(-1,Math.min(1,sign*p.depth)),length=Math.hypot(sx,sy);
      c.save();c.fillStyle=this.ink;c.globalAlpha=dark?.16:.14;c.beginPath();
      if(length<1e-8) {
        if(sz<0)c.arc(f.cx,f.cy,f.radius,0,2*Math.PI);
      } else {
        const ux=sx/length,uy=sy/length;
        const point=(along,across,first=false)=>{
          const x=f.cx+f.radius*(along*ux-across*uy);
          const y=f.cy+f.radius*(along*uy+across*ux);
          if(first)c.moveTo(x,y);else c.lineTo(x,y);
        };
        // Visible terminator and the opposite limb enclose the night region.
        // x = -sz*cos(t), y = sin(t) solves normal dot sunlight = 0.
        for(let i=0;i<=120;i++) {
          const t=-Math.PI/2+i*Math.PI/120;
          point(-sz*Math.cos(t),Math.sin(t),i===0);
        }
        for(let i=120;i>=0;i--) {
          const t=-Math.PI/2+i*Math.PI/120;
          point(-Math.cos(t),Math.sin(t));
        }
        c.closePath();
      }
      c.fill();c.restore();
    }
    localHemisphere() {
      const {latitude,longitude}=this.location, c=this.ctx;
      const at=(a,h)=>P.localSky(latitude,longitude,a,h);
      const center=P.earthVector(latitude,longitude).map(x=>x*1.015);
      const anchor=this.project(center), back=anchor.depth<0, dash=back?[3,3]:[];
      const ring=[];
      for(let a=0;a<=360;a+=6)ring.push(this.project(at(a,0)));
      this.line(ring,1.4,dash);
      for(const a of [0,90]) {
        const arc=[];
        for(let t=0;t<=180;t+=6)arc.push(this.project(at(t<=90?a:a+180,t<=90?t:180-t)));
        this.line(arc,1.1,dash);
      }
      const zenith=this.project(at(0,90));
      this.line([anchor,zenith],.8,[2,3]);
      c.fillStyle=this.paper;c.fillRect(anchor.x-4,anchor.y-4,8,8);
      c.fillStyle=this.ink;
      if(back)c.strokeRect(anchor.x-2.5,anchor.y-2.5,5,5);else c.fillRect(anchor.x-2.5,anchor.y-2.5,5,5);
      if(this.localSun && this.localSun.altitude>=0) {
        const p=this.project(at(this.localSun.azimuth,this.localSun.altitude));
        this.line([anchor,p],.8,dash);c.beginPath();c.arc(p.x,p.y,2.4,0,2*Math.PI);c.stroke();
      }
    }
    subsolarMark(latitude, longitude) {
      const c = this.ctx, p = this.project(P.earthVector(latitude, longitude));
      c.fillStyle = this.paper; c.beginPath(); c.arc(p.x, p.y, 7, 0, 2*Math.PI); c.fill();
      c.fillStyle = this.ink; c.lineWidth = 1.3;
      c.beginPath();c.arc(p.x,p.y,4.5,0,2*Math.PI);c.stroke();
      if(p.depth>=0){c.beginPath();c.arc(p.x,p.y,1.4,0,2*Math.PI);c.fill();}
    }
    arrows(sun) {
      const c = this.ctx, f = this.frame;
      const p = this.project(P.earthVector(sun.latitude, sun.longitude));
      const dx = (p.x-f.cx)/f.radius, dy = (p.y-f.cy)/f.radius, length = Math.hypot(dx,dy);
      if (length < .12) {
        c.lineWidth=1;c.beginPath();c.arc(f.cx,25,6,0,2*Math.PI);c.stroke();
        if(p.depth>0){c.beginPath();c.arc(f.cx,25,1.5,0,2*Math.PI);c.fill();}
        else {
          this.line([{x:f.cx-3,y:22},{x:f.cx+3,y:28}],1);
          this.line([{x:f.cx-3,y:28},{x:f.cx+3,y:22}],1);
        }
        return;
      }
      const ux = dx/length, uy = dy/length;
      for (const shift of [-.23,0,.23]) {
        const start = {x:f.cx+f.radius*(1.54*ux-shift*uy),y:f.cy+f.radius*(1.54*uy+shift*ux)};
        const end = {x:f.cx+f.radius*(1.07*ux-shift*uy),y:f.cy+f.radius*(1.07*uy+shift*ux)};
        this.line([start,end],.95);
        this.line([{x:end.x+7*ux+3*uy,y:end.y+7*uy-3*ux},end,{x:end.x+7*ux-3*uy,y:end.y+7*uy+3*ux}],.95);
      }
      // The arrows indicate the projected illumination direction only;
      // foreshortening and front/back direction are conveyed by the subsolar marker.
      c.setLineDash([]);
    }
    draw() {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const w=rect.width,h=rect.height,dpr=Math.min(window.devicePixelRatio||1,3),c=this.ctx;
      this.width=w;this.height=h;
      if (this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)) {this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}
      c.setTransform(dpr,0,0,dpr,0,0);
      const style=getComputedStyle(document.documentElement);
      this.ink=style.getPropertyValue('--ink').trim();this.paper=style.getPropertyValue('--paper').trim();
      c.fillStyle=this.paper;c.fillRect(0,0,w,h);c.fillStyle=this.ink;c.strokeStyle=this.ink;
      c.lineCap='round';c.lineJoin='round';
      this.frame={cx:w*.5,cy:h*.46,radius:Math.min(w*.285,h*.31)};
      const f=this.frame;
      this.referencePlane();
      this.lighting();
      for (const latitude of [-60,-30,0,30,60]) {
        const ring=[];for(let lon=0;lon<=360;lon+=3)ring.push(P.earthVector(latitude,lon));
        this.curve(ring,latitude===0?.85:.6,[1,5],[1,7]);
      }
      for(let longitude=0;longitude<180;longitude+=30) {
        const meridian=[];
        for(let t=0;t<=360;t+=3) {const a=t*Math.PI/180,l=longitude*Math.PI/180;meridian.push([Math.cos(a)*Math.cos(l),Math.cos(a)*Math.sin(l),Math.sin(a)]);}
        this.curve(meridian,.6,[1,5],[1,7]);
      }
      c.lineWidth=1;c.beginPath();c.arc(f.cx,f.cy,f.radius,0,2*Math.PI);c.stroke();
      const north=this.project([0,0,1.35]),south=this.project([0,0,-1.35]);
      this.line([north,south],.65,[3,5]);
      if(this.sun) {
        this.curve(P.terminator(this.sun.latitude,this.sun.longitude),1.1,[8,3,1,3],[1,6]);
        this.curve(this.track.map(p=>P.earthVector(p.latitude,p.longitude)),1.9,[],[6,5]);
        this.arrows(this.sun);
        this.subsolarMark(this.sun.latitude,this.sun.longitude);
      }
      this.localHemisphere();
      this.poleLabel('N',north);this.poleLabel('S',south);
    }
  }
  root.EarthView=EarthView;
})(globalThis);
