-- Guard exclusivo para o PsicoPlanilhas - Acesso Vitalicio.
--
-- Esta migration cria somente schema e a RPC de reserva. Nao altera products,
-- transactions nem dados historicos.

BEGIN;

CREATE TABLE public.vitalicio_purchase_guards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  customer_document text NOT NULL,
  status text NOT NULL,
  payment_method text,
  external_reference text NOT NULL UNIQUE,
  asaas_customer_id text,
  asaas_payment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vitalicio_purchase_guards_status_check
    CHECK (status IN ('creating', 'pending', 'paid', 'failed', 'cancelled', 'unknown')),
  CONSTRAINT vitalicio_purchase_guards_customer_document_check
    CHECK (customer_document ~ '^([0-9]{11}|[0-9]{14})$')
);

CREATE UNIQUE INDEX vitalicio_purchase_guards_active_document_key
  ON public.vitalicio_purchase_guards (
    producer_id,
    product_id,
    customer_document
  )
  WHERE status IN ('creating', 'pending', 'paid', 'unknown');

CREATE UNIQUE INDEX vitalicio_purchase_guards_asaas_payment_key
  ON public.vitalicio_purchase_guards (asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;

ALTER TABLE public.vitalicio_purchase_guards ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.vitalicio_purchase_guards
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.vitalicio_purchase_guards TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_vitalicio_purchase(
  p_producer_id uuid,
  p_product_id uuid,
  p_customer_document text,
  p_payment_method text
)
RETURNS TABLE (
  result text,
  guard_id uuid,
  external_reference text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_guard_id uuid;
  v_external_reference text;
  v_existing_status text;
BEGIN
  IF p_producer_id IS DISTINCT FROM 'b803d01d-8511-4280-a4fc-dac718f3f33e'::uuid
    OR p_product_id IS DISTINCT FROM 'ad27ba35-92a5-4a60-aec8-0b82ae7c0f44'::uuid
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'reserve_vitalicio_purchase is not available for this product';
  END IF;

  IF p_customer_document IS NULL
    OR p_customer_document !~ '^([0-9]{11}|[0-9]{14})$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'customer_document must contain 11 or 14 digits';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions AS t
    WHERE t.user_id = p_producer_id
      AND t.product_id = p_product_id
      AND regexp_replace(COALESCE(t.customer_cpf_cnpj, ''), '[^0-9]', '', 'g')
        = p_customer_document
      AND upper(t.status) IN ('CONFIRMED', 'RECEIVED')
  ) THEN
    result := 'purchase_blocked';
    guard_id := NULL;
    external_reference := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions AS t
    WHERE t.user_id = p_producer_id
      AND t.product_id = p_product_id
      AND regexp_replace(COALESCE(t.customer_cpf_cnpj, ''), '[^0-9]', '', 'g')
        = p_customer_document
      AND upper(t.status) IN (
        'PENDING',
        'OVERDUE',
        'AWAITING_RISK_ANALYSIS',
        'AUTHORIZED'
      )
  ) THEN
    result := 'purchase_processing';
    guard_id := NULL;
    external_reference := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  v_guard_id := gen_random_uuid();
  v_external_reference := 'vitalicio-' || replace(v_guard_id::text, '-', '');

  INSERT INTO public.vitalicio_purchase_guards (
    id,
    producer_id,
    product_id,
    customer_document,
    status,
    payment_method,
    external_reference
  ) VALUES (
    v_guard_id,
    p_producer_id,
    p_product_id,
    p_customer_document,
    'creating',
    p_payment_method,
    v_external_reference
  )
  ON CONFLICT (
    producer_id,
    product_id,
    customer_document
  ) WHERE status IN ('creating', 'pending', 'paid', 'unknown')
  DO NOTHING
  RETURNING
    vitalicio_purchase_guards.id,
    vitalicio_purchase_guards.external_reference
  INTO v_guard_id, v_external_reference;

  IF FOUND THEN
    result := 'reserved';
    guard_id := v_guard_id;
    external_reference := v_external_reference;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT g.status
  INTO v_existing_status
  FROM public.vitalicio_purchase_guards AS g
  WHERE g.producer_id = p_producer_id
    AND g.product_id = p_product_id
    AND g.customer_document = p_customer_document
    AND g.status IN ('creating', 'pending', 'paid', 'unknown')
  ORDER BY g.created_at, g.id
  LIMIT 1;

  IF v_existing_status = 'paid' THEN
    result := 'purchase_blocked';
  ELSE
    result := 'purchase_processing';
  END IF;

  guard_id := NULL;
  external_reference := NULL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_vitalicio_purchase(
  uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_vitalicio_purchase(
  uuid, uuid, text, text
) TO service_role;

COMMENT ON TABLE public.vitalicio_purchase_guards IS
  'Exclusive duplicate-charge guard for PsicoPlanilhas lifetime access.';
COMMENT ON FUNCTION public.reserve_vitalicio_purchase(
  uuid, uuid, text, text
) IS
  'Reserves one lifetime purchase per producer, product and normalized document.';

COMMIT;
