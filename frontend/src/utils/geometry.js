// Geometry utilities: Douglas-Peucker simplification & optional Chaikin smoothing
// Coordinates format: [lat, lng]

export function simplifyDouglasPeucker(points, tolerance = 0.001) {
  if (!Array.isArray(points) || points.length < 3) return points.slice();
  const sqTol = tolerance * tolerance;

  function getSqSegDist(p, p1, p2) {
    let x = p1[1];
    let y = p1[0];
    let dx = p2[1] - x;
    let dy = p2[0] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[1] - x) * dx + (p[0] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = p2[1];
        y = p2[0];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[1] - x;
    dy = p[0] - y;
    return dx * dx + dy * dy;
  }

  const markers = new Uint8Array(points.length);
  const first = 0;
  const last = points.length - 1;
  const stack = [];
  const simplified = [];
  markers[first] = 1;
  markers[last] = 1;

  stack.push(first, last);
  while (stack.length) {
    const l = stack.pop();
    const f = stack.pop();
    let maxDist = 0;
    let index = -1;

    for (let i = f + 1; i < l; i++) {
      const dist = getSqSegDist(points[i], points[f], points[l]);
      if (dist > maxDist) {
        index = i;
        maxDist = dist;
      }
    }
    if (maxDist > sqTol && index !== -1) {
      markers[index] = 1;
      if (index - f > 1) stack.push(f, index);
      if (l - index > 1) stack.push(index, l);
    }
  }

  for (let i = 0; i < points.length; i++)
    if (markers[i]) simplified.push(points[i]);
  return simplified;
}

export function chaikinSmooth(points, iterations = 1) {
  if (points.length < 3) return points.slice();
  let pts = points.slice();
  for (let iter = 0; iter < iterations; iter++) {
    const newPts = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const Q = [0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]];
      const R = [0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]];
      newPts.push(Q, R);
    }
    // close ring
    newPts.push(newPts[0]);
    pts = newPts;
  }
  return pts;
}
