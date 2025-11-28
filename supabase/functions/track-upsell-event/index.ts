import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const { upsellId, productId, eventType, revenueGenerated } = await req.json();

    console.log("[track-upsell-event] Tracking event:", {
      upsellId,
      productId,
      eventType,
      revenueGenerated,
    });

    if (!upsellId || !productId || !eventType) {
      throw new Error("Missing required fields");
    }

    // Validate event type
    if (!["view", "accept", "reject"].includes(eventType)) {
      throw new Error("Invalid event type");
    }

    // Insert analytics event
    const { error: insertError } = await supabaseClient
      .from("product_upsell_analytics")
      .insert({
        upsell_id: upsellId,
        product_id: productId,
        event_type: eventType,
        revenue_generated: revenueGenerated || 0,
      });

    if (insertError) {
      console.error("[track-upsell-event] Insert error:", insertError);
      throw insertError;
    }

    console.log("[track-upsell-event] Event tracked successfully");

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[track-upsell-event] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
