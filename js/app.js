import * as db from "./db.js";
import * as C from "./calc.js";
import * as H from "./holding.js";
import { EMPRESA, EMPRESA_LOG } from "./config.js";

const { brl, brl0, pct, dataBR, n, soma, hojeISO } = C;
const root = document.getElementById("root");
const hoje = hojeISO();
const S = {
  perfil: null, ym: hoje.slice(0, 7), ano: Number(hoje.slice(0, 4)),
  kanban: "fretes", lanc: "fretes", rel: "dre", cad: "motoristas", busca: "",
};
const charts = [];

// ---------------- utilidades ----------------
// aceita "1.234,56", "1234,56" e "1234.56"
const numBR = v => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  let t = String(v).trim().replace(/[R$\s]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ""); // "99.500" = 99500 (milhar)
  const x = Number(t);
  return isFinite(x) ? x : null;
};
const meuCaminhao = () => D().motoristas?.find(m => m.id === S.perfil?.motorista_id)?.caminhao_id || "";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const D = () => db.dados();
const socio = () => db.getModo() === "demo" || S.perfil?.papel === "socio";
const nomeMot = id => D().motoristas.find(m => m.id === id)?.nome || "";
const nomeCam = id => D().caminhoes.find(c => c.id === id)?.nome || "";
const codSem = id => D().semanas.find(s => s.id === id)?.codigo || "";
const mesLabel = ym => C.MESES[Number(ym.slice(5, 7)) - 1] + "/" + ym.slice(0, 4);

function toast(msg, erro = false) {
  const t = document.createElement("div");
  t.className = "toast" + (erro ? " err" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), erro ? 5000 : 2500);
}
async function tentar(fn, ok) {
  try { await fn(); if (ok) toast(ok); } catch (e) { toast("Erro: " + e.message, true); }
}
const esperarLib = nome => new Promise(res => {
  const t = () => (window[nome] ? res(window[nome]) : setTimeout(t, 50)); t();
});

// ---------------- formulários ----------------
function opts(lista, atual, vazio = true) {
  return (vazio ? `<option value=""></option>` : "") + lista.map(o => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(v)}" ${String(v) === String(atual ?? "") ? "selected" : ""}>${esc(l)}</option>`;
  }).join("");
}
function campo(f, obj) {
  const v = obj[f.k];
  const id = "f_" + f.k;
  let inp;
  if (f.type === "select") inp = `<select id="${id}" name="${f.k}">${opts(typeof f.opts === "function" ? f.opts() : f.opts, v, !f.required)}</select>`;
  else if (f.type === "textarea") inp = `<textarea id="${id}" name="${f.k}">${esc(v)}</textarea>`;
  else if (f.type === "checks") {
    const itens = v || {};
    inp = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px">${f.opts.map(it => `<label style="display:flex;gap:8px;align-items:center;font-weight:500;color:var(--ink);font-size:14px;border:1px solid var(--line);border-radius:10px;padding:8px 10px">
      <input type="checkbox" name="chk" value="${esc(it)}" ${itens[it] !== false ? "checked" : ""} style="width:20px;height:20px">${esc(it)}</label>`).join("")}</div>
      <span class="muted" style="font-size:12px">Desmarque o que estiver com problema.</span>`;
  }
  else inp = `<input id="${id}" name="${f.k}" type="${f.type === "number" ? "text" : (f.type || "text")}" ${f.type === "number" ? 'inputmode="decimal" autocomplete="off"' : ""} value="${esc(f.type === "number" && v !== null && v !== undefined && v !== "" ? String(v).replace(".", ",") : v)}" ${f.list ? `list="dl_${f.k}"` : ""} ${f.required ? "required" : ""}>`
    + (f.list ? `<datalist id="dl_${f.k}">${f.list().map(x => `<option value="${esc(x)}">`).join("")}</datalist>` : "");
  return `<div class="fld ${f.full ? "full" : ""}" data-fk="${f.k}"><label for="${id}">${esc(f.label)}</label>${inp}${f.dica ? `<span class="dica">${esc(f.dica)}</span>` : ""}</div>`;
}
function modal(titulo, campos, obj, onSave, onDel) {
  const m = document.createElement("div");
  m.className = "modal";
  m.innerHTML = `<div class="box" role="dialog" aria-modal="true"><div class="hd"><h2>${esc(titulo)}</h2><button class="x" aria-label="Fechar">×</button></div>
    <form><div class="bd">${campos.map(f => campo(f, obj)).join("")}</div>
    <div class="ft">${onDel ? '<button type="button" class="btn del" data-a="del">Excluir</button><span style="flex:1"></span>' : ""}
    <button type="button" class="btn" data-a="cancel">Cancelar</button><button type="submit" class="btn pri">Salvar</button></div></form></div>`;
  const fechar = () => m.remove();
  m.addEventListener("click", e => { if (e.target === m) fechar(); });
  m.querySelector(".x").onclick = fechar;
  m.querySelector('[data-a="cancel"]').onclick = fechar;
  if (onDel) m.querySelector('[data-a="del"]').onclick = async () => {
    if (!confirm("Excluir este registro? Esta ação não pode ser desfeita.")) return;
    await tentar(onDel, "Excluído"); fechar();
  };
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const out = { ...obj };
    campos.forEach(f => {
      let v = fd.get(f.k);
      if (f.type === "number") v = numBR(v);
      if (f.type === "checks") { const ok = fd.getAll("chk"); v = Object.fromEntries(f.opts.map(it => [it, ok.includes(it)])); }
      out[f.k] = v === "" ? null : v;
    });
    const falta = campos.find(f => f.required && (out[f.k] === null || out[f.k] === undefined));
    if (falta) return toast(`Preencha “${falta.label}” corretamente.`, true);
    await tentar(async () => { await onSave(out); fechar(); }, "Salvo");
  };
  document.body.appendChild(m);
  // campos que só aparecem quando fazem sentido (ex.: "sócio" só em aporte/retirada)
  const form = m.querySelector("form");
  const visiveis = () => {
    const vals = Object.fromEntries(new FormData(form));
    campos.forEach(f => { if (f.show) form.querySelector(`[data-fk="${f.k}"]`).hidden = !f.show(vals); });
  };
  form.addEventListener("change", visiveis); visiveis();
  m.addEventListener("keydown", e => { if (e.key === "Escape") fechar(); });
  m.querySelector("input,select,textarea")?.focus();
  return m;
}

// definições de formulários
const motOpts = () => D().motoristas.map(m => [m.id, m.nome]);
const camOpts = () => D().caminhoes.map(c => [c.id, c.nome + (c.situacao === "vendido" ? " (vendido)" : "")]);
const semOpts = () => [...D().semanas].sort((a, b) => a.inicio.localeCompare(b.inicio)).map(s => [s.id, s.codigo]);
const catOpts = () => [...D().categorias].sort((a, b) => n(a.ordem) - n(b.ordem)).map(c => [c.nome, c.nome + " — " + c.grupo]);
const FORM = {
  fretes: () => [
    { k: "data", label: "Data", type: "date", required: true },
    { k: "motorista_id", label: "Motorista", type: "select", opts: motOpts, required: true },
    { k: "cliente", label: "Cliente / destino", required: true, list: () => [...new Set(D().fretes.map(f => f.cliente))].sort() },
    { k: "cidade", label: "Cidade", list: () => D().tabela_fretes.map(t => t.cidade) },
    { k: "tipo", label: "Tipo", type: "select", opts: C.TIPOS_FRETE, required: true },
    { k: "valor", label: "Valor (R$)", type: "number" },
    { k: "status", label: "Situação", type: "select", required: true, opts: [["agendado", "Agendado"], ["em_rota", "Em rota"], ["entregue", "Entregue"], ...(socio() ? [["fechado", "Fechado (Levíssima)"], ["recebido", "Recebido"]] : [])] },
    ...(socio() ? [{ k: "semana_id", label: "Semana de fechamento (vazio = frete à parte)", type: "select", opts: semOpts },
      { k: "caminhao_id", label: "Caminhão", type: "select", opts: camOpts },
      { k: "origem", label: "Origem" }] : []),
    { k: "obs", label: "Observação", type: "textarea", full: true },
  ],
  despesas: () => [
    { k: "descricao", label: "Descrição", required: true, full: true },
    { k: "categoria", label: "Categoria", type: "select", opts: catOpts, required: true, full: true },
    { k: "valor", label: "Valor (R$)", type: "number", required: true },
    { k: "competencia", label: "Competência (mês do gasto)", type: "date", required: true },
    { k: "vencimento", label: "Vencimento", type: "date" },
    { k: "pagamento", label: "Data de pagamento", type: "date" },
    { k: "status", label: "Situação", type: "select", opts: [["a_pagar", "A pagar"], ["pago", "Pago"]], required: true },
    { k: "forma", label: "Forma de pagamento", type: "select", opts: C.FORMAS },
    { k: "fornecedor", label: "Fornecedor" },
    { k: "caminhao_id", label: "Caminhão", type: "select", opts: camOpts },
    { k: "motorista_id", label: "Motorista", type: "select", opts: motOpts },
    { k: "obs", label: "Observação", type: "textarea", full: true },
  ],
  recebimentos: () => [
    { k: "data", label: "Data", type: "date", required: true },
    { k: "valor", label: "Valor (R$)", type: "number", required: true },
    { k: "descricao", label: "Descrição / pagador", required: true, full: true },
    { k: "tipo", label: "Tipo", type: "select", opts: C.TIPOS_REC, required: true },
    { k: "semana_id", label: "Semana de fechamento", type: "select", opts: semOpts },
    { k: "obs", label: "Observação", type: "textarea", full: true },
  ],
  manutencoes: () => [
    { k: "titulo", label: "Serviço", required: true, full: true },
    { k: "caminhao_id", label: "Caminhão", type: "select", opts: camOpts },
    { k: "oficina", label: "Oficina / fornecedor" },
    { k: "valor", label: "Valor (R$)", type: "number" },
    { k: "data", label: "Data", type: "date", required: true },
    { k: "status", label: "Situação", type: "select", required: true, opts: [["solicitada", "Solicitada"], ["em_oficina", "Em oficina"], ["concluida", "Concluída"], ["paga", "Paga"]] },
    { k: "obs", label: "Observação", type: "textarea", full: true },
  ],
  acertos: () => [
    { k: "motorista_id", label: "Motorista", type: "select", opts: motOpts },
    { k: "motorista_nome", label: "Nome (se ex-motorista)" },
    { k: "competencia", label: "Competência (1º dia do mês)", type: "date", required: true },
    { k: "status", label: "Situação", type: "select", required: true, opts: [["aberto", "Aberto"], ["conferido", "Conferido"], ["pago", "Pago"]] },
    { k: "fixo", label: "Fixo", type: "number" }, { k: "comissao", label: "Comissão", type: "number" },
    { k: "media", label: "Média (bônus semanal)", type: "number" }, { k: "pernoite", label: "Pernoite", type: "number" },
    { k: "extras", label: "Extras", type: "number" }, { k: "vales", label: "Vales / adiantamentos", type: "number" },
    { k: "media_paga", label: "Média já paga", type: "number" }, { k: "pagamento", label: "Data de pagamento", type: "date" },
    { k: "obs", label: "Observação", type: "textarea", full: true },
  ],
  motoristas: () => [
    { k: "nome", label: "Nome", required: true }, { k: "apelido", label: "Apelido" },
    { k: "caminhao_id", label: "Caminhão padrão", type: "select", opts: camOpts }, { k: "admissao", label: "Admissão", type: "date" },
    { k: "fixo", label: "Fixo mensal", type: "number" }, { k: "media_ref", label: "Média semanal (ref.)", type: "number" },
    { k: "ativo", label: "Ativo", type: "select", opts: [["true", "Sim"], ["false", "Não"]], required: true },
    { k: "obs", label: "Observação", type: "textarea", full: true },
  ],
  caminhoes: () => [
    { k: "nome", label: "Identificação", required: true }, { k: "modelo", label: "Modelo" },
    { k: "placa", label: "Placa" }, { k: "ano", label: "Ano", type: "number" },
    { k: "situacao", label: "Situação", type: "select", required: true, opts: [["ativo", "Ativo"], ["parado", "Parado"], ["vendido", "Vendido"]] },
    { k: "km", label: "KM atual", type: "number" }, { k: "meta_km_l", label: "Meta de consumo (km/L)", type: "number" },
    { k: "venc_seguro", label: "Vencimento do seguro", type: "date" }, { k: "venc_licenciamento", label: "Vencimento licenciamento", type: "date" },
    { k: "obs", label: "Observação", type: "textarea", full: true },
  ],
  semanas: () => [
    { k: "codigo", label: "Semana (ex.: 25.09 a 01.10)", required: true, full: true },
    { k: "inicio", label: "Início", type: "date", required: true }, { k: "fim", label: "Fim", type: "date", required: true },
    { k: "status", label: "Situação", type: "select", required: true, opts: [["aberta", "Em aberto"], ["fechada", "Fechada"], ["paga", "Paga"]] },
    { k: "total_oficial", label: "Total oficial (Levíssima)", type: "number" },
    { k: "obs", label: "Observação", type: "textarea", full: true },
  ],
  tabela_fretes: () => [
    { k: "cidade", label: "Cidade", required: true, full: true },
    { k: "valor_16", label: "16 paletes (R$)", type: "number" }, { k: "valor_18", label: "18 paletes (R$)", type: "number" },
  ],
  categorias: () => [
    { k: "nome", label: "Categoria", required: true, full: true },
    { k: "grupo", label: "Grupo da DRE", type: "select", opts: C.GRUPOS, required: true, full: true },
    { k: "ordem", label: "Ordem", type: "number" },
  ],
};
Object.assign(FORM, {
  abastecimentos: () => [
    { k: "data", label: "Data", type: "date", required: true },
    { k: "caminhao_id", label: "Caminhão", type: "select", opts: camOpts, required: true },
    { k: "km", label: "KM do painel (odômetro)", type: "number", required: true },
    { k: "litros", label: "Litros", type: "number", required: true },
    { k: "valor", label: "Valor total (R$)", type: "number" },
    { k: "posto", label: "Posto", list: () => [...new Set((D().abastecimentos || []).map(a => a.posto).filter(Boolean))] },
    ...(socio() ? [{ k: "motorista_id", label: "Motorista", type: "select", opts: motOpts }] : []),
    { k: "tanque_cheio", label: "Completou o tanque?", type: "select", required: true, opts: [["true", "Sim"], ["false", "Não"]] },
    { k: "obs", label: "Observação", type: "textarea", full: true },
  ],
  planos_manutencao: () => [
    { k: "caminhao_id", label: "Caminhão", type: "select", opts: camOpts, required: true },
    { k: "item", label: "Item (ex.: troca de óleo e filtros)", required: true, list: () => ["Troca de óleo e filtros", "Filtro de ar", "Filtro de combustível", "Revisão de freios", "Alinhamento e balanceamento", "Rodízio de pneus", "Tacógrafo (aferição)", "Graxa / lubrificação", "Correias", "Arrefecimento"] },
    { k: "intervalo_km", label: "A cada (km)", type: "number" }, { k: "intervalo_dias", label: "Ou a cada (dias)", type: "number" },
    { k: "ultimo_km", label: "Feito pela última vez no km", type: "number" }, { k: "ultima_data", label: "Última vez em", type: "date" },
    { k: "obs", label: "Observação", type: "textarea", full: true },
  ],
  checklists: () => [
    { k: "data", label: "Data", type: "date", required: true },
    { k: "caminhao_id", label: "Caminhão", type: "select", opts: camOpts, required: true },
    { k: "km", label: "KM do painel", type: "number" },
    ...(socio() ? [{ k: "motorista_id", label: "Motorista", type: "select", opts: motOpts },
      { k: "status", label: "Situação", type: "select", opts: [["ok", "OK"], ["atencao", "Atenção"], ["resolvido", "Resolvido"]] }] : []),
    { k: "itens", label: "Itens verificados", type: "checks", opts: C.CHECK_ITENS, full: true },
    { k: "problemas", label: "Problemas / observações", type: "textarea", full: true },
  ],
});
const TITULO = { abastecimentos: "Abastecimento", planos_manutencao: "Plano de manutenção preventiva", checklists: "Checklist do caminhão", fretes: "Frete", despesas: "Despesa / conta", recebimentos: "Recebimento", manutencoes: "Manutenção", acertos: "Acerto do motorista",
  motoristas: "Motorista", caminhoes: "Caminhão", semanas: "Semana de fechamento", tabela_fretes: "Cidade (tabela de fretes)", categorias: "Categoria" };
const NOVO = {
  fretes: () => ({ data: hoje, status: "agendado", tipo: "Entrega", motorista_id: S.perfil?.motorista_id || "" }),
  despesas: () => ({ competencia: hoje, vencimento: hoje, status: "a_pagar", forma: "PIX" }),
  recebimentos: () => ({ data: hoje, tipo: "PIX" }),
  manutencoes: () => ({ data: hoje, status: "solicitada" }),
  acertos: () => ({ competencia: S.ym + "-01", status: "aberto", fixo: 3500 }),
  motoristas: () => ({ fixo: 3500, media_ref: 200, ativo: "true" }),
  caminhoes: () => ({ situacao: "ativo" }),
  abastecimentos: () => ({ data: hoje, tanque_cheio: "true", motorista_id: S.perfil?.motorista_id || "", caminhao_id: meuCaminhao() }),
  planos_manutencao: () => ({ ultima_data: hoje }),
  checklists: () => ({ data: hoje, itens: {}, caminhao_id: meuCaminhao(), status: "ok" }),
  semanas: () => ({ status: "aberta" }), tabela_fretes: () => ({}), categorias: () => ({ grupo: C.GRUPOS[1], ordem: 99 }),
};
export function editar(tabela, reg) {
  const obj = reg ? { ...reg } : NOVO[tabela]();
  if (tabela === "motoristas" && obj.ativo !== undefined) obj.ativo = String(obj.ativo);
  const podeEditar = socio() || (tabela === "fretes" && (!reg || ["agendado", "em_rota", "entregue"].includes(reg.status))) || (!reg && ["abastecimentos", "checklists"].includes(tabela));
  if (!podeEditar) return toast("Somente sócios podem alterar este registro.", true);
  modal((reg ? "Editar " : "Novo ") + TITULO[tabela].toLowerCase(), FORM[tabela](), obj, async out => {
    if (tabela === "motoristas") out.ativo = out.ativo === "true";
    if (tabela === "abastecimentos") { out.tanque_cheio = out.tanque_cheio !== "false"; if (!socio()) out.motorista_id = S.perfil?.motorista_id;
      const ult = (D().abastecimentos || []).filter(a => a.caminhao_id === out.caminhao_id && a.id !== out.id).sort((a, b) => n(b.km) - n(a.km))[0];
      if (ult && n(out.km) < n(ult.km) && !confirm(`O KM informado (${out.km}) é menor que o último registrado (${ult.km}). Salvar mesmo assim?`)) throw new Error("Confira o KM"); }
    if (tabela === "checklists") { if (!socio()) out.motorista_id = S.perfil?.motorista_id;
      const falhas = Object.entries(out.itens || {}).filter(([, ok]) => !ok).map(([k]) => k);
      if (!socio() || !reg) out.status = falhas.length || out.problemas ? "atencao" : "ok";
      if (falhas.length) out.problemas = ["Com problema: " + falhas.join(", "), out.problemas].filter(Boolean).join(". "); }
    if (tabela === "fretes") {
      if (!socio()) out.motorista_id = S.perfil?.motorista_id;
      if (!out.caminhao_id) out.caminhao_id = D().motoristas.find(m => m.id === out.motorista_id)?.caminhao_id || null;
      // sem semana = frete à parte (fora do fechamento da Levíssima); só preenche automático em frete novo
      if (!out.semana_id && !reg) out.semana_id = D().semanas.find(s => out.data >= s.inicio && out.data <= s.fim)?.id || null;
    }
    if (tabela === "despesas" && out.status === "pago" && !out.pagamento) out.pagamento = hoje;
    await db.salvar(tabela, out);
  }, reg && socio() ? () => db.excluir(tabela, reg.id) : null);
}

