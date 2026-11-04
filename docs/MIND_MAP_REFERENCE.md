# Mapa mental: referência funcional e continuidade

Revisão de 04/11/2026. O dono pediu estudar o Miro e priorizou **mapa mental completo primeiro**. A implementação mantém o visual do Onerundred e suas regras expressas de mouse e teclado. Esta comparação não significa paridade com todo o produto Miro.

## Referências consultadas

- [Documentação oficial do mapa mental do Miro](https://help.miro.com/hc/en-us/articles/360017730753-Mind-map): criação de filhos/irmãos, organização automática, movimentação de descendentes, reconexão, recolhimento, formatação e exportação.
- [Atalhos oficiais](https://help.miro.com/hc/en-us/articles/360017731033-Shortcuts-and-hotkeys): navegação, seleção, busca, duplicação e histórico.
- [Modelo de mapas mentais para desenvolvedores](https://developers.miro.com/docs/mind-maps): estrutura de nós e relações.

Usar como referência de comportamento; não copiar a aparência do Miro por cima dos tokens/vidro do Onerundred. Nenhuma integração com a conta Miro foi criada.

## Disponível no Onerundred

| Área | Comportamento |
|---|---|
| Estrutura | Várias árvores independentes no mesmo quadro. Todo texto sem pai tem opções de ramo inicial. |
| Criação | Tab cria filho à direita; Enter cria irmão à direita do pai; raiz selecionada não ganha irmão por Enter; Enter sem seleção cria texto independente. |
| Mouse | Esquerdo seleciona, desenha retângulo de seleção ou move o bloco; direito move a visualização com cursor de mão. Clique direito sem arrastar no fundo abre criação. |
| Movimento | Arrastar um ramo leva todos os descendentes, inclusive recolhidos. Selecionar pai e filho não duplica o deslocamento. Item fixado no conjunto impede o movimento inteiro. |
| Auto | Calcula altura das subárvores, alinha níveis, separa grupos e considera dimensões de texto. Raízes e posições fixadas são preservadas. Arraste manual desativa Auto apenas nas árvores afetadas e explica isso na interface. |
| Organização pontual | “Organizar agora” reorganiza uma árvore; “Organizar” no menu do fundo reorganiza todas em uma única ação com desfazer. Não muda a preferência de Auto. |
| Conexões | Alternância curvas/retas sem mover itens. Preferência local por quadro. Arrastar sobre outro texto destaca o destino e reconecta a subárvore; o menu “Conectar a outro ramo” também permite escolher o pai ou tornar o ramo independente. Ciclos e conexões entre quadros são rejeitados. |
| Bloco de texto | Alça no canto, aumentar/diminuir, voltar ao tamanho automático. Dimensões persistidas e independentes do tamanho da fonte. Shift+Enter insere quebra de linha. |
| Formatação | Moldura, paleta de cores prontas/personalizadas, destaque, negrito, fonte, link e posição fixa. Seleção múltipla permite alterar estilos em lote. |
| Seleção | Retângulo, Shift/⌘+clique para alternar itens, Ctrl/⌘+A fora do editor para selecionar os itens visíveis. |
| Navegação | Setas entre pai/filho/irmãos fora do campo de texto, F2 para editar, V/H/T/P para selecionar/mover/criar texto/desenhar. Tecla 1 enquadra o mapa. |
| Busca | Ctrl/⌘+F ou botão. Busca títulos, percorre resultados e expande os ancestrais de um item recolhido. |
| Recolhimento | Recolher/expandir um ramo com contagem de descendentes; controle para recolher até os ramos principais ou expandir tudo. Salvo por conta/quadro neste navegador, inclusive ramos aninhados. |
| Cópia | Clipboard interno fiel para os itens selecionados; Ctrl/⌘+D duplica as subárvores selecionadas. Formatação, ligações internas, mídia e dimensões preservadas. |
| Histórico | Desfazer e refazer, botões e Ctrl/⌘+Z, Ctrl/⌘+Shift+Z ou Ctrl+Y. Até 30 ações por usuário/quadro. Nova edição invalida o refazer somente desse usuário; conflitos com outro editor são rejeitados. |
| Mídia | Imagens coladas/anexadas, lápis, espessura/cor e recuperação de traços com resposta perdida. |
| Importação | Prints do Miro pela IA, prévia antes de salvar, negrito/emojis e ramos novos à direita. |
| Exportação | Mapa completo em SVG, PNG (até 4096 px no lado maior) e texto com hierarquia. Inclui ramos recolhidos. Exportação ocorre no navegador; não envia os dados a outro serviço. |
| Tela | Zoom, enquadramento, tela cheia, claro/escuro com grade quadrada; ferramentas adaptadas a celular e computador. |
| Acesso | Dono/membros editam; colaboradores com leitura consultam. Novas rotas verificam o acesso novamente. |

## Diferenças ainda existentes

- Não há conexões extras entre nós fora da hierarquia (cross-links), orientação vertical, comentários ancorados, presença/cursores simultâneos ou sincronização ao vivo.
- IA importa prints; ainda não expande uma ideia em tópicos, perguntas ou respostas dentro do mapa.
- Não há biblioteca de modelos, modo apresentação, histórico de versões de todo o quadro ou importação de arquivos nativos do Miro.
- SVG mantém vetores, mas exporta texto com fonte de sistema. PNG tem limite de resolução; mapa muito grande deve preferir SVG. Texto exportado contém hierarquia/títulos/links, não formatação nem imagens.
- Colagem interna é limitada ao mesmo quadro, 1.000 itens/8 MiB; até 50 imagens. Prévia de desenho pendente não é armazenamento offline durável.
- Busca consulta o título dos itens, não faz OCR das imagens. Os atalhos de texto do navegador são preservados enquanto se digita.

## Critérios para próximos incrementos

1. Preservar Enter/Tab à direita, arraste de subárvores e mouse direito apenas para mover a visualização.
2. Toda alteração estrutural precisa validar acesso, impedir ciclos, ser atômica e participar de desfazer/refazer.
3. Respeitar itens fixados e outras árvores; organização automática não deve interferir em mapas independentes.
4. Testar 375/1440 px, claro/escuro, toque/mouse, rede lenta, editor de texto ativo e leitura por colaborador.
5. Publicar somente após pedido explícito do dono. O pedido de estudar/implementar não autoriza deploy.

## Incremento local — 04/11/2026

- Arraste esquerdo sobre outro texto reconecta uma subárvore inteira (também quando pai e filho estão selecionados). O destino é destacado antes de soltar. Seleções de árvores independentes continuam somente movendo. Não conecta mídia, o próprio ramo, seus descendentes ou seu pai atual. Ctrl/⌘ durante o movimento suprime a reconexão; botão direito continua apenas movendo a visão. O controle existente de conexão permanece.
- Reconexão, título em edição e deslocamento usam uma transação/entrada de histórico. Descendentes fixados bloqueiam a ação inteira. Destino recolhido abre após a reconexão. Erro do servidor preserva o rascunho no editor.
- Copiar texto do editor inclui texto simples, HTML seguro e metadados dos estilos suportados. Colar em um item aberto aplica texto, negrito, cor, destaque, tamanho e link do texto de origem. Fora do editor, a cópia de objetos continua usando o formato interno e preserva as ligações. Textos sem formatação mantêm o comportamento nativo.
- A formatação continua sendo **do bloco inteiro**: não há estilos diferentes por palavra no mesmo título. HTML externo usa o estilo da primeira frase visível, limitado aos atributos já suportados. Não armazena/executa HTML do clipboard; links só http/https. Limite de 160 caracteres continua; ultrapassá-lo não descarta silenciosamente o restante.
- Paleta com 12 cores, padrão/sem destaque e cor personalizada, inclusive em seleção múltipla e lápis. Popover usa o tema local do mapa e funciona em tela cheia. Esc fecha a paleta sem perder a seleção.
- Canvas usa grade discreta clara/escura; o fundo do aplicativo permanece pontilhado. Esta escolha substitui a preferência anterior por pontos dentro do mapa.

## Fundo adaptativo — 04/11/2026

Ajuste solicitado com prints do Miro em 49%, 23% e 8%: fundo claro cinza neutro (sem amarelo), grade de linhas principais/secundárias com baixo contraste. `src/lib/mind-grid.ts` mantém a célula menor entre 16–64 px de tela, com níveis em potências de quatro. As linhas menores somem progressivamente antes da troca de nível; a grade acompanha o deslocamento e o zoom no mesmo sistema de coordenadas dos itens. O tema escuro conserva o fundo escuro e linhas discretas. Escopo somente no canvas, sem modificar o fundo geral, ferramentas, dados ou interações do mapa.

Validação: teste puro de densidade/continuidade/ancoragem nas trocas de nível, testes existentes, TypeScript, ESLint e build. Chrome local em 375/1440 px, temas claro/escuro, zoom de 5% a 250%, pan direito, seleção/edição por mouse e toque, tela cheia e movimento reduzido. Publicação depende de novo pedido explícito.

## Paleta de texto mais forte — 04/11/2026

As mesmas opções de cor de texto agora usam tons mais escuros/saturados, definidos em `--mind-text-*` no CSS global. O popover resolve esses tokens ao abrir e salva o hexadecimal escolhido; cores já gravadas não são convertidas. Branco/preto, reset e personalização continuam disponíveis. Cores de ramo, marca-texto e lápis mantêm suas paletas próprias. Validado em 375/1440 px, claro/escuro, aplicação, seleção da cor e persistência após recarregar; TypeScript, lint, oito testes do mapa e build aprovados. O dono autorizou o deploy após a conferência.

## Texto mais encorpado — 04/11/2026

A apresentação dos textos do mapa mantém Instrument Sans e passa a usar peso 500 no texto normal e 700 nas raízes. O negrito usa 700 com contorno da própria cor de 0,18 px, pois a fonte carregada oferece pesos até 700. O editor herda a mesma aparência. Nenhum texto ou estilo salvo foi convertido.

Validado no Chrome local em 375/1440 px, claro/escuro, edição, alternância de negrito e recarga; TypeScript, ESLint, oito testes do mapa e build aprovados. Alteração local; publicação somente após pedido explícito.

## Recolhimento persistente e Organizar no menu — 04/11/2026

- `useMindFolds` salva os IDs recolhidos de forma síncrona no evento, em `localStorage` com chave `onerundred:mind-folds:v1:<viewerId>:<boardId>`. Recarregar ou sair imediatamente não depende de debounce/rede. `useSyncExternalStore` hidrata sem divergência de HTML e sincroniza abas da mesma conta. Dono, membro e colaborador de leitura têm preferências separadas; as páginas passam o ID do usuário autenticado.
- Abrir um pai preserva filhos que também estavam recolhidos. IDs removidos são ignorados visualmente, mas retidos para desfazer/refazer. Preferências inválidas não impedem abrir o mapa. Se o navegador bloquear a gravação, a interface continua funcionando e avisa que a escolha ficará somente em memória. A preferência é deste navegador: não sincroniza entre dispositivos e pode ser removida ao limpar os dados do site.
- Busca/navegação para um resultado e criação/reconexão em um ramo continuam revelando o alvo quando o usuário solicita essas ações. Atualizar a página ou carregar dados do quadro não expande os ramos.
- O menu do botão direito no fundo inclui **Organizar**. Organiza todas as árvores uma vez, preserva raízes, itens fixados e preferências de Auto; não expande ramos. `POST /api/boards/:id/mapa/estrutura` com `action: "organize"` aceita ausência de `id` para todas as árvores; com `id` continua organizando só aquela raiz. Acesso de edição continua obrigatório. Uma transação e uma entrada no histórico cobrem o mapa inteiro; não há migration.
- O menu considera a altura da nova opção para caber no canvas. Usa os mesmos controles de vidro e ícones do app.

Validação local: TypeScript, ESLint, oito testes puros e build. Chrome 375/1440 px em claro/escuro: recarga imediata, retorno entre quadros, reinício com armazenamento preservado, recolhimento aninhado/em lote, sincronização entre abas e isolamento de contas; leitura de colaborador, armazenamento inválido/bloqueado e itens intactos. Organizar verificado com duas árvores, itens fixados, raízes preservadas, desfazer/refazer completo, compatibilidade da organização de uma única árvore, mapa vazio e rejeição de acesso sem permissão. Sem push/deploy nesta etapa.
