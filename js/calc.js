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

// =====================================================================
// v2 – Frota: consumo, custo por km, preventiva e alertas
// (indicadores usados por Cobli, Sofit, Infleet e TMS de mercado)
// =====================================================================
export function kmAtual(D, cam) {
  const ks = (D.abastecimentos || []).filter(a => a.caminhao_id === cam.id).map(a => n(a.km));
  (D.checklists || []).filter(c => c.caminhao_id === cam.id && c.km).forEach(c => ks.push(n(c.km)));
  return Math.max(n(cam.km), ...ks, 0);
}

// Por caminhão no mês: km rodado, litros, km/L, custo/km, faturamento/km
export function frotaMes(D, ym) {
  return (D.caminhoes || []).filter(c => c.situacao !== "vendido").map(c => {
    const ab = (D.abastecimentos || []).filter(a => a.caminhao_id === c.id && n(a.km) > 0).sort((a, b) => n(a.km) - n(b.km));
    const doMes = ab.filter(a => noMes(a.data, ym));
    const antes = ab.filter(a => a.data < ym + "-01");
    const kmIni = antes.length ? n(antes[antes.length - 1].km) : (doMes.length ? n(doMes[0].km) : 0);
    const kmFim = doMes.length ? n(doMes[doMes.length - 1].km) : kmIni;
    const km = Math.max(0, kmFim - kmIni);
    // litros: se não há abastecimento anterior, o primeiro do mês só "zera" o tanque
    const litros = soma(antes.length ? doMes : doMes.slice(1), a => a.litros);
    const valorComb = soma((D.abastecimentos || []).filter(a => a.caminhao_id === c.id && noMes(a.data, ym)), a => a.valor);
    const fat = soma(D.fretes.filter(f => f.caminhao_id === c.id && noMes(f.data, ym)), f => f.valor);
    const custoDireto = soma(D.despesas.filter(d => d.caminhao_id === c.id && noMes(d.competencia, ym)), d => d.valor);
    const kml = litros ? km / litros : 0;
    return { c, km, litros, kml, meta: n(c.meta_km_l), valorComb, fat, custoDireto,
      custoKm: km ? (custoDireto + valorComb) / km : 0, fatKm: km ? fat / km : 0,
      desvio: c.meta_km_l && kml ? kml / n(c.meta_km_l) - 1 : null, nAbast: doMes.length };
  });
}

export function statusPlano(D, p) {
  const cam = (D.caminhoes || []).find(c => c.id === p.caminhao_id);
  const km = cam ? kmAtual(D, cam) : 0;
  const hoje = hojeISO();
  const proxKm = p.intervalo_km && p.ultimo_km !== null && p.ultimo_km !== undefined ? n(p.ultimo_km) + n(p.intervalo_km) : null;
  const proxData = p.intervalo_dias && p.ultima_data ? addDias(p.ultima_data, n(p.intervalo_dias)) : null;
  const faltaKm = proxKm !== null && km ? proxKm - km : null;
  const faltaDias = proxData ? Math.round((new Date(proxData) - new Date(hoje)) / 86400000) : null;
  let st = "ok";
  if ((faltaKm !== null && faltaKm <= 0) || (faltaDias !== null && faltaDias <= 0)) st = "vencida";
  else if ((faltaKm !== null && faltaKm <= Math.max(1000, n(p.intervalo_km) * 0.1)) || (faltaDias !== null && faltaDias <= 15)) st = "proxima";
  return { cam, km, proxKm, proxData, faltaKm, faltaDias, st };
}

