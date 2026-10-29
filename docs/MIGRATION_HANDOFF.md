# Onerundred — Transferência de contexto (Claude Code → OpenAI Codex)

> Gerado em 28/10/2026. Nada de segredos. Itens **[não confirmado]** devem ser
> verificados antes de virar decisão.

## 1. Estado atual

- Branch `main` limpa; último commit publicado em produção: "Mover tarefas e listas entre quadros" + "docs: arquivo de inteligência". Tudo que está em `main` está no ar em `https://app.onerundred.com`.
- Banco de produção: Postgres do Railway com todas as migrations de `prisma/migrations` aplicadas (a última é `20261028005615_recurring_tasks`).
- Não há trabalho em andamento nem branch pendente.

## 2. Quem usa e como pede

- Usuário único de fato: o dono (admin). Ele pede funções em português, uma por vez, muitas vezes por áudio transcrito (texto informal, com erros de digitação). Ele avalia no app em produção e no celular.
- Fluxo que ele espera: implementar → conferir em celular (375 px) e PC → commit local → **perguntar se pode publicar** → só então `git push`.

## 3. Preferências e decisões registradas (memória do agente anterior)

1. **Deploy só quando ele pedir** (19/10/2026): push dispara o Railway; commits ficam locais até ele dizer "publicar".
2. **Sempre celular e PC** (26/10/2026): toda função nova ou ajuste visual é preparado e conferido em 375 px e desktop antes de ser entregue (`flex-col` por padrão, `sm:`/`lg:` para colunas, `flex-wrap`, `overflow-x-auto`).
3. **Nada de áreas Pessoal/Profissional**: foi implementado e revertido no mesmo dia (19/10); não propor de novo.
4. **Lista "Hoje" é a referência da nota**; realocadas contam contra o dia; atraso só em Hoje/Alta e começa ao entrar na lista.
5. **Sessão de trabalho não é cortada à meia-noite**; conta no dia em que começou.
6. **Metas de projeto são marcadas no dia seguinte** ("fiz ontem"), lembrete às 10h.
7. **Design Atelier (v2) aprovado e padrão para todos** (27/10): cores originais do app (ele rejeitou a paleta papel/noturno), sem sombras duras ("infantil"), tudo discreto (ex.: a opção de tarefa contínua é um link pequeno "repetir…"), barra lateral recolhível. O design antigo (v1) fica guardado e acessível ao admin em `/admin`.
8. **Confirmações e avisos só pelo `ConfirmProvider`** (`askConfirm`, `notify`); nunca `alert/confirm` nativos. Datas pelo `DateField`, horas pelo `TimeField`.
9. **Botões de "desfazer" com cor de destaque**; IA só sugere/organiza com desfazer disponível.
10. **Chave da OpenAI** só em `.env` e nas variáveis do Railway; nunca em código, git ou mensagens.
11. **Não criar contas nem digitar senhas em produção**; testes com contas locais no SQLite.
12. **Não apagar dados de produção sem OK explícito.**

## 4. Problemas conhecidos e limitações

- `prisma migrate dev` no SQLite local às vezes acusa drift; o contorno é SQL escrito à mão em `prisma/migrations-sqlite` + `prisma migrate deploy` (ver `docs/DEVELOPMENT.md` §5).
- `next dev` reescreve o bloco `nextjs-agent-rules` em `AGENTS.md`; manter o bloco evita diff eterno.
- Avatares e imagens de tarefa ficam no banco como data URL; cresce o Postgres se houver muito uso (limite por imagem e por tarefa existem).
- Sem testes automatizados; sem CI.
- O agendador de notificações é um `setInterval` dentro do processo Next; com mais de uma instância, cada uma roda o tick (o `NotificationLog` evita envios duplicados por período). **[não confirmado]** quantas réplicas o Railway roda (presume-se 1).
- Em dev, o painel de navegador do app Claude entrava em loop com HMR; não afeta produção.
- Quadro compartilhado: membros recebem as tarefas nas próprias métricas (decisão de produto, não bug).
- Arrastar com dnd-kit não é simulável por automação de navegador do agente anterior; reordenação foi testada manualmente pelo dono.

## 5. Pendências abertas (nenhuma é bloqueante)

- Excluir o projeto Railway duplicado "Onerundred" (vazio, criado por engano em 18/10); aguarda OK do dono. **[não confirmado]** se ainda existe.
- Rotacionar a chave da OpenAI que foi colada no chat em 18/10 (recomendado ao dono; não há como confirmar se foi feito).
- Ideias já conversadas, não pedidas formalmente: mais usos da IA (planejar a semana, relatório semanal), rotina/horários de trabalho, recuperação de senha.
- Conta admin "desejada" no início era usuário `adm`; a conta real em produção é a do dono (primeiro cadastro). **[não confirmado]** qual username ele usa hoje.

## 6. Regras essenciais para não quebrar nada

