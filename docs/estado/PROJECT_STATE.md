# PROJECT_STATE.md — Estado do PaymentBeta

**Data de referência:** 17/07/2026

## Resumo

- Assinatura anual recorrente **ativa**.
- Merge na `main`: `6c6edc0`.
- Commit da implementação: `4b9e796`.

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

| Função | Versão |
|---|---|
| asaas-webhook | v15 |
| create-payment | v16 |
| customer-cancel-subscription | v5 |
| cancel-subscription | v9 |
| process-webhook-queue | v9 |
| send-sale-webhook | v9 |
| test-webhook | v9 |

## Validações

- 22 testes aprovados.
- Build aprovado.

### PIX anual — testado

- Pagamento único.
- Nenhuma assinatura Asaas criada.

### Cartão anual — testado parcialmente

- Assinatura criada.
- Ciclo `YEARLY`.
- Pagamento permaneceu `PENDING`.
- **Confirmação financeira e renovação anual ainda precisam de teste controlado.**

### RPC real

- RPC testada no Supabase real com resultado `duplicate`.

## Nota de manutenção histórica

Um registro histórico de teste duplicado foi corrigido manualmente no Supabase.
O entitlement externo original já estava correto — a correção manual apenas
higienizou o registro de teste, sem impacto sobre o acesso já concedido.

---

*Este documento não registra nome, e-mail, CPF, telefone ou quaisquer
identificadores pessoais de clientes.*
