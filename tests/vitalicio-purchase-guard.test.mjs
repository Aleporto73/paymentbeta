// Protecao minima e exclusiva do PsicoPlanilhas - Acesso Vitalicio.
//
// As Edge Functions importam modulos Deno e chamam serve() no topo, portanto
// nao sao importaveis diretamente por `node --test`. Os testes combinam um
// modelo comportamental pequeno com auditoria estrutural do codigo e da
// migration. O modelo de concorrencia NAO substitui um teste PostgreSQL real.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), "utf8");

const createPayment = await readSource(
  "../supabase/functions/create-payment/index.ts",
);
const asaasWebhook = await readSource(
  "../supabase/functions/asaas-webhook/index.ts",
);
const checkout = await readSource("../src/pages/Checkout.tsx");
const migration = await readSource(
  "../supabase/migrations/20260724170000_add_vitalicio_purchase_guard.sql",
);

const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/--.*$/gm, "");

const createPaymentCode = stripComments(createPayment);
const webhookCode = stripComments(asaasWebhook);
const checkoutCode = stripComments(checkout);
const migrationCode = stripComments(migration);

const VITALICIO_PRODUCT_ID = "ad27ba35-92a5-4a60-aec8-0b82ae7c0f44";
const IA_PRO_PRODUCT_ID = "7fdcdad8-16f1-4030-b55f-6c51c1952ae5";

const shouldUseVitalicioGuard = (productId) =>
  productId === VITALICIO_PRODUCT_ID;

const createReservationModel = () => {
  let activeGuard = null;
  let serialized = Promise.resolve();

  const reserve = ({ transactionStatus = null } = {}) => {
    const operation = serialized.then(() => {
      if (["CONFIRMED", "RECEIVED"].includes(transactionStatus)) {
        return { result: "purchase_blocked" };
      }

      if (
        [
          "PENDING",
          "OVERDUE",
          "AWAITING_RISK_ANALYSIS",
          "AUTHORIZED",
        ].includes(transactionStatus)
      ) {
        return { result: "purchase_processing" };
      }

      if (activeGuard) {
        return {
          result: activeGuard.status === "paid"
            ? "purchase_blocked"
            : "purchase_processing",
        };
      }

      activeGuard = {
        status: "creating",
        externalReference: "vitalicio-model",
      };
      return {
        result: "reserved",
        externalReference: activeGuard.externalReference,
      };
    });

    serialized = operation.then(() => undefined);
    return operation;
  };

  return {
    reserve,
    getGuard: () => activeGuard && { ...activeGuard },
    setStatus: (status) => {
      if (activeGuard) activeGuard.status = status;
    },
  };
};

const runProtectedPaymentModel = async ({
  reservationResult,
  timeout = false,
}) => {
  let paymentPosts = 0;
  let guardStatus = "creating";

  if (reservationResult !== "reserved") {
    return { result: reservationResult, paymentPosts, guardStatus };
  }

  guardStatus = "unknown";
  paymentPosts += 1;

  if (timeout) {
    return {
      result: "purchase_processing",
      paymentPosts,
      guardStatus,
      retryCount: 0,
    };
  }

  guardStatus = "pending";
  return {
    result: "created",
    paymentPosts,
    guardStatus,
    retryCount: 0,
  };
};

const selectLocalTransactionCustomer = (transactions) =>
  [...transactions]
    .filter(({ asaasCustomerId }) => Boolean(asaasCustomerId))
    .sort((first, second) => {
      const firstPaid = ["CONFIRMED", "RECEIVED"].includes(first.status);
      const secondPaid = ["CONFIRMED", "RECEIVED"].includes(second.status);
      if (firstPaid !== secondPaid) return firstPaid ? -1 : 1;
      return second.createdAt.localeCompare(first.createdAt);
    })[0]?.asaasCustomerId ?? null;

