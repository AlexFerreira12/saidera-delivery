/** Approved SAIDERA delivery policy. Backend must independently enforce it. */
export const DELIVERY_POLICY = {
  city: "Guariba",
  state: "SP",
  urbanOnly: true,
  flatFeeCents: 599,
} as const;

/** Only a preliminary city/state check; not proof of urban-area eligibility. */
export function isGuaribaCityAddress(address: { city?: string | null; state?: string | null }): boolean {
  const normalize = (value: string | null | undefined) =>
    (value ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").trim().toLowerCase();
  return normalize(address.city) === "guariba" && normalize(address.state) === "sp";
}

/** For display only after the backend is migrated to the same policy. */
export const GUARIBA_FLAT_DELIVERY_FEE = DELIVERY_POLICY.flatFeeCents / 100;
