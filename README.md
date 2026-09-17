# Apontamento

SaaS multiempresa de apontamento de horas com custo real por colaborador e **rentabilidade por contrato**
(receita × custo das horas × gastos extras × margem desejada).

Interface em pt-BR, moeda BRL, datas dd/mm/aaaa, fuso `America/Sao_Paulo`.

## Stack

Next.js 16 (App Router) · TypeScript · Supabase (Postgres + Auth + RLS) · Tailwind CSS 4 · shadcn/ui ·
Recharts · Zod · Vitest (com Postgres real via PGlite para testar as políticas de RLS).

## Como rodar

1. Crie um projeto no [Supabase](https://supabase.com/dashboard).
2. Copie `.env.example` para `.env.local` e preencha:
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API)
   - `SUPABASE_SERVICE_ROLE_KEY` (usada só no servidor, para enviar convites por e-mail)
3. Aplique as migrations. Basta a `SUPABASE_DB_URL` no `.env.local`:
   ```bash
   npm run db:apply
   ```
   - `npm run db:apply -- --dry-run` mostra o que falta sem executar.
   - `npm run db:apply -- --baseline 20260917000003` registra migrations já aplicadas
     à mão (pelo SQL Editor) sem tentar executá-las de novo.
   - Alternativa oficial: `npx supabase login`, `npx supabase link --project-ref ...`
     e `npm run db:push`.
4. Suba o app:
   ```bash
   npm run dev
   ```
5. Acesse `/cadastro`, crie a conta do dono e siga para o onboarding (criação da empresa).

> Em **Authentication → URL Configuration**, inclua `http://localhost:3000/auth/confirm` (e a URL de produção)
> nas *Redirect URLs*.

## Scripts

| Script | O que faz |
| --- | --- |
| `npm run dev` | ambiente de desenvolvimento |
| `npm run build` | build de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | testes unitários + testes de banco/RLS |
| `npm run check` | lint + typecheck + testes |
| `npm run db:apply` | aplica as migrations usando `SUPABASE_DB_URL` |
| `npm run db:push` | aplica as migrations pela CLI oficial (projeto vinculado) |
| `npm run db:bundle` | junta as migrations em `supabase/schema-completo.sql` |
| `npm run seed -- --email voce@empresa.com` | popula a base de demonstração (`--reset` apaga antes) |
| `npm run db:types` | regenera `src/lib/database.types.ts` a partir do banco |

## Perfis de acesso

| Perfil | O que enxerga |
| --- | --- |
| **Admin** | tudo, inclusive salários, custos e configurações da empresa |
| **Gestor** | dashboards, rentabilidade, cadastros e aprovações. Ver **custo individual** é uma permissão que o admin liga/desliga |
| **Colaborador** | apenas os próprios apontamentos e análises pessoais — nunca valores de contrato, custos ou salários |

As regras valem no banco (RLS), não apenas na interface: toda tabela tem `tenant_id` e políticas que usam
`private.current_tenant_id()`, `private.is_admin()`, `private.is_manager()` e `private.can_view_costs()`.

## Estrutura

```
supabase/migrations   SQL versionado (schema, RLS, funções)
supabase/tests        testes de RLS rodando em Postgres real (PGlite), sem Docker
src/app/(auth)        login, cadastro, recuperação de senha
src/app/(app)         área autenticada (shell + páginas)
src/lib/supabase      clientes browser/server/admin e proxy de sessão
src/lib/validation    schemas Zod e validadores (CNPJ)
```

## Roadmap

- [x] 1. Setup, Supabase, autenticação, multiempresa e perfis/RLS
- [x] 2. Cadastros: áreas, atividades, colaboradores (com custo e vigência), clientes
- [x] 3. Contratos e gastos extras
- [x] 4. Apontamento de horas (manual, cronômetro, visão semanal), aprovação e fechamento
- [ ] 5. Motor de cálculo de rentabilidade com testes
- [x] 6. Dashboard gerencial, detalhe do contrato e alertas
- [x] 7. Análises do colaborador
- [x] 8. Exportações em CSV, Excel e PDF
- [x] 9. Seed de demonstração
