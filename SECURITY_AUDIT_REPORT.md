# SECURITY AUDIT REPORT — Onerundred

Data: 14/11/2026 (America/Sao_Paulo). Auditoria do código local e de execução isolada.
Ponto inicial: `947afe0` — Git limpo. Branch dedicada: `security/audit-2026-11-14`.
**Nenhum push, merge, deploy, teste ofensivo em produção, chamada paga de IA ou alteração de dados reais foi realizado.**

## A. Resumo executivo

Foram inventariados **66 arquivos de API, 109 handlers de método e 19 páginas**. A prioridade foi isolamento por conta e revogação de acesso. O sistema usa Next/React, Prisma, SQLite em desenvolvimento e Postgres em produção; não usa Supabase/Firebase/RLS por usuário de navegador. Controles de acesso estão no servidor e no escopo das consultas Prisma.

A aplicação tinha falhas reproduzíveis de bootstrap administrativo concorrente, acesso residual depois de revogação, inscrição de notificações sem restrição de destino/dono e login CSRF. Foram feitas correções localizadas e testes de regressão. UI, regras de notas/performance, cadastros e funcionalidades legítimas foram preservados; as únicas mudanças perceptíveis aprovadas foram os limites de autenticação. A troca automática de conta das notificações foi preservada com prova da inscrição. O limite diário de IA foi recusado pelo usuário e permanece pendente.

Os **16 achados** abaixo incluem vulnerabilidades demonstradas, fragilidades de configuração e avisos de dependências; não são 16 exploits confirmados. Distribuição: **0 críticos; 4 altos confirmados/condicionados; 1 alto potencial de framework sem exploração demonstrada; 8 médios; 3 baixos**. Há **14 correções/mitigações locais** e **2 pendências** (minimatch de desenvolvimento e limite de gastos de IA). Severidade é avaliação contextual, não pontuação CVSS calculada. Em especial, SEC-01 depende de uma base vazia, SEC-04 foi demonstrado até aceitação do destino/validação do transporte, e SEC-16 é risco de versão com pré-requisitos não encontrados.

A entrega local passou em **327 verificações HTTP**, **13 testes automatizados de segurança**, **8 testes do mapa**, **17 testes de recorrências/trabalho**, tipos, lint e build. Não é uma declaração de segurança absoluta. A produção continua na versão anterior até uma publicação explicitamente autorizada.

## B. Achados, reprodução e correções

### SEC-01 — Bootstrap administrativo concorrente

Classificação de referência: CWE-362 / CWE-269 (mapeamento contextual).

- **Severidade:** Alta. **Estado:** Corrigida localmente.
- **Local:** `src/lib/auth.ts:105`.
- **Descrição/evidência anterior:** Três chamadas simultâneas em banco vazio leram userCount=0 antes das inserções e criaram três administradores. Afeta o bootstrap de uma instalação vazia, não promove por si só usuários de uma instalação já populada.
- **Impacto:** Administrador adicional pode controlar contas e configurações.
- **Correção/decisão:** O hash é calculado antes da transação; upsert de uma linha global reserva o bootstrap antes da contagem e da criação. O cadastro fechado é verificado sob o mesmo lock.
- **Validação e limites:** Reprodução inicial: 3 administradores. Regressão com três cadastros concorrentes: exatamente 1 admin e 2 usuários comuns. SQLite real; sem teste de concorrência em Postgres real.

### SEC-02 — Vazamento de tarefa por lembrete após revogação do compartilhamento

Classificação de referência: CWE-863 / CWE-200 (mapeamento contextual).

- **Severidade:** Alta. **Estado:** Corrigida localmente.
- **Local:** `src/lib/reminders.ts:19`.
- **Descrição/evidência anterior:** O lembrete pertence ao usuário, mas o include da tarefa relacionada não revalidava acesso ao quadro. Depois da remoção de um membro, uma mudança posterior no título do cartão ainda era retornada por sua listagem. O agendador reutilizava essa relação para montar mensagens.
- **Impacto:** Leitura continuada de novos títulos e identificadores privados, inclusive por notificações.
- **Correção/decisão:** Relação card filtrada por boardAccess(userId) na listagem, nas respostas de criação/edição e no agendador. O lembrete pessoal é preservado, com card=null quando sem acesso.
- **Validação e limites:** Antes: ex-membro leu PRIVATE AFTER REVOCATION. Depois: listagem e resposta de edição retornam card=null; reanexar o cartão é negado. Filtro do envio inspecionado; nenhum push real enviado.

### SEC-03 — Recorrências permaneciam modificáveis após revogação

Classificação de referência: CWE-863 (mapeamento contextual).

- **Severidade:** Média. **Estado:** Corrigida localmente.
- **Local:** `src/lib/repo.ts:334`.
- **Descrição/evidência anterior:** A regra verificava somente o userId de quem criou a recorrência em um quadro compartilhado. Ex-membros continuavam podendo alterá-la/excluí-la; a geração automática também não revalidava a participação.
- **Impacto:** Escritas em recursos de um quadro cujo acesso já foi revogado.
- **Correção/decisão:** Update/delete exigem acesso atual à lista/quadro. A reserva transacional de uma ocorrência exige o mesmo acesso, impedindo novas gerações pelo criador revogado.
- **Validação e limites:** Antes: update de ex-membro foi aceito. Depois: update/delete retornam 404 e encerrar seu trabalho não cria outra ocorrência; 17 testes existentes de recorrência/trabalho continuam passando.

### SEC-04 — Destino de Web Push controlado pelo usuário sem proteção SSRF

Classificação de referência: CWE-918 (mapeamento contextual).

- **Severidade:** Alta. **Estado:** Corrigida localmente.
- **Local:** `src/lib/notifications.ts:129`.
- **Descrição/evidência anterior:** A inscrição aceitava URL interna e chaves sem validação. O worker passava o endpoint diretamente ao cliente HTTPS de Web Push. O endereço privado foi aceito na reprodução; não foi enviada requisição ofensiva contra rede interna ou produção.
- **Impacto:** Conexões de saída induzidas para destinos internos, sondagem e uso indevido do servidor. Respostas não eram entregues ao cliente: trata-se de superfície de SSRF cega, limitada ao transporte HTTPS/TLS do cliente utilizado.
- **Correção/decisão:** Somente HTTPS sem credenciais/fragmento; rejeição de IPs especiais, privados, loopback, link-local, multicast e IPv6 de transição. Agente HTTPS resolve DNS na abertura da conexão, rejeita respostas privadas/mistas e entrega o IP verificado diretamente ao transporte. Endpoints antigos são revalidados no envio; timeout de 10 s; cliente não segue redirecionamentos.
- **Validação e limites:** Reprodução inicial: https://127.0.0.1:8443 aceito. Testes posteriores rejeitam representações alternativas e ranges; callback real do agente com DNS simulado rejeita respostas privadas/mistas e devolve exatamente o IP público validado. Não houve conexão real de ataque, e não foi realizado envio a provedores.

