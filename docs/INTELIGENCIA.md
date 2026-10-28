# Onerundred — Arquivo de inteligência

Documento de referência completo do app: o que ele é, como é feito, todas as regras
de negócio com números, todas as tabelas, páginas, rotas de API, notificações, IA,
design e operação. Fonte: o código em 28/10/2026. Quando o código mudar, atualize aqui.

Leitura recomendada para: retomar o projeto depois de um tempo, orientar uma IA ou
um dev novo, auditar comportamento ("por que a nota deu 35%?") e planejar features.
Nunca coloque senhas, chaves ou tokens neste arquivo: ele é commitado.

---

## 1. O que é

Onerundred é um painel pessoal de produtividade, em português do Brasil, feito para
uma pessoa organizar o dia e medir se ele foi bom. Junta:

- quadros estilo Trello com listas e tarefas priorizadas, cronômetro por tarefa e sessão
  de trabalho do dia;
- uma nota diária/semanal/mensal das tarefas e uma performance 0–100 que combina
  tarefas, sono, lazer e metas;
- registro de sono, blocos de lazer, metas de longo prazo (projetos de N dias) e metas
  básicas (sono, trabalho por dia, lazer, performance alvo);
- lembretes e notificações push no celular;
- uma IA (OpenAI) que analisa o dia, mantém uma memória de hábitos da pessoa, dá visão
  sobre sessões de trabalho, organiza listas por importância e importa prints do Trello.

Produção: https://app.onerundred.com (Railway). Repositório: github.com/vhsbusiness/Onerundred.
Dono/admin: Vitor Hugo. Contas são abertas (qualquer pessoa cadastra), mas o app foi
desenhado como ferramenta pessoal; quadros podem ser compartilhados entre usuários.

---

## 2. Stack e infraestrutura

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16.4.2 (App Router, Turbopack), React 19.3, TypeScript 5 |
| Estilo | Tailwind CSS v4 (`@theme` em `src/app/globals.css`), lucide-react (ícones) |
| Banco | Prisma 7.10 — Postgres em produção (`@prisma/adapter-pg`), SQLite em dev (`@prisma/adapter-better-sqlite3`, `prisma/dev.db`) |
| Arrastar e soltar | @dnd-kit (core, sortable, utilities) |
| Datas | date-fns 4 |
| IA | SDK `openai` 7 (chat completions com `json_schema` estrito) |
| Push | `web-push` 3 (VAPID) + service worker `public/sw.js` |
| Hospedagem | Railway (builder RAILPACK; `railway.json`), domínio app.onerundred.com |
| Lint/tipos | ESLint 9 + eslint-config-next (inclui regras do React Compiler), `tsc --noEmit` |

### Comandos

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH"   # Node vem do nvm
npm run dev                      # http://localhost:3000 (em dev, o HMR entra em loop no navegador do app Claude; use o build)
npx next build && node node_modules/next/dist/bin/next start -p 3000   # build de produção local
npx tsc --noEmit -p . && npx eslint src                                 # precisam passar antes de entregar
npx prisma migrate dev --name <nome>          # SQLite (dev) — ou SQL manual em prisma/migrations-sqlite + prisma migrate deploy
npm run db:pg-migration -- <nome>             # migration Postgres em prisma/migrations (compara com git HEAD: rode ANTES de commitar o schema)
npm run build  = prisma generate && next build
npm start      = prisma migrate deploy && next start -p $PORT   # o que o Railway executa
```

`prisma/schema.prisma` é a fonte da verdade com `provider = "postgresql"`; quando a
`DATABASE_URL` começa com `file:`, `prisma.config.ts` deriva `prisma/schema.sqlite.prisma`
(ignorado pelo git). `src/lib/db.ts` escolhe o adaptador pela mesma URL. Migrations em
duas pastas: `prisma/migrations` (Postgres, aplicadas no deploy) e `prisma/migrations-sqlite` (dev).

### Variáveis de ambiente

| Variável | Uso |
|---|---|
| `DATABASE_URL` | `file:./prisma/dev.db` (dev) ou `postgresql://…` (Railway). Precisa existir no build (gera o client certo). |
| `TZ` | `America/Sao_Paulo` em produção: "hoje" é calculado no fuso do servidor. |
| `OPENAI_API_KEY` | Liga a IA. Sem ela o app funciona e o card avisa que a IA está desativada. Nunca vai para o código ou git. |
| `OPENAI_MODEL` | Padrão `gpt-5-mini`. Modelos `gpt-5*`/`o*` recebem `reasoning_effort: low` e não aceitam `temperature`. |
| `OPENAI_IMPORT_MODEL` | Modelo com visão para importar prints (cai em `OPENAI_MODEL`). |
| `AI_PRICE_INPUT_PER_M`, `AI_PRICE_OUTPUT_PER_M` | Preço por milhão de tokens para o custo estimado no Admin (padrão 0,25 e 2 USD). |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push. Gere com `npx web-push generate-vapid-keys`. |
| `CRON_SECRET` | Permite disparar `POST /api/notificacoes/tick` por um cron externo (`Authorization: Bearer`). |
| `DISABLE_NOTIFICATION_SCHEDULER=1` | Desliga o agendador interno. |

### Deploy

- Push em `origin main` dispara o deploy no Railway (serviço `Onerundred`, ambiente `production`). Se o gatilho do GitHub não disparar: `railway up --detach -s Onerundred -e production` no projeto certo (precisa de `railway login`).
- O start roda `prisma migrate deploy` antes do Next: migrations Postgres pendentes são aplicadas sozinhas.
- Conferência de que a versão subiu: os hashes dos chunks do Turbopack são determinísticos, então basta checar `https://app.onerundred.com/_next/static/chunks/<hash do build local>.js` responder 200, ou procurar um marcador no HTML/CSS.
- Regra de trabalho combinada: commits ficam locais e só se publica (push) quando o usuário pede.
- Existe um projeto Railway duplicado chamado "Onerundred" sem uso; a exclusão ficou pendente de decisão.

