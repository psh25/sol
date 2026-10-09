const test=require('node:test');
const assert=require('node:assert/strict');
const T=require('../src/time.js'),S=require('../src/solar.js');
const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} vs ${b}`);

test('Western-longitude daylight accounts for illumination on both sides of UTC+8 midnight',()=>{
  const location={latitude:37.7749,longitude:-122.4194,elevation:0};
  const e=S.events('2026-06-21',location);
  assert.ok(e.sunset.date<e.sunrise.date);
  assert.ok(e.daylight>14*3600&&e.daylight<16*3600);
  near(e.daylight,86400+(e.sunset.date-e.sunrise.date)/1000);
  const noon=S.position(e.noon.date.getTime(),location);
  assert.ok(noon.altitude>70);
});

test('Polar transition days with a single crossing have finite partial daylight',()=>{
  const location={latitude:69.6492,longitude:120,elevation:0};
  let rises=0,sets=0;
  for(const [month,first,last] of [[5,10,25],[7,15,31],[8,1,5]])for(let d=first;d<=last;d++) {
    const date=`2026-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`,e=S.events(date,location);
    assert.ok(e.daylight>=0&&e.daylight<=86400);
    if(e.sunrise&&!e.sunset){rises++;near(e.daylight,(T.start(date)+T.DAY-e.sunrise.date.getTime())/1000);}
    if(e.sunset&&!e.sunrise){sets++;near(e.daylight,(e.sunset.date.getTime()-T.start(date))/1000);}
  }
  assert.ok(rises>0&&sets>0);
});

test('Global coordinate boundaries and hemispheres produce finite paths and bounded daily durations',()=>{
  for(const [latitude,longitude] of [[90,180],[-90,-180],[0,180],[0,-180],[-33.8688,151.2093],[51.5,-.12]]) {
    const location={latitude,longitude,elevation:0};
    for(const date of ['2026-06-21','2026-12-21']) {
      const e=S.events(date,location),points=S.trajectory(date,location,600);
      assert.ok(Number.isFinite(e.daylight)&&e.daylight>=0&&e.daylight<=86400);
      assert.equal(points[0].ms,T.start(date));assert.equal(points.at(-1).ms,T.start(date)+T.DAY);
      assert.ok(points.every(p=>Number.isFinite(p.altitude)&&Number.isFinite(p.azimuth)));
      for(const event of [e.sunrise,e.sunset,e.noon])if(event)assert.equal(T.dateString(event.date.getTime()),date);
    }
  }
});

test('All crossings contribute on a near-pole day with two sunsets',()=>{
  const date='2026-09-26',location={latitude:89,longitude:0,elevation:0},e=S.events(date,location);
  assert.deepEqual(e.crossings.map(x=>x.key),['sunset','sunrise','sunset']);
  const [set1,rise,set2]=e.crossings.map(x=>x.time.date.getTime());
  near(e.daylight,(set1-T.start(date)+set2-rise)/1000);
  assert.ok(e.daylight>8*3600&&e.daylight<10*3600);
  for(const crossing of e.crossings) {
    const altitude=S.position(crossing.time.date.getTime(),location).altitude;
    assert.ok(altitude>-.95&&altitude<-.7);
  }
});

test('Annual markers use the selected hemisphere and omit nonexistent 12-hour crossings',()=>{
  const southern=S.yearLandmarks(2026,{latitude:-33.8688,longitude:151.2093,elevation:0});
  assert.ok(southern.find(m=>m.kind==='longest').date.startsWith('2026-12'));
  assert.ok(southern.find(m=>m.kind==='shortest').date.startsWith('2026-06'));
  const equator=S.yearLandmarks(2026,{latitude:0,longitude:0,elevation:0});
  assert.equal(equator.filter(m=>m.kind==='equal').length,0);
});
