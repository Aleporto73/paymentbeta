# AGENTS.md — PaymentBeta

Documento obrigatório para qualquer pessoa ou agente que trabalhe neste projeto.

## Projeto

**PaymentBeta** — plataforma central de checkout, pagamentos, assinaturas,
cancelamentos e entrega de entitlement.

- Diretório local: `C:\Users\evera\Projetos\paymentbeta`
- Branch principal: `main`

## Ordem obrigatória de leitura

1. `AGENTS.md` (este documento)
2. `docs/estado/HANDOFF.md`
3. `docs/estado/PROJECT_STATE.md`
4. `docs/estado/DECISIONS.md`
5. `docs/estado/NEXT_STEPS.md`
6. `docs/estado/RISKS.md`
7. `docs/integrations/PAYMENTBETA_CONSUMER_CONTRACT.md`

## Regra de comandos (PowerShell)

Todos os comandos PowerShell começam com:

```powershell
Set-Location C:\Users\evera\Projetos\paymentbeta
```

## Autorização obrigatória

Não executar sem autorização explícita:

- SQL remoto;
- migration;
- deploy;
- commit;
- push.

## Fronteiras de arquitetura

- O PaymentBeta controla **checkout, assinatura, cancelamento e entitlement**.
- Aplicativos consumidores **nunca chamam o Asaas diretamente** — toda operação
  passa pelo PaymentBeta.
- **Não alterar ciclos de preços já utilizados por assinaturas.** Um novo plano
  comercial é sempre um novo `price_id`, nunca a transformação de um preço
  existente.
