# Onerundred — Arquitetura

> Parte da transferência de contexto (ver `docs/PROJECT_OVERVIEW.md`). Sem segredos.
> Itens **[não confirmado]** precisam de verificação.

## 1. Stack

| Camada | Tecnologia | Observações |
|---|---|---|
| Framework | Next.js 16.4.2, App Router, Turbopack | Versão com mudanças em relação ao conhecimento comum dos modelos: leia `node_modules/next/dist/docs/` antes de usar APIs do Next (ver `AGENTS.md`). |
| UI | React 19.3, TypeScript 5, Tailwind CSS v4, lucide-react | ESLint com regras do React Compiler (`react-hooks/*`) ativas. |
| Dados | Prisma 7.10 com adaptadores: `@prisma/adapter-pg` (produção) e `@prisma/adapter-better-sqlite3` (dev) | Client gerado em `src/generated/prisma` (fora do git). |
| Arrastar e soltar | @dnd-kit core/sortable/utilities | Ids de lista com prefixo `list:` (`LIST_SORT_PREFIX`). |
| Datas | date-fns 4 | Chaves `yyyy-MM-dd` no fuso do servidor (`TZ`). |
| IA | SDK `openai` 7 | Chat completions com `response_format: json_schema` estrito. |
| Push | `web-push` 3 + `public/sw.js` | VAPID. |
| Hospedagem | Railway (RAILPACK), `railway.json` | Healthcheck em `/`, restart ON_FAILURE até 5 vezes. |

## 2. Estrutura de diretórios e responsabilidades

```
AGENTS.md, CLAUDE.md, README.md, docs/      documentação (ver PROJECT_OVERVIEW)
railway.json                                 build/start do Railway
next.config.ts                               serverExternalPackages (prisma, pg, better-sqlite3) + loader Tailwind no Turbopack
prisma.config.ts                             escolhe schema e pasta de migrations pela DATABASE_URL (deriva schema SQLite)
prisma/schema.prisma                         FONTE DA VERDADE (provider postgresql)
prisma/schema.sqlite.prisma                  GERADO, ignorado pelo git — não editar
prisma/migrations/                           migrations Postgres (aplicadas no deploy)
prisma/migrations-sqlite/                    migrations SQLite (só dev)
prisma/dev.db                                banco local (ignorado)
scripts/pg-migration.mjs                     gera migration Postgres por diff do schema contra o git HEAD
public/sw.js, public/icons/                  service worker de push e ícones PWA
.claude/launch.json                          previews do app Claude (pode ser ignorado no Codex)
.claude/skills/ui-ux-pro-max/                skill de design (dados CSV + scripts Python); não afeta o app

src/app/layout.tsx          html com data-theme/data-design, fontes (Geist; Bricolage, Instrument Sans, JetBrains Mono), Nav, ConfirmProvider, script que aplica a largura salva do trilho
src/app/page.tsx            dashboard de hoje / revisão de dia / revisão de período (por query string)
src/app/<rota>/page.tsx     páginas finas: requireUserPage() + um client component
src/app/api/**/route.ts     rotas JSON; validam entrada e chamam src/lib
src/app/globals.css         tokens de tema (@theme), utilitários, tema claro, design Atelier (v2)
src/app/manifest.ts         manifesto PWA; src/app/icon.svg|png favicon
src/proxy.ts                "middleware": sem cookie de sessão → 401 (API) ou redirect /login
src/instrumentation.ts      inicia o agendador de notificações (setInterval 5 min, runtime Node)

src/components/Nav.tsx                cabeçalho v1, trilho lateral + faixa v2, barra inferior mobile, menu do usuário, sincronização de tema/design
src/components/InviteBell.tsx         sininho de convites
src/components/board/                 BoardView (quadro, dnd), ListColumn (lista + menu + formulário), CardItem, CardModal, CardContextMenu, ImportModal, ShareModal
src/components/boards/BoardsGrid.tsx  grade de quadros
src/components/dashboard/             Dashboard, WorkTimer, TodayTasks, AiInsightCard, PerformanceCard, HistoryChart, DayPicker, DayReview, PeriodReview
src/components/metas/                 MetasTabs (header + subabas), ProjectsPage, ProjectDetail, TargetsPage (metas básicas), confirmDone
src/components/sleep/, leisure/, reminders/, archive/, profile/, settings/, admin/, auth/
src/components/ui/                    Modal, ConfirmProvider (askConfirm/notify), Tip, DateField + CalendarPopover, TimeField

src/lib/repo.ts           regra de negócio e acesso ao banco: quadros, listas, tarefas, cronômetros, sessão de trabalho, settings, dashboard, revisão do dia, arquivadas, tarefas contínuas, undo, manutenção diária
src/lib/metrics.ts        funções puras: peso, nota do período, atraso, tom, veredito de trabalho
src/lib/performance.ts    performance diária, constância, revisão de período
src/lib/ai.ts             análise do dia, observação, visão de sessão, organizar lista, reset
src/lib/import.ts         importação de prints (IA com visão)
src/lib/notifications.ts  push, preferências, regras, tick
src/lib/reminders.ts      lembretes
src/lib/projects.ts       metas › projetos
src/lib/sleep.ts          sono
src/lib/leisure.ts        lazer
src/lib/sharing.ts        compartilhamento de quadros
src/lib/admin.ts          painel admin, AppSetting, custo de IA
src/lib/auth.ts           hash de senha, sessão, cadastro, login, perfil
src/lib/current-user.ts   getCurrentUser/requireUser/requireAdmin/requireUserPage/requireAdminPage
src/lib/api.ts            json(), readBody(), handle(), withUser(), withAdmin(), validadores
src/lib/errors.ts         ApiError(status, message)
src/lib/client.ts         http (get/post/patch/put/del), useNow, elapsedSince, priorityUi, TONE_*, formatPercent
src/lib/db.ts             PrismaClient com o adaptador certo
src/lib/database-url.ts   resolveDatabaseUrl/isSqliteUrl/isPostgresUrl
src/lib/time.ts           dayKey/todayKey/tomorrowKey/keyToDate/dayRange/weekRange/monthRange/formatDuration/formatClock/…
src/lib/theme.ts          Theme (dark|light), Design (v1|v2), cookies, themeColorFor
src/lib/theme-client.ts   currentTheme/applyTheme/currentDesign/applyDesign (lado do navegador)
src/lib/images.ts         utilidades de imagem (data URL, clipboard)
src/lib/types.ts          todos os DTOs (CardDTO, ListDTO, BoardDTO, DashboardDTO, PerformanceDTO, SettingsDTO, ReminderDTO, …)
```