const resolveCustomerModel = ({
  transactionCustomers = [],
  localCustomers = [],
  remoteCustomers = [],
}) => {
  const calls = { remoteGets: 0, customerPosts: 0 };
  const transactionCustomerId =
    selectLocalTransactionCustomer(transactionCustomers);

  if (transactionCustomerId) {
    return { id: transactionCustomerId, source: "transaction", calls };
  }

  if (localCustomers.length > 0) {
    return { id: localCustomers[0].id, source: "local", calls };
  }

  calls.remoteGets += 1;
  const oldestRemote = [...remoteCustomers].sort((first, second) =>
    first.dateCreated.localeCompare(second.dateCreated)
      || first.id.localeCompare(second.id)
  )[0];

  if (oldestRemote) {
    return { id: oldestRemote.id, source: "remote", calls };
  }

  calls.customerPosts += 1;
  return { id: "new-customer", source: "created", calls };
};

test("1. outro produto nao chama a protecao do Vitalicio", () => {
  assert.equal(shouldUseVitalicioGuard("another-product"), false);
  assert.match(
    createPaymentCode,
    /const isVitalicioProduct = product\.id === VITALICIO_PRODUCT_ID/,
  );
});

test("2. IA Pro continua fora do fluxo protegido", () => {
  assert.equal(shouldUseVitalicioGuard(IA_PRO_PRODUCT_ID), false);
  assert.ok(!createPaymentCode.includes(`VITALICIO_PRODUCT_ID = "${IA_PRO_PRODUCT_ID}"`));
});

test("3. PsicoFlow continua fora do fluxo protegido", () => {
  assert.equal(shouldUseVitalicioGuard("psicoflow-product"), false);
  assert.equal(
    (createPaymentCode.match(/const VITALICIO_PRODUCT_ID\s*=/g) ?? []).length,
    1,
  );
  assert.ok(!createPaymentCode.includes("purchase_policy"));
});

test("4. assinaturas continuam no fluxo atual", () => {
  assert.equal(shouldUseVitalicioGuard("recurring-product"), false);
  assert.ok(createPaymentCode.includes("if (isSubscriptionFlow)"));
  assert.ok(createPaymentCode.includes('fetch(`${asaasBaseUrl}/subscriptions`'));
});

test("5. Vitalicio pago bloqueia e executa zero POST de pagamento", async () => {
  const reservation = await createReservationModel().reserve({
    transactionStatus: "CONFIRMED",
  });
  const result = await runProtectedPaymentModel({
    reservationResult: reservation.result,
  });

  assert.equal(result.result, "purchase_blocked");
  assert.equal(result.paymentPosts, 0);
});

test("6. Vitalicio PENDING fica em processamento e executa zero POST", async () => {
  const reservation = await createReservationModel().reserve({
    transactionStatus: "PENDING",
  });
  const result = await runProtectedPaymentModel({
    reservationResult: reservation.result,
  });

  assert.equal(result.result, "purchase_processing");
  assert.equal(result.paymentPosts, 0);
});

test("7. Vitalicio OVERDUE fica em processamento e executa zero POST", async () => {
  const reservation = await createReservationModel().reserve({
    transactionStatus: "OVERDUE",
  });
  const result = await runProtectedPaymentModel({
    reservationResult: reservation.result,
  });

  assert.equal(result.result, "purchase_processing");
  assert.equal(result.paymentPosts, 0);
});

test("8. duas reservas simultaneas produzem somente uma reserved no modelo", async () => {
  const model = createReservationModel();
  const results = await Promise.all([model.reserve(), model.reserve()]);

  assert.deepEqual(
    results.map(({ result }) => result).sort(),
    ["purchase_processing", "reserved"],
  );
  assert.equal(model.getGuard().status, "creating");
  assert.match(
    migrationCode,
    /CREATE UNIQUE INDEX vitalicio_purchase_guards_active_document_key[\s\S]*WHERE status IN \('creating', 'pending', 'paid', 'unknown'\)/,
  );
});

