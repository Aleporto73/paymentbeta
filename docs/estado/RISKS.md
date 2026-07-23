# RISKS.md — Riscos Conhecidos

Atualizado em 23/07/2026.

## Adicionados em 23/07/2026

- **Tracking de anúncios indisponível para comprador anônimo.**
  `product_ads_configs` não possui `SELECT` para `anon`, então o checkout de um
  comprador não autenticado recebe configuração vazia. Meta Pixel, Google Ads,
  TikTok e eventos client-side (`InitiateCheckout`, `Purchase`) podem não
  disparar. **Não bloqueia pagamento** — o efeito é campanha e algoritmo de
  anúncio sem dados de conversão. Nenhuma policy ou migration foi aplicada.

- **Risco residual de Web Lock no submit do pagamento.**
  O carregamento público passou a usar um client Supabase sem auth (`b1be054`),
  mas `create-payment`, `validate-coupon` e o submit permaneceram no client
  original. Em sessão inválida ou Web Lock contendido, o submit ainda pode
  teoricamente estagnar. Nenhuma falha real de pagamento foi comprovada após a
  correção. Não alterar sem reprodução real ou etapa planejada de hardening.

- **Conversão baixa do PsicoPlanilhas — monitoramento comercial.**
  Não é falha técnica confirmada. O checkout abre e o loader foi corrigido.
  Snapshot de 23/07/2026 (36 acessos, 0 vendas no dia) é um recorte pontual e
  não deve ser tratado como permanente nem como diagnóstico.

- **Primeira cobrança de assinatura no cartão ocorre em D+7.**
  `create-payment` envia `nextDueDate = hoje + 7` ao criar a assinatura Asaas,
  reaproveitando o prazo de pagamento de cobranças avulsas. Como o Asaas só
  apresenta o cartão à adquirente na data de vencimento, a primeira cobrança
  fica agendada: chega `PAYMENT_CREATED` e nenhum evento de aprovação ou recusa
  até o vencimento. Enquanto isso a assinatura fica `ACTIVE` com ledger vazio.
  **Comportamento conhecido e preservado por decisão de produto** — o
  PsicoPlanilhas Pro anual opera assim com renovação funcionando. A correção
  chegou a ser implementada e testada e foi **revertida**. Consequências a ter
  em conta: uma assinatura recém-criada permanece `PENDING` por até 7 dias sem
  isso indicar falha, e qualquer alteração futura afeta **todos** os produtos
  recorrentes.

- **Preço de teste ativo em produto comercial.**
  O produto `2U5CBHNJ` (PsicoBook Profissional Anual, R$ 197) mantém um segundo
  preço de R$ 5,00 rotulado "TESTE TECNICO 2026-07-22 - NAO PUBLICAR". Nenhum
  link público aponta para ele, mas quem conhecer o código do preço consegue
  comprar o plano anual por R$ 5,00. Remover quando os testes encerrarem.

## Riscos anteriores — mantidos

- **Preview e Production utilizam o mesmo projeto Supabase**
  (`nwaihnoxcxhtitgagcqk`). Qualquer operação em um ambiente afeta o outro.
- A confirmação completa do **cartão anual** ainda não foi concluída (o pagamento
  de teste permaneceu `PENDING`).
- A criação de produto e preço **não é transacional** — falha na criação do preço
  pode deixar um produto sem preço.
- **Não editar o período (cycle) de um preço já utilizado** por assinaturas.
- **Não manipular o ledger manualmente** sem auditoria.
- A **migration/RPC deve existir antes** do deploy da Edge Function dependente
  (`asaas-webhook`), sob pena de falhas até a migration ser aplicada.
- A falha de entitlement precisa **permanecer reprocessável** — não marcar como
  sucesso um evento cuja entrega falhou.
- **Apenas a deduplicação esperada** pode ser tratada como sucesso; qualquer outra
  violação/erro deve permanecer reprocessável.
- A regra atual de fim de mês pode **avançar datas para março** (ex.: 31/01 + 1 mês
  → 03/03), por preservar a semântica de overflow. Precisa de decisão de produto.
- **Não guardar dados pessoais** (nome, e-mail, CPF, telefone, IDs de cliente) na
  documentação.
