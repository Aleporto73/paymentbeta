import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const webhookData = await req.json();
    console.log('Received webhook:', webhookData.event, 'for payment:', webhookData.payment?.id);

    // Handle payment events
    if (webhookData.event && webhookData.event.startsWith('PAYMENT_')) {
      const payment = webhookData.payment;
      
      if (!payment || !payment.id) {
        console.error('Invalid payment data in webhook');
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Find the transaction by asaas_payment_id
      const { data: existingTransaction, error: findError } = await supabaseAdmin
        .from('transactions')
        .select('*')
        .eq('asaas_payment_id', payment.id)
        .single();

      if (findError && findError.code !== 'PGRST116') {
        console.error('Error finding transaction:', findError);
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Update or create transaction
      const transactionData: any = {
        status: payment.status,
        net_value: payment.netValue,
        payment_date: payment.paymentDate,
        confirmed_date: payment.confirmedDate,
        credit_date: payment.creditDate,
        updated_at: new Date().toISOString(),
      };

      if (existingTransaction) {
        // Update existing transaction
        const { error: updateError } = await supabaseAdmin
          .from('transactions')
          .update(transactionData)
          .eq('asaas_payment_id', payment.id);

        if (updateError) {
          console.error('Error updating transaction:', updateError);
        } else {
          console.log('Transaction updated:', payment.id);
        }
      } else {
        // Create new transaction if it doesn't exist
        // This can happen if webhook arrives before the create-payment response
        console.log('Transaction not found, creating from webhook data');
        
        // We need to find the user_id from the customer
        const { data: customerData } = await supabaseAdmin
          .from('asaas_customers')
          .select('user_id')
          .eq('asaas_customer_id', payment.customer)
          .single();

        if (customerData) {
          const { error: insertError } = await supabaseAdmin
            .from('transactions')
            .insert({
              user_id: customerData.user_id,
              asaas_payment_id: payment.id,
              asaas_customer_id: payment.customer,
              customer_name: '', // Will be filled from customer data if needed
              customer_email: '', // Will be filled from customer data if needed
              payment_method: payment.billingType,
              status: payment.status,
              value: payment.value,
              net_value: payment.netValue,
              due_date: payment.dueDate,
              payment_date: payment.paymentDate,
              confirmed_date: payment.confirmedDate,
              credit_date: payment.creditDate,
              billing_type: payment.billingType,
              description: payment.description,
              external_reference: payment.externalReference,
              installment_count: payment.installmentCount || 1,
              ...transactionData,
            });

          if (insertError) {
            console.error('Error inserting transaction:', insertError);
          }
        }
      }
    }

    // Handle subscription events
    if (webhookData.event && webhookData.event.startsWith('SUBSCRIPTION_')) {
      const subscription = webhookData.subscription;
      
      if (!subscription || !subscription.id) {
        console.error('Invalid subscription data in webhook');
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Find user_id from customer
      const { data: customerData } = await supabaseAdmin
        .from('asaas_customers')
        .select('user_id')
        .eq('asaas_customer_id', subscription.customer)
        .single();

      if (!customerData) {
        console.error('Customer not found for subscription:', subscription.customer);
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const subscriptionData: any = {
        user_id: customerData.user_id,
        asaas_subscription_id: subscription.id,
        asaas_customer_id: subscription.customer,
        status: subscription.status,
        value: subscription.value,
        next_due_date: subscription.nextDueDate,
        cycle: subscription.cycle,
        description: subscription.description,
        billing_type: subscription.billingType,
        updated_at: new Date().toISOString(),
      };

      if (webhookData.event === 'SUBSCRIPTION_CREATED') {
        await supabaseAdmin.from('subscriptions').insert(subscriptionData);
        console.log('Subscription created:', subscription.id);
      } else {
        await supabaseAdmin
          .from('subscriptions')
          .update(subscriptionData)
          .eq('asaas_subscription_id', subscription.id);
        console.log('Subscription updated:', subscription.id);
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, received: true }),
      { 
        status: 200, // Return 200 to prevent Asaas from retrying
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
