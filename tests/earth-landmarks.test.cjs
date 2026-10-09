const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/time.js');
const S = require('../src/solar.js');
const P = require('../src/projection.js');
const near = (a,b,tolerance=1e-8) => assert.ok(Math.abs(a-b)<=tolerance, `${a} vs ${b}`);
const longitudeDelta = (a,b) => ((a-b+180)%360+360)%360-180;

test('Subsolar coordinates match independent NREL geocentric data and local zenith', () => {
  // NREL/TP-560-34302 Table A5.1: geocentric declination -9.31434°,
  // local geocentric hour angle 11.105900° at longitude -105.1786°.
  // Subsolar longitude = observer longitude - hour angle = -116.2845°.
  const ms = Date.UTC(2003,9,17,19,30,30), p = S.subsolar(ms);
  near(p.latitude,-9.31434,.02); near(p.longitude,-116.2845,.02);
  near(S.position(ms,{latitude:p.latitude,longitude:p.longitude,elevation:0}).altitude,90,.02);
  const later = S.subsolar(ms+3600000);
  near(longitudeDelta(later.longitude,p.longitude),-15,.05);
});

test('Daily subsolar path stays continuous on the sphere across the longitude wrap', () => {
  for(const date of ['2026-03-20','2026-06-21','2026-12-21']) {
    const points=S.subsolarTrajectory(date);
    assert.equal(points.length,145);
    assert.equal(points[0].ms,T.start(date)); assert.equal(points.at(-1).ms,T.start(date)+T.DAY);
    let total=0,wraps=0;
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i];
      assert.ok(b.longitude>=-180&&b.longitude<180);
      const delta=longitudeDelta(b.longitude,a.longitude);
      assert.ok(delta<0&&delta>-3); total+=delta;
      if(Math.abs(b.longitude-a.longitude)>180)wraps++;
      const u=P.earthVector(a.latitude,a.longitude),v=P.earthVector(b.latitude,b.longitude);
      assert.ok(Math.hypot(...v.map((x,j)=>x-u[j]))<.05);
    }
    near(total,-360,.5);assert.equal(wraps,1);
  }
  assert.ok(S.subsolar(T.start('2026-06-21')).latitude>23);
  assert.ok(S.subsolar(T.start('2026-12-21')).latitude<-23);
});

test('Earth projection identifies front/back and terminator is perpendicular to sunlight', () => {
  const camera={latitude:18,longitude:90},frame={cx:100,cy:100,radius:80};
  const front=P.earth(P.earthVector(18,90),camera,frame);
  near(front.x,100);near(front.y,100);near(front.depth,1);
  near(P.earth(P.earthVector(-18,-90),camera,frame).depth,-1);
  for(const [lat,lon] of [[23.4,116],[-23.4,-170],[0,180],[90,0]]) {
    const sun=P.earthVector(lat,lon),circle=P.terminator(lat,lon);
    for(const v of circle) {near(Math.hypot(...v),1);near(v.reduce((sum,x,i)=>sum+x*sun[i],0),0);}
    circle[0].forEach((v,i)=>near(v,circle.at(-1)[i]));
  }
});

test('Astronomical ecliptic conversion retains obliquity, solar alignment and angles', () => {
  for(const date of ['1900-03-20','2026-06-21','2026-12-21','2100-09-22']) {
    for(const hour of [0,6,12,18]) {
      const ms=T.start(date)+hour*3600000, o=S.earthOrientation(ms);
      const pole=P.ecliptic([0,0,1],o);
      near(Math.hypot(...pole),1);
      const tilt=Math.acos(pole[2])*180/Math.PI;
      assert.ok(tilt>23.3&&tilt<23.6);
      const s=S.subsolar(ms), sun=P.ecliptic(P.earthVector(s.latitude,s.longitude),o);
      assert.ok(Math.abs(sun[2])<.0001, 'Sun stays in the ecliptic plane');
      const u=P.earthVector(20,110),v=P.earthVector(-34,-160);
      const a=P.ecliptic(u,o),b=P.ecliptic(v,o);
      near(a.reduce((sum,x,i)=>sum+x*b[i],0),u.reduce((sum,x,i)=>sum+x*v[i],0));
    }
  }
});

