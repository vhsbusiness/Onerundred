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

Ajuste local do cabeçalho (29/10): Studio v3 volta a reutilizar o cabeçalho Atelier com data, hora e indicador de trabalho. Removidos breadcrumb "Seu espaço", selo de prévia e linha divisória; navegação móvel/perfil mantidos. Ainda não publicado.

## Atualização — Studio padrão global e fontes (29/10/2026)

Por instrução explícita do proprietário, Studio v3 deixa de ser uma prévia privada e passa a ser `DEFAULT_DESIGN` para todas as contas e para o login. Esta decisão substitui as restrições de prévia descritas acima. Contas comuns recebem v3 mesmo com cookies/preferências antigas; admins podem salvar uma escolha de comparação v2/v3 em `Setting.designPreview`, apenas na própria conta. O Atelier v2 e o clássico v1 continuam preservados. Nenhuma alteração de schema ou de dados de produção é necessária.

A tipografia do v3 foi unificada em Instrument Sans: texto, títulos, métricas, etiquetas e cronômetros de trabalho/lazer/tarefa usam a mesma família, mantendo os números tabulares. O cabeçalho com data e hora e o fundo pontilhado permanecem. Implementação preparada localmente; publicar somente mediante pedido explícito.

Observação de teste (31/10/2026): abrir diretamente `/quadros/ID?card=ID` pode produzir React hydration #418. O BoardView inicializa openCardId a partir de window no cliente, mas null no servidor. Fluxo normal de abrir quadro e clicar no cartão passa; esta divergência preexistente não foi alterada junto do vidro/checklist.

### 01/11/2026 — erro ao atualizar análise de IA
- Logs de produção confirmaram HTTP 429 do provedor com mensagem de créditos esgotados. Não era falha no cálculo de performance.
- `src/lib/ai-errors.ts`, chamado pelo wrapper de APIs, converte erros OpenAI em mensagens seguras: quota esgotada (503), rate limit (429), configuração/autorização e indisponibilidade (503). Falhas internas não relacionadas continuam no tratamento anterior.
- Verificados tipos, lint, build e testes locais de classificação, sem chamadas pagas. O saldo da API precisa ser reposto pelo administrador; não foi alterada cobrança nem chave. A análise anterior permanece armazenada quando a geração falha.

### Mapa mental — 03/11/2026, preparação local

As melhorias desta etapa incluem objetos soltos/imagens, formatação em grupo, Auto na ideia central, botões de ramo dos dois lados e barra de ferramentas adaptada a celular. As regras e módulos estão descritos em BUSINESS_RULES e ARCHITECTURE. A migration aditiva `20261104010211_mind_canvas_objects` deve acompanhar o código no próximo deploy autorizado. Não foi aplicada em produção. A cópia SQLite temporária de QA recebeu a versão SQLite da migration; não houve alteração do banco de desenvolvimento do usuário.

Validação: TypeScript, ESLint e build; navegador em 375/1440 px; mouse e toque; Tab/Enter; imagem por clipboard, persistência, tamanho, exclusão e recuperação; seleção e formatação em lote; Auto com posições fixadas/objetos soltos; desfazer atômico, inclusive conflito com outro membro; consulta por colaborador sem permissão de escrita. O SQL Postgres foi gerado por diff do schema, mas não foi executado contra um Postgres real nesta etapa. Publicar apenas quando o dono pedir.

### Atualização posterior — publicação dos objetos e lápis local (03/11/2026)

O bloco anterior registra a preparação, mas a etapa de objetos/imagens foi posteriormente publicada a pedido do dono: commit `c7d93bd59d15594a0df959c8dcb9131ee3e659ca`, deployment Railway `d7fbfffb-2484-4025-ae7f-4dac2b3ce66d` com sucesso, migration `20261104010211_mind_canvas_objects` aplicada e arquivos estáticos conferidos em produção.