export function alertas(D) {
  const hoje = hojeISO(), out = [];
  const add = (nivel, texto, rota) => out.push({ nivel, texto, rota });
  (D.caminhoes || []).filter(c => c.situacao === "ativo").forEach(c => {
    [["venc_seguro", "Seguro"], ["venc_licenciamento", "Licenciamento"]].forEach(([k, l]) => {
      if (!c[k]) add("info", `${l} do ${c.nome} sem data cadastrada`, "frota");
      else {
        const dias = Math.round((new Date(c[k]) - new Date(hoje)) / 86400000);
        if (dias < 0) add("alto", `${l} do ${c.nome} VENCIDO em ${dataBR(c[k])}`, "frota");
        else if (dias <= 30) add("medio", `${l} do ${c.nome} vence em ${dias} dias (${dataBR(c[k])})`, "frota");
      }
    });
  });
  (D.planos_manutencao || []).forEach(p => {
    const s = statusPlano(D, p);
    const nome = s.cam?.nome || "frota";
    if (s.st === "vencida") add("alto", `Preventiva vencida: ${p.item} – ${nome}`, "frota");
    else if (s.st === "proxima") add("medio", `Preventiva próxima: ${p.item} – ${nome}${s.faltaKm !== null ? ` (faltam ${s.faltaKm.toLocaleString("pt-BR")} km)` : ""}`, "frota");
  });
  const venc = D.despesas.filter(d => d.status !== "pago" && d.vencimento && d.vencimento < hoje);
  if (venc.length) add("alto", `${venc.length} conta(s) vencida(s): ${brl(soma(venc, d => d.valor))}`, "kanban");
  const p7 = D.despesas.filter(d => d.status !== "pago" && d.vencimento && d.vencimento >= hoje && d.vencimento <= addDias(hoje, 7));
  if (p7.length) add("medio", `${p7.length} conta(s) vencem em 7 dias: ${brl(soma(p7, d => d.valor))}`, "kanban");
  (D.acertos || []).filter(a => a.status !== "pago" && (a.comissao === null || a.comissao === undefined))
    .forEach(a => add("medio", `Comissão pendente no acerto de ${a.motorista_nome || "motorista"} (${a.competencia.slice(5, 7)}/${a.competencia.slice(0, 4)})`, "kanban"));
  (D.semanas || []).filter(s => s.status === "aberta" && s.fim < hoje)
    .forEach(s => add("medio", `Semana ${s.codigo} terminou e ainda não tem fechamento da Levíssima`, "relatorios"));
  (D.checklists || []).filter(c => c.status === "atencao")
    .forEach(c => add("alto", `Checklist com problema (${dataBR(c.data)}): ${c.problemas || "ver detalhes"}`, "frota"));
  (D.fretes || []).filter(f => !f.cidade || f.cidade === "A CONFIRMAR")
    .slice(0, 1).forEach(() => add("info", "Há fretes com cidade “A CONFIRMAR”", "lancamentos"));
  const ordem = { alto: 0, medio: 1, info: 2 };
  return out.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}

export const CHECK_ITENS = ["Pneus e estepe", "Óleo e água", "Freios", "Luzes e setas", "Tacógrafo", "Documentos (CRLV, CNH)",
  "Amarração / sider", "Extintor e triângulo", "Vazamentos", "Limpeza da cabine"];

export function csv(linhas) {
  const q = v => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + linhas.map(l => l.map(q).join(";")).join("\r\n");
}

// =====================================================================
// v3 – Bônus semanal por média km/L (sábado a sexta; paga no sábado seguinte)
// =====================================================================
export function faixasBonus(D) {
  const c = (D.config || [])[0] || {};
  return { f1: n(c.bonus_faixa1_km_l) || 3.5, v1: c.bonus_faixa1_valor ?? 150, f2: n(c.bonus_faixa2_km_l) || 3.8, v2: c.bonus_faixa2_valor ?? 200 };
}
export function valorBonus(D, media) {
  const f = faixasBonus(D);
  return media >= f.f2 ? n(f.v2) : media >= f.f1 ? n(f.v1) : 0;
}
export function sabadoDe(iso) { // sábado da semana de pagamento (o próprio dia, se for sábado)
  const d = new Date(iso + "T12:00:00"); const back = (d.getDay() + 1) % 7; d.setDate(d.getDate() - back); return d.toISOString().slice(0, 10);
}
export function mediaSemana(D, motoristaId, sabadoPgto) {
  const ini = addDias(sabadoPgto, -7), fim = addDias(sabadoPgto, -1);
  const ab = (D.abastecimentos || []).filter(a => a.motorista_id === motoristaId && a.km);
  const antes = ab.filter(a => a.data < ini).map(a => n(a.km));
  const dentro = ab.filter(a => a.data >= ini && a.data <= fim);
  if (!antes.length || !dentro.length) return { ini, fim, km: 0, litros: 0, media: 0, valor: 0, semDados: true };
  const km = Math.max(...dentro.map(a => n(a.km))) - Math.max(...antes);
  const litros = soma(dentro, a => a.litros);
  const media = litros ? Math.round(km / litros * 100) / 100 : 0;
  const alerta = media > 5 || media < 2 ? "Média fora do normal – confira se falta abastecimento ou KM digitado errado" : null;
  return { ini, fim, km, litros, media, valor: alerta ? 0 : valorBonus(D, media), alerta, n: dentro.length };
}
export function semanasBonus(D) {
  const ab = (D.abastecimentos || []).filter(a => a.km);
  if (!ab.length) return [];
  const primeiro = ab.map(a => a.data).sort()[0];
  const out = [];
  let sab = addDias(sabadoDe(primeiro), 7);
  const lim = addDias(sabadoDe(hojeISO()), 7);
  while (sab <= lim) {
    (D.motoristas || []).filter(m => m.ativo !== false).forEach(m => {
      const r = mediaSemana(D, m.id, sab);
      if (r.semDados) return;
      const reg = (D.bonus_media || []).find(b => b.semana_ini === r.ini && b.motorista_id === m.id);
      const desp = reg?.despesa_id ? (D.despesas || []).find(d => d.id === reg.despesa_id) : null;
      out.push({ sabado: sab, m, ...r, reg, desp, futuro: sab > hojeISO() });
    });
    sab = addDias(sab, 7);
  }
  return out.reverse();
}
