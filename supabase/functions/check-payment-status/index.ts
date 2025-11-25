import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { paymentId, userId } = await req.json();

    if (!paymentId || !userId) {
      throw new Error('Payment ID and User ID are required');
    }

    // Get integration settings to fetch API key
    const { data: integrationSettings, error: settingsError } = await supabaseClient
      .from('integration_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('integration_name', 'asaas')
      .single();

    if (settingsError || !integrationSettings) {
      throw new Error('Asaas integration not configured');
    }

    const apiKey = integrationSettings.is_sandbox 
      ? integrationSettings.sandbox_api_key 
      : integrationSettings.production_api_key;

    if (!apiKey) {
      throw new Error('Asaas API key not found');
    }

    const asaasBaseUrl = integrationSettings.is_sandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://www.asaas.com/api/v3';

    // Check payment status in Asaas
    const paymentResponse = await fetch(`${asaasBaseUrl}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
      },
    });

    if (!paymentResponse.ok) {
      throw new Error('Failed to fetch payment status');
    }

    const paymentData = await paymentResponse.json();

    // Update local transaction if needed
    if (paymentData.status === 'CONFIRMED' || paymentData.status === 'RECEIVED') {
      await supabaseClient
        .from('transactions')
        .update({
          status: paymentData.status,
          payment_date: paymentData.paymentDate,
          confirmed_date: paymentData.confirmedDate,
          updated_at: new Date().toISOString(),
        })
        .eq('asaas_payment_id', paymentId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: paymentData.status,
        payment: paymentData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error checking payment status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