A próxima alteração, ainda local, substitui o botão quadrado da barra pelo lápis, acrescenta animações discretas e reduz a opacidade dos pontos. Não houve push/deploy nesta etapa. A migration `20261104012108_mind_freehand` deve acompanhar o próximo deploy autorizado; foi aplicada somente no SQLite temporário de QA, não no banco de desenvolvimento do usuário nem em produção. O SQL Postgres foi gerado, mas não executado contra Postgres nesta etapa.

Validação local: TypeScript, ESLint e build; desenho real por mouse e toque; persistência, cor, espessura, seleção, movimento, exclusão e Ctrl+Z; cancelamento por Esc/pointercancel; animações e movimento reduzido; telas de 375/1440 px, claro/escuro; geometria inválida rejeitada; consulta de colaborador sem escrita; formatação em grupo e conflito de desfazer com outro membro; Auto sem deslocar ramos ao desenhar; regressão do arraste esquerdo, movimento direito, seleção retangular e atalhos Tab/Enter.

### Traços rápidos, exclusão da raiz e importação — 03/11/2026, local

O lápis/animações da etapa anterior foi publicado a pedido do dono: commit `6f141d61d23f25e8418f6c39f8eeb84d5c73efd7`, deployment `a7446955-2b2c-40ab-9543-65a9709014e4` SUCCESS. Migration `20261104012108_mind_freehand` aplicada em produção; JS/CSS conferidos por hash no domínio público.

Esta etapa corrige três pedidos posteriores, ainda sem publicar: fim de traços rápidos, exclusão da ideia central e importação do Miro preservando negrito/emojis com ramos novos sempre à direita. O dono informou que apagará seu mapa e reenviará os prints depois da correção; o agente não apagou nem reorganizou dados de produção. Não há migration nova.

Reprodução do lápis: um pointerdown seguido de pointerup em outro ponto, antes de pointermove, salvava somente um ponto. Agora inclui a posição final. Testes locais cobriram traços de 1 px, clique, dez traços rápidos com rede lenta e recarga; exclusão/undo da raiz, filhos e seleção múltipla; mapa vazio, textos soltos e importação; bloqueio de escrita por leitor e conflito de nova raiz criada por outro membro. Prévia do Miro e exclusão verificadas em 375/1440 px; API com emojis compostos, negrito, todos os filhos à direita, caminhos repetidos, compatibilidade com strings, validação e desfazer atômico. Tipos, lint e build passaram.

A extração de IA foi simulada no teste de interface para não consumir créditos; o salvamento da prévia e a geração dos nós usaram a API e o SQLite temporário reais. A leitura dos prints reais do usuário pelo modelo não foi reexecutada nesta etapa. Nenhuma credencial nem conta de produção usada nos testes. Publicar somente após novo pedido explícito.

### Cópia fiel, todas as raízes e continuidade do lápis — 03/11/2026, local

A etapa anterior foi publicada a pedido do dono: commit `01a9e3ba53214ad2fa347ebfe30095cb778c279f`, deployment Railway `25e127d0-e5e7-436e-9211-3caad1ecaf6b` SUCCESS, sem migration nova. Login e artefato JS foram conferidos em produção.

Pedidos atuais: copiar vários itens ligados como uma cópia idêntica **dentro do mesmo mapa** (o dono esclareceu que não pediu clipboard do Miro); considerar os dois textos principais como raízes independentes; resolver rabiscos rápidos que ainda sumiam. Implementação local, sem push/deploy e sem migration. Preserva os gestos do mouse e os atalhos Enter/Tab.

A reprodução com captura perdida antes de soltar o mouse salvava zero desenhos. Após a correção, salva um desenho, inclusive ao soltar fora do canvas. Testes também cobrem resposta perdida depois do POST gravado (retry sem duplicação), GET seguinte com erro (prévia/mapa permanecem montados), cancelamento real, traços rápidos com rede lenta, persistência e toque.

