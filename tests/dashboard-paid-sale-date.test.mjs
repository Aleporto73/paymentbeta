import assert from "node:assert/strict";
import test from "node:test";

// Fuso do negócio: sem isso, um ambiente em UTC esconde exatamente o bug testado.
process.env.TZ = "America/Sao_Paulo";

import { paidSaleDate } from "../src/lib/salesDate.ts";

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
