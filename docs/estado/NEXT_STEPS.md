# NEXT_STEPS.md — Próximos Passos

Atualizado em 23/07/2026.

## PRÓXIMOS DESTA SESSÃO

1. **Acompanhar a conversão do PsicoPlanilhas por alguns dias.**
   Monitoramento comercial, não falha técnica confirmada. Não alterar página,
   oferta ou checkout antes de ter série histórica suficiente.

2. **Auditar e corrigir com segurança a leitura anônima de
   `product_ads_configs`.**
   Sem `SELECT` para `anon`, o comprador anônimo recebe configuração vazia e os
   pixels de anúncio podem não disparar. Auditar o escopo exato antes de propor
   policy — a tabela não deve expor mais do que os identificadores de pixel
   necessários ao checkout. Nenhuma policy ou migration foi aplicada.

3. **Avaliar o risco do Web Lock no submit somente com reprodução real ou etapa
   planejada de hardening.**
   `create-payment`, `validate-coupon` e o submit seguem no client original.
   Nenhuma falha real de pagamento foi comprovada após `b1be054`.

## PENDÊNCIAS ANTERIORES

Mantidas — nenhuma comprovadamente concluída.

4. Testar cartão anual **confirmado** (confirmação financeira ponta a ponta).
5. Verificar o ledger após `PAYMENT_CONFIRMED`.
6. Reenviar `PAYMENT_RECEIVED` e confirmar retorno `duplicate`.
7. Testar renovação com **novo `payment_id`**.
8. Testar cancelamento self-service ponta a ponta.
9. Criar um eventual plano anual do AbaMinds com **novo `price_id`** — os preços
   mensais atuais permanecem com seus `price_id` existentes; nunca transformar
   preços mensais já utilizados em anuais.
10. Decidir a regra para datas de fim de mês (ver `RISKS.md`).
11. Tornar a criação de produto e preço **transacional**.
12. Avaliar a separação futura entre Supabase Preview e Production.

## HIGIENE

13. **Remover o preço de teste do produto PsicoBook Profissional Anual.**
    O produto `2U5CBHNJ` mantém, além do preço comercial `8YZRBDLH` (R$ 197), um
    preço de teste de R$ 5,00 rotulado "TESTE TECNICO 2026-07-22 - NAO PUBLICAR".
    Não está referenciado por nenhum link público, mas continua acessível a quem
    conhecer o código do preço. Ver `RISKS.md`.

## DECIDIDO — NÃO EXECUTAR SEM NOVA DECISÃO

14. **Primeira cobrança de assinatura em D+7.** Auditado e revertido nesta
    sessão por decisão de produto: o fluxo existente é o mesmo que o
    PsicoPlanilhas Pro anual já usa em produção. Só reabrir com decisão
    explícita, ciente de que a mudança afeta **todos** os produtos recorrentes,
    não apenas o PsicoBook. Ver `RISKS.md`.