Cópia validada com clipboard real do navegador, estilos/emojis/ligações de duas árvores, colagem repetida, Undo único, edição nativa de texto, imagens/desenhos, 1.000 itens conectados, rejeição de ciclo/URL insegura, bloqueio de usuário sem acesso e colaborador somente leitura, conflito de outro editor e restauração de raiz junto de outra árvore. Auto de uma raiz independente não movimenta a outra árvore. Interface conferida em 375/1440 px. Testes usam SQLite temporário e contas apenas locais. Não foi executado teste em Postgres real; não há alteração de schema.

Limites: até 1.000 itens/8 MiB por cópia, 50 imagens por mapa; clipboard interno usa snapshot e não sincroniza mudanças posteriores do original. Prévia de desenho pendente está em memória até salvar (não garante recuperação após fechar/recarregar a página offline). Publicar somente após novo pedido explícito.

Verificações finais: `npx tsc --noEmit -p .`, `npx eslint src`, `npx next build` e `git diff --check` aprovados. Cópia de título ainda em edição e aparência de um filho copiado como nova raiz conferidas em 375/1440 px. O teste inicial de 1.000 itens revelou o limite de parâmetros do SQLite no desfazer; corrigido com validação em memória e operações por lotes, e o cenário completo passou. A perda de resposta/atualização de rede e a soltura fora do canvas também passaram após a correção.

### Expansão do mapa mental — 04/11/2026, ainda local

A etapa anterior foi publicada explicitamente: commit `dc88a955dcf597e83c73fa7d0ba099eb0eb8ebe4`, Railway `bbe02568-89fb-4eeb-941f-abde4211beef` SUCCESS. Login e artefato do build conferidos. A expansão atual **não tem autorização de deploy**.

O dono relatou arraste voltando à posição anterior, pediu mover todos os filhos junto com o pai, linhas retas independentes de Auto, tamanho do bloco e Auto que reorganize. Depois pediu estudar mais o Miro e confirmou prioridade: “Mapa mental completo primeiro”. A comparação oficial está em `MIND_MAP_REFERENCE.md`, com recursos implementados e lacunas explícitas. Não considerar que todo o produto Miro foi reproduzido.

Reprodução: com Auto ativo, mover a seleção em -25 no eixo Y resultava em deslocamento efetivo zero. Movimento manual agora pausa Auto da árvore afetada e move toda a subárvore, incluindo itens recolhidos. Título em edição é salvo junto, evitando que o Auto reposicione itens entre a gravação do título e a gravação do movimento. Desfazer/refazer recupera tudo atomicamente.

Além das correções: organização pontual, distribuição por alturas/níveis, tamanho com alça e botões, editor multilinha, reconexão/desconexão explícita, refazer, busca que expande ancestrais, navegação por setas, duplicação de subárvore, seleção aditiva, recolhimento global, exportação PNG/SVG/texto. Linhas retas são preferência local, sem alterar coordenadas. Redimensionamento também mantém espaço nas conexões; itens fixados protegem seu posicionamento. A barra no celular usa duas linhas para manter ferramentas acessíveis. Preserva os modos anteriores do app e as regras de leitura de colaboradores.

Migration nova: `20261104023919_mind_text_size` (Postgres/SQLite) acrescenta `MindNode.textWidth/textHeight` e `MindUndo.undone`. Upgrade SQLite verificado em banco temporário criado a partir do schema anterior. O ensaio separado de todo o histórico SQLite em banco vazio falhou na migration antiga `20261018222608_drop_areas`; ela tenta excluir uma coluna que não existe nesse caminho. Não alteramos migrations antigas nem o banco do usuário. Postgres foi gerado por diff, mas não foi executado contra um banco real. A próxima publicação autorizada deve levar código e migration juntos.

Validações locais: cinco testes puros (`npm run test:mind`), TypeScript, ESLint e build. Navegador em 375 px com toque e 1440 px: arraste com título em edição/Auto, filhos acompanhando, redimensionamento pela alça, controles por toque, reconexão, busca, teclado, duplicação, exportação de arquivos reais e histórico. APIs cobrem itens fixados, ciclos, limites de tamanho, organização pontual, desfazer/refazer composto, rejeição de quem não tem acesso/tem só leitura e conflito com outro membro. Mil nós copiados/desfeitos/refeitos preservaram relações e dimensões. Regressão do lápis com resposta perdida/erro no GET/soltura fora do canvas passou; gestos esquerdo/direito e Enter/Tab também. Houve ajuste dos seletores do teste temporário de input para o editor textarea.

