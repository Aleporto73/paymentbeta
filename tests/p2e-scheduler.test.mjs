// P2E — agendador da webhook_queue.
//
// A migration nao e executada aqui: estes testes afirmam sobre o TEXTO do SQL,
// que e exatamente onde mora o risco. A regra critica deste bloco -- a chave de
// service-role NUNCA ser interpolada no comando persistido em cron.job -- e uma
// propriedade do arquivo, e um teste de texto e a forma certa de trava-la.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260719230000_schedule_webhook_queue_processor.sql",
    import.meta.url,
  ),
  "utf8",
);

const config = await readFile(
  new URL("../supabase/config.toml", import.meta.url),
  "utf8",
);

/** SQL executavel: sem comentarios de linha. */
const sql = migration.replace(/--.*$/gm, "");

/**
 * Corpo do job, tal como sera persistido em cron.job.command.
 *
 * Extraido do SQL SEM comentarios: o cabecalho da migration cita `$job$` ao
 * explicar o mecanismo, e recortar sobre o texto cru pegaria a prosa em vez do
 * comando.
 */
const jobCommand = (() => {
  const start = sql.indexOf("$job$");
  const end = sql.indexOf("$job$", start + 5);
  assert.ok(start > -1 && end > start, "o corpo do job deve estar entre $job$");
  return sql.slice(start + 5, end);
})();

const SECRET_NAME = "paymentbeta_webhook_queue_service_role_key";
const JOB_NAME = "paymentbeta_webhook_queue_processor";

// ---------------------------------------------------------------------
// 1-2. extensoes
// ---------------------------------------------------------------------

test("1. a migration instala pg_cron de forma idempotente", () => {
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS pg_cron\s*;/);
});

test("2. a migration instala pg_net de forma idempotente", () => {
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS pg_net\s*;/);
});

test("2b. a assinatura do pg_net e verificada antes de agendar", () => {
  // Sem esta guarda, um schema diferente geraria um job que so quebra em
  // execucao, uma vez por minuto, em silencio.
  assert.ok(
    sql.includes("to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)')"),
    "deve haver checagem explicita da funcao",
  );
  const guarda = sql.indexOf("to_regprocedure");
  const agenda = sql.indexOf("cron.schedule");
  assert.ok(guarda < agenda, "a checagem vem antes do agendamento");
});

// ---------------------------------------------------------------------
// 3-8. o job
// ---------------------------------------------------------------------

test("3. o job tem o nome estavel esperado", () => {
  assert.ok(sql.includes(`'${JOB_NAME}'`));
});

test("4. o schedule e exatamente * * * * *", () => {
  assert.match(
    sql,
    new RegExp(`cron\\.schedule\\(\\s*'${JOB_NAME}',\\s*'\\* \\* \\* \\* \\*'`),
    "um minuto, nem mais nem menos",
  );
});

test("5. a URL e exatamente a Edge Function do projeto", () => {
  assert.ok(
    jobCommand.includes(
      "url := 'https://nwaihnoxcxhtitgagcqk.supabase.co/functions/v1/process-webhook-queue'",
    ),
  );
  // Nenhuma outra Edge pode ser alvo deste job.
  const urls = jobCommand.match(/functions\/v1\/[a-z-]+/g) ?? [];
  assert.deepEqual([...new Set(urls)], ["functions/v1/process-webhook-queue"]);
});

test("6. o metodo e POST", () => {
  assert.ok(jobCommand.includes("net.http_post("), "http_post, nao http_get");
  assert.ok(!jobCommand.includes("http_get"), "nada de GET");
});

test("7. o timeout e 10000 ms", () => {
  assert.ok(jobCommand.includes("timeout_milliseconds := 10000"));
});

test("8. o body e um objeto vazio", () => {
  assert.ok(jobCommand.includes("body := '{}'::jsonb"));
});

test("8b. os headers sao montados com jsonb_build_object", () => {
  assert.ok(jobCommand.includes("headers := jsonb_build_object("));
  assert.ok(jobCommand.includes("'Content-Type', 'application/json'"));
});

// ---------------------------------------------------------------------
// 9-11, 18-19. o segredo
// ---------------------------------------------------------------------

test("9. o segredo e lido de vault.decrypted_secrets", () => {
  assert.ok(jobCommand.includes("FROM vault.decrypted_secrets"));
  assert.ok(jobCommand.includes("SELECT decrypted_secret"));
});

test("10. o nome do segredo esta correto", () => {
  assert.ok(jobCommand.includes(`WHERE name = '${SECRET_NAME}'`));
  assert.ok(sql.includes(SECRET_NAME), "a pre-condicao usa o mesmo nome");
});

test("11. nenhum valor de segredo aparece no arquivo", () => {
  // Um service-role key e um JWT: tres segmentos base64url separados por ponto,
  // comecando por eyJ. Nenhum pode existir no arquivo, em lugar nenhum.
  assert.ok(
    !/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(migration),
    "JWT encontrado no arquivo",
  );
  // Nem qualquer cadeia longa que pareca uma chave solta.
  assert.ok(
    !/\beyJ[A-Za-z0-9_-]{20,}/.test(migration),
    "inicio de JWT encontrado no arquivo",
  );
});

