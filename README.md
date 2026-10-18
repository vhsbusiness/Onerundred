# Onerundred

Dashboard pessoal de produtividade. Primeira fase: quadros estilo Trello com
tarefas priorizadas, cronômetro por tarefa, sessão de trabalho e notas diária /
semanal / mensal de quanto foi feito.

## Rodando localmente

Pré-requisito: Node.js 20+ (instalado via nvm em `~/.nvm`).

```bash
cp .env.example .env     # DATABASE_URL="file:./prisma/dev.db"
npm install              # também gera o client do Prisma (postinstall)
npx prisma migrate dev   # cria/atualiza o banco SQLite em prisma/dev.db
npm run dev              # http://localhost:3000
```

Se o terminal não encontrar o `node`, carregue o nvm primeiro:

```bash
source ~/.nvm/nvm.sh
```

## O que já existe

- **Dashboard** (`/`): nota de hoje, da semana e do mês; tempo trabalhado; sequência
  de dias ≥ 70%; barra feitas / em andamento / pendentes; gráfico dos últimos 14 dias;
  lista das tarefas de hoje com cronômetro e botão de concluir.
- **Sessão de trabalho**: botão iniciar/parar no dashboard. Compara o tempo
  trabalhado com a soma das estimativas das tarefas do dia (ou com a meta diária
  das configurações) e dá um veredito.
- **Quadros** (`/quadros`): vários quadros; cada quadro tem listas com prioridade
  (Alta / Média / Baixa) e tipo (Normal, Amanhã, Feitas). Tarefas têm prioridade,
  estimativa em minutos, descrição, dia agendado e cronômetro. Arrastar e soltar
  entre listas.
- **Arquivadas** (`/arquivadas`): tarefas concluídas são arquivadas
  automaticamente no dia seguinte e continuam contando nas métricas.
- **Configurações** (`/configuracoes`): meta diária de trabalho.
- **Contas**: cadastro aberto, login por e-mail ou usuário, dados isolados por conta.
- **Admin** (`/admin`): painel do administrador (primeiro usuário cadastrado).

## Regras de negócio

- Peso da tarefa = prioridade da tarefa (Alta 3, Média 2, Baixa 1) ×
  prioridade da lista (Alta ×1,5, Média ×1, Baixa ×0,5).
- Nota do período = peso concluído ÷ (peso concluído + peso ainda aberto ao fim
  do período). Tarefas agendadas para depois do período não entram.
- Lista **Amanhã**: tarefas criadas nela ficam agendadas para o dia seguinte e
  são movidas automaticamente para a primeira lista normal quando o dia chega.
- Lista **Feitas**: mover uma tarefa para ela marca como concluída; tirar de lá
  reabre.
- Cronômetros esquecidos ligados são encerrados automaticamente na virada do dia.
- Só uma tarefa cronometrada por vez; parar a sessão de trabalho também para o
  cronômetro da tarefa.

Implementação em [src/lib/metrics.ts](src/lib/metrics.ts) e
[src/lib/repo.ts](src/lib/repo.ts).

## Estrutura

```
prisma/schema.prisma        modelos: Board, List, Card, TaskSession, WorkSession, Setting (Postgres)
prisma/migrations           migrations Postgres (Railway); migrations-sqlite = dev local
prisma.config.ts            escolhe schema/migrations pela DATABASE_URL
src/lib/db.ts               PrismaClient com adaptador SQLite ou Postgres
src/app/api/**              rotas HTTP (JSON)
src/lib/repo.ts             acesso ao banco e regras de negócio
src/lib/metrics.ts          cálculo das notas
src/components/dashboard    dashboard, temporizador, gráfico
src/components/board        quadro, listas, cartões, modal da tarefa
src/app/globals.css         tema (fundo escuro granulado, laranja/verde/azul pastel)
```

## Banco de dados: Postgres em produção, SQLite em dev

O Prisma só aceita um `provider` por schema, e o client gerado é amarrado a ele.
Como esta máquina não tem Docker nem Postgres instalado, a decisão foi:

