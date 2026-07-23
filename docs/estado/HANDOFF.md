# LEIA PRIMEIRO — ESTADO EM 23/07/2026

Resumo de uma página do PaymentBeta. Detalhes em `PROJECT_STATE.md`,
`NEXT_STEPS.md` e `RISKS.md`.

## Arquitetura

O PaymentBeta é a autoridade central de checkout, pagamentos, assinaturas,
cancelamentos e entitlement. Produtos consumidores nunca chamam o Asaas
diretamente — recebem acesso por webhook assinado.

`HEAD` atual: `fa2e9ef`.

---

## CONCLUÍDO NESTA SESSÃO

### 1. PsicoBook + PaymentBeta — FINALIZADO

Novas vendas do PsicoBook migradas da Hotmart para o PaymentBeta.

- Checkout Professional: `https://payment.eng.br/checkout?product=2U5CBHNJ&price=8YZRBDLH`
- Checkout Clínica/Escola: `https://payment.eng.br/checkout?product=72HAQ4JN&price=5NYHLUAW`

Cinco botões públicos conferidos em produção, home por perfis conferida,
provisionamento após pagamento validado, clientes VIP legados preservados.

**A Hotmart permanece somente para contratos legados.** Não excluir o produto
Hotmart, não remover o webhook Hotmart, não cancelar assinaturas antigas, não
usar mais links públicos da Hotmart para novas vendas.

Commits no PsicoBook: `a164c24` (VIP legados) · `ca42f6b` (receptor anual) ·
`f3c0273` (organização duplicada) · `257a1ed` (checkouts públicos) ·
`2196695` (home por perfil).

### 2. Loader do checkout — CORRIGIDO (`b1be054`)

Client Supabase público dedicado, sem GoTrue, Web Lock, sessão persistida ou
auto refresh no carregamento. Timeout de 8 segundos. Loader infinito eliminado,
validado em produção inclusive com o Web Lock do auth retido.

### 3. Dashboard — CONCLUÍDO (`45df4d3`, `9c54320`, `fa2e9ef`)

Receita e vendas do dia, acessos aos checkouts, conversão, abandonos, Top 4
checkouts, gráfico de acessos/vendas/receita, períodos de 7 e 30 dias,
agrupamento pelo dia comercial de America/Sao_Paulo e legenda
"Hoje: dados parciais".

---

## ABERTO

### A. PsicoPlanilhas — conversão · MONITORAMENTO

Não é bug técnico confirmado. Snapshot de 23/07/2026: PsicoPlanilhas Acesso
Vitalício (`N96CYS7N`), 36 acessos, 0 vendas no dia. O checkout abre e o loader
foi corrigido. Acompanhar se a conversão retorna ao padrão **antes** de alterar
página, oferta ou checkout. Os números do snapshot não são permanentes.

### B. Tracking dos anúncios · PENDÊNCIA TÉCNICA REAL

`product_ads_configs` não possui `SELECT` para `anon`, então compradores
anônimos recebem configuração vazia e Meta Pixel, Google Ads, TikTok e eventos
client-side (`InitiateCheckout`, `Purchase`) podem não disparar. Não bloqueia
pagamento, mas pode deixar campanhas sem dados. Exige auditoria curta e
correção segura. **Nenhuma policy ou migration foi aplicada nesta sessão.**

### C. Web Lock no submit · RISCO RESIDUAL

O carregamento público usa o client novo sem auth, mas `create-payment`,
`validate-coupon` e o submit permaneceram no client original. Em sessão inválida
ou Web Lock contendido o submit ainda pode teoricamente estagnar. Nenhuma falha
real de pagamento foi comprovada após a correção. Não alterar sem reprodução
real ou etapa planejada de hardening.

### D. Primeira cobrança de assinatura em D+7 · DECISÃO CONSCIENTE

Auditado nesta sessão, **preservado deliberadamente**. `create-payment` envia
`nextDueDate = hoje + 7` para a assinatura Asaas, então a primeira cobrança no
cartão é agendada e só é apresentada à adquirente uma semana depois. O
PsicoPlanilhas Pro anual opera assim há semanas com renovação funcionando. A
correção foi implementada, testada e **revertida** por decisão de produto —
alterar mudaria o comportamento de um produto vivo. Ver `RISKS.md`.

---

## PENDÊNCIAS ANTERIORES PRESERVADAS

O teste controlado do **cartão anual confirmado** continua pendente, junto com
ledger pós-`PAYMENT_CONFIRMED`, `duplicate` no reenvio, renovação com novo
`payment_id`, cancelamento self-service ponta a ponta, regra de fim de mês,
criação transacional de produto/preço e separação Preview/Production. Lista
completa em `NEXT_STEPS.md`.

> A arquitetura recorrente está ativa. Novos ciclos comerciais devem ser criados
> como novos preços, nunca pela transformação de preços existentes.
