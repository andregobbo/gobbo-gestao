// Cálculos da holding Gobbo Participações (várias empresas, sócios, livro-caixa único).
// Sinal dos saldos sócio × empresa: positivo = a empresa deve ao sócio; negativo = o sócio deve à empresa.

export const SOCIOS_ID = ["andre", "nicolas", "leonardo"];
export const TIPOS = [
  ["receita", "Receita"], ["despesa", "Despesa"], ["aporte", "Aporte de sócio"], ["retirada", "Retirada / devolução ao sócio"],
  ["emprestimo_entrada", "Empréstimo recebido"], ["emprestimo_pagamento", "Pagamento de empréstimo"],
  ["socio_socio", "Entre sócios"], ["transferencia", "Transferência entre empresas"], ["saldo_inicial", "Saldo inicial (empresa deve ao sócio)"],
];
export const TIPO_NOME = Object.fromEntries(TIPOS);
export const STATUS = [["pago", "Pago / realizado"], ["a_pagar", "A pagar"], ["previsto", "Previsto"]];
export const TAXA_MAQUINA = 0.0899;

const n = v => (v === null || v === undefined || v === "" ? 0 : Number(v));
const isSocio = x => SOCIOS_ID.includes(x);

export function corte(D) {
  return (D.config?.[0]?.corte_saldo_logistica) || "2024-05-03";
}

// Efeitos de um lançamento no saldo sócio × empresa: [[empresa, socio, valor]]
export function efeitos(m) {
  const v = n(m.valor), bruto = n(m.valor_bruto) || v, e = m.empresa_id, p = m.pago_por, s = m.socio_id, out = [];
  if (!e) return out;
  if (m.status && m.status !== "pago") return out;
  switch (m.tipo) {
    case "saldo_inicial": if (s) out.push([e, s, v]); break;
    case "aporte": if (s) out.push([e, s, bruto]); if (p && !isSocio(p) && s) out.push([p, s, -bruto]); break;
    case "retirada": if (s) out.push([e, s, -v]); if (isSocio(p)) out.push([e, p, v]); break;
    case "despesa": case "emprestimo_pagamento": case "transferencia": if (isSocio(p)) out.push([e, p, v]); break;
    case "receita": case "emprestimo_entrada": if (isSocio(p)) out.push([e, p, -v]); break;
  }
  return out;
}

export function saldosSocioEmpresa(D) {
  const c = corte(D), r = {};
  (D.movimentos || []).forEach(m => {
    efeitos(m).forEach(([e, s, v]) => {
      if (e === "logistica" && m.data < c && m.tipo !== "saldo_inicial") return; // antes do fechamento oficial de 02/05/2024
      r[e] = r[e] || {}; r[e][s] = (r[e][s] || 0) + v;
    });
  });
  return r;
}

// Entre sócios: deve[a][b] = quanto a deve a b (líquido)
export function saldosEntreSocios(D) {
  const bruto = {};
  (D.movimentos || []).filter(m => m.tipo === "socio_socio" && m.socio_id && m.socio_destino_id && (!m.status || m.status === "pago"))
    .forEach(m => { const k = m.socio_destino_id + ">" + m.socio_id; bruto[k] = (bruto[k] || 0) + n(m.valor); });
  const par = (a, b) => (bruto[a + ">" + b] || 0) - (bruto[b + ">" + a] || 0);
  return [["andre", "nicolas"], ["andre", "leonardo"], ["leonardo", "nicolas"]].map(([a, b]) => ({ a, b, valor: par(a, b) }));
}

export function extratoSocio(D, s) {
  const c = corte(D), lin = [];
  (D.movimentos || []).forEach(m => {
    efeitos(m).filter(x => x[1] === s).forEach(([e, , v]) => {
      if (e === "logistica" && m.data < c && m.tipo !== "saldo_inicial") return;
      lin.push({ m, empresa: e, valor: v });
    });
    if (m.tipo === "socio_socio" && (m.socio_id === s || m.socio_destino_id === s)) lin.push({ m, empresa: null, valor: m.socio_id === s ? n(m.valor) : -n(m.valor), outro: m.socio_id === s ? m.socio_destino_id : m.socio_id });
  });
  return lin.sort((a, b) => a.m.data.localeCompare(b.m.data));
}

