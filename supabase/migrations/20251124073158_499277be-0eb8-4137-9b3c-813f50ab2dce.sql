-- Criar tabela para rastreamento de eventos do checkout
CREATE TABLE IF NOT EXISTS public.checkout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  price_id UUID REFERENCES public.product_prices(id) ON DELETE SET NULL,
  affiliate_code TEXT,
  event_type TEXT NOT NULL, -- 'view', 'abandon', 'conversion'
  order_bumps_selected TEXT[], -- Array de IDs dos order bumps selecionados
  total_amount NUMERIC DEFAULT 0,
  order_bumps_amount NUMERIC DEFAULT 0,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Criar índices para melhor performance
CREATE INDEX idx_checkout_events_product_id ON public.checkout_events(product_id);
CREATE INDEX idx_checkout_events_event_type ON public.checkout_events(event_type);
CREATE INDEX idx_checkout_events_created_at ON public.checkout_events(created_at);
CREATE INDEX idx_checkout_events_session_id ON public.checkout_events(session_id);

-- Enable RLS
ALTER TABLE public.checkout_events ENABLE ROW LEVEL SECURITY;

-- Política para permitir inserção pública (checkout é público)
CREATE POLICY "Public can insert checkout events"
ON public.checkout_events
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Política para owners visualizarem eventos de seus produtos
CREATE POLICY "Users can view events for their products"
ON public.checkout_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products
    WHERE products.id = checkout_events.product_id
    AND products.user_id = auth.uid()
  )
);

COMMENT ON TABLE public.checkout_events IS 'Rastreamento de eventos do checkout para analytics de conversão e abandono';