const distanceXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Remove only a serialized leading duplicate anchor; preserve every authored bend. */
export function riverControlPoints(spline) {
  const points = spline.controlPoints.filter(point =>
    Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z));
  if (points.length < 3) return points;
  const steps = points.slice(2).map((point, i) => distanceXZ(point, points[i + 1]))
    .filter(step => step > 0).sort((a, b) => a - b);
  const usual = steps[Math.floor(steps.length / 2)] ?? 0;
  const first = distanceXZ(points[0], points[1]);
  const duplicate = points.slice(3, 10).some(point => distanceXZ(point, points[0]) < 8);
  return duplicate && first > usual * 3 ? points.slice(1) : points;
}
