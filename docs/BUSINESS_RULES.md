# Onerundred — Regras de negócio

> Parte da transferência de contexto. Cada regra aponta o arquivo onde vive.
> Mudar qualquer número aqui muda o que o usuário vê; a explicação em
> `src/components/settings/SettingsForm.tsx` e no README precisa acompanhar.

## 1. Prioridades, peso e nota (`src/lib/metrics.ts`)

- Prioridade da tarefa: 1 Alta (3 pontos), 2 Média (2), 3 Baixa (1). Prioridade da lista: 1 Alta ×1,5, 2 Média ×1, 3 Baixa ×0,5. Peso = pontos × multiplicador.
- Nota do período [início, fim) = peso concluído no período ÷ (peso concluído + peso aberto ao fim) × 100, arredondado. Sem nada a fazer → `null` ("sem tarefas").
- Aberta ao fim: existia antes do fim, não concluída, não arquivada, `scheduledFor ≤ último dia` e, se existe alguma lista do tipo `today` no conjunto, só se estiver nessa lista. A lista Hoje conta como referência **mesmo vazia** (tudo feito ou realocado = 100%). O dashboard decide isso pela existência da lista (`hasTodayList`), e o balão da nota mostra também a nota com todas as listas (`allLists`).
- Realocada: `CardPostponement(cardId, dayKey)` é criado quando uma tarefa sai da lista Hoje sem estar concluída; naquele dia ela pesa como aberta e aparece em `postponedCount`. Voltar para a Hoje ou concluir no mesmo dia apaga a realocação do dia (`registerPostponement` em `repo.ts`).
- Atrasada (`isOverdue`): aberta, `scheduledFor < hoje`, e a lista é `today` ou `normal` com prioridade Alta. Amanhã e listas Média/Baixa nunca atrasam.
- Tom da nota (`scoreTone`): ≥ 80 verde, ≥ 50 azul, < 50 laranja, `null` neutro.
- Veredito do trabalho (`workVerdict`): trabalhado ÷ planejado ≥ 1 "Meta batida"; ≥ 0,7 "No ritmo"; ≥ 0,35 "Abaixo do planejado"; senão "Começando o dia"; planejado 0 → "Sem meta para hoje".
- Sequência ≥ 70% (dashboard): dias seguidos com nota das tarefas ≥ 70.

## 2. Efeitos de lista e movimentação (`kindEffects`, `moveCard`, `registerPostponement` em `src/lib/repo.ts`)

- Entrar em `done` (Feitas): `completedAt = agora`; data futura vira hoje; cronômetro da tarefa encerra; pode encerrar a sessão de trabalho sozinha (ver §4).
- Sair de Feitas: reabre (`completedAt = null`).
- Entrar em `tomorrow` (Amanhã): se a data é hoje ou passada, vira amanhã.
- Entrar em lista normal/Hoje com data futura: vira hoje.
- Entrar em Hoje ou normal Alta vinda de outra lista com data passada: a data vira hoje (o atraso começa a contar da entrada), **exceto** se a tarefa já foi realocada antes (mantém a data; o atraso continua).
- Mover entre quadros é permitido (`/api/cards/move` com lista de outro quadro; `PATCH /api/lists/[id] { boardId }` move a lista inteira para o fim do outro quadro). `moveAllCards` (mover todas as tarefas) continua restrito ao mesmo quadro.
- Posições são reescritas em sequência (0..n) nas listas de origem e destino a cada movimento.

## 3. Manutenção diária (`runMaintenance` em `src/lib/repo.ts`)

Roda em leituras relevantes, no máximo uma vez por minuto por instância e sempre quando o dia vira:
1. Arquiva tarefas com `completedAt` anterior ao início de hoje.
2. Fecha sessões de trabalho e cronômetros de tarefa abertos há mais de 16 h, com `endedAt = início + 16 h` (`FORGOTTEN_AFTER_MS`). Sessões normais atravessam a meia-noite.
3. Move tarefas de listas Amanhã com `scheduledFor ≤ hoje` para a lista Hoje do quadro (ou a primeira lista normal), no fim.
4. Gera os cards das tarefas contínuas do dia (ver §6).
5. Apaga `AuthSession` expiradas.
6. Marca "não feito" (`auto = true`) nos dias de projeto anteriores a ontem sem marcação (`autoMarkMissedDays`).
7. Encerra cronômetros de lazer de dias anteriores (`autoStopForgottenLeisure`).

