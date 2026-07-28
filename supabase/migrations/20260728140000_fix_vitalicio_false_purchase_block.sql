-- Hotfix P0: libera compras falsamente bloqueadas no guard vitalicio.
--
-- Problema corrigido: reserve_vitalicio_purchase bloqueava qualquer CPF com
-- transacao PENDING, OVERDUE, AWAITING_RISK_ANALYSIS ou AUTHORIZED, sem
-- janela de tempo. Um PIX abandonado (que vira OVERDUE e nunca sai desse
-- estado) travava a pessoa permanentemente, mesmo sem nenhuma compra paga.
-- Guards orfaos em 'creating'/'unknown' produziam o mesmo travamento.
--
-- O que continua bloqueando:
--   - transacao CONFIRMED ou RECEIVED (compra realmente paga);
--   - guard com status 'paid'.
--
-- O que deixa de bloquear:
--   - OVERDUE (PIX vencido/abandonado), em qualquer idade;
--   - PENDING/AWAITING_RISK_ANALYSIS/AUTHORIZED mais antigos que a janela;
--   - guards 'creating'/'unknown' expirados;
--   - guards 'pending' expirados.
--
-- Nao altera schema, nao altera a tabela transactions e nao altera nenhuma
-- Edge Function. Apenas o corpo da funcao e uma limpeza pontual de guards
-- expirados. Reversivel reaplicando o corpo de
-- 20260724170000_add_vitalicio_purchase_guard.sql.

BEGIN;

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
  -- Janelas curtas: protegem contra duplicacao imediata e requisicoes
  -- simultaneas, sem prender o CPF depois que a tentativa esfriou.
  v_transaction_window constant interval := interval '30 minutes';
  v_creating_ttl constant interval := interval '10 minutes';
  v_pending_ttl constant interval := interval '30 minutes';
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

  -- Expira reservas orfas deste CPF antes de qualquer decisao. 'cancelled' ja
  -- e aceito pelo CHECK de status e nao participa do indice unico parcial,
  -- entao a linha para de bloquear sem que nada seja apagado. O UPDATE
  -- serializa tentativas concorrentes do mesmo CPF pelo lock de linha.
  UPDATE public.vitalicio_purchase_guards AS g
  SET status = 'cancelled',
      updated_at = now()
  WHERE g.producer_id = p_producer_id
    AND g.product_id = p_product_id
    AND g.customer_document = p_customer_document
    AND (
      (g.status IN ('creating', 'unknown') AND g.created_at < now() - v_creating_ttl)
      OR (g.status = 'pending' AND g.created_at < now() - v_pending_ttl)
    );

  -- Compra efetivamente paga continua bloqueando para sempre.
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

  -- Somente tentativas recentes seguram uma nova compra. OVERDUE saiu da
  -- lista: PIX vencido nao e cobranca em andamento, e o cliente precisa poder
  -- tentar de novo.
  IF EXISTS (
    SELECT 1
    FROM public.transactions AS t
    WHERE t.user_id = p_producer_id
      AND t.product_id = p_product_id
      AND regexp_replace(COALESCE(t.customer_cpf_cnpj, ''), '[^0-9]', '', 'g')
        = p_customer_document
      AND upper(t.status) IN (
        'PENDING',
        'AWAITING_RISK_ANALYSIS',
        'AUTHORIZED'
      )
      AND t.created_at >= now() - v_transaction_window
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

  -- Conflito: existe reserva ativa e ainda dentro da validade (as expiradas
  -- ja viraram 'cancelled' no inicio desta chamada).
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

COMMENT ON FUNCTION public.reserve_vitalicio_purchase(
  uuid, uuid, text, text
) IS
  'Reserves one lifetime purchase per producer, product and normalized document. Only paid transactions block permanently; in-flight attempts expire.';

-- Liberacao retroativa: guards nao pagos que ja passaram da validade param de
-- bloquear. Nada e apagado e nenhuma linha 'paid' e tocada.
UPDATE public.vitalicio_purchase_guards AS g
SET status = 'cancelled',
    updated_at = now()
WHERE (
    (g.status IN ('creating', 'unknown') AND g.created_at < now() - interval '10 minutes')
    OR (g.status = 'pending' AND g.created_at < now() - interval '30 minutes')
  );

COMMIT;
