# Fechamento Tecnico - Integracao PaymentBeta -> Psico2 Entitlement Webhook

Data: 2026-06-23
Status: FECHADO TECNICAMENTE

## Escopo

Integracao entre PaymentBeta e Psico2 para envio de eventos de entitlement via webhook assinado.

Endpoint Psico2:
https://app.psicoplanilha.com/api/paymentbeta/entitlement-webhook

## Evidencias concluidas

- Vercel Psico2 com PAYMENTBETA_WEBHOOK_SECRET configurado.
- Redeploy do Psico2 concluido em producao.
- product_webhooks.webhook_secret configurado no PaymentBeta.
- Arquivo temporario de secret removido.
- Clipboard neutralizado.
- Edge Function test-webhook ativa no Supabase PaymentBeta.
- Teste sem assinatura retornou HTTP 400 com headers obrigatorios ausentes.
- Teste assinado via painel admin PaymentBeta concluido com sucesso nos 2 produtos.

## Produtos validados

| Produto | Product ID | Webhook ID | Status |
|---|---|---|---|
| PsicoPlanilhas - Acesso Vitalicio | ad27ba35-92a5-4a60-aec8-0b82ae7c0f44 | ed035bc1-def0-4e11-9e0d-d86f173b7b2b | HTTP 200 |
| Assistente IA Pro - PsicoPlanilhas | 7fdcdad8-16f1-4030-b55f-6c51c1952ae5 | 5d0175ac-199e-40f6-8073-55171a1e708e | HTTP 200 |

## Resultado dos testes assinados

Resposta recebida nos dois testes:

{"message":"Entitlement fora do escopo suportado.","status":"unsupported_entitlement"}

Interpretacao:

- O Psico2 recebeu o webhook.
- A assinatura HMAC foi aceita.
- O endpoint respondeu HTTP 200.
- O payload de teste nao liberou acesso falso.
- O comportamento unsupported_entitlement e correto porque o teste envia test-entitlement.

## Pendencia nao executada

Teste real de compra controlada ainda nao realizado.

Motivo: nao necessario para fechamento tecnico da integracao assinada. Deve ser feito separadamente quando for validar o fluxo financeiro completo.

## Conclusao

A integracao PaymentBeta -> Psico2 por webhook de entitlement esta tecnicamente validada e segura para avanco controlado.