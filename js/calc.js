// Regras de negócio e cálculos (mesma lógica da planilha Gestao_Gobbo_Logistica_2026.xlsx).

export const GRUPO_SOCIOS = "Movimentação com sócios";
export const GRUPOS = ["Impostos sobre receita", "Custos variáveis", "Pessoal (motoristas)",
  "Despesas fixas e administrativas", "Financiamentos e investimentos", GRUPO_SOCIOS];
export const FORA_DO_CAIXA_DESP = ["Pago por sócio", "Abatimento"];
export const FORA_DO_CAIXA_REC = ["Abatimento", "Crédito anterior", "Aporte via cartão (bruto)", "Recebido por sócio"];
export const FORMAS = ["PIX", "Boleto", "Cheque", "Dinheiro", "Transferência", "Cartão de crédito", "Cartão de débito",
  "Débito automático", "Pago por sócio", "Abatimento", "Outro"];
export const TIPOS_FRETE = ["Entrega", "Retorno ATB", "Retorno", "Paletes", "Devolução"];
export const TIPOS_REC = ["PIX", "Transferência", "Cheque", "Dinheiro", "Adiantamento", "Aporte de sócio",
  "Aporte via cartão (bruto)", "Recebido por sócio", "Abatimento", "Crédito anterior", "Outro"];
export const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro",
  "Outubro", "Novembro", "Dezembro"];
