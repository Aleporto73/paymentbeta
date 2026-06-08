-- Migration: add_subscription_tokens
-- Cria base segura para futura function de gerenciamento de assinatura pelo
-- proprio cliente comprador (cancelamento self-service, troca de cartao, etc.).
-- O banco NUNCA recebe o token bruto: apenas o hash. O token bruto sera gerado
-- pela edge function futura e enviado ao cliente (por e-mail / link). Esta
-- migration NAO altera nenhuma function existente nem nenhuma logica de
-- pagamento: cria apenas estrutura.
-- Toda a migration e defensiva e idempotente (IF NOT EXISTS).

BEGIN;

-- 1. Tabela principal.
CREATE TABLE IF NOT EXISTS public.subscription_tokens (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id    uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  token_hash         text NOT NULL,
  purpose            text NOT NULL DEFAULT 'customer_manage',
  expires_at         timestamptz NULL,
  revoked_at         timestamptz NULL,
  last_used_at       timestamptz NULL,
  created_by         text NULL,
  metadata           jsonb NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- 2. Check constraint para purpose. Mantido pequeno e fechado por ora; futuras
-- finalidades (ex.: change_card) podem ser adicionadas com DROP + ADD em uma
-- migration posterior. Travar agora reduz risco de typo no codigo cliente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_tokens_purpose_check'
      AND conrelid = 'public.subscription_tokens'::regclass
  ) THEN
    ALTER TABLE public.subscription_tokens
      ADD CONSTRAINT subscription_tokens_purpose_check
      CHECK (purpose IN ('customer_manage', 'customer_cancel', 'support'));
  END IF;
END;
$$;

-- 3. Constraint de unicidade do hash. Hash colidir indica colisao real do RNG ou
-- duplicidade de insert; em ambos os casos queremos falhar cedo. Indice unico
-- separado (em vez de UNIQUE inline) facilita ALTER futuro.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_subscription_tokens_token_hash
  ON public.subscription_tokens (token_hash);

-- 4. Indices auxiliares para os caminhos de consulta esperados.
CREATE INDEX IF NOT EXISTS idx_subscription_tokens_subscription_id
  ON public.subscription_tokens (subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscription_tokens_purpose
  ON public.subscription_tokens (purpose);

CREATE INDEX IF NOT EXISTS idx_subscription_tokens_expires_at
  ON public.subscription_tokens (expires_at);

CREATE INDEX IF NOT EXISTS idx_subscription_tokens_revoked_at
  ON public.subscription_tokens (revoked_at);

-- 5. Trigger updated_at usando a funcao ja existente no projeto
-- (public.update_updated_at_column, definida em migrations anteriores).
DROP TRIGGER IF EXISTS update_subscription_tokens_updated_at ON public.subscription_tokens;
CREATE TRIGGER update_subscription_tokens_updated_at
  BEFORE UPDATE ON public.subscription_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. RLS. Tabela contem apenas hash do token, mas mesmo assim nenhum cliente do
-- frontend deve consulta-la diretamente. A futura edge function usara service
-- role (bypassa RLS) para validar token apresentado pelo cliente. Admins podem
-- gerenciar para auditoria/manutencao.
ALTER TABLE public.subscription_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage subscription tokens" ON public.subscription_tokens;
CREATE POLICY "Admins can manage subscription tokens"
  ON public.subscription_tokens
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7. Comentarios para documentar intencao das colunas principais.
COMMENT ON TABLE  public.subscription_tokens        IS 'Tokens (apenas hash) para gerenciamento self-service de assinatura pelo cliente comprador.';
COMMENT ON COLUMN public.subscription_tokens.token_hash    IS 'Hash do token. Banco nunca armazena o token bruto.';
COMMENT ON COLUMN public.subscription_tokens.purpose       IS 'Finalidade do token: customer_manage | customer_cancel | support.';
COMMENT ON COLUMN public.subscription_tokens.expires_at    IS 'Expiracao do token. NULL = sem expiracao (uso restrito; preferir sempre setar).';
COMMENT ON COLUMN public.subscription_tokens.revoked_at    IS 'Quando o token foi revogado manualmente (rotacao, suporte, suspeita de vazamento).';
COMMENT ON COLUMN public.subscription_tokens.last_used_at  IS 'Ultima utilizacao bem sucedida do token.';
COMMENT ON COLUMN public.subscription_tokens.created_by    IS 'Origem da criacao do token (ex.: edge function name, admin email).';

COMMIT;
