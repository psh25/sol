const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const T = require('../src/time.js');
const S = require('../src/solar.js');

// Run the real interface controller with a controllable wall clock and DOM.
// This covers browser throttling and midnight without waiting in real time.
function appAt(date, seconds) {
  let ms=T.start(date)+seconds*1000, tick, nextFrame=0, dailyCalculations=0;
  const frames=new Map(), elements=new Map(), visibility=[],views=[];
  class Element {
    constructor() {
      this.value='';this.checked=false;this.hidden=false;this.textContent='';
      this.dataset={};this.style={setProperty(){}};this.classList={add(){}};
      this.children=[];this.handlers={};this.attributes={};
    }
    setAttribute(k,v){this.attributes[k]=String(v);}
    addEventListener(k,fn){(this.handlers[k]??=[]).push(fn);}
    append(child){this.children.push(child);}
    replaceChildren(){this.children=[];}
    fire(k){for(const fn of this.handlers[k]||[])fn({target:this,preventDefault(){}});}
  }
  const el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  el('follow-now').checked=true;
  class View {constructor(){this.mode='dome';views.push(this);}draw(){}reset(){}}
  const document={hidden:false,documentElement:{dataset:{}},getElementById:el,createElement:()=>new Element(),addEventListener:(k,fn)=>{if(k==='visibilitychange')visibility.push(fn);}};
  const context={document,SunTime:{...T,now:()=>T.now(ms)},SunSolar:{...S,trajectory:(...args)=>{dailyCalculations++;return S.trajectory(...args);}},SkyView:View,EarthView:View,
    requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id),setInterval:fn=>{tick=fn;},
    localStorage:{getItem:()=>null,setItem(){}},matchMedia:()=>({matches:false})};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),context);
  return {el,document,views,tick:()=>tick(),setNow:(date,seconds)=>{ms=T.start(date)+seconds*1000;},daily:()=>dailyCalculations,
    visible:hidden=>{document.hidden=hidden;visibility.forEach(fn=>fn());},
    frame:()=>{const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(1000));},
    flush:()=>{let n=0;while(frames.size){assert.ok(++n<100);const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(1000));}}};
}

test('Follow starts enabled, reads wall clock every tick and rebuilds the day at UTC+8 midnight', () => {
  const app=appAt('2026-12-31',86398);
  assert.equal(app.el('follow-now').checked,true);
  assert.equal(app.el('time').value,'23:59:58');assert.equal(app.daily(),1);
  app.setNow('2026-12-31',86399);app.tick();
  assert.equal(app.el('time').value,'23:59:59');assert.equal(app.daily(),1);
  app.setNow('2027-01-01',1);app.tick();
  assert.equal(app.el('date').value,'2027-01-01');assert.equal(app.el('year').value,2027);
  assert.equal(app.el('date-slider').value,0);assert.equal(app.el('time').value,'00:00:01');assert.equal(app.daily(),2);
  app.tick();assert.equal(app.daily(),2);
});

test('Manual edits, marker jumps and playback suspend follow; returning to current resumes it', () => {
  const app=appAt('2026-10-07',40000);
  app.el('time-slider').value='12345';app.el('time-slider').fire('input');
  assert.equal(app.el('follow-now').checked,false);
  app.setNow('2026-10-07',40100);app.tick();assert.equal(app.el('time').value,'03:25:45');
  app.el('now').fire('click');assert.equal(app.el('follow-now').checked,true);assert.equal(app.el('time').value,T.timeString(40100));
  app.el('time').value='05:00:00';app.el('time').fire('input');app.tick();
  assert.equal(app.el('time').value,'05:00:00');assert.equal(app.el('follow-now').checked,false);
  app.el('time').fire('change');app.el('now').fire('click');
  app.el('date').value='2024-02-29';app.el('date').fire('input');app.el('date').fire('change');app.frame();
  assert.equal(app.el('follow-now').checked,false);assert.equal(app.el('date').value,'2024-02-29');
  app.el('follow-now').checked=true;app.el('follow-now').fire('change');
  assert.equal(app.el('date').value,'2026-10-07');
  const sunrise=app.el('time-markers').children[0].children[0];sunrise.fire('click');
  assert.equal(app.el('follow-now').checked,false);app.tick();
  assert.equal(app.el('time').value,T.timeString((S.events('2026-10-07').sunrise.date.getTime()-T.start('2026-10-07'))/1000));
  app.el('now').fire('click');app.el('play').fire('click');
  assert.equal(app.el('follow-now').checked,false);assert.equal(app.el('play').attributes['aria-pressed'],'true');
  app.el('follow-now').checked=true;app.el('follow-now').fire('change');
  assert.equal(app.el('play').attributes['aria-pressed'],'false');assert.equal(app.el('time').value,T.timeString(40100));
});