test('Actual Earth view keeps poles fixed across calendar and clock changes, with sidereal axial spin', () => {
  const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
  const labels=[],handlers={};
  const ctx=new Proxy({fillText:(name,x,y)=>labels.push({name,x,y})},{get:(obj,key)=>key in obj?obj[key]:()=>{}});
  const canvas={getContext:()=>ctx,getBoundingClientRect:()=>({width:258,height:350}),classList:{add(){},remove(){}},addEventListener:(k,fn)=>{handlers[k]=fn;},setPointerCapture(){}};
  const scope={SunProjection:P,SunSolar:S,ResizeObserver:class{observe(){}},window:{devicePixelRatio:1},document:{documentElement:{dataset:{theme:'light'}}},getComputedStyle:()=>({getPropertyValue:k=>k==='--ink'?'#20251f':'#faf9f5'})};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/earth.js'),'utf8'),scope);
  const view=new scope.EarthView(canvas);
  const show=(date,hour)=>{
    const ms=T.start(date)+hour*3600000;
    view.orientation=S.earthOrientation(ms);view.sun=S.subsolar(ms);view.localSun=S.position(ms);
    labels.length=0;view.draw();
    assert.deepEqual(labels.map(p=>p.name),['N','S']);
    return view.project([0,0,1]);
  };
  const first=show('2026-06-21',0),f=view.frame;
  const tilt=Math.atan2(first.x-f.cx,f.cy-first.y)*180/Math.PI;
  near(tilt,23.44,.05);
  for(const date of ['1900-01-01','2026-03-20','2026-12-22','2100-12-31'])for(const hour of [0,6,12,23]) {
    const pole=show(date,hour);near(pole.x,first.x);near(pole.y,first.y);near(pole.depth,first.depth);
  }
  const screenVector=p=>[(p.x-f.cx)/f.radius,-(p.y-f.cy)/f.radius,p.depth];
  show('2026-06-21',0);const before=screenVector(view.project([1,0,0]));
  show('2026-06-21',6);const after=screenVector(view.project([1,0,0]));
  const axis=screenVector(view.project([0,0,1]));
  const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
  near(dot(before,axis),0);near(dot(after,axis),0);
  near(Math.acos(dot(before,after))*180/Math.PI,90.2464,.001);
  handlers.pointerdown({clientX:0,clientY:0,pointerId:1});
  handlers.pointermove({clientX:70,clientY:40});handlers.pointerup();
  const dragged=view.project([0,0,1]);
  const later=show('2026-12-22',18);near(later.x,dragged.x);near(later.y,dragged.y);
  view.reset();const reset=view.project([0,0,1]);near(reset.x,first.x);near(reset.y,first.y);
});

test('Free Earth camera preserves geometry and allows the ecliptic to tilt', () => {
  let camera=P.earthCamera();
  for(let i=0;i<200;i++)camera=P.turnEarth(camera,3,-2);
  const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)near(dot(camera[i],camera[j]),i===j?1:0);
  // Use a deliberate diagonal view for tilt; repeated turns can return close
  // to the default orientation after completing several revolutions.
  camera=P.turnEarth(P.turnEarth(P.earthCamera(),40,25),30,0);
  const frame={cx:0,cy:0,radius:1};
  const a=P.earthScene([1,0,0],camera,frame),b=P.earthScene([0,1,0],camera,frame);
  const normal=P.earthScene([0,0,1],camera,frame);
  assert.ok(Math.abs(normal.x)>.1,'Ecliptic normal tilts sideways, so its ring is not locked level');
  near(a.x*a.x+a.y*a.y+a.depth*a.depth,1);
});

test('Local sky hemisphere is tangent at the observer and uses the same north/east/up convention', () => {
  for(const [lat,lon] of [[39.9042,116.4074],[0,0],[-40,-120],[90,20]]) {
    const u=P.earthVector(lat,lon),center=u.map(x=>1.015*x);
    const offset=(a,h)=>P.localSky(lat,lon,a,h).map((x,i)=>x-center[i]);
    const north=offset(0,0),east=offset(90,0),up=offset(0,90);
    const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
    near(dot(north,u),0);near(dot(east,u),0);near(dot(north,east),0);
    near(dot(up,u),.28);
    const latitude=lat*Math.PI/180,longitude=lon*Math.PI/180;
    near(east[0],-.28*Math.sin(longitude));near(north[2],.28*Math.cos(latitude));
    for(const [a,h] of [[0,0],[90,0],[238,42],[0,90]])near(Math.hypot(...offset(a,h)),.28);
  }
});

test('Annual markers handle leap years, extrema and discrete closest-to-12-hour dates', () => {
  for(const year of [1900,2024,2026,2100]) {
    const markers=S.yearLandmarks(year);
    assert.equal(markers.length,4);
    assert.deepEqual(markers.map(m=>m.kind),['equal','longest','equal','shortest']);
    for(const m of markers) {
      assert.equal(m.index,T.dayIndex(m.date));assert.equal(Number(m.date.slice(0,4)),year);
      const prev=S.events(T.dateString(T.start(m.date)-T.DAY)).daylight;
      const next=S.events(T.dateString(T.start(m.date)+T.DAY)).daylight;
      if(m.kind==='longest')assert.ok(m.daylight>=prev&&m.daylight>=next);
      if(m.kind==='shortest')assert.ok(m.daylight<=prev&&m.daylight<=next);
      if(m.kind==='equal') {
        assert.ok(Math.abs(m.daylight-43200)<90);
        assert.ok(Math.abs(m.daylight-43200)<=Math.abs(prev-43200));
        assert.ok(Math.abs(m.daylight-43200)<=Math.abs(next-43200));
      }
    }
  }
});

test('Final offline artifact includes Earth and both marker groups without the removed name', () => {
  const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../dist/index.html'),'utf8');
  assert.ok(!html.includes('日迹'));
  for(const id of ['earth','subsolar-coordinates','date-markers','time-markers'])assert.ok(html.includes(`id="${id}"`));
  assert.ok(html.includes('class EarthView'));
});
