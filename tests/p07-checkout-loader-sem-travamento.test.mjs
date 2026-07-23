// P0.7 — o carregamento publico do checkout nao pode travar no Web Lock do GoTrue
// nem ficar em loader infinito.
//
// Causa confirmada em 23/07/2026: `_getAccessToken()` do supabase-js chama
// `auth.getSession()` em toda query `.from()`, e `getSession()` toma um Web Lock
// exclusivo com espera infinita (`_acquireLock(-1)`). Com o lock retido, a
// primeira query do checkout nunca saia do navegador -- loader eterno, sem erro
// no console e sem registro no servidor. Reproduzido segurando
// `lock:sb-<ref>-auth-token` e abrindo o checkout: parado em "Carregando...".
//
// Checkout.tsx e um componente React com JSX e imports por alias '@/', entao nao
// e importavel sob `node --test`. Seguindo o padrao de
// p06a-checkout-sem-upsell-token.test.mjs, as afirmacoes sao sobre o texto-fonte.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const checkoutCode = stripComments(await readSource("../src/pages/Checkout.tsx"));
const publicClientCode = stripComments(await readSource("../src/integrations/supabase/publicClient.ts"));

// O bloco de carregamento inicial: do inicio do effect ate o cleanup.
const loadEffect = checkoutCode.slice(
  checkoutCode.indexOf("let unmounted = false"),
  checkoutCode.indexOf("fetchCheckoutData();"),
);

test("o client publico desliga o GoTrue via accessToken", () => {
  assert.match(publicClientCode, /accessToken:\s*async\s*\(\)\s*=>\s*SUPABASE_PUBLISHABLE_KEY/);
  // accessToken faz o supabase-js NAO instanciar o GoTrueClient: sem lock, sem
  // localStorage, sem timer de refresh. Persistir sessao aqui reintroduz o bug.
  assert.doesNotMatch(publicClientCode, /persistSession:\s*true/);
  assert.doesNotMatch(publicClientCode, /autoRefreshToken:\s*true/);
  assert.doesNotMatch(publicClientCode, /localStorage/);
});

test("o carregamento publico do checkout nao usa o client com sessao", () => {
  assert.ok(loadEffect.length > 0, "bloco de carregamento nao encontrado");
  for (const tabela of [
    "products",
    "product_order_bumps",
    "product_prices",
    "product_ads_configs",
  ]) {
    assert.match(
      loadEffect,
      new RegExp(`publicSupabase\\s*\\n?\\s*\\.from\\("${tabela}"\\)|publicSupabase\\.from\\("${tabela}"\\)`),
      `${tabela} deveria ser lido pelo client publico`,
    );
  }
  // Nenhuma query do carregamento pode voltar ao client com sessao.
  assert.doesNotMatch(loadEffect, /[^c]supabase\s*\n?\s*\.from\(/);
});

test("o submit do pagamento continua no client original", () => {
  // O fluxo de pagamento nao foi tocado por esta correcao.
  assert.match(checkoutCode, /supabase\.functions\.invoke\("create-payment"/);
  assert.match(checkoutCode, /supabase\.functions\.invoke\("validate-coupon"/);
  assert.doesNotMatch(checkoutCode, /publicSupabase\.functions/);
});

test("o loader tem teto de 8s, limpeza de timer e guarda contra resposta tardia", () => {
  assert.match(checkoutCode, /CHECKOUT_LOAD_TIMEOUT_MS\s*=\s*8000/);

  // O timeout encerra o loader e marca o estado de erro.
  assert.match(loadEffect, /timedOut\s*=\s*true/);
  assert.match(loadEffect, /setLoadTimedOut\(true\)/);
  assert.match(loadEffect, /setLoading\(false\)/);

  // Timer limpo na conclusao (finally) e no unmount (cleanup do effect).
  const cleanup = checkoutCode.slice(checkoutCode.indexOf("fetchCheckoutData();"));
  assert.match(loadEffect, /finally\s*{\s*clearTimeout\(timer\)/);
  assert.match(cleanup, /unmounted\s*=\s*true;\s*clearTimeout\(timer\)/);

  // Resposta tardia nao pode sobrescrever o estado ja decidido.
  assert.match(loadEffect, /const isStale = \(\) => unmounted \|\| timedOut/);
  assert.match(loadEffect, /if \(!isStale\(\)\) setLoading\(false\)/);
  // Toda escrita de estado do carregamento fica atras da guarda.
  const guardas = loadEffect.match(/if \(isStale\(\)\) return;/g) ?? [];
  assert.ok(guardas.length >= 6, `esperava >=6 guardas isStale, achei ${guardas.length}`);
});

test("a tela de timeout permite recarregar e nao culpa o link do comprador", () => {
  assert.match(checkoutCode, /loadTimedOut \? window\.location\.reload\(\)/);
  assert.match(checkoutCode, /Tentar novamente/);
  assert.match(checkoutCode, /loadTimedOut \? "hidden" : ""/);
});