test("9. somente reserved alcanca o POST de pagamento", async () => {
  for (const blockedResult of ["purchase_blocked", "purchase_processing"]) {
    const blocked = await runProtectedPaymentModel({
      reservationResult: blockedResult,
    });
    assert.equal(blocked.paymentPosts, 0);
  }

  const reserved = await runProtectedPaymentModel({
    reservationResult: "reserved",
  });
  assert.equal(reserved.paymentPosts, 1);
});

test("10. o guard muda para unknown antes do POST /payments", () => {
  const handler = createPaymentCode.slice(
    createPaymentCode.indexOf("serve(async (req)"),
  );
  const unknownUpdate = handler.indexOf('status: "unknown"');
  const paymentPost = handler.indexOf(
    'paymentResponse = await fetch(`${asaasBaseUrl}/payments`',
  );

  assert.ok(unknownUpdate > -1);
  assert.ok(paymentPost > unknownUpdate);
});

test("11. timeout mantem unknown e nao repete POST", async () => {
  const result = await runProtectedPaymentModel({
    reservationResult: "reserved",
    timeout: true,
  });

  assert.equal(result.result, "purchase_processing");
  assert.equal(result.guardStatus, "unknown");
  assert.equal(result.paymentPosts, 1);
  assert.equal(result.retryCount, 0);
  assert.ok(!createPaymentCode.includes("reconcile-checkout-attempt"));
});

test("12. cliente de transacao local paga e reutilizado primeiro", () => {
  const result = resolveCustomerModel({
    transactionCustomers: [
      {
        asaasCustomerId: "recent-pending",
        status: "PENDING",
        createdAt: "2026-07-24T12:00:00Z",
      },
      {
        asaasCustomerId: "older-paid",
        status: "CONFIRMED",
        createdAt: "2026-07-20T12:00:00Z",
      },
    ],
  });

  assert.equal(result.id, "older-paid");
  assert.equal(result.source, "transaction");
  assert.deepEqual(result.calls, { remoteGets: 0, customerPosts: 0 });
});

test("13. cliente remoto existente e reutilizado pelo cadastro mais antigo", () => {
  const result = resolveCustomerModel({
    remoteCustomers: [
      { id: "newer", dateCreated: "2026-07-24" },
      { id: "oldest", dateCreated: "2025-01-01" },
    ],
  });

  assert.equal(result.id, "oldest");
  assert.equal(result.source, "remote");
  assert.deepEqual(result.calls, { remoteGets: 1, customerPosts: 0 });

  const resolver = createPaymentCode.slice(
    createPaymentCode.indexOf("async function resolveVitalicioAsaasCustomer"),
    createPaymentCode.indexOf("async function validateCouponCode"),
  );
  assert.ok(resolver.indexOf('method: "GET"') < resolver.indexOf('method: "POST"'));
});

test("14. POST /customers so ocorre quando nao existe cliente", () => {
  const created = resolveCustomerModel({});
  assert.equal(created.source, "created");
  assert.deepEqual(created.calls, { remoteGets: 1, customerPosts: 1 });

  for (const existing of [
    resolveCustomerModel({
      transactionCustomers: [{
        asaasCustomerId: "transaction-customer",
        status: "RECEIVED",
        createdAt: "2026-07-24",
      }],
    }),
    resolveCustomerModel({ localCustomers: [{ id: "local-customer" }] }),
    resolveCustomerModel({
      remoteCustomers: [{ id: "remote-customer", dateCreated: "2026-07-24" }],
    }),
  ]) {
    assert.equal(existing.calls.customerPosts, 0);
  }

  assert.ok(!createPaymentCode.includes("notificationDisabled"));
});

test("15. externalReference do Vitalicio vem do guard", () => {
  assert.match(
    createPaymentCode,
    /vitalicioGuard\?\.externalReference \?\? `\$\{product\.unique_code\}-\$\{Date\.now\(\)\}`/,
  );
  assert.match(
    migrationCode,
    /'vitalicio-' \|\| replace\(v_guard_id::text, '-', ''\)/,
  );
});