## 4. Sessão de trabalho e cronômetros (`src/lib/repo.ts`)

- Só uma `WorkSession` aberta por usuário; só um `TaskSession` aberto por usuário (iniciar outro fecha o anterior).
- Começar/retomar: abre sessão e limpa `workEndedDay`. Pausar: fecha sessão e cronômetro de tarefa. Encerrar: pausa + `workEndedDay = hoje`.
- Estado do dia: sessões iniciadas hoje (contam inteiras no dia em que começaram) mais a que estiver rodando.
- Planejado do dia = soma das estimativas das tarefas abertas de hoje; se 0, `dailyGoalMinutes` (padrão 480).
- Iniciar o cronômetro de uma tarefa com a sessão pausada/encerrada reabre a sessão (`startTaskTimer`).
- Marcar o último item do checklist como feito inicia a tarefa (`updateChecklistItem`).
- Encerramento automático (`maybeAutoEndWork`): ao concluir uma tarefa, se não resta tarefa aberta de hoje (na lista Hoje; ou em qualquer lista que não seja Feitas se não houver lista Hoje) e a sessão não está encerrada, encerra e grava `Setting.workAutoEndedAt`; a notificação `workEnded` sai 10 min depois.
- "Para terminar hoje": estimativas das abertas de hoje; sem estimativa usa a média histórica (`averageTaskMinutes`: média do cronômetro das concluídas nos últimos 30 dias se houver ≥ 3 medições ≥ 1 min, senão média das estimativas, senão 30 min).

## 5. Performance e constância (`src/lib/performance.ts`)

- Pesos: tarefas 40, sono 25, lazer 15, metas 20; média ponderada só entre as frentes com dado no dia. Dia sem tarefas, sono e metas → sem nota (lazer sozinho não define).
- Sono: média de (duração ÷ meta, máx. 100), pontualidade ao deitar (se há `bedtimeTarget`), pontualidade ao acordar (se há `wakeTarget`). Pontualidade = 100 − 20 pontos por 30 min de atraso, com ajuste de virada da noite para deitar. Meta de sono padrão 8 h.
- Lazer: minutos ÷ meta (padrão 60 min), máx. 100.
- Metas: dias feitos ÷ (feitos + não feitos) dos projetos naquele dia; dias de hoje em diante mostram "marca-se amanhã".
- Constância: dias seguidos (até hoje) com performance ≥ `performanceTarget` (padrão 70, `PERF_GOOD`); hoje só entra se já está no alvo e não quebra a sequência. Calculada sobre 60 dias.
- Revisão de período: médias de performance e nota de tarefas, feitas, realocadas, trabalho, lazer, sono médio, constância. Intervalo de 2 a 90 dias.

## 6. Tarefas contínuas (`RecurringTask`, `src/lib/repo.ts`, `/api/recorrentes`)

- `weekdays` "0..6" (0 = domingo), padrão seg–sex. Ativa por padrão.
- Criar já gera o card de hoje se hoje é um dos dias. A manutenção gera um card por dia (idempotente: `lastSpawnedKey` + verificação de card existente). Lista Amanhã agenda o card para amanhã.
- Pausar (`active=false`) não apaga nada; parar (DELETE) apaga a regra e os cards existentes ficam (`recurringId` → null).

## 7. Metas › Projetos (`src/lib/projects.ts`)

- `days` 1–365 ou 0 = sem fim (mostra alguns dias futuros). O dia marcável é sempre **ontem** (`markDayKey`); futuros não podem ser marcados.
- Dias anteriores a ontem sem marcação viram "não feito" automaticamente; o usuário pode corrigir (há aviso para marcar feito só se cumpriu). Lembrete push às 10:00 quando ontem está pendente.

## 8. Sono e lazer (`src/lib/sleep.ts`, `src/lib/leisure.ts`)

