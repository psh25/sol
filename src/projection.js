(function (root) {
  'use strict';
  const rad = Math.PI / 180;
  function vector(azimuth, altitude) {
    const a = azimuth * rad, h = altitude * rad;
    return { east: Math.cos(h) * Math.sin(a), north: Math.cos(h) * Math.cos(a), up: Math.sin(h) };
  }
  function dome(azimuth, altitude, camera, frame) {
    const v = vector(azimuth, altitude);
    const yaw = camera.yaw * rad, pitch = camera.pitch * rad;
    const right = v.east * Math.cos(yaw) - v.north * Math.sin(yaw);
    const forward = v.east * Math.sin(yaw) + v.north * Math.cos(yaw);
    return { x: frame.cx + frame.radius * right, y: frame.cy - frame.radius * (v.up * Math.cos(pitch) + forward * Math.sin(pitch)), depth: v.up * Math.sin(pitch) - forward * Math.cos(pitch) };
  }
  function flat(azimuth, altitude, frame) {
    const r = frame.radius * (90 - altitude) / 90;
    return { x: frame.cx + r * Math.sin(azimuth * rad), y: frame.cy - r * Math.cos(azimuth * rad) };
  }
  function earthVector(latitude, longitude) {
    const lat = latitude * rad, lon = longitude * rad;
    return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  }
  function earth(v, camera, frame) {
    const lon = camera.longitude * rad, lat = camera.latitude * rad;
    const horizontal = v[0] * Math.cos(lon) + v[1] * Math.sin(lon);
    return { x: frame.cx + frame.radius * (-v[0] * Math.sin(lon) + v[1] * Math.cos(lon)), y: frame.cy - frame.radius * (v[2] * Math.cos(lat) - horizontal * Math.sin(lat)), depth: horizontal * Math.cos(lat) + v[2] * Math.sin(lat) };
  }
  function ecliptic(v, orientation) {
    const a = orientation.sidereal * rad, m = orientation.rotation;
    const eq = [v[0]*Math.cos(a)-v[1]*Math.sin(a), v[0]*Math.sin(a)+v[1]*Math.cos(a), v[2]];
    return [0,1,2].map(j => eq.reduce((sum, x, i) => sum + x*m[i][j], 0));
  }
  function earthCamera() {
    // View along ecliptic +X: Earth's obliquity appears as a screen tilt.
    // Rows are screen right, screen up, and camera-facing depth.
    return [[0,1,0],[0,0,1],[1,0,0]];
  }
  function turnEarth(camera, yaw, pitch) {
    // Rotate about screen axes rather than pinning a celestial plane upright.
    const a=yaw*rad,b=pitch*rad;
    const right=camera[0].map((x,i)=>x*Math.cos(a)+camera[2][i]*Math.sin(a));
    const depth=camera[2].map((x,i)=>x*Math.cos(a)-camera[0][i]*Math.sin(a));
    return [right,
      camera[1].map((x,i)=>x*Math.cos(b)-depth[i]*Math.sin(b)),
      depth.map((x,i)=>x*Math.cos(b)+camera[1][i]*Math.sin(b))];
  }
  function earthScene(v, camera, frame) {
    const [right,up,depth]=camera.map(row=>row.reduce((sum,x,i)=>sum+x*v[i],0));
    return {x:frame.cx+frame.radius*right,y:frame.cy-frame.radius*up,depth};
  }
  function localSky(latitude, longitude, azimuth, altitude, radius = .28) {
    const lat = latitude * rad, lon = longitude * rad;
    const up = earthVector(latitude, longitude);
    const east = [-Math.sin(lon), Math.cos(lon), 0];
    const north = [-Math.sin(lat)*Math.cos(lon), -Math.sin(lat)*Math.sin(lon), Math.cos(lat)];
    const v = vector(azimuth, altitude);
    // Enlarged tangent hemisphere, lifted slightly above the spherical surface.
    return up.map((x,i) => 1.015*x + radius*(east[i]*v.east + north[i]*v.north + x*v.up));
  }
  function terminator(latitude, longitude) {
    const s = earthVector(latitude, longitude);
    const norm = Math.hypot(s[0], s[1]);
    const a = norm > 1e-10 ? [s[1] / norm, -s[0] / norm, 0] : [1, 0, 0];
    const b = [s[1]*a[2]-s[2]*a[1], s[2]*a[0]-s[0]*a[2], s[0]*a[1]-s[1]*a[0]];
    const points = [];
    for (let degree = 0; degree <= 360; degree += 3) {
      const t = degree * rad;
      points.push(a.map((v, i) => v * Math.cos(t) + b[i] * Math.sin(t)));
    }
    return points;
  }
  const api = { vector, dome, flat, earthVector, earth, ecliptic, earthCamera, turnEarth, earthScene, localSky, terminator };
  root.SunProjection = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