test("16. webhook CONFIRMED atualiza o guard para paid", () => {
  assert.match(
    webhookCode,
    /if \(CONFIRMED_PAYMENT_STATUSES\.has\(normalizedStatus\)\) \{\s*return 'paid'/,
  );
  assert.ok(webhookCode.includes("updateVitalicioGuardFromWebhook("));
  assert.ok(
    webhookCode.includes("if (nextStatus !== 'paid')"),
    "eventos posteriores nao podem liberar nem regredir um guard paid",
  );
});

test("17. webhook PENDING atualiza o guard para pending", () => {
  assert.match(
    webhookCode,
    /VITALICIO_PENDING_PAYMENT_STATUSES\.has\(normalizedStatus\)[\s\S]*return 'pending'/,
  );
  assert.ok(
    webhookCode.includes(".from('vitalicio_purchase_guards')"),
  );
});

test("18. frontend nao dispara Purchase em blocked ou processing", () => {
  const guardedResultBranch = checkoutCode.slice(
    checkoutCode.indexOf('data?.result === "purchase_blocked"'),
    checkoutCode.indexOf("if (!data.success)"),
  );

  assert.ok(guardedResultBranch.includes('"purchase_processing"'));
  assert.ok(guardedResultBranch.includes("setVitalicioGuardResult(data.result)"));
  assert.ok(guardedResultBranch.includes("setShowPixModal(false)"));
  assert.ok(guardedResultBranch.includes("return;"));
  assert.ok(!guardedResultBranch.includes('fireClientSideEvent("Purchase"'));
  assert.ok(!guardedResultBranch.includes("window.location.href"));
  assert.match(
    checkoutCode,
    /disabled=\{processing \|\| isBelowMinimum \|\| Boolean\(vitalicioGuardResult\)\}/,
  );
});

test("19. migration nao altera products nem transactions historicos", () => {
  assert.doesNotMatch(
    migrationCode,
    /\b(?:ALTER|UPDATE|DELETE|INSERT INTO)\s+(?:TABLE\s+)?public\.(?:products|transactions)\b/i,
  );
  assert.equal(
    (migrationCode.match(/\bCREATE TABLE\b/gi) ?? []).length,
    1,
  );
  assert.equal(
    (migrationCode.match(/\bCREATE OR REPLACE FUNCTION\b/gi) ?? []).length,
    1,
  );
});

test("migration limita a RPC ao produto e produtor autorizados", () => {
  assert.ok(migrationCode.includes(VITALICIO_PRODUCT_ID));
  assert.ok(
    migrationCode.includes("b803d01d-8511-4280-a4fc-dac718f3f33e"),
  );
  assert.match(
    migrationCode,
    /REVOKE ALL ON FUNCTION public\.reserve_vitalicio_purchase[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    migrationCode,
    /GRANT EXECUTE ON FUNCTION public\.reserve_vitalicio_purchase[\s\S]*TO service_role/,
  );
});

test("migration cobre pagos, abertos e documento normalizado", () => {
  assert.match(migrationCode, /upper\(t\.status\) IN \('CONFIRMED', 'RECEIVED'\)/);
  assert.match(
    migrationCode,
    /'PENDING',\s*'OVERDUE',\s*'AWAITING_RISK_ANALYSIS',\s*'AUTHORIZED'/,
  );
  assert.match(
    migrationCode,
    /customer_document ~ '\^\(\[0-9\]\{11\}\|\[0-9\]\{14\}\)\$'/,
  );
});

test("implementacao nao reintroduz o sistema generico descartado", () => {
  const combined = `${createPaymentCode}\n${webhookCode}\n${migrationCode}`;

  for (const forbidden of [
    "purchase_policy",
    "checkout_identities",
    "identity_key_version",
    "HMAC",
    "resume_token",
    "checkout_payment_attempts",
  ]) {
    assert.ok(!combined.includes(forbidden), `${forbidden} nao deveria existir`);
  }
});
