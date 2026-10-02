# Gobbo – Plataforma de Gestão (Holding + empresas)

Aplicativo web instalável (PWA) para Android, iOS, Windows e Mac, com Kanban, painéis e lançamentos.
Backend: Supabase (banco, login, tempo real). Código: GitHub. Publicação: GitHub Pages.

## Status (30/09/2026)

| Parte | Situação |
|---|---|
| `data/demo.json` – dados de setembro (76 fretes, 102 despesas, 22 recebimentos, 4 acertos, 10 manutenções, cadastros) | ✅ pronto |
| `supabase/schema.sql` – tabelas, permissões (sócio × motorista), tempo real | ✅ pronto (não testado no Supabase ainda) |
| `supabase/seed.sql` – carga inicial dos dados | ✅ pronto |
| `tools/gerar_dados.py` – regenera demo.json/seed.sql a partir de `tools/origem/` | ✅ pronto |
| App (index.html, telas, Kanban, painéis, PWA, login) | ⏳ a fazer |
| Repositório GitHub + GitHub Pages | ⏳ a fazer (depende da sua conta) |

## O que a plataforma faz

Inspirada nos sistemas líderes do mercado (TMS brasileiros como Bsoft, Senior e Omie; gestão de frota como Cobli, Sofit,
Infleet e Prolog; apps de motorista como Trizy e Diário de Bordo), adaptada à rotina da Gobbo (fechamentos semanais com a
Levíssima, acerto mensal dos motoristas, aportes dos sócios).

| Módulo | Destaques |
|---|---|
| **Painel** | Faturamento, despesas operacionais, lucro, caixa, a receber, a pagar; central de alertas; custo/km, consumo e faturamento/km |
| **Kanban** | Fretes (agendado → recebido), contas a pagar (a vencer → vencida → paga), manutenção da frota, acertos dos motoristas — arrastar e soltar, inclusive no celular |
| **Frota** | Indicadores por caminhão (km, litros, km/L × meta, custo/km, fat./km), abastecimentos, manutenção preventiva por km/data, checklists, documentos (seguro/licenciamento) |
| **Diário de bordo (motorista)** | Registrar viagem, abastecimento (KM + litros) e checklist antes de sair; ver o próprio acerto |
| **Lançamentos** | Fretes, despesas e recebimentos do mês, busca e exportação CSV para o contador |
| **Relatórios** | DRE mensal/anual, fluxo de caixa, resumo anual, fechamentos semanais (faturado × oficial × recebido), folha dos motoristas |
| **Cadastros** | Motoristas, frota, tabela de fretes, categorias, usuários (sócio/motorista), configurações |

Regras: despesas “Pago por sócio” e “Abatimento” entram na DRE mas não saem do caixa; movimentação com sócios fica fora do lucro;
abastecimentos são registro operacional (o valor do diesel entra pelo acerto do posto, em Despesas).

## Holding Gobbo Investimentos (Gobbo Participações e Investimentos) – empresa principal, dona de todas as outras (v4)

Uma plataforma para todas as empresas e para os três sócios (André, Nicolas, Leonardo):

| Empresa | O que entra |
|---|---|
| Gobbo Participações e Investimentos (holding) | Arrendamento recebido da Levíssima, empréstimos de terceiros (Rogério, Alessandro, Equipe Bombas, Luís), custo do dinheiro |
| Gobbo Logística | Caminhões, fretes, diesel, manutenção, motoristas (telas da seção “Gobbo Logística”) |
| SkyFit Campo Limpo Paulista | Academia aberta em fev/2026 |
| SkyFit Francisco Morato | Academia em obra (inauguração prevista nov–dez) |
| Família / Pessoal | Kátia, pai, imóveis (apto, terreno), consórcios |

Telas da seção **Holding**: Visão geral, Empresas (DRE mês a mês), Contas (Kanban a pagar), Livro-caixa (filtros, CSV, importar),
Sócios (saldo de cada sócio em cada empresa + quem deve a quem entre irmãos + extrato) e Dívidas.

Regras principais:
- **Saldo do sócio × empresa:** positivo = a empresa deve ao sócio (aportes e contas pagas do bolso); negativo = o sócio deve à empresa.
- **Logística:** os saldos partem do “FECHAMENTO CAMINHÃO” de 02/05/2024 (configurável em `config.corte_saldo_logistica`).
- **Máquina do Felipe (Perfiltex, 8,99%):** o sócio que passa o cartão recebe aporte do valor cheio; a empresa recebe o líquido e a
  taxa entra como despesa “Custo de antecipação no cartão”.
- **Importar histórico:** Livro-caixa › Importar › escolher o JSON gerado a partir dos grupos de WhatsApp. A importação usa `origem_ref`,
  então importar de novo atualiza em vez de duplicar. Os dados apurados ficam fora do repositório (pasta `privado/`).

## Kanban
- **Fretes:** Agendado → Em rota → Entregue → Fechado (Levíssima) → Recebido
- **Contas a pagar:** A vencer → Vence em 7 dias → Vencida → Paga
- **Manutenção da frota:** Solicitada → Em oficina → Concluída → Paga
- **Acertos dos motoristas:** Aberto → Conferido → Pago

## Publicação
1. Supabase › SQL Editor: rodar `supabase/schema.sql` (tabelas + segurança) e depois `supabase/seed.sql` (dados de setembro – arquivo local, não vai para o GitHub).
2. GitHub: repositório `gobbo-gestao` → Settings › Pages → Branch `main` / root.
3. Abrir `https://<usuario>.github.io/gobbo-gestao/`, “Criar acesso” com andrergobbo@gmail.com (vira sócio automaticamente).
4. Motoristas criam o acesso pelo mesmo endereço; um sócio libera em Cadastros › Usuários (papel + motorista vinculado).
5. No celular: abrir o endereço → “Adicionar à tela inicial” (Android/iPhone). No computador: ícone de instalar na barra do navegador.

## Segurança
- Repositório público: dados da empresa ficam fora (`.gitignore`: `privado/`, `data/`, `supabase/seed.sql`, `tools/`).
- A chave `publishable` do Supabase é pública por natureza; quem protege os dados é o RLS do `schema.sql`.
- Nunca coloque a chave `secret`/`service_role` no app nem no repositório.
- Sócio só é atribuído automaticamente a andrergobbo@gmail.com; qualquer outro cadastro entra sem acesso a dados.

## Rodar localmente
`python3 -m http.server 8765` na pasta do projeto e abrir `http://127.0.0.1:8765/?demo` (modo demonstração com os dados locais).