### SEC-05 — Tomada de inscrição de notificação conhecendo somente seu endpoint

Classificação de referência: CWE-862 (mapeamento contextual).

- **Severidade:** Média. **Estado:** Corrigida localmente.
- **Local:** `src/lib/notifications.ts:99`.
- **Descrição/evidência anterior:** Upsert por endpoint substituía userId e chaves sem verificar vínculo ou prova de posse. A inscrição pôde ser transferida entre duas contas na reprodução.
- **Impacto:** Desassociação do dispositivo da vítima e interrupção de notificações. Não foi demonstrada descriptografia de notificações da vítima.
- **Correção/decisão:** Ao trocar de conta, exige as mesmas chaves da inscrição armazenada, incluindo auth secreto, comparadas em tempo constante após normalização. A transação preserva a troca automática legítima no mesmo navegador, conforme preferência expressa do usuário. Chaves diferentes não podem assumir um endpoint existente.
- **Validação e limites:** Tentativa com outro par de chaves válido recebe 409 e mantém o dono anterior. Atualização do próprio dispositivo e troca legítima com as mesmas chaves continuam funcionando; unsubscribe de terceiro não remove a inscrição.

### SEC-06 — Login CSRF e ausência de validação central de origem

Classificação de referência: CWE-352 (mapeamento contextual).

- **Severidade:** Alta. **Estado:** Corrigida localmente.
- **Local:** `src/lib/api.ts:14`.
- **Descrição/evidência anterior:** Handlers aceitavam JSON enviado como text/plain e não validavam Origin/Fetch Metadata. Uma chamada cross-site de login foi aceita pelo handler original e emitiu cookie de sessão. SameSite=Lax não impede login CSRF, pois a operação cria uma nova sessão.
- **Impacto:** Forçar o navegador da vítima a operar na conta do atacante e viabilizar operações forjadas em contextos com cookies disponíveis.
- **Correção/decisão:** Mutações validam Origin, host/protocolo e Sec-Fetch-Site no wrapper. Leitura de JSON exige application/json. Requisições não navegador sem Origin continuam possíveis, mas dependem da autenticação/autorização normal.
- **Validação e limites:** Original: Origin estrangeiro + text/plain + login válido resultou em 200 com Set-Cookie. HTTP corrigido: 403 para origem estrangeira, 415 para text/plain, 403 para protocolo divergente/cross-site. Login same-origin e logout funcionam.

### SEC-07 — Ausência de limitação de tentativas de autenticação

Classificação de referência: CWE-307 (mapeamento contextual).

- **Severidade:** Média. **Estado:** Corrigida localmente; limites aprovados pelo usuário.
- **Local:** `src/lib/security-rate.ts:8`.
- **Descrição/evidência anterior:** Login e cadastro não tinham contadores de abuso no backend. Identificadores diferentes para e-mail e username da mesma conta precisam compartilhar a proteção.
- **Impacto:** Tentativas automatizadas de senha e criação repetida de contas, com consumo de recursos.
- **Correção/decisão:** Limites aprovados: 10 tentativas por conta/15 min, compartilhadas entre aliases, e 20 cadastros por rede/15 min. Contadores persistidos com compare-and-swap no banco e limpeza de janelas antigas. No Railway, usa X-Real-IP apenas quando existe RAILWAY_ENVIRONMENT_ID; fora dele, bucket compartilhado conservador, sem confiar em cabeçalho arbitrário.
- **Validação e limites:** 10 tentativas alternando e-mail/username produzem 401; a seguinte recebe 429. 15 incrementos simultâneos + 5 sequenciais chegam exatamente a 20 e o próximo é negado. Não foi realizado brute force em produção.

### SEC-08 — Redirecionamento externo após login

Classificação de referência: CWE-601 (mapeamento contextual).

- **Severidade:** Média. **Estado:** Corrigida localmente.
- **Local:** `src/components/auth/AuthForm.tsx:34`.
- **Descrição/evidência anterior:** A validação next.startsWith("/") aceitava //host e caminhos com barra invertida, que podem mudar a autoridade do destino no navegador.
- **Impacto:** Redirecionamento para páginas de phishing depois de uma autenticação legítima.
- **Correção/decisão:** Helper aceita somente caminho local, rejeitando início //, barras invertidas e caracteres de controle/espaço. Links locais com query continuam aceitos.
- **Validação e limites:** Testes unitários das variantes; Chrome fez login real com next=//evil.example e permaneceu na origem local, sem navegar ao domínio externo.

### SEC-09 — Corpos JSON sem limite e sem verificação do tipo raiz

Classificação de referência: CWE-400 (mapeamento contextual).

- **Severidade:** Média. **Estado:** Corrigida localmente.
- **Local:** `src/lib/api.ts:29`.
- **Descrição/evidência anterior:** req.json() consumia o corpo integralmente e aceitava null/arrays/primitivos, causando erros internos em handlers. Não havia limite geral de memória antes do parsing.
- **Impacto:** Consumo de memória por requisições grandes e respostas 500 induzidas. Não foi feito teste de esgotamento de memória.
- **Correção/decisão:** Leitura incremental limitada a 2 MiB, incluindo corpos sem Content-Length. Importações de prints mantêm exceção de 50 MiB para até oito imagens de 6 MiB. JSON precisa ter objeto na raiz; erros 400/413/415 são seguros. Upload de treino e clipboard já possuem limites próprios.
- **Validação e limites:** Corpo acima de 2 MiB retorna 413 via HTTP; JSON null retorna 400. Comparação com helper original demonstrou ausência de limite. Limites existentes de upload continuam preservados.

### SEC-10 — Cache persistente de imagens privadas

Classificação de referência: CWE-525 (mapeamento contextual).

- **Severidade:** Baixa. **Estado:** Corrigida localmente.
- **Local:** `src/app/api/imagens/[id]/route.ts:25`.
- **Descrição/evidência anterior:** Imagens autenticadas eram servidas com private,max-age=86400,immutable. O navegador podia reutilizar uma resposta por um dia sem consultar a autorização depois de logout/revogação.
- **Impacto:** Reutilização local de bytes privados anteriormente autorizados. Isso não permite apagar cópias já entregues, screenshots ou caches antigos.
- **Correção/decisão:** Respostas novas usam private,no-store e nosniff. Autorização do proprietário/membro e da colaboração permanece no backend.
- **Validação e limites:** HTTP autorizado retorna no-store; outra conta e anônimo não obtêm a imagem. Não se promete retirar bytes que já estavam em caches de versões antigas.