// ---------------- layout ----------------
const MENU_SOCIO = [
  ["#sec", "", "Holding"],
  ["holding", "🏛️", "Visão geral"], ["fluxo", "💧", "Fluxo de caixa"], ["conferir", "⚑", "Conferência"], ["empresa", "🏢", "Empresas"], ["contas", "🗂️", "Contas (Kanban)"],
  ["livro", "🧾", "Livro-caixa"], ["socios", "🤝", "Sócios"], ["dividas", "💳", "Dívidas"],
  ["#sec", "", "Gobbo Logística"],
  ["painel", "📊", "Painel"], ["kanban", "🚚", "Kanban"], ["fechamento", "🧮", "Fechamento"], ["lancamentos", "📋", "Lançamentos"],
  ["frota", "🚛", "Frota"], ["relatorios", "📈", "Relatórios"], ["cadastros", "⚙️", "Cadastros"],
];
const BOTTOM_SOCIO = [["holding", "🏛️", "Geral"], ["conferir", "⚑", "Conferir"], ["contas", "🗂️", "Contas"], ["livro", "🧾", "Livro"], ["menu", "☰", "Mais"]];
// itens aguardando o OK dos sócios (perguntas abertas + lançamentos marcados para conferir)
const nConferir = () => (D().pendencias || []).filter(p => p.status !== "ok").length + (D().movimentos || []).filter(m => m.conferir).length;
const MENU_MOT = [["kanban", "🗂️", "Minhas viagens"], ["diario", "✅", "Diário de bordo"], ["acerto", "💰", "Meu acerto"]];
const ROTAS_HOLD = ["holding", "fluxo", "conferir", "empresa", "contas", "livro", "socios", "dividas", "menu"];
function layout(rota, titulo, corpo, acoes = "") {
  const menu = socio() ? MENU_SOCIO : MENU_MOT;
  // sócios veem a marca da holding; motoristas trabalham para a Logística
  const [logo, marca] = socio() ? ["icons/logo.svg", EMPRESA] : ["icons/logo-logistica.png", EMPRESA_LOG];
  root.innerHTML = `<div class="app">
    <aside class="side"><div class="brand"><img src="${logo}" alt="${esc(marca)}"></div>
      <nav>${menu.map(([r, i, l]) => r === "#sec" ? `<div class="sec">${l === EMPRESA_LOG ? `<img src="icons/logo-logistica.png" alt="" class="sec-logo">` : ""}${l}</div>` : `<a href="#${r}" class="${r === rota ? "on" : ""}"><span>${i}</span>${l}${r === "conferir" && nConferir() ? ` <b class="badge">${nConferir()}</b>` : ""}</a>`).join("")}</nav>
      <div class="user">${esc(S.perfil?.nome || "Demonstração")}<br><span class="muted">${db.getModo() === "demo" ? "modo demonstração" : esc(S.perfil?.papel || "")}</span><br>
      <button id="sair">${db.getModo() === "demo" ? "Sair da demonstração" : "Sair"}</button></div></aside>
    <main><div class="mobile-top"><img src="${logo}" alt="${esc(marca)}"><button class="btn sm" id="sair2">Sair</button></div>
      <div class="topbar"><h1>${esc(titulo)}</h1>${db.getModo() === "demo" ? '<span class="demo-flag">DEMONSTRAÇÃO</span>' : ""}${socio() ? `<button class="btn" id="bBusca" title="Buscar (Ctrl+K)">🔍 <span class="so-desk">Buscar <kbd>Ctrl K</kbd></span></button>` : ""}${acoes}</div>
      ${corpo}</main>
    ${socio() && ROTAS_HOLD.includes(rota) ? `<button class="fab" id="bFab" aria-label="Novo lançamento" title="Novo lançamento">+</button>` : ""}
    <nav class="bottom">${(socio() ? BOTTOM_SOCIO : menu).map(([r, i, l]) => `<a href="#${r}" class="${r === rota ? "on" : ""}"><span class="i">${i}${r === "conferir" && nConferir() ? `<b class="badge">${nConferir()}</b>` : ""}</span>${l.split(" ")[0]}</a>`).join("")}</nav>
  </div>`;
  const out = async () => {
    if (db.getModo() === "demo") { try { localStorage.removeItem("gobbo_modo"); } catch { /* */ } }
    await db.sair(); location.hash = ""; location.reload();
  };
  document.getElementById("sair").onclick = out;
  document.getElementById("sair2").onclick = out;
  const bb = document.getElementById("bBusca"); if (bb) bb.onclick = abrirBusca;
  const fab = document.getElementById("bFab"); if (fab) fab.onclick = () => editarMov(null, rota === "empresa" ? { empresa_id: S.emp } : {});
}
const seletorMes = () => `<input type="month" class="inp" id="ym" value="${S.ym}" aria-label="Mês">`;
function ligarMes() {
  const el = document.getElementById("ym");
  if (el) el.onchange = () => { if (el.value) { S.ym = el.value; render(); } };
}
const kpi = (t, v, s = "", cls = "") => `<div class="kpi ${cls}"><div class="t">${t}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
function limparCharts() { while (charts.length) charts.pop().destroy(); }
async function grafico(id, cfg) {
  const Chart = await esperarLib("Chart");
  const el = document.getElementById(id);
  if (!el) return;
  Chart.defaults.font.family = getComputedStyle(document.documentElement).fontFamily;
  charts.push(new Chart(el, { ...cfg, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top" } }, ...cfg.options } }));
}
const eixoBRL = { ticks: { callback: v => "R$ " + Number(v).toLocaleString("pt-BR", { notation: "compact" }) } };

// ---------------- PAINEL ----------------
function viewPainel() {
  const d = D(), r = C.resumoMes(d, S.ym);
  const pm = C.porMotorista(d, S.ym), pc = C.porCaminhao(d, S.ym).filter(x => x.c.situacao !== "vendido" || x.fat || x.custo);
  const corpo = `
  <div class="kpis">
    ${kpi("Faturamento", brl(r.fat), r.nFretes + " fretes")}
    ${kpi("Despesas operacionais", brl(r.custo), "+ " + brl(r.socios) + " com sócios", "red")}
    ${kpi("Lucro", `<span class="${r.lucro < 0 ? "neg" : ""}">${brl(r.lucro)}</span>`, "margem " + pct(r.margem), "green")}
    ${kpi("Caixa do mês", `<span class="${r.entradas - r.saidas < 0 ? "neg" : ""}">${brl(r.entradas - r.saidas)}</span>`, "entradas " + brl0(r.entradas) + " · saídas " + brl0(r.saidas), "gd")}
    ${kpi("A receber", brl(r.aReceber), "saldo dos fechamentos", "orange")}
    ${kpi("A pagar", brl(r.aPagar), `<span class="${r.vencidas ? "neg" : ""}">${brl(r.vencidas)} vencidas</span> · ${brl0(r.prox7)} em 7 dias`, "navy")}
  </div>
  ${blocoAlertas(6)}
  ${blocoFrotaResumo(S.ym)}
  <div class="grid g2">
    <div class="card"><h3>Faturamento × despesas acumulados</h3><div class="chart-box"><canvas id="cAcum"></canvas></div></div>
    <div class="card"><h3>Despesas por grupo</h3><div class="chart-box"><canvas id="cGrupo"></canvas></div></div>
    <div class="card"><h3>Resultado por motorista</h3><div class="tbl-wrap"><table><tr><th>Motorista</th><th class="num">Fretes</th><th class="num">Dias</th><th class="num">Faturamento</th><th class="num">Custos diretos</th><th class="num">Resultado</th></tr>
      ${pm.map(x => `<tr><td><b>${esc(x.m.nome)}</b></td><td class="num">${x.n}</td><td class="num">${x.dias}</td><td class="num">${brl(x.fat)}</td><td class="num">${brl(x.custo)}</td><td class="num ${x.res < 0 ? "neg" : "pos"}"><b>${brl(x.res)}</b></td></tr>`).join("")}</table></div>
      <p class="muted" style="font-size:12px">Custos diretos = despesas lançadas com o nome do motorista.</p></div>
    <div class="card"><h3>Resultado por caminhão</h3><div class="tbl-wrap"><table><tr><th>Caminhão</th><th class="num">Faturamento</th><th class="num">Custos</th><th class="num">Resultado</th><th class="num">Margem</th></tr>
      ${pc.map(x => `<tr><td><b>${esc(x.c.nome)}</b></td><td class="num">${brl(x.fat)}</td><td class="num">${brl(x.custo)}</td><td class="num ${x.res < 0 ? "neg" : "pos"}"><b>${brl(x.res)}</b></td><td class="num">${pct(x.margem)}</td></tr>`).join("")}</table></div>
      <p class="muted" style="font-size:12px">Combustível, pedágio e parcelas sem caminhão definido ficam só no total da empresa.</p></div>
  </div>`;
  layout("painel", "Painel – " + mesLabel(S.ym), corpo, seletorMes());
  ligarMes();
  const ac = C.acumuladoDiario(d, S.ym);
  grafico("cAcum", { type: "line", data: { labels: ac.map(x => x.dia), datasets: [
    { label: "Faturamento", data: ac.map(x => x.fat), borderColor: "#1565c0", backgroundColor: "#1565c0", tension: .25, pointRadius: 0, borderWidth: 3 },
    { label: "Despesas operacionais", data: ac.map(x => x.desp), borderColor: "#c62828", backgroundColor: "#c62828", tension: .25, pointRadius: 0, borderWidth: 2 }] },
  options: { scales: { y: eixoBRL } } });
  const g = r.porGrupo.filter(x => x.valor);
  grafico("cGrupo", { type: "bar", data: { labels: g.map(x => x.grupo), datasets: [{ label: "Valor", data: g.map(x => x.valor),
    backgroundColor: g.map(x => x.grupo === C.GRUPO_SOCIOS ? "#90a4ae" : "#2e9e4f"), borderRadius: 6 }] },
  options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: eixoBRL } } });
}

// ---------------- KANBAN ----------------
const BOARDS = {
  fretes: { titulo: "Fretes", tabela: "fretes", cols: [["agendado", "Agendado"], ["em_rota", "Em rota"], ["entregue", "Entregue"], ["fechado", "Fechado (Levíssima)"], ["recebido", "Recebido"]] },
  contas: { titulo: "Contas a pagar", tabela: "despesas", cols: [["a_vencer", "A vencer"], ["prox7", "Vence em 7 dias"], ["vencida", "Vencida"], ["paga", "Paga (no mês)"]] },
  manutencao: { titulo: "Manutenção da frota", tabela: "manutencoes", cols: [["solicitada", "Solicitada"], ["em_oficina", "Em oficina"], ["concluida", "Concluída"], ["paga", "Paga"]] },
  acertos: { titulo: "Acertos dos motoristas", tabela: "acertos", cols: [["aberto", "Aberto"], ["conferido", "Conferido"], ["pago", "Pago"]] },
};
function itensBoard(k) {
  const d = D();
  if (k === "fretes") return d.fretes.filter(f => C.noMes(f.data, S.ym) || ["agendado", "em_rota"].includes(f.status))
    .filter(f => socio() ? (!S.fMot || f.motorista_id === S.fMot) : f.motorista_id === S.perfil?.motorista_id)
    .sort((a, b) => a.data.localeCompare(b.data)).map(f => ({ id: f.id, col: f.status, valor: n(f.valor), reg: f,
      cls: nomeMot(f.motorista_id) === "Silvestre" ? "silvestre" : "sergio",
      l1: f.cliente, l2: [dataBR(f.data), nomeMot(f.motorista_id), f.cidade, f.tipo !== "Entrega" ? f.tipo : ""] }));
  if (k === "contas") return d.despesas.filter(x => x.status !== "pago" || C.noMes(x.pagamento || x.competencia, S.ym))
    .sort((a, b) => (a.vencimento || "9").localeCompare(b.vencimento || "9")).map(x => {
      const col = C.colunaConta(x);
      return { id: x.id, col, valor: n(x.valor), reg: x, cls: col === "vencida" ? "venc" : col === "prox7" ? "p7" : col === "paga" ? "ok" : "",
        l1: x.descricao, l2: [x.vencimento ? "vence " + dataBR(x.vencimento) : "sem vencimento", x.categoria, x.forma === "Pago por sócio" ? "pago por sócio" : ""] };
    });
  if (k === "manutencao") return d.manutencoes.slice().sort((a, b) => (b.data || "").localeCompare(a.data || "")).map(x => ({ id: x.id, col: x.status, valor: n(x.valor), reg: x,
    cls: x.status === "paga" ? "ok" : "", l1: x.titulo, l2: [dataBR(x.data), nomeCam(x.caminhao_id) || "Frota", x.oficina] }));
  if (k === "acertos") return d.acertos.slice().sort((a, b) => b.competencia.localeCompare(a.competencia)).map(x => {
    const c = C.acertoCalc(x);
    return { id: x.id, col: x.status, valor: c.saldo, reg: x, cls: x.status === "pago" ? "ok" : "",
      l1: (nomeMot(x.motorista_id) || x.motorista_nome) + " – " + mesLabel(x.competencia.slice(0, 7)),
      l2: ["total " + brl(c.total), x.comissao === null || x.comissao === undefined ? '<span class="pill o">comissão pendente</span>' : "comissão " + brl(x.comissao)], html: true };
  });
  return [];
}
function viewKanban() {
  if (!socio()) S.kanban = "fretes";
  const b = BOARDS[S.kanban];
  const itens = itensBoard(S.kanban);
  const abas = socio() ? `<div class="tabs">${Object.entries(BOARDS).map(([k, v]) => `<button data-k="${k}" class="${k === S.kanban ? "on" : ""}">${v.titulo}</button>`).join("")}</div>` : "";
  const corpo = `${abas}<div class="board">${b.cols.map(([ck, cl]) => {
    const its = itens.filter(i => i.col === ck);
    return `<div class="col" data-k="${ck}"><div class="col-h"><span>${cl} <span class="muted">(${its.length})</span></span><span class="sum">${brl0(soma(its, i => i.valor))}</span></div>
      <div class="list" data-col="${ck}">${its.map(i => `<div class="kc ${i.cls}" data-id="${i.id}"><div class="l1"><span>${esc(i.l1)}</span><span class="v">${brl(i.valor)}</span></div>
      <div class="l2">${i.l2.filter(Boolean).map(t => (i.html && String(t).startsWith("<") ? t : esc(t))).join(" · ")}</div></div>`).join("")}</div></div>`;
  }).join("")}</div>
  <p class="muted" style="font-size:12px;margin-top:10px">Arraste os cartões entre as colunas (no celular: toque, segure e arraste). Toque no cartão para ver/editar.
  ${S.kanban === "fretes" ? "Mostra os fretes do mês escolhido e os agendados/em rota." : S.kanban === "contas" ? "Ao soltar em “Paga”, a conta é baixada com a data de hoje." : ""}</p>`;
  const tabelaNovo = b.tabela;
  layout("kanban", socio() ? "Kanban – " + b.titulo : "Minhas viagens", corpo,
    (S.kanban === "fretes" && socio() ? `<select class="sel" id="fMot" aria-label="Motorista"><option value="">Todos os motoristas</option>${opts(motOpts(), S.fMot, false)}</select>` : "")
    + (S.kanban === "fretes" || S.kanban === "contas" ? seletorMes() : "") + `<button class="btn pri" id="novo">+ Novo</button>`);
  const fm = document.getElementById("fMot"); if (fm) fm.onchange = () => { S.fMot = fm.value; render(); };
  ligarMes();
  document.querySelectorAll(".tabs button").forEach(bt => bt.onclick = () => { S.kanban = bt.dataset.k; render(); });
  document.getElementById("novo").onclick = () => editar(tabelaNovo);
  document.querySelectorAll(".kc").forEach(el => el.addEventListener("click", () => {
    const it = itens.find(i => i.id === el.dataset.id); if (it) editar(tabelaNovo, it.reg);
  }));
  esperarLib("Sortable").then(Sortable => {
    document.querySelectorAll(".list").forEach(list => Sortable.create(list, {
      group: "kb-" + S.kanban, animation: 150, delay: 180, delayOnTouchOnly: true, ghostClass: "sortable-ghost", chosenClass: "sortable-chosen",
      onEnd: ev => { if (ev.from !== ev.to) moverCartao(S.kanban, ev.item.dataset.id, ev.to.dataset.col); },
    }));
  });
}
async function moverCartao(k, id, col) {
  const tab = BOARDS[k].tabela;
  await tentar(async () => {
    if (k === "contas") {
      if (col === "paga") await db.atualizar(tab, id, { status: "pago", pagamento: hoje });
      else await db.atualizar(tab, id, { status: "a_pagar", pagamento: null });
    } else if (k === "acertos" && col === "pago") {
      await db.atualizar(tab, id, { status: col, pagamento: D().acertos.find(a => a.id === id)?.pagamento || hoje });
    } else {
      if (k === "fretes" && !socio() && !["agendado", "em_rota", "entregue"].includes(col)) throw new Error("Somente sócios movem para Fechado/Recebido.");
      await db.atualizar(tab, id, { status: col });
    }
  }, "Atualizado");
  render();
}

// ---------------- LANÇAMENTOS ----------------
const LANC = {
  fretes: { t: "Fretes", cols: ["Data", "Motorista", "Cliente", "Cidade", "Tipo", "Semana", "Situação", "Valor"],
    rows: () => D().fretes.filter(f => C.noMes(f.data, S.ym)).sort((a, b) => a.data.localeCompare(b.data)),
    cells: f => [dataBR(f.data), nomeMot(f.motorista_id), f.cliente, f.cidade, f.tipo, codSem(f.semana_id), f.status.replace("_", " "), brl(f.valor)], val: f => f.valor },
  despesas: { t: "Despesas", cols: ["Competência", "Descrição", "Categoria", "Caminhão", "Forma", "Venc.", "Situação", "Valor"],
    rows: () => D().despesas.filter(x => C.noMes(x.competencia, S.ym)).sort((a, b) => a.competencia.localeCompare(b.competencia)),
    cells: x => [dataBR(x.competencia), x.descricao, x.categoria, nomeCam(x.caminhao_id), x.forma, dataBR(x.vencimento), x.status === "pago" ? "pago" : "a pagar", brl(x.valor)], val: x => x.valor },
  recebimentos: { t: "Recebimentos", cols: ["Data", "Descrição", "Tipo", "Semana", "No caixa?", "Valor"],
    rows: () => D().recebimentos.filter(x => C.noMes(x.data, S.ym)).sort((a, b) => a.data.localeCompare(b.data)),
    cells: x => [dataBR(x.data), x.descricao, x.tipo, codSem(x.semana_id), C.FORA_DO_CAIXA_REC.includes(x.tipo) ? "não" : "sim", brl(x.valor)], val: x => x.valor },
};
function viewLanc() {
  const L = LANC[S.lanc];
  const q = S.busca.toLowerCase();
  const rows = L.rows().filter(r => !q || L.cells(r).join(" ").toLowerCase().includes(q));
  const corpo = `<div class="tabs">${Object.entries(LANC).map(([k, v]) => `<button data-k="${k}" class="${k === S.lanc ? "on" : ""}">${v.t}</button>`).join("")}</div>
  <div class="filters"><input class="inp" id="busca" placeholder="Buscar…" value="${esc(S.busca)}" style="flex:1;min-width:160px"></div>
  <div class="card"><div class="tbl-wrap"><table><tr>${L.cols.map((c, i) => `<th class="${i === L.cols.length - 1 ? "num" : ""}">${c}</th>`).join("")}</tr>
  ${rows.map(r => `<tr class="clk" data-id="${r.id}">${L.cells(r).map((c, i, a) => `<td class="${i === a.length - 1 ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${L.cols.length}" class="empty">Nada lançado neste mês.</td></tr>`}
  <tr class="tot"><td colspan="${L.cols.length - 1}">${rows.length} lançamentos</td><td class="num">${brl(soma(rows, L.val))}</td></tr></table></div></div>`;
  layout("lancamentos", "Lançamentos – " + mesLabel(S.ym), corpo, seletorMes() + `<button class="btn" id="csv" title="Planilha para o contador">⬇ Exportar</button><button class="btn pri" id="novo">+ Novo</button>`);
  document.getElementById("csv").onclick = () => {
    const blob = new Blob([C.csv([L.cols, ...rows.map(r => L.cells(r).map((c, i, a) => (i === a.length - 1 ? n(L.val(r)).toFixed(2).replace(".", ",") : c)))])], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `gobbo-${S.lanc}-${S.ym}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  ligarMes();
  document.querySelectorAll(".tabs button").forEach(bt => bt.onclick = () => { S.lanc = bt.dataset.k; S.busca = ""; render(); });
  const bi = document.getElementById("busca");
  bi.oninput = () => { S.busca = bi.value; const pos = bi.selectionStart; render(); const nb = document.getElementById("busca"); nb.focus(); nb.setSelectionRange(pos, pos); };
  document.getElementById("novo").onclick = () => editar(S.lanc);
  document.querySelectorAll("tr.clk").forEach(tr => tr.onclick = () => editar(S.lanc, D()[S.lanc].find(x => x.id === tr.dataset.id)));
}

// ---------------- FECHAMENTO SEMANAL (sexta a quinta) ----------------
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const diaSem = iso => DIAS[new Date(iso + "T12:00:00").getDay()];
const fretesDaSemana = (d, s) => d.fretes.filter(f => f.semana_id === s.id)
  .sort((a, b) => a.data.localeCompare(b.data) || nomeMot(a.motorista_id).localeCompare(nomeMot(b.motorista_id)));
const pendente = f => f.cidade === "A CONFIRMAR" || !n(f.valor) || /conferir/i.test(f.obs || "") || ["agendado", "em_rota"].includes(f.status);
const descFrete = f => f.tipo === "Retorno ATB" ? "Atibaia (retorno)" : [f.cliente, f.cidade && f.cidade !== "A CONFIRMAR" ? f.cidade : ""].filter(Boolean).join(" – ");

function textoFechamento(d, s) {
  const fr = fretesDaSemana(d, s), i = C.semanaInfo(d, s);
  const mots = [...new Set(fr.map(f => f.motorista_id))];
  const linhas = [`*Fechamento Gobbo Logística – semana ${s.codigo}*`, ""];
  mots.forEach(m => {
    const fm = fr.filter(f => f.motorista_id === m);
    linhas.push(`*${nomeMot(m) || "Sem motorista"}*`);
    fm.forEach(f => linhas.push(`${dataBR(f.data).slice(0, 5)} ${descFrete(f)} – ${brl(f.valor)}`));
    linhas.push(`Subtotal: ${brl(soma(fm, f => f.valor))}`, "");
  });
  linhas.push(`*Total: ${brl(i.faturado)}* (${fr.length} viagens)`);
  d.recebimentos.filter(r => r.semana_id === s.id).forEach(r => linhas.push(`(−) ${r.descricao}: ${brl(r.valor)}`));
  if (i.recebido) linhas.push(`*A receber: ${brl(i.saldo)}*`);
  return linhas.join("\n");
}

function viewFechamento() {
  const d = D();
  const sem = [...d.semanas].sort((a, b) => a.inicio.localeCompare(b.inicio));
  if (!sem.length) { layout("fechamento", "Fechamento semanal", `<div class="card empty">Cadastre as semanas em Relatórios › Fechamentos.</div>`); return; }
  if (!sem.some(s => s.id === S.sem)) S.sem = (sem.find(s => hoje >= s.inicio && hoje <= s.fim) || sem.filter(s => s.inicio <= hoje).pop() || sem[0]).id;
  const ix = sem.findIndex(s => s.id === S.sem), s = sem[ix], ant = sem[ix - 1];
  const fr = fretesDaSemana(d, s), i = C.semanaInfo(d, s);
  const iAnt = ant ? C.semanaInfo(d, ant) : null;
  const rec = d.recebimentos.filter(r => r.semana_id === s.id);
  const pend = fr.filter(pendente);
  const aParte = d.fretes.filter(f => !f.semana_id && f.data >= s.inicio && f.data <= s.fim);
  const mots = [...new Set([...d.motoristas.filter(m => m.ativo !== false).map(m => m.id), ...fr.map(f => f.motorista_id)])];

  // dias da semana (sexta → quinta) + datas de fretes lançados nesta semana fora da faixa
  const dias = [];
  for (let x = s.inicio; x <= s.fim; x = C.addDias(x, 1)) dias.push(x);
  fr.forEach(f => { if (!dias.includes(f.data)) dias.push(f.data); });
  dias.sort();
  const semLista = dias.filter(x => x >= s.inicio && x <= s.fim && x < hoje && diaSem(x) !== "Dom" && !fr.some(f => f.data === x));

  const cel = f => `<div class="fx clk" data-id="${f.id}"><span>${esc(descFrete(f))}${pendente(f) ? ' <span class="pill o">conferir</span>' : ""}</span><b>${brl0(f.valor)}</b></div>`;
  const grade = `<div class="tbl-wrap"><table class="fech"><tr><th>Dia</th>${mots.map(m => `<th>${esc(nomeMot(m) || "Sem motorista")}</th>`).join("")}<th class="num">Total do dia</th></tr>
    ${dias.map(x => { const fd = fr.filter(f => f.data === x); const fora = x < s.inicio || x > s.fim;
      return `<tr><td><b>${diaSem(x)} ${dataBR(x).slice(0, 5)}</b>${fora ? '<div class="pill o">fora da semana</div>' : ""}</td>
        ${mots.map(m => `<td>${fd.filter(f => f.motorista_id === m).map(cel).join("") || '<span class="muted">–</span>'}</td>`).join("")}
        <td class="num">${fd.length ? brl(soma(fd, f => f.valor)) : "–"}</td></tr>`; }).join("")}
    <tr class="tot"><td>Total</td>${mots.map(m => `<td class="num">${brl(soma(fr.filter(f => f.motorista_id === m), f => f.valor))}</td>`).join("")}<td class="num">${brl(i.faturado)}</td></tr></table></div>`;

  const dif = iAnt && iAnt.faturado ? i.faturado / iAnt.faturado - 1 : null;
  const comp = sem.slice(Math.max(0, ix - 3), ix + 1).reverse().map(x => { const k = C.semanaInfo(d, x); const nf = fretesDaSemana(d, x).length;
    const of = x.total_oficial !== null && x.total_oficial !== undefined && x.total_oficial !== "" ? n(x.total_oficial) : null;
    return `<tr class="${x.id === s.id ? "grp" : ""}"><td><b>${esc(x.codigo)}</b></td><td><span class="pill ${x.status === "aberta" ? "o" : x.status === "paga" ? "g" : ""}">${x.status}</span></td>
      <td class="num">${nf}</td><td class="num">${brl(k.faturado)}</td><td class="num">${of === null ? "–" : brl(of)}</td>
      <td class="num ${of !== null && Math.abs(k.faturado - of) > 0.009 ? "neg" : ""}">${of === null ? "–" : brl(k.faturado - of)}</td>
      <td class="num">${brl(k.recebido)}</td><td class="num ${k.saldo > 0.009 ? "neg" : "pos"}">${brl(k.saldo)}</td></tr>`; }).join("");

  const corpo = `<div class="kpis">
      ${kpi("Faturado na semana", brl(i.faturado), `${fr.length} viagens · ${dataBR(s.inicio).slice(0, 5)} (sex) a ${dataBR(s.fim).slice(0, 5)} (qui)`, "navy")}
      ${kpi("Oficial Levíssima", s.total_oficial ? brl(s.total_oficial) : "aguardando", s.total_oficial ? (Math.abs(i.faturado - n(s.total_oficial)) < 0.01 ? "bate com o faturado" : `<span class="neg">diferença ${brl(i.faturado - n(s.total_oficial))}</span>`) : "planilha da Levíssima", "orange")}
      ${kpi("Recebido / créditos", brl(i.recebido), `${rec.length} lançamento(s)`, "green")}
      ${kpi("Saldo a receber", brl(i.saldo), s.status === "aberta" ? "semana aberta" : s.status, i.saldo > 0.009 ? "red" : "gd")}
      ${kpi("Semana anterior", iAnt ? brl(iAnt.faturado) : "–", dif === null ? "" : `<span class="${dif < 0 ? "neg" : "pos"}">${dif >= 0 ? "+" : ""}${pct(dif)}</span> nesta semana`, "")}
      ${kpi("Pendências", String(pend.length + semLista.length), pend.length + semLista.length ? "ver lista abaixo" : "tudo conferido", pend.length + semLista.length ? "red" : "green")}
    </div>
    <div class="card" style="margin-bottom:16px"><h3>Viagens por dia e motorista</h3>${grade}
      <p class="muted" style="font-size:12px;margin-bottom:0">Semana de fechamento: sexta a quinta (a Levíssima paga na quinta). Toque numa viagem para editar.</p></div>
    <div class="grid g2" style="margin-bottom:16px">
      <div class="card"><h3>Para conferir</h3>${pend.length || semLista.length ? `<div style="display:flex;flex-direction:column;gap:6px">
        ${pend.map(f => `<div class="fx clk" data-id="${f.id}"><span>${dataBR(f.data).slice(0, 5)} · ${esc(nomeMot(f.motorista_id))} · ${esc(descFrete(f))}<br><span class="muted" style="font-size:12px">${esc([f.status === "em_rota" ? "em rota" : f.status === "agendado" ? "agendado" : "", f.cidade === "A CONFIRMAR" ? "cidade a confirmar" : "", f.obs].filter(Boolean).join(" · "))}</span></span><b>${brl0(f.valor)}</b></div>`).join("")}
        ${semLista.map(x => `<div class="muted">${diaSem(x)} ${dataBR(x).slice(0, 5)} – nenhuma viagem lançada</div>`).join("")}</div>` : '<p class="muted" style="margin:0">Nada pendente nesta semana.</p>'}</div>
      <div class="card"><h3>Recebimentos e créditos da semana</h3>${rec.length ? `<table>${rec.map(r => `<tr><td>${dataBR(r.data).slice(0, 5)}</td><td>${esc(r.descricao)}<div class="muted" style="font-size:12px">${esc(r.tipo)}</div></td><td class="num">${brl(r.valor)}</td></tr>`).join("")}
        <tr class="tot"><td colspan="2">Total</td><td class="num">${brl(i.recebido)}</td></tr></table>` : '<p class="muted" style="margin:0">Nenhum recebimento lançado ainda.</p>'}</div>
    </div>
    ${aParte.length ? `<div class="card" style="margin-bottom:16px"><h3>Fretes à parte (fora do fechamento da Levíssima)</h3>
      ${aParte.map(f => `<div class="fx clk" data-id="${f.id}"><span>${dataBR(f.data).slice(0, 5)} · ${esc(nomeMot(f.motorista_id))} · ${esc(descFrete(f))}<br><span class="muted" style="font-size:12px">${esc(f.obs || "")}</span></span><b>${brl0(f.valor)}</b></div>`).join("")}
      <p class="muted" style="font-size:12px;margin-bottom:0">Contam no faturamento do mês, mas não entram no valor cobrado da Levíssima.</p></div>` : ""}
    <div class="card"><h3>Comparação com as semanas anteriores</h3><div class="tbl-wrap"><table><tr><th>Semana</th><th>Situação</th><th class="num">Viagens</th><th class="num">Faturado</th><th class="num">Oficial</th><th class="num">Diferença</th><th class="num">Recebido</th><th class="num">Saldo</th></tr>${comp}</table></div></div>`;

  const acoes = `<button class="btn sm" id="semAnt" ${ix ? "" : "disabled"} aria-label="Semana anterior">◀</button>
    <select class="sel" id="semSel">${opts(sem.map(x => [x.id, x.codigo]), s.id, false)}</select>
    <button class="btn sm" id="semProx" ${ix < sem.length - 1 ? "" : "disabled"} aria-label="Próxima semana">▶</button>
    <button class="btn pri" id="copiar">Copiar resumo</button>`;
  layout("fechamento", "Fechamento semanal", corpo, acoes);
  const ir = id => { S.sem = id; render(); };
  document.getElementById("semSel").onchange = e => ir(e.target.value);
  document.getElementById("semAnt").onclick = () => ix && ir(sem[ix - 1].id);
  document.getElementById("semProx").onclick = () => ix < sem.length - 1 && ir(sem[ix + 1].id);
  document.getElementById("copiar").onclick = () => tentar(() => navigator.clipboard.writeText(textoFechamento(d, s)), "Resumo copiado – é só colar no WhatsApp");
  document.querySelectorAll(".fx.clk").forEach(el => el.onclick = () => editar("fretes", D().fretes.find(f => f.id === el.dataset.id)));
}

// ---------------- RELATÓRIOS ----------------
function viewRel() {
  const d = D();
  const abas = [["dre", "DRE"], ["caixa", "Fluxo de caixa"], ["anual", "Resumo anual"], ["fechamentos", "Fechamentos"], ["folha", "Folha do mês"]];
  let corpo = `<div class="tabs">${abas.map(([k, l]) => `<button data-k="${k}" class="${k === S.rel ? "on" : ""}">${l}</button>`).join("")}</div>`;
  let acoes = `<select class="sel" id="ano">${[S.ano - 1, S.ano, S.ano + 1].map(a => `<option ${a === S.ano ? "selected" : ""}>${a}</option>`).join("")}</select>`;
  const cab = `<tr><th>Conta</th>${C.MES_AB.map(m => `<th class="num">${m}</th>`).join("")}<th class="num">Total</th></tr>`;
  const linha = (nome, v, cls = "") => `<tr class="${cls}"><td>${esc(nome)}</td>${v.map(x => `<td class="num ${x < 0 ? "neg" : ""}">${x ? brl0(x) : "–"}</td>`).join("")}<td class="num ${soma(v) < 0 ? "neg" : ""}"><b>${brl0(soma(v))}</b></td></tr>`;
  if (S.rel === "dre") {
    const L = C.dre(d, S.ano);
    corpo += `<div class="card"><div class="tbl-wrap"><table>${cab}${L.map(l => linha(l.nome, l.v, l.tipo === "total" ? "tot" : l.tipo === "grupo" ? "grp" : l.tipo === "resultado" ? "res" : "")).join("")}</table></div>
      <p class="muted" style="font-size:12px">Regime de competência. Movimentação com sócios (retiradas, devoluções de aporte) fica fora do lucro.</p></div>`;
  } else if (S.rel === "caixa") {
    const A = C.resumoAno(d, S.ano);
    let saldo = n(d.config[0]?.saldo_inicial);
    const ini = [], fim = [];
    A.forEach(m => { ini.push(saldo); saldo += m.entradas - m.saidas; fim.push(saldo); });
    corpo += `<div class="card"><div class="tbl-wrap"><table>${cab}${linha("Saldo inicial", ini, "grp")}${linha("(+) Entradas", A.map(m => m.entradas))}
      ${linha("(−) Saídas", A.map(m => -m.saidas))}${linha("(=) Saldo do mês", A.map(m => m.entradas - m.saidas), "res")}${linha("(=) Saldo final", fim, "tot")}</table></div>
      <p class="muted" style="font-size:12px">Regime de caixa: aportes e recebimentos que entram na conta; despesas pagas pela empresa (não conta “Pago por sócio” nem “Abatimento”).</p></div>
      <div class="card" style="margin-top:16px"><h3>Saldo de caixa por mês</h3><div class="chart-box"><canvas id="cCaixa"></canvas></div></div>`;
    setTimeout(() => grafico("cCaixa", { type: "line", data: { labels: C.MES_AB, datasets: [{ label: "Saldo final", data: fim, borderColor: "#1565c0", backgroundColor: "#1565c0", tension: .25, borderWidth: 3 }] }, options: { scales: { y: eixoBRL } } }));
  } else if (S.rel === "anual") {
    const A = C.resumoAno(d, S.ano);
    corpo += `<div class="card"><div class="tbl-wrap"><table>${cab}${linha("Faturamento", A.map(m => m.fat), "grp")}${linha("Despesas operacionais", A.map(m => m.custo))}
      ${linha("Lucro", A.map(m => m.lucro), "res")}${d.motoristas.map(mo => linha("  Faturamento – " + mo.nome, C.MESES.map((_, i) => soma(d.fretes.filter(f => f.motorista_id === mo.id && C.noMes(f.data, `${S.ano}-${String(i + 1).padStart(2, "0")}`)), f => f.valor)))).join("")}</table></div></div>
      <div class="card" style="margin-top:16px"><h3>Faturamento, despesas e lucro</h3><div class="chart-box"><canvas id="cAno"></canvas></div></div>`;
    setTimeout(() => grafico("cAno", { type: "bar", data: { labels: C.MES_AB, datasets: [
      { label: "Faturamento", data: A.map(m => m.fat), backgroundColor: "#1565c0", borderRadius: 4 },
      { label: "Despesas operacionais", data: A.map(m => m.custo), backgroundColor: "#ef9a9a", borderRadius: 4 },
      { label: "Lucro", data: A.map(m => m.lucro), type: "line", borderColor: "#2e9e4f", backgroundColor: "#2e9e4f", borderWidth: 3, tension: .25 }] }, options: { scales: { y: eixoBRL } } }));
  } else if (S.rel === "fechamentos") {
    acoes = `<button class="btn pri" id="novaSem">+ Semana</button>`;
    const sem = [...d.semanas].sort((a, b) => a.inicio.localeCompare(b.inicio));
    corpo += `<div class="card"><div class="tbl-wrap"><table><tr><th>Semana</th><th>Situação</th><th class="num">Faturado</th><th class="num">Oficial</th><th class="num">Recebido</th><th class="num">Saldo a receber</th></tr>
      ${sem.map(s => { const i = C.semanaInfo(d, s); return `<tr class="clk" data-id="${s.id}"><td><b>${esc(s.codigo)}</b><div class="muted" style="font-size:12px">${esc(s.obs || "")}</div></td>
        <td><span class="pill ${s.status === "aberta" ? "o" : s.status === "paga" ? "g" : ""}">${s.status}</span></td><td class="num">${brl(i.faturado)}</td><td class="num">${s.total_oficial ? brl(s.total_oficial) : "–"}</td>
        <td class="num">${brl(i.recebido)}</td><td class="num ${i.saldo > 0.009 ? "neg" : "pos"}"><b>${brl(i.saldo)}</b></td></tr>`; }).join("")}
      <tr class="tot"><td colspan="5">Total a receber</td><td class="num">${brl(C.aReceberTotal(d))}</td></tr></table></div></div>`;
  } else if (S.rel === "folha") {
    acoes = seletorMes();
    corpo += viewFolhaHTML(S.ym);
  }
  layout("relatorios", "Relatórios", corpo, acoes);
  ligarMes();
  document.querySelectorAll(".tabs button").forEach(bt => bt.onclick = () => { S.rel = bt.dataset.k; render(); });
  const an = document.getElementById("ano"); if (an) an.onchange = () => { S.ano = Number(an.value); render(); };
  const ns = document.getElementById("novaSem"); if (ns) ns.onclick = () => editar("semanas");
  document.querySelectorAll("tr.clk").forEach(tr => tr.onclick = () => {
    const s = D().semanas.find(x => x.id === tr.dataset.id); if (s) editar("semanas", s);
    const a = D().acertos.find(x => x.id === tr.dataset.id); if (a) editar("acertos", a);
  });
}
function viewFolhaHTML(ym, soMot = null) {
  const d = D();
  const mots = soMot ? d.motoristas.filter(m => m.id === soMot) : d.motoristas;
  const linhas = mots.map(m => {
    const a = d.acertos.find(x => x.motorista_id === m.id && C.noMes(x.competencia, ym));
    const fr = d.fretes.filter(f => f.motorista_id === m.id && C.noMes(f.data, ym));
    const fat = soma(fr, f => f.valor);
    const c = a ? C.acertoCalc(a) : null;
    return `<tr class="${a ? "clk" : ""}" data-id="${a?.id || ""}"><td><b>${esc(m.nome)}</b></td><td class="num">${fr.length}</td><td class="num">${brl(a ? a.fixo : m.fixo)}</td>
      <td class="num">${a && a.comissao !== null && a.comissao !== undefined ? brl(a.comissao) : '<span class="pill o">pendente</span>'}</td><td class="num">${brl(a?.media)}</td>
      <td class="num">${brl(n(a?.pernoite) + n(a?.extras))}</td><td class="num"><b>${brl(c?.total ?? m.fixo)}</b></td><td class="num">${brl(n(a?.vales) + n(a?.media_paga))}</td>
      <td class="num"><b>${brl(c?.saldo ?? m.fixo)}</b></td><td class="num">${brl(fat)}</td><td class="num">${pct(fat ? (c?.total ?? m.fixo) / fat : NaN)}</td>
      <td>${a ? `<span class="pill ${a.status === "pago" ? "g" : "o"}">${a.status}</span>` : '<span class="pill r">sem acerto</span>'}</td></tr>`;
  }).join("");
  return `<div class="card"><h3>Folha dos motoristas – ${mesLabel(ym)}</h3><div class="tbl-wrap"><table><tr><th>Motorista</th><th class="num">Fretes</th><th class="num">Fixo</th><th class="num">Comissão</th>
    <th class="num">Média</th><th class="num">Pernoite+extras</th><th class="num">Total bruto</th><th class="num">Descontos</th><th class="num">Saldo a pagar</th><th class="num">Faturamento</th><th class="num">Custo/fat.</th><th>Acerto</th></tr>${linhas}</table></div>
    <p class="muted" style="font-size:12px">Remuneração: fixo + comissão (definida no acerto) + média (bônus semanal) + pernoite/extras − vales e média já paga. Toque na linha para editar o acerto.</p></div>`;
}

// ---------------- MEU ACERTO (motorista) ----------------
function viewAcerto() {
  const mid = S.perfil?.motorista_id;
  const meus = D().acertos.filter(a => a.motorista_id === mid).sort((a, b) => b.competencia.localeCompare(a.competencia));
  const corpo = mid ? `${meus.map(a => { const c = C.acertoCalc(a); return `<div class="card" style="margin-bottom:12px"><h3>${mesLabel(a.competencia.slice(0, 7))} <span class="pill ${a.status === "pago" ? "g" : "o"}">${a.status}</span></h3>
    <table><tr><td>Fixo</td><td class="num">${brl(a.fixo)}</td></tr><tr><td>Comissão</td><td class="num">${a.comissao === null || a.comissao === undefined ? "a definir" : brl(a.comissao)}</td></tr>
    <tr><td>Média</td><td class="num">${brl(a.media)}</td></tr><tr><td>Pernoite + extras</td><td class="num">${brl(n(a.pernoite) + n(a.extras))}</td></tr>
    <tr class="grp"><td>Total</td><td class="num">${brl(c.total)}</td></tr><tr><td>Vales / média já paga</td><td class="num">− ${brl(n(a.vales) + n(a.media_paga))}</td></tr>
    <tr class="res"><td>Saldo</td><td class="num">${brl(c.saldo)}</td></tr></table></div>`; }).join("") || '<div class="card empty">Nenhum acerto lançado ainda.</div>'}`
    : '<div class="card empty">Seu usuário ainda não foi vinculado a um motorista. Peça a um sócio.</div>';
  layout("acerto", "Meu acerto", corpo);
}

// ---------------- CADASTROS ----------------
const CAD = {
  motoristas: { t: "Motoristas", cols: ["Nome", "Caminhão", "Admissão", "Fixo", "Ativo"], cells: m => [m.nome, nomeCam(m.caminhao_id), dataBR(m.admissao), brl(m.fixo), m.ativo ? "sim" : "não"] },
  caminhoes: { t: "Frota", cols: ["Caminhão", "Placa", "Situação", "Venc. seguro", "Venc. licenc.", "KM"], cells: c => [c.nome, c.placa, c.situacao, dataBR(c.venc_seguro), dataBR(c.venc_licenciamento), c.km ?? ""] },
  tabela_fretes: { t: "Tabela de fretes", cols: ["Cidade", "16 paletes", "18 paletes"], cells: t => [t.cidade, brl(t.valor_16), brl(t.valor_18)] },
  categorias: { t: "Categorias", cols: ["Categoria", "Grupo DRE"], cells: c => [c.nome, c.grupo] },
};
async function viewCad() {
  const abas = { ...Object.fromEntries(Object.entries(CAD).map(([k, v]) => [k, v.t])), ...(db.getModo() === "supabase" ? { usuarios: "Usuários" } : {}), config: "Configurações" };
  let corpo = `<div class="tabs">${Object.entries(abas).map(([k, l]) => `<button data-k="${k}" class="${k === S.cad ? "on" : ""}">${l}</button>`).join("")}</div>`;
  let acoes = "";
  if (CAD[S.cad]) {
    const K = CAD[S.cad];
    let rows = [...D()[S.cad]];
    if (S.cad === "categorias") rows.sort((a, b) => n(a.ordem) - n(b.ordem));
    if (S.cad === "tabela_fretes") rows.sort((a, b) => a.cidade.localeCompare(b.cidade));
    acoes = `<button class="btn pri" id="novo">+ Novo</button>`;
    corpo += `<div class="card"><div class="tbl-wrap"><table><tr>${K.cols.map(c => `<th>${c}</th>`).join("")}</tr>
      ${rows.map(r => `<tr class="clk" data-id="${r.id}">${K.cells(r).map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></div></div>`;
  } else if (S.cad === "usuarios") {
    let perfis = [];
    try { perfis = await db.listarPerfis(); } catch (e) { toast(e.message, true); }
    corpo += `<div class="card"><p class="muted">Cada pessoa cria o próprio acesso na tela de entrada (“Criar acesso”). Novos cadastros entram como motorista sem acesso a dados; aqui você define o papel e vincula o motorista.</p>
      <div class="tbl-wrap"><table><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Motorista vinculado</th></tr>
      ${perfis.map(p => `<tr><td>${esc(p.nome)}</td><td>${esc(p.email)}</td><td><select class="sel" data-p="${p.id}" data-f="papel">${opts([["socio", "Sócio"], ["motorista", "Motorista"]], p.papel, false)}</select></td>
      <td><select class="sel" data-p="${p.id}" data-f="motorista_id">${opts(motOpts(), p.motorista_id)}</select></td></tr>`).join("")}</table></div></div>`;
  } else if (S.cad === "config") {
    const cfg = D().config[0] || { id: "geral" };
    acoes = `<button class="btn pri" id="editCfg">Editar</button>`;
    corpo += `<div class="card"><table><tr><td>Taxa da máquina de cartão (aportes)</td><td class="num">${pct(n(cfg.taxa_cartao))}</td></tr>
      <tr><td>Saldo inicial de caixa (01/jan)</td><td class="num">${brl(cfg.saldo_inicial)}</td></tr>
      <tr><td>Bônus de média – faixas</td><td class="num">${(() => { const f = C.faixasBonus(D()); return `≥ ${f.f1} km/L: ${brl(f.v1)} · ≥ ${f.f2} km/L: ${brl(f.v2)}`; })()}</td></tr></table>
      ${db.getModo() === "demo" ? '<p><button class="btn del" id="resetDemo">Restaurar dados da demonstração</button></p>' : ""}</div>`;
  }
  layout("cadastros", "Cadastros", corpo, acoes);
  document.querySelectorAll(".tabs button").forEach(bt => bt.onclick = () => { S.cad = bt.dataset.k; render(); });
  const nv = document.getElementById("novo"); if (nv) nv.onclick = () => editar(S.cad);
  document.querySelectorAll("tr.clk").forEach(tr => tr.onclick = () => editar(S.cad, D()[S.cad].find(x => x.id === tr.dataset.id)));
  document.querySelectorAll("select[data-p]").forEach(sel => sel.onchange = () =>
    tentar(() => db.atualizarPerfil(sel.dataset.p, { [sel.dataset.f]: sel.value || null }), "Usuário atualizado"));
  const ec = document.getElementById("editCfg");
  if (ec) ec.onclick = () => modal("Configurações", [
    { k: "taxa_cartao", label: "Taxa da máquina (ex.: 0.0899 = 8,99%)", type: "number" },
    { k: "saldo_inicial", label: "Saldo inicial de caixa", type: "number" },
    { k: "bonus_faixa1_km_l", label: "Bônus faixa 1 – a partir de (km/L)", type: "number" }, { k: "bonus_faixa1_valor", label: "Bônus faixa 1 – valor (R$)", type: "number" },
    { k: "bonus_faixa2_km_l", label: "Bônus faixa 2 – a partir de (km/L)", type: "number" }, { k: "bonus_faixa2_valor", label: "Bônus faixa 2 – valor (R$)", type: "number" }],
    { bonus_faixa1_km_l: 3.5, bonus_faixa1_valor: 150, bonus_faixa2_km_l: 3.8, bonus_faixa2_valor: 200, ...(D().config[0] || { id: "geral" }) }, out => db.salvar("config", out));
  const rd = document.getElementById("resetDemo");
  if (rd) rd.onclick = () => { if (confirm("Voltar a demonstração aos dados originais de setembro?")) { db.reiniciarDemo(); location.reload(); } };
}

// ---------------- ALERTAS / FROTA ----------------
function blocoAlertas(max = 99) {
  const al = C.alertas(D());
  if (!al.length) return `<div class="card" style="margin-bottom:16px;border-left:4px solid var(--green)"><b class="pos">✓ Nenhum alerta no momento.</b></div>`;
  const cor = { alto: "r", medio: "o", info: "" }, rot = { alto: "urgente", medio: "atenção", info: "info" };
  return `<div class="card" style="margin-bottom:16px"><h3>Central de alertas <span class="muted" style="font-weight:500">(${al.length})</span></h3>
    <div style="display:flex;flex-direction:column;gap:6px">${al.slice(0, max).map(a => `<a href="#${a.rota}" style="text-decoration:none;color:inherit;display:flex;gap:8px;align-items:center">
    <span class="pill ${cor[a.nivel]}" style="min-width:70px;text-align:center">${rot[a.nivel]}</span><span>${esc(a.texto)}</span></a>`).join("")}
    ${al.length > max ? `<a href="#frota" class="muted" style="font-size:13px">ver todos os ${al.length} alertas →</a>` : ""}</div></div>`;
}
function blocoFrotaResumo(ym) {
  const fr = C.frotaMes(D(), ym).filter(x => x.km > 0); // só caminhões com km medido no mês
  const km = soma(fr, x => x.km);
  if (!km) return `<div class="card" style="margin-bottom:16px"><h3>Indicadores da frota</h3><p class="muted" style="margin:0">Registre os abastecimentos (com o KM do painel) para ver <b>custo por km</b>, <b>consumo km/L</b> e <b>faturamento por km</b> de cada caminhão — os principais indicadores usados pelas transportadoras. <a href="#frota">Ir para Frota →</a></p></div>`;
  return `<div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
    ${kpi("KM rodados", km.toLocaleString("pt-BR"), fr.map(x => x.c.nome.split(" ")[0] + " " + x.km.toLocaleString("pt-BR")).join(" · "))}
    ${kpi("Consumo médio", (soma(fr, x => x.litros) ? (km / soma(fr, x => x.litros)).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "–") + " km/L", soma(fr, x => x.litros).toLocaleString("pt-BR") + " litros", "green")}
    ${kpi("Custo por km", brl(soma(fr, x => x.custoDireto + x.valorComb) / km), "custos diretos + combustível", "red")}
    ${kpi("Faturamento por km", brl(soma(fr, x => x.fat) / km), "receita ÷ km", "navy")}</div>`;
}
function viewFrota() {
  const d = D();
  const abas = [["indicadores", "Indicadores"], ["bonus", "Bônus de média"], ["abastecimentos", "Abastecimentos"], ["preventiva", "Preventiva"], ["checklists", "Checklists"], ["documentos", "Documentos"], ["alertas", "Alertas"]];
  if (!S.frota) S.frota = "indicadores";
  let corpo = `<div class="tabs">${abas.map(([k, l]) => `<button data-k="${k}" class="${k === S.frota ? "on" : ""}">${l}</button>`).join("")}</div>`;
  let acoes = "";
  if (S.frota === "indicadores") {
    acoes = seletorMes();
    const fr = C.frotaMes(d, S.ym);
    corpo += blocoFrotaResumo(S.ym) + `<div class="card"><h3>Por caminhão – ${mesLabel(S.ym)}</h3><div class="tbl-wrap"><table><tr><th>Caminhão</th><th class="num">KM</th><th class="num">Litros</th><th class="num">km/L</th><th class="num">Meta</th><th class="num">Faturamento</th><th class="num">Fat./km</th><th class="num">Custo/km</th><th class="num">Resultado direto</th></tr>
      ${fr.map(x => `<tr><td><b>${esc(x.c.nome)}</b></td><td class="num">${x.km.toLocaleString("pt-BR")}</td><td class="num">${x.litros.toLocaleString("pt-BR")}</td>
      <td class="num ${x.desvio !== null && x.desvio < -0.08 ? "neg" : ""}">${x.kml ? x.kml.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "–"}</td><td class="num">${x.meta || "–"}</td>
      <td class="num">${brl(x.fat)}</td><td class="num">${x.km ? brl(x.fatKm) : "–"}</td><td class="num">${x.km ? brl(x.custoKm) : "–"}</td><td class="num"><b>${brl(x.fat - x.custoDireto - x.valorComb)}</b></td></tr>`).join("")}</table></div>
      <p class="muted" style="font-size:12px">Consumo fica em vermelho quando está mais de 8% abaixo da meta (referência de mercado: variação máxima de 8–10%). Cadastre a meta em Cadastros › Frota.</p></div>`;
  } else if (S.frota === "bonus") {
    const f = C.faixasBonus(d);
    const sem = C.semanasBonus(d);
    acoes = `<button class="btn ok" id="calcBonus">Calcular e lançar bônus</button>`;
    corpo += `<div class="card" style="margin-bottom:16px"><h3>Regra do bônus semanal (sábado)</h3>
      <div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:0">
      ${kpi("Abaixo de " + String(f.f1).replace(".", ",") + " km/L", "Sem bônus", "média mínima", "red")}
      ${kpi(String(f.f1).replace(".", ",") + " a " + String((f.f2 - 0.01).toFixed(2)).replace(".", ",") + " km/L", brl(f.v1), "bônus da semana", "orange")}
      ${kpi(String(f.f2).replace(".", ",") + " km/L ou mais", brl(f.v2), "bônus da semana", "green")}</div>
      <p class="muted" style="font-size:12px;margin-bottom:0">Semana de sábado a sexta. Média = km rodados (hodômetro) ÷ litros abastecidos na semana. Cálculo e lançamento automáticos todo sábado às 14h
      (o bônus entra em Despesas como “Bônus motorista – a pagar”). Faixas editáveis em Cadastros › Configurações.</p></div>
      <div class="card"><div class="tbl-wrap"><table><tr><th>Pagamento</th><th>Semana</th><th>Motorista</th><th class="num">KM</th><th class="num">Litros</th><th class="num">Média</th><th class="num">Bônus</th><th>Situação</th></tr>
      ${sem.map(x => `<tr><td>${dataBR(x.sabado)}</td><td>${dataBR(x.ini).slice(0, 5)} a ${dataBR(x.fim).slice(0, 5)}</td><td><b>${esc(x.m.nome)}</b></td>
        <td class="num">${x.km.toLocaleString("pt-BR")}</td><td class="num">${x.litros.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
        <td class="num"><b class="${x.alerta ? "neg" : x.media >= f.f2 ? "pos" : x.media < f.f1 ? "neg" : ""}">${x.media.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</b></td>
        <td class="num"><b>${brl(x.valor)}</b></td>
        <td>${x.alerta ? `<span class="pill r" title="${esc(x.alerta)}">conferir</span> <span class="muted" style="font-size:12px">${esc(x.alerta)}</span>`
          : x.futuro ? '<span class="pill">semana em andamento</span>'
          : x.desp ? `<span class="pill ${x.desp.status === "pago" ? "g" : "o"}">${x.desp.status === "pago" ? "pago" : "lançado – a pagar"}</span>`
          : x.valor ? '<span class="pill o">a lançar</span>' : '<span class="pill">sem bônus</span>'}</td></tr>`).join("")
        || '<tr><td colspan="8" class="empty">Registre os abastecimentos com o KM do painel para calcular as médias.</td></tr>'}</table></div>
      <p class="muted" style="font-size:12px">Médias abaixo de 2 ou acima de 5 km/L não são lançadas automaticamente: normalmente indicam abastecimento não registrado ou KM digitado errado.</p></div>`;
  } else if (S.frota === "abastecimentos") {
    acoes = `<button class="btn pri" id="novo">+ Abastecimento</button>`;
    const ab = [...(d.abastecimentos || [])].sort((a, b) => b.data.localeCompare(a.data) || n(b.km) - n(a.km));
    corpo += `<div class="card"><div class="tbl-wrap"><table><tr><th>Data</th><th>Caminhão</th><th>Motorista</th><th class="num">KM</th><th class="num">Litros</th><th class="num">km/L</th><th class="num">Valor</th><th>Posto</th></tr>
      ${ab.map(a => { const prev = ab.find(x => x.caminhao_id === a.caminhao_id && n(x.km) < n(a.km)); const kml = prev && n(a.litros) ? (n(a.km) - n(prev.km)) / n(a.litros) : null;
        return `<tr class="clk" data-t="abastecimentos" data-id="${a.id}"><td>${dataBR(a.data)}</td><td>${esc(nomeCam(a.caminhao_id))}</td><td>${esc(nomeMot(a.motorista_id))}</td><td class="num">${n(a.km).toLocaleString("pt-BR")}</td>
        <td class="num">${n(a.litros).toLocaleString("pt-BR")}</td><td class="num">${kml ? kml.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "–"}</td><td class="num">${brl(a.valor)}</td><td>${esc(a.posto)}</td></tr>`; }).join("")
        || '<tr><td colspan="8" class="empty">Nenhum abastecimento registrado. O motorista pode lançar pelo celular em “Diário de bordo”.</td></tr>'}</table></div>
      <p class="muted" style="font-size:12px">Registro operacional para medir consumo. O valor financeiro do diesel continua entrando pelo acerto do posto em Despesas (evita contar em dobro).</p></div>`;
  } else if (S.frota === "preventiva") {
    acoes = `<button class="btn pri" id="novo">+ Item preventivo</button>`;
    const pl = (d.planos_manutencao || []).map(p => ({ p, s: C.statusPlano(d, p) })).sort((a, b) => ({ vencida: 0, proxima: 1, ok: 2 }[a.s.st] - { vencida: 0, proxima: 1, ok: 2 }[b.s.st]));
    corpo += `<div class="card"><div class="tbl-wrap"><table><tr><th>Situação</th><th>Caminhão</th><th>Item</th><th class="num">KM atual</th><th class="num">Próxima (km)</th><th class="num">Faltam km</th><th>Próxima (data)</th></tr>
      ${pl.map(({ p, s: st }) => `<tr class="clk" data-t="planos_manutencao" data-id="${p.id}"><td><span class="pill ${st.st === "vencida" ? "r" : st.st === "proxima" ? "o" : "g"}">${st.st === "ok" ? "em dia" : st.st}</span></td>
        <td>${esc(st.cam?.nome || "")}</td><td><b>${esc(p.item)}</b></td><td class="num">${st.km ? st.km.toLocaleString("pt-BR") : "–"}</td><td class="num">${st.proxKm ? st.proxKm.toLocaleString("pt-BR") : "–"}</td>
        <td class="num ${st.faltaKm !== null && st.faltaKm <= 0 ? "neg" : ""}">${st.faltaKm !== null ? st.faltaKm.toLocaleString("pt-BR") : "–"}</td><td>${dataBR(st.proxData)}</td></tr>`).join("")
        || '<tr><td colspan="7" class="empty">Cadastre os itens de manutenção preventiva (ex.: troca de óleo a cada 20.000 km) para receber alertas antes de vencer.</td></tr>'}</table></div>
      <p class="muted" style="font-size:12px">O KM atual vem do último abastecimento ou checklist. Ao fazer o serviço, edite o item e atualize “feito pela última vez”. O andamento do serviço fica no Kanban de Manutenção.</p></div>`;
  } else if (S.frota === "checklists") {
    acoes = `<button class="btn pri" id="novo">+ Checklist</button>`;
    const ck = [...(d.checklists || [])].sort((a, b) => b.data.localeCompare(a.data));
    corpo += `<div class="card"><div class="tbl-wrap"><table><tr><th>Data</th><th>Caminhão</th><th>Motorista</th><th>Situação</th><th>Problemas</th></tr>
      ${ck.map(c => `<tr class="clk" data-t="checklists" data-id="${c.id}"><td>${dataBR(c.data)}</td><td>${esc(nomeCam(c.caminhao_id))}</td><td>${esc(nomeMot(c.motorista_id))}</td>
        <td><span class="pill ${c.status === "atencao" ? "r" : "g"}">${c.status === "atencao" ? "atenção" : c.status}</span></td><td>${esc(c.problemas || "")}</td></tr>`).join("")
        || '<tr><td colspan="5" class="empty">Nenhum checklist ainda. O motorista faz pelo celular antes de sair (“Diário de bordo”).</td></tr>'}</table></div></div>`;
  } else if (S.frota === "documentos") {
    const hj = hoje;
    corpo += `<div class="card"><div class="tbl-wrap"><table><tr><th>Caminhão</th><th>Placa</th><th>Situação</th><th>Seguro</th><th>Licenciamento</th><th class="num">KM atual</th></tr>
      ${d.caminhoes.map(c => { const cel = v => !v ? '<span class="pill o">sem data</span>' : `<span class="pill ${v < hj ? "r" : v <= C.addDias(hj, 30) ? "o" : "g"}">${dataBR(v)}</span>`;
        return `<tr class="clk" data-t="caminhoes" data-id="${c.id}"><td><b>${esc(c.nome)}</b></td><td>${esc(c.placa || "")}</td><td>${esc(c.situacao)}</td><td>${c.situacao === "vendido" ? "–" : cel(c.venc_seguro)}</td>
        <td>${c.situacao === "vendido" ? "–" : cel(c.venc_licenciamento)}</td><td class="num">${C.kmAtual(d, c).toLocaleString("pt-BR") || "–"}</td></tr>`; }).join("")}</table></div>
      <p class="muted" style="font-size:12px">Toque no caminhão para cadastrar vencimentos, placa e meta de consumo. Alertas 30 dias antes.</p></div>`;
  } else {
    corpo += blocoAlertas(999);
  }
  layout("frota", "Frota", corpo, acoes);
  ligarMes();
  document.querySelectorAll(".tabs button").forEach(bt => bt.onclick = () => { S.frota = bt.dataset.k; render(); });
  const cb = document.getElementById("calcBonus");
  if (cb) cb.onclick = () => tentar(() => lancarBonus(), "Bônus calculados e lançados");
  const nv = document.getElementById("novo");
  if (nv) nv.onclick = () => editar({ abastecimentos: "abastecimentos", preventiva: "planos_manutencao", checklists: "checklists" }[S.frota]);
  document.querySelectorAll("tr.clk[data-t]").forEach(tr => tr.onclick = () => editar(tr.dataset.t, (D()[tr.dataset.t] || []).find(x => x.id === tr.dataset.id)));
}
// Calcula e lança os bônus de todas as semanas já encerradas que ainda não foram lançadas
export async function lancarBonus(ateSabado = C.sabadoDe(hoje)) {
  if (db.getModo() === "supabase") {
    const sabs = [...new Set(C.semanasBonus(D()).filter(x => !x.futuro && x.sabado <= ateSabado).map(x => x.sabado))];
    for (const s of sabs) await db.rpc("calcular_bonus_media", { p_sabado: s });
    return;
  }
  for (const x of C.semanasBonus(D()).filter(x => !x.futuro && x.sabado <= ateSabado)) {
    let desp = x.desp;
    if (!desp && x.valor > 0 && !x.alerta) {
      desp = await db.salvar("despesas", { competencia: x.sabado, vencimento: x.sabado, categoria: "Bônus motorista",
        descricao: `Bônus média semana ${dataBR(x.ini).slice(0, 5)}–${dataBR(x.fim).slice(0, 5)} – ${x.m.nome}`, fornecedor: x.m.nome,
        motorista_id: x.m.id, caminhao_id: x.m.caminhao_id, forma: "PIX", valor: x.valor, status: "a_pagar",
        obs: `Média ${x.media} km/L (${x.km} km / ${x.litros} L)` });
    }
    await db.salvar("bonus_media", { id: x.reg?.id, semana_ini: x.ini, semana_fim: x.fim, motorista_id: x.m.id, caminhao_id: x.m.caminhao_id,
      km: x.km, litros: x.litros, media: x.media, valor: x.valor, despesa_id: desp?.id || null, alerta: x.alerta || null });
  }
}

function viewDiario() {
  const d = D(), mid = S.perfil?.motorista_id;
  const meusAb = (d.abastecimentos || []).filter(a => a.motorista_id === mid).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5);
  const meusCk = (d.checklists || []).filter(c => c.motorista_id === mid).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5);
  const feitoHoje = meusCk.some(c => c.data === hoje);
  const bigBtn = (id, ico, t, sub, cls = "pri") => `<button class="btn ${cls}" id="${id}" style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:16px;text-align:left;white-space:normal;min-height:84px">
    <span style="font-size:22px">${ico}</span><span style="font-size:16px">${t}</span><span style="font-weight:400;font-size:12px;opacity:.9">${sub}</span></button>`;
  const corpo = mid ? `<div class="grid g2" style="margin-bottom:16px">
      ${bigBtn("bFrete", "🚚", "Registrar viagem", "cliente, cidade e situação")}
      ${bigBtn("bCheck", feitoHoje ? "✅" : "📋", "Checklist do caminhão", feitoHoje ? "já feito hoje – pode refazer" : "faça antes de sair", feitoHoje ? "" : "ok")}
      ${bigBtn("bAbast", "⛽", "Registrar abastecimento", "KM do painel, litros e valor", "")}
      ${bigBtn("bAcerto", "💰", "Meu acerto", "fixo, comissão, média e saldo", "")}</div>
    ${(() => { const sb = C.semanasBonus(d).filter(x => x.m.id === mid).slice(0, 4); const f = C.faixasBonus(d);
      return `<div class="card" style="margin-bottom:16px"><h3>Minha média de consumo (bônus de sábado)</h3>
      <p class="muted" style="margin-top:0;font-size:13px">Abaixo de ${String(f.f1).replace(".", ",")} km/L: sem bônus · ${String(f.f1).replace(".", ",")}–${String((f.f2 - 0.01).toFixed(2)).replace(".", ",")}: ${brl(f.v1)} · ${String(f.f2).replace(".", ",")} ou mais: ${brl(f.v2)}</p>
      ${sb.map(x => `<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0"><span>${dataBR(x.ini).slice(0, 5)} a ${dataBR(x.fim).slice(0, 5)}${x.futuro ? " (parcial)" : ""}</span><span><b>${x.media.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} km/L</b> · ${brl(x.valor)}</span></div>`).join("") || '<p class="muted">Registre os abastecimentos com o KM do painel.</p>'}</div>`; })()}
    <div class="grid g2"><div class="card"><h3>Meus últimos abastecimentos</h3>${meusAb.map(a => `<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0"><span>${dataBR(a.data)} · ${n(a.km).toLocaleString("pt-BR")} km</span><b>${n(a.litros).toLocaleString("pt-BR")} L</b></div>`).join("") || '<p class="muted">Nenhum ainda.</p>'}</div>
    <div class="card"><h3>Meus últimos checklists</h3>${meusCk.map(c => `<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0"><span>${dataBR(c.data)}</span><span class="pill ${c.status === "atencao" ? "r" : "g"}">${c.status === "atencao" ? "atenção" : "ok"}</span></div>`).join("") || '<p class="muted">Nenhum ainda.</p>'}</div></div>`
    : '<div class="card empty">Seu usuário ainda não foi vinculado a um motorista. Peça a um sócio.</div>';
  layout("diario", "Diário de bordo", corpo);
  const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
  on("bFrete", () => editar("fretes")); on("bCheck", () => editar("checklists")); on("bAbast", () => editar("abastecimentos"));
  on("bAcerto", () => { location.hash = "#acerto"; });
}

// =====================================================================
// HOLDING – visão geral, empresas, contas, livro-caixa, sócios, dívidas
// =====================================================================
const nomeEmp = id => D().empresas?.find(e => e.id === id)?.nome || (id ? id : "—");
const curtoEmp = id => ({ holding: "Holding", logistica: "Logística", sky_cl: "SkyFit C. Limpo", sky_morato: "SkyFit Morato", familia: "Família" }[id] || nomeEmp(id));
const corEmp = id => D().empresas?.find(e => e.id === id)?.cor || "#90a4ae";
const nomeSoc = id => D().socios?.find(s => s.id === id)?.nome || ({ andre: "André", nicolas: "Nicolas", leonardo: "Leonardo" }[id] || id || "");
const nomePagador = p => (!p ? "" : H.SOCIOS_ID.includes(p) ? nomeSoc(p) : curtoEmp(p));
const empOpts = (todas = false) => [...(todas ? [["", "Todas as empresas"]] : []), ...[...(D().empresas || [])].sort((a, b) => n(a.ordem) - n(b.ordem)).map(e => [e.id, e.nome])];
const socOpts = () => [...(D().socios || [])].sort((a, b) => n(a.ordem) - n(b.ordem)).map(s => [s.id, s.nome]);
const pagOpts = () => [["", "Conta da própria empresa"], ...socOpts().map(([id, nm]) => [id, "Sócio: " + nm]), ...empOpts().map(([id, nm]) => [id, "Empresa: " + nm])];
const chipEmp = id => id ? `<span class="pill" style="background:${corEmp(id)}1f;color:${corEmp(id)}">${esc(curtoEmp(id))}</span>` : `<span class="pill">Entre sócios</span>`;
const ehSaida = m => ["despesa", "retirada", "emprestimo_pagamento"].includes(m.tipo);
const valorFmt = m => `<span class="${ehSaida(m) ? "neg" : m.tipo === "socio_socio" || m.tipo === "transferencia" ? "" : "pos"}">${brl(m.valor)}</span>`;
const anosMov = () => [...new Set((D().movimentos || []).map(m => m.data.slice(0, 4)))].sort().reverse();
const seletorAno = (id = "anoH", todos = true) => `<select class="sel" id="${id}" aria-label="Ano">${todos ? `<option value="" ${!S.anoH ? "selected" : ""}>Todo o histórico</option>` : ""}${anosMov().map(a => `<option ${a === S.anoH ? "selected" : ""}>${a}</option>`).join("")}</select>`;
function ligarAno(id = "anoH") { const el = document.getElementById(id); if (el) el.onchange = () => { S.anoH = el.value; render(); }; }
S.anoH = S.anoH ?? hoje.slice(0, 4); S.emp = S.emp || "logistica"; S.socX = S.socX || "andre";
S.lv = S.lv || { emp: "", tipo: "", soc: "", per: "", q: "", conf: false, lim: 300 };

// tipos que envolvem um sócio diretamente
const T_SOCIO = ["aporte", "retirada", "socio_socio", "saldo_inicial"];
// categorias já usadas, priorizando as da mesma empresa e tipo
function catSugestoes(emp, tipo) {
  const cont = {};
  (D().movimentos || []).forEach(m => { if (!m.categoria) return; const peso = (m.empresa_id === emp ? 2 : 0) + (m.tipo === tipo ? 3 : 0); cont[m.categoria] = (cont[m.categoria] || 0) + 1 + peso * 5; });
  return Object.entries(cont).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}
const FORM_MOV = (novo, base = {}) => [
  { k: "tipo", label: "O que é", type: "select", opts: H.TIPOS, required: true },
  { k: "empresa_id", label: "Empresa", type: "select", opts: () => [["", "— (entre sócios)"], ...empOpts()], show: v => v.tipo !== "socio_socio" },
  { k: "valor", label: "Valor (R$)", type: "number", required: true },
  { k: "data", label: "Data", type: "date", required: true },
  { k: "descricao", label: "Descrição", required: true, full: true },
  { k: "categoria", label: "Categoria", list: () => catSugestoes(base.empresa_id, base.tipo || "despesa"), show: v => !["socio_socio", "saldo_inicial"].includes(v.tipo) },
  { k: "status", label: "Situação", type: "select", opts: H.STATUS, required: true },
  { k: "vencimento", label: "Vencimento", type: "date", show: v => v.status !== "pago" },
  ...(novo ? [{ k: "repetir", label: "Repetir (parcelas mensais)", type: "number", dica: "Ex.: 10 = cria 10 parcelas, uma por mês, com o mesmo valor", show: v => v.tipo !== "socio_socio" }] : []),
  { k: "socio_id", label: "Sócio", type: "select", opts: socOpts, show: v => T_SOCIO.includes(v.tipo), dica: "Aporte/retirada: o sócio. Entre sócios: quem pagou/emprestou." },
  { k: "socio_destino_id", label: "Sócio que recebeu", type: "select", opts: socOpts, show: v => v.tipo === "socio_socio" },
  { k: "pago_por", label: "Quem pagou / recebeu o dinheiro", type: "select", opts: pagOpts, show: v => v.tipo !== "socio_socio", dica: "Deixe “conta da própria empresa” quando saiu/entrou na conta dela." },
  { k: "maquina", label: "Passado na máquina do Felipe?", type: "select", opts: [["nao", "Não"], ["sim", "Sim – o valor acima é o bruto (desconta 8,99%)"]], show: v => ["aporte", "despesa"].includes(v.tipo) },
  { k: "divida_id", label: "Dívida relacionada", type: "select", opts: () => (D().dividas || []).map(d => [d.id, d.credor]), show: v => ["emprestimo_entrada", "emprestimo_pagamento", "despesa"].includes(v.tipo) },
  { k: "forma", label: "Forma de pagamento", type: "select", opts: C.FORMAS },
  { k: "conferir", label: "Precisa conferir?", type: "select", opts: [["false", "Não"], ["true", "Sim"]], required: true },
  { k: "nota", label: "Observação / o que conferir", type: "textarea", full: true },
  { k: "fonte", label: "Origem (grupo · data · quem enviou)", full: true, show: () => !novo },
];
const addMeses = (iso, k) => { if (!iso) return iso; const [y, m, d] = iso.split("-").map(Number); const x = new Date(y, m - 1 + k, 1); const ult = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(Math.min(d, ult)).padStart(2, "0")}`; };
function editarMov(reg, base = {}) {
  if (!socio()) return toast("Somente sócios.", true);
  const obj = reg ? { ...reg, conferir: String(!!reg.conferir), maquina: "nao" } : { data: hoje, status: "pago", tipo: "despesa", conferir: "false", maquina: "nao", empresa_id: S.emp || "logistica", ...base };
  const m = modal((reg ? "Editar" : "Novo") + " lançamento", FORM_MOV(!reg, obj), obj, async out => {
    out.conferir = out.conferir === "true";
    const maq = out.maquina === "sim"; delete out.maquina;
    const rep = Math.max(1, Math.min(120, Math.round(n(out.repetir) || 1))); delete out.repetir;
    if (out.tipo === "socio_socio") out.empresa_id = null;
    if (!out.empresa_id && out.tipo !== "socio_socio") throw new Error("Escolha a empresa.");
    if (out.tipo !== "socio_socio") out.socio_destino_id = null;
    out.atualizado_em = new Date().toISOString();
    if (maq && !n(out.valor_bruto)) {
      const bruto = n(out.valor), liq = Math.round(bruto * (1 - H.TAXA_MAQUINA) * 100) / 100, taxa = Math.round((bruto - liq) * 100) / 100;
      if (out.tipo === "despesa" && H.SOCIOS_ID.includes(out.pago_por)) { // sócio pagou fornecedor pela máquina: aporte do sócio + despesa líquida
        await db.salvar("movimentos", { data: out.data, empresa_id: out.empresa_id, tipo: "aporte", categoria: "Aporte de sócio", socio_id: out.pago_por, valor: liq, valor_bruto: bruto, descricao: "Cartão na máquina do Felipe – " + out.descricao, status: out.status });
        out.pago_por = null; out.valor = liq;
      } else { out.valor_bruto = bruto; out.valor = liq; }
      await db.salvar("movimentos", { data: out.data, empresa_id: out.empresa_id, tipo: "despesa", categoria: "Custo de antecipação no cartão (máquina 8,99%)", valor: taxa, descricao: "Taxa da máquina – " + out.descricao, status: out.status });
    }
    if (out.status === "pago" && reg && reg.status !== "pago" && !out.data) out.data = hoje;
    if (rep > 1) {
      const venc0 = out.vencimento || out.data;
      for (let i = 0; i < rep; i++) {
        const p = { ...out, descricao: `${out.descricao} (${i + 1}/${rep})`, data: addMeses(out.data, i), vencimento: addMeses(venc0, i), status: i === 0 ? out.status : (out.status === "pago" ? "a_pagar" : out.status) };
        if (p.status === "pago") p.vencimento = null;
        await db.salvar("movimentos", p);
      }
      return;
    }
    await db.salvar("movimentos", out);
  }, reg ? () => db.excluir("movimentos", reg.id) : null);
  // ações extras ao editar: duplicar e marcar como pago
  if (reg) {
    const ft = m.querySelector(".ft");
    const dup = document.createElement("button"); dup.type = "button"; dup.className = "btn"; dup.textContent = "Duplicar";
    dup.onclick = () => { m.remove(); const { id, origem_ref, criado_em, atualizado_em, conferido_em, conferido_por, fonte, ...rest } = reg; editarMov(null, { ...rest, data: hoje }); };
    ft.insertBefore(dup, ft.querySelector('[data-a="cancel"]'));
    if (reg.status !== "pago") {
      const pg = document.createElement("button"); pg.type = "button"; pg.className = "btn ok"; pg.textContent = reg.tipo === "receita" ? "✓ Recebido hoje" : "✓ Pago hoje";
      pg.onclick = () => tentar(() => db.atualizar("movimentos", reg.id, { status: "pago", data: hoje, atualizado_em: new Date().toISOString() }), "Baixado ✓").then(() => m.remove());
      ft.insertBefore(pg, ft.querySelector('[data-a="cancel"]'));
    }
  }
}

function tabelaMov(ms, { emp = true, lim = 99999 } = {}) {
  return `<div class="tbl-wrap"><table><tr><th>Data</th>${emp ? "<th>Empresa</th>" : ""}<th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Sócio / quem pagou</th><th class="num">Valor</th></tr>
    ${ms.slice(0, lim).map(m => `<tr class="clk" data-mid="${m.id}"><td>${dataBR(m.data)}${m.status !== "pago" ? ` <span class="pill o">${m.status === "a_pagar" ? "a pagar" : "previsto"}</span>` : ""}</td>${emp ? `<td>${chipEmp(m.empresa_id)}</td>` : ""}
      <td>${esc(H.TIPO_NOME[m.tipo] || m.tipo)}</td><td>${esc(m.categoria || "")}</td>
      <td>${m.conferir ? '<span class="pill r" title="' + esc(m.nota || "conferir") + '">conferir</span> ' : ""}${esc(m.descricao || "")}${m.valor_bruto ? ` <span class="muted">(bruto ${brl(m.valor_bruto)})</span>` : ""}</td>
      <td>${esc([m.socio_id && nomeSoc(m.socio_id), m.socio_destino_id && "→ " + nomeSoc(m.socio_destino_id), m.pago_por && "pago/recebido: " + nomePagador(m.pago_por)].filter(Boolean).join(" "))}</td>
      <td class="num">${valorFmt(m)}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">Nenhum lançamento.</td></tr>`}</table></div>`;
}
function ligarTabelaMov() {
  document.querySelectorAll("tr[data-mid]").forEach(tr => tr.onclick = () => editarMov(D().movimentos.find(m => m.id === tr.dataset.mid)));
}

function viewHolding() {
  const d = D(), per = S.anoH || "";
  const emps = [...(d.empresas || [])].sort((a, b) => n(a.ordem) - n(b.ordem));
  const res = emps.map(e => ({ e, r: H.resultado(d, e.id, per) }));
  const oper = res.filter(x => x.e.tipo !== "familia");
  const tot = k => soma(oper, x => x.r[k]);
  const aPagar = (d.movimentos || []).filter(m => m.status !== "pago");
  const venc = aPagar.filter(m => (m.vencimento || m.data) < hoje);
  const divs = H.dividasResumo(d), saldoDiv = soma(divs, x => x.saldo);
  const conf = (d.movimentos || []).filter(m => m.conferir).length;
  const se = H.saldosSocioEmpresa(d), entre = H.saldosEntreSocios(d), ee = H.entreEmpresas(d);
  const pend = (d.pendencias || []).filter(p => p.status !== "ok").length;
  const ymA = hoje.slice(0, 7), ymP = addMeses(ymA + "-01", -1).slice(0, 7);
  // mês até hoje × mesmo período do mês anterior (comparação justa no começo do mês)
  const diaH = hoje.slice(8, 10), ateP = addMeses(hoje, -1);
  const somaPer = (de, ate) => { const o = { receitas: 0, despesas: 0 }; (d.movimentos || []).forEach(m => { if (m.status !== "pago" || m.empresa_id === "familia" || !m.empresa_id || m.data < de || m.data > ate) return;
    if (m.tipo === "receita") o.receitas += n(m.valor); if (m.tipo === "despesa") o.despesas += n(m.valor); }); o.resultado = o.receitas - o.despesas; return o; };
  const rA = somaPer(ymA + "-01", hoje), rP = somaPer(ymP + "-01", ateP);
  const catMes = {}; (d.movimentos || []).filter(m => m.tipo === "despesa" && m.status === "pago" && m.data.startsWith(ymA) && m.empresa_id !== "familia").forEach(m => { const k = m.categoria || "Sem categoria"; catMes[k] = (catMes[k] || 0) + n(m.valor); });
  const topCat = Object.entries(catMes).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const lim14 = C.addDias(hoje, 14);
  const prox = aPagar.filter(m => (m.vencimento || m.data) <= lim14).sort((a, b) => (a.vencimento || a.data).localeCompare(b.vencimento || b.data)).slice(0, 12);
  const corpo = `
  ${pend + conf ? `<a href="#conferir" class="card aviso-ok"><b>⚑ Aguardando seu OK:</b> ${pend} pergunta${pend === 1 ? "" : "s"} e ${conf} lançamento${conf === 1 ? "" : "s"} para conferir <span class="btn pri">Abrir conferência →</span></a>` : ""}
  <div class="kpis">
    ${kpi("Receitas", brl0(tot("receitas")), per ? "em " + per : "todo o histórico", "green")}
    ${kpi("Despesas", brl0(tot("despesas")), "inclui juros " + brl0(tot("juros")), "red")}
    ${kpi("Resultado", `<span class="${tot("resultado") < 0 ? "neg" : ""}">${brl0(tot("resultado"))}</span>`, "empresas + holding (sem família)", "gd")}
    ${kpi("Contas a pagar", brl0(soma(aPagar, m => m.valor)), `<span class="${venc.length ? "neg" : ""}">${venc.length} vencidas</span>`, "orange")}
    ${kpi("Dívidas em aberto", brl0(saldoDiv), divs.filter(x => x.saldo > 0).length + " credores", "navy")}
    ${kpi("Para conferir", conf, "lançamentos marcados", conf ? "red" : "")}
  </div>
  <div class="grid g2">
    <div class="card"><h3>Mês até hoje × mesmo período anterior <span class="muted" style="font-weight:500">(01 a ${diaH}/${ymA.slice(5)} × 01 a ${ateP.slice(8, 10)}/${ymP.slice(5)})</span></h3>
      <div class="cmp">${[["Receitas", "receitas", 1], ["Despesas", "despesas", -1], ["Resultado", "resultado", 1]].map(([l, k, bom]) => { const a = rA[k], b = rP[k], dv = b ? (a - b) / Math.abs(b) : null;
        return `<div><span class="muted">${l}</span><b class="${k === "resultado" && a < 0 ? "neg" : ""}">${brl0(a)}</b><span class="delta ${dv === null ? "" : dv * bom >= 0 ? "pos" : "neg"}">${dv === null ? "—" : (dv >= 0 ? "▲ " : "▼ ") + pct(Math.abs(dv))} <span class="muted">vs ${brl0(b)}</span></span></div>`; }).join("")}</div>
      <h3 style="margin-top:14px">Onde foi o dinheiro em ${mesLabel(ymA)}</h3>
      ${topCat.length ? topCat.map(([c, v]) => `<div class="barra"><span>${esc(c)}</span><i style="width:${Math.max(4, v / topCat[0][1] * 100)}%"></i><b>${brl0(v)}</b></div>`).join("") : `<p class="muted">Sem despesas pagas neste mês ainda.</p>`}</div>
    <div class="card"><h3>Próximos vencimentos – 14 dias <a href="#contas" style="font-size:13px;font-weight:500;float:right">ver Kanban →</a></h3>
      ${prox.length ? `<div class="tbl-wrap"><table>${prox.map(m => { const v = m.vencimento || m.data; return `<tr><td class="${v < hoje ? "neg" : v <= C.addDias(hoje, 3) ? "warn" : ""}" style="white-space:nowrap">${v < hoje ? "vencida " : ""}${dataBR(v).slice(0, 5)}</td><td>${chipEmp(m.empresa_id)} <a href="#" data-mid2="${m.id}">${esc(m.descricao)}</a></td><td class="num">${valorFmt(m)}</td>
        <td><button class="btn sm ok" data-pagar="${m.id}" title="Marcar como pago hoje">✓ ${m.tipo === "receita" ? "Recebi" : "Paguei"}</button></td></tr>`; }).join("")}</table></div>` : `<p class="muted">Nada vencendo nos próximos 14 dias. 👍</p>`}
      ${aPagar.length > prox.length ? `<p class="muted" style="font-size:12px">+ ${aPagar.length - prox.length} contas com vencimento depois. Total em aberto ${brl0(soma(aPagar, m => m.valor))}.</p>` : ""}</div>
    <div class="card"><h3>Resultado por empresa ${per ? "– " + per : "(histórico)"}</h3><div class="tbl-wrap"><table>
      <tr><th>Empresa</th><th class="num">Receitas</th><th class="num">Despesas</th><th class="num">Resultado</th><th class="num">Aportes sócios</th><th class="num">Retiradas</th><th class="num">Empréstimos (líq.)</th></tr>
      ${res.map(x => `<tr class="clk" data-emp="${x.e.id}"><td>${chipEmp(x.e.id)} ${esc(x.e.nome)}</td><td class="num">${brl0(x.r.receitas)}</td><td class="num">${brl0(x.r.despesas)}</td>
        <td class="num ${x.r.resultado < 0 ? "neg" : "pos"}"><b>${brl0(x.r.resultado)}</b></td><td class="num">${brl0(x.r.aportes)}</td><td class="num">${brl0(x.r.retiradas)}</td><td class="num">${brl0(x.r.empIn - x.r.empOut)}</td></tr>`).join("")}
    </table></div><p class="muted" style="font-size:12px">Aporte do sócio conta pelo valor que ele pôs (bruto, inclusive o passado na máquina do Felipe); a taxa de 8,99% entra como despesa da empresa.</p></div>
    <div class="card"><h3>Resultado mensal ${per || hoje.slice(0, 4)}</h3><div class="chart-box"><canvas id="cHold"></canvas></div></div>
    <div class="card"><h3>Sócios × empresas (+ empresa deve ao sócio · − sócio deve à empresa)</h3><div class="tbl-wrap"><table>
      <tr><th>Empresa</th>${H.SOCIOS_ID.map(s => `<th class="num">${nomeSoc(s)}</th>`).join("")}</tr>
      ${emps.map(e => `<tr><td>${chipEmp(e.id)}</td>${H.SOCIOS_ID.map(s => { const v = se[e.id]?.[s] || 0; return `<td class="num ${v < 0 ? "neg" : "pos"}">${brl0(v)}</td>`; }).join("")}</tr>`).join("")}
      <tr class="tot"><td>Total</td>${H.SOCIOS_ID.map(s => { const v = emps.reduce((t, e) => t + (se[e.id]?.[s] || 0), 0); return `<td class="num">${brl0(v)}</td>`; }).join("")}</tr></table></div>
      <p style="margin:8px 0 0">${entre.map(x => `<span class="pill ${Math.abs(x.valor) < 1 ? "g" : "o"}">${x.valor >= 0 ? nomeSoc(x.a) + " deve a " + nomeSoc(x.b) : nomeSoc(x.b) + " deve a " + nomeSoc(x.a)}: ${brl0(Math.abs(x.valor))}</span>`).join(" ")}</p>
      <p><a href="#socios">Ver extrato de cada sócio →</a></p></div>
    <div class="card"><h3>Uma empresa pagou pela outra</h3>${ee.length ? `<div class="tbl-wrap"><table><tr><th>Quem deve</th><th>A quem</th><th class="num">Valor</th></tr>
      ${ee.map(x => `<tr><td>${chipEmp(x.deve)}</td><td>${chipEmp(x.credor)}</td><td class="num">${brl0(x.valor)}</td></tr>`).join("")}</table></div>` : `<p class="muted">Nada em aberto.</p>`}
      <p class="muted" style="font-size:12px">Ex.: a conta da Logística pagou obra da SkyFit → SkyFit deve à Logística. Família = Kátia, pai, imóveis (apto Novamerica, terreno, colégio).</p></div>
  </div>`;
  layout("holding", "Gobbo Investimentos – visão geral da holding", corpo, seletorAno() + `<button class="btn pri" id="novoM">+ Lançamento</button>`);
  ligarAno();
  document.getElementById("novoM").onclick = () => editarMov();
  document.querySelectorAll("tr[data-emp]").forEach(tr => tr.onclick = () => { S.emp = tr.dataset.emp; location.hash = "#empresa"; });
  document.querySelectorAll("[data-pagar]").forEach(b => b.onclick = () => tentar(() => db.atualizar("movimentos", b.dataset.pagar, { status: "pago", data: hoje, atualizado_em: new Date().toISOString() }), "Baixado ✓"));
  document.querySelectorAll("[data-mid2]").forEach(a => a.onclick = e => { e.preventDefault(); editarMov(d.movimentos.find(m => m.id === a.dataset.mid2)); });
  const ano = per || hoje.slice(0, 4);
  grafico("cHold", { type: "bar", data: { labels: C.MES_AB, datasets: emps.filter(e => e.tipo !== "familia").map(e => ({ label: curtoEmp(e.id), data: H.porMes(d, e.id, ano).map(x => x.resultado), backgroundColor: corEmp(e.id), borderRadius: 4 })) },
    options: { scales: { x: { stacked: true }, y: { stacked: true, ...eixoBRL } } } });
}

function viewEmpresa() {
  const d = D(), e = S.emp, ano = S.anoH || hoje.slice(0, 4);
  const emps = [...(d.empresas || [])].sort((a, b) => n(a.ordem) - n(b.ordem));
  const r = H.resultado(d, e, S.anoH || ""), meses = H.porMes(d, e, ano);
  const cats = Object.entries(r.porCat).sort((a, b) => b[1] - a[1]), rcats = Object.entries(r.recCat).sort((a, b) => b[1] - a[1]);
  const ms = (d.movimentos || []).filter(m => m.empresa_id === e && (!S.anoH || m.data.startsWith(S.anoH))).sort((a, b) => b.data.localeCompare(a.data));
  const celMes = (f) => meses.map(x => `<td class="num">${f(x) ? brl0(f(x)) : ""}</td>`).join("");
  const linhaCat = (k, tipo) => `<tr><td>${esc(k)}</td>${meses.map(x => { const v = (d.movimentos || []).filter(m => m.empresa_id === e && m.tipo === tipo && (m.categoria || "Sem categoria") === k && m.data.startsWith(x.ym) && m.status === "pago").reduce((t, m) => t + n(m.valor), 0); return `<td class="num">${v ? brl0(v) : ""}</td>`; }).join("")}</tr>`;
  const corpo = `<div class="tabs">${emps.map(x => `<button data-e="${x.id}" class="${x.id === e ? "on" : ""}">${esc(curtoEmp(x.id))}</button>`).join("")}</div>
  <div class="kpis">
    ${kpi("Receitas", brl0(r.receitas), S.anoH || "histórico", "green")}${kpi("Despesas", brl0(r.despesas), "juros " + brl0(r.juros), "red")}
    ${kpi("Resultado", `<span class="${r.resultado < 0 ? "neg" : ""}">${brl0(r.resultado)}</span>`, "", "gd")}
    ${kpi("Aportes de sócios", brl0(r.aportes), "valor bruto aportado", "navy")}${kpi("Retiradas / devoluções", brl0(r.retiradas), "", "orange")}
    ${kpi("Empréstimos", brl0(r.empIn), "pagos " + brl0(r.empOut), "")}
  </div>
  <div class="card"><h3>DRE mês a mês – ${ano}${S.anoH ? "" : " (escolha o ano acima)"}</h3><div class="tbl-wrap"><table>
    <tr><th>Conta</th>${C.MES_AB.map(m => `<th class="num">${m}</th>`).join("")}</tr>
    <tr class="grp"><td>Receitas</td>${celMes(x => x.receitas)}</tr>${rcats.map(([k]) => linhaCat(k, "receita")).join("")}
    <tr class="grp"><td>Despesas</td>${celMes(x => x.despesas)}</tr>${cats.map(([k]) => linhaCat(k, "despesa")).join("")}
    <tr class="res"><td>Resultado</td>${meses.map(x => `<td class="num ${x.resultado < 0 ? "neg" : ""}">${x.receitas || x.despesas ? brl0(x.resultado) : ""}</td>`).join("")}</tr>
    <tr><td class="muted">Aportes de sócios</td>${celMes(x => x.aportes)}</tr><tr><td class="muted">Retiradas</td>${celMes(x => x.retiradas)}</tr>
  </table></div></div>
  <div class="card" style="margin-top:14px"><h3>Lançamentos (${ms.length})</h3>${tabelaMov(ms, { emp: false, lim: 200 })}
  ${ms.length > 200 ? `<p class="muted">Mostrando 200 – veja todos no <a href="#livro" id="vLivro">Livro-caixa</a>.</p>` : ""}</div>`;
  layout("empresa", nomeEmp(e), corpo, seletorAno() + `<button class="btn pri" id="novoM">+ Lançamento</button>`);
  ligarAno(); ligarTabelaMov();
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => { S.emp = b.dataset.e; render(); });
  document.getElementById("novoM").onclick = () => editarMov(null, { empresa_id: e });
  const vl = document.getElementById("vLivro"); if (vl) vl.onclick = () => { S.lv.emp = e; };
}

const COLS_CONTAS = [["a_vencer", "A vencer"], ["prox7", "Vence em 7 dias"], ["vencida", "Vencida"], ["paga", "Paga (no mês)"]];
function viewContas() {
  const d = D(), fe = S.contaEmp || "", ft = S.contaTipo ?? "pagar";
  const okTipo = m => !ft || (ft === "pagar" ? ehSaida(m) : !ehSaida(m) && m.tipo !== "socio_socio");
  const its = (d.movimentos || []).filter(m => okTipo(m) && (!fe || m.empresa_id === fe) && (m.status !== "pago" || (m.vencimento && C.noMes(m.data, S.ym))))
    .map(m => ({ m, col: H.colunaConta(m, hoje) })).sort((a, b) => (a.m.vencimento || a.m.data).localeCompare(b.m.vencimento || b.m.data));
  const corpo = `<div class="board">${COLS_CONTAS.map(([ck, cl]) => { const xs = its.filter(i => i.col === ck);
    return `<div class="col"><div class="col-h"><span>${cl} <span class="muted">(${xs.length})</span></span><span class="sum">${brl0(soma(xs, i => i.m.valor))}</span></div>
      <div class="list" data-col="${ck}">${xs.map(({ m }) => `<div class="kc ${ck === "vencida" ? "venc" : ck === "prox7" ? "p7" : ck === "paga" ? "ok" : ""}" data-id="${m.id}">
        <div class="l1"><span>${esc(m.descricao)}</span><span class="v">${brl(m.valor)}</span></div>
        <div class="l2">${chipEmp(m.empresa_id)} · ${m.vencimento ? "vence " + dataBR(m.vencimento) : dataBR(m.data)}${m.categoria ? " · " + esc(m.categoria) : ""}${m.pago_por ? " · " + esc(nomePagador(m.pago_por)) : ""}
          ${ck !== "paga" ? `<button class="btn sm ok kc-ok" data-baixa="${m.id}" title="Marcar como pago hoje">✓ ${m.tipo === "receita" ? "Recebi" : "Paguei"}</button>` : ""}</div></div>`).join("")}</div></div>`; }).join("")}</div>
  <p class="muted" style="font-size:12px;margin-top:10px">Contas das empresas, holding e família. Toque em ✓ ou arraste para “Paga” para baixar (data de hoje). Toque no cartão para editar. Use “+ Conta” para lançar boletos, parcelas e combinados futuros.</p>`;
  layout("contas", ft === "receber" ? "Contas a receber – Kanban" : ft === "pagar" ? "Contas a pagar – Kanban" : "Contas – Kanban", corpo,
    `<div class="seg">${[["pagar", "A pagar"], ["receber", "A receber"], ["", "Todas"]].map(([v, l]) => `<button data-ft="${v}" class="${v === ft ? "on" : ""}">${l}</button>`).join("")}</div><select class="sel" id="fEmp">${opts(empOpts(true), fe, false)}</select>` + seletorMes() + `<button class="btn pri" id="novoC">+ Conta</button>`);
  ligarMes();
  document.querySelectorAll("[data-ft]").forEach(b => b.onclick = () => { S.contaTipo = b.dataset.ft; render(); });
  document.querySelectorAll("[data-baixa]").forEach(b => b.onclick = ev => { ev.stopPropagation();
    tentar(() => db.atualizar("movimentos", b.dataset.baixa, { status: "pago", data: hoje, atualizado_em: new Date().toISOString() }), "Baixado ✓"); });
  document.getElementById("fEmp").onchange = ev => { S.contaEmp = ev.target.value; render(); };
  document.getElementById("novoC").onclick = () => editarMov(null, { status: ft === "receber" ? "previsto" : "a_pagar", tipo: ft === "receber" ? "receita" : "despesa", vencimento: hoje, empresa_id: fe || "logistica" });
  document.querySelectorAll(".kc").forEach(el => el.onclick = () => editarMov(d.movimentos.find(m => m.id === el.dataset.id)));
  esperarLib("Sortable").then(Sortable => document.querySelectorAll(".list").forEach(list => Sortable.create(list, {
    group: "contasH", animation: 150, delay: 180, delayOnTouchOnly: true,
    onEnd: ev => { if (ev.from === ev.to) return; const id = ev.item.dataset.id, col = ev.to.dataset.col;
      tentar(() => db.atualizar("movimentos", id, col === "paga" ? { status: "pago", data: hoje } : { status: "a_pagar" }), "Atualizado").then(render); },
  })));
}

function filtrarLivro() {
  const f = S.lv, q = (f.q || "").toLowerCase();
  return (D().movimentos || []).filter(m => (!f.emp || (f.emp === "_socios" ? !m.empresa_id : m.empresa_id === f.emp)) && (!f.tipo || m.tipo === f.tipo)
    && (!f.soc || m.socio_id === f.soc || m.socio_destino_id === f.soc || m.pago_por === f.soc) && (!f.per || m.data.startsWith(f.per)) && (!f.conf || m.conferir)
    && (!q || [m.descricao, m.categoria, m.nota, m.fonte, String(m.valor)].join(" ").toLowerCase().includes(q))).sort((a, b) => b.data.localeCompare(a.data));
}
function viewLivro() {
  const f = S.lv, ms = filtrarLivro();
  const tot = t => soma(ms.filter(m => m.tipo === t), m => m.valor);
  const corpo = `<div class="filters">
    <select class="sel" id="lvEmp">${opts([...empOpts(true), ["_socios", "Entre sócios"]], f.emp, false)}</select>
    <select class="sel" id="lvTipo"><option value="">Todos os tipos</option>${opts(H.TIPOS, f.tipo, false)}</select>
    <select class="sel" id="lvSoc"><option value="">Todos os sócios</option>${opts(socOpts(), f.soc, false)}</select>
    <select class="sel" id="lvPer"><option value="">Todo o período</option>${anosMov().flatMap(a => [[a, a], ...Array.from({ length: 12 }, (_, i) => [a + "-" + String(i + 1).padStart(2, "0"), "  " + C.MES_AB[i] + "/" + a])]).map(([v, l]) => `<option value="${v}" ${v === f.per ? "selected" : ""}>${l}</option>`).join("")}</select>
    <input class="inp" id="lvQ" placeholder="Buscar descrição, valor, categoria…" value="${esc(f.q)}" style="flex:1;min-width:180px">
    <label class="pill ${f.conf ? "r" : ""}" style="cursor:pointer;display:flex;align-items:center;gap:6px"><input type="checkbox" id="lvConf" ${f.conf ? "checked" : ""}> só “conferir”</label>
  </div>
  <div class="kpis">${kpi("Lançamentos", ms.length, "")}${kpi("Receitas", brl0(tot("receita")), "", "green")}${kpi("Despesas", brl0(tot("despesa")), "", "red")}
    ${kpi("Aportes", brl0(soma(ms.filter(m => m.tipo === "aporte"), m => m.valor_bruto || m.valor)), "bruto", "navy")}${kpi("Retiradas", brl0(tot("retirada")), "", "orange")}
    ${kpi("Empréstimos", brl0(tot("emprestimo_entrada")), "pagos " + brl0(tot("emprestimo_pagamento")), "")}</div>
  <div class="card">${tabelaMov(ms, { lim: f.lim })}${ms.length > f.lim ? `<p style="text-align:center"><button class="btn" id="lvMais">Mostrar mais (${ms.length - f.lim} restantes)</button></p>` : ""}</div>
  <p class="muted" style="font-size:12px">Histórico completo apurado das conversas do WhatsApp (Caminhões – Financeiro/Manutenção, André/Nico, Léo/André), com comprovantes lidos. Itens marcados “conferir” têm dúvida registrada na observação.</p>`;
  layout("livro", "Livro-caixa", corpo, `<button class="btn" id="lvCsv">⬇ Exportar</button><label class="btn" style="cursor:pointer">⬆ Importar<input type="file" id="lvImp" accept=".json,application/json" hidden></label><button class="btn pri" id="novoM">+ Lançamento</button>`);
  const set = (id, k, ev = "onchange") => { const el = document.getElementById(id); el[ev] = () => { f[k] = el.type === "checkbox" ? el.checked : el.value; f.lim = 300; render(); }; };
  set("lvEmp", "emp"); set("lvTipo", "tipo"); set("lvSoc", "soc"); set("lvPer", "per"); set("lvConf", "conf");
  const qi = document.getElementById("lvQ"); qi.oninput = () => { f.q = qi.value; const p = qi.selectionStart; render(); const nq = document.getElementById("lvQ"); nq.focus(); nq.setSelectionRange(p, p); };
  const mais = document.getElementById("lvMais"); if (mais) mais.onclick = () => { f.lim += 500; render(); };
  document.getElementById("novoM").onclick = () => editarMov(null, { empresa_id: f.emp && f.emp !== "_socios" ? f.emp : "logistica" });
  ligarTabelaMov();
  document.getElementById("lvCsv").onclick = () => {
    const linhas = [["Data", "Empresa", "Tipo", "Categoria", "Descrição", "Sócio", "Sócio destino", "Pago/recebido por", "Situação", "Vencimento", "Valor", "Valor bruto", "Conferir", "Observação", "Origem"],
      ...ms.map(m => [dataBR(m.data), nomeEmp(m.empresa_id), H.TIPO_NOME[m.tipo], m.categoria, m.descricao, nomeSoc(m.socio_id), nomeSoc(m.socio_destino_id), nomePagador(m.pago_por), m.status, dataBR(m.vencimento), n(m.valor).toFixed(2).replace(".", ","), m.valor_bruto ? n(m.valor_bruto).toFixed(2).replace(".", ",") : "", m.conferir ? "sim" : "", m.nota, m.fonte])];
    const blob = new Blob([C.csv(linhas)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `gobbo-livro-caixa-${hoje}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  document.getElementById("lvImp").onchange = async ev => {
    const file = ev.target.files[0]; if (!file) return;
    await tentar(async () => {
      const rows = H.validarImport(JSON.parse(await file.text()));
      if (!confirm(`Importar ${rows.length} lançamentos? Lançamentos já importados antes (mesma origem) serão atualizados, não duplicados.`)) return;
      toast("Importando… aguarde");
      const nOk = await db.salvarMuitos("movimentos", rows, "origem_ref");
      toast(nOk + " lançamentos importados");
    });
    render();
  };
}

function viewSocios() {
  const d = D(), se = H.saldosSocioEmpresa(d), entre = H.saldosEntreSocios(d);
  const emps = [...(d.empresas || [])].sort((a, b) => n(a.ordem) - n(b.ordem));
  const s = S.socX, ext = H.extratoSocio(d, s);
  const resumo = id => { const e = H.extratoSocio(d, id).filter(x => x.empresa);
    return { aportou: soma(e.filter(x => x.m.tipo === "aporte" || x.m.tipo === "saldo_inicial"), x => x.valor), pagou: soma(e.filter(x => ["despesa", "emprestimo_pagamento", "transferencia"].includes(x.m.tipo) || (x.m.tipo === "retirada" && x.valor > 0)), x => x.valor),
      retirou: -soma(e.filter(x => x.m.tipo === "retirada" && x.valor < 0), x => x.valor), recebeu: -soma(e.filter(x => ["receita", "emprestimo_entrada"].includes(x.m.tipo)), x => x.valor) }; };
  const corpo = `<div class="grid g2">
    <div class="card"><h3>Saldo de cada sócio com cada empresa</h3><div class="tbl-wrap"><table>
      <tr><th>Empresa</th>${H.SOCIOS_ID.map(x => `<th class="num">${nomeSoc(x)}</th>`).join("")}</tr>
      ${emps.map(e => `<tr><td>${chipEmp(e.id)}</td>${H.SOCIOS_ID.map(x => { const v = se[e.id]?.[x] || 0; return `<td class="num ${v < 0 ? "neg" : "pos"}">${brl(v)}</td>`; }).join("")}</tr>`).join("")}
      <tr class="tot"><td>Total</td>${H.SOCIOS_ID.map(x => `<td class="num">${brl(emps.reduce((t, e) => t + (se[e.id]?.[x] || 0), 0))}</td>`).join("")}</tr></table></div>
      <p class="muted" style="font-size:12px">Positivo = a empresa deve ao sócio (ele aportou/pagou mais do que retirou). Negativo = o sócio retirou/recebeu mais do que pôs.
      Logística: parte do fechamento oficial de 02/05/2024 (caminhão devia Nicolas R$ 4.054,98, André R$ 1.850,33, Léo R$ 11.217,44). Família: dinheiro de Kátia/pai/imóveis que passou por cada sócio.</p></div>
    <div class="card"><h3>Entre irmãos</h3><div class="tbl-wrap"><table><tr><th>Situação</th><th class="num">Valor</th></tr>
      ${entre.map(x => `<tr><td>${x.valor >= 0 ? `<b>${nomeSoc(x.a)}</b> deve a <b>${nomeSoc(x.b)}</b>` : `<b>${nomeSoc(x.b)}</b> deve a <b>${nomeSoc(x.a)}</b>`}</td><td class="num">${brl(Math.abs(x.valor))}</td></tr>`).join("")}</table></div>
      <p class="muted" style="font-size:12px">André × Nicolas: saldo informado no grupo até 13/08/2025 (André devia R$ 107.636,58) + todos os comprovantes depois disso. André × Léo: grupo Léo/André desde jan/2025.
      Atenção: desde ago/2025 o Nicolas parou de lançar as parcelas de cartão/parcelamento do André – confirme antes de acertar.</p>
      <h3 style="margin-top:14px">Resumo por sócio</h3><div class="tbl-wrap"><table><tr><th>Sócio</th><th class="num">Aportou</th><th class="num">Pagou p/ empresas</th><th class="num">Retirou</th><th class="num">Recebeu em nome delas</th></tr>
      ${H.SOCIOS_ID.map(x => { const r = resumo(x); return `<tr><td><b>${nomeSoc(x)}</b></td><td class="num">${brl0(r.aportou)}</td><td class="num">${brl0(r.pagou)}</td><td class="num">${brl0(r.retirou)}</td><td class="num">${brl0(r.recebeu)}</td></tr>`; }).join("")}</table></div></div>
  </div>
  <div class="card" style="margin-top:14px"><h3>Extrato – ${nomeSoc(s)}</h3><div class="tabs">${H.SOCIOS_ID.map(x => `<button data-s="${x}" class="${x === s ? "on" : ""}">${nomeSoc(x)}</button>`).join("")}</div>
  <div class="tbl-wrap"><table><tr><th>Data</th><th>Empresa / com</th><th>Tipo</th><th>Descrição</th><th class="num">Efeito</th></tr>
  ${ext.slice().reverse().slice(0, 600).map(x => `<tr class="clk" data-mid="${x.m.id}"><td>${dataBR(x.m.data)}</td><td>${x.empresa ? chipEmp(x.empresa) : "com " + esc(nomeSoc(x.outro))}</td><td>${esc(H.TIPO_NOME[x.m.tipo])}</td>
    <td>${x.m.conferir ? '<span class="pill r">conferir</span> ' : ""}${esc(x.m.descricao || "")}</td><td class="num ${x.valor < 0 ? "neg" : "pos"}">${brl(x.valor)}</td></tr>`).join("")}</table></div>
  <p class="muted" style="font-size:12px">Efeito positivo = crédito do sócio (empresa/irmão passa a dever a ele).</p></div>`;
  layout("socios", "Sócios – André, Nicolas e Leonardo", corpo, `<button class="btn pri" id="novoM">+ Lançamento</button>`);
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => { S.socX = b.dataset.s; render(); });
  document.getElementById("novoM").onclick = () => editarMov(null, { tipo: "aporte", socio_id: s });
  ligarTabelaMov();
}

function viewDividas() {
  const d = D(), ds = H.dividasResumo(d);
  const corpo = `<div class="kpis">${kpi("Saldo devedor (estimado)", brl0(soma(ds, x => x.saldo)), "principal recebido − pago", "red")}
    ${kpi("Juros já pagos", brl0(soma(ds, x => x.juros)), "lançados como despesa", "orange")}${kpi("Credores", ds.length, "")}</div>
  ${ds.map(x => `<div class="card" style="margin-bottom:14px"><h3>${esc(x.d.credor)} <span class="pill ${x.d.status === "quitada" ? "g" : "o"}">${x.d.status}</span></h3>
    <p class="muted">${chipEmp(x.d.empresa_id)} · juros: ${esc(x.d.juros || "—")} · desde ${dataBR(x.d.inicio)} ${x.d.obs ? "· " + esc(x.d.obs) : ""}</p>
    <div class="kpis">${kpi("Recebido", brl0(x.entrou), "", "green")}${kpi("Principal pago", brl0(x.pago), "", "navy")}${kpi("Juros pagos", brl0(x.juros), "", "orange")}${kpi("Saldo", brl0(x.saldo), "", "red")}</div>
    ${tabelaMov(x.ms.slice().sort((a, b) => b.data.localeCompare(a.data)), { lim: 400 })}
    <p><button class="btn" data-ed="${x.d.id}">Editar dívida</button></p></div>`).join("")}
  <p class="muted" style="font-size:12px">Saldos estimados pelo que apareceu no WhatsApp. Valor principal de vários empréstimos (Rogério, Alessandro, agiota, Luís) não foi informado de forma completa – edite a dívida para registrar o principal e o combinado.</p>`;
  layout("dividas", "Dívidas e empréstimos", corpo, `<button class="btn pri" id="novaD">+ Dívida</button>`);
  ligarTabelaMov();
  const FD = [{ k: "credor", label: "Credor", required: true, full: true }, { k: "empresa_id", label: "Empresa devedora", type: "select", opts: empOpts },
    { k: "principal", label: "Principal (R$)", type: "number" }, { k: "juros", label: "Juros / combinado" }, { k: "inicio", label: "Início", type: "date" },
    { k: "status", label: "Situação", type: "select", opts: [["aberta", "Aberta"], ["quitada", "Quitada"], ["renegociada", "Renegociada"]], required: true },
    { k: "obs", label: "Observação", type: "textarea", full: true }];
  const ed = reg => modal(reg ? "Editar dívida" : "Nova dívida", FD, reg ? { ...reg } : { status: "aberta", empresa_id: "holding", inicio: hoje }, out => db.salvar("dividas", out), reg ? () => db.excluir("dividas", reg.id) : null);
  document.getElementById("novaD").onclick = () => ed();
  document.querySelectorAll("[data-ed]").forEach(b => b.onclick = () => ed(d.dividas.find(x => x.id === b.dataset.ed)));
}

// ---------------- conferência (aguardando OK dos sócios) ----------------
S.cf = S.cf || { emp: "", verOk: false };
function quemSou() { return S.perfil?.nome || (db.getModo() === "demo" ? "Demonstração" : "Sócio"); }
function viewConferir() {
  const d = D(), f = S.cf;
  const perg = [...(d.pendencias || [])].sort((a, b) => n(a.ordem) - n(b.ordem));
  const abertas = perg.filter(p => p.status !== "ok"), feitas = perg.filter(p => p.status === "ok");
  const ms = (d.movimentos || []).filter(m => m.conferir && (!f.emp || (f.emp === "_socios" ? !m.empresa_id : m.empresa_id === f.emp))).sort((a, b) => a.data.localeCompare(b.data));
  const okRec = (d.movimentos || []).filter(m => m.conferido_em).sort((a, b) => b.conferido_em.localeCompare(a.conferido_em)).slice(0, 30);
  const cartaoP = p => `<div class="perg ${p.status}" data-pid="${p.id}">
      <div class="perg-top"><span class="pill">${esc(p.area || "")}</span> <span class="pill ${p.status === "respondida" ? "o" : "r"}">${p.status === "respondida" ? "respondida – falta o OK" : "aguardando resposta"}</span></div>
      <p>${p.ordem}. ${esc(p.pergunta)}</p>
      <textarea class="inp" rows="2" placeholder="Sua resposta / decisão…">${esc(p.resposta || "")}</textarea>
      <div class="perg-acoes"><button class="btn" data-acao="salvar">Salvar resposta</button><button class="btn pri" data-acao="ok">✓ OK – resolvido</button></div>
      ${p.respondido_por ? `<p class="muted" style="font-size:12px">Última resposta: ${esc(p.respondido_por)} em ${dataBR((p.respondido_em || "").slice(0, 10))}</p>` : ""}</div>`;
  const corpo = `
  <div class="kpis">${kpi("Perguntas abertas", abertas.length, feitas.length + " resolvidas", abertas.length ? "red" : "green")}
    ${kpi("Lançamentos a conferir", (d.movimentos || []).filter(m => m.conferir).length, "clique ✓ OK quando estiver certo", "orange")}
    ${kpi("Já conferidos", (d.movimentos || []).filter(m => m.conferido_em).length, "com seu OK registrado", "green")}</div>
  <div class="card"><h3>Perguntas que dependem de vocês</h3>
    ${abertas.map(cartaoP).join("") || `<p class="muted">Nenhuma pergunta aberta. 👍</p>`}
    ${feitas.length ? `<details><summary class="muted">Resolvidas (${feitas.length})</summary>${feitas.map(p => `<p><span class="pill g">OK</span> ${esc(p.pergunta)}<br><span class="muted">→ ${esc(p.resposta || "")} (${esc(p.respondido_por || "")})</span></p>`).join("")}</details>` : ""}
  </div>
  <div class="card"><div class="filters" style="margin:0 0 10px"><h3 style="margin:0;flex:1">Lançamentos marcados para conferir</h3>
    <select class="sel" id="cfEmp">${opts([...empOpts(true), ["_socios", "Entre sócios"]], f.emp, false)}</select></div>
    <div class="tbl-wrap"><table class="tbl-conf"><tr><th>Data</th><th>Empresa</th><th>Descrição</th><th class="num">Valor</th><th>O que conferir</th><th></th></tr>
    ${ms.map(m => `<tr data-cid="${m.id}"><td>${dataBR(m.data)}${m.status !== "pago" ? ` <span class="pill o">${m.status === "a_pagar" ? "a pagar" : "previsto"}</span>` : ""}</td><td>${m.empresa_id ? chipEmp(m.empresa_id) : '<span class="pill">entre sócios</span>'}</td>
      <td>${esc(m.descricao || "")}<br><span class="muted" style="font-size:12px">${esc(H.TIPO_NOME[m.tipo] || m.tipo)} · ${esc(m.categoria || "")}${m.pago_por ? " · pago/recebido: " + esc(nomePagador(m.pago_por)) : ""}${m.socio_id ? " · sócio: " + esc(nomeSoc(m.socio_id)) : ""}</span></td>
      <td class="num">${valorFmt(m)}</td><td style="font-size:13px">${esc(m.nota || "conferir valor / classificação")}</td>
      <td style="white-space:nowrap"><button class="btn pri" data-ok="${m.id}">✓ OK</button> <button class="btn" data-ed="${m.id}">Editar</button></td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nada para conferir. 👍</td></tr>`}</table></div>
    <p class="muted" style="font-size:12px">✓ OK confirma o lançamento como está e registra quem conferiu e quando. Se algo estiver errado, use Editar (ou apague o lançamento por lá).</p></div>
  ${okRec.length ? `<div class="card"><details><summary><b>Conferidos recentemente (${okRec.length})</b></summary>${tabelaMov(okRec)}</details></div>` : ""}`;
  layout("conferir", "Conferência – aguardando seu OK", corpo);
  document.getElementById("cfEmp").onchange = e => { f.emp = e.target.value; render(); };
  document.querySelectorAll("[data-ok]").forEach(b => b.onclick = () => {
    const m = d.movimentos.find(x => x.id === b.dataset.ok); if (!m) return;
    tentar(() => db.atualizar("movimentos", m.id, { conferir: false, conferido_em: new Date().toISOString(), conferido_por: quemSou(),
      nota: [m.nota, "OK " + quemSou() + " " + dataBR(hoje)].filter(Boolean).join(" · "), atualizado_em: new Date().toISOString() }), "Conferido ✓");
  });
  document.querySelectorAll("[data-ed]").forEach(b => b.onclick = () => editarMov(d.movimentos.find(x => x.id === b.dataset.ed)));
  document.querySelectorAll(".perg").forEach(el => {
    const p = perg.find(x => x.id === el.dataset.pid), txt = el.querySelector("textarea");
    el.querySelectorAll("[data-acao]").forEach(b => b.onclick = () => {
      const ok = b.dataset.acao === "ok";
      if (ok && !txt.value.trim() && !confirm("Marcar como resolvida sem escrever a resposta?")) return;
      tentar(() => db.atualizar("pendencias", p.id, { resposta: txt.value.trim() || p.resposta || null, status: ok ? "ok" : "respondida",
        respondido_em: new Date().toISOString(), respondido_por: quemSou() }), ok ? "Resolvida ✓" : "Resposta salva");
    });
  });
}

function viewMenu() {
  const corpo = `<div class="card"><nav class="menu-lista">${MENU_SOCIO.map(([r, i, l]) => r === "#sec" ? `<h3>${l}</h3>` : `<a href="#${r}" class="btn" style="display:flex;gap:10px;margin-bottom:8px;text-align:left">${i} ${l}</a>`).join("")}</nav></div>`;
  layout("menu", "Menu", corpo);
}



// ---------------- fluxo de caixa (realizado + projetado) ----------------
// Entradas/saídas de caixa por natureza: operacional (receitas/despesas) e financiamento (sócios e empréstimos).
const NAT = { receita: ["op", 1], despesa: ["op", -1], aporte: ["fin", 1], emprestimo_entrada: ["fin", 1], retirada: ["fin", -1], emprestimo_pagamento: ["fin", -1] };
const valCaixa = m => n(m.valor); // aporte entra pelo líquido (a taxa da máquina já é despesa)
// de qual caixa o dinheiro saiu/entrou: a empresa que pagou no lugar, ou a própria; sócio pagando não mexe no caixa das empresas
const caixaDe = m => (m.pago_por ? (H.SOCIOS_ID.includes(m.pago_por) ? null : m.pago_por) : m.empresa_id);
S.fx = S.fx || { emp: "", media: true };
function lerSaldoInicial() { try { return numBR(localStorage.getItem("gobbo_saldo_caixa")) || 0; } catch { return 0; } }
function viewFluxo() {
  const d = D(), f = S.fx;
  const filtro = m => { const c = NAT[m.tipo] && caixaDe(m); return c && (f.emp ? c === f.emp : c !== "familia"); };
  const ms = (d.movimentos || []).filter(filtro);
  // realizado: últimos 12 meses
  const meses = Array.from({ length: 12 }, (_, i) => addMeses(hoje.slice(0, 7) + "-01", i - 11).slice(0, 7));
  const real = meses.map(ym => { const x = ms.filter(m => m.status === "pago" && m.data.startsWith(ym));
    const g = (nat, sn) => soma(x.filter(m => NAT[m.tipo][0] === nat && NAT[m.tipo][1] === sn), valCaixa);
    return { ym, ent: g("op", 1), sai: g("op", -1), fin: g("fin", 1) - g("fin", -1) }; });
  // projetado: 13 semanas a partir de hoje (contas a pagar/receber + previstos)
  const ini = hoje, sem = Array.from({ length: 13 }, (_, i) => ({ de: C.addDias(ini, i * 7), ate: C.addDias(ini, i * 7 + 6), ent: 0, sai: 0, itens: [] }));
  const abertos = ms.filter(m => m.status !== "pago");
  const venc = abertos.filter(m => (m.vencimento || m.data) < ini);
  abertos.forEach(m => { const dt = m.vencimento || m.data; const w = sem.find(s => dt >= s.de && dt <= s.ate); if (!w) return;
    if (NAT[m.tipo][1] > 0) w.ent += valCaixa(m); else w.sai += valCaixa(m); w.itens.push(m); });
  // receita média semanal da Logística (Levíssima) nas últimas 8 semanas – a receita entra no fechamento, não fica "a receber"
  const desde = C.addDias(ini, -56);
  const mediaLog = soma((d.movimentos || []).filter(m => m.empresa_id === "logistica" && m.tipo === "receita" && m.status === "pago" && m.data >= desde && m.data < ini), m => m.valor) / 8;
  const usaMedia = f.media && (!f.emp || f.emp === "logistica");
  const despMediaLog = soma((d.movimentos || []).filter(m => m.empresa_id === "logistica" && m.tipo === "despesa" && m.status === "pago" && m.data >= desde && m.data < ini && !/combust|diesel|posto|juros/i.test(m.categoria || "")), m => m.valor) / 8;
  if (usaMedia) sem.forEach(w => { w.ent += mediaLog; w.sai += despMediaLog; w.media = true; });
  const saldo0 = lerSaldoInicial() - soma(venc.filter(m => NAT[m.tipo][1] < 0), valCaixa) + soma(venc.filter(m => NAT[m.tipo][1] > 0), valCaixa);
  let acc = saldo0; sem.forEach(w => { acc += w.ent - w.sai; w.saldo = acc; });
  const menor = sem.reduce((a, w) => (w.saldo < a.saldo ? w : a), sem[0]);
  const ultimos3 = real.slice(-3), media3 = soma(ultimos3, x => x.ent - x.sai) / 3;
  const corpo = `
  <div class="kpis">
    ${kpi("Saldo informado hoje", brl0(lerSaldoInicial()), `<a href="#" id="fxSaldo">alterar</a>`, "navy")}
    ${kpi("Vencidos não pagos", brl0(soma(venc.filter(m => NAT[m.tipo][1] < 0), valCaixa)), venc.length + " lançamentos", venc.length ? "red" : "green")}
    ${kpi("A pagar – 13 semanas", brl0(soma(sem, w => w.sai - (w.media ? despMediaLog : 0))), "contas lançadas", "orange")}
    ${kpi("Menor saldo previsto", `<span class="${menor.saldo < 0 ? "neg" : ""}">${brl0(menor.saldo)}</span>`, "semana de " + dataBR(menor.de), menor.saldo < 0 ? "red" : "green")}
    ${kpi("Geração de caixa operacional", `<span class="${media3 < 0 ? "neg" : ""}">${brl0(media3)}</span>`, "média/mês – últimos 3 meses", "gd")}
    ${kpi("Saldo em 13 semanas", `<span class="${sem[12].saldo < 0 ? "neg" : ""}">${brl0(sem[12].saldo)}</span>`, "em " + dataBR(sem[12].ate), "")}
  </div>
  ${menor.saldo < 0 ? `<div class="card aviso"><b>⚠ Atenção:</b> pelo previsto, o caixa fica negativo na semana de ${dataBR(menor.de)} (${brl0(menor.saldo)}). Antecipe recebimentos, renegocie ou programe aporte.</div>` : ""}
  <div class="grid g2">
    <div class="card"><h3>Projeção – próximas 13 semanas</h3><div class="chart-box"><canvas id="cFxP"></canvas></div>
      <p class="muted" style="font-size:12px">Barras: entradas e saídas previstas por semana · linha: saldo acumulado. ${usaMedia ? `Inclui a média das últimas 8 semanas da Logística (fretes ${brl0(mediaLog)} e custos fixos/variáveis ${brl0(despMediaLog)} por semana, sem diesel e juros – esses já entram pelas quinzenas do posto e pelas dívidas).` : ""}</p></div>
    <div class="card"><h3>Realizado – últimos 12 meses</h3><div class="chart-box"><canvas id="cFxR"></canvas></div>
      <p class="muted" style="font-size:12px">Operacional = receitas − despesas pagas. Financiamento = aportes e empréstimos recebidos − retiradas e pagamentos de empréstimo. Conta no caixa de quem pagou (ex.: obra da SkyFit paga pela Logística sai do caixa da Logística); o que o sócio pagou do bolso não entra.</p></div>
  </div>
  <div class="card" style="margin-top:14px"><h3>Semana a semana</h3><div class="tbl-wrap"><table>
    <tr><th>Semana</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Líquido</th><th class="num">Saldo acumulado</th><th>Principais contas</th></tr>
    ${venc.length ? `<tr class="grp"><td>Vencidos (antes de hoje)</td><td class="num">${brl0(soma(venc.filter(m => NAT[m.tipo][1] > 0), valCaixa))}</td><td class="num neg">${brl0(soma(venc.filter(m => NAT[m.tipo][1] < 0), valCaixa))}</td><td></td><td class="num">${brl0(saldo0)}</td><td style="font-size:12px">${venc.slice(0, 4).map(m => esc(m.descricao)).join(" · ")}</td></tr>` : ""}
    ${sem.map(w => `<tr><td>${dataBR(w.de).slice(0, 5)} a ${dataBR(w.ate).slice(0, 5)}</td><td class="num pos">${brl0(w.ent)}</td><td class="num neg">${brl0(w.sai)}</td><td class="num ${w.ent - w.sai < 0 ? "neg" : ""}">${brl0(w.ent - w.sai)}</td><td class="num ${w.saldo < 0 ? "neg" : ""}"><b>${brl0(w.saldo)}</b></td>
      <td style="font-size:12px">${w.itens.sort((a, b) => n(b.valor) - n(a.valor)).slice(0, 3).map(m => `<a href="#" data-mid="${m.id}">${esc(m.descricao)} (${brl0(m.valor)})</a>`).join(" · ")}</td></tr>`).join("")}
  </table></div></div>`;
  layout("fluxo", "Fluxo de caixa", corpo, `<select class="sel" id="fxEmp">${opts([["", "Empresas + holding"], ...empOpts().filter(([id]) => id !== "familia"), ["familia", "Família / Pessoal"]], f.emp, false)}</select>
    <label class="pill" style="cursor:pointer;display:flex;align-items:center;gap:6px"><input type="checkbox" id="fxMedia" ${f.media ? "checked" : ""}> média da Logística</label>`);
  document.getElementById("fxEmp").onchange = e => { f.emp = e.target.value; render(); };
  document.getElementById("fxMedia").onchange = e => { f.media = e.target.checked; render(); };
  document.getElementById("fxSaldo").onclick = e => { e.preventDefault();
    const v = prompt("Quanto há hoje em caixa/banco (somando as contas das empresas)? Fica salvo só neste aparelho.", String(lerSaldoInicial()).replace(".", ","));
    if (v !== null) { try { localStorage.setItem("gobbo_saldo_caixa", String(numBR(v) || 0)); } catch { /* */ } render(); } };
  document.querySelectorAll("a[data-mid]").forEach(a => a.onclick = e => { e.preventDefault(); editarMov(d.movimentos.find(m => m.id === a.dataset.mid)); });
  grafico("cFxP", { data: { labels: sem.map(w => dataBR(w.de).slice(0, 5)), datasets: [
    { type: "line", label: "Saldo acumulado", data: sem.map(w => w.saldo), borderColor: "#0b2e59", backgroundColor: "#0b2e59", tension: .25, yAxisID: "y" },
    { type: "bar", label: "Entradas", data: sem.map(w => w.ent), backgroundColor: "#2e9e4f", borderRadius: 4 },
    { type: "bar", label: "Saídas", data: sem.map(w => -w.sai), backgroundColor: "#c62828", borderRadius: 4 }] }, options: { scales: { y: eixoBRL } } });
  grafico("cFxR", { data: { labels: real.map(x => C.MES_AB[Number(x.ym.slice(5)) - 1] + "/" + x.ym.slice(2, 4)), datasets: [
    { type: "line", label: "Operacional líquido", data: real.map(x => x.ent - x.sai), borderColor: "#0b2e59", backgroundColor: "#0b2e59", tension: .25 },
    { type: "bar", label: "Entradas", data: real.map(x => x.ent), backgroundColor: "#2e9e4f", borderRadius: 4 },
    { type: "bar", label: "Saídas", data: real.map(x => -x.sai), backgroundColor: "#c62828", borderRadius: 4 },
    { type: "bar", label: "Financiamento (líq.)", data: real.map(x => x.fin), backgroundColor: "#c9a23f", borderRadius: 4 }] }, options: { scales: { y: eixoBRL } } });
}

// ---------------- busca rápida (Ctrl+K / ⌘K) ----------------
function abrirBusca() {
  if (!socio() || document.querySelector(".cmdk")) return;
  const m = document.createElement("div"); m.className = "modal cmdk";
  m.innerHTML = `<div class="box"><input class="inp" id="ckQ" placeholder="Buscar lançamento (descrição, valor, categoria) ou tela…" autocomplete="off"><div id="ckR" class="ck-res"></div>
    <p class="muted ck-dica">Enter abre o 1º resultado · Esc fecha · digite um valor (ex.: 1.084,02) para achar pelo valor</p></div>`;
  document.body.appendChild(m);
  const q = m.querySelector("#ckQ"), r = m.querySelector("#ckR"); let itens = [];
  const fechar = () => m.remove();
  m.addEventListener("click", e => { if (e.target === m) fechar(); });
  const telas = MENU_SOCIO.filter(([x]) => x !== "#sec").map(([rota, i, l]) => ({ t: "tela", rota, label: `${i} ${l}` }));
  const buscar = () => {
    const t = q.value.trim().toLowerCase(), v = numBR(t);
    const tl = telas.filter(x => !t || x.label.toLowerCase().includes(t)).slice(0, t ? 4 : 8);
    const ms = t.length < 2 ? [] : (D().movimentos || []).filter(m => (v && Math.abs(n(m.valor) - v) < 0.01) || [m.descricao, m.categoria, m.nota, curtoEmp(m.empresa_id)].join(" ").toLowerCase().includes(t))
      .sort((a, b) => b.data.localeCompare(a.data)).slice(0, 25);
    itens = [...tl, ...ms.map(m => ({ t: "mov", m }))];
    r.innerHTML = itens.map((x, i) => x.t === "tela" ? `<a href="#" data-i="${i}" class="ck-it"><span>${esc(x.label)}</span><span class="muted">tela</span></a>`
      : `<a href="#" data-i="${i}" class="ck-it"><span>${dataBR(x.m.data)} · ${chipEmp(x.m.empresa_id)} ${esc(x.m.descricao || "")}</span><span>${valorFmt(x.m)}</span></a>`).join("") || `<p class="muted" style="padding:10px">Nada encontrado.</p>`;
    r.querySelectorAll("[data-i]").forEach(a => a.onclick = e => { e.preventDefault(); ir(itens[a.dataset.i]); });
  };
  const ir = x => { if (!x) return; fechar(); if (x.t === "tela") location.hash = "#" + x.rota; else editarMov(x.m); };
  q.oninput = buscar; q.onkeydown = e => { if (e.key === "Escape") fechar(); if (e.key === "Enter") ir(itens[0]); };
  buscar(); q.focus();
}
document.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); abrirBusca(); }
});

// ---------------- roteamento ----------------
function render() {
  limparCharts();
  let rota = (location.hash || "#").slice(1) || (socio() ? "holding" : "kanban");
  if (!socio() && !["kanban", "acerto", "diario"].includes(rota)) rota = "kanban";
  ({ holding: viewHolding, fluxo: viewFluxo, conferir: viewConferir, empresa: viewEmpresa, contas: viewContas, livro: viewLivro, socios: viewSocios, dividas: viewDividas, menu: viewMenu,
    painel: viewPainel, kanban: viewKanban, fechamento: viewFechamento, lancamentos: viewLanc, relatorios: viewRel, cadastros: viewCad, acerto: viewAcerto, frota: viewFrota, diario: viewDiario }[rota] || viewPainel)();
}
window.addEventListener("hashchange", render);

// ---------------- entrada ----------------
function telaLogin(msg = "") {
  root.innerHTML = `<div class="login"><div class="box"><img src="icons/logo.svg" alt="${esc(EMPRESA)}"><h2>Plataforma de gestão</h2>
    <form id="fLogin"><div class="fld"><label for="em">E-mail</label><input id="em" type="email" autocomplete="username" required></div>
    <div class="fld"><label for="pw">Senha</label><input id="pw" type="password" autocomplete="current-password" required minlength="6"></div>
    <div class="fld hidden" id="nomeBox"><label for="nm">Seu nome</label><input id="nm" autocomplete="name"></div>
    <button class="btn pri" id="bEntrar">Entrar</button></form>
    <div class="alt"><a href="#" id="toggle">Primeiro acesso? Criar acesso</a></div>
    <div class="alt"><a href="#" id="demo">Ver demonstração com os dados de setembro</a></div>
    ${msg ? `<p class="note" style="color:var(--red)">${esc(msg)}</p>` : ""}
    <p class="note">Funciona no navegador e pode ser instalado: no celular use “Adicionar à tela inicial”.</p></div></div>`;
  let criando = false;
  document.getElementById("toggle").onclick = e => {
    e.preventDefault(); criando = !criando;
    document.getElementById("nomeBox").classList.toggle("hidden", !criando);
    document.getElementById("bEntrar").textContent = criando ? "Criar acesso" : "Entrar";
    e.target.textContent = criando ? "Já tenho acesso – entrar" : "Primeiro acesso? Criar acesso";
  };
  document.getElementById("demo").onclick = e => { e.preventDefault(); try { localStorage.setItem("gobbo_modo", "demo"); } catch { /* */ } iniciar(); };
  document.getElementById("fLogin").onsubmit = async e => {
    e.preventDefault();
    const em = document.getElementById("em").value.trim(), pw = document.getElementById("pw").value;
    try {
      if (criando) {
        const r = await db.cadastrar(document.getElementById("nm").value.trim() || em, em, pw);
        if (!r.session) return telaLogin("Acesso criado! Confirme pelo link enviado ao seu e-mail e depois entre.");
      } else await db.entrar(em, pw);
      iniciar();
    } catch (err) { telaLogin(traduzErro(err.message)); }
  };
}
const traduzErro = m => (/Invalid login/i.test(m) ? "E-mail ou senha incorretos." : /Email not confirmed/i.test(m) ? "Confirme seu e-mail pelo link recebido antes de entrar."
  : /already registered/i.test(m) ? "Este e-mail já tem acesso. Use “Entrar”." : m);

function telaSemBanco() {
  root.innerHTML = `<div class="login"><div class="box"><img src="icons/logo.svg" alt="${esc(EMPRESA)}"><h2>Banco de dados ainda não configurado</h2>
    <p class="note" style="text-align:left">O projeto Supabase está conectado, mas as tabelas ainda não foram criadas. No Supabase, abra <b>SQL Editor</b> e rode
    <b>supabase/schema.sql</b> (e depois <b>seed.sql</b> para carregar setembro).</p>
    <button class="btn pri" id="demo">Abrir demonstração</button><button class="btn" style="margin-top:8px" id="again">Tentar novamente</button></div></div>`;
  document.getElementById("demo").onclick = () => { try { localStorage.setItem("gobbo_modo", "demo"); } catch { /* */ } iniciar(); };
  document.getElementById("again").onclick = () => iniciar();
}

async function iniciar() {
  let demo = false;
  try { demo = localStorage.getItem("gobbo_modo") === "demo" || new URLSearchParams(location.search).has("demo"); } catch { /* */ }
  if (demo) {
    await db.iniciarDemo();
    S.perfil = { nome: "Demonstração", papel: "socio", motorista_id: D().motoristas[0]?.id }; // Diário simula o 1º motorista
    if (!D().fretes.length) toast("Demonstração sem dados (os dados da empresa não ficam no site público).");
    else S.ym = [...D().fretes].sort((a, b) => b.data.localeCompare(a.data))[0].data.slice(0, 7);
    db.aoMudar(() => render());
    return render();
  }
  try {
    if (!(await db.bancoPronto())) return telaSemBanco();
    const sessao = await db.sessaoAtual();
    if (!sessao) return telaLogin();
    S.perfil = await db.meuPerfil();
    await db.iniciarSupabase();
    db.aoMudar(() => { if (!document.querySelector(".modal")) render(); });
    render();
    autoBonus();
  } catch (e) {
    telaLogin("Sem conexão com o servidor: " + e.message);
  }
}

async function autoBonus() {
  const agora = new Date();
  if (!socio() || agora.getDay() !== 6 || agora.getHours() < 14) return;
  const pend = C.semanasBonus(D()).filter(x => !x.futuro && x.sabado === C.sabadoDe(hoje) && x.valor > 0 && !x.alerta && !x.desp);
  if (pend.length) await tentar(() => lancarBonus(), `Bônus de média da semana lançados (${pend.length})`);
}

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
iniciar();
