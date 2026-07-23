import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Client somente-leitura para o carregamento publico do checkout.
//
// O comprador e anonimo: nao ha sessao a recuperar, renovar ou persistir. Usar o
// client do painel (persistSession + autoRefreshToken + localStorage) custava
// caro no checkout porque `_getAccessToken()` do supabase-js chama
// `auth.getSession()` em TODA query `.from()`, e `getSession()` toma um Web Lock
// exclusivo (`lock:sb-<ref>-auth-token`) com espera infinita -- `_acquireLock(-1)`.
// Bastava esse lock estar retido (outra aba do dominio, ou o proprio
// autoRefreshToken renovando token sobre uma conexao movel estagnada) para a
// PRIMEIRA query do checkout nunca sair do navegador: loader eterno, sem erro no
// console, sem entrada no Network, sem registro no servidor.
//
// `accessToken` resolve na raiz: com essa opcao o supabase-js NAO instancia o
// GoTrueClient (SupabaseClient.js:60) -- nao ha lock, nem localStorage, nem timer
// de refresh, nem listener de auth. `_getAccessToken()` retorna no primeiro `if`
// e a query vai direto para a rede. As policies de leitura publica ja atendem o
// papel `anon`, entao a chave publicavel e exatamente a credencial correta aqui.
//
// O client do painel (`./client`) fica intacto: ele precisa de sessao.
export const publicSupabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  accessToken: async () => SUPABASE_PUBLISHABLE_KEY,
});
