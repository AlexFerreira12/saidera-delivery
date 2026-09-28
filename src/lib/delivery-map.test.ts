import { describe, expect, it } from "vitest";
import { wazeDeliveryUrl } from "./waze";
import { isInsideDeliveryPolygon } from "./delivery-geofence";
const base = { street: "Rua Nova", number: "12", neighborhood: "Loteamento Novo", city: "Guariba", state: "SP" };
describe("Waze route", () => {
  it("prioritizes confirmed coordinates", () => expect(wazeDeliveryUrl({ ...base, latitude: -21.36, longitude: -48.23 })).toBe("https://waze.com/ul?ll=-21.36%2C-48.23&navigate=yes"));
  it("falls back to encoded address", () => expect(wazeDeliveryUrl(base)).toContain("q=Rua%20Nova%2C%2012"));
  it("rejects invalid coordinates", () => expect(wazeDeliveryUrl({ ...base, latitude: 999, longitude: 1 })).toContain("?q="));
});
describe("urban geofence", () => {
  const polygon = [{latitude:0,longitude:0},{latitude:0,longitude:2},{latitude:2,longitude:2},{latitude:2,longitude:0}];
  it("accepts interior and boundary", () => {expect(isInsideDeliveryPolygon({latitude:1,longitude:1},polygon)).toBe(true);expect(isInsideDeliveryPolygon({latitude:0,longitude:1},polygon)).toBe(true);});
  it("rejects exterior and missing perimeter", () => {expect(isInsideDeliveryPolygon({latitude:3,longitude:1},polygon)).toBe(false);expect(isInsideDeliveryPolygon({latitude:1,longitude:1},[])).toBe(false);});
});
