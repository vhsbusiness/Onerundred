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
src/lib/work-cycle.ts     início persistido do ciclo de trabalho, inclusive pausas, para adiar recorrências na virada
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

## Atualização — Studio padrão global e fontes (29/10/2026)

Por instrução explícita do proprietário, Studio v3 deixa de ser uma prévia privada e passa a ser `DEFAULT_DESIGN` para todas as contas e para o login. Esta decisão substitui as restrições de prévia descritas acima. Contas comuns recebem v3 mesmo com cookies/preferências antigas; admins podem salvar uma escolha de comparação v2/v3 em `Setting.designPreview`, apenas na própria conta. O Atelier v2 e o clássico v1 continuam preservados. Nenhuma alteração de schema ou de dados de produção é necessária.

A tipografia do v3 foi unificada em Instrument Sans: texto, títulos, métricas, etiquetas e cronômetros de trabalho/lazer/tarefa usam a mesma família, mantendo os números tabulares. O cabeçalho com data e hora e o fundo pontilhado permanecem. Implementação preparada localmente; publicar somente mediante pedido explícito.


### Objetos e edição em grupo do mapa mental (03/11/2026)

`MindNode.detached` distingue textos/imagens soltos da raiz original (`parentId == null && !detached`). `imageData`, `imageWidth` e `imageHeight` guardam imagens e dimensões; `autoLayout` só pode ser alterado na ideia central. A migration aditiva `20261104010211_mind_canvas_objects` tem versões Postgres e SQLite e mantém os dados anteriores.

`mind-style.ts` valida os campos comuns para edição individual e em grupo. `mind-auto.ts` calcula posições dos ramos conectados. `mind-undo.ts` agrupa a ação original com as mudanças de posição, mantendo o bloqueio transacional do quadro e verificações de conflito. `MindFormat` atende uma seleção única ou múltipla; `MindMap` controla gestos, teclado, imagens e ferramentas. Imagens são retornadas apenas dentro dos dados autenticados do quadro, sem URL pública. `mind-image-client.ts` prepara arquivos/clipboard no navegador.

### Desenho livre do mapa (03/11/2026)

`MindNode.drawing` guarda geometria numérica em JSON (dimensões e até 4096 pontos), e `strokeWidth` guarda a espessura. A migration aditiva `20261104012108_mind_freehand` possui versões Postgres/SQLite; os valores padrão preservam todos os nós existentes. `mind-drawing.ts` valida dimensões/pontos, normaliza coordenadas e gera o caminho SVG, sem aceitar SVG ou HTML arbitrário.

A rota autenticada `/api/boards/[id]/mapa` só cria desenhos independentes; usa `writeMap`/`remember` e o mesmo controle de acesso, transação e histórico dos demais objetos. Formatação em lote reutiliza `mind-style.ts` e `/mapa/selecao`. O cliente reúne eventos do ponteiro, mostra o traço imediatamente e salva uma vez ao finalizar; um preview permanece enquanto a operação aguarda a fila. `mind-auto.ts` ignora os desenhos no cálculo de obstáculos. `mind-motion.ts` fornece a saída visual curta; a exclusão continua dependente do resultado do servidor. CSS local ao mapa desativa transições durante gestos e respeita `prefers-reduced-motion`.

### Importação formatada e mapa sem raiz (03/11/2026)

`MindImportTopic` representa `{ title, bold }`. O schema de visão e a prévia em `ImportModal` usam caminhos desses objetos; `PUT /mapa/importar` também aceita os caminhos de strings das versões anteriores. Emojis permanecem no texto Unicode, sem conversão para palavras ou HTML. A criação chama `positionBranch(..., "right")`; novos nós e alterações de negrito existentes entram na mesma transação/histórico. Não foi necessário mudar o banco.

Para o Miro, o upload mantém PNG, limitado a 2560 px na maior dimensão e ao limite existente de 6 MiB de data URL; se necessário usa JPEG com qualidade 0,95. O fluxo de imagem do Trello permanece em JPEG com largura máxima de 1600 px e qualidade 0,88. O modelo e a contagem de uso de IA continuam os mesmos.

A raiz agora pode ser removida em `/mapa` e `/mapa/selecao`. `mind-layout.ts` tolera ausência de raiz para novos ramos de textos soltos; o menu de criação também funciona em mapa vazio. A aplicação de importação cria uma nova central quando necessário. `mind-undo.ts` impede restaurar uma central apagada por cima de outra criada por um colaborador.

### Clipboard do mapa e múltiplas raízes (03/11/2026)

