-- Gravacao de evento de checkout por RPC validada (parte 1 de 2 — ADITIVA).
--
-- Estado auditado em producao (2026-08-04, somente leitura):
--
--   Policy "Public can insert checkout events for analytics"
--     FOR INSERT, TO {anon, authenticated}, WITH CHECK (true)
--
--   `true`. Sem validacao nenhuma. Somado ao GRANT INSERT de `anon`, qualquer
--   pessoa com a chave publica (que esta no bundle do site, por definicao)
--   podia gravar em checkout_events, direto pela API REST, o que quisesse:
--   session_id inventado, event_type arbitrario, total_amount arbitrario,
--   milhares de linhas por segundo. Desativar a Edge Function track-checkout
--   nao protegia nada — o caminho REST e o mesmo e continua aberto.
--
--   A deduplicacao em sessionStorage nao e defesa: e codigo do cliente, pode
--   ser removido, ignorado, e a chamada nem precisa vir de um navegador.
--
-- Esta migration cria a porta estreita. Ela e ADITIVA e segura de aplicar a
-- qualquer momento: nao remove nada e nao muda o comportamento atual.
-- A revogacao do INSERT direto vive na migration seguinte
-- (20260804140000), que so pode ser aplicada DEPOIS do frontend novo estar no ar.
--
-- Nenhum dado historico e alterado ou apagado.

CREATE OR REPLACE FUNCTION public.track_public_checkout_event(
  p_session_id text,
  p_event_type text,
  p_product_id uuid,
  p_price_id uuid DEFAULT NULL,
  p_affiliate_code uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
-- search_path fixo: SECURITY DEFINER sem isto e sequestravel por objeto
-- homonimo criado num schema que venha antes no path.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_affiliate_code text := NULL;
BEGIN
  -- Allowlist estrita: SO os dois eventos que sao inerentemente do navegador.
  --
  -- A divisao de responsabilidade e esta:
  --   o NAVEGADOR mede navegacao e intencao — `view` e `payment_attempt`;
  --   o SERVIDOR/BANCO mede cobranca e venda — linhas de `transactions`.
  --
  -- `payment_created` saiu da lista. Mesmo com toda a validacao abaixo, esta
  -- funcao nao tem como provar que uma cobranca nasceu no Asaas: qualquer
  -- visitante anonimo chamaria a RPC e fabricaria "cobrancas". Cobranca criada
  -- passou a ser contada em public.transactions, onde cada linha corresponde a
  -- uma cobranca real (asaas_payment_id NOT NULL; 262 de 262 linhas com id
  -- `pay_*` distinto na auditoria de 2026-08-04).
  --
  -- `payment_confirmed` nunca esteve e nunca estara: venda confirmada e status
  -- financeiro do gateway.
  --
  -- `abandon` fica de fora: era `beforeunload` e nunca mediu desistencia.
  -- `conversion` idem — evento historico, so leitura; nada novo e criado.
  IF p_event_type IS NULL
     OR p_event_type NOT IN ('view', 'payment_attempt') THEN
    RAISE EXCEPTION 'invalid_event_type' USING ERRCODE = '22023';
  END IF;

  -- session_id: formato e teto de tamanho. O gerador do checkout produz
  -- `cs_` + 14 caracteres em base36. O regex ja limita o comprimento.
  IF p_session_id IS NULL OR p_session_id !~ '^cs_[0-9a-z]{8,61}$' THEN
    RAISE EXCEPTION 'invalid_session_id' USING ERRCODE = '22023';
  END IF;

  -- Produto precisa existir de verdade. p_product_id ja e uuid: texto que nao
  -- seja UUID falha na chamada, antes de entrar aqui.
  IF p_product_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'invalid_product' USING ERRCODE = '22023';
  END IF;

  -- Preco, quando informado, precisa pertencer AO PRODUTO informado.
  IF p_price_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.product_prices
       WHERE id = p_price_id AND product_id = p_product_id
     ) THEN
    RAISE EXCEPTION 'invalid_price' USING ERRCODE = '22023';
  END IF;

  -- checkout_events.affiliate_code guarda o id de product_affiliate_links —
  -- confirmado nos dados (444 de 446 linhas casam com um link existente) e no
  -- codigo (AffiliateAnalytics indexa o mapa por link.id). E codigo de campanha,
  -- nao dado pessoal, e alimenta o relatorio de visitas por afiliada.
  --
  -- Codigo desconhecido nao derruba o evento: grava NULL. Perder a atribuicao
  -- e melhor que perder o acesso do funil, e nada nao validado e persistido.
  IF p_affiliate_code IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.product_affiliate_links
       WHERE id = p_affiliate_code AND product_id = p_product_id
     ) THEN
    v_affiliate_code := p_affiliate_code::text;
  END IF;

  -- Insercao com colunas nomeadas, uma a uma. Nao existe caminho para JSON
  -- arbitrario: o que nao esta aqui nao pode ser gravado pelo navegador.
  --
  -- Fora de proposito, e por isso ausentes: total_amount, order_bumps_amount,
  -- order_bumps_selected (valores sao fato do servidor, ficam em transactions),
  -- user_agent e ip_address (dado do visitante, sem uso em relatorio nenhum).
  INSERT INTO public.checkout_events (
    session_id,
    event_type,
    product_id,
    price_id,
    affiliate_code
  )
  VALUES (
    p_session_id,
    p_event_type,
    p_product_id,
    p_price_id,
    v_affiliate_code
  );
END;
$$;

COMMENT ON FUNCTION public.track_public_checkout_event(text, text, uuid, uuid, uuid) IS
  'Unica porta de gravacao de checkout_events pelo navegador. Allowlist de dois eventos client-side (view, payment_attempt); valida sessao, produto, preco e codigo de afiliada. Cobranca criada e venda confirmada NAO passam por aqui: sao lidas de public.transactions.';

-- Sem EXECUTE para PUBLIC: so os papeis nomeados abaixo.
REVOKE ALL ON FUNCTION public.track_public_checkout_event(text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_public_checkout_event(text, text, uuid, uuid, uuid) TO anon, authenticated;

-- Eventos historicos ficam onde estao. `conversion` e `payment_created` seguem
-- gravados em checkout_events e nao sao apagados nem reescritos — apenas param
-- de alimentar a metrica de cobrancas, que agora vem de transactions.

-- NAO ha indice UNIQUE aqui, de proposito.
--
-- (session_id, event_type, product_id, price_id) tem 46 combinacoes repetidas no
-- historico, 49 linhas excedentes, pior caso 3 — resultado do `beforeunload` e
-- do session_id que nascia a cada montagem. Um UNIQUE falharia na criacao, e
-- limpar historico para acomodar indice nao esta em discussao nesta rodada.
--
-- Ate existir uma janela para tratar isso, a duplicacao acidental e contida por:
--   1. deduplicacao no sessionStorage (evita o caso normal);
--   2. deduplicacao por session_id na leitura (dashboard e relatorios), que
--      torna evento repetido inofensivo para a metrica.