### SEC-11 — Ausência de contenção básica de enquadramento e objetos no navegador

Classificação de referência: CWE-1021 (mapeamento contextual).

- **Severidade:** Baixa. **Estado:** Corrigida localmente.
- **Local:** `next.config.ts:5`.
- **Descrição/evidência anterior:** Não havia política explícita contra framing/clickjacking, objetos embarcados e interpretação de tipos inesperados. Trata-se de fragilidade de configuração; não foi demonstrado clique malicioso em produção.
- **Impacto:** Possibilidade de interface embutida para induzir ações e aumento de superfície de injeção.
- **Correção/decisão:** DENY, nosniff, Referrer-Policy e CSP compatível com object-src none, base-uri self e frame-ancestors none. Banner X-Powered-By desabilitado. Não foi imposta uma CSP de scripts que quebrasse o Next/Tiptap.
- **Validação e limites:** Cabeçalhos verificados no servidor local; UI, editor, links e login conferidos em 375/1440 px e claro/escuro. A CSP é parcial, não uma proteção completa contra XSS.

### SEC-12 — Dependência fast-uri com avisos conhecidos

Classificação de referência: CWE-1104 (mapeamento contextual).

- **Severidade:** Média. **Estado:** Corrigida localmente.
- **Local:** `package-lock.json:5515`.
- **Descrição/evidência anterior:** Versão instalada 3.1.8 está nas faixas dos avisos GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr e GHSA-333x-w4r6-6crp. Encontrada na cadeia Prisma/ajv. Não foi demonstrada exploração por uma rota do app.
- **Impacto:** Problemas de interpretação/normalização de URI em consumidores que dependam desse comportamento.
- **Correção/decisão:** Atualização localizada para 3.1.9, sem trocar a versão principal. Atualizações incidentais de lint foram desfeitas; somente a correção necessária e o patch Next permaneceram.
- **Validação e limites:** npm audit inicial: 8 avisos moderados de pacotes. Depois: fast-uri deixou de ser listado; produção com omit=dev: 0 avisos, dentro do alcance da base npm consultada.

### SEC-13 — Aviso residual de minimatch na cadeia de lint

Classificação de referência: CWE-400 (mapeamento contextual).

- **Severidade:** Média. **Estado:** Pendente: dependência de desenvolvimento.
- **Local:** `package-lock.json:3037`.
- **Descrição/evidência anterior:** minimatch 10.2.6 está afetado pelo GHSA-g3hv-75wg-m249. A correção declarada é 11.0.1, fora da faixa da dependência transitiva atual. Os 7 avisos restantes do npm se referem à mesma cadeia, não a sete vazamentos distintos do app.
- **Impacto:** Amplificação de padrões glob fornecidos à ferramenta de análise. A aplicação não recebe padrões de usuários para o lint; não há rota de execução de ESLint.
- **Correção/decisão:** Não foi forçado override de versão principal nem atualizada indiscriminadamente a toolchain. Aguardar versão compatível da cadeia typescript-eslint e validar novamente.
- **Validação e limites:** npm audit final mantém 7 avisos moderados de desenvolvimento; omit=dev retorna zero. Não foi executado payload de DoS contra a ferramenta.

### SEC-14 — Consumo de IA por importação de prints sem teto diário

Classificação de referência: CWE-770 (mapeamento contextual).

- **Severidade:** Média. **Estado:** Pendente por decisão expressa do usuário.
- **Local:** `src/lib/import.ts:69`.
- **Descrição/evidência anterior:** A importação possui controles de acesso e limites por envio, mas não reserva/cota diária por conta. Limites por contagem em outras operações de IA também não equivalem a uma reserva financeira global atômica.
- **Impacto:** Conta comum pode repetir operações autorizadas e gerar gastos.
- **Correção/decisão:** Foi proposto limite de 12 leituras por dia; o usuário escolheu explicitamente registrar como risco pendente. Nenhum limite de IA foi implementado nesta auditoria.
- **Validação e limites:** Confirmado por análise da chamada e do registro de aiUsage. Não houve chamadas pagas nem abuso de serviço externo para demonstrar gasto.

### SEC-15 — Erros de configuração/integração podiam imprimir conteúdo sensível

Classificação de referência: CWE-532 (mapeamento contextual).

- **Severidade:** Baixa. **Estado:** Corrigida localmente.
- **Local:** `prisma.config.ts:34`.
- **Descrição/evidência anterior:** O erro de URL de banco inválida concatenava a URL inteira; logs genéricos também imprimiam objetos/mensagens completas de integrações, que podem conter dados da requisição. Nenhuma credencial real vazada foi encontrada no Git.
- **Impacto:** Exposição de senha/URL em logs quando a configuração estiver incorreta, ou de dados refletidos em erros de terceiros.
- **Correção/decisão:** Removido o valor da URL do erro; API/agendador/push registram somente tipo/status seguro. Mensagem pública de erro continua genérica.
- **Validação e limites:** Teste com URI inválida contendo uma credencial FICTÍCIA comprova que o stderr não a repete. Varreduras de histórico e bundles não imprimem valores secretos.

### SEC-16 — Versão Next.js dentro das faixas dos avisos oficiais de novembro

Classificação de referência: CWE-1104 (mapeamento contextual).

- **Severidade:** Alta potencial. **Estado:** Versão corrigida; exploração no app não demonstrada.
- **Local:** `package.json:36`.
- **Descrição/evidência anterior:** 16.4.2 está nas faixas de sete avisos publicados em 03/11/2026 pelos mantenedores. O npm audit consultado não os listou, por isso houve conferência independente. Os avisos dependem de recursos como Cache Components/use cache, runtime Edge, respostas upstream e otimização SVG. Esses pré-requisitos não foram encontrados nos fluxos do app; não se afirma vazamento explorável deles neste projeto.
- **Impacto:** Risco latente de falhas do framework caso um caminho aplicável seja habilitado ou exista fora da cobertura. Um aviso do conjunto é classificado como alto pelos mantenedores.
- **Correção/decisão:** Patch localizado next 16.4.2 → 16.4.5 e pacotes associados do próprio Next; sem ativar Cache Components ou mudar telas.
- **Validação e limites:** Tipos, lint, 13 testes de segurança, 8 de mapa, 17 de recorrências, build e 327 controles HTTP aprovados no Next 16.4.5. Não foi executado exploit desses CVEs.

