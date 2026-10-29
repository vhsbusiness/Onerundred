# Onerundred — Visão geral do projeto

> Documento de transferência de contexto (Claude Code → OpenAI Codex). Gerado em
> 28/10/2026 a partir do código, do `CLAUDE.md`, do `README.md`, de
> `docs/INTELIGENCIA.md` e dos arquivos de memória do agente anterior.
> Não contém segredos. Itens marcados com **[não confirmado]** não puderam ser
> verificados no repositório e devem ser checados antes de serem usados como fato.

## 1. O que é o Onerundred

Painel pessoal de produtividade em português do Brasil ("one" + "hundred", com R no
lugar do H). Desenvolvido para o dono do projeto (Vitor Hugo) usar no dia a dia e
medir se o dia foi bom, entregue uma função por vez desde 17/10/2026.

Produção: `https://app.onerundred.com` (Railway, Postgres). Repositório:
`git@github.com:vhsbusiness/Onerundred.git`, branch `main`.

## 2. Funcionalidades existentes (todas no ar)

### Quadros e tarefas (estilo Trello)
- Vários quadros por usuário; `/quadros` abre o último quadro visto (`?lista=1` mostra a grade).
- Listas com prioridade (Alta/Média/Baixa) e tipo (`normal`, `today` Hoje, `tomorrow` Amanhã, `done` Feitas). Arrastar listas e tarefas (dnd-kit; toque longo no celular).
- Tarefa: título, descrição, prioridade, estimativa (min), dia agendado, checklist, imagens (Ctrl+V/anexar), lembretes ligados, cronômetro, copiar, arquivar, excluir, mover para outra lista ou para outro quadro.
- Tarefa contínua: reaparece numa lista nos dias da semana escolhidos (pausar, mudar dias, parar).
- Menu da lista: adicionar, copiar lista, mover todas as tarefas, mover lista para outro quadro, puxar tarefas de uma prioridade, arquivar todas, organizar por importância (IA), desfazer última ação, mover esquerda/direita, tipo, excluir.
- Relógio na lista com a estimativa de horas para terminá-la.
- Arquivamento automático de tarefas concluídas no dia seguinte; aba Arquivadas com busca e excluir tudo.
- Compartilhamento de quadros por @ (convite, aceitar/recusar, membros, sair).
- "Trazer dados": importa prints do Trello com IA (visão).

### Dashboard (`/`)
- Notas de hoje/semana/mês ponderadas por prioridade, "realocadas", trabalhado hoje com veredito, "para terminar hoje", sequência de dias ≥ 70%.
- Sessão de trabalho (começar/pausar/retomar/encerrar), com encerramento automático quando todas as tarefas de hoje ficam prontas e aviso 10 min depois.
- Performance 0–100 (tarefas 40, sono 25, lazer 15, metas 20) e constância (dias seguidos ≥ meta).
- Análise do dia pela IA, com memória de hábitos por usuário e período de observação.
- Revisão de qualquer dia passado e de períodos (3/7/14/30 dias ou intervalo).

### Rotina e metas
- Sono (`/sono`): uma noite por dia (deitei, dormi, acordei, qualidade), médias e gráfico.
- Lazer (`/lazer`): blocos por atividade, cronômetro, totais e gráfico.
- Metas › Projetos (`/metas`): compromissos de N dias marcados no dia seguinte ("fiz ontem").
- Metas › Metas (`/metas/basicas`): sono, trabalho por dia, lazer por dia, performance alvo.
- Lembretes (`/lembretes`): título, detalhe, dia, hora, repetição; viram push.

### Notificações push
- Web Push (VAPID) com agendador interno a cada 5 min e tipos: meta de ontem, trabalho longo (IA), resumo semanal (IA), equilíbrio (IA), atrasadas, registrar sono, lembretes, sessão encerrada.

### Contas e administração
- Cadastro aberto (configurável), login por e-mail ou usuário, sessão em cookie httpOnly 30 dias, perfil com foto e senha.
- Primeiro usuário cadastrado é admin. Painel `/admin`: contas, métricas, custo de IA, período de observação da IA, fechar cadastro, trocar para o design antigo só na própria conta.

### Aparência
- Tema escuro/claro por usuário.
- Design "Atelier" (v2) é o padrão de todos: trilho lateral recolhível no PC, tipografia Bricolage Grotesque / Instrument Sans / JetBrains Mono, grade de pontos, cores originais do app. O design antigo (v1) continua no código e o admin pode ver.
- PWA instalável no celular, barra inferior, área segura do iPhone.

## 3. O que NÃO existe

- Não há pagamentos, assinaturas ou integração financeira de nenhum tipo.
- Não há testes automatizados (nenhum `*.test.*`, nenhum script `test`). A verificação é `tsc`, `eslint`, build de produção e conferência manual no navegador (celular 375 px e desktop).
- Não há e-mail transacional, recuperação de senha por e-mail nem login social.
- Não há i18n: a interface é só pt-BR.

## 4. Documentos relacionados

- `docs/ARCHITECTURE.md` — stack, estrutura de diretórios, fluxo de requisição, banco e integrações.
- `docs/BUSINESS_RULES.md` — todas as regras de negócio com números.
- `docs/DEVELOPMENT.md` — comandos, ambiente, migrations, verificação e deploy.
- `docs/MIGRATION_HANDOFF.md` — estado atual, pendências, preferências do dono e regras para não quebrar nada.
- `docs/INTELIGENCIA.md` — referência longa em um arquivo só (inclui tabela completa da API e do modelo de dados).
- `CLAUDE.md` — notas curtas do agente anterior (continuam válidas).
- `README.md` — histórico das funcionalidades e instruções de uso.

## Prévia visual Studio (v3) — 29/10/2026

Nova linguagem visual preservando a paleta: navegação flutuante, dashboard editorial com resumo real do dia, cartões, campos, botões, tabelas e modais refinados; temas claro/escuro e dock no celular. Disponível exclusivamente para a conta proprietária administradora. Os demais usuários permanecem no Atelier v2, sem adesão automática. A versão v1 clássica permanece preservada no código. Esta alteração foi preparada localmente; publicação depende de autorização explícita.