---

## 3. Arquitetura e convenções

```
src/app/**            páginas finas (server components) que chamam requireUserPage() e montam um client component
src/app/api/**        rotas HTTP JSON; só validam entrada (src/lib/api.ts) e chamam o repo
src/components/**     UI (client components) que falam com a API via `http` de src/lib/client.ts
src/lib/repo.ts       quase toda a regra de negócio e acesso ao banco (toda função recebe userId)
src/lib/metrics.ts    funções puras de nota (peso, nota do período, atraso, veredito de trabalho)
src/lib/performance.ts performance 0–100, constância, revisão de período
src/lib/ai.ts         análise do dia, visão de sessão, organizar lista, reset de memória
src/lib/import.ts     importar prints do Trello
src/lib/notifications.ts  push, preferências, regras e agendador (tick)
src/lib/reminders.ts  lembretes do usuário
src/lib/projects.ts   metas › projetos (N dias)
src/lib/sleep.ts      sono (registro e estatísticas)
src/lib/leisure.ts    lazer (blocos e cronômetro)
src/lib/sharing.ts    compartilhamento de quadros (convites, membros)
src/lib/admin.ts      painel admin, configurações globais, custo de IA
src/lib/auth.ts       cadastro, login, sessão, perfil, senha
src/lib/current-user.ts  getCurrentUser / requireUser / requireAdmin (API) e requireUserPage / requireAdminPage (páginas)
src/lib/theme.ts, theme-client.ts  tema (dark/light) e design (v2 Atelier / v1 antigo)
src/lib/time.ts       chaves de dia yyyy-MM-dd, intervalos de dia/semana/mês, formatação
src/lib/types.ts      todos os DTOs trocados entre API e UI
src/proxy.ts          checagem rápida do cookie de sessão (redireciona para /login)
src/instrumentation.ts  inicia o agendador de notificações (a cada 5 min)
public/sw.js          service worker (recebe push e abre a URL ao tocar)
scripts/pg-migration.mjs  gera migration Postgres por diff do schema contra o git HEAD
```

Convenções que valem em todo o código:

- Datas de agendamento são strings `yyyy-MM-dd` no fuso local do servidor; timestamps são `DateTime`.
- `withUser(fn)` e `withAdmin(fn)` embrulham rotas: tratam erros (`ApiError` → status), injetam o usuário como 1º argumento. Respostas JSON com `Cache-Control: no-store`.
- Validadores: `requireString`, `optionalPriority` (1|2|3), `optionalMinutes`, `optionalDayKey`.
- Acesso: `boardAccess(userId)` = dono OU membro do quadro. Toda consulta filtra por isso (quadro → lista → tarefa).
- Nada de `alert/confirm` nativos: `askConfirm()` e `notify()` do `ConfirmProvider`. Datas via `DateField` (`CalendarPopover`) e horas via `TimeField`.
- Toda função nova sai pronta para celular (375 px) e PC, conferida nos dois no build de produção local.
- Manutenção diária (`runMaintenance`) roda em toda leitura relevante (dashboard, quadro, performance, lista de quadros), no máximo uma vez por minuto por instância e sempre na virada do dia.

---

## 4. Modelo de dados (Prisma)

Ids são `cuid()`. Exclusões em cascata seguem a hierarquia (apagar o usuário apaga tudo dele).

### Contas e acesso
- **User**: `email` e `username` únicos (minúsculas), `name`, `passwordHash` (scrypt, formato `scrypt$salt$hex`), `role` `user|admin`, `active`, `avatar` (data URL JPEG pequeno, ≤ 300 KB), `createdAt`, `lastLoginAt`.
- **AuthSession**: `id` é o token do cookie `onerundred_session` (httpOnly, 30 dias), `expiresAt`, `userAgent`. Expiradas são apagadas na manutenção.
- **AppSetting** (global, chave/valor): `allowRegistration` (padrão aberto), `aiMinDaysTasks` 3, `aiMinDaysWork` 3, `aiMinNightsSleep` 7, `aiMinDaysLeisure` 7.
- **Setting** (por usuário, `@@id([userId,key])`): `dailyGoalMinutes` (padrão 480), `theme` (`dark|light`), `design` (`v2|v1`), `sleepTargetMinutes`, `bedtimeTarget` (HH:MM), `wakeTarget`, `leisureTargetMinutes`, `performanceTarget` (0–100), `lastBoardId`, `workEndedDay` (yyyy-MM-dd do dia encerrado), `workAutoEndedAt` (ISO de quando a sessão encerrou sozinha).