test('Foreground recovery catches up immediately; view and theme changes preserve follow', () => {
  const app=appAt('2026-02-28',86390);
  app.el('view-flat').fire('click');app.el('theme').fire('click');app.el('reset-earth').fire('click');
  assert.equal(app.el('follow-now').checked,true);
  app.visible(true);app.setNow('2026-03-01',1800);app.tick();
  assert.equal(app.el('date').value,'2026-02-28');
  app.visible(false);assert.equal(app.el('date').value,'2026-03-01');assert.equal(app.el('time').value,'00:30:00');
  app.el('follow-now').checked=false;app.el('follow-now').fire('change');
  app.visible(true);app.setNow('2026-03-02',1800);app.visible(false);
  assert.equal(app.el('date').value,'2026-03-01');
});

test('Coordinates default to Beijing and update all views and event caches while retaining clock mode', () => {
  const app=appAt('2026-06-21',43200),sydney={latitude:-33.8688,longitude:151.2093,elevation:0};
  assert.equal(app.el('latitude').value,'39.9042');assert.equal(app.el('longitude').value,'116.4074');
  assert.equal(app.el('location-name').textContent,'北京');
  const original=app.el('altitude').textContent;
  app.el('latitude').value=String(sydney.latitude);app.el('longitude').value=String(sydney.longitude);app.el('location-form').fire('submit');
  assert.equal(app.el('date').value,'2026-06-21');assert.equal(app.el('time').value,'12:00:00');
  assert.equal(app.el('follow-now').checked,true);assert.equal(app.el('location-name').textContent,'自定义地点');
  assert.equal(app.el('altitude').textContent,S.position(T.start('2026-06-21')+43200000,sydney).altitude.toFixed(1));
  assert.notEqual(app.el('altitude').textContent,original);
  assert.equal(app.el('sunrise').textContent,T.eventTime(S.events('2026-06-21',sydney).sunrise));
  assert.equal(app.views[1].location.latitude,sydney.latitude);
  assert.equal(app.views[0].points[0].altitude,S.position(T.start('2026-06-21'),sydney).altitude);
  app.flush();
  const markerTitles=()=>app.el('date-markers').children.map(e=>e.children[0].attributes['aria-label']);
  assert.ok(markerTitles().some(t=>/^昼最长：2026-12/.test(t)));
  assert.ok(markerTitles().some(t=>/^昼最短：2026-06/.test(t)));
  const calculations=app.daily();
  app.el('reset-location').fire('click');app.flush();
  assert.equal(app.el('location-name').textContent,'北京');assert.equal(app.el('altitude').textContent,original);
  assert.equal(app.daily(),calculations,'Beijing daily cache is separate and reusable');
  assert.ok(markerTitles().some(t=>/^昼最长：2026-06/.test(t)));
  app.el('latitude').value=String(sydney.latitude);app.el('longitude').value=String(sydney.longitude);app.el('location-form').fire('submit');app.flush();
  assert.equal(app.daily(),calculations,'Sydney daily cache is reusable');
  assert.ok(markerTitles().some(t=>/^昼最长：2026-12/.test(t)));
});

test('Invalid coordinates never change the selected location, and polar locations render useful states', () => {
  const app=appAt('2026-06-21',43200),altitude=app.el('altitude').textContent;
  for(const [lat,lon] of [['','116'],['91','0'],['-91','0'],['0','181'],['0','-181'],['no','0']]) {
    app.el('latitude').value=lat;app.el('longitude').value=lon;app.el('location-form').fire('submit');app.tick();
    assert.equal(app.el('location-error').hidden,false);assert.equal(app.el('location-name').textContent,'北京');
    assert.equal(app.el('altitude').textContent,altitude);
  }
  app.el('latitude').value='90';app.el('longitude').value='180';app.el('location-form').fire('submit');
  assert.equal(app.el('location-error').hidden,true);assert.equal(app.el('sunrise').textContent,'极昼');
  assert.equal(app.el('daylight').textContent,'24 时 00 分');
  app.el('date').value='2026-12-21';app.el('date').fire('change');app.flush();
  assert.equal(app.el('sunset').textContent,'极夜');assert.equal(app.el('daylight').textContent,'0 时 00 分');
  app.el('reset-location').fire('click');
  assert.equal(app.el('date').value,'2026-12-21');assert.equal(app.el('follow-now').checked,false);
});
