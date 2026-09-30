# Gobbo Logística – Plataforma de Gestão

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

## Quadros Kanban planejados
- **Fretes:** Agendado → Em rota → Entregue → Fechado (Levíssima) → Recebido
- **Contas a pagar:** A vencer → Vence em 7 dias → Vencida → Paga
- **Manutenção da frota:** Solicitada → Em oficina → Concluída → Paga
- **Acertos dos motoristas:** Aberto → Conferido → Pago

## O que você precisa fazer (contas gratuitas)
1. Criar conta no **GitHub** (github.com) e no **Supabase** (supabase.com).
2. No Supabase: *New project* → abrir **SQL Editor** → colar e rodar `supabase/schema.sql`, depois `supabase/seed.sql`.
3. Em *Project Settings › API*, copiar a **Project URL** e a chave **anon public** (essa chave é pública por natureza; nunca compartilhe a `service_role`).
4. O e-mail andrergobbo@gmail.com vira **sócio** automaticamente ao criar o acesso; os demais entram como **motorista sem acesso** até um sócio liberar em Cadastros › Usuários.
