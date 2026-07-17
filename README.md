# PaymentBeta

Plataforma central de checkout, pagamentos, assinaturas, cancelamentos e entrega de entitlement para os produtos do ecossistema.

Antes de alterar pagamentos ou assinaturas, leia:

1. `AGENTS.md`
2. `docs/estado/HANDOFF.md`
3. `docs/estado/PROJECT_STATE.md`
4. `docs/estado/DECISIONS.md`
5. `docs/integrations/PAYMENTBETA_CONSUMER_CONTRACT.md`

## Objetivo

O PaymentBeta é a **autoridade central** de cobrança do ecossistema. Ele concentra o
checkout, a criação de clientes e pagamentos no Asaas, o ciclo de vida das
assinaturas recorrentes, os cancelamentos e a emissão dos webhooks de
entitlement que liberam acesso nos produtos consumidores.

O PaymentBeta é a **fonte de verdade das assinaturas**: cycle, períodos pagos,
`access_until`, ledger de idempotência e cancelamento vivem aqui. Os produtos
consumidores apenas recebem e validam o entitlement.

## Stack atual

- React
- Vite
- TypeScript
- Supabase (Postgres, RLS, Edge Functions)
- Asaas (gateway de pagamento e assinaturas)

## Papéis e fronteiras

- O PaymentBeta é a autoridade das assinaturas e do entitlement.
- **Produtos consumidores não devem chamar o Asaas diretamente.** Toda cobrança,
  assinatura e cancelamento passa pelo PaymentBeta.
- Os consumidores liberam acesso exclusivamente pelo `entitlement.code` recebido
  no webhook, respeitando `type`, `period` e `expires_at`.

Detalhes do contrato em `docs/integrations/PAYMENTBETA_CONSUMER_CONTRACT.md`.

## Comandos básicos

```bash
npm install                 # instalar dependências
npm run dev                 # ambiente de desenvolvimento (Vite)
npm run build               # build de produção
npm run test:annual-recurring   # testes da assinatura anual recorrente
```

## Ambiente local

- Diretório local: `C:\Users\evera\Projetos\paymentbeta`
- Branch principal: `main`

## Documentação canônica

A documentação canônica e atual do projeto está em:

- `AGENTS.md` — regras obrigatórias para pessoas e agentes.
- `docs/estado/HANDOFF.md` — leia primeiro; resumo de uma página.
- `docs/estado/PROJECT_STATE.md` — estado atual do sistema.
- `docs/estado/DECISIONS.md` — decisões de arquitetura e produto.
- `docs/estado/NEXT_STEPS.md` — próximos passos.
- `docs/estado/RISKS.md` — riscos conhecidos.
- `docs/integrations/PAYMENTBETA_CONSUMER_CONTRACT.md` — contrato para produtos consumidores.

## Autorização obrigatória

**Deploy, execução de SQL remoto e aplicação de migrations exigem autorização
explícita.** Nenhuma dessas ações deve ser executada automaticamente. O mesmo
vale para `commit` e `push`: somente quando explicitamente solicitado.