- **`prisma/schema.prisma` é a fonte da verdade e usa `postgresql`** (Railway).
- **Dev local continua em SQLite** sem segundo schema para manter em dia:
  `prisma.config.ts` lê a `DATABASE_URL` e, quando ela começa com `file:`, gera
  `prisma/schema.sqlite.prisma` (ignorado pelo git) trocando só o provider, e
  aponta a CLI para ele. `npx prisma generate` então produz o client certo para
  o banco em uso.
- `src/lib/db.ts` escolhe o adaptador pela mesma variável
  (`@prisma/adapter-better-sqlite3` para `file:`, `@prisma/adapter-pg` para
  `postgresql://`). A lógica compartilhada está em `src/lib/database-url.ts`.
- Migrations ficam em duas pastas: `prisma/migrations` (Postgres, aplicadas no
  Railway por `prisma migrate deploy`) e `prisma/migrations-sqlite` (só dev).

Alternativa descartada: usar um Postgres do Railway também em dev. Funciona
(basta colocar a URL pública no `.env`), mas exige internet para abrir o app e
mistura dados de teste com produção se o banco for o mesmo. Se um dia houver
Docker, rodar Postgres local e apagar a pasta `migrations-sqlite` simplifica.

### Mudando o schema

```bash
# 1. edite prisma/schema.prisma
npx prisma migrate dev --name <nome>     # migration SQLite + aplica no dev.db + regenera client
npm run db:pg-migration -- <nome>        # migration Postgres em prisma/migrations (sem precisar de Postgres)
# 2. commite as duas migrations junto com o schema
```

`db:pg-migration` compara o schema atual com o último commitado (`git HEAD`),
então rode-o **antes** de commitar a alteração do schema.

## Contas e acesso

Qualquer pessoa pode criar uma conta (nome, e-mail, usuário e senha) e entrar
com e-mail ou usuário. Cada conta só vê os próprios quadros, tarefas, sessões e
preferências. Senhas são guardadas com hash scrypt; a sessão é um token
aleatório salvo no banco (tabela `AuthSession`) e num cookie httpOnly de 30 dias.

**O primeiro usuário cadastrado vira administrador.** A aba **Admin** (`/admin`)
mostra o total de contas, quem entrou hoje, tarefas feitas e tempo trabalhado por
todos, e permite promover/rebaixar admins, desativar, reativar ou excluir contas e
fechar/abrir o cadastro de novos usuários.

Implementação em `src/lib/auth.ts`, `src/lib/current-user.ts`, `src/lib/admin.ts`,
`src/proxy.ts` e `src/app/api/auth/*`.

## Deploy no Railway

1. Suba o repositório para o GitHub (sem `.env`; o `.gitignore` já cuida disso).
2. No [Railway](https://railway.com), **New Project → Deploy from GitHub repo**
   e escolha o repositório. O `railway.json` já define build
   (`npm run build` = `prisma generate && next build`) e start
   (`npm run start` = `prisma migrate deploy && next start`).
3. No mesmo projeto, **+ New → Database → PostgreSQL**.
4. No serviço do app, aba **Variables**, adicione:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (referência ao serviço
     Postgres; use o nome que o Railway deu ao banco). Ela precisa existir já
     no **build**, porque é ela que faz o `prisma generate` gerar o client
     Postgres.
   - `TZ` = `America/Sao_Paulo` (o dia "de hoje" das tarefas usa o fuso do
     servidor; o Railway roda em UTC).
5. Aba **Settings → Networking → Generate Domain** para ter uma URL pública.
6. Cada push na branch configurada dispara um deploy; o start aplica as
   migrations pendentes antes de subir o Next.

Para testar o caminho Postgres localmente, basta apontar `DATABASE_URL` no
`.env` para a URL pública do banco do Railway e rodar `npx prisma generate`
seguido de `npm run dev` (volte para `file:` e gere de novo ao terminar).

## Próximos passos planejados

- Integração com a API da OpenAI para analisar as tarefas e sugerir percentuais,
  horários de trabalho, pausas e sono.
- Métricas de sono e rotina.
