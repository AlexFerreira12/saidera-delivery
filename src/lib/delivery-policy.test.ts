import { describe, expect, it } from "vitest";
import { DELIVERY_POLICY, GUARIBA_FLAT_DELIVERY_FEE, isGuaribaCityAddress } from "./delivery-policy";

describe("Guariba delivery policy", () => {
  it("sets the approved flat fee to R$ 5,99", () => {
    expect(DELIVERY_POLICY.flatFeeCents).toBe(599);
    expect(GUARIBA_FLAT_DELIVERY_FEE).toBe(5.99);
    expect(DELIVERY_POLICY.urbanOnly).toBe(true);
  });

  it("accepts Guariba city regardless of neighborhood name", () => {
    expect(isGuaribaCityAddress({ city: "Guariba", state: "SP" })).toBe(true);
    expect(isGuaribaCityAddress({ city: " GUARIBA ", state: "sp" })).toBe(true);
  });

  it("rejects other municipalities in the preliminary check", () => {
    expect(isGuaribaCityAddress({ city: "Jaboticabal", state: "SP" })).toBe(false);
    expect(isGuaribaCityAddress({ city: "Guariba", state: "MG" })).toBe(false);
  });
});
