import { supabase } from "@/integrations/supabase/client";

export type Address = {
  id: string;
  label: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  reference: string | null;
  zipcode: string | null;
  is_default: boolean;
  latitude: number | null;
  longitude: number | null;
};

export async function fetchAddresses() {
  const { data, error } = await supabase
    .from("addresses")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Address[];
}