// Resultado (DRE gerencial) de uma empresa num período (ano 'YYYY' ou mês 'YYYY-MM' ou '' = tudo)
export function resultado(D, emp, periodo = "") {
  const ms = (D.movimentos || []).filter(m => (!emp || m.empresa_id === emp) && (!periodo || m.data.startsWith(periodo)) && (!m.status || m.status === "pago"));
  const soma = (f) => ms.filter(f).reduce((s, m) => s + n(m.valor), 0);
  const receitas = soma(m => m.tipo === "receita");
  const despesas = soma(m => m.tipo === "despesa");
  const juros = soma(m => m.tipo === "despesa" && /juros|antecipa/i.test(m.categoria || ""));
  const aportes = ms.filter(m => m.tipo === "aporte").reduce((s, m) => s + n(m.valor_bruto || m.valor), 0);
  const retiradas = soma(m => m.tipo === "retirada");
  const empIn = soma(m => m.tipo === "emprestimo_entrada"), empOut = soma(m => m.tipo === "emprestimo_pagamento");
  const porCat = {};
  ms.filter(m => m.tipo === "despesa").forEach(m => { const k = m.categoria || "Sem categoria"; porCat[k] = (porCat[k] || 0) + n(m.valor); });
  const recCat = {};
  ms.filter(m => m.tipo === "receita").forEach(m => { const k = m.categoria || "Sem categoria"; recCat[k] = (recCat[k] || 0) + n(m.valor); });
  return { receitas, despesas, resultado: receitas - despesas, juros, aportes, retiradas, empIn, empOut, porCat, recCat, n: ms.length };
}

export function porMes(D, emp, ano) {
  return Array.from({ length: 12 }, (_, i) => {
    const ym = ano + "-" + String(i + 1).padStart(2, "0");
    return { ym, ...resultado(D, emp, ym) };
  });
}

// Quem pagou por quem entre empresas: deve[a][b] = empresa a deve à empresa b
export function entreEmpresas(D) {
  const r = {};
  (D.movimentos || []).forEach(m => {
    const p = m.pago_por;
    if (!p || isSocio(p) || p === m.empresa_id || !m.empresa_id || (m.status && m.status !== "pago")) return;
    const sinal = ["receita", "emprestimo_entrada"].includes(m.tipo) ? -1 : 1;
    if (m.tipo === "aporte") return; // tratado no saldo do sócio
    const k = m.empresa_id + ">" + p; r[k] = (r[k] || 0) + sinal * n(m.valor);
  });
  return Object.entries(r).map(([k, v]) => { const [a, b] = k.split(">"); return { deve: a, credor: b, valor: v }; }).filter(x => Math.abs(x.valor) > 0.5);
}

export function dividasResumo(D) {
  return (D.dividas || []).map(d => {
    const ms = (D.movimentos || []).filter(m => m.divida_id === d.id);
    const entrou = ms.filter(m => m.tipo === "emprestimo_entrada").reduce((s, m) => s + n(m.valor), 0);
    const pago = ms.filter(m => m.tipo === "emprestimo_pagamento").reduce((s, m) => s + n(m.valor), 0);
    const juros = ms.filter(m => m.tipo === "despesa").reduce((s, m) => s + n(m.valor), 0);
    const principal = n(d.principal) || entrou;
    return { d, entrou, pago, juros, saldo: d.status === "quitada" ? 0 : principal - pago, ms };
  });
}

export function colunaConta(m, hoje) {
  if (m.status === "pago") return "paga";
  const v = m.vencimento || m.data;
  if (!v) return "a_vencer";
  if (v < hoje) return "vencida";
  const lim = new Date(hoje + "T12:00:00"); lim.setDate(lim.getDate() + 7);
  return v <= lim.toISOString().slice(0, 10) ? "prox7" : "a_vencer";
}

// Importação: aceita o JSON gerado na revisão do WhatsApp (lista de lançamentos)
export function validarImport(rows) {
  if (!Array.isArray(rows)) throw new Error("O arquivo precisa conter uma lista de lançamentos.");
  const ok = rows.filter(r => r && r.data && r.tipo && r.origem_ref);
  if (!ok.length) throw new Error("Nenhum lançamento válido no arquivo.");
  return ok;
}