export const MES_AB = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export const n = v => (v === null || v === undefined || v === "" ? 0 : Number(v));
export const soma = (arr, f = x => x) => arr.reduce((s, x) => s + n(f(x)), 0);
export const brl = v => n(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const brl0 = v => n(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const pct = v => (isFinite(v) ? (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "–");
export const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const dataBR = s => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "");
export const addDias = (iso, d) => { const x = new Date(iso + "T12:00:00"); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
export const mesDe = iso => (iso || "").slice(0, 7); // 'YYYY-MM'
export const noMes = (iso, ym) => mesDe(iso) === ym;

export function grupoDe(D, categoria) {
  const c = (D.categorias || []).find(x => x.nome === categoria);
  return c ? c.grupo : "Sem grupo";
}
export const ehSocio = (D, d) => grupoDe(D, d.categoria) === GRUPO_SOCIOS;

// ---------------- mês ----------------
export function resumoMes(D, ym) {
  const fretes = D.fretes.filter(f => noMes(f.data, ym));
  const desp = D.despesas.filter(d => noMes(d.competencia, ym));
  const oper = desp.filter(d => !ehSocio(D, d));
  const socios = desp.filter(d => ehSocio(D, d));
  const fat = soma(fretes, f => f.valor);
  const custo = soma(oper, d => d.valor);
  const hoje = hojeISO();
  const aPagar = D.despesas.filter(d => d.status !== "pago");
  const entradas = D.recebimentos.filter(r => noMes(r.data, ym) && !FORA_DO_CAIXA_REC.includes(r.tipo));
  const saidas = D.despesas.filter(d => d.status === "pago" && !FORA_DO_CAIXA_DESP.includes(d.forma) && noMes(d.pagamento || d.competencia, ym));
  return {
    fretes, fat, custo, lucro: fat - custo, margem: fat ? (fat - custo) / fat : 0,
    socios: soma(socios, d => d.valor), nFretes: fretes.length,
    aPagar: soma(aPagar, d => d.valor),
    vencidas: soma(aPagar.filter(d => d.vencimento && d.vencimento < hoje), d => d.valor),
    prox7: soma(aPagar.filter(d => d.vencimento && d.vencimento >= hoje && d.vencimento <= addDias(hoje, 7)), d => d.valor),
    aReceber: aReceberTotal(D),
    entradas: soma(entradas, r => r.valor), saidas: soma(saidas, d => d.valor),
    porGrupo: GRUPOS.map(g => ({ grupo: g, valor: soma(desp.filter(d => grupoDe(D, d.categoria) === g), d => d.valor) })),
  };
}

export function porMotorista(D, ym) {
  return D.motoristas.map(m => {
    const fr = D.fretes.filter(f => f.motorista_id === m.id && noMes(f.data, ym));
    const fat = soma(fr, f => f.valor);
    const custo = soma(D.despesas.filter(d => d.motorista_id === m.id && noMes(d.competencia, ym)), d => d.valor);
    const dias = new Set(fr.map(f => f.data)).size;
    return { m, n: fr.length, dias, fat, custo, res: fat - custo, ticket: fr.length ? fat / fr.length : 0 };
  });
}

export function porCaminhao(D, ym) {
  return D.caminhoes.map(c => {
    const fat = soma(D.fretes.filter(f => f.caminhao_id === c.id && noMes(f.data, ym)), f => f.valor);
    const custo = soma(D.despesas.filter(d => d.caminhao_id === c.id && noMes(d.competencia, ym)), d => d.valor);
    return { c, fat, custo, res: fat - custo, margem: fat ? (fat - custo) / fat : 0 };
  });
}

export function acumuladoDiario(D, ym) {
  const [y, m] = ym.split("-").map(Number);
  const dias = new Date(y, m, 0).getDate();
  let a = 0, b = 0;
  const out = [];
  for (let d = 1; d <= dias; d++) {
    const iso = `${ym}-${String(d).padStart(2, "0")}`;
    a += soma(D.fretes.filter(f => f.data === iso), f => f.valor);
    b += soma(D.despesas.filter(x => x.competencia === iso && !ehSocio(D, x)), x => x.valor);
    out.push({ dia: d, fat: a, desp: b });
  }
  return out;
}

// ---------------- semanas / a receber ----------------
export function semanaInfo(D, s) {
  const faturado = soma(D.fretes.filter(f => f.semana_id === s.id), f => f.valor);
  const recebido = soma(D.recebimentos.filter(r => r.semana_id === s.id), r => r.valor);
  const base = s.total_oficial !== null && s.total_oficial !== undefined && s.total_oficial !== "" ? n(s.total_oficial) : faturado;
  return { faturado, recebido, saldo: base - recebido, base };
}
export function aReceberTotal(D) {
  return soma(D.semanas, s => Math.max(0, semanaInfo(D, s).saldo));
}

// ---------------- ano ----------------
export function resumoAno(D, ano) {
  return MESES.map((_, i) => {
    const ym = `${ano}-${String(i + 1).padStart(2, "0")}`;
    const r = resumoMes(D, ym);
    return { ym, mes: MES_AB[i], fat: r.fat, custo: r.custo, lucro: r.lucro, socios: r.socios,
      entradas: r.entradas, saidas: r.saidas, porGrupo: r.porGrupo };
  });
}

export function dre(D, ano) {
  const linhas = [];
  const meses = MESES.map((_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
  const fat = meses.map(ym => soma(D.fretes.filter(f => noMes(f.data, ym)), f => f.valor));
  linhas.push({ tipo: "total", nome: "Receita bruta de fretes", v: fat });
  const acum = fat.slice();
  const grupoVals = {};
  GRUPOS.forEach(g => {
    const cats = D.categorias.filter(c => c.grupo === g).sort((a, b) => n(a.ordem) - n(b.ordem));
    const gv = meses.map(ym => soma(D.despesas.filter(d => noMes(d.competencia, ym) && grupoDe(D, d.categoria) === g), d => d.valor));
    grupoVals[g] = gv;
    linhas.push({ tipo: "grupo", nome: "(−) " + g, v: gv });
    cats.forEach(c => {
      const cv = meses.map(ym => soma(D.despesas.filter(d => noMes(d.competencia, ym) && d.categoria === c.nome), d => d.valor));
      if (cv.some(x => x)) linhas.push({ tipo: "item", nome: c.nome, v: cv });
    });
    if (g !== GRUPO_SOCIOS) gv.forEach((x, i) => { acum[i] -= x; });
    if (g === "Financiamentos e investimentos") linhas.push({ tipo: "resultado", nome: "(=) Lucro líquido", v: acum.slice() });
  });
  linhas.push({ tipo: "total", nome: "(=) Resultado após sócios", v: acum.map((x, i) => x - grupoVals[GRUPO_SOCIOS][i]) });
  return linhas;
}

// ---------------- acertos ----------------
export function acertoCalc(a) {
  const total = n(a.fixo) + n(a.comissao) + n(a.media) + n(a.pernoite) + n(a.extras);
  return { total, saldo: total - n(a.vales) - n(a.media_paga) };
}

// ---------------- contas a pagar (colunas do kanban) ----------------
export function colunaConta(d) {
  const hoje = hojeISO();
  if (d.status === "pago") return "paga";
  if (!d.vencimento) return "a_vencer";
  if (d.vencimento < hoje) return "vencida";
  if (d.vencimento <= addDias(hoje, 7)) return "prox7";
  return "a_vencer";
}
