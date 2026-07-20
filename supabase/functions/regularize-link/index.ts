// supabase/functions/regularize-link/index.ts
//
// Recebe o subscription_id (o subscriptions.id INTERNO do PaymentBeta — o mesmo
// que o AbaMinds guarda em workspace_billing_scopes.scope_ref) e devolve o
// invoiceUrl da cobranca EM ABERTO da assinatura no Asaas, pro cliente
// regularizar (cartao/PIX/boleto) na propria pagina do Asaas.
//
// Seguranca: mesmo padrao do WEBHOOK_QUEUE_CRON_TOKEN — um segredo dedicado
// (REGULARIZE_LINK_TOKEN) enviado como Bearer, comparado em tempo constante.
// Endpoint server-to-server (chamado pelo servidor do AbaMinds). Nao cria
// sessao de cliente, nao expoe service-role, nao escreve nada.
//
// Estrategia de status (confirmada na doc do Asaas):
//   - Cobranca a vencer  = PENDING.
//   - Cobranca vencida   = OVERDUE (evento PAYMENT_OVERDUE; fluxo CREATED ->
//     OVERDUE -> ...). Filtrar SO por PENDING perderia as vencidas.
//   - Nao dependemos do filtro status=OVERDUE na query (instavel na pratica):
//     buscamos as cobrancas da assinatura e filtramos por status EM ABERTO
//     {PENDING, OVERDUE} no codigo, classificando vencida por dueDate.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Status "em aberto" (nao pagos). Filtro EXPLICITO — nunca a primeira que achar.
const OPEN_STATUSES = ["OVERDUE", "PENDING"] as const;
type OpenStatus = (typeof OPEN_STATUSES)[number];

const getBearerToken = (req: Request): string | null => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
};

// SHA-256 hex de uma string utf-8.
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

// Comparacao em tempo constante (mesma ideia do timingSafeEqualHex do projeto).
// Hasheia os dois lados: o comprimento comparado e sempre 64, entao nem o
// tamanho do segredo vaza.
async function secretMatches(candidate: string, secret: string): Promise<boolean> {
  if (!candidate || !secret) return false;
  const a = await sha256Hex(candidate);
  const b = await sha256Hex(secret);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const isUuidLike = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

interface AsaasPayment {
  id: string;
  status: string;
  dueDate: string | null; // 'YYYY-MM-DD'
  value: number | null;
  invoiceUrl: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // 1) Autenticacao por segredo compartilhado dedicado.
  const bearer = getBearerToken(req);
  const secret = Deno.env.get("REGULARIZE_LINK_TOKEN") ?? "";
  if (!bearer || !secret || !(await secretMatches(bearer, secret))) {
    return json({ error: "Nao autorizado" }, 401);
  }

  // 2) Entrada.
  let body: { subscription_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON invalido" }, 400);
  }
  const subscriptionId =
    typeof body.subscription_id === "string" ? body.subscription_id.trim() : "";
  if (!subscriptionId || !isUuidLike(subscriptionId)) {
    return json({ error: "subscription_id invalido" }, 400);
  }

  // 3) Client admin + config.
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfigured" }, 500);
  const supabase = createClient(supabaseUrl, serviceKey);

  // 4) Assinatura interna -> id do Asaas.
  const { data: subscription, error: subError } = await supabase
    .from("subscriptions")
    .select("id, asaas_subscription_id")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (subError) {
    console.error("Erro ao carregar subscription:", subError);
    return json({ error: "Erro ao carregar assinatura" }, 500);
  }
  const asaasSubscriptionId = subscription?.asaas_subscription_id ?? null;
  if (!asaasSubscriptionId) {
    return json({ error: "Assinatura nao encontrada ou sem vinculo no Asaas" }, 404);
  }

  // 5) Credenciais do Asaas (mesma fonte das outras functions).
  const { data: integration, error: settingsError } = await supabase
    .from("integration_settings")
    .select("production_api_key, sandbox_api_key, is_sandbox")
    .eq("integration_name", "asaas")
    .eq("is_active", true)
    .maybeSingle();

  if (settingsError || !integration) {
    return json({ error: "Integracao Asaas nao configurada" }, 500);
  }
  const apiKey = integration.is_sandbox
    ? integration.sandbox_api_key
    : integration.production_api_key;
  if (!apiKey) return json({ error: "Chave da API do Asaas ausente" }, 500);
  const asaasBaseUrl = integration.is_sandbox
    ? "https://sandbox.asaas.com/api/v3"
    : "https://www.asaas.com/api/v3";

  // 6) Buscar as cobrancas da assinatura no Asaas (SEM filtro de status na
  //    query: retorna PENDING e OVERDUE; filtramos no codigo).
  const listUrl =
    `${asaasBaseUrl}/payments?subscription=${encodeURIComponent(asaasSubscriptionId)}` +
    `&limit=100`;

  let charges: AsaasPayment[];
  try {
    const resp = await fetch(listUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json", "access_token": apiKey },
    });
    if (!resp.ok) throw new Error(`Asaas HTTP ${resp.status}`);
    const payload = await resp.json();
    charges = Array.isArray(payload?.data) ? (payload.data as AsaasPayment[]) : [];
  } catch (e) {
    console.error("Falha ao consultar Asaas:", e);
    return json({ error: "Falha ao consultar o Asaas" }, 502);
  }

  // 7) Filtro EXPLICITO {PENDING, OVERDUE} + so com link, ordenado por
  //    vencimento (mais antiga primeiro = a vencida a quitar).
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD' (UTC)
  const open = charges
    .filter((c) => OPEN_STATUSES.includes(c.status as OpenStatus))
    .filter((c) => typeof c.invoiceUrl === "string" && c.invoiceUrl.length > 0)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  const chosen = open[0] ?? null;
  if (!chosen) {
    // Sem cobranca em aberto: resposta valida de negocio, nao e erro.
    return json({ invoiceUrl: null, charge: null, reason: "no_open_charge" }, 200);
  }

  const isOverdue =
    chosen.status === "OVERDUE" || (chosen.dueDate ?? "9999-12-31") < today;

  return json(
    {
      invoiceUrl: chosen.invoiceUrl,
      charge: {
        id: chosen.id,
        status: chosen.status,
        dueDate: chosen.dueDate,
        value: chosen.value,
        isOverdue,
      },
    },
    200,
  );
});
