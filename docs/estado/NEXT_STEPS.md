# NEXT_STEPS.md — Próximos Passos

1. Testar cartão anual **confirmado** (confirmação financeira ponta a ponta).
2. Verificar o ledger após `PAYMENT_CONFIRMED`.
3. Reenviar `PAYMENT_RECEIVED` e confirmar retorno `duplicate`.
4. Testar renovação com **novo `payment_id`**.
5. Testar cancelamento self-service ponta a ponta.
6. Criar futuramente o plano mensal com **novo `price_id`** (nunca transformar o anual).
7. Decidir a regra para datas de fim de mês (ver `RISKS.md`).
8. Tornar a criação de produto e preço **transacional**.
9. Avaliar a separação futura entre Supabase Preview e Production.
