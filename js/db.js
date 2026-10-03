// Camada de dados: Supabase (produção) ou modo demonstração (localStorage).
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

export const TABELAS = ["config", "categorias", "caminhoes", "motoristas", "tabela_fretes", "semanas",
  "fretes", "despesas", "recebimentos", "acertos", "manutencoes", "abastecimentos", "planos_manutencao", "checklists", "bonus_media",
  "empresas", "socios", "dividas", "movimentos", "pendencias", "orcamentos", "notas_internas"];

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
    .on("postgres_changes", { event: "*", schema: "public" }, () => agendarRecarga())
    .subscribe();
  return cache;
}

// Tempo real: junta várias alterações seguidas numa recarga só (importações geram milhares de eventos).
let pausaTempoReal = 0, timerRecarga = null;
function agendarRecarga() {
  if (pausaTempoReal) return;
  clearTimeout(timerRecarga);
  timerRecarga = setTimeout(() => { recarregar(); }, 1500);
}

// Supabase devolve no máximo 1000 linhas por consulta: busca em páginas.
// Rede de celular falha às vezes ("Load failed" no iPhone): cada página tenta até 3 vezes.
async function pagina(cli, t, de) {
  let ult;
  for (let i = 0; i < 3; i++) {
    try { const r = await cli.from(t).select("*").range(de, de + 999); if (!r.error) return r; ult = r; }
    catch (e) { ult = { error: { message: e.message } }; }
    await new Promise(ok => setTimeout(ok, 700 * (i + 1)));
  }
  return ult;
}
async function buscarTudo(cli, t) {
  let todos = [], de = 0;
  for (;;) {
    const r = await pagina(cli, t, de);
    if (r.error) return r;
    todos = todos.concat(r.data || []);
    if (!r.data || r.data.length < 1000) return { data: todos };
    de += 1000;
  }
}

export async function recarregar() {
  if (modo !== "supabase") return cache;
  const cli = await supabase();
  const res = await Promise.all(TABELAS.map(t => buscarTudo(cli, t)));
  const falhas = res.map((r, i) => r.error && TABELAS[i]).filter(Boolean);
  // sem os lançamentos não dá para mostrar nada confiável: avisa quem chamou (abre a cópia local)
  if (falhas.includes("movimentos")) throw new Error("não foi possível baixar os lançamentos (" + res[TABELAS.indexOf("movimentos")].error.message + ")");
  const novo = {};
  res.forEach((r, i) => { novo[TABELAS[i]] = r.data || (cache[TABELAS[i]] || []); });
  if (falhas.length) console.warn("tabelas com falha:", falhas.join(", "));
  cache = novo; offline = null;
  guardarCopia();
  avisar();
  return cache;
}

// ---------------- cópia local (abre o app sem sinal / com rede ruim) ----------------
const COPIA_KEY = "gobbo_copia_v1";
let offline = null; // data/hora da cópia em uso quando o servidor não respondeu
export const emCopiaLocal = () => offline;
function guardarCopia() {
  try { localStorage.setItem(COPIA_KEY, JSON.stringify({ em: new Date().toISOString(), dados: cache })); } catch { /* sem espaço: segue sem cópia */ }
}
export function abrirCopia() {
  try { const c = JSON.parse(localStorage.getItem(COPIA_KEY) || "null"); if (!c?.dados?.movimentos) return null;
    modo = "supabase"; cache = c.dados; offline = c.em; avisar(); return c.em; } catch { return null; }
}
export function apagarCopia() { try { localStorage.removeItem(COPIA_KEY); localStorage.removeItem("gobbo_perfil"); } catch { /* */ } }

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

// Grava muitos registros de uma vez (importação). Upsert pela chave informada.
export async function salvarMuitos(tabela, regs, chave = "id") {
  if (modo === "demo") {
    regs.forEach(r => { const reg = limpar({ ...r }); if (!reg.id) reg.id = uuid();
      const i = cache[tabela].findIndex(x => x[chave] === reg[chave]); if (i >= 0) cache[tabela][i] = { ...cache[tabela][i], ...reg }; else cache[tabela].push(reg); });
    persistirDemo(); avisar(); return regs.length;
  }
  const cli = await supabase();
  pausaTempoReal++;
  try {
    for (let i = 0; i < regs.length; i += 500) {
      const { error } = await cli.from(tabela).upsert(regs.slice(i, i + 500).map(limpar), { onConflict: chave });
      if (error) throw new Error(error.message);
    }
  } finally { pausaTempoReal--; }
  await recarregar();
  return regs.length;
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
  apagarCopia();
  if (modo === "supabase") { const cli = await supabase(); await cli.auth.signOut(); }
}
export async function recuperarSenha(email) {
  const cli = await supabase();
  const { error } = await cli.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) throw new Error(error.message);
}
export async function trocarSenha(nova) {
  const cli = await supabase();
  const { error } = await cli.auth.updateUser({ password: nova });
  if (error) throw new Error(error.message);
}
export async function aoEventoAuth(fn) { const cli = await supabase(); cli.auth.onAuthStateChange((ev) => fn(ev)); }
// registra erro do aparelho no servidor (para diagnóstico); nunca derruba o app
export async function registrarErro(etapa, e, versao) {
  try {
    if (modo === "demo") return;
    const cli = await supabase();
    await cli.from("erros_app").insert({ etapa, mensagem: String(e?.message || e).slice(0, 500), detalhe: String(e?.stack || "").slice(0, 2000),
      aparelho: navigator.userAgent.slice(0, 300) + (matchMedia("(display-mode: standalone)").matches ? " [app]" : " [navegador]"), versao });
  } catch { /* sem rede: ignora */ }
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

export async function rpc(fn, args = {}) {
  const cli = await supabase();
  const { data, error } = await cli.rpc(fn, args);
  if (error) throw new Error(error.message);
  await recarregar();
  return data;
}

// ---------------- comprovantes (Supabase Storage, bucket privado) ----------------
const demoArquivos = new Map(); // modo demonstração: arquivo fica só nesta aba
export async function enviarComprovante(file, movId) {
  const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
  const caminho = `${movId}/${Date.now()}${ext}`;
  if (modo === "demo") { demoArquivos.set(caminho, URL.createObjectURL(file)); return caminho; }
  const cli = await supabase();
  const { error } = await cli.storage.from("comprovantes").upload(caminho, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return caminho;
}
export async function urlComprovante(caminho) {
  if (!caminho) return null;
  if (modo === "demo") return demoArquivos.get(caminho) || null;
  const cli = await supabase();
  const { data, error } = await cli.storage.from("comprovantes").createSignedUrl(caminho, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
export async function excluirComprovante(caminho) {
  if (!caminho || modo === "demo") { demoArquivos.delete(caminho); return; }
  const cli = await supabase();
  await cli.storage.from("comprovantes").remove([caminho]);
}
