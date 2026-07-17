# DECISIONS.md — Decisões de Arquitetura e Produto

## Produto e preços

Um produto pode possuir **vários preços**.

Exemplo — **AbaMinds**:

- Planos mensais atuais → `price_id` próprios (Profissional R$ 75/mês, Clínica
  R$ 225/mês, `period: monthly`);
- Plano anual futuro → **novo** `price_id` anual.

### Regra imutável

- Nunca transformar um preço mensal já utilizado em anual.
- Não mudar retroativamente o ciclo de um preço.
- Cada novo plano recebe um **novo `price_id`**.
- Assinantes antigos **preservam o ciclo contratado**.

## Ciclos

| Período | Cycle Asaas |
|---|---|
| mensal | `MONTHLY` |
| trimestral | `QUARTERLY` |
| semestral | `SEMIANNUALLY` |
| anual | `YEARLY` |

## Anual no cartão

- Assinatura Asaas.
- Valor anual integral.
- Uma parcela.
- Renovação automática.
- Entitlement `yearly`.
- Acesso por 12 meses.

## Anual no PIX

- Pagamento único pré-pago.
- Sem assinatura Asaas.
- Sem renovação automática.
- Entitlement `yearly`.
- Acesso por 12 meses.

## Cancelamento

- O produto consumidor **solicita** ao PaymentBeta.
- O PaymentBeta **cancela no Asaas**.
- Novas cobranças são interrompidas.
- O acesso **continua até `access_until`**.

## Produto vitalício com subproduto anual

Exemplo:

- **PsicoPlanilhas** principal → vitalício;
- **PsicoPlanilhas Flow** → anual separado.

O produto vitalício **não concede automaticamente** o subproduto anual. São
entitlements independentes.