## 3. Fluxo de uma requisição

1. `src/proxy.ts` (matcher: tudo menos `_next/static`, `_next/image`, favicon, ícones, manifesto, `sw.js`, `icons/`) deixa passar rotas públicas (`/login`, `/api/auth/*`, `/api/notificacoes/tick`); sem cookie `onerundred_session`, API recebe 401 e páginas vão para `/login?next=…`.
2. Página (server component) chama `requireUserPage()` → `getCurrentUser()` valida o token em `AuthSession` (não expirado, usuário ativo) e renderiza o client component, às vezes já com dados (`page.tsx` do dashboard busca `getDashboard`, `getAiStatus`, `getPerformance`).
3. Client components usam `http` (`src/lib/client.ts`) contra `/api/**`. Rotas são `withUser(async (user, req, ctx) => …)` ou `withAdmin`; erros `ApiError` viram `{ error }` com status; respostas levam `Cache-Control: no-store`.
4. Toda função de `src/lib/repo.ts` recebe `userId` e filtra com `boardAccess(userId)` (dono OU membro do quadro) na cadeia quadro → lista → tarefa.
5. Leituras relevantes (dashboard, quadro, performance, lista de quadros) chamam `runMaintenance()` antes (no máximo uma vez por minuto por instância; sempre na virada do dia).

## 4. Banco de dados

- `prisma/schema.prisma` é a única fonte; `provider = "postgresql"`. Em dev, `prisma.config.ts` lê a `DATABASE_URL`; se começar com `file:`, gera `prisma/schema.sqlite.prisma` (provider sqlite) e aponta a CLI para ele e para `prisma/migrations-sqlite`. Sem `DATABASE_URL` no build, usa um placeholder Postgres só para `prisma generate`.
- `src/lib/db.ts` escolhe o adaptador pela mesma URL. `src/lib/database-url.ts` tem a lógica compartilhada.
- Modelos (31): User, AuthSession, Board, BoardMember, BoardInvite, List, Card, TaskSession, WorkSession, Setting, AppSetting, AiInsight, AiMemory, AiUsage, SleepLog, Project, ProjectDay, LeisureLog, CardImage, RecurringTask, CardPostponement, ChecklistItem, UndoAction, PushSubscription, NotificationPref, NotificationLog, Reminder. Campos e semântica completos em `docs/INTELIGENCIA.md` §4.
- Chaves de `Setting` por usuário: `dailyGoalMinutes`, `theme`, `design`, `sleepTargetMinutes`, `bedtimeTarget`, `wakeTarget`, `leisureTargetMinutes`, `performanceTarget`, `lastBoardId`, `workEndedDay`, `workAutoEndedAt`. `AppSetting`: `allowRegistration`, `aiMinDaysTasks`, `aiMinDaysWork`, `aiMinNightsSleep`, `aiMinDaysLeisure`.
- Imagens de tarefa e avatares ficam no banco como data URL (sem storage externo).
- Migrations Postgres (ordem): init, users, ai_insights, sleep_logs, projects, leisure, user_avatar, card_images, undo_actions, notifications, ai_usage, board_sharing, areas, drop_areas, checklist, today_lists, postponements, work_ended_pref, reminder_card, recurring_tasks. A pasta SQLite tem as equivalentes (algumas escritas à mão, ver DEVELOPMENT).