Os testes usam SQLite e contas temporárias locais, sem chamadas de IA, sem alterar dados de produção. Os testes puros ficam versionados; os roteiros de navegador usados nesta sessão estão em `/private/tmp/onerundred-*` e podem desaparecer após reinício. Limites de exportação/cópia e diferenças em relação ao Miro estão descritos na referência. Nenhum push ou deploy nesta etapa.


## Atualização local de 04/11/2026 — recorrências e sessão atravessando o dia

- Ocorrências do novo dia aguardam o encerramento de um ciclo de trabalho iniciado antes de hoje. Pausar/retomar não libera; encerrar manual ou automaticamente libera imediatamente. Sem sessão anterior pendente, mantém a geração normal.
- `Setting.workCycleStartedAt` persiste o início do ciclo sem mudar o schema. Sessões antigas usam o último segmento e `workEndedDay` como compatibilidade. A geração reserva `lastSpawnedKey` na mesma transação da criação para evitar duplicação.
- A análise de sessão usa `getWorkSessionDayContext` com o dia de início, sem buscar a meta/tempo ao vivo do dia seguinte. Não reescreve análises já salvas nem exclui ocorrências existentes.
- `npm run test:recurring`: nove testes com backend real e SQLite temporário vazio. Tipos, lint, build e fluxo no Chrome em 1440/375 px passaram. UI confirma pausa após recarregar e aparecimento imediato ao encerrar. Não houve chamada paga de IA nem teste de dados em produção.
- Esta correção ficou local, sem push/deploy. O deploy autorizado anterior do mapa mental (`d2e3cb6`) foi confirmado no Railway: migration `20261104023919_mind_text_size` aplicada em Postgres, status SUCCESS, login HTTP 200 e chunk idêntico ao build local.
- Aviso observado na CLI Railway: config-as-code (`railway.json`) segue funcionando até 01/12/2026; planejar migração para Infrastructure as Code separadamente, sem alterar a infraestrutura nesta correção.

### Ajustes visuais e interações do mapa — 04/11/2026, local

O deploy anterior de recorrências (`d5ee608`) foi confirmado no Railway (deployment `9a75056f-86a8-4129-9d0d-51bcb0ead1c0`, SUCCESS, sem migrations pendentes). Os pedidos posteriores desta etapa ainda **não foram publicados**: vidro no Chrome com transparência reduzida, paleta de cores, grade em vez dos pontos do mapa, colagem formatada e reconexão por arraste. Nenhuma migration necessária; não alteramos dados de produção.

Validação: sete testes puros do mapa, TypeScript, ESLint e build passaram. Chrome local em 375/1440 px, claro/escuro e fullscreen: paleta, personalização, reset, seleção múltipla, grade e ausência de transbordamento. Mouse/toque reconectam levando os descendentes; texto em edição entra no mesmo undo/redo. APIs rejeitam ciclos, descendentes fixados, destino de outro quadro e visitante sem sessão. Falha simulada no POST preserva rascunho. Cópia real via teclado preservou os estilos e continua duplicando objetos no canvas; HTML externo seguro e undo de texto/estilo conferidos. Botão direito mantém pan.

Vidro conferido por estilo computado e screenshots, com preferência `prefers-reduced-transparency` normal/reduzida e user agent Windows. **Não é teste em Windows nativo**: Chrome executado no Mac com emulação. Modo reduzido continua opaco e sem blur, mas conserva bordas e reflexos decorativos. Mac normal permanece com blur. Testes usaram apenas SQLite e contas temporárias de QA; sem chamadas de IA. Scripts temporários: `/private/tmp/onerundred-map-current-qa.cjs`, `onerundred-map-touch-qa.cjs`, `onerundred-glass-fix-qa.cjs`; podem desaparecer ao reiniciar. Limites do clipboard descritos em MIND_MAP_REFERENCE.

