// Camada de dados: Supabase (produção) ou modo demonstração (localStorage).
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

export const TABELAS = ["config", "categorias", "caminhoes", "motoristas", "tabela_fretes", "semanas",
  "fretes", "despesas", "recebimentos", "acertos", "manutencoes"];

const DEMO_KEY = "gobbo_demo_v1";
let sb = null;
let modo = null; // 'supabase' | 'demo'
let cache = {};
const ouvintes = new Set();

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  }));

export async function supabase() {
  if (sb) return sb;
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return sb;
}

export const getModo = () => modo;
export const dados = () => cache;
export const aoMudar = fn => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
const avisar = () => ouvintes.forEach(fn => fn(cache));

// ---------------- modo demonstração ----------------
export async function iniciarDemo() {
  modo = "demo";
  let salvo = null;
  try { salvo = JSON.parse(localStorage.getItem(DEMO_KEY) || "null"); } catch { salvo = null; }
  if (!salvo) {
    try {
      const r = await fetch("data/demo.json", { cache: "no-store" });
      salvo = r.ok ? await r.json() : null;
    } catch { salvo = null; }
  }
  cache = Object.fromEntries(TABELAS.map(t => [t, (salvo && salvo[t]) || []]));
  if (!cache.config.length) cache.config = [{ id: "geral", taxa_cartao: 0.0899, saldo_inicial: 0 }];
  persistirDemo();
  return cache;
}
function persistirDemo() {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(cache)); } catch { /* armazenamento indisponível */ }
}
export function reiniciarDemo() {
  try { localStorage.removeItem(DEMO_KEY); } catch { /* ignore */ }
}

// ---------------- Supabase ----------------
export async function iniciarSupabase() {
  modo = "supabase";
  await recarregar();
  const cli = await supabase();
  cli.channel("gobbo-tempo-real")
    .on("postgres_changes", { event: "*", schema: "public" }, async () => { await recarregar(); })
    .subscribe();
  return cache;
}

export async function recarregar() {
  if (modo !== "supabase") return cache;
  const cli = await supabase();
  const res = await Promise.all(TABELAS.map(t => cli.from(t).select("*").limit(10000)));
  const novo = {};
  res.forEach((r, i) => {
    if (r.error) console.warn(TABELAS[i], r.error.message);
    novo[TABELAS[i]] = r.data || [];
  });
  cache = novo;
  avisar();
  return cache;
}

// ---------------- CRUD genérico ----------------
function limpar(obj) {
  const o = {};
  for (const [k, v] of Object.entries(obj)) o[k] = v === "" ? null : v;
  return o;
}

export async function salvar(tabela, obj) {
  const reg = limpar({ ...obj });
  if (!reg.id) reg.id = uuid();
  if (modo === "demo") {
    const lista = cache[tabela];
    const i = lista.findIndex(x => x.id === reg.id);
    if (i >= 0) lista[i] = { ...lista[i], ...reg }; else lista.push(reg);
    persistirDemo(); avisar();
    return reg;
  }
  const cli = await supabase();
  const { data, error } = await cli.from(tabela).upsert(reg).select().single();
  if (error) throw new Error(error.message);
  await recarregar();
  return data;
}

export async function atualizar(tabela, id, patch) {
  if (modo === "demo") {
    const r = cache[tabela].find(x => x.id === id);
    if (r) Object.assign(r, limpar(patch));
    persistirDemo(); avisar();
    return r;
  }
  const cli = await supabase();
  const { error } = await cli.from(tabela).update(limpar(patch)).eq("id", id);
  if (error) throw new Error(error.message);
  await recarregar();
}

export async function excluir(tabela, id) {
  if (modo === "demo") {
    cache[tabela] = cache[tabela].filter(x => x.id !== id);
    persistirDemo(); avisar();
    return;
  }
  const cli = await supabase();
  const { error } = await cli.from(tabela).delete().eq("id", id);
  if (error) throw new Error(error.message);
  await recarregar();
}

// ---------------- autenticação ----------------
export async function sessaoAtual() {
  const cli = await supabase();
  const { data } = await cli.auth.getSession();
  return data.session;
}
export async function entrar(email, senha) {
  const cli = await supabase();
  const { error } = await cli.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(error.message);
}
export async function cadastrar(nome, email, senha) {
  const cli = await supabase();
  const { data, error } = await cli.auth.signUp({ email, password: senha, options: { data: { nome } } });
  if (error) throw new Error(error.message);
  return data;
}
export async function sair() {
  if (modo === "supabase") { const cli = await supabase(); await cli.auth.signOut(); }
}
export async function meuPerfil() {
  const cli = await supabase();
  const { data: u } = await cli.auth.getUser();
  if (!u?.user) return null;
  const { data } = await cli.from("perfis").select("*").eq("id", u.user.id).maybeSingle();
  return data || { id: u.user.id, nome: u.user.email, papel: "motorista" };
}
export async function listarPerfis() {
  const cli = await supabase();
  const { data, error } = await cli.from("perfis").select("*").order("criado_em");
  if (error) throw new Error(error.message);
  return data || [];
}
export async function atualizarPerfil(id, patch) {
  const cli = await supabase();
  const { error } = await cli.from("perfis").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}
export async function bancoPronto() {
  try {
    const cli = await supabase();
    const { error } = await cli.from("config").select("id").limit(1);
    return !error;
  } catch { return false; }
}