## C. Proteção de dados entre usuários

| Pergunta | Resultado e evidência |
|---|---|
| 1. Visitante sem login acessa dados privados? | **Testado e protegido nas rotas verificadas.** 104 handlers protegidos × sem cookie/token falso = 208 negações HTTP 401. Cinco handlers públicos têm finalidade explícita: login, cadastro, logout, estado público de autenticação e cron autenticado por segredo. Arquivos internos/.env/.git/banco/debug não foram servidos. |
| 2. Usuário comum acessa dados de outra conta? | **Vulnerabilidade encontrada e corrigida:** lembrete após revogação (SEC-02). Os recursos privados, listas e páginas testados negam outra conta; compartilhamento aceito continua legítimo. Não há garantia sobre todo estado concorrente possível. |
| 3. Usuário comum altera dados de outra conta? | **Vulnerabilidades encontradas e corrigidas:** recorrências revogadas e inscrição de push (SEC-03/05). Foram executadas 47 requisições HTTP válidas com objetos de B usando a sessão de A, além dos testes de backend. Alterações legítimas de membros permanecem permitidas. |
| 4. Usuário comum executa administração? | **Testado e protegido após correção.** Rotas admin retornam 403 a A; administrador legítimo consulta o painel. SEC-01 antes elegia múltiplos admins no bootstrap; regressão elege somente um. Papel admin não concede acesso direto a quadros privados de terceiros nas rotas comuns. |
| 5. É possível contornar permissões manipulando requisições? | **Nenhum contorno encontrado nos cenários executados após os patches.** Testes de IDs, usuário/papel no corpo, query de listas, destino de movimentação, recursos de outro mapa, lote e funções admin. Uma resposta negativa não prova ausência de todas as variantes. |
| 6. Controles estão no backend? | **Verificado.** withUser/withAdmin, userFromSession, boardAccess/ownedCard/ownedList, writeMap, filtros userId e readableOwner. Botões ocultos não são usados como controle de segurança. |
| 7. Isolamento correto no banco? | **Testado no SQLite pelo backend/HTTP** para os recursos listados. Prisma faz consultas parametrizadas com escopo de proprietário/compartilhamento. **Não foi possível verificar** grants, exposição de rede, backups, TLS efetivo ou RLS do Postgres real. O app não depende de RLS; credencial do banco deve ficar só no servidor. |
| 8. Credenciais privadas expostas? | **Não encontradas nas verificações realizadas.** Varredura de 1.240 blobs históricos por padrões e comparação dos valores privados locais com fontes/público/bundles. O único tipo de coincidência literal foi a URL padrão SQLite documentada, que não é credencial. SEC-15 corrigiu vazamento potencial em erro. Formatos desconhecidos, logs reais, variáveis do Railway, backups e credenciais antigas não presentes na cópia local não foram certificados. Nenhuma rotação real foi executada. |

### Recursos e limites examinados

- Quadros/tasks/organização/mapas: proprietário e membro com edição; somente dono exclui quadro e gerencia convites/membros. Consulta via colaboração exige aceite ativo e shareBoards; não autoriza escrita automaticamente. Aprovação de pedido de edição permanece explícita.
- Tarefas/listas: criação, leitura, edição, exclusão, cópia, arquivamento, movimento entre quadros, checklist, imagens, timer, etiquetas e desfazer. Validação do quadro de origem e do destino quando aplicável; histórico de undo é por usuário e revalida recursos.
- Projetos, treinos, planos, registros, sono, lazer, lembretes, sessões de trabalho, settings, IA e exportação: objetos pessoais usam userId do servidor; recursos compartilhados seguem boardAccess. PDF/imagem de treino é limitado, possui assinatura validada e é tratado como conteúdo de dados.
- Autenticação: scrypt com salt, tokens aleatórios de 32 bytes, HttpOnly/Secure/SameSite=Lax, expiração, logout, conta desativada e revogação por troca de senha. A troca de senha e revogação das outras sessões agora são atômicas. Não existem recuperação por e-mail, refresh token, JWT, OAuth ou provedores sociais; portanto suas verificações específicas não se aplicam.
- Banco: não foram encontradas consultas raw/concatenação SQL, NoSQL, shell ou deserialização executável nos caminhos de produção inspecionados. new Function existe somente nos loaders dos testes para carregar TypeScript real, não no app.
- Frontend: descrição escapa HTML e limita protocolos dos links; estilos e clipboard do mapa têm validação; exportação usa texto/DOM, não executa HTML de usuário. O único dangerouslySetInnerHTML encontrado é o script estático de preferência do trilho, sem interpolação de entrada. Nenhum source map foi gerado em `.next/static` no build auditado.
- Integrações: URLs de imagens/importações são data URLs; não há download de arquivo de um endereço arbitrário do usuário. Push foi o caminho de saída SSRF identificado. Cron exige segredo de servidor. Busca de usuários autenticada retorna perfil breve, sem e-mail/hash/sessões; descobrir uma rota ou um @ destinado a compartilhamento não foi classificado como vazamento.

## D. Arquivos alterados

- `next.config.ts` — Cabeçalhos de contenção e remoção do banner do framework.
- `package.json` — Patch Next 16.4.5 e comandos reproduzíveis dos testes de segurança.
- `package-lock.json` — Lockfile do patch Next e fast-uri 3.1.9; sem atualizações generalizadas.
- `prisma.config.ts` — Não repetir URL potencialmente secreta em erro.
- `src/app/api/auth/register/route.ts` — Aplicar limite de cadastro aprovado.
- `src/app/api/boards/[id]/importar/route.ts` — Exceção explícita de tamanho preservando até oito prints.
- `src/app/api/boards/[id]/mapa/importar/route.ts` — Mesmo teto compatível de importação; JSON geral permanece limitado.
- `src/app/api/imagens/[id]/route.ts` — Evitar cache duradouro de imagem privada e sniffing.
- `src/components/auth/AuthForm.tsx` — Impedir mudança de origem no redirecionamento pós-login.
- `src/instrumentation.ts` — Logs de erro do agendador sem mensagens arbitrárias de terceiros.
- `src/lib/ai.ts` — Conferir dono da sessão antes de informar disponibilidade da integração.
- `src/lib/api.ts` — Origem das mutações, JSON limitado e tipado, logs seguros.
- `src/lib/auth.ts` — Serializar bootstrap, limitar login, validar formato do token e tornar troca de senha/revogação atômicas.
- `src/lib/notifications.ts` — Destino de push validado/pinado, prova do dispositivo na troca de conta, relação de cartão autorizada e logs seguros.
- `src/lib/reminders.ts` — Revalidar o acesso ao cartão relacionado nas respostas.
- `src/lib/repo.ts` — Revalidar participação ao editar/excluir/gerar recorrências.
- `src/lib/push-security.ts` — Validar chave criptográfica e endpoints públicos; comparação segura e DNS no transporte.
- `src/lib/safe-redirect.ts` — Validador de caminhos locais testável.
- `src/lib/security-rate.ts` — Contadores persistentes/atômicos, expiração e identificação de rede confiável.
- `scripts/test-security.cjs` — 13 testes com banco vazio e backend real.
- `scripts/test-security-http.cjs` — Matriz HTTP contra build real e servidor/banco isolados.
- `SECURITY_AUDIT_REPORT.md` — Relatório solicitado, inventário e limitações.

