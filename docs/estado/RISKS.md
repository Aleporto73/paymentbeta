# RISKS.md — Riscos Conhecidos

- **Preview e Production utilizam o mesmo projeto Supabase** (`nwaihnoxcxhtitgagcqk`).
  Qualquer operação em um ambiente afeta o outro.
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