### Fundo do mapa com grade adaptativa — 04/11/2026, local

A etapa anterior (`6d40738`) foi publicada com autorização: Railway `49214f24-ce27-4539-b895-e492bc63dedd`, SUCCESS; JS/CSS conferidos por hash. O dono então pediu corrigir o fundo usando os prints do Miro, inclusive seu efeito ao mudar o zoom. Esta alteração permanece local: canvas cinza neutro, duas intensidades de grade, densidade adaptativa e linhas ancoradas ao mapa durante o movimento. Não altera schema, dados ou regras de negócio.

Oito testes puros do mapa, TypeScript, ESLint e build passaram. Chrome local em 375/1440 px, claro/escuro, zoom 5–250%, movimento, seleção/toque, tela cheia e movimento reduzido conferidos; apenas SQLite de QA. Roteiro temporário: `/private/tmp/onerundred-adaptive-grid-qa.cjs`. Detalhes em `MIND_MAP_REFERENCE.md`. Sem push/deploy desta etapa.


## Bullets e quadros favoritos — 04/11/2026

Na descrição das tarefas, `-` ou `.` seguido de espaço no início do parágrafo cria a mesma lista de bullets do botão do editor. A formatação continua salva em Markdown.

Cada conta pode favoritar até três quadros, inclusive compartilhados, usando a estrela na grade ou no cabeçalho do quadro. Os atalhos aparecem abaixo de Quadros na barra lateral enquanto o mouse está sobre o grupo; também ficam acessíveis pelo foco do teclado. A barra recolhida mostra os ícones com os nomes no tooltip. No celular, as estrelas continuam acessíveis na grade e no quadro.

Favoritos usam `Setting.favoriteBoardIds`, sem migration, com limite e acesso validados na API `GET/PUT /api/boards/favoritos`. Quadros excluídos ou sem acesso são filtrados e deixam de ocupar vagas na próxima leitura. Falhas ao salvar preservam a seleção confirmada. Alteração local, sem publicação.

Validação: TypeScript, ESLint e build aprovados; Chrome em 375/1440 px confirmou atalhos reais, persistência após recarga, favoritos com um/dois/três itens, hover e travessia dos links, barra recolhida, remoção, limite na UI/API e isolamento entre contas. QA usa banco SQLite temporário, sem dados de produção. Roteiro: `/private/tmp/onerundred-favorites-qa.cjs`.


### Animação e seta dos favoritos — 04/11/2026, local

O submenu de quadros favoritos expande/recolhe com transição de altura e opacidade, mantendo hover e foco de teclado. Quadros ganha uma seta para baixo somente quando existem favoritos; a seta gira ao abrir. Funciona na barra expandida e recolhida e respeita movimento reduzido. Aplica-se aos atalhos de tarefas, organização e mapa mental. Sem alteração de banco.

TypeScript, ESLint, build e diff aprovados. Chrome com banco temporário de QA: altura intermediária da animação, recolhimento completo, rotação da seta, travessia dos links, teclado, movimento reduzido, barra recolhida, 375/1440 px e ausência da seta sem favoritos. Roteiro `/private/tmp/onerundred-favorites-animation-qa.cjs`. Ainda sem push/deploy desta etapa.


## Mapa ampliado preservando o navegador — 04/11/2026

O botão Tela cheia expande o mapa dentro da área visível da página com posicionamento fixo, sem chamar a Fullscreen API. Abas, endereço e barras do navegador permanecem disponíveis; o app não controla tela cheia ativada manualmente pelo próprio navegador/sistema. Sair da tela cheia ou Esc restaura o quadro. Ferramentas, tema e conteúdo continuam no mesmo componente, sem remontar o mapa. Não há alteração de schema.

