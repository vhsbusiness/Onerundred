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
| Organização pontual | “Organizar agora” reorganiza uma árvore sem mudar sua preferência de Auto. |
| Conexões | Alternância curvas/retas sem mover itens. Preferência local por quadro. “Conectar a outro ramo” troca o pai e leva os filhos; pode tornar o ramo independente. Ciclos e conexões entre quadros são rejeitados. |
| Bloco de texto | Alça no canto, aumentar/diminuir, voltar ao tamanho automático. Dimensões persistidas e independentes do tamanho da fonte. Shift+Enter insere quebra de linha. |
| Formatação | Moldura, cor, destaque, negrito, fonte, link e posição fixa. Seleção múltipla permite alterar estilos em lote. |
| Seleção | Retângulo, Shift/⌘+clique para alternar itens, Ctrl/⌘+A fora do editor para selecionar os itens visíveis. |
| Navegação | Setas entre pai/filho/irmãos fora do campo de texto, F2 para editar, V/H/T/P para selecionar/mover/criar texto/desenhar. Tecla 1 enquadra o mapa. |
| Busca | Ctrl/⌘+F ou botão. Busca títulos, percorre resultados e expande os ancestrais de um item recolhido. |
| Recolhimento | Recolher/expandir um ramo com contagem de descendentes; controle para recolher até os ramos principais ou expandir tudo. Só muda esta visualização. |
| Cópia | Clipboard interno fiel para os itens selecionados; Ctrl/⌘+D duplica as subárvores selecionadas. Formatação, ligações internas, mídia e dimensões preservadas. |
| Histórico | Desfazer e refazer, botões e Ctrl/⌘+Z, Ctrl/⌘+Shift+Z ou Ctrl+Y. Até 30 ações por usuário/quadro. Nova edição invalida o refazer somente desse usuário; conflitos com outro editor são rejeitados. |
| Mídia | Imagens coladas/anexadas, lápis, espessura/cor e recuperação de traços com resposta perdida. |
| Importação | Prints do Miro pela IA, prévia antes de salvar, negrito/emojis e ramos novos à direita. |
| Exportação | Mapa completo em SVG, PNG (até 4096 px no lado maior) e texto com hierarquia. Inclui ramos recolhidos. Exportação ocorre no navegador; não envia os dados a outro serviço. |
| Tela | Zoom, enquadramento, tela cheia, claro/escuro com pontinhos; ferramentas adaptadas a celular e computador. |
| Acesso | Dono/membros editam; colaboradores com leitura consultam. Novas rotas verificam o acesso novamente. |

## Diferenças ainda existentes

- Reconexão é explícita pelo controle de destino; arrastar por cima de outro ramo não troca seu pai automaticamente.
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