`mind-root.ts` define uma raiz por ausência de pai e de mídia. `mind-auto.ts` organiza cada árvore elegível; `mind-undo.ts` determina as raízes afetadas pela ação. A propriedade legada `detached` continua preservada, mas não impede que um texto independente tenha Auto. A colagem passa `layout=false` ao histórico para manter a geometria exata.

`mind-clipboard.ts` serializa a seleção como `ONERUNDRED_MAP_V1` com JSON versionado. `MindMap` integra eventos copy/paste, botões de toque e memória temporária. `POST /api/boards/[id]/mapa/colar` limita o corpo a 8 MiB e encaminha para `mind-copy.ts`, que valida campos, posições, mídias e hierarquia sem ciclos, gera novos IDs e grava tudo pela transação `writeMap`. Validação de imagens compartilhada em `mind-picture.ts`; nenhuma URL externa é buscada. A escrita é restrita ao quadro autorizado e ao mapa de origem do snapshot. Não há mudança de schema.

O desfazer da criação valida mudanças concorrentes, desliga pais entre os itens removidos e divide operações em lotes de 300 IDs para respeitar limites de parâmetros SQL e cascata de cadeias profundas no SQLite. Não exclui filhos de outros editores por cascata.

No lápis, listeners de Pointer Events no documento mantêm o gesto mesmo após lostpointercapture. `inkId` é um UUID de requisição restrito a desenhos; repetir a gravação retorna o objeto já salvo no mesmo quadro. A prévia aguarda o ID aparecer no snapshot; falhas mantêm os pontos em memória para retry. `BoardView` conserva o quadro durante falhas de atualização e usa sequência de requisições para descartar respostas antigas.

### Estrutura e ferramentas do mapa — 04/11/2026

`mind-tree.ts` resolve o conjunto de descendentes sem duplicação; `mind-size.ts` concentra dimensões de texto usadas no canvas e no layout; `mind-spacing.ts` mantém espaço das conexões ao mudar o tamanho, incluindo filhos em conjunto e bloqueio se isso exigiria mover um item fixado. `mind-auto.ts` distribui subárvores por bandas verticais e níveis horizontais. `mind-selection.ts` move a subárvore em transação, pausa Auto das raízes afetadas e pode salvar o título em edição na mesma ação. `mind-structure.ts` organiza uma árvore pontualmente ou reconecta/desconecta ramos, validando mesmo quadro e ausência de ciclos.

Rotas novas: `POST /api/boards/[id]/mapa/estrutura` (`organize`/`connect`) e `/refazer` (`actionId`). Ambas usam `writeMap`, com verificação de `boardAccess`. `MindUndo.undone` marca a posição do histórico por usuário; a inversão das ações mantém a validação de conflitos existente. `getBoard` retorna `mindUndoId` e `mindRedoId`. Edições novas descartam somente os itens de refazer do próprio usuário.

`MindNode.textWidth/textHeight` são anuláveis; null usa tamanho automático. UI inclui alça, botões, editor multilinha, busca/navegação e `MindConnect`. `mind-export.ts` serializa um SVG seguro usando APIs DOM, rasteriza PNG com dimensão limitada e exporta texto hierárquico. Não insere HTML de títulos nem carrega mídias externas. Importação de screenshots continua separada.

Migration aditiva `20261104023919_mind_text_size` para Postgres e SQLite: dimensões do texto e marcador de refazer. `npm run test:mind` executa testes puros do layout, tamanho, seleção de subárvore e direção dos filhos, sem banco ou rede. Comparação funcional e limites em [MIND_MAP_REFERENCE.md](MIND_MAP_REFERENCE.md).

### Arraste com reconexão e clipboard de texto — 04/11/2026

`mind-drop.ts` faz hit-test contra os limites dos destinos medidos no início do gesto; exclui a subárvore em movimento, mídia e ciclos. `MindMap` mostra o destino, continua movendo descendentes e chama a rota existente `/mapa/estrutura` ao soltar. `reconnectMindBranch` aceita opcionalmente o título em edição e grava título, pai e posições sob `writeMap`/`remember`, com histórico composto. Não há schema ou migration nova.

`mind-text-clipboard.ts` fornece um MIME específico para texto formatado, além de texto simples/HTML. A colagem usa somente uma lista permitida de atributos e passa pela validação existente de PATCH. HTML externo é interpretado em template inerte, nunca montado no DOM. `MindColors` usa portal dentro da seção do mapa (inclusive fullscreen), preservando os tokens locais de tema, e mantém preview/confirmação do seletor nativo de cores.
