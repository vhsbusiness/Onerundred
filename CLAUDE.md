# Onerundred — notas para o Claude

App Next.js 16 (App Router, Turbopack) + Tailwind v4 + Prisma 7. Interface em
português do Brasil. Banco: Postgres em produção (Railway, `@prisma/adapter-pg`)
e SQLite em dev (`@prisma/adapter-better-sqlite3`); `prisma.config.ts` e
`src/lib/db.ts` escolhem pelo prefixo da `DATABASE_URL`.

## Comandos

- Node vem do nvm: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH"`
- `npm run dev` — servidor em http://localhost:3000
- `npx tsc --noEmit` e `npx eslint src` — devem passar sem erros antes de entregar
- `npx prisma migrate dev --name <nome>` após mudar `prisma/schema.prisma`
  (gera o client em `src/generated/prisma`, que está no .gitignore) e em
  seguida `npm run db:pg-migration -- <nome>` para a migration Postgres em
  `prisma/migrations` — antes de commitar o schema (o script compara com o HEAD).
- `prisma/schema.prisma` fica com `provider = "postgresql"`; o schema SQLite
  (`prisma/schema.sqlite.prisma`) é derivado automaticamente, não edite nem commite.
- `npm run build` = `prisma generate && next build`; `npm start` roda
  `prisma migrate deploy` antes do Next (é o que o Railway executa).

## Convenções

- Páginas em `src/app/**` são finas; a UI vive em `src/components/**` como
  client components que buscam dados de `src/app/api/**` com `http` de
  `src/lib/client.ts`.
- Toda regra de negócio fica em `src/lib/repo.ts`; as rotas só validam entrada
  (`src/lib/api.ts`) e chamam o repo.
- Métricas são funções puras em `src/lib/metrics.ts`. Mudanças ali precisam ser
  refletidas na explicação em `src/components/settings/SettingsForm.tsx` e no README.
- Datas de agendamento são strings `yyyy-MM-dd` no fuso local do servidor
  (`src/lib/time.ts`). Timestamps são `DateTime`.
- Tema: tokens em `src/app/globals.css` (`@theme inline`). Cores de acento pastel
  (`orange`, `green`, `blue`) para UI; tons `*-deep` (validados para fundo escuro)
  para marcas de gráfico. Classes utilitárias: `card`, `pill`, `pill-*`, `btn`,
  `btn-primary`, `btn-ghost`, `input`, `blob-surface`.
- Prioridade: 1 = Alta (laranja), 2 = Média (azul), 3 = Baixa (verde).
- Tipos de lista: `normal`, `tomorrow` (Amanhã), `done` (Feitas).

## Preview no app Claude

`.claude/launch.json` tem duas configurações: `onerundred` anexa a um servidor já
rodando em :3000; `onerundred-dev` tenta iniciar o Next pelo launcher do app, o
que pode travar esperando permissão do macOS para a pasta Documentos. Preferir
subir o servidor pelo terminal e usar `onerundred`.

## Autenticação e usuários

- Contas em `User` (e-mail e usuário únicos, em minúsculas), senha com scrypt
  (`src/lib/auth.ts`), sessão em `AuthSession` + cookie httpOnly `onerundred_session`.
- `src/proxy.ts` só checa se o cookie existe; a validação real é `getCurrentUser()`
  em `src/lib/current-user.ts`. Páginas chamam `requireUserPage()`; rotas usam
  `withUser`/`withAdmin` de `src/lib/api.ts` e recebem o usuário como 1º argumento.
- Toda função de `src/lib/repo.ts` recebe `userId` e filtra por ele (quadro → lista → tarefa).
- Primeiro usuário cadastrado = admin. Painel em `/admin` (`src/lib/admin.ts`).
  `AppSetting.allowRegistration` fecha o cadastro.
- Rotas públicas: `/login` e `/api/auth/*`. A `Nav` some em `/login`.

## IA

- `src/lib/ai.ts`: monta o contexto do usuário (reusa `getDashboard`), chama a OpenAI
  (chat completions com `json_schema` estrito) e grava `AiInsight` + `AiMemory`.
- Modelo via `OPENAI_MODEL` (padrão `gpt-5-mini`; modelos gpt-5/o* não aceitam
  `temperature`, usamos `reasoning_effort: low`). Limite: 12 análises/dia/usuário.
- Nunca commitar a chave: fica em `.env` local e nas variáveis do Railway.

## Arquivo de inteligência

`docs/INTELIGENCIA.md` descreve o app inteiro (modelo de dados, páginas, API, regras
com números, IA, notificações, design, deploy, decisões). Leia antes de mexer em
regra de negócio e atualize-o quando mudar comportamento. Nunca coloque senhas,
chaves ou tokens lá: é commitado.
