import * as db from "./db.js";
import * as C from "./calc.js";
import { EMPRESA } from "./config.js";

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
  const x = Number(t);
  return isFinite(x) ? x : null;
};
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
  else inp = `<input id="${id}" name="${f.k}" type="${f.type === "number" ? "text" : (f.type || "text")}" ${f.type === "number" ? 'inputmode="decimal" autocomplete="off"' : ""} value="${esc(f.type === "number" && v !== null && v !== undefined && v !== "" ? String(v).replace(".", ",") : v)}" ${f.list ? `list="dl_${f.k}"` : ""} ${f.required ? "required" : ""}>`
    + (f.list ? `<datalist id="dl_${f.k}">${f.list().map(x => `<option value="${esc(x)}">`).join("")}</datalist>` : "");
  return `<div class="fld ${f.full ? "full" : ""}"><label for="${id}">${esc(f.label)}</label>${inp}</div>`;
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
      out[f.k] = v === "" ? null : v;
    });
    const falta = campos.find(f => f.required && (out[f.k] === null || out[f.k] === undefined));
    if (falta) return toast(`Preencha “${falta.label}” corretamente.`, true);
    await tentar(async () => { await onSave(out); fechar(); }, "Salvo");
  };
  document.body.appendChild(m);
  m.querySelector("input,select,textarea")?.focus();
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
    ...(socio() ? [{ k: "semana_id", label: "Semana de fechamento", type: "select", opts: semOpts },
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
    { k: "km", label: "KM atual", type: "number" },
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
const TITULO = { fretes: "Frete", despesas: "Despesa / conta", recebimentos: "Recebimento", manutencoes: "Manutenção", acertos: "Acerto do motorista",
  motoristas: "Motorista", caminhoes: "Caminhão", semanas: "Semana de fechamento", tabela_fretes: "Cidade (tabela de fretes)", categorias: "Categoria" };
const NOVO = {
  fretes: () => ({ data: hoje, status: "agendado", tipo: "Entrega", motorista_id: S.perfil?.motorista_id || "" }),
  despesas: () => ({ competencia: hoje, vencimento: hoje, status: "a_pagar", forma: "PIX" }),
  recebimentos: () => ({ data: hoje, tipo: "PIX" }),
  manutencoes: () => ({ data: hoje, status: "solicitada" }),
  acertos: () => ({ competencia: S.ym + "-01", status: "aberto", fixo: 3500 }),
  motoristas: () => ({ fixo: 3500, media_ref: 200, ativo: "true" }),
  caminhoes: () => ({ situacao: "ativo" }),
  semanas: () => ({ status: "aberta" }), tabela_fretes: () => ({}), categorias: () => ({ grupo: C.GRUPOS[1], ordem: 99 }),
};
export function editar(tabela, reg) {
  const obj = reg ? { ...reg } : NOVO[tabela]();
  if (tabela === "motoristas" && obj.ativo !== undefined) obj.ativo = String(obj.ativo);
  const podeEditar = socio() || (tabela === "fretes" && (!reg || ["agendado", "em_rota", "entregue"].includes(reg.status)));
  if (!podeEditar) return toast("Somente sócios podem alterar este registro.", true);
  modal((reg ? "Editar " : "Novo ") + TITULO[tabela].toLowerCase(), FORM[tabela](), obj, async out => {
    if (tabela === "motoristas") out.ativo = out.ativo === "true";
    if (tabela === "fretes") {
      if (!socio()) out.motorista_id = S.perfil?.motorista_id;
      if (!out.caminhao_id) out.caminhao_id = D().motoristas.find(m => m.id === out.motorista_id)?.caminhao_id || null;
      if (!out.semana_id) out.semana_id = D().semanas.find(s => out.data >= s.inicio && out.data <= s.fim)?.id || null;
    }
    if (tabela === "despesas" && out.status === "pago" && !out.pagamento) out.pagamento = hoje;
    await db.salvar(tabela, out);
  }, reg && socio() ? () => db.excluir(tabela, reg.id) : null);
}

// ---------------- layout ----------------
const MENU_SOCIO = [
  ["painel", "📊", "Painel"], ["kanban", "🗂️", "Kanban"], ["lancamentos", "🧾", "Lançamentos"],
  ["relatorios", "📈", "Relatórios"], ["cadastros", "⚙️", "Cadastros"],
];
const MENU_MOT = [["kanban", "🗂️", "Minhas viagens"], ["acerto", "💰", "Meu acerto"]];
function layout(rota, titulo, corpo, acoes = "") {
  const menu = socio() ? MENU_SOCIO : MENU_MOT;
  root.innerHTML = `<div class="app">
    <aside class="side"><div class="brand"><img src="icons/logo.png" alt="${esc(EMPRESA)}"></div>
      <nav>${menu.map(([r, i, l]) => `<a href="#${r}" class="${r === rota ? "on" : ""}"><span>${i}</span>${l}</a>`).join("")}</nav>
      <div class="user">${esc(S.perfil?.nome || "Demonstração")}<br><span class="muted">${db.getModo() === "demo" ? "modo demonstração" : esc(S.perfil?.papel || "")}</span><br>
      <button id="sair">${db.getModo() === "demo" ? "Sair da demonstração" : "Sair"}</button></div></aside>
    <main><div class="mobile-top"><img src="icons/logo.png" alt=""><button class="btn sm" id="sair2">Sair</button></div>
      <div class="topbar"><h1>${esc(titulo)}</h1>${db.getModo() === "demo" ? '<span class="demo-flag">DEMONSTRAÇÃO</span>' : ""}${acoes}</div>
      ${corpo}</main>
    <nav class="bottom">${menu.map(([r, i, l]) => `<a href="#${r}" class="${r === rota ? "on" : ""}"><span class="i">${i}</span>${l.split(" ")[0]}</a>`).join("")}</nav>
  </div>`;
  const out = async () => {
    if (db.getModo() === "demo") { try { localStorage.removeItem("gobbo_modo"); } catch { /* */ } }
    await db.sair(); location.hash = ""; location.reload();
  };
  document.getElementById("sair").onclick = out;
  document.getElementById("sair2").onclick = out;
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
    .filter(f => socio() || f.motorista_id === S.perfil?.motorista_id)
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
    (S.kanban === "fretes" || S.kanban === "contas" ? seletorMes() : "") + `<button class="btn pri" id="novo">+ Novo</button>`);
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
  layout("lancamentos", "Lançamentos – " + mesLabel(S.ym), corpo, seletorMes() + `<button class="btn pri" id="novo">+ Novo</button>`);
  ligarMes();
  document.querySelectorAll(".tabs button").forEach(bt => bt.onclick = () => { S.lanc = bt.dataset.k; S.busca = ""; render(); });
  const bi = document.getElementById("busca");
  bi.oninput = () => { S.busca = bi.value; const pos = bi.selectionStart; render(); const nb = document.getElementById("busca"); nb.focus(); nb.setSelectionRange(pos, pos); };
  document.getElementById("novo").onclick = () => editar(S.lanc);
  document.querySelectorAll("tr.clk").forEach(tr => tr.onclick = () => editar(S.lanc, D()[S.lanc].find(x => x.id === tr.dataset.id)));
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
      <tr><td>Saldo inicial de caixa (01/jan)</td><td class="num">${brl(cfg.saldo_inicial)}</td></tr></table>
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
    { k: "saldo_inicial", label: "Saldo inicial de caixa", type: "number" }], { ...(D().config[0] || { id: "geral" }) }, out => db.salvar("config", out));
  const rd = document.getElementById("resetDemo");
  if (rd) rd.onclick = () => { if (confirm("Voltar a demonstração aos dados originais de setembro?")) { db.reiniciarDemo(); location.reload(); } };
}

// ---------------- roteamento ----------------
function render() {
  limparCharts();
  let rota = (location.hash || "#").slice(1) || (socio() ? "painel" : "kanban");
  if (!socio() && !["kanban", "acerto"].includes(rota)) rota = "kanban";
  ({ painel: viewPainel, kanban: viewKanban, lancamentos: viewLanc, relatorios: viewRel, cadastros: viewCad, acerto: viewAcerto }[rota] || viewPainel)();
}
window.addEventListener("hashchange", render);

// ---------------- entrada ----------------
function telaLogin(msg = "") {
  root.innerHTML = `<div class="login"><div class="box"><img src="icons/logo.png" alt="${esc(EMPRESA)}"><h2>Plataforma de gestão</h2>
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
  root.innerHTML = `<div class="login"><div class="box"><img src="icons/logo.png" alt=""><h2>Banco de dados ainda não configurado</h2>
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
    S.perfil = { nome: "Demonstração", papel: "socio" };
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
  } catch (e) {
    telaLogin("Sem conexão com o servidor: " + e.message);
  }
}

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
iniciar();