### Quadros e tarefas
- **Board**: `userId` (dono), `name`, `position`. Primeiro quadro criado automaticamente: "Meu dia" com listas Hoje (today, prioridade Alta), Esta semana (normal), Amanhã (tomorrow), Feitas (done).
- **BoardMember** (`@@unique([boardId,userId])`): membro com acesso igual ao dono, exceto excluir o quadro e gerenciar membros.
- **BoardInvite**: `fromUserId`, `toUserId`, `status` `pending|accepted|declined`, `respondedAt`. Único por (quadro, convidado).
- **List**: `boardId`, `name`, `position`, `priority` 1 Alta/2 Média/3 Baixa (multiplica o peso das tarefas), `kind` `normal|today|tomorrow|done`.
- **Card** (tarefa): `listId`, `title`, `description`, `priority` 1/2/3, `position`, `estimatedMinutes?`, `scheduledFor` (yyyy-MM-dd), `createdAt`, `completedAt?`, `archivedAt?`, `recurringId?` (tarefa contínua que gerou o card; SetNull ao apagar a contínua).
- **TaskSession**: cronômetro de tarefa (`startedAt`, `endedAt?`). Só uma aberta por usuário.
- **WorkSession**: sessão de trabalho do dia (`startedAt`, `endedAt?`). Conta inteira no dia em que começou (não é cortada à meia-noite).
- **ChecklistItem**: `cardId`, `text`, `done`, `position`.
- **CardImage**: imagem como data URL (`data`), servida por `/api/imagens/[id]` só para quem tem acesso. Limites: `MAX_CARD_IMAGES` e `MAX_CARD_IMAGE_CHARS` no repo. A primeira vira capa do cartão.
- **CardPostponement** (`@@unique([cardId,dayKey])`): dia em que a tarefa saiu da lista Hoje sem ser feita ("realocada"); pesa contra a nota daquele dia.
- **RecurringTask** (tarefa contínua): `listId`, `title`, `description`, `priority`, `estimatedMinutes?`, `weekdays` ("0,1,…" com 0=domingo; padrão `1,2,3,4,5`), `active`, `lastSpawnedKey` (último dia em que gerou card).
- **UndoAction**: última(s) ação(ões) em lote com `kind` (`restoreCards`, `unarchiveCards`, `deleteList`, `deleteCard`), `label` e `payload` JSON para reverter.

### Rotina e bem-estar
- **SleepLog** (`@@unique([userId,dayKey])`): uma noite por dia de acordar: `bedAt`, `sleepAt`, `wakeAt`, `quality` 1–5?, `note`. Regra de entrada: horas em HH:MM; acordei é no próprio dia; deitei/dormi são do dia anterior quando maiores que a hora de acordar. Latência (dormir − deitar) > 12 h é rejeitada.
- **LeisureLog**: bloco de lazer `activity` (padrões: Jogos, Séries e filmes, Redes sociais, Esporte, Social, Leitura, Outro), `startAt`, `endAt?` (null = cronômetro rodando), `dayKey` do dia em que começou, `note`. Bloco > 16 h é rejeitado. Se "até" < "de", atravessou a meia-noite (o dia informado é o do fim).
- **Project** (metas › projetos): `name`, `description`, `obligations` (uma por linha), `startDate`, `days` (1–365, ou 0 = sem fim), `archivedAt?`.
- **ProjectDay** (`@@unique([projectId,dayKey])`): `done`, `auto` (marcado como não feito automaticamente), `markedAt`, `note`.
- **Reminder**: `title`, `note`, `at`, `repeat` `none|daily|weekly`, `active`, `lastSentAt?`, `cardId?` (tarefa ligada; SetNull).

### IA, push e registro
- **AiInsight**: análise do dia (`dayKey`, `model`, `content` JSON com score, headline, assessment, suggestions, nextTasks, schedule; tokens).
- **AiMemory**: `summary` (memória de hábitos, até 1200 caracteres), reescrita a cada análise.
- **AiUsage**: cada chamada à OpenAI (feature, modelo, tokens) para o custo no Admin.
- **PushSubscription**: `endpoint` único, `p256dh`, `auth`, `userAgent` por aparelho.
- **NotificationPref**: tudo desligado por padrão, exceto `workEnded` (ligado). Campos: `enabled`, `goalReminder`, `longWork`, `weekly`, `balance`, `overdue`, `sleepLog`, `reminders`, `workEnded`.
- **NotificationLog**: `type` + `period` (dia, semana ou chave específica) — garante um envio por período.

---

## 5. Páginas e navegação

| Rota | Conteúdo |
|---|---|
| `/login` | Entrar (e-mail ou usuário + senha) e cadastrar (nome, e-mail, usuário `[a-z0-9_.]{3,24}`, senha ≥ 8). Cadastro pode estar fechado pelo admin. Primeiro usuário cadastrado vira admin. |
| `/` (Início) | Dashboard de hoje. `?dia=yyyy-MM-dd` revisa outro dia; `?dias=N` (2–90) revisa um período que termina em `dia`/hoje; `?de=&ate=` revisa um intervalo escolhido (1 dia → revisão do dia). |
| `/quadros` | Abre direto no último quadro visto (`Setting.lastBoardId`); `/quadros?lista=1` mostra a grade de todos os quadros. |
| `/quadros/[id]` | O quadro: listas em colunas, tarefas, menus, arrastar e soltar; `?card=<id>` abre a tarefa (usado pelos lembretes). |
| `/metas` | Metas › Projetos (compromissos de N dias). `/metas/projetos/[id]` detalhe com calendário. |
| `/metas/basicas` | Metas › Metas: sono (horas, deitar, acordar), trabalho por dia, lazer por dia, performance alvo. |
| `/sono` | Registro de noites, médias de 7/30 dias, gráfico de 14 noites, link para a meta. |
| `/lazer` | Blocos de lazer, cronômetro, totais, gráfico de 14 dias, link para a meta. |
| `/lembretes` | Criar/editar lembretes (título, detalhe, dia, hora, repetição), próximos e arquivados, aviso para ativar notificações. |
| `/arquivadas` | Tarefas arquivadas (concluídas em dias anteriores), com busca e "Excluir tudo". |
| `/configuracoes` | Aparência (tema escuro/claro), explicação da nota, reset da inteligência da IA, link para Metas. |
| `/perfil` | Nome, usuário, e-mail, foto, senha e seção de notificações (inscrição do aparelho, tipos, teste). |
| `/admin` | Só admin: contas, uso geral, custo de IA, período de observação da IA, cadastro aberto/fechado, trocar design (antigo/novo) só na própria conta, promover/rebaixar/desativar/excluir contas. |

