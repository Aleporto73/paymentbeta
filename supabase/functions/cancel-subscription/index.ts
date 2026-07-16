import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';
import {
  type CancellationSubscriptionRow,
  queueCancellationWebhooks,
} from '../_shared/queueCancellationWebhooks.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  return match?.[1] ?? null;
};

interface CancelSubscriptionRequest {
  subscriptionId: string;
  asaasSubscriptionId: string;
  cancel: boolean;
}

// Shape of the `products!inner(...)` embed on the subscription query below.
interface SubscriptionProduct {
  id: string;
  user_id: string;
  webhooks: Array<{ id: string; webhook_url: string; is_active: boolean }> | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const token = getBearerToken(req);

    if (!token) {
      return jsonResponse({ error: 'NÃ£o autorizado' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError) {
      console.error('Error checking admin role:', rolesError);
      return jsonResponse({ error: 'Acesso negado' }, 403);
    }

    if (!roles?.some(({ role }) => role === 'admin')) {
      return jsonResponse({ error: 'Acesso negado' }, 403);
    }

    const { subscriptionId, asaasSubscriptionId, cancel }: CancelSubscriptionRequest = await req.json();

    console.log(`Processing subscription ${cancel ? 'cancellation' : 'reactivation'}:`, { subscriptionId, asaasSubscriptionId });

    // Verify subscription belongs to user
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*, products!inner(user_id, id, webhooks:product_webhooks(id, webhook_url, is_active))')
      .eq('id', subscriptionId)
      .single();

    if (subError || !subscription) {
      console.error('Subscription not found:', subError);
      return new Response(
        JSON.stringify({ error: 'Assinatura não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if ((subscription.products as SubscriptionProduct).user_id !== user.id) {
      console.error('User does not own this subscription');
      return new Response(
        JSON.stringify({ error: 'Acesso negado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Asaas API key
    // Single-account architecture: fetch any active Asaas configuration
    const { data: integration, error: integrationError } = await supabase
      .from('integration_settings')
      .select('production_api_key, sandbox_api_key, is_sandbox')
      .eq('integration_name', 'asaas')
      .eq('is_active', true)
      .maybeSingle();

    if (integrationError || !integration) {
      console.error('Asaas integration not configured:', integrationError);
      return new Response(
        JSON.stringify({ error: 'Integração Asaas não configurada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = integration.is_sandbox ? integration.sandbox_api_key : integration.production_api_key;
    const asaasUrl = integration.is_sandbox 
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/v3';

    // Cancel or reactivate on Asaas
    let asaasResponse;
    if (cancel) {
      asaasResponse = await fetch(`${asaasUrl}/subscriptions/${asaasSubscriptionId}`, {
        method: 'DELETE',
        headers: {
          'access_token': apiKey!,
          'Content-Type': 'application/json',
        },
      });
    } else {
      // For reactivation, we need to call the restore endpoint
      asaasResponse = await fetch(`${asaasUrl}/subscriptions/${asaasSubscriptionId}/restore`, {
        method: 'POST',
        headers: {
          'access_token': apiKey!,
          'Content-Type': 'application/json',
        },
      });
    }

    if (!asaasResponse.ok) {
      const errorData = await asaasResponse.text();
      console.error('Asaas API error:', errorData);
      return new Response(
        JSON.stringify({ error: `Erro ao ${cancel ? 'cancelar' : 'reativar'} assinatura no Asaas` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update local subscription
    const updateData: Record<string, unknown> = {
      status: cancel ? 'CANCELED' : 'ACTIVE',
      updated_at: new Date().toISOString(),
    };

    if (cancel) {
      updateData.cancelled_at = new Date().toISOString();
    } else {
      updateData.cancelled_at = null;
    }

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update(updateData)
      .eq('id', subscriptionId);

    if (updateError) {
      console.error('Error updating subscription:', updateError);
      return new Response(
        JSON.stringify({ error: 'Erro ao atualizar assinatura' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send webhooks if configured
    if (cancel) {
      // Cancellation follows the entitlement contract, identical to the one the
      // customer self-service path emits. Access is NOT revoked on the spot:
      // the payload carries entitlement.expires_at = end of the paid period.
      const { queued, skipped } = await queueCancellationWebhooks(
        supabase,
        subscription as CancellationSubscriptionRow,
        updateData.cancelled_at as string,
      );

      if (skipped) {
        console.error(
          `Cancellation webhook not queued for subscription ${subscriptionId}: ${skipped}`,
        );
      } else {
        console.log(`Queued ${queued} cancellation webhooks for subscription ${subscriptionId}`);
      }
    } else {
      // Reactivation keeps the legacy payload shape: its entitlement contract is
      // not defined yet. `event` is written explicitly so the signed
      // X-PaymentBeta-Event header matches body.event instead of falling back to
      // the column default ('sale.confirmed').
      const webhooks = (subscription.products as SubscriptionProduct)?.webhooks ?? [];
      const activeWebhooks = webhooks.filter((w) => w.is_active);

      if (activeWebhooks.length > 0) {
        const webhookPayload = {
          event: 'subscription.reactivated',
          subscription: {
            id: subscription.id,
            asaas_subscription_id: subscription.asaas_subscription_id,
            status: 'ACTIVE',
            value: subscription.value,
            cycle: subscription.cycle,
            cancelled_at: null,
          },
          product_id: subscription.product_id,
          timestamp: new Date().toISOString(),
        };

        for (const webhook of activeWebhooks) {
          await supabase.from('webhook_queue').insert({
            product_id: subscription.product_id,
            product_webhook_id: webhook.id,
            webhook_url: webhook.webhook_url,
            payload: webhookPayload,
            status: 'pending',
            event: 'subscription.reactivated',
          });
        }

        console.log(`Queued ${activeWebhooks.length} reactivation webhooks for delivery`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Assinatura ${cancel ? 'cancelada' : 'reativada'} com sucesso`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in cancel-subscription function:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
