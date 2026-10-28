# Onerundred — Desenvolvimento, build e deploy

> Parte da transferência de contexto. Nunca escreva valores de segredos aqui.

## 1. Ambiente

- Node 20+ (a máquina do dono usa Node 24 via nvm, sem Homebrew). Em shells não interativos:
  ```bash
  export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH"
  ```
- Python 3 só é usado pela skill de design em `.claude/skills/ui-ux-pro-max` (opcional).
- `npm install` ocasionalmente dá `ECONNRESET` na registry; repetir com `--fetch-retries=6`.

## 2. Instalação

```bash
cp .env.example .env        # DATABASE_URL="file:./prisma/dev.db" e demais variáveis vazias
npm install                 # postinstall roda prisma generate (client em src/generated/prisma)
npx prisma migrate deploy   # aplica as migrations SQLite em prisma/dev.db
```

Variáveis de ambiente (nomes apenas; valores ficam no `.env` local e nas Variables do Railway):

| Nome | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | `file:…` (SQLite dev) ou `postgresql://…` (produção). Precisa existir no build. |
| `TZ` | produção | `America/Sao_Paulo`; "hoje" usa o fuso do servidor (Railway é UTC). |
| `OPENAI_API_KEY` | não | Liga a IA. |
| `OPENAI_MODEL` | não | Padrão `gpt-5-mini`. |
| `OPENAI_IMPORT_MODEL` | não | Modelo com visão para importar prints. |
| `AI_PRICE_INPUT_PER_M`, `AI_PRICE_OUTPUT_PER_M` | não | Preços para o custo estimado no Admin. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | não | Push (`npx web-push generate-vapid-keys`). |
| `CRON_SECRET` | não | Autoriza `POST /api/notificacoes/tick` externo. |
| `DISABLE_NOTIFICATION_SCHEDULER` | não | `1` desliga o agendador interno. |

## 3. Desenvolvimento

```bash
npm run dev                                   # Next dev em http://localhost:3000
npx next build && node node_modules/next/dist/bin/next start -p 3000   # build de produção local (usado para conferir a UI)
```

- O agente anterior usava o build de produção local para conferir visualmente, porque o painel de navegador do app Claude entrava em loop de recarregamento com o `next dev` (HMR). No Codex isso pode não se aplicar; `npm run dev` é o fluxo normal.
- Contas de teste locais são criadas pelo próprio `/api/auth/register` (banco SQLite local). Não há seeds.
- `.claude/launch.json` é específico do app Claude (previews); pode ser ignorado.

## 4. Verificação (não há testes automatizados)

```bash
npx tsc --noEmit -p .      # tipos: deve passar sem erros
npx eslint src             # lint, incluindo regras do React Compiler: deve passar sem erros
npx next build             # build: deve compilar
```

Depois, conferir manualmente no navegador em **375 px (celular) e desktop (1280/1440)**; é uma exigência do dono para toda função. Para rotas de API, `curl` com o cookie de uma conta local (login por `POST /api/auth/login` com `{ identifier, password }`).

Regras do ESLint que mais pegam: `react-hooks/set-state-in-effect` (setState síncrono em effect — o código usa comentários `eslint-disable-next-line` com justificativa quando é busca inicial), `react-hooks/rules-of-hooks` (hooks depois de `return` antecipado), `react-hooks/refs`, `react-hooks/purity` (`Date.now()` no render — use `useNow`), `react/no-unescaped-entities` (aspas em JSX).

## 5. Mudando o schema do banco

Fluxo oficial (`CLAUDE.md`, `README.md`):
```bash
# 1. edite prisma/schema.prisma (provider continua postgresql)
npx prisma migrate dev --name <nome>     # migration SQLite + aplica no dev.db + regenera client
npm run db:pg-migration -- <nome>        # migration Postgres em prisma/migrations, por diff contra o git HEAD
# 2. commite schema + as duas migrations juntos
```

Observações práticas do histórico:
- `db:pg-migration` compara com o **último schema commitado**: rode antes de commitar o schema, senão o diff sai vazio.
- Em várias ocasiões `prisma migrate dev` recusou por "drift" no SQLite local. A alternativa usada foi escrever o SQL à mão em `prisma/migrations-sqlite/<timestamp>_<nome>/migration.sql`, aplicar com `sqlite3 prisma/dev.db < …` e registrar com `npx prisma migrate deploy`, depois `npx prisma generate`. Mantenha os nomes das migrations iguais nas duas pastas.
- `prisma/schema.sqlite.prisma` é gerado; não edite nem commite.
- Em produção, `npm start` roda `prisma migrate deploy` antes de subir o Next.

## 6. Build e deploy

- `npm run build` = `prisma generate && next build`. `npm run start` = `prisma migrate deploy && next start -p $PORT`.
- Railway (`railway.json`): builder RAILPACK, healthcheck `/`, restart ON_FAILURE (5). Serviço `Onerundred`, ambiente `production`, ligado ao GitHub: **todo push em `main` faz deploy**.
- Regra combinada com o dono: **commits locais; `git push` só quando ele mandar publicar.**
- Se o gatilho do GitHub não disparar, o agente anterior usava a CLI: `railway up --detach -s Onerundred -e production` (após `railway login`). **[não confirmado]** se a CLI continua logada na máquina.
- Como confirmar que a versão subiu: os hashes dos chunks do Turbopack são determinísticos; pegue um chunk do build local em `.next/static/chunks/` que contenha a mudança e verifique `https://app.onerundred.com/_next/static/chunks/<arquivo>` responder 200. Para CSS, o `<link>` no HTML de `/login` aponta o CSS atual.
- Plataforma: o Railway já teve período de "deploys paused" (incidente do lado deles); nesses casos, só esperar.

## 7. Git

- Remoto `origin` por SSH. Branch única `main`. Mensagens de commit em português, com o resumo da mudança no título e detalhes em lista.
- Não há CI, PRs obrigatórios nem proteção de branch **[não confirmado]**.
- `AGENTS.md` contém um bloco `nextjs-agent-rules` que o `next dev` reescreve; mantenha-o.