Navegação: no PC o design Atelier usa um trilho lateral fixo (76 px só ícones ou 208 px com nomes, recolhível pelo botão no rodapé; a escolha fica em `localStorage.onerundred_rail`). No celular há a barra inferior com Início, Quadros, Metas, Sono, Lazer e Lembretes; Arquivadas, Configurações e Admin ficam no menu do avatar. O design antigo (v1) usa o cabeçalho horizontal com abas.

PWA: `manifest.webmanifest`, ícones em `public/icons`, "Adicionar à tela inicial" abre em tela cheia respeitando a área segura do iPhone. Viewport sem zoom; campos com 16 px no celular (evita zoom do Safari).

---

## 6. Funcionalidades em detalhe

### Dashboard (Início)
- Tiles: nota de Hoje, Esta semana, Este mês (cada um com "N feitas · N abertas" e "N realocadas" quando houver), Trabalhado hoje (com veredito), "Para terminar hoje" (estimativa de quanto falta e hora prevista de término) e Sequência ≥ 70% (dias seguidos com nota ≥ 70).
- Ao passar o mouse na nota, o balão explica a regra e mostra também a nota considerando todas as listas (não só a Hoje).
- Barra segmentada: feitas / em andamento / pendentes / realocadas.
- Card **Análise do dia** (IA) com progresso do período de observação, nota explicada, sugestões, próximas tarefas e horários. Primeira análise do dia é automática ao abrir; "Atualizar" gera outra (limite 12/dia).
- Gráfico dos últimos 14 dias; **Performance** 0–100 com constância e as quatro frentes; tarefas de hoje com cronômetro e concluir.
- **Sessão de trabalho**: começar, pausar, retomar, encerrar o dia; lista das sessões de hoje; "Visão da IA" sobre uma sessão encerrada.
- Seletor de dia/período (calendário próprio): Dia, 3, 7, 14, 30 dias ou intervalo "do dia X ao Y". Dia passado abre a **Revisão do dia** (nota, feitas, sessões, lazer, análise da IA daquele dia); período abre a **Revisão do período** (média de performance, feitas, realocadas, trabalho, lazer, sono médio, constância).

### Quadros, listas e tarefas
- Vários quadros; grade em `/quadros?lista=1` com contagem de listas, abertas, feitas hoje e nota do dia; selo "compartilhado por @dono".
- Lista: nome, prioridade (Alta ×1,5 / Média ×1 / Baixa ×0,5) e tipo (`normal`, `today` Hoje, `tomorrow` Amanhã, `done` Feitas). Relógio no cabeçalho da lista mostra em quantas horas ela pode ser terminada (soma das estimativas; tarefas sem estimativa usam a média histórica). Arrastar listas para reordenar (ids com prefixo `list:`).
- Menu "…" da lista: adicionar tarefa, copiar lista, mover todas as tarefas para outra lista, **mover lista para outro quadro**, puxar todas as tarefas de uma prioridade, arquivar todas as tarefas, organizar por importância (IA), desfazer última ação, mover para esquerda/direita, tipo da lista, excluir.
- Tarefa: título, descrição, prioridade, estimativa (min), dia agendado, checklist, imagens (Ctrl+V ou anexar), lembretes ligados, cronômetro, copiar, arquivar, excluir, **lista de destino agrupada por quadro** (transferir para outro quadro fecha o modal). Botão direito: abrir, copiar, arquivar.
- Formulário de nova tarefa: título (aceita colar imagem), prioridade, minutos, link discreto "repetir…" que revela os chips D S T Q Q S S para criar uma **tarefa contínua**. Esc ou clicar fora mantém o rascunho; fechar o modal salva os campos.
- **Tarefa contínua**: gera um card por dia nos dias da semana escolhidos, na lista escolhida (lista Amanhã agenda para amanhã). Geração na manutenção diária, idempotente (`lastSpawnedKey` + card já existente). No modal: pausar/retomar a repetição, mudar os dias, parar (o card de hoje fica). Card mostra só um ícone de repetição.
- **Desfazer**: ações em lote (mover todas, arquivar todas, puxar, copiar lista/tarefa, organizar por IA, excluir) gravam `UndoAction`; "Desfazer última ação" no menu da lista reverte a mais recente. Botões de desfazer têm cor de destaque.
- Arquivamento: tarefas concluídas em dias anteriores são arquivadas automaticamente na manutenção e continuam contando nas métricas.
- **Compartilhar quadro**: menu "…" do quadro → busca pelo @ → convite. O convidado vê no sininho (e recebe push), aceita ou recusa. Só o dono convida, remove membros e exclui; membros podem sair. Tarefas do quadro compartilhado entram nas métricas de quem participa.
- **Trazer dados (Trello)**: no quadro, enviar até 8 prints (≤ ~4,5 MB cada em base64); a IA lê, mostra listas/tarefas, marca o que já existe e cria só o que falta (`POST` lê, `PUT` aplica em `/api/boards/[id]/importar`).

### Sessão de trabalho e cronômetros
- Uma sessão aberta por vez; pausar fecha a sessão e o cronômetro da tarefa; encerrar marca `workEndedDay = hoje`; começar reabre.
- Iniciar uma tarefa com a sessão pausada/encerrada **retoma a sessão** automaticamente. Marcar o último item do checklist como feito inicia a tarefa.
- Mover uma tarefa para Feitas encerra o cronômetro dela.
- Quando todas as tarefas de hoje (lista Hoje, ou todas as não-Feitas se não houver lista Hoje) estão concluídas, a sessão **encerra sozinha** e uma notificação chega 10 minutos depois (`workEnded`).
- Sessões e cronômetros atravessam a meia-noite; só o que ficou ligado > 16 h é considerado esquecido e é fechado em início + 16 h.
- Tempo planejado do dia = soma das estimativas das tarefas de hoje; se zero, a meta diária de trabalho.

