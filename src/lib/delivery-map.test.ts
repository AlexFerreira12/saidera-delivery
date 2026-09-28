import { describe, expect, it } from "vitest";
import { wazeDeliveryUrl } from "./waze";
import { isInsideDeliveryPolygon } from "./delivery-geofence";
const base = {
  street: "Rua Nova",
  number: "12",
  neighborhood: "Loteamento Novo",
  city: "Guariba",
  state: "SP",
};
describe("Waze route", () => {
  it("prioritizes confirmed coordinates", () =>
    expect(wazeDeliveryUrl({ ...base, latitude: -21.36, longitude: -48.23 })).toBe(
      "https://waze.com/ul?ll=-21.36%2C-48.23&navigate=yes",
    ));
  it("falls back to encoded address", () =>
    expect(wazeDeliveryUrl(base)).toContain("q=Rua%20Nova%2C%2012"));
  it("rejects invalid coordinates", () =>
    expect(wazeDeliveryUrl({ ...base, latitude: 999, longitude: 1 })).toContain("?q="));
});
describe("urban geofence", () => {
  const polygon = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 2 },
    { latitude: 2, longitude: 2 },
    { latitude: 2, longitude: 0 },
  ];
  it("accepts interior and boundary", () => {
    expect(isInsideDeliveryPolygon({ latitude: 1, longitude: 1 }, polygon)).toBe(true);
    expect(isInsideDeliveryPolygon({ latitude: 0, longitude: 1 }, polygon)).toBe(true);
  });
  it("rejects exterior and missing perimeter", () => {
    expect(isInsideDeliveryPolygon({ latitude: 3, longitude: 1 }, polygon)).toBe(false);
    expect(isInsideDeliveryPolygon({ latitude: 1, longitude: 1 }, [])).toBe(false);
  });
});

describe("Guariba delivery perimeter regression", () => {
  const urbanBaseline = [
    { latitude: -21.3653738, longitude: -48.2596604 },
    { latitude: -21.3455539, longitude: -48.2368285 },
    { latitude: -21.3333009, longitude: -48.222718 },
    { latitude: -21.3369022, longitude: -48.2110703 },
    { latitude: -21.3395093, longitude: -48.2026362 },
    { latitude: -21.3396737, longitude: -48.2022491 },
    { latitude: -21.3398386, longitude: -48.2019626 },
    { latitude: -21.3401511, longitude: -48.201646 },
    { latitude: -21.3406713, longitude: -48.2015658 },
    { latitude: -21.3415421, longitude: -48.2016437 },
    { latitude: -21.3434445, longitude: -48.201959 },
    { latitude: -21.3457931, longitude: -48.2024359 },
    { latitude: -21.3474705, longitude: -48.2029762 },
    { latitude: -21.3478464, longitude: -48.2032448 },
    { latitude: -21.3478953, longitude: -48.2032438 },
    { latitude: -21.3479635, longitude: -48.2032425 },
    { latitude: -21.3480119, longitude: -48.2032416 },
    { latitude: -21.3485846, longitude: -48.2034493 },
    { latitude: -21.349014, longitude: -48.2035809 },
    { latitude: -21.3496073, longitude: -48.2035091 },
    { latitude: -21.3501424, longitude: -48.2034799 },
    { latitude: -21.3505276, longitude: -48.2033593 },
    { latitude: -21.3511916, longitude: -48.2032207 },
    { latitude: -21.3517913, longitude: -48.203016 },
    { latitude: -21.3528352, longitude: -48.2026875 },
    { latitude: -21.353091, longitude: -48.2025282 },
    { latitude: -21.353376, longitude: -48.2022081 },
    { latitude: -21.3535676, longitude: -48.2020324 },
    { latitude: -21.3537559, longitude: -48.2019675 },
    { latitude: -21.3541118, longitude: -48.2019319 },
    { latitude: -21.3545818, longitude: -48.201879 },
    { latitude: -21.3554744, longitude: -48.2016913 },
    { latitude: -21.3560152, longitude: -48.2017233 },
    { latitude: -21.3714291, longitude: -48.2026354 },
    { latitude: -21.3715272, longitude: -48.2029757 },
    { latitude: -21.3717539, longitude: -48.203966 },
    { latitude: -21.3718193, longitude: -48.2042582 },
    { latitude: -21.3719693, longitude: -48.2046184 },
    { latitude: -21.3724241, longitude: -48.2053099 },
    { latitude: -21.3763664, longitude: -48.2099639 },
    { latitude: -21.3849707, longitude: -48.2090265 },
    { latitude: -21.3869394, longitude: -48.2332656 },
    { latitude: -21.3796438, longitude: -48.2495618 },
  ];

  it("keeps the 43-vertex staging baseline intact", () => {
    expect(urbanBaseline).toHaveLength(43);
  });

  it("accepts a central point and rejects clearly external points", () => {
    expect(isInsideDeliveryPolygon({ latitude: -21.36, longitude: -48.23 }, urbanBaseline)).toBe(\n      true,\n    );
    expect(isInsideDeliveryPolygon({ latitude: -21.4, longitude: -48.23 }, urbanBaseline)).toBe(\n      false,\n    );
    expect(isInsideDeliveryPolygon({ latitude: -21.35, longitude: -48.18 }, urbanBaseline)).toBe(\n      false,\n    );
  });
});
