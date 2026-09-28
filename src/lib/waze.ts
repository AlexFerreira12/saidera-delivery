/** Waze universal link. Never interpolate an unvalidated external URL. */
export function wazeDeliveryUrl(address: {
  latitude?: number | null;
  longitude?: number | null;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
}): string {
  const { latitude, longitude } = address;
  if (
    latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  ) {
    return `https://waze.com/ul?ll=${encodeURIComponent(`${latitude},${longitude}`)}&navigate=yes`;
  }
  const query = [
    `${address.street}, ${address.number}`,
    address.neighborhood,
    `${address.city} - ${address.state}`,
    "Brasil",
  ].join(", ");
  return `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
}
