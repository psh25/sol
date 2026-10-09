const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/time.js');
const S = require('../src/solar.js');
const P = require('../src/projection.js');
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}, tolerance ${tolerance}`);

test('Beijing clock stays UTC+8 regardless of machine timezone and crosses dates correctly', () => {
  assert.equal(T.start('2026-01-01'), Date.UTC(2025, 11, 31, 16));
  assert.deepEqual(T.now(Date.UTC(2026, 0, 1, 17, 2, 3)), { date: '2026-01-02', seconds: 3723 });
  assert.equal(T.dateString(T.start('2026-12-31') + T.DAY), '2027-01-01');
  assert.equal(T.dateString(T.start('2026-01-01') - T.DAY), '2025-12-31');
});

test('Gregorian leap years, slider endpoints and February clamping', () => {
  for (const [y, n] of [[1900, 365], [2000, 366], [2024, 366], [2026, 365], [2100, 365]]) {
    assert.equal(T.yearDays(y), n);
    assert.equal(T.fromDay(y, n - 1), `${y}-12-31`);
    assert.equal(T.dayIndex(`${y}-12-31`), n - 1);
  }
  assert.equal(T.validDate('1900-02-29'), false);
  assert.equal(T.validDate('2000-02-29'), true);
  assert.equal(T.validDate('2100-02-29'), false);
  assert.equal(T.validDate('2026-04-31'), false);
  assert.equal(T.validDate('1899-12-31'), false);
  assert.equal(T.validDate('2101-01-01'), false);
  assert.equal(T.changeYear('2024-02-29', 2025), '2025-02-28');
  assert.equal(T.changeYear('2024-02-29', 2000), '2000-02-29');
});

test('Clock inputs include seconds and exclude 24:00', () => {
  assert.equal(T.parseTime('23:59:59'), 86399);
  assert.equal(T.parseTime('08:30'), 30600);
  for (const s of ['24:00', '12:60:00', '12:00:60', '', 'xx:yy']) assert.equal(T.parseTime(s), null);
  assert.equal(T.timeString(86399), '23:59:59');
  assert.equal(T.timeString(86400), '00:00:00');
});

test('2D compass orientation, zenith and underground projection', () => {
  const f = { cx: 100, cy: 100, radius: 90 };
  for (const [a, x, y] of [[0,100,10], [90,190,100], [180,100,190], [270,10,100]]) {
    const p = P.flat(a, 0, f); near(p.x, x); near(p.y, y);
  }
  const zenith = P.flat(270, 90, f); near(zenith.x, 100); near(zenith.y, 100);
  near(P.flat(90, 45, f).x, 145);
  assert.ok(P.flat(90, -30, f).x > 190);
  near(P.vector(90, 0).east, 1); near(P.vector(0, 0).north, 1); near(P.vector(0, 90).up, 1);
});

test('Independent NREL SPA reference, Table A5.1 (2003-10-17, Golden Colorado)', () => {
  // https://docs.nlr.gov/docs/fy08osti/34302.pdf, Appendix A.5, pp. A-15/A-16.
  // 12:30:30 UTC-7, lat 39.742476, lon -105.1786, elevation 1830.14 m.
  // Geometric altitude is independently derived from published topocentric
  // declination -9.316179° and hour angle 11.10629°. No refraction is compared.
  const p = S.position(Date.UTC(2003, 9, 17, 19, 30, 30), { latitude: 39.742476, longitude: -105.1786, elevation: 1830.14 });
  const r = Math.PI / 180;
  const altitude = Math.asin(Math.sin(39.742476*r)*Math.sin(-9.316179*r) + Math.cos(39.742476*r)*Math.cos(-9.316179*r)*Math.cos(11.10629*r)) / r;
  near(p.azimuth, 194.34024, .02);
  near(p.altitude, altitude, .02);
});

test('Seasonal trajectories and horizon intersections, including supported year boundaries', () => {
  for (const date of ['1900-01-01', '2000-02-29', '2026-03-20', '2026-06-21', '2026-09-23', '2026-12-21', '2100-12-31']) {
    const points = S.trajectory(date);
    assert.equal(points[0].ms, T.start(date));
    assert.equal(points.at(-1).ms, T.start(date) + T.DAY);
    assert.equal(points.filter(p => p.altitude === 0).length, 2);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      assert.ok(Number.isFinite(p.altitude) && p.altitude >= -90 && p.altitude <= 90);
      assert.ok(Number.isFinite(p.azimuth) && p.azimuth >= 0 && p.azimuth < 360);
      if (i) { assert.ok(p.ms > points[i-1].ms); assert.ok(p.altitude * points[i-1].altitude >= 0); }
      if (p.altitude === 0) near(S.position(p.ms).altitude, 0, .00001);
    }
  }
});

test('Beijing daily events, geometric horizon versus upper-limb sunrise, and seasonal daylight', () => {
  const lengths = [];
  for (const date of ['2026-06-21', '2026-12-21']) {
    const e = S.events(date);
    for (const time of [e.sunrise, e.sunset, e.noon]) assert.equal(T.dateString(time.date.getTime()), date);
    assert.ok(e.sunrise.date < e.noon.date && e.noon.date < e.sunset.date);
    near(S.position(e.noon.date.getTime()).azimuth, 180, .01);
    const h = S.position(e.sunrise.date.getTime()).altitude;
    assert.ok(h < -.7 && h > -.95);
    assert.ok(e.daylight > 30000 && e.daylight < 60000);
    lengths.push(e.daylight);
  }
  assert.ok(lengths[0] > lengths[1] + 18000);
});

test('Calculation core accepts other locations and polar day/night without missing-event crashes', () => {
  const north = { latitude: 89, longitude: 0, elevation: 0 };
  const summer = S.events('2026-06-21', north), winter = S.events('2026-12-21', north);
  assert.equal(summer.sunrise, null); assert.equal(summer.sunset, null); assert.equal(summer.daylight, 86400);
  assert.equal(winter.sunrise, null); assert.equal(winter.sunset, null); assert.equal(winter.daylight, 0);
});

test('Offline distribution has no external scripts, styles, imports, fonts or fetch calls', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '../dist/index.html'), 'utf8');
  assert.ok(!/<script[^>]+src=/i.test(html));
  assert.ok(!/<link[^>]+href=/i.test(html));
  assert.ok(!/\bfetch\s*\(/.test(html));
  assert.ok(!/type=["']module["']/.test(html));
  assert.ok(html.includes('Astronomy Engine'));
  assert.ok(html.includes('Permission is hereby granted'));
});