Validação: tipos, lint, oito testes do mapa e build; Chrome local 375/1440 px, claro/escuro, área ampliada ocupando o viewport, ausência de chamadas a requestFullscreen, ferramentas visíveis e saída por botão/Esc. Banco temporário de QA, sem dados de produção. Roteiro `/private/tmp/onerundred-browser-full-qa.cjs`. Publicação autorizada pelo pedido de deploy em andamento, junto da animação/seta dos favoritos.

## Edição de sessões de trabalho — 06/11/2026, local

O pedido de publicar o efeito nas bordas dos quadros foi concluído antes desta alteração: commit `a63d0e9`, Railway `fa5ba84f-60f3-4b24-a154-64999b1133f5` SUCCESS, login e hashes dos artefatos conferidos no domínio público. A edição de sessões foi solicitada depois e permanece **sem push/deploy**, aguardando novo pedido explícito.

Botão de lápis nos trechos encerrados de hoje e na revisão de um dia pelo calendário. Editor com datas/horas separadas, prévia da duração, erro sem perda do rascunho e gravação explícita. Só permite editar registros do próprio usuário; sessão ativa precisa ser pausada. A API `PATCH /api/work/[id]` rejeita sobreposição, datas inválidas/futuras e edições desatualizadas, usando transação serializável e comparação com os horários originais. Retry idêntico é idempotente. Cronômetros das tarefas não são alterados; totais permanecem no dia de início e o ciclo pausado mantém sua referência. A visão de sessão em cache é limpa; análises diárias gravadas só mudam quando o usuário pede Atualizar, sem zerar o histórico/limite de IA.

Sem migration nem nova dependência. `npm run test:recurring` passou com 16 testes (7 novos de edição); TypeScript, ESLint e build passaram. Chrome local em 375/1440 px, claro/escuro: correção de ontem, sessão atravessando meia-noite, edição de hoje com outro trecho ativo, Enter, persistência após recarga, calendário, cancelamento, proteção de usuário e de edições concorrentes. Testes usam SQLite temporário, sem dados de produção nem chamadas de IA. Não foi testado em Postgres real nesta etapa. Roteiro temporário `/private/tmp/onerundred-work-edit-qa.cjs` e imagens `/private/tmp/onerundred-work-edit-*.png` podem desaparecer após reinício.

## Metas › Projetos de treino — 10/11/2026

Novo projeto e Editar aceitam projeto comum ou Treino. A mesma seleção de modalidade é exibida no cartão e nos detalhes. A migration aditiva `20261111013057_project_workout` acrescenta uma coluna opcional em Project (Postgres e SQLite); não converte projetos pelo nome. Não muda a marcação de ontem, o histórico nem os cálculos. A edição das sessões de trabalho da etapa anterior já foi publicada (e7ba057, Railway ac48f63a-1ac6-492d-9976-9fcc5f62c5ec).

Verificação local: atualização de SQLite com dados de exemplo, TypeScript, ESLint, build e Chrome 375/1440 px. Cobertos escolha condicional de luta, criação, consulta, alteração, recarga, isolamento entre contas e preservação de marcações. Migração Postgres gerada, sem aplicar a banco de produção. Aguardando pedido explícito de publicação dos projetos de treino.

## Diário de treinos e abas de metas — 10/11/2026

A versão publicada com a escolha de modalidade (0b1b6d2) utilizava marcações diárias para treino. Esta correção reserva /metas aos compromissos diários, /metas/projetos aos projetos esportivos e /metas/basicas às Configurações das metas. Os links antigos de treino passam pelo controle de proprietário e abrem o diário correspondente. Project.workout distingue os dois fluxos. As consultas de metas usadas por manutenção, notificações, IA e performance filtram workout nulo.

A migration aditiva 20261111015019_training_diary guarda planos por dia da semana, o intervalo de descanso e sessões esportivas datadas. As marcações manuais antigas ficam consultáveis no diário. Validado com atualização de banco SQLite temporário, TypeScript, ESLint, build e Chrome em 375/1440 px. O teste incluiu as quatro modalidades, atualização do plano depois de registrar o treino, recarga durante o descanso, cálculo de tempo/pace e isolamento entre contas. A correção aguarda publicação.