### Metas › Projetos
- Projeto de N dias (1–365) ou sem fim (0) com obrigações diárias. O dia de um projeto é marcado **no dia seguinte** ("Fiz ontem" / "Não fiz"); dias anteriores a ontem sem marcação viram "não feito" automaticamente (`auto`). Dias futuros não podem ser marcados. Mostra sequência, percentual e calendário.

### Metas › Metas (básicas)
- Sono: horas por noite, deitar às, acordar às. Trabalho por dia (h/min; é a `dailyGoalMinutes`). Lazer por dia (min). Performance que quero alcançar (0–100; sem meta vale 70).
- Usadas pela performance (seção 7) e enviadas à IA como `metasDoUsuario` para ela dizer se a pessoa está dentro ou fora de cada meta.

### Sono e lazer
- Sono: uma noite por dia; médias de duração (7 e 30 dias), hora média de deitar/dormir/acordar (média circular que atravessa a meia-noite), latência média, gráfico de 14 noites.
- Lazer: registro manual ou cronômetro (começar/parar); cronômetros de dias anteriores são encerrados à meia-noite; totais de hoje, semana, média 7 dias, atividade mais frequente, gráfico de 14 dias.

### Lembretes
- Título, detalhe, dia, hora, repetição (uma vez, todo dia, toda semana). Lembrete único no passado é rejeitado; editar a hora reativa. Lembretes de uma vez, depois de disparados, ficam inativos (arquivados). Podem nascer ligados a uma tarefa (de dentro da tarefa); ao tocar na notificação abre o quadro com a tarefa (`?card=`).

### Perfil, configurações e admin
- Perfil: nome, usuário, e-mail, foto (JPEG/PNG/WebP ≤ 300 KB), trocar senha, notificações (ativar aparelho, tipos, enviar teste).
- Configurações: tema escuro/claro (por conta, cookie `onerundred_theme` para o servidor já renderizar certo), explicação da nota, reset da IA.
- Admin: totais (contas, entraram hoje, novas na semana, feitas hoje, abertas, trabalhado hoje, gasto com IA 30 dias), botão de design (ver o design antigo só na própria conta), período de observação da IA, permitir cadastros, tabela de usuários com custo de IA e ações.

---

## 7. Regras de negócio (com números)

### Peso e nota das tarefas (`src/lib/metrics.ts`)
- Peso da tarefa = prioridade da tarefa (Alta 3, Média 2, Baixa 1) × prioridade da lista (Alta ×1,5, Média ×1, Baixa ×0,5).
- Nota do período [início, fim) = peso concluído no período ÷ (peso concluído + peso aberto ao fim do período) × 100, arredondado. Sem nada a fazer → `null` ("sem tarefas").
- Conta como aberta: existia ao fim, ainda não concluída, não arquivada, `scheduledFor ≤ último dia` e, quando há lista Hoje no conjunto, só se estiver na lista Hoje (tarefas em Esta semana/Amanhã não puxam a nota). A existência da lista Hoje vale mesmo vazia (tudo feito ou realocado = 100%).
- **Realocada**: tarefa que saiu da Hoje sem ser feita ganha `CardPostponement` do dia; no período ela pesa como aberta (e é contada em `postponedCount`). Voltar para a Hoje ou concluir no mesmo dia apaga a realocação do dia. Uma tarefa já realocada mantém a data antiga (o atraso continua).
- **Atrasada**: aberta com `scheduledFor < hoje` numa lista Hoje ou numa lista normal de prioridade Alta. Amanhã e listas Média/Baixa nunca atrasam. Ao entrar numa lista Hoje/Alta vinda de outra lista, a data vira hoje (o atraso começa a contar dali), exceto se já tinha sido realocada.
- Tom da nota: ≥ 80 verde, ≥ 50 azul, abaixo laranja, `null` neutro.
- Veredito do trabalho (trabalhado ÷ planejado): ≥ 100% "Meta batida", ≥ 70% "No ritmo", ≥ 35% "Abaixo do planejado", senão "Começando o dia"; sem planejado "Sem meta para hoje".
- Sequência ≥ 70% do dashboard: dias seguidos com nota das tarefas ≥ 70.

### Efeitos do tipo de lista (`kindEffects` no repo)
- Cair em **Feitas**: marca `completedAt` agora; se estava agendada para o futuro, a data vira hoje; cronômetro encerra; pode encerrar a sessão de trabalho sozinha.
- Sair de Feitas: reabre (`completedAt = null`).
- Cair em **Amanhã**: data vira amanhã se era hoje ou antes. Na manutenção, tarefas de Amanhã cujo dia chegou vão para a lista Hoje (ou a primeira lista normal).
- Cair em lista normal/Hoje com data futura: data vira hoje.

### Performance diária (`src/lib/performance.ts`)
- Média ponderada das frentes com dado no dia: Tarefas 40, Sono 25, Lazer 15, Metas 20 (pesos redistribuídos entre as que têm dado). Dia sem tarefas, sono nem metas fica sem nota (lazer sozinho não define o dia).
- Tarefas = nota do dia. Sono = média de: duração ÷ meta (padrão 8 h) limitada a 100, pontualidade ao deitar (se há meta; 100 menos 20 pontos a cada 30 min de atraso, considerando virada da noite) e pontualidade ao acordar (se há meta). Lazer = minutos ÷ meta (padrão 60) limitado a 100. Metas = dias feitos ÷ (feitos + não feitos) dos projetos naquele dia.
- Constância = dias seguidos (até hoje) com performance ≥ meta de performance do usuário (padrão 70); hoje só entra quando já está no alvo e nunca quebra a sequência. Selo "na meta" quando a nota do dia ≥ alvo, "regular" ≥ 50, senão "abaixo".
- Revisão de período: média das performances e das notas de tarefas, feitas, realocadas, trabalho total, lazer total, sono médio e constância (calculada sobre 60 dias).

