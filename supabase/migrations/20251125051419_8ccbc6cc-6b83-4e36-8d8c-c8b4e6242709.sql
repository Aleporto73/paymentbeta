-- Create product_webhooks table for webhook URL management
CREATE TABLE public.product_webhooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  webhook_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create webhook_queue table for intelligent queue processing
CREATE TABLE public.webhook_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  webhook_url TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, sent, failed
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create webhook_logs table for tracking webhook deliveries
CREATE TABLE public.webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  webhook_url TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_webhooks
CREATE POLICY "Users can view webhooks for their products"
  ON public.product_webhooks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.products
    WHERE products.id = product_webhooks.product_id
    AND products.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert webhooks for their products"
  ON public.product_webhooks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products
    WHERE products.id = product_webhooks.product_id
    AND products.user_id = auth.uid()
  ));

CREATE POLICY "Users can update webhooks for their products"
  ON public.product_webhooks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.products
    WHERE products.id = product_webhooks.product_id
    AND products.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete webhooks for their products"
  ON public.product_webhooks FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.products
    WHERE products.id = product_webhooks.product_id
    AND products.user_id = auth.uid()
  ));

-- RLS Policies for webhook_queue
CREATE POLICY "Users can view webhook queue for their products"
  ON public.webhook_queue FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.products
    WHERE products.id = webhook_queue.product_id
    AND products.user_id = auth.uid()
  ));

-- RLS Policies for webhook_logs
CREATE POLICY "Users can view webhook logs for their products"
  ON public.webhook_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.products
    WHERE products.id = webhook_logs.product_id
    AND products.user_id = auth.uid()
  ));

-- Trigger for updating updated_at
CREATE TRIGGER update_product_webhooks_updated_at
  BEFORE UPDATE ON public.product_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_webhook_queue_updated_at
  BEFORE UPDATE ON public.webhook_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for efficient queue processing
CREATE INDEX idx_webhook_queue_status ON public.webhook_queue(status);
CREATE INDEX idx_webhook_queue_created_at ON public.webhook_queue(created_at);
CREATE INDEX idx_product_webhooks_product_id ON public.product_webhooks(product_id);
CREATE INDEX idx_product_webhooks_active ON public.product_webhooks(product_id, is_active) WHERE is_active = true;