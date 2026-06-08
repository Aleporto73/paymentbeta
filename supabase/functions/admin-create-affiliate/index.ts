import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

class HttpError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

interface CreateAffiliateRequest {
  affiliateId?: string;
  productId?: string;
  name?: string;
  email?: string;
  password?: string;
  asaasWalletId?: string | null;
  commissionType?: string;
  commissionValue?: number;
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  return match?.[1] ?? null;
};

const getAppOrigin = (req: Request) => {
  const origin = req.headers.get("origin")?.trim() || "https://paymentbeta.vercel.app";

  return origin.replace(/\/+$/, "");
};

const requireString = (value: unknown, fieldName: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(`${fieldName} obrigatorio`);
  }

  return value.trim();
};

const parseCommissionValue = (value: unknown) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError("Valor de comissao invalido");
  }

  return parsed;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const parseOptionalWalletId = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new HttpError("Wallet ID Asaas invalido");
  }

  const normalizedWalletId = value.trim();

  if (!normalizedWalletId) {
    return null;
  }

  if (!isUuid(normalizedWalletId)) {
    throw new HttpError("Wallet ID Asaas invalido");
  }

  return normalizedWalletId;
};

const requireAdminUser = async (
  req: Request,
  supabaseAdmin: ReturnType<typeof createClient>,
) => {
  const token = getBearerToken(req);

  if (!token) {
    throw new HttpError("Nao autenticado", 401);
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    console.error("Authentication error:", authError);
    throw new HttpError("Nao autenticado", 401);
  }

  const { data: roles, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (rolesError) {
    console.error("Error checking admin role:", rolesError);
    throw new HttpError("Acesso negado", 403);
  }

  if (!roles?.some(({ role }) => role === "admin")) {
    throw new HttpError("Acesso negado", 403);
  }

  return user;
};

const getCheckoutPrice = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  productId: string,
) => {
  const { data: defaultPrice, error: defaultPriceError } = await supabaseAdmin
    .from("product_prices")
    .select("unique_code")
    .eq("product_id", productId)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  if (defaultPriceError) {
    console.error("Error fetching default price:", defaultPriceError);
    throw new HttpError("Erro ao buscar preco do produto", 500);
  }

  if (defaultPrice) {
    return defaultPrice;
  }

  const { data: firstPrice, error: firstPriceError } = await supabaseAdmin
    .from("product_prices")
    .select("unique_code")
    .eq("product_id", productId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstPriceError) {
    console.error("Error fetching first price:", firstPriceError);
    throw new HttpError("Erro ao buscar preco do produto", 500);
  }

  return firstPrice;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    await requireAdminUser(req, supabaseAdmin);

    const body = (await req.json()) as CreateAffiliateRequest;
    const affiliateId = typeof body.affiliateId === "string" && body.affiliateId.trim()
      ? body.affiliateId.trim()
      : null;
    const productId = requireString(body.productId, "Produto");
    const commissionType = requireString(body.commissionType, "Tipo de comissao");
    const commissionValue = parseCommissionValue(body.commissionValue);
    const asaasWalletId = parseOptionalWalletId(body.asaasWalletId);

    if (!["percentage", "fixed"].includes(commissionType)) {
      throw new HttpError("Tipo de comissao invalido");
    }

    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, unique_code")
      .eq("id", productId)
      .maybeSingle();

    if (productError) {
      console.error("Error fetching product:", productError);
      throw new HttpError("Erro ao buscar produto", 500);
    }

    if (!product) {
      throw new HttpError("Produto nao encontrado", 404);
    }

    let affiliate: {
      id: string;
      user_id: string;
      name: string;
      email: string;
      asaas_wallet_id: string | null;
      is_active?: boolean | null;
    } | null = null;
    let reusedAffiliate = false;

    if (affiliateId) {
      if (!isUuid(affiliateId)) {
        throw new HttpError("Afiliado invalido");
      }

      const { data: existingAffiliateById, error: existingAffiliateByIdError } = await supabaseAdmin
        .from("affiliates")
        .select("id, user_id, name, email, asaas_wallet_id, is_active")
        .eq("id", affiliateId)
        .maybeSingle();

      if (existingAffiliateByIdError) {
        console.error("Error checking existing affiliate by id:", existingAffiliateByIdError);
        throw new HttpError("Erro ao verificar afiliado", 500);
      }

      if (!existingAffiliateById) {
        throw new HttpError("Afiliado nao encontrado", 404);
      }

      if (existingAffiliateById.is_active === false) {
        throw new HttpError("Afiliado inativo");
      }

      if (asaasWalletId && existingAffiliateById.asaas_wallet_id !== asaasWalletId) {
        const { data: updatedAffiliate, error: updateAffiliateError } = await supabaseAdmin
          .from("affiliates")
          .update({ asaas_wallet_id: asaasWalletId })
          .eq("id", existingAffiliateById.id)
          .select("id, user_id, name, email, asaas_wallet_id, is_active")
          .single();

        if (updateAffiliateError || !updatedAffiliate) {
          console.error("Error updating affiliate Wallet ID status:", updateAffiliateError);
          throw new HttpError("Erro ao atualizar afiliado", 500);
        }

        affiliate = updatedAffiliate;
      } else {
        affiliate = existingAffiliateById;
      }

      reusedAffiliate = true;
    } else {
      const name = requireString(body.name, "Nome");
      const email = requireString(body.email, "Email").toLowerCase();
      const { data: existingAffiliate, error: existingAffiliateError } = await supabaseAdmin
        .from("affiliates")
        .select("id, user_id, name, email, asaas_wallet_id, is_active")
        .eq("email", email)
        .maybeSingle();

      if (existingAffiliateError) {
        console.error("Error checking existing affiliate:", existingAffiliateError);
        throw new HttpError("Erro ao verificar afiliado", 500);
      }

      affiliate = existingAffiliate;
      reusedAffiliate = Boolean(existingAffiliate);

      if (!affiliate) {
        const password = requireString(body.password, "Senha");

        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: name,
          },
        });

        if (authError || !authData.user) {
          console.error("Error creating auth user:", authError);
          throw new HttpError(authError?.message || "Erro ao criar usuario", 400);
        }

        const { data: createdAffiliate, error: affiliateError } = await supabaseAdmin
          .from("affiliates")
          .insert({
            user_id: authData.user.id,
            name,
            email,
            asaas_wallet_id: asaasWalletId,
          })
          .select("id, user_id, name, email, asaas_wallet_id, is_active")
          .single();

        if (affiliateError || !createdAffiliate) {
          console.error("Error creating affiliate:", affiliateError);
          throw new HttpError("Erro ao criar afiliado", 500);
        }

        affiliate = createdAffiliate;
        reusedAffiliate = false;
      } else if (affiliate.is_active === false) {
        throw new HttpError("Afiliado inativo");
      } else if (asaasWalletId && affiliate.asaas_wallet_id !== asaasWalletId) {
        const { data: updatedAffiliate, error: updateAffiliateError } = await supabaseAdmin
          .from("affiliates")
          .update({ asaas_wallet_id: asaasWalletId })
          .eq("id", affiliate.id)
          .select("id, user_id, name, email, asaas_wallet_id, is_active")
          .single();

        if (updateAffiliateError || !updatedAffiliate) {
          console.error("Error updating affiliate Wallet ID status:", updateAffiliateError);
          throw new HttpError("Erro ao atualizar afiliado", 500);
        }

        affiliate = updatedAffiliate;
      }
    }

    if (!affiliate) {
      throw new HttpError("Afiliado nao encontrado", 404);
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        {
          user_id: affiliate.user_id,
          role: "affiliate",
        },
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );

    if (roleError) {
      console.error("Error assigning affiliate role:", roleError);
      throw new HttpError("Erro ao atribuir perfil de afiliado", 500);
    }

    const { data: existingLink, error: existingLinkError } = await supabaseAdmin
      .from("product_affiliate_links")
      .select("id")
      .eq("product_id", productId)
      .eq("affiliate_id", affiliate.id)
      .maybeSingle();

    if (existingLinkError) {
      console.error("Error checking existing affiliate link:", existingLinkError);
      throw new HttpError("Erro ao verificar vinculo do afiliado", 500);
    }

    const linkPayload = {
      affiliate_id: affiliate.id,
      affiliate_name: affiliate.name || name,
      affiliate_url: null as string | null,
      commission_type: commissionType,
      commission_value: commissionValue,
      is_active: true,
      product_id: productId,
    };

    const linkResult = existingLink
      ? await supabaseAdmin
          .from("product_affiliate_links")
          .update(linkPayload)
          .eq("id", existingLink.id)
          .select("id")
          .single()
      : await supabaseAdmin
          .from("product_affiliate_links")
          .insert(linkPayload)
          .select("id")
          .single();

    if (linkResult.error || !linkResult.data) {
      console.error("Error saving affiliate link:", linkResult.error);
      throw new HttpError("Erro ao salvar vinculo do afiliado", 500);
    }

    const linkId = linkResult.data.id;
    const price = await getCheckoutPrice(supabaseAdmin, productId);
    const appOrigin = getAppOrigin(req);
    const affiliateUrl = price?.unique_code
      ? `${appOrigin}/checkout?product=${product.unique_code}&price=${price.unique_code}&affiliate=${linkId}`
      : null;

    if (affiliateUrl) {
      const { error: updateLinkError } = await supabaseAdmin
        .from("product_affiliate_links")
        .update({ affiliate_url: affiliateUrl })
        .eq("id", linkId);

      if (updateLinkError) {
        console.error("Error updating affiliate URL:", updateLinkError);
        throw new HttpError("Erro ao atualizar link do afiliado", 500);
      }
    }

    return jsonResponse({
      success: true,
      affiliateId: affiliate.id,
      asaasWalletId: affiliate.asaas_wallet_id,
      linkId,
      affiliateUrl,
      reusedAffiliate,
    });
  } catch (error) {
    console.error("Error in admin-create-affiliate:", error);
    const message = error instanceof Error ? error.message : "Erro interno do servidor";
    const status = error instanceof HttpError ? error.status : 500;

    return jsonResponse({ error: message }, status);
  }
});