### Manutenção diária (`runMaintenance`)
1. Arquiva tarefas concluídas antes de hoje. 2. Fecha sessões de trabalho e cronômetros de tarefa ligados há mais de 16 h (em início + 16 h). 3. Move tarefas de Amanhã cujo dia chegou para a Hoje (ou primeira normal). 4. Gera os cards das tarefas contínuas do dia. 5. Apaga sessões de login expiradas. 6. Marca "não feito" nos dias de projeto anteriores a ontem sem marcação. 7. Encerra cronômetros de lazer esquecidos.

### Estimativa "Para terminar hoje"
- Soma das estimativas das tarefas abertas de hoje; tarefas sem estimativa usam a média histórica de minutos por tarefa: média do cronômetro das concluídas nos últimos 30 dias (se ≥ 3 medidas ≥ 1 min), senão a média das estimativas delas, senão 30 min. Mostra a hora prevista de término.

### Contas
- Senha com scrypt (salt 16 bytes, chave 64) e comparação em tempo constante. Sessão: token aleatório em `AuthSession`, cookie httpOnly 30 dias. Login por e-mail ou usuário, só contas ativas; `lastLoginAt` atualizado. Desativar conta derruba a sessão.
- `src/proxy.ts` (middleware) deixa passar `/login`, `/api/auth/*`, ícones, manifesto, `sw.js` e `/api/notificacoes/tick`; sem cookie, API responde 401 e páginas redirecionam para `/login?next=`.
- Admin: primeiro usuário cadastrado; pode promover/rebaixar, desativar/reativar, excluir contas (apaga tudo), fechar cadastro. Credenciais nunca ficam documentadas aqui.

---

## 8. IA (OpenAI) — `src/lib/ai.ts`

- Modelo `OPENAI_MODEL` (padrão `gpt-5-mini`); chamadas com `response_format: json_schema` estrito e `reasoning_effort: low` quando o modelo é gpt-5/o*. Cada chamada grava `AiUsage` (tokens) para o custo no Admin (preço padrão 0,25 / 2 USD por milhão).
- **Análise do dia** (`GET/POST /api/ai/insight`, opcional `?dia=`): payload com período de observação, agora, dia analisado, meta diária, planejado/trabalhado, sessão ativa, notas de hoje/semana/mês, sequência de dias na meta, **metas do usuário** (sono, deitar, acordar, lazer, trabalho/dia, performance alvo), contagens, tarefas de hoje (com "realocada"), tarefas futuras, histórico de 14 dias, minutos trabalhados por dia, histogramas de horas com sessão e com foco, metas/projetos (com "ontem marcado"), lazer (hoje, semana, média 7 dias, por atividade, por dia, em andamento), sono (noites, médias, últimas 7 noites) e a memória anterior. Devolve score, headline, assessment, suggestions, nextTasks (ids de tarefas abertas de hoje, até 3), schedule (startWork, stopWork, breakAt, sleepAt, wakeAt, note) e memorySummary (até 1200 caracteres, reescrita por completo). Limite: 12 gerações por dia por usuário (contando qualquer dia analisado).
- **Período de observação**: a IA só opina numa dimensão depois de N dias com dados (tarefas 3, trabalho 3, sono 7 noites, lazer 7; ajustáveis no Admin; 0 desliga). Tarefas e trabalho liberam a análise completa; sono e lazer fora das conclusões enquanto não prontos. Tipos de notificação que dependem da IA (`longWork`, `weekly`, `balance`) só podem ser ligados depois disso.
- Regras do prompt: pt-BR direto, sem bajulação; nota reflete prioridades; horários partem dos padrões reais; lazer não é inimigo; metas/projetos lembradas quando "ontem" está pendente; compara números reais com as metas do usuário e diz se está dentro ou fora; memória guarda padrões, não detalhes do dia.
- **Visão da sessão de trabalho** (`POST /api/work/[id]/analise`): coach direto e gentil sobre uma sessão encerrada; limite 12/dia.
- **Organizar por importância** (`POST /api/lists/[id]/acoes` com `aiSort`): reordena as tarefas abertas da lista; grava desfazer.
- **Importar prints** (`src/lib/import.ts`): modelo com visão lê até 8 imagens; listas com o mesmo nome se fundem; tarefas repetidas descartadas; plano mostra o que já existe e o que será criado; tarefas já concluídas no print são opcionais.
- **Resetar inteligência** (`DELETE /api/ai/insight`): apaga `AiMemory` e `AiInsight` do usuário; tarefas, sono, lazer e metas ficam.

---

## 9. Notificações push — `src/lib/notifications.ts`

- Web Push com VAPID. Fluxo: o usuário ativa no Perfil (permissão do aparelho → `PushSubscription`), depois liga cada tipo. `sendToUser` envia a todos os aparelhos e remove inscrições mortas. O service worker mostra a notificação com ícone e abre `url` ao tocar (foca uma janela existente ou abre nova).
- Agendador: `src/instrumentation.ts` roda `tick()` 15 s após subir e a cada 5 min (só runtime Node, fora do build; `DISABLE_NOTIFICATION_SCHEDULER=1` desliga). Também pode ser disparado por cron externo em `POST /api/notificacoes/tick` com `Authorization: Bearer CRON_SECRET`. Janela de disparo: do horário alvo até alvo + 15 min (ou 60 min nos tipos diários); `NotificationLog` evita repetir no mesmo período.

