import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INVALID_COUPON_RESPONSE = {
  success: false,
  error: "Cupom inválido ou expirado",
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getOptionalNumberField = (record: Record<string, unknown>, fieldNames: string[]) => {
  for (const fieldName of fieldNames) {
    const parsed = Number(record[fieldName]);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const getOptionalDateField = (record: Record<string, unknown>, fieldNames: string[]) => {
  for (const fieldName of fieldNames) {
    const value = record[fieldName];

    if (typeof value !== "string" || !value.trim()) {
      continue;
    }

    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
};

const getEligibleAmount = (body: Record<string, unknown>) => {
  const parsed = Number(body.eligibleAmount ?? body.subtotal);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return roundMoney(parsed);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(INVALID_COUPON_RESPONSE, 405);
  }

  try {
    const body = await req.json() as Record<string, unknown>;
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    const couponCode = typeof body.couponCode === "string" ? body.couponCode.trim().toUpperCase() : "";
    const eligibleAmount = getEligibleAmount(body);

    if (!productId || !couponCode || eligibleAmount === null) {
      return jsonResponse(INVALID_COUPON_RESPONSE);
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: coupon, error } = await supabaseClient
      .from("product_coupons")
      .select("*")
      .eq("code", couponCode)
      .eq("product_id", productId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("[validate-coupon] Error validating coupon:", error);
      return jsonResponse(INVALID_COUPON_RESPONSE);
    }

    if (!coupon || coupon.product_id !== productId || coupon.is_active !== true) {
      return jsonResponse(INVALID_COUPON_RESPONSE);
    }

    const couponRecord = coupon as Record<string, unknown>;
    const expiresAt = getOptionalDateField(couponRecord, [
      "expires_at",
      "valid_until",
      "expiresAt",
      "validUntil",
    ]);

    if (expiresAt && expiresAt.getTime() < Date.now()) {
      return jsonResponse(INVALID_COUPON_RESPONSE);
    }

    const minimumAmount = getOptionalNumberField(couponRecord, [
      "minimum_amount",
      "minimum_value",
      "min_purchase_value",
      "min_value",
    ]);

    if (minimumAmount !== null && eligibleAmount < minimumAmount) {
      return jsonResponse(INVALID_COUPON_RESPONSE);
    }

    const discountValue = Number(coupon.discount_value);
    const discountType = coupon.discount_type;

    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return jsonResponse(INVALID_COUPON_RESPONSE);
    }

    let calculatedDiscount = 0;

    if (discountType === "percentage") {
      calculatedDiscount = (eligibleAmount * discountValue) / 100;
    } else if (discountType === "fixed") {
      calculatedDiscount = discountValue;
    } else {
      return jsonResponse(INVALID_COUPON_RESPONSE);
    }

    return jsonResponse({
      success: true,
      coupon: {
        code: coupon.code,
        discount_type: discountType,
        discount_value: discountValue,
        discount_amount: roundMoney(Math.min(calculatedDiscount, eligibleAmount)),
      },
    });
  } catch (error) {
    console.error("[validate-coupon] Error:", error);
    return jsonResponse(INVALID_COUPON_RESPONSE);
  }
});
