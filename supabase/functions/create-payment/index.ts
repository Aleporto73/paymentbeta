import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MINIMUM_PAYMENT_VALUE = 5;
const MAX_INSTALLMENTS = 12;

class HttpError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const getServerDueDate = () => {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);

  return dueDate.toISOString().split("T")[0];
};

const requirePositiveMoney = (value: unknown, fieldName: string) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HttpError(`${fieldName} invalido`);
  }

  return roundMoney(parsed);
};

const parseRequestedInstallments = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return 1;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new HttpError("Quantidade de parcelas invalida");
  }

  return parsed;
};

const getPositiveIntegerOrDefault = (value: unknown, fallback: number) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
};

const getSelectedOrderBumpIds = (orderBumps: unknown) => {
  if (!orderBumps) {
    return [];
  }

  if (!Array.isArray(orderBumps)) {
    throw new HttpError("Order bumps invalidos");
  }

  const ids = orderBumps.map((item) => {
    if (typeof item === "string") {
      return item;
    }

    if (item && typeof item === "object" && "id" in item) {
      return String((item as { id: unknown }).id);
    }

    return "";
  });

  if (ids.some((id) => !id)) {
    throw new HttpError("Order bumps invalidos");
  }

  return Array.from(new Set(ids));
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function validateAffiliateCode(
  supabaseClient: ReturnType<typeof createClient>,
  affiliateCode: unknown,
  productId: string,
) {
  if (typeof affiliateCode !== "string" || !affiliateCode.trim()) {
    return null;
  }

  const normalizedAffiliateCode = affiliateCode.trim();

  if (!isUuid(normalizedAffiliateCode)) {
    console.log("Affiliate code ignored because it is not a valid affiliate link id");
    return null;
  }

  const { data: affiliateLink, error } = await supabaseClient
    .from("product_affiliate_links")
    .select("id, product_id, is_active")
    .eq("id", normalizedAffiliateCode)
    .maybeSingle();

  if (error) {
    console.error("Error validating affiliate code:", error);
    throw new HttpError("Afiliado invalido");
  }

  if (!affiliateLink || affiliateLink.product_id !== productId || affiliateLink.is_active !== true) {
    throw new HttpError("Afiliado invalido");
  }

  return normalizedAffiliateCode;
}

async function validateOrderBumps(
  supabaseClient: ReturnType<typeof createClient>,
  orderBumps: unknown,
  productId: string,
) {
  const selectedOrderBumpIds = getSelectedOrderBumpIds(orderBumps);

  if (selectedOrderBumpIds.length === 0) {
    return {
      selectedOrderBumpIds,
      serverOrderBumpsTotal: 0,
    };
  }

  const { data: bumpRows, error: bumpError } = await supabaseClient
    .from("product_order_bumps")
    .select("id, product_id, order_bump_product_id, price, is_active")
    .in("id", selectedOrderBumpIds);

  if (bumpError) {
    console.error("Error fetching order bumps:", bumpError);
    throw new HttpError("Order bump invalido");
  }

  if (!bumpRows || bumpRows.length !== selectedOrderBumpIds.length) {
    throw new HttpError("Order bump invalido");
  }

  const bumpProductIds = new Set<string>();

  for (const bump of bumpRows) {
    if (bump.product_id !== productId || bump.is_active !== true) {
      throw new HttpError("Order bump invalido");
    }

    requirePositiveMoney(bump.price, "Valor do order bump");
    bumpProductIds.add(bump.order_bump_product_id);
  }

  const { data: bumpProducts, error: bumpProductsError } = await supabaseClient
    .from("products")
    .select("id, is_active")
    .in("id", Array.from(bumpProductIds));

  if (bumpProductsError) {
    console.error("Error fetching order bump products:", bumpProductsError);
    throw new HttpError("Produto do order bump invalido");
  }

  const activeBumpProductIds = new Set(
    (bumpProducts ?? [])
      .filter((bumpProduct) => bumpProduct.is_active === true)
      .map((bumpProduct) => bumpProduct.id),
  );

  if (activeBumpProductIds.size !== bumpProductIds.size) {
    throw new HttpError("Produto do order bump inativo");
  }

  const serverOrderBumpsTotal = roundMoney(
    bumpRows.reduce((sum, bump) => sum + requirePositiveMoney(bump.price, "Valor do order bump"), 0),
  );

  return {
    selectedOrderBumpIds,
    serverOrderBumpsTotal,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json();
    const {
      customerData,
      paymentData = {},
      productId,
      priceId,
      affiliateCode,
      orderBumps,
      deviceInfo,
    } = body ?? {};

    console.log("Creating payment for product:", productId);

    if (!productId) {
      throw new HttpError("Product ID is required");
    }

    if (!priceId) {
      throw new HttpError("Price ID is required");
    }

    const { data: product, error: productError } = await supabaseClient
      .from("products")
      .select("id, user_id, name, is_active, product_type, unique_code, installments")
      .eq("id", productId)
      .maybeSingle();

    if (productError) {
      console.error("Error fetching product:", productError);
      throw new HttpError("Produto invalido");
    }

    if (!product) {
      throw new HttpError("Produto nao encontrado", 404);
    }

    if (product.is_active !== true) {
      throw new HttpError("Produto inativo");
    }

    if (!product.user_id) {
      throw new HttpError("Produto sem dono configurado");
    }

    const { data: price, error: priceError } = await supabaseClient
      .from("product_prices")
      .select("id, product_id, name, price, installments, subscription_period")
      .eq("id", priceId)
      .maybeSingle();

    if (priceError) {
      console.error("Error fetching price:", priceError);
      throw new HttpError("Preco invalido");
    }

    if (!price) {
      throw new HttpError("Preco nao encontrado", 404);
    }

    if (price.product_id !== product.id) {
      throw new HttpError("Preco nao pertence ao produto");
    }

    if (product.product_type === "recorrente" || price.subscription_period) {
      throw new HttpError("Produtos recorrentes ainda nao estao disponiveis neste checkout.");
    }

    const productOwnerId = product.user_id;
    const serverSubtotal = requirePositiveMoney(price.price, "Preco");
    const serverDiscount = 0;
    const { selectedOrderBumpIds, serverOrderBumpsTotal } = await validateOrderBumps(
      supabaseClient,
      orderBumps,
      product.id,
    );
    const serverTotal = roundMoney(serverSubtotal + serverOrderBumpsTotal - serverDiscount);

    if (serverTotal < MINIMUM_PAYMENT_VALUE) {
      throw new HttpError("Valor minimo para pagamento nao atingido");
    }

    const billingType = paymentData?.billingType;
    if (billingType !== "PIX" && billingType !== "CREDIT_CARD") {
      throw new HttpError("Metodo de pagamento invalido");
    }

    const configuredMaxInstallments = Math.min(
      getPositiveIntegerOrDefault(price.installments, getPositiveIntegerOrDefault(product.installments, 1)),
      MAX_INSTALLMENTS,
    );
    const requestedInstallments =
      billingType === "CREDIT_CARD" ? parseRequestedInstallments(paymentData?.installmentCount) : 1;

    if (requestedInstallments > configuredMaxInstallments) {
      throw new HttpError("Quantidade de parcelas acima do permitido");
    }

    const installmentValue =
      billingType === "CREDIT_CARD" && requestedInstallments > 1
        ? roundMoney(serverTotal / requestedInstallments)
        : null;

    const validatedAffiliateCode = await validateAffiliateCode(
      supabaseClient,
      affiliateCode,
      product.id,
    );

    // Get integration settings to fetch API key from the real product owner.
    const { data: integrationSettings, error: settingsError } = await supabaseClient
      .from("integration_settings")
      .select("*")
      .eq("integration_name", "asaas")
      .eq("is_active", true)
      .eq("user_id", productOwnerId)
      .maybeSingle();

    if (settingsError || !integrationSettings) {
      console.error("Asaas integration error:", settingsError);
      throw new HttpError("Asaas integration not configured");
    }

    const apiKey = integrationSettings.is_sandbox
      ? integrationSettings.sandbox_api_key
      : integrationSettings.production_api_key;

    if (!apiKey) {
      throw new HttpError("Asaas API key not found");
    }

    const asaasBaseUrl = integrationSettings.is_sandbox
      ? "https://sandbox.asaas.com/api/v3"
      : "https://www.asaas.com/api/v3";

    console.log("Creating payment with customer data");

    // 1. Create or get customer in Asaas
    const customerResponse = await fetch(`${asaasBaseUrl}/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": apiKey,
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
      console.error("Error creating customer:", customerResult);
      throw new HttpError(customerResult.errors?.[0]?.description || "Failed to create customer");
    }

    console.log("Customer created:", customerResult.id);

    // Save customer to local database
    await supabaseClient.from("asaas_customers").upsert({
      user_id: productOwnerId,
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
      onConflict: "asaas_customer_id",
    });

    const dueDate = getServerDueDate();
    const serverDescription = `${product.name}${price.name ? ` - ${price.name}` : ""}`;
    const serverExternalReference = `${product.unique_code}-${Date.now()}`;

    // 2. Create payment in Asaas with server-side pricing only.
    const paymentPayload: any = {
      customer: customerResult.id,
      billingType,
      value: serverTotal,
      dueDate,
      description: serverDescription,
      externalReference: serverExternalReference,
    };

    // Add credit card data if payment is by card
    if (billingType === "CREDIT_CARD" && paymentData.creditCard) {
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
      paymentPayload.remoteIp = deviceInfo?.ip || "127.0.0.1";

      if (requestedInstallments > 1 && installmentValue) {
        paymentPayload.installmentCount = requestedInstallments;
        paymentPayload.installmentValue = installmentValue;
      }
    }

    const paymentResponse = await fetch(`${asaasBaseUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": apiKey,
      },
      body: JSON.stringify(paymentPayload),
    });

    const paymentResult = await paymentResponse.json();

    if (!paymentResponse.ok) {
      console.error("Error creating payment:", paymentResult);
      throw new HttpError(paymentResult.errors?.[0]?.description || "Failed to create payment");
    }

    console.log("Payment created:", paymentResult.id);

    // 3. Tokenize credit card if payment is by card (for one-click upsells)
    let creditCardToken = null;
    if (billingType === "CREDIT_CARD" && paymentData.creditCard) {
      try {
        console.log("Tokenizing credit card for future one-click payments");
        const tokenizeResponse = await fetch(`${asaasBaseUrl}/creditCard/tokenizeCreditCard`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "access_token": apiKey,
          },
          body: JSON.stringify({
            customer: customerResult.id,
            creditCard: {
              holderName: paymentData.creditCard.holderName,
              number: paymentData.creditCard.number,
              expiryMonth: paymentData.creditCard.expiryMonth,
              expiryYear: paymentData.creditCard.expiryYear,
              ccv: paymentData.creditCard.ccv,
            },
            creditCardHolderInfo: {
              name: customerData.name,
              email: customerData.email,
              cpfCnpj: customerData.cpfCnpj,
              postalCode: customerData.postalCode,
              addressNumber: customerData.addressNumber,
              addressComplement: customerData.complement,
              phone: customerData.phone,
              mobilePhone: customerData.mobilePhone,
            },
            remoteIp: deviceInfo?.ip || "127.0.0.1",
          }),
        });

        if (tokenizeResponse.ok) {
          const tokenResult = await tokenizeResponse.json();
          creditCardToken = tokenResult.creditCardToken;
          console.log("Credit card tokenized successfully");
        } else {
          const errorData = await tokenizeResponse.json();
          console.error("Error tokenizing credit card:", errorData);
        }
      } catch (error) {
        console.error("Error in credit card tokenization:", error);
      }
    }

    // 4. Save transaction to local database
    const { data: transactionData, error: transactionError } = await supabaseClient
      .from("transactions")
      .insert({
        user_id: productOwnerId,
        asaas_payment_id: paymentResult.id,
        asaas_customer_id: customerResult.id,
        product_id: product.id,
        price_id: price.id,
        customer_name: customerData.name,
        customer_email: customerData.email,
        customer_cpf_cnpj: customerData.cpfCnpj,
        customer_phone: customerData.mobilePhone || customerData.phone,
        customer_state: customerData.state,
        payment_method: billingType,
        status: paymentResult.status,
        value: serverTotal,
        net_value: paymentResult.netValue,
        due_date: dueDate,
        billing_type: billingType,
        description: serverDescription,
        external_reference: serverExternalReference,
        affiliate_code: validatedAffiliateCode,
        order_bumps_selected: selectedOrderBumpIds,
        order_bumps_amount: serverOrderBumpsTotal,
        installment_count: requestedInstallments,
        installment_value: installmentValue,
        device_type: deviceInfo?.deviceType,
        ip_address: deviceInfo?.ip,
        user_agent: deviceInfo?.userAgent,
        credit_card_token: creditCardToken,
      })
      .select("id, status, value, payment_method, asaas_payment_id, product_id, price_id")
      .single();

    if (transactionError) {
      console.error("Error saving transaction:", transactionError);
      throw new HttpError("Failed to save transaction");
    }

    console.log("Transaction saved with ID:", transactionData.id);

    // 5. Get PIX QR Code if payment method is PIX
    let pixData = null;
    if (billingType === "PIX") {
      const pixResponse = await fetch(`${asaasBaseUrl}/payments/${paymentResult.id}/pixQrCode`, {
        headers: {
          "Content-Type": "application/json",
          "access_token": apiKey,
        },
      });

      if (pixResponse.ok) {
        pixData = await pixResponse.json();
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment: {
          id: paymentResult.id,
          status: paymentResult.status,
          billingType: paymentResult.billingType,
          value: paymentResult.value,
          invoiceUrl: paymentResult.invoiceUrl,
          bankSlipUrl: paymentResult.bankSlipUrl,
        },
        transaction: transactionData,
        pixData,
        invoiceUrl: paymentResult.invoiceUrl,
        bankSlipUrl: paymentResult.bankSlipUrl,
        pricing: {
          subtotal: serverSubtotal,
          discount: serverDiscount,
          orderBumpsTotal: serverOrderBumpsTotal,
          total: serverTotal,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in create-payment:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const status = error instanceof HttpError ? error.status : 400;
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