| Tipo | Quando | Mensagem |
|---|---|---|
| `goalReminder` | 10:00, se há projeto com "ontem" sem marcação | "Marcou sua meta de ontem?" |
| `longWork` (IA) | trabalhou ≥ 5 h hoje | "Você já trabalhou Xh hoje" |
| `weekly` (IA) | segunda-feira 09:00 | "Seu resumo da semana" |
| `balance` (IA) | 20:00, lazer ou trabalho bem acima da média de 7 dias | "Lazer/Trabalho acima do seu normal hoje" |
| `overdue` | 09:00, há tarefas atrasadas | "N tarefas atrasadas" |
| `sleepLog` | 10:00, usa a aba Sono e não registrou hoje | "Como foi a noite?" |
| `reminders` | no horário de cada lembrete ativo (repetição diária/semanal avança a próxima data; se ficou muito para trás, avança até o futuro) | título e detalhe do lembrete; abre a tarefa ligada |
| `workEnded` | 10 min depois de a sessão encerrar sozinha (todas as tarefas de hoje feitas) | "Sessão de trabalho encerrada" com o total do dia |

Convites de quadro também geram push. `POST /api/notificacoes/teste` envia um teste.

---

## 10. API (todas as rotas)

Todas em `/api`, JSON, autenticadas pelo cookie (exceto `auth/login`, `auth/register`, `notificacoes/tick`). Erros: `{ error }` com status 400/401/403/404/429.

| Rota | Métodos | O que faz |
|---|---|---|
| `/auth/register`, `/auth/login`, `/auth/logout` | POST | Cadastro (`name,email,username,password`), login (`identifier,password`), sair |
| `/auth/me` | GET, PATCH | Usuário logado + `theme` + `design` + `allowRegistration`; editar nome/usuário/e-mail/avatar |
| `/auth/password` | POST | Trocar senha |
| `/boards` | GET, POST | Lista de quadros (resumo com notas) — `?listas=1` devolve só id, nome e listas de cada quadro; criar quadro |
| `/boards/[id]` | GET, PATCH, DELETE | Quadro completo (listas, cartões, membros, convites, último desfazer, média de minutos por tarefa); renomear/reordenar; excluir (dono) |
| `/boards/[id]/compartilhar` | POST, DELETE | Convidar por @; cancelar convite / remover membro / sair |
| `/boards/[id]/importar` | POST, PUT | Ler prints (plano); aplicar o plano |
| `/convites` | GET, POST | Convites pendentes; responder (aceitar/recusar) |
| `/usuarios/busca` | GET | Buscar usuários por @ ou nome |
| `/lists` | POST | Criar lista (`boardId,name,priority,kind`) |
| `/lists/[id]` | PATCH, DELETE | `name`, `priority`, `kind`, `toIndex` (reordenar), `boardId` (mover para outro quadro); excluir |
| `/lists/[id]/acoes` | POST | `copy`, `moveCards` (`toListId`), `archiveCards`, `pullPriority` (`priority`), `aiSort` |
| `/cards` | POST | Criar tarefa (`listId,title,priority,estimatedMinutes`) |
| `/cards/[id]` | GET, PATCH, DELETE | Ler; `title,description,priority,estimatedMinutes,scheduledFor`, `completed:true/false`; excluir |
| `/cards/[id]/acoes` | POST | `copy`, `archive` |
| `/cards/[id]/checklist` | POST, PATCH, DELETE | Adicionar item; marcar/renomear/reordenar; remover |
| `/cards/[id]/imagens` | POST, DELETE | Anexar (data URL); remover |
| `/cards/[id]/timer` | POST, DELETE | Iniciar / parar cronômetro da tarefa |
| `/cards/move` | POST | `cardId,toListId,toIndex` (lista pode ser de outro quadro) |
| `/imagens/[id]` | GET | Serve a imagem (só com acesso ao quadro) |
| `/recorrentes` | POST | Criar tarefa contínua (`listId,title,priority,estimatedMinutes,weekdays[]`); gera o card de hoje se for dia |
| `/recorrentes/[id]` | PATCH, DELETE | `weekdays`, `active`, `listId`; parar de repetir |
| `/undo` | GET, POST | Última ação desfazível; desfazer |
| `/arquivadas` | GET, DELETE | Listar (com busca); excluir todas |
| `/dashboard` | GET | Dados do dashboard de hoje (notas, contagens, histórico, trabalho, tarefas de hoje) |
| `/performance` | GET | Performance de hoje, constância, 14 dias (parâmetros de período para a revisão) |
| `/work` | GET, POST | Estado da sessão; `action: start/pause/end` |
| `/work/[id]` | DELETE | Apagar uma sessão |
| `/work/[id]/analise` | POST | Visão da IA sobre a sessão |
| `/ai/insight` | GET, POST, DELETE | Status/última análise (`?dia=`); gerar; resetar memória e histórico |
| `/settings` | GET, PATCH | `dailyGoalMinutes`, `theme`, `design` (só admin), `targets{sleepMinutes,bedtime,wake,leisureMinutes,performanceTarget}` |
| `/projetos`, `/projetos/[id]`, `/projetos/[id]/dias` | GET/POST, GET/PATCH/DELETE, POST | Projetos; marcar dia (`dayKey,done,note`) |
| `/sono`, `/sono/[id]` | GET/POST, DELETE | Noites e estatísticas; registrar (upsert por dia); apagar |
| `/lazer`, `/lazer/[id]` | GET/POST, PATCH/DELETE | Blocos e estatísticas; criar manual ou `start`; parar/editar; apagar |
| `/lembretes`, `/lembretes/[id]` | GET/POST, PATCH/DELETE | Lembretes (`?cardId=` filtra por tarefa; `?tarefas=1` lista tarefas abertas); criar (`title,note,at,repeat,cardId`); editar/arquivar; apagar |
| `/notificacoes` | GET, PATCH | Preferências e estado da IA (quais tipos podem ser ligados) |
| `/notificacoes/inscricao` | POST, DELETE | Registrar/remover o aparelho |
| `/notificacoes/teste` | POST | Enviar teste |
| `/notificacoes/tick` | POST | Rodada do agendador (cron externo, `CRON_SECRET`) |
| `/admin/settings` | GET, PATCH | `allowRegistration`, `aiMinDays*` |
| `/admin/users`, `/admin/users/[id]` | GET, PATCH/DELETE | Visão geral + usuários com custo de IA; `role`, `active`; excluir |

