import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  return match?.[1] ?? null;
};

const requireAdmin = async (req: Request, supabaseClient: ReturnType<typeof createClient>) => {
  const token = getBearerToken(req);

  if (!token) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: roles, error: rolesError } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (rolesError) {
    console.error("Error checking admin role:", rolesError);
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  if (!roles?.some(({ role }) => role === "admin")) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  return null;
};

interface ConversionEvent {
  productId: string;
  eventType: "InitiateCheckout" | "Purchase";
  value: number;
  currency: string;
  transactionId?: string;
  customerEmail?: string;
  customerName?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const adminError = await requireAdmin(req, supabaseClient);
    if (adminError) return adminError;

    const { productId, eventType, value, currency, transactionId, customerEmail, customerName } =
      await req.json() as ConversionEvent;

    console.log("Sending conversion events for product:", productId, "Event:", eventType);

    // Buscar configurações de pixels ativos para o produto
    const { data: adsConfigs, error: configError } = await supabaseClient
      .from("product_ads_configs")
      .select("*")
      .eq("product_id", productId)
      .eq("is_active", true);

    if (configError) {
      console.error("Error fetching ads configs:", configError);
      throw configError;
    }

    if (!adsConfigs || adsConfigs.length === 0) {
      console.log("No active ads configs found for product:", productId);
      return new Response(
        JSON.stringify({ success: true, message: "No active pixels configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    // Enviar evento para cada plataforma configurada
    for (const config of adsConfigs) {
      try {
        let result;
        switch (config.platform) {
          case "meta":
            result = await sendMetaPixelEvent(config, eventType, value, currency, transactionId, customerEmail);
            break;
          case "google":
            result = await sendGoogleAdsEvent(config, eventType, value, currency, transactionId);
            break;
          case "tiktok":
            result = await sendTikTokPixelEvent(config, eventType, value, currency, transactionId, customerEmail);
            break;
          case "taboola":
            result = await sendTaboolaPixelEvent(config, eventType, value, currency, transactionId);
            break;
          default:
            result = { success: false, message: "Unknown platform" };
        }
        results.push({ platform: config.platform, ...result });
      } catch (error) {
        console.error(`Error sending event to ${config.platform}:`, error);
        results.push({
          platform: config.platform,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log("Conversion events sent. Results:", results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-conversion-events:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// Meta Pixel (Facebook Conversions API)
async function sendMetaPixelEvent(
  config: any,
  eventType: string,
  value: number,
  currency: string,
  transactionId?: string,
  customerEmail?: string
) {
  if (!config.token) {
    console.log("Meta Pixel: No access token configured, skipping server-side event");
    return { success: true, message: "No token configured, using client-side pixel only" };
  }

  const eventName = eventType === "InitiateCheckout" ? "InitiateCheckout" : "Purchase";

  // hashEmail e assincrono: sem o await, `em` receberia uma Promise e o e-mail
  // seria serializado como {} -- ou, pior numa versao futura, vazaria.
  const hashedEmail = customerEmail ? await hashEmail(customerEmail) : undefined;

  const eventData = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: "website",
      event_id: transactionId || `${Date.now()}-${Math.random()}`,
      user_data: {
        em: hashedEmail,
      },
      custom_data: {
        value: value,
        currency: currency,
      },
    }],
  };

  const response = await fetch(
    `https://graph.facebook.com/v18.0/${config.pixel_id}/events?access_token=${config.token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventData),
    }
  );

  const result = await response.json();
  console.log("Meta Pixel response:", result);
  
  return { success: response.ok, result };
}

// Google Ads Conversion
async function sendGoogleAdsEvent(
  config: any,
  eventType: string,
  value: number,
  currency: string,
  transactionId?: string
) {
  // Google Ads utiliza o gtag.js no client-side
  // Server-side tracking requer Google Ads API e configuração mais complexa
  console.log("Google Ads: Server-side tracking requires additional setup");
  return { 
    success: true, 
    message: "Use client-side gtag.js for Google Ads tracking",
    note: "Implement gtag conversion tracking in checkout page"
  };
}

// TikTok Pixel (Events API)
async function sendTikTokPixelEvent(
  config: any,
  eventType: string,
  value: number,
  currency: string,
  transactionId?: string,
  customerEmail?: string
) {
  if (!config.token) {
    console.log("TikTok Pixel: No access token configured, skipping server-side event");
    return { success: true, message: "No token configured, using client-side pixel only" };
  }

  const eventName = eventType === "InitiateCheckout" ? "InitiateCheckout" : "CompletePayment";

  const hashedEmail = customerEmail ? await hashEmail(customerEmail) : undefined;

  const eventData = {
    pixel_code: config.pixel_id,
    event: eventName,
    event_id: transactionId || `${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    context: {
      user: {
        email: hashedEmail,
      },
    },
    properties: {
      value: value,
      currency: currency,
    },
  };

  const response = await fetch(
    "https://business-api.tiktok.com/open_api/v1.3/event/track/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": config.token,
      },
      body: JSON.stringify(eventData),
    }
  );

  const result = await response.json();
  console.log("TikTok Pixel response:", result);
  
  return { success: response.ok, result };
}

// Taboola Pixel
async function sendTaboolaPixelEvent(
  config: any,
  eventType: string,
  value: number,
  currency: string,
  transactionId?: string
) {
  // Taboola utiliza principalmente pixel client-side
  console.log("Taboola: Client-side pixel implementation recommended");
  return { 
    success: true, 
    message: "Use client-side Taboola pixel for tracking",
    note: "Implement Taboola pixel script in checkout page"
  };
}

// Hash do e-mail para as APIs de conversao.
//
// Esta funcao ANTES devolvia o e-mail normalizado em TEXTO PURO -- o comentario
// original admitia ("in production, use SHA-256") e ninguem voltou. Meta e
// TikTok exigem SHA-256 nesses campos, entao o valor antigo era ao mesmo tempo
// invalido para as plataformas e um vazamento de dado pessoal do comprador.
//
// Normalizacao conforme exigido por ambas: trim + lowercase, depois SHA-256 em
// hexadecimal minusculo de 64 caracteres.
async function hashEmail(email: string): Promise<string> {
  const normalized = email.toLowerCase().trim();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