test("18. o comando persistido consulta o Vault em RUNTIME", () => {
  // A subconsulta faz parte do texto do job, entre $job$...$job$, e por isso e
  // avaliada a cada execucao -- nao no momento da migration.
  assert.match(
    jobCommand,
    /'Bearer ' \|\| \(\s*SELECT decrypted_secret\s*FROM vault\.decrypted_secrets\s*WHERE name = '/,
    "o Authorization e composto em tempo de execucao",
  );
});

test("19. nenhuma chave e interpolada no comando do job", () => {
  // format() com o valor, ou concatenacao fora do bloco $job$, escapariam o
  // segredo para dentro de cron.job.command.
  assert.ok(!/format\s*\(/i.test(sql), "format() nao pode ser usado aqui");
  assert.ok(
    !/EXECUTE\s+/i.test(sql),
    "SQL dinamico permitiria montar o comando com o valor",
  );
  assert.ok(
    !/\|\|\s*v_secret|\|\|\s*v_key/i.test(sql),
    "nenhuma variavel de segredo concatenada",
  );

  // A unica leitura do valor fora do job e o teste de nao-vazio da pre-condicao.
  const forbidden = sql
    .split("$job$")
    .filter((_, i) => i % 2 === 0)
    .join("\n");
  // `(?!s)` separa a COLUNA `decrypted_secret` do nome da VIEW
  // `decrypted_secrets` -- so a coluna carrega o valor.
  const leituras = forbidden.match(/decrypted_secret(?!s)/g) ?? [];
  assert.equal(
    leituras.length,
    1,
    "fora do job, o valor so pode ser tocado uma vez: a checagem de presenca",
  );
  assert.ok(
    forbidden.includes("coalesce(btrim(decrypted_secret), '') <> ''"),
    "e essa unica leitura deve ser apenas o teste de nao-vazio",
  );
});

// ---------------------------------------------------------------------
// 12-14. o que nao pode existir
// ---------------------------------------------------------------------

test("12/13. nenhuma service-role ou anon key literal", () => {
  for (const proibido of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "service_role_key'",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "anon",
    "apikey",
  ]) {
    // O NOME do segredo contem "service_role_key", entao comparamos sem ele.
    const semNome = migration.split(SECRET_NAME).join("");
    assert.ok(
      !semNome.includes(proibido),
      `${proibido} nao pode aparecer na migration`,
    );
  }
});

test("14. a migration nao altera verify_jwt nem torna a funcao publica", () => {
  // Sobre o SQL executavel: o cabecalho MENCIONA verify_jwt justamente para
  // registrar que nao o altera.
  assert.ok(!/verify_jwt/i.test(sql), "nenhum SQL pode tocar verify_jwt");
  assert.ok(!/GRANT|REVOKE|POLICY|ROW LEVEL SECURITY/i.test(sql));

  // E o config.toml segue protegendo a funcao.
  assert.match(
    config,
    /\[functions\.process-webhook-queue\]\s*\nverify_jwt = false/,
    "o gateway continua como estava; a guarda real e o requireAdmin da Edge",
  );
});

// ---------------------------------------------------------------------
// 15-17. reaplicacao
// ---------------------------------------------------------------------

test("15. o job anterior de mesmo nome e removido antes de recriar", () => {
  assert.ok(sql.includes("cron.unschedule('" + JOB_NAME + "')"));
  const unschedule = sql.indexOf("cron.unschedule");
  const schedule = sql.indexOf("cron.schedule");
  assert.ok(unschedule < schedule, "remover antes de criar");
});

test("16. nenhum outro job e removido", () => {
  // Toda remocao e filtrada pelo nome exato.
  const unscheduleCalls = sql.match(/cron\.unschedule\([^)]*\)/g) ?? [];
  assert.equal(unscheduleCalls.length, 1, "uma unica remocao");
  assert.ok(unscheduleCalls[0].includes(`'${JOB_NAME}'`));

  assert.ok(!/DELETE\s+FROM\s+cron\.job/i.test(sql), "nada de DELETE direto");
  assert.ok(!/TRUNCATE/i.test(sql));

  // O EXISTS que guarda a remocao tambem filtra por nome.
  assert.ok(sql.includes(`FROM cron.job WHERE jobname = '${JOB_NAME}'`));
});

test("17. segredo ausente aborta a migration antes de agendar", () => {
  assert.match(
    sql,
    /IF NOT EXISTS \([\s\S]*?vault\.decrypted_secrets[\s\S]*?RAISE EXCEPTION/,
    "a pre-condicao deve abortar",
  );
  const guarda = sql.indexOf("RAISE EXCEPTION");
  const agenda = sql.indexOf("cron.schedule");
  assert.ok(guarda < agenda, "a guarda vem antes do agendamento");

  // E o agendamento e verificado depois: exatamente um job.
  assert.ok(sql.includes("expected exactly 1 job named"));
});

test("17b. a migration e reaplicavel e transacional", () => {
  assert.ok(sql.trim().startsWith("BEGIN"), "abre transacao");
  assert.ok(sql.trim().endsWith("COMMIT;"), "fecha transacao");
  const schedules = sql.match(/cron\.schedule\(/g) ?? [];
  assert.equal(schedules.length, 1, "um unico job criado");
});

// ---------------------------------------------------------------------
// 21. escopo
// ---------------------------------------------------------------------

test("21. o agendador nao emite nem menciona evento financeiro", () => {
  for (const evento of [
    "subscription.pending",
    "subscription.payment_failed",
    "subscription.access_revoked",
    "sale.confirmed",
  ]) {
    assert.ok(!migration.includes(evento), `a migration nao pode citar ${evento}`);
  }
  // O cron so dispara a Edge; nao toca a fila. Os identificadores do job e do
  // segredo contem "webhook_queue" no nome, entao sao removidos antes do teste.
  const semIdentificadores = sql.split(JOB_NAME).join("").split(SECRET_NAME).join("");
  assert.ok(
    !/webhook_queue/i.test(semIdentificadores),
    "o cron nao pode ler nem escrever na tabela da fila",
  );
});
