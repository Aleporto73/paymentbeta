import assert from "node:assert/strict";
import test from "node:test";

// Fuso do negócio: sem isso, um ambiente em UTC esconde exatamente o bug testado.
process.env.TZ = "America/Sao_Paulo";

import {
  businessDay,
  businessDayRange,
  formatDayOverDayChange,
  paidSaleDate,
} from "../src/lib/salesDate.ts";

// Linhas reais de transactions (paymentbeta-prod, 23/07/2026).
const CONFIRMED_TODAY_CREATED_LAST_WEEK = {
  created_at: "2026-07-15T20:02:57.833936+00:00",
  confirmed_date: "2026-07-23T00:00:00+00:00",
  payment_date: null,
};

const RECEIVED_YESTERDAY_CREATED_TODAY_UTC = {
  created_at: "2026-07-23T00:12:57.738297+00:00",
  confirmed_date: "2026-07-22T00:00:00+00:00",
  payment_date: "2026-07-22T00:00:00+00:00",
};

test("usa a data de confirmação, não a de criação da cobrança", () => {
  assert.equal(paidSaleDate(CONFIRMED_TODAY_CREATED_LAST_WEEK), "2026-07-23");
  assert.equal(paidSaleDate(RECEIVED_YESTERDAY_CREATED_TODAY_UTC), "2026-07-22");
});

test("data pura à meia-noite UTC não escorrega pro dia anterior no fuso local", () => {
  // Sem a extração por string, new Date("2026-07-23T00:00:00Z") em Brasília
  // (UTC-3) vira 22/07 21:00 e a venda de hoje some do card.
  assert.equal(paidSaleDate(CONFIRMED_TODAY_CREATED_LAST_WEEK), "2026-07-23");
});

test("cai pro created_at só quando não há data de pagamento", () => {
  assert.equal(
    paidSaleDate({ created_at: "2026-07-23T12:00:00+00:00", confirmed_date: null, payment_date: null }),
    "2026-07-23",
  );
});

test("checkout_events agrupa pelo dia comercial de São Paulo, não por UTC", () => {
  // 02:30 UTC do dia 23 ainda é 23:30 do dia 22 em Brasília: agrupar por UTC
  // empurraria o acesso da noite pro dia seguinte.
  assert.equal(businessDay("2026-07-23T02:30:00+00:00"), "2026-07-22");
  assert.equal(businessDay("2026-07-23T03:00:00+00:00"), "2026-07-23");
  assert.equal(businessDay("2026-07-23T23:59:00+00:00"), "2026-07-23");
});

test("comparação com ontem usa a variação real, e não inventa +100%", () => {
  // Dados reais de 23/07/2026: R$ 57,00 hoje contra R$ 669,45 ontem.
  assert.equal(formatDayOverDayChange(57, 669.45), "-91.5% vs ontem");
  assert.equal(formatDayOverDayChange(37, 28), "+32.1% vs ontem");
  assert.equal(formatDayOverDayChange(669.45, 57), "+1074.5% vs ontem");
});

test("base zero não vira +100%", () => {
  assert.equal(formatDayOverDayChange(57, 0), "Sem comparação com ontem");
  assert.equal(formatDayOverDayChange(0, 0), "0% vs ontem");
  assert.equal(formatDayOverDayChange(0, 57), "-100.0% vs ontem");
});

test("a janela do gráfico traz dias consecutivos terminando em hoje", () => {
  assert.deepEqual(businessDayRange("2026-07-23", 7), [
    "2026-07-17",
    "2026-07-18",
    "2026-07-19",
    "2026-07-20",
    "2026-07-21",
    "2026-07-22",
    "2026-07-23",
  ]);
  assert.equal(businessDayRange("2026-07-23", 30).length, 30);
  // Vira o mês sem buraco.
  assert.deepEqual(businessDayRange("2026-08-02", 3), ["2026-07-31", "2026-08-01", "2026-08-02"]);
});