---

## 11. Design

### Tokens e utilitários (`src/app/globals.css`)
- Cores em `@theme` (não inline): `bg`, `surface`, `surface-2/3`, `card`, `card-hover`, `list`, `list-hover`, `line`, `line-2/3`, `fill`, `fill-2/3`, `well`, `grid`, `grid-2/3`, `ink`, `ink-2/3`, `on-ink`, acentos pastel `orange` (#f5b06e), `green` (#8be3a6), `blue` (#7fb7f5), `red` (#f08a8a) e tons `*-deep` (validados para gráficos no escuro). Tema claro redefine tudo em `:root[data-theme="light"]`.
- Utilitários: `card`, `pill`, `pill-orange/green/blue/red`, `btn`, `btn-primary`, `btn-ghost`, `input`, `blob-surface`, `no-scrollbar`, `live-dot`. Breakpoint extra `3xl` = 1800 px. Base de 15 px entre 768 e 1279 px.
- Prioridade: 1 Alta laranja, 2 Média azul, 3 Baixa verde.

### Design "Atelier" (v2, padrão de todos) vs. antigo (v1)
- `<html data-design="v2">` liga o Atelier; sem o atributo é o design antigo. Cookie `onerundred_design` + `Setting.design`; `DEFAULT_DESIGN = v2`. Só o admin pode salvar `v1` (botão em /admin, só na conta dele).
- Atelier mantém **as mesmas cores** do app (escuro e claro) e muda forma, tipografia e textura: trilho lateral no PC, faixa superior com a data em destaque e a hora, fontes Bricolage Grotesque (títulos, números grandes, logo), Instrument Sans (texto) e JetBrains Mono (etiquetas tipo carimbo em maiúsculas, que podem quebrar linha), grade de pontos no fundo por cima dos brilhos originais, cards sem sombra com borda de tinta, botões com cantos de 0,7 rem (sem sombra dura, sem "pulo"), botão principal no laranja do app, foco visível, sem granulado. Área do quadro não sangra para a largura da tela no PC (o trilho desloca o conteúdo).
- Fontes carregadas em `src/app/layout.tsx` via `next/font/google` (Geist para o v1; Bricolage/Instrument/JetBrains para o v2). Cabeçalhos: `.design-v1-only` / `.design-v2-only` escondem um ou outro por CSS.
- Decisões de gosto do usuário: nada de sombra deslocada ("infantil"); tudo discreto; cores originais; barra lateral recolhível.
- A skill `ui-ux-pro-max` está instalada em `.claude/skills/ui-ux-pro-max` (busca de estilos, paletas, tipografia, UX): `python3 -E -s .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system -p Onerundred`.

### Mobile
- Sempre preparar e conferir em 375 px e desktop. `flex-col` por padrão com `sm:`/`lg:` para colunas; `flex-wrap` em linhas com vários selos; `overflow-x-auto` em tabelas; listas do quadro com rolagem lateral e encaixe; arrasto por toque longo; `#app` com `overflow-x: clip`.

---

## 12. Histórico de decisões relevantes

- Áreas "Pessoal/Profissional" foram construídas e **revertidas** a pedido ("deixe como estava, tudo num só"); a migration `drop_areas` ficou no histórico.
- "Só dá deploy quando eu pedir": commits locais; push apenas quando o usuário manda publicar.
- Lista "Hoje" como referência da nota (vazia = 100%), "realocadas" contam contra o dia, atraso só em Hoje/Alta e começa ao entrar na lista.
- Sessão de trabalho não é cortada à meia-noite; conta no dia em que começou.
- Metas de projeto marcadas no dia seguinte; lembrete às 10h.
- Performance 0–100 com metas de sono/lazer; depois metas básicas centralizadas em Metas › Metas (saíram de Configurações, Sono e Lazer).
- Design 2.0 começou como prévia só para o admin (tokens teal/laranja), virou o "Atelier" (layout novo) e, aprovado ("eu gostei"), passou a ser o padrão de todos com o antigo guardado.
- Chave da OpenAI só em `.env`/Railway; recomendada rotação da chave usada em testes antigos (pendente).

---

## 13. Glossário

- **Nota**: percentual de peso concluído do período (tarefas).
- **Performance**: 0–100 do dia combinando tarefas, sono, lazer e metas.
- **Constância**: dias seguidos com performance ≥ alvo (padrão 70).
- **Realocada**: tarefa que saiu da lista Hoje sem ser feita naquele dia.
- **Atrasada**: aberta com dia passado numa lista Hoje ou normal de prioridade Alta.
- **Tarefa contínua**: tarefa que reaparece numa lista nos dias da semana escolhidos.
- **Sessão de trabalho**: cronômetro do dia (começar/pausar/encerrar) comparado ao planejado.
- **Período de observação**: dias mínimos com dados antes de a IA opinar numa dimensão.
- **Memória de hábitos**: resumo que a IA reescreve a cada análise e lê na seguinte.
- **Atelier**: o design atual (v2); **design antigo**: v1, guardado e acessível ao admin.
