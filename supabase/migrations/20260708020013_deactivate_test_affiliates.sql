-- Oculta as contas de teste "Ana teste" e "teste 2" das listagens e
-- relatórios de afiliadas, sem apagar nenhum dado.
--
-- affiliates.is_active é uma flag independente de
-- product_affiliate_links.is_active (esta última é a usada pelo webhook
-- em getAffiliateSaleData, supabase/functions/asaas-webhook/index.ts, pra
-- liberar o cálculo de comissão). Marcar affiliates.is_active=false aqui
-- NÃO afeta o link de afiliado nem a venda/comissão já registradas.
--
-- Confirmado antes desta migration: "Ana teste" tem uma venda de R$50 já
-- registrada em product_sales, com R$25 de comissão (50%) já paga/computada.
-- Essa venda e comissão permanecem intactas.

UPDATE public.affiliates
SET is_active = false
WHERE name IN ('Ana teste', 'teste 2');
