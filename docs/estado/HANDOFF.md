# LEIA PRIMEIRO — ASSINATURAS RECORRENTES ATIVAS

Resumo de uma página do estado do PaymentBeta em 17/07/2026.

## Arquitetura atual

O PaymentBeta é a autoridade central de checkout, pagamentos, assinaturas,
cancelamentos e entitlement. Produtos consumidores nunca chamam o Asaas
diretamente — recebem acesso pelo webhook de entitlement.

## Commits

- Merge na `main`: `6c6edc0`.
- Implementação: `4b9e796`.

## Migration

- `20260717120000_add_subscription_payment_applications.sql` (aplicada).

## RPC

- `public.apply_subscription_payment(uuid, text, text, timestamptz, text)`.
- Executável somente por `service_role`.
- `SELECT ... FOR UPDATE` + ledger e período atômicos.
- Replay retorna `duplicate`.

## Ledger

- Tabela `public.subscription_payment_applications`.
- Único por `subscription_id + asaas_payment_id`.

## Edge Functions

asaas-webhook v15 · create-payment v16 · customer-cancel-subscription v5 ·
cancel-subscription v9 · process-webhook-queue v9 · send-sale-webhook v9 ·
test-webhook v9.

## Anual no cartão

Assinatura Asaas, valor integral, uma parcela, renovação automática, entitlement
`yearly`, acesso 12 meses.

## Anual no PIX

Pagamento único pré-pago, sem assinatura Asaas, sem renovação automática,
entitlement `yearly`, acesso 12 meses.

## Cancelamento

Consumidor solicita → PaymentBeta cancela no Asaas → novas cobranças param → o
acesso continua até `access_until`.

## Regra de novo price_id

Cada novo plano comercial é um novo `price_id`. Nunca transformar um preço
existente nem mudar retroativamente o ciclo. Assinantes preservam o ciclo
contratado.

## Testes concluídos

- 22 testes aprovados; build aprovado.
- PIX anual: pagamento único, sem assinatura Asaas.
- RPC real no Supabase: resultado `duplicate` confirmado.

## Teste ainda pendente

- Cartão anual confirmado (o pagamento de teste permaneceu `PENDING`);
  confirmação financeira e renovação anual ainda precisam de teste controlado.

## Próximos passos

Confirmar cartão anual, verificar ledger pós-`PAYMENT_CONFIRMED`, reconfirmar
`duplicate` no reenvio de `PAYMENT_RECEIVED`, testar renovação com novo
`payment_id` e o cancelamento self-service ponta a ponta. Detalhes em
`NEXT_STEPS.md`.

> A arquitetura recorrente está ativa. Novos ciclos comerciais devem ser criados como novos preços, nunca pela transformação de preços existentes.
