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

    const {
      customerData,
      paymentData,
      productId,
      priceId,
      userId,
    } = await req.json();

    console.log('Creating payment for product:', productId);

    if (!userId) {
      throw new Error('User ID is required');
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

    const { affiliateCode, orderBumps, deviceInfo } = await req.json();

    console.log('Creating payment with customer data');

    // 1. Create or get customer in Asaas
    const customerResponse = await fetch(`${asaasBaseUrl}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
      },
      body: JSON.stringify({
        name: customerData.name,
        email: customerData.email,
        cpfCnpj: customerData.cpfCnpj,
        phone: customerData.phone,
        mobilePhone: customerData.mobilePhone,
        postalCode: customerData.postalCode,
        address: customerData.address,
        addressNumber: customerData.addressNumber,
        complement: customerData.complement,
        province: customerData.province,
        city: customerData.city,
        state: customerData.state,
      }),
    });

    const customerResult = await customerResponse.json();
    
    if (!customerResponse.ok) {
      console.error('Error creating customer:', customerResult);
      throw new Error(customerResult.errors?.[0]?.description || 'Failed to create customer');
    }

    console.log('Customer created:', customerResult.id);

    // Save customer to local database
    await supabaseClient.from('asaas_customers').upsert({
      user_id: userId,
      asaas_customer_id: customerResult.id,
      name: customerData.name,
      email: customerData.email,
      cpf_cnpj: customerData.cpfCnpj,
      phone: customerData.phone,
      mobile_phone: customerData.mobilePhone,
      postal_code: customerData.postalCode,
      address: customerData.address,
      address_number: customerData.addressNumber,
      complement: customerData.complement,
      province: customerData.province,
      city: customerData.city,
      state: customerData.state,
    }, {
      onConflict: 'asaas_customer_id'
    });

    // 2. Create payment in Asaas
    const paymentPayload: any = {
      customer: customerResult.id,
      billingType: paymentData.billingType,
      value: paymentData.value,
      dueDate: paymentData.dueDate,
      description: paymentData.description,
      externalReference: paymentData.externalReference,
    };

    // Add credit card data if payment is by card
    if (paymentData.billingType === 'CREDIT_CARD' && paymentData.creditCard) {
      paymentPayload.creditCard = paymentData.creditCard;
      paymentPayload.creditCardHolderInfo = {
        name: customerData.name,
        email: customerData.email,
        cpfCnpj: customerData.cpfCnpj,
        postalCode: customerData.postalCode,
        addressNumber: customerData.addressNumber,
        addressComplement: customerData.complement,
        phone: customerData.phone,
        mobilePhone: customerData.mobilePhone,
      };
      paymentPayload.remoteIp = deviceInfo?.ip || '127.0.0.1';

      // Add installments if applicable
      if (paymentData.installmentCount && paymentData.installmentCount > 1) {
        paymentPayload.installmentCount = paymentData.installmentCount;
        paymentPayload.installmentValue = paymentData.installmentValue;
      }
    }

    const paymentResponse = await fetch(`${asaasBaseUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
      },
      body: JSON.stringify(paymentPayload),
    });

    const paymentResult = await paymentResponse.json();

    if (!paymentResponse.ok) {
      console.error('Error creating payment:', paymentResult);
      throw new Error(paymentResult.errors?.[0]?.description || 'Failed to create payment');
    }

    console.log('Payment created:', paymentResult.id);

    // 3. Save transaction to local database
    await supabaseClient.from('transactions').insert({
      user_id: userId,
      asaas_payment_id: paymentResult.id,
      asaas_customer_id: customerResult.id,
      product_id: productId,
      price_id: priceId,
      customer_name: customerData.name,
      customer_email: customerData.email,
      customer_cpf_cnpj: customerData.cpfCnpj,
      customer_phone: customerData.mobilePhone || customerData.phone,
      customer_state: customerData.state,
      payment_method: paymentData.billingType,
      status: paymentResult.status,
      value: paymentData.value,
      net_value: paymentResult.netValue,
      due_date: paymentData.dueDate,
      billing_type: paymentData.billingType,
      description: paymentData.description,
      external_reference: paymentData.externalReference,
      affiliate_code: affiliateCode,
      order_bumps_selected: orderBumps?.map((ob: any) => ob.id),
      order_bumps_amount: orderBumps?.reduce((sum: number, ob: any) => sum + ob.price, 0) || 0,
      installment_count: paymentData.installmentCount || 1,
      installment_value: paymentData.installmentValue,
      device_type: deviceInfo?.deviceType,
      ip_address: deviceInfo?.ip,
      user_agent: deviceInfo?.userAgent,
    });

    // 4. Get PIX QR Code if payment method is PIX
    let pixData = null;
    if (paymentData.billingType === 'PIX') {
      const pixResponse = await fetch(`${asaasBaseUrl}/payments/${paymentResult.id}/pixQrCode`, {
        headers: {
          'Content-Type': 'application/json',
          'access_token': apiKey,
        },
      });

      if (pixResponse.ok) {
        pixData = await pixResponse.json();
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment: paymentResult,
        pixData,
        invoiceUrl: paymentResult.invoiceUrl,
        bankSlipUrl: paymentResult.bankSlipUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-payment:', error);
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
