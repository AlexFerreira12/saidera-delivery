export type MapPoint = { latitude: number; longitude: number };
/** Ray casting on a manually approved polygon; boundary points count as inside. */
export function isInsideDeliveryPolygon(point: MapPoint, polygon: readonly MapPoint[]): boolean {
  if (polygon.length < 3 || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude))
    return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (![a.latitude, a.longitude, b.latitude, b.longitude].every(Number.isFinite)) return false;
    const cross =
      (point.longitude - a.longitude) * (b.latitude - a.latitude) -
      (point.latitude - a.latitude) * (b.longitude - a.longitude);
    if (
      Math.abs(cross) < 1e-11 &&
      point.longitude >= Math.min(a.longitude, b.longitude) &&
      point.longitude <= Math.max(a.longitude, b.longitude) &&
      point.latitude >= Math.min(a.latitude, b.latitude) &&
      point.latitude <= Math.max(a.latitude, b.latitude)
    )
      return true;
    if (a.latitude > point.latitude !== b.latitude > point.latitude) {
      const crossing =
        ((b.longitude - a.longitude) * (point.latitude - a.latitude)) / (b.latitude - a.latitude) +
        a.longitude;
      if (point.longitude < crossing) inside = !inside;
    }
  }
  return inside;
}