- Sono: uma noite por `dayKey` (dia em que acordou; upsert). Horas HH:MM: acordei é no próprio dia; deitei/dormi são do dia anterior quando maiores que a hora de acordar. Latência > 12 h rejeitada. Médias de 7/30 dias; horários médios com média circular.
- Lazer: bloco pertence ao dia em que começou; "até" < "de" significa que atravessou a meia-noite (o dia informado é o do fim). Bloco > 16 h rejeitado. Cronômetro: começar encerra qualquer outro em andamento. Atividades padrão: Jogos, Séries e filmes, Redes sociais, Esporte, Social, Leitura, Outro.

## 9. Lembretes (`src/lib/reminders.ts`)

- `repeat` `none|daily|weekly`. Lembrete único com `at` no passado (mais de 1 min) é rejeitado. Editar `at` reativa. Pode ter `cardId` (criado de dentro da tarefa; o formulário da aba Lembretes não oferece seleção de tarefa). Ao disparar, lembretes únicos ficam inativos (arquivados); repetitivos avançam a próxima data (se ficaram muito para trás, avançam até o futuro).

## 10. IA (`src/lib/ai.ts`, `src/lib/import.ts`, `src/lib/admin.ts`)

- Limites: 12 análises do dia por usuário por dia (`MAX_GENERATIONS_PER_DAY`), 12 visões de sessão por dia.
- Período de observação: dimensões precisam de N dias com dados (padrão tarefas 3, trabalho 3, sono 7 noites, lazer 7; `AppSetting`, 0 desliga). Tarefas + trabalho prontos liberam a análise completa; sono e lazer ficam fora das conclusões até ficarem prontos.
- A memória de hábitos (`AiMemory.summary`, até 1200 caracteres) é reescrita por completo a cada análise e entra na seguinte.
- A IA recebe as metas do usuário e deve dizer se ele está dentro ou fora de cada uma; metas `null` não são inventadas.
- Modelos gpt-5/o* recebem `reasoning_effort: low`, nunca `temperature`.
- Custo estimado: `AI_PRICE_INPUT_PER_M` (padrão 0,25 USD) e `AI_PRICE_OUTPUT_PER_M` (padrão 2 USD) por milhão de tokens.
- Importar prints: até 8 imagens, cada uma ≤ 6 MiB em base64; listas com o mesmo nome se fundem; tarefas duplicadas descartadas; só cria o que não existe.

## 11. Notificações (`src/lib/notifications.ts`)

- Tudo desligado por padrão, exceto `workEnded`. Tipos que dependem da IA (`longWork`, `weekly`, `balance`) só podem ser ligados após o período de observação de tarefas + trabalho.
- Janela: do horário alvo até +15 min (tick a cada 5 min) ou +60 min nos tipos diários; `NotificationLog(type, period)` impede repetição.
- Horários: `goalReminder` 10:00; `longWork` quando ≥ 5 h trabalhadas; `weekly` segunda 09:00; `balance` 20:00; `overdue` 09:00; `sleepLog` 10:00; `reminders` no horário; `workEnded` 10 min após o encerramento automático.

## 12. Contas (`src/lib/auth.ts`, `src/lib/admin.ts`)

- Primeiro usuário cadastrado vira admin. `AppSetting.allowRegistration` fecha o cadastro. Admin pode promover/rebaixar, desativar (derruba a sessão), reativar e excluir contas (cascata total).
- Avatar: data URL JPEG/PNG/WebP ≤ 300 KB.

## 13. Preferências de design

- `DEFAULT_DESIGN = "v2"` (Atelier) para todos; `Setting.design = "v1"` só pode ser salvo por admin, e `/api/auth/me` devolve `v2` para não-admins mesmo que exista outro valor.
- `DEFAULT_THEME = "dark"`.

## Comparação do design privado (v3)

- O padrão global continua `DEFAULT_DESIGN = "v2"`.
- Somente a conta proprietária com papel admin recebe Studio v3; outros admins e usuários continuam com seus visuais permitidos.
- Para o proprietário, o botão no painel alterna **Studio v3 ↔ Atelier v2**. Assim, "design anterior" agora significa o Atelier, não a versão clássica v1.
- A troca só é aplicada após a API confirmar o salvamento e persiste entre aparelhos. Ela não promove a versão para outras contas.
- Os cálculos, cronômetros, tarefas e demais regras de negócio não foram alterados por esta prévia.