1. Toda função de `src/lib/repo.ts` recebe `userId` e filtra por `boardAccess(userId)`; nunca consultar `Card`/`List` sem esse filtro.
2. Não mexer em `src/lib/metrics.ts` ou `src/lib/performance.ts` sem atualizar `SettingsForm.tsx`, o README e `docs/BUSINESS_RULES.md`.
3. Datas de agendamento são `yyyy-MM-dd` do fuso do servidor; não converter para UTC nem usar `toISOString().slice(0,10)`.
4. `runMaintenance()` tem efeitos colaterais (arquiva, move, gera cards); não chamar em loops nem em rotas de escrita sem necessidade.
5. Mudança de schema = editar `prisma/schema.prisma` + migration SQLite + migration Postgres (`db:pg-migration` **antes** do commit) + `prisma generate`. Nunca editar `schema.sqlite.prisma`.
6. Cores novas em componentes devem usar tokens (`text-ink-2`, `bg-surface`, `pill-blue`…); valores fixos quebram o tema claro e o Atelier.
7. Ao adicionar hooks em componentes com `return null` antecipado (ex.: `CardModal`), declare-os antes do retorno (lint `rules-of-hooks`).
8. Novas rotas: `withUser`/`withAdmin`, validar com os helpers de `src/lib/api.ts`, devolver `json()`. Rotas públicas precisam entrar em `PUBLIC_PREFIXES` do `src/proxy.ts`.
9. Não remover `.design-v1-only`/`.design-v2-only` nem os blocos `:root[data-design="v2"]`: o design antigo deve continuar funcionando para o admin.
10. `DEFAULT_DESIGN`/`DEFAULT_THEME` e os cookies `onerundred_theme`/`onerundred_design` são lidos no `layout.tsx` para evitar piscar; manter SSR consistente com o cliente (`suppressHydrationWarning` no `<html>`).
11. Push: `NotificationLog` é o que impede repetição; qualquer tipo novo precisa de `alreadySent/markSent` e janela de disparo.
12. IA: manter `json_schema` estrito, limites diários e o registro em `AiUsage`; não enviar dados de outros usuários no payload.
13. Antes de entregar: `tsc`, `eslint`, build de produção local e conferência em 375 px + desktop. Commit local; push só com autorização.

## 7. Como o Codex deve continuar

1. Ler `AGENTS.md`, depois `docs/PROJECT_OVERVIEW.md`, `docs/ARCHITECTURE.md`, `docs/BUSINESS_RULES.md`, `docs/DEVELOPMENT.md`. Para detalhe fino (tabela completa da API, campos do banco), `docs/INTELIGENCIA.md`.
2. Antes de usar APIs do Next.js, ler `node_modules/next/dist/docs/` (versão 16 difere do conhecimento comum).
3. Reproduzir o fluxo de verificação (seção 4 de DEVELOPMENT) e só então commitar.
4. Perguntar ao dono antes de publicar, excluir dados, mexer em Railway ou tocar em contas de produção.
5. Ao mudar comportamento, atualizar o documento correspondente em `docs/` no mesmo commit.

## 8. Lacunas desta transferência

- Não foi possível confirmar fora do repositório: estado da CLI do Railway, existência do projeto duplicado, rotação da chave da OpenAI, número de réplicas em produção, proteção de branch no GitHub.
- Os arquivos de memória do agente anterior ficam fora do repositório (diretório do Claude Code na máquina do dono); o conteúdo relevante foi transcrito nas seções 3 a 5.
- Não há registro formal de requisitos; a história das decisões está nas mensagens de commit (`git log`), no README e aqui.

## Atualização local de 29/10/2026 — Studio v3

A prévia visual privada está implementada (ver ARCHITECTURE, seção "Prévia privada v3"). A identidade elegível é verificada no servidor; manter a prévia restrita ao proprietário até nova instrução. Não alterar `DEFAULT_DESIGN` para v3 como forma de publicar: isso afetaria outras contas. Para o proprietário, o comparador usa v2 como versão anterior; v1 permanece guardada. A reversão do teste temporário de cor no botão Admin está incluída. Não houve publicação desta alteração.

**Limitação encontrada na preparação do teste:** o histórico SQLite de um banco vazio falha em `20261018222608_drop_areas` porque tenta remover a coluna `area`, ausente naquele ponto. Não foi corrigido nem aplicado a bancos existentes. A revisão visual foi executada num SQLite temporário separado, criado a partir do schema atual com `db push`; isso não valida o histórico de migrations. Nunca aplicar esse contorno em produção.

Validação local da prévia: ESLint, TypeScript e build passaram. Navegação nas 12 telas principais e modal de tarefa conferidos em 375/1440 px; dashboard nos temas claro/escuro, alternância v2/v3 após recarregar, rejeição de v3 para usuário comum e outro admin, cookie forjado sem liberar a prévia. Nenhuma mudança nos dados ou configurações de produção.

Ajuste local posterior (29/10): removido o banner "Menos ruído. Mais progresso." do dashboard v3; o título compacto "Seu dia" voltou a aparecer, e o fundo usa a mesma grade pontilhada de 22 px do Atelier, incluindo o tema claro. A elegibilidade privada e o seletor de versões não mudaram. Publicação deste ajuste ainda depende de autorização.