## 5. Autenticação e autorização

- Senha: scrypt (salt 16 bytes, chave 64 bytes), formato `scrypt$salt$hex`, comparação em tempo constante. Regras: nome ≥ 2, e-mail válido, usuário `[a-z0-9_.]{3,24}`, senha ≥ 8.
- Sessão: token aleatório = `AuthSession.id`, cookie httpOnly `onerundred_session`, 30 dias; sessões expiradas apagadas na manutenção. Logout apaga a sessão.
- Papéis: `user` e `admin` (primeiro cadastrado). `withAdmin`/`requireAdminPage` protegem `/admin` e `/api/admin/*`. Trocar o `design` em `/api/settings` é só admin.
- Compartilhamento: membros têm acesso igual ao dono, menos excluir o quadro e gerenciar membros.

## 6. Integrações externas

| Integração | Onde | Como |
|---|---|---|
| OpenAI | `src/lib/ai.ts`, `src/lib/import.ts` | `OPENAI_API_KEY`, `OPENAI_MODEL` (padrão `gpt-5-mini`), `OPENAI_IMPORT_MODEL`. Sem chave, a IA fica desativada e o resto funciona. Uso gravado em `AiUsage` (custo estimado com `AI_PRICE_*`). |
| Web Push | `src/lib/notifications.ts`, `public/sw.js`, `src/instrumentation.ts` | `VAPID_PUBLIC_KEY`/`PRIVATE_KEY`/`SUBJECT`. Agendador interno (5 min) ou cron externo em `POST /api/notificacoes/tick` com `CRON_SECRET`. |
| Railway | `railway.json` | Build `npm run build`, start `npm run start` (migrate deploy + next start). Deploy automático a cada push em `main`. |
| GitHub | `origin` | `git@github.com:vhsbusiness/Onerundred.git`. |

Não há integração de pagamento, e-mail, analytics ou storage externo.

## 7. Front-end: tema e design

- Cores são variáveis em `@theme` (não inline) em `src/app/globals.css`; tema claro em `:root[data-theme="light"]`. Nunca usar cores fixas em componentes (quebra o tema claro).
- `<html data-theme>` vem do cookie `onerundred_theme`; `<html data-design="v2">` do cookie `onerundred_design` (padrão v2 = Atelier). `/api/auth/me` devolve `theme` e `design` e o `Nav` aplica se diferirem do que está na tela.
- Atelier (v2): blocos CSS sob `:root[data-design="v2"]`, trilho `.v2-rail` (76/208 px; `data-rail="expanded|collapsed"` no html, salvo em `localStorage.onerundred_rail`), cabeçalhos `.design-v1-only`/`.design-v2-only`, `.board-scroller` sem sangria no PC. Fontes do v2 via `next/font/google` no layout.
- Utilitários: `card`, `pill`, `pill-orange|green|blue|red`, `btn`, `btn-primary`, `btn-ghost`, `input`, `blob-surface`, `no-scrollbar`, `live-dot`. Breakpoint `3xl` = 1800 px.

## 8. Lacunas desta seção

- **[não confirmado]** O conteúdo exato de `src/app/manifest.ts` e `src/lib/images.ts` não foi relido para este documento; os nomes das funções vêm dos exports.
- **[não confirmado]** Parâmetros aceitos por `GET /api/performance` para períodos (a UI usa `getPeriodReview` pelo `page.tsx`; a rota pode aceitar query de período).

## Prévia privada v3

`src/app/design-v3.css` contém os estilos isolados sob `data-design="v3"`. Os seletores v2 continuam preservados, e a navegação lateral existente é reutilizada. `src/lib/design-preview.ts` é exclusivamente de servidor e restringe a elegibilidade à identidade da conta proprietária com papel admin; promover outro usuário não libera a prévia.

`getSettings` resolve o design efetivo: o proprietário entra em v3 quando não há escolha específica de prévia; a chave `Setting.designPreview` guarda v2/v3 depois de comparar. A preferência antiga em `Setting.design` é preservada. Não existe migração de schema. O layout consulta a sessão e a preferência efetiva no servidor: forjar o cookie de design não libera v3. A API `/api/auth/me` informa `canPreviewDesign` para o painel, sem enviar o critério privado ao bundle do cliente. PATCH `/api/settings` rejeita v3 para qualquer outra conta.
