CREATE TABLE public.product_image_provenance (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  provider text NOT NULL,
  gtin text,
  source_url text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.product_image_provenance TO authenticated;
GRANT ALL ON public.product_image_provenance TO service_role;

ALTER TABLE public.product_image_provenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_image_provenance_admin_select
ON public.product_image_provenance
FOR SELECT TO authenticated
USING (public.is_admin());

COMMENT ON TABLE public.product_image_provenance IS 'Origem auditável das imagens importadas automaticamente (provedor, GTIN consultado, URL de origem, data).';
