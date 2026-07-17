# PaymentBeta — Contrato para Produtos Consumidores

Documento para **AbaMinds**, **PsicoPlanilhas Flow**, **NeuroRastreio** e demais
produtos do ecossistema que recebem entitlement do PaymentBeta.

## PaymentBeta é responsável por

- checkout;
- cliente e pagamento no Asaas;
- assinatura;
- `cycle`;
- períodos;
- `access_until`;
- ledger (idempotência);
- cancelamento;
- webhooks de entitlement.

## Produto consumidor é responsável por

- **não chamar o Asaas** — nenhuma integração direta com o gateway;
- validar o webhook recebido (assinatura/segurança);
- **deduplicar por `delivery_id`**;
- guardar os IDs recebidos para auditoria;
- liberar acesso **por `entitlement.code`**;
- respeitar `type`, `period` e `expires_at`;
- manter o acesso cancelado **até a expiração** (`access_until` / `expires_at`);
- **nunca interpretar assinatura sem expiração como vitalícia** — ausência de
  `expires_at` em `type: subscription` é erro, não acesso perpétuo.

## Exemplos de entitlement

### Anual no cartão

- `type`: `subscription`
- `period`: `yearly`
- `expires_at`: 12 meses
- renovação automática

### Anual no PIX

- `type`: `subscription`
- `period`: `yearly`
- `expires_at`: 12 meses
- sem renovação automática

### Vitalício

- `type`: `lifetime`
- `period`: `null`
- `expires_at`: `null`

## Notas por produto

### AbaMinds

- Os planos atuais são **mensais** e possuem `price_id` próprios: Profissional
  (R$ 75/mês, entitlement `abaminds-solo`) e Clínica (R$ 225/mês, entitlement
  `abaminds-clinica`), ambos `period: monthly`.
- Um eventual plano anual futuro terá um **novo `price_id`**.
- Nunca transformar os preços mensais já utilizados; cada novo ciclo comercial
  recebe um novo `price_id`.

### PsicoPlanilhas Flow

- Acesso anual independente.
- **Não herda** o vitalício do produto principal.
- O cancelamento do Flow **não remove** o produto principal.
