# PROJECT_STATE.md — Estado do PaymentBeta

**Data de referência:** 23/07/2026

## Resumo

- `HEAD` atual: `fa2e9ef`.
- Checkout público **estabilizado** (`b1be054`).
- Dashboard operacional **publicado** (`45df4d3`, `9c54320`, `fa2e9ef`).
- Integração **PsicoBook ativa e conferida** em produção.
- Hotmart permanece **somente como legado** no PsicoBook.
- Assinatura anual recorrente **ativa** (merge `6c6edc0`, implementação `4b9e796`).

## Supabase

- Projeto Supabase atualmente utilizado: `nwaihnoxcxhtitgagcqk`.
- **Preview e Production utilizam atualmente esse mesmo projeto Supabase.**
- Frontend publicado em produção.

## Banco de dados

- Migration aplicada: `20260717120000_add_subscription_payment_applications.sql`.
- Tabela: `public.subscription_payment_applications`.
- RPC: `public.apply_subscription_payment(uuid, text, text, timestamptz, text)`.

### Propriedades da idempotência

- A RPC é executável **somente por `service_role`**.
- `anon` e `authenticated` **não executam** a RPC.
- Ledger único por `subscription_id + asaas_payment_id`.
- A RPC utiliza `SELECT ... FOR UPDATE` para serializar aplicações concorrentes
  da mesma assinatura.
- O registro no ledger e a atualização do período da assinatura são **atômicos**
  (mesma transação; qualquer erro provoca rollback integral).
- Replay do mesmo pagamento retorna `duplicate` sem alterar a assinatura.

## Edge Functions ativas

Versões conferidas no Supabase em 23/07/2026.

| Função | Versão |
|---|---|
| asaas-webhook | v22 |
| create-payment | v21 |
| process-webhook-queue | v15 |
| cancel-subscription | v14 |
| check-payment-status | v14 |
| send-sale-webhook | v13 |
| test-webhook | v13 |
| customer-cancel-subscription | v10 |
| customer-get-subscription | v7 |
| generate-subscription-token | v7 |
| validate-coupon | v5 |
| regularize-link | v4 |

`regularize-link` (`c8e2442`) devolve o `invoiceUrl` da cobrança em aberto
consultando o Asaas ao vivo — não lê status da tabela local.

## Checkout público

- Client Supabase público dedicado no carregamento, sem GoTrue, Web Lock, sessão
  persistida ou auto refresh.
- Timeout de 8 segundos.
- Polling de status é exclusivo do PIX e exige capacidade assinada.
- `create-payment`, `validate-coupon` e o submit **permanecem no client
  original** — ver risco residual em `RISKS.md`.

## Dashboard

Visão operacional do dia: receita e vendas do dia, acessos aos checkouts,
conversão, abandonos, Top 4 checkouts, gráfico de acessos/vendas/receita,
períodos de 7 e 30 dias. O agrupamento usa o **dia comercial de
America/Sao_Paulo**, e o dia corrente é rotulado como dados parciais.

## Integração PsicoBook

- Receptor no PsicoBook: Edge Function `paymentbeta-webhook` (`verify_jwt = false`).
- Eventos aceitos pelo consumidor: `sale.confirmed`, `subscription.pending`,
  `subscription.payment_failed`, `subscription.cancelled`,
  `subscription.access_revoked`.
- `event_version` aceita: `2026-06-10`.
- Entitlements: `psicobook-professional` (50 aprendentes, 1 usuário) e
  `psicobook-clinic` (200 aprendentes, 3 usuários).
- Organizações marcadas como VIP legado são **ignoradas** por qualquer evento de
  gateway — nenhum evento altera plano, limites ou expiração delas.
- Checkouts públicos migrados: produto `2U5CBHNJ` preço `8YZRBDLH` (Professional)
  e produto `72HAQ4JN` preço `5NYHLUAW` (Clínica/Escola).

## Anual no cartão

Assinatura Asaas, valor integral, uma parcela, renovação automática, entitlement
`yearly`, acesso 12 meses. A **primeira** cobrança é agendada para D+7 — ver
`RISKS.md`.

## Anual no PIX

Pagamento único pré-pago, sem assinatura Asaas, sem renovação automática,
entitlement `yearly`, acesso 12 meses.

## Cancelamento

Consumidor solicita → PaymentBeta cancela no Asaas → novas cobranças param → o
acesso continua até `access_until`. O `DELETE` no Asaas remove também as
cobranças em aberto daquela assinatura.

## Regra de novo price_id

Cada novo plano comercial é um novo `price_id`. Nunca transformar um preço
existente nem mudar retroativamente o ciclo. Assinantes preservam o ciclo
contratado.

## Validações

- **Última suíte completa: 213/213 testes aprovados no commit `9c54320`, em
  23/07/2026.** Build aprovado.
- O commit `fa2e9ef` alterou apenas a legenda "Hoje: dados parciais"; nele foram
  validados build e `git diff --check`, sem nova execução da suíte completa.
- PIX anual: pagamento único, sem assinatura Asaas.
- RPC real no Supabase: resultado `duplicate` confirmado.

### Cartão anual — testado parcialmente

- Assinatura criada, ciclo `YEARLY`.
- **Confirmação financeira e renovação anual ainda precisam de teste
  controlado.** Pendência anterior preservada.

## Nota de manutenção histórica

Um registro histórico de teste duplicado foi corrigido manualmente no Supabase.
O entitlement externo original já estava correto — a correção manual apenas
higienizou o registro de teste, sem impacto sobre o acesso já concedido.

Em 22/07/2026 foi criada uma assinatura técnica de teste do PsicoBook, cancelada
em 23/07/2026 pelo fluxo oficial (`cancel-subscription`). O Asaas confirmou a
remoção da cobrança em aberto por `PAYMENT_DELETED`; o ledger permaneceu vazio e
nenhum entitlement foi emitido.

---

*Este documento não registra nome, e-mail, CPF, telefone ou quaisquer
identificadores pessoais de clientes.*