Nenhuma mudança de schema/migration, visual/CSS, cálculo de métricas, preço, dado real ou permissão legítima foi feita. As regras de autenticação limitam abuso conforme autorização expressa nesta conversa. Chaves novas em AppSetting (`security:registration-lock` e `security:rate:*`) guardam locks/contadores, não credenciais.

## E. Testes executados e reprodução

| Verificação | Resultado | Limite da evidência |
|---|---|---|
| Reproduções com backend original 947afe0 | 3 administradores concorrentes; título após revogação; update de recorrência revogada; endpoint interno aceito; transferência cega de dispositivo | Banco descartável. SSRF foi demonstrado até aceitação/transport callback, sem ataque a redes. |
| Handler original de login | Origin estrangeiro + text/plain resultou em login 200 com cookie; JSON ignorava teto | Código original carregado localmente; não foi hospedada página de phishing real. |
| npm run test:security | **13/13 aprovados** | Backend real/Prisma e SQLite vazio. DNS do transporte simulado, sem push real. |
| npm run test:security:http | **327 verificações aprovadas**, 208 negações sem sessão/token falso e 47 negações de requisições válidas entre contas | Servidor Next de produção local, não Railway; não cobre toda permutação de campos/ações. |
| npm run test:mind | **8/8 aprovados** | Geometria/seleção/clipboard/grade. |
| npm run test:recurring | **17/17 aprovados** | Recorrência, sessão, pausas, edição, conflitos/idempotência em SQLite. |
| npx tsc --noEmit -p . | Aprovado | Tipos não provam autorização. |
| npx eslint src | Aprovado | Análise de lint; não substitui pentest. |
| npx next build | Aprovado com Next **16.4.5** | Build local. |
| Chrome 375/1440 px, claro/escuro | Login, editor, HTML escapado, links javascript rejeitados, Markdown/link HTTPS preservados, retorno seguro após login, sem erros de página nos cenários | Chrome no Mac; não é Safari/Firefox ou Windows nativo. |
| npm audit --omit=dev --json | **0 avisos reportados** | Base npm consultada; advisories do Next foram checados separadamente. Não significa ausência de vulnerabilidade desconhecida. |
| npm audit --json | **7 moderados residuais** | Mesma cadeia minimatch/typescript-eslint em dev; SEC-13. |
| Histórico Git | **1.240 blobs**, sem padrões encontrados de chaves OpenAI/GitHub/AWS/privadas/URLs reais reconhecidas | Scanner por padrões, sujeito a falsos negativos; `.env` é ignorado e não foi exibido. |
| Arquivos públicos/estáticos/fontes | 458 caminhos na comparação inicial; sem valor secreto local confirmado | A coincidência de DATABASE_URL era o caminho padrão SQLite público e foi classificada como não secreta. |
| git diff --check | Aprovado | Apenas consistência do patch. |

Comandos reproduzíveis (Node do projeto pelo nvm):

```sh
npm run test:security
# Necessita build de produção local e client Prisma SQLite:
npx next build
npm run test:security:http
npm run test:mind
npm run test:recurring
npx tsc --noEmit -p .
npx eslint src
npm audit --omit=dev
```

Os testes nunca usam um banco existente: criam uma pasta temporária, derivam SQL do schema atual e aplicam o schema vazio. Isso também evita reescrever a migration SQLite legada com falha já documentada. Não é teste de instalação de todo o histórico de migrations. A suíte HTTP força IA/VAPID/cron vazios e desliga o agendador. `SECURITY_KEEP_FIXTURE=1` é apenas opção local de QA; guarda tokens FICTÍCIOS para conferência visual, nunca credenciais de produção. O padrão remove a base ao terminar.

Roteiros e saídas temporários desta sessão, sujeitos à limpeza do sistema: `/private/tmp/onerundred-security-baseline.log`, `onerundred-security-baseline-web.log`, `onerundred-security-http-final.log`, `onerundred-security-build.log`, `onerundred-security-npm-audit-before.json`, `onerundred-security-npm-audit-after.json`, `onerundred-security-production-audit.json`, `onerundred-security-secret-scan.json`, `onerundred-security-bundle-secret-scan.json`, `onerundred-security-browser.cjs` e `onerundred-security-ui-*.png`.

### Fontes primárias consultadas

- [OWASP API Security — BOLA](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/)
- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) e [WSTG](https://owasp.org/www-project-web-security-testing-guide/): referências de categorias; não se declara certificação nem conclusão de todos os controles ASVS.
- [Next.js — November 2026 Security Release](https://nextjs.org/blog/november-2026-security-release); texto oficial obtido diretamente por HTTPS, pois a ferramenta de navegação falhou nessa URL. [Advisories dos mantenedores](https://github.com/vercel/next.js/security/advisories) e API pública do repositório também consultados.
- [fast-uri GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg), demais IDs em SEC-12; [minimatch GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
- [Railway — Specs & Limits](https://docs.railway.com/networking/public-networking/specs-and-limits): X-Real-IP e X-Forwarded-Proto documentados. O caminho efetivo do deployment não foi testado ofensivamente.
- Guias locais Next 16 e fonte instalada de web-push: agente HTTPS aceita lookup customizado, não segue redirect e recebe o IP já validado.

## F. Riscos residuais e limites

1. **SEC-14 continua existente por decisão do usuário:** sem novo teto diário/cota financeira para importação de prints. Outros endpoints de IA também precisam de uma estratégia de orçamento/reserva atômica para resistência a paralelismo/contas múltiplas; não foi imposta mudança de regra.
2. **SEC-13 continua na toolchain dev.** Atualização principal de minimatch via override não foi forçada. Evitar executar lint de padrões controlados por desconhecidos e reavaliar quando a dependência suportar a correção.
3. **Nada foi publicado.** As correções descritas pertencem à branch local. Não foi verificado que produção já está protegida por elas.
4. Sem acesso ao Postgres real: não se verificaram usuários SQL, grants/superuser, exposição pública da porta, TLS, backup/restauração, logs/auditoria da plataforma, retenção de dados ou permissões do GitHub/Railway. Não há ferramentas Postgres/Docker disponíveis para um ensaio local equivalente nesta máquina. Não foram acessadas contas nem tabelas reais.
5. Concorrência de bootstrap e contadores validada em SQLite, não em Postgres. O algoritmo usa upsert/lock de linha/CAS do banco, mas um teste multi-instância contra Postgres permanece recomendado antes da publicação.
6. Limite por rede depende de todo tráfego passar pelo proxy confiável Railway. Acesso direto ao processo ou outro provedor exige configurar uma identidade de rede confiável. IPs compartilhados/NAT dividem o teto; distribuidores podem usar redes/contas diferentes. Limites não substituem proteção global de L7 ou cotas de armazenamento.
7. Tokens de sessão são opacos e aleatórios, mas são guardados como bearer no banco. Compromisso do banco/servidor/segredos do provedor foge do isolamento de APIs testado. MFA e verificação de e-mail não existem; implementar exige decisão funcional separada.
8. CSP é propositalmente parcial para preservar scripts/estilos legítimos do Next/editor. Não há certificação de CSP estrita por nonce, HSTS efetivo do domínio/CDN nem proteção total contra XSS. TLS da produção é responsabilidade do provedor e não foi reconfigurado.
9. Validação de destinos push protege URLs/IPs e resolução na conexão; não substitui firewall de saída, controle global de conexões/respostas ou limites por conta. Não houve teste de entrega real, latência/falha dos provedores, DNS rebinding em rede real ou compatibilidade em todos os navegadores. Autoseleção de família/DNS foi validada no callback com respostas simuladas. A prova de transferência depende do segredo auth da inscrição; vazá-lo compromete essa capacidade.
10. Revogação impede futuras leituras autorizadas pelas respostas novas, não apaga informação já entregue, baixada, copiada ou em cache de versão antiga. Avaliar administradores preexistentes se houver suspeita de bootstrap concorrido; esta auditoria não rebaixou nem removeu contas reais.
11. O scanner de segredos usa formatos reconhecidos e comparação com valores locais. Não é prova de ausência de toda chave, dado pessoal ou vazamento fora do checkout. Não foram inspecionados logs/histórico de deploy/backups externos nem feitas rotações.
12. Não foram feitos DDoS, fuzzing destrutivo, exploração de terceiros, envio de e-mails/push pagos ou auditoria do sistema operacional/CDN. Não há pagamentos, finanças, GraphQL, OAuth, webhooks de pagamento, armazenamento de buckets públicos ou executores de shell por API no app inspecionado.

## G. Inventário de endpoints e controles

Cada linha abaixo corresponde a um handler exportado. **U** = sessão válida, ativa e não expirada; **A** = U + admin; **P** = público com regras específicas; **C** = segredo de cron. Operações autenticadas continuam sujeitas à autorização por objeto descrita na coluna. JSON é validado/limitado no servidor, mutações têm proteção de origem, e funções de domínio selecionam os campos aceitos. Chamadas diretas fora do frontend foram usadas nos testes. Não há rate limit geral para toda API: limites de login/cadastro são explícitos; cotas de IA e limites de uploads/lotes estão nos respectivos módulos. As demais operações dependem de autorização e limites locais de entrada, sem proteção completa contra abuso agregado.

| Método | Rota | Acesso | Escopo/dados/validação principal |
|---|---|---|---|
| GET | `/api/admin/settings` | A | Admin no backend; campos permitidos; proteção da própria conta contra exclusão/rebaixamento; dados globais restritos. |
| PATCH | `/api/admin/settings` | A | Admin no backend; campos permitidos; proteção da própria conta contra exclusão/rebaixamento; dados globais restritos. |
| PATCH | `/api/admin/users/[id]` | A | Admin no backend; campos permitidos; proteção da própria conta contra exclusão/rebaixamento; dados globais restritos. |
| DELETE | `/api/admin/users/[id]` | A | Admin no backend; campos permitidos; proteção da própria conta contra exclusão/rebaixamento; dados globais restritos. |
| GET | `/api/admin/users` | A | Admin no backend; campos permitidos; proteção da própria conta contra exclusão/rebaixamento; dados globais restritos. |
| GET | `/api/ai/insight` | U | Memória/análise/uso da própria conta; informações de quadros somente por taskBoardAccess; limites existentes e risco SEC-14. |
| POST | `/api/ai/insight` | U | Memória/análise/uso da própria conta; informações de quadros somente por taskBoardAccess; limites existentes e risco SEC-14. |
| DELETE | `/api/ai/insight` | U | Memória/análise/uso da própria conta; informações de quadros somente por taskBoardAccess; limites existentes e risco SEC-14. |
| GET | `/api/arquivadas` | U | Quadros autorizados; origem de arquivo também filtrada; undo pessoal revalida cada cartão/lista. |
| DELETE | `/api/arquivadas` | U | Quadros autorizados; origem de arquivo também filtrada; undo pessoal revalida cada cartão/lista. |
| POST | `/api/auth/login` | P | Credenciais verificadas; conta ativa; sessão nova; 10 tentativas/15 min por conta/aliases; cookie protegido. |
| POST | `/api/auth/logout` | P | Revoga somente token do cookie atual; origem validada; sem leitura de dados de contas. |
| GET | `/api/auth/me` | P | GET público retorna user=null sem sessão; perfil válido contém somente campos permitidos; PATCH altera só o próprio perfil. |
| PATCH | `/api/auth/me` | U | GET público retorna user=null sem sessão; perfil válido contém somente campos permitidos; PATCH altera só o próprio perfil. |
| POST | `/api/auth/password` | U | Sessão própria, senha atual; hash novo e revogação de outras sessões atômicos. |
| POST | `/api/auth/register` | P | Cadastro aberto/validação; lock do primeiro admin; 20 tentativas/rede/15 min; role do servidor. |
| POST | `/api/boards/[id]/compartilhar` | U | Dono convida/remove; membro pode sair; convite recebido somente pelo destinatário. |
| DELETE | `/api/boards/[id]/compartilhar` | U | Dono convida/remove; membro pode sair; convite recebido somente pelo destinatário. |
| GET | `/api/boards/[id]/etiquetas` | U | boardAccess; dono/membro; exclusão só dono; imagens/plano/importação limitados e IDs conferidos. |
| POST | `/api/boards/[id]/importar` | U | boardAccess; dono/membro; exclusão só dono; imagens/plano/importação limitados e IDs conferidos. |
| PUT | `/api/boards/[id]/importar` | U | boardAccess; dono/membro; exclusão só dono; imagens/plano/importação limitados e IDs conferidos. |
| POST | `/api/boards/[id]/mapa/colar` | U | Quadro acessível com edição; writeMap; IDs no mesmo mapa, geometria/estilos/lote validados; importa/copia/exporta somente conteúdo autorizado. |
| POST | `/api/boards/[id]/mapa/desfazer` | U | Quadro acessível com edição; writeMap; IDs no mesmo mapa, geometria/estilos/lote validados; importa/copia/exporta somente conteúdo autorizado. |
| POST | `/api/boards/[id]/mapa/estrutura` | U | Quadro acessível com edição; writeMap; IDs no mesmo mapa, geometria/estilos/lote validados; importa/copia/exporta somente conteúdo autorizado. |
| POST | `/api/boards/[id]/mapa/importar` | U | Quadro acessível com edição; writeMap; IDs no mesmo mapa, geometria/estilos/lote validados; importa/copia/exporta somente conteúdo autorizado. |
| PUT | `/api/boards/[id]/mapa/importar` | U | Quadro acessível com edição; writeMap; IDs no mesmo mapa, geometria/estilos/lote validados; importa/copia/exporta somente conteúdo autorizado. |
| POST | `/api/boards/[id]/mapa/refazer` | U | Quadro acessível com edição; writeMap; IDs no mesmo mapa, geometria/estilos/lote validados; importa/copia/exporta somente conteúdo autorizado. |
| POST | `/api/boards/[id]/mapa` | U | Quadro acessível com edição; writeMap; IDs no mesmo mapa, geometria/estilos/lote validados; importa/copia/exporta somente conteúdo autorizado. |
| PATCH | `/api/boards/[id]/mapa` | U | Quadro acessível com edição; writeMap; IDs no mesmo mapa, geometria/estilos/lote validados; importa/copia/exporta somente conteúdo autorizado. |
| DELETE | `/api/boards/[id]/mapa` | U | Quadro acessível com edição; writeMap; IDs no mesmo mapa, geometria/estilos/lote validados; importa/copia/exporta somente conteúdo autorizado. |
| POST | `/api/boards/[id]/mapa/selecao` | U | Quadro acessível com edição; writeMap; IDs no mesmo mapa, geometria/estilos/lote validados; importa/copia/exporta somente conteúdo autorizado. |
| GET | `/api/boards/[id]` | U | boardAccess; dono/membro; exclusão só dono; imagens/plano/importação limitados e IDs conferidos. |
| PATCH | `/api/boards/[id]` | U | boardAccess; dono/membro; exclusão só dono; imagens/plano/importação limitados e IDs conferidos. |
| DELETE | `/api/boards/[id]` | U | boardAccess; dono/membro; exclusão só dono; imagens/plano/importação limitados e IDs conferidos. |
| GET | `/api/boards/favoritos` | U | Preferência pessoal; até três IDs, cada quadro atualmente acessível. |
| PUT | `/api/boards/favoritos` | U | Preferência pessoal; até três IDs, cada quadro atualmente acessível. |
| GET | `/api/boards` | U | Lista/cria quadros do usuário e compartilhados; tipo/ícone/nome explícitos; listas por acesso. |
| POST | `/api/boards` | U | Lista/cria quadros do usuário e compartilhados; tipo/ícone/nome explícitos; listas por acesso. |
| POST | `/api/cards/[id]/acoes` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| POST | `/api/cards/[id]/checklist` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| PATCH | `/api/cards/[id]/checklist` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| DELETE | `/api/cards/[id]/checklist` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| POST | `/api/cards/[id]/imagens` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| DELETE | `/api/cards/[id]/imagens` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| GET | `/api/cards/[id]` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| PATCH | `/api/cards/[id]` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| DELETE | `/api/cards/[id]` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| POST | `/api/cards/[id]/timer` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| DELETE | `/api/cards/[id]/timer` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| POST | `/api/cards/move` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| POST | `/api/cards` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| GET | `/api/colaboradores/edicao` | U | Convite, destinatário/gestor e aceite explícito; pedido de edição aprovado só pelo dono; leitura não concede escrita. |
| POST | `/api/colaboradores/edicao` | U | Convite, destinatário/gestor e aceite explícito; pedido de edição aprovado só pelo dono; leitura não concede escrita. |
| PATCH | `/api/colaboradores/edicao` | U | Convite, destinatário/gestor e aceite explícito; pedido de edição aprovado só pelo dono; leitura não concede escrita. |
| GET | `/api/colaboradores` | U | Convite, destinatário/gestor e aceite explícito; pedido de edição aprovado só pelo dono; leitura não concede escrita. |
| POST | `/api/colaboradores` | U | Convite, destinatário/gestor e aceite explícito; pedido de edição aprovado só pelo dono; leitura não concede escrita. |
| PATCH | `/api/colaboradores` | U | Convite, destinatário/gestor e aceite explícito; pedido de edição aprovado só pelo dono; leitura não concede escrita. |
| GET | `/api/convites` | U | toUserId da sessão; status pendente; aceitar/recusar somente o próprio convite. |
| POST | `/api/convites` | U | toUserId da sessão; status pendente; aceitar/recusar somente o próprio convite. |
| GET | `/api/dashboard` | U | Agregados da própria conta/quadros compartilhados; período validado; nenhuma escolha livre de userId externo. |
| GET | `/api/imagens/[id]` | U | Imagem vinculada a cartão/quadro acessível ou colaboração autorizada; bytes privados no-store. |
| PATCH | `/api/lazer/[id]` | U | userId e datas/horas validadas; leitura/listagem/edição/exclusão apenas da própria conta. |
| DELETE | `/api/lazer/[id]` | U | userId e datas/horas validadas; leitura/listagem/edição/exclusão apenas da própria conta. |
| GET | `/api/lazer` | U | userId e datas/horas validadas; leitura/listagem/edição/exclusão apenas da própria conta. |
| POST | `/api/lazer` | U | userId e datas/horas validadas; leitura/listagem/edição/exclusão apenas da própria conta. |
| PATCH | `/api/lembretes/[id]` | U | Lembrete pessoal; cartão relacionado também exige acesso atual; title/data/repetição explicitamente validados. |
| DELETE | `/api/lembretes/[id]` | U | Lembrete pessoal; cartão relacionado também exige acesso atual; title/data/repetição explicitamente validados. |
| GET | `/api/lembretes` | U | Lembrete pessoal; cartão relacionado também exige acesso atual; title/data/repetição explicitamente validados. |
| POST | `/api/lembretes` | U | Lembrete pessoal; cartão relacionado também exige acesso atual; title/data/repetição explicitamente validados. |
| POST | `/api/lists/[id]/acoes` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| PATCH | `/api/lists/[id]` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| DELETE | `/api/lists/[id]` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| POST | `/api/lists` | U | ownedCard/ownedList/boardAccess; subitens e destinos vinculados ao objeto; campos aceitos explícitos; retorna conteúdo autorizado. |
| POST | `/api/notificacoes/inscricao` | U | Preferências/dispositivos da sessão; URL/chaves validadas, transferência com prova; DNS pinado; VAPID privado não retorna. |
| DELETE | `/api/notificacoes/inscricao` | U | Preferências/dispositivos da sessão; URL/chaves validadas, transferência com prova; DNS pinado; VAPID privado não retorna. |
| GET | `/api/notificacoes` | U | Preferências/dispositivos da sessão; URL/chaves validadas, transferência com prova; DNS pinado; VAPID privado não retorna. |
| PATCH | `/api/notificacoes` | U | Preferências/dispositivos da sessão; URL/chaves validadas, transferência com prova; DNS pinado; VAPID privado não retorna. |
| POST | `/api/notificacoes/teste` | U | Preferências/dispositivos da sessão; URL/chaves validadas, transferência com prova; DNS pinado; VAPID privado não retorna. |
| POST | `/api/notificacoes/tick` | C | Bearer CRON_SECRET obrigatório; ausente/inválido nega; agendador sem entrada de IDs de terceiros. |
| GET | `/api/performance` | U | Agregados da própria conta/quadros compartilhados; período validado; nenhuma escolha livre de userId externo. |
| POST | `/api/projetos/[id]/dias` | U | userId da sessão, tipo correto de projeto; duração/datas/diário validados; campos de propriedade não atribuíveis pelo corpo. |
| GET | `/api/projetos/[id]` | U | userId da sessão, tipo correto de projeto; duração/datas/diário validados; campos de propriedade não atribuíveis pelo corpo. |
| PATCH | `/api/projetos/[id]` | U | userId da sessão, tipo correto de projeto; duração/datas/diário validados; campos de propriedade não atribuíveis pelo corpo. |
| DELETE | `/api/projetos/[id]` | U | userId da sessão, tipo correto de projeto; duração/datas/diário validados; campos de propriedade não atribuíveis pelo corpo. |
| GET | `/api/projetos` | U | userId da sessão, tipo correto de projeto; duração/datas/diário validados; campos de propriedade não atribuíveis pelo corpo. |
| POST | `/api/projetos` | U | userId da sessão, tipo correto de projeto; duração/datas/diário validados; campos de propriedade não atribuíveis pelo corpo. |
| PATCH | `/api/recorrentes/[id]` | U | Criador + participação atual na lista/quadro; dias e destinos validados; geração revalida acesso. |
| DELETE | `/api/recorrentes/[id]` | U | Criador + participação atual na lista/quadro; dias e destinos validados; geração revalida acesso. |
| POST | `/api/recorrentes` | U | Criador + participação atual na lista/quadro; dias e destinos validados; geração revalida acesso. |
| GET | `/api/settings` | U | Preferências pessoais; design comparativo exige admin; não altera userId/role do corpo. |
| PATCH | `/api/settings` | U | Preferências pessoais; design comparativo exige admin; não altera userId/role do corpo. |
| DELETE | `/api/sono/[id]` | U | userId e datas/horas validadas; leitura/listagem/edição/exclusão apenas da própria conta. |
| GET | `/api/sono` | U | userId e datas/horas validadas; leitura/listagem/edição/exclusão apenas da própria conta. |
| POST | `/api/sono` | U | userId e datas/horas validadas; leitura/listagem/edição/exclusão apenas da própria conta. |
| POST | `/api/treinos/[id]/plano/importar` | U | Projeto do usuário; planos/registros vinculados ao projeto; upload limitado a 8 MB com assinatura; sem IDs de outro dono. |
| PUT | `/api/treinos/[id]/plano` | U | Projeto do usuário; planos/registros vinculados ao projeto; upload limitado a 8 MB com assinatura; sem IDs de outro dono. |
| DELETE | `/api/treinos/[id]/registros/[logId]` | U | Projeto do usuário; planos/registros vinculados ao projeto; upload limitado a 8 MB com assinatura; sem IDs de outro dono. |
| POST | `/api/treinos/[id]/registros` | U | Projeto do usuário; planos/registros vinculados ao projeto; upload limitado a 8 MB com assinatura; sem IDs de outro dono. |
| PATCH | `/api/treinos/[id]` | U | Projeto do usuário; planos/registros vinculados ao projeto; upload limitado a 8 MB com assinatura; sem IDs de outro dono. |
| DELETE | `/api/treinos/[id]` | U | Projeto do usuário; planos/registros vinculados ao projeto; upload limitado a 8 MB com assinatura; sem IDs de outro dono. |
| POST | `/api/treinos` | U | Projeto do usuário; planos/registros vinculados ao projeto; upload limitado a 8 MB com assinatura; sem IDs de outro dono. |
| GET | `/api/undo` | U | Quadros autorizados; origem de arquivo também filtrada; undo pessoal revalida cada cartão/lista. |
| POST | `/api/undo` | U | Quadros autorizados; origem de arquivo também filtrada; undo pessoal revalida cada cartão/lista. |
| GET | `/api/usuarios/busca` | U | Busca autenticada de perfil breve para convite; mínimo dois caracteres, até seis resultados; sem email/hash. |
| POST | `/api/work/[id]/analise` | U | Sessão userId; horários/pausas/idempotência e sobreposição validados; análise confere dono antes da integração. |
| PATCH | `/api/work/[id]` | U | Sessão userId; horários/pausas/idempotência e sobreposição validados; análise confere dono antes da integração. |
| DELETE | `/api/work/[id]` | U | Sessão userId; horários/pausas/idempotência e sobreposição validados; análise confere dono antes da integração. |
| GET | `/api/work` | U | Sessão userId; horários/pausas/idempotência e sobreposição validados; análise confere dono antes da integração. |
| POST | `/api/work` | U | Sessão userId; horários/pausas/idempotência e sobreposição validados; análise confere dono antes da integração. |
