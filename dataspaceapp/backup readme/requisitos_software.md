# Requisitos de Software do INTRA Dataspace

## 1. Finalidade

Este documento traduz a visao do Product Owner em requisitos de software para o prototipo `INTRA Dataspace`, alinhado aos principios da IDSA, do Gaia-X e do Dataspace Protocol, mas adaptado a uma implementacao lightweight em `Next.js + Firebase`.

O objetivo nao e construir uma integracao convencional entre sistemas. O objetivo e materializar um Dataspace interno no qual:

- os dados permanecem na origem;
- o catalogo publica apenas metadados e ofertas;
- nenhum cliente anonimo navega no ecossistema;
- a confianca de identidade antecede catalogo, membership e contrato;
- a federacao governa a entrada no ecossistema;
- o ativo governa o uso concreto do dado;
- o plano de controle registra identidade, politicas, contratos, tokens e auditoria;
- o plano de dados entrega o payload diretamente da fonte, com baixa latencia.

## 2. Fronteiras Arquiteturais

Para que a solucao seja considerada um Dataspace valido, e nao apenas um hub de APIs, ela deve respeitar as seguintes fronteiras:

- `Descentralizacao fisica`: o payload operacional nao deve ser consolidado obrigatoriamente em Data Lake ou Data Warehouse da plataforma.
- `Zero Trust`: todo participante deve provar sua identidade antes de visualizar catalogos, federacoes ou ativos.
- `Federated Catalog`: a descoberta deve ocorrer sobre metadados, self-descriptions e ofertas, nao sobre copia do dado.
- `Usage Control`: o acesso inicial nao basta; o uso posterior deve respeitar finalidade, vigencia, revogacao e obrigacoes negociadas.
- `Control Plane x Data Plane`: negociacao, tokenizacao e auditoria ficam no plano de controle; a troca do dado ocorre no plano de dados.
- `Pay-as-you-go semantics`: a interpretacao semantica deve ser baseada em `AAS`, `IRDI`, `ECLASS` e metadados distribuidos, sem ontologia monolitica central.

## 3. Atores

- `Data Owner`: participante que cria o conector provedor, define federacoes, politicas, ativos e aprova acessos.
- `Data Client`: participante que registra o conector consumidor, estabelece confianca, entra em federacoes, negocia contratos e consome dados.
- `Connector Control Plane`: camada `Next.js + Firebase` responsavel por identidade, catalogo, membership, contratos, tokens e auditoria.
- `Connector Data Plane / Sidecar`: gateway local junto ao ativo/CPS que valida token e encaminha a requisicao ao endpoint fisico.
- `Identity Provider interno`: no prototipo lightweight, a propria camada `Auth + tokens internos` cumpre o papel de IdP local.
- `CPS / Asset Endpoint`: fonte fisica do dado industrial, preservada na origem.

## 4. Processo Macro de Referencia

O processo oficial do software deve seguir a sequencia abaixo:

1. `Setup de Infraestrutura e Identity Trust`: owner e client provisionam seus conectores e estabelecem confianca mutua.
2. `Setup do Provedor`: owner cria federacao, registra compliance global, cadastra ativos e suas politicas locais.
3. `Onboarding do Consumidor`: client autentica sua identidade e solicita adesao a federacoes especificas.
4. `Descoberta`: apenas clientes confiaveis e autorizados navegam no catalogo federado e consultam metadados.
5. `Negociacao`: client solicita contrato do ativo e owner aprova ou rejeita.
6. `Tokenizacao`: apos o acordo, o plano de controle emite credencial e token de vida curta.
7. `Consumo P2P`: client consome o dado diretamente na origem, enviando o token ao sidecar do owner.
8. `Enforcement e Auditoria`: o sidecar aplica politicas locais e a plataforma registra toda a trilha do processo.

## 5. Requisitos Funcionais por Epico

### Epico 0. Setup de Infraestrutura e Confianca de Identidade

Objetivo: provisionar os conectores dos participantes e impedir qualquer interacao anonima com catalogos, federacoes e ativos.

#### Historia 0.1. Configuracao do Conector do Proprietario

- `RF-E0-01` O sistema deve permitir ao `Data Owner` registrar seu conector provedor com, no minimo, `organizationLegalName`, `participantId`, `connectorDspBaseUrl`, `connectorManagementBaseUrl`, `federatedCatalogUrl`, `sidecarProtocol` e `sidecarEndpoint`.
- `RF-E0-01A` O sistema deve permitir que um mesmo participante juridico opere multiplos conectores internos, segregados por projeto, departamento, planta, cliente ou ecossistema.
- `RF-E0-02` O sistema deve associar ao conector do owner uma identidade tecnica verificavel, representada por `certificateRef`, `keyPairRef` ou outro identificador equivalente da credencial criptografica.
- `RF-E0-03` O sistema deve validar se o sidecar do owner declara protocolo nativo suportado pelo chao de fabrica, como `HTTP` ou `MQTT`.
- `RF-E0-04` O sistema deve registrar auditoria de criacao, atualizacao, ativacao, revogacao e rotacao da identidade do conector do owner.

Criterios de aceite:

- o owner consegue salvar o perfil tecnico do conector;
- a identidade tecnica do conector fica persistida com status;
- o sidecar informa protocolo e endpoint validos;
- o sistema impede conector incompleto de publicar catalogo ou aceitar conexoes.

#### Historia 0.2. Configuracao do Conector do Consumidor

- `RF-E0-05` O sistema deve permitir ao `Data Client` registrar seu conector consumidor com `participantId`, `connectorDspBaseUrl`, `connectorManagementBaseUrl` e `federatedCatalogUrl`.
- `RF-E0-05A` O sistema deve manter um `default connector` por participante para preservar os fluxos operacionais que ainda dependem de um conector principal.
- `RF-E0-06` O sistema deve cadastrar o cliente no modulo interno de identidade e emitir credenciais unicas de aplicacao, como `clientId` e `clientSecretHash`, ou credencial equivalente verificavel.
- `RF-E0-07` O sistema deve permitir revogar, regenerar e auditar credenciais do conector consumidor sem perder o historico do participante.
- `RF-E0-08` O sistema deve bloquear solicitacoes de membership, contrato ou acesso originadas de conectores consumidores sem identidade ativa.

Criterios de aceite:

- o cliente recebe identidade de aplicacao verificavel;
- o sistema vincula a identidade ao `participantId` do consumer connector;
- credenciais revogadas deixam de ser aceitas em novas autenticacoes.

#### Historia 0.3. Autenticacao Mutua e Identity Trust

- `RF-E0-09` O sistema deve exigir autenticacao do `Data Client` antes de qualquer navegacao em catalogo, consulta de federacao ou negociacao de contrato.
- `RF-E0-10` O `Data Client` deve enviar uma requisicao de autenticacao ao modulo interno de identidade do Dataspace antes de iniciar transacoes no ecossistema.
- `RF-E0-11` O modulo interno de identidade deve validar credenciais do cliente, associar a sessao ao conector consumidor e verificar o status da identidade.
- `RF-E0-12` Em caso de sucesso, o sistema deve emitir um `Identity Token` de vida curta contendo, no minimo, `participantId`, `userType`, `organization`, `scopes` e `expiresAt`.
- `RF-E0-13` Em caso de falha, o sistema deve rejeitar a interacao com `401 Unauthorized` ou `403 Forbidden`, sem expor catalogo, ativo ou payload.
- `RF-E0-14` O sistema deve registrar logs de confianca de identidade para autenticacoes bem-sucedidas, falhas, revogacoes e expiracoes.

Criterios de aceite:

- nenhum usuario anonimo ve federacoes ou ativos;
- autenticacao valida libera apenas os escopos do participante;
- autenticacao invalida retorna erro e gera log auditavel.

### Epico 1. Setup e Governanca do Provedor

Objetivo: permitir que o owner estruture o ecossistema, publique regras globais e governe seus ativos industriais.

#### Historia 1.1. Criacao da Federacao e Compliance Global

- `RF-E1-01` O sistema deve permitir ao `Data Owner` criar uma `Federation` com `name`, `description`, `organization`, `catalogVisibility`, `admissionMode`, `mainDomain`, `dataDomains` e `participantId`.
- `RF-E1-02` O sistema deve permitir ao owner registrar os termos globais de compliance da federacao em um `FederationAgreement`, contendo base legal, termos e obrigacoes gerais.
- `RF-E1-03` O sistema deve permitir anexar ou registrar referencia a documento de termos e condicoes da federacao.
- `RF-E1-04` O sistema deve registrar a politica global da federacao de modo separado da politica local de cada ativo.
- `RF-E1-05` O sistema deve permitir publicar ou ocultar a federacao no catalogo federado conforme `catalogVisibility`.

Criterios de aceite:

- a federacao e criada com campos minimos e ownership;
- os termos globais ficam persistidos e auditaveis;
- a visibilidade do catalogo respeita o modo definido pelo owner.

#### Historia 1.2. Registro de Ativos e Politicas Locais

- `RF-E1-06` O sistema deve permitir ao owner registrar ativos industriais vinculados a uma federacao, informando `name`, `description`, `assetType`, `assetKind`, `apiEndpoint`, `dataFormat`, `exchangeMode`, `semanticId`, `aasId`, `irdi` e `semanticModel`.
- `RF-E1-07` O sistema deve exigir que todo ativo declare seu endpoint de dados e o tipo de troca suportado, como `batch`, `stream` ou `hybrid`.
- `RF-E1-08` O sistema deve permitir associar a cada ativo uma `Usage Policy` local, independente dos termos globais da federacao.
- `RF-E1-09` A politica local do ativo deve suportar, no minimo, `purposeBinding`, `requiresManualApproval`, `agreementTtlHours`, `accessTokenTtlMinutes`, `revocationMode` e obrigacoes de auditoria.
- `RF-E1-10` O sistema deve impedir a publicacao de oferta contratual de ativo sem politica de governanca valida.

Criterios de aceite:

- o ativo fica vinculado a federacao existente;
- a politica local fica registrada e pode ser revisada;
- ativos sem governanca nao podem ser liberados para negociacao.

### Epico 2. Onboarding e Identidade do Consumidor

Objetivo: integrar o consumidor ao ecossistema de confianca antes que ele explore catalogos ou ativos.

#### Historia 2.1. Autenticacao de Identidade

- `RF-E2-01` O sistema deve validar as credenciais do consumidor e emitir token ou sessao de identidade reconhecida pelo ecossistema interno.
- `RF-E2-02` O token de identidade deve vincular o usuario ao `participantId` do seu conector consumidor e aos seus escopos de atuacao.
- `RF-E2-03` O sistema deve permitir renovar token de identidade enquanto a credencial do conector estiver ativa.
- `RF-E2-04` O sistema deve impedir o uso de token expirado, revogado ou emitido para outro participante.

Criterios de aceite:

- o client autenticado recebe uma identidade valida;
- tokens invalidos nao autorizam membership nem descoberta;
- o owner consegue distinguir qual participante iniciou a interacao.

#### Historia 2.2. Adesao a Federacao

- `RF-E2-05` O sistema deve permitir ao client solicitar participacao em uma federacao especifica somente apos estabelecer `connector connection` valida com o owner.
- `RF-E2-06` O sistema deve suportar `self-service`, `approval` e `invite-only` como modos de admissao da federacao.
- `RF-E2-07` O sistema deve exigir aceite digital dos termos globais da federacao antes de ativar o membership.
- `RF-E2-08` O sistema deve registrar a adesao em `federationMemberships`, com status, timestamps, assinatura e vinculo ao participante.
- `RF-E2-09` O sistema deve permitir ao owner aprovar, rejeitar, convidar ou revogar membros de federacao.
- `RF-E2-10` O sistema deve emitir uma credencial interna de membership quando a entrada for ativada.
- `RF-E2-11` O catalogo de ativos da federacao deve permanecer bloqueado para o client ate que o membership esteja `active`.

Criterios de aceite:

- o membership nao nasce ativo sem respeitar o modo de admissao;
- o aceite digital e auditado;
- membership revogado remove visibilidade e bloqueia novos acordos.

### Epico 3. Descoberta de Servicos e Metadata Broker

Objetivo: permitir descoberta dinamica sem expor payload e sem acoplamento direto ao CPS.

#### Historia 3.1. Navegacao no Catalogo Federado

- `RF-E3-01` O sistema deve manter um `Federated Catalog` contendo apenas metadados, ofertas, endpoints logicos e referencias semanticas de federacoes e ativos.
- `RF-E3-02` O catalogo deve filtrar resultados conforme `Identity Trust`, `catalogVisibility`, `membershipStatus` e politicas de acesso.
- `RF-E3-03` O sistema deve exibir ao client apenas ativos e federacoes para os quais ele possui elegibilidade de descoberta.
- `RF-E3-04` O catalogo nao deve expor payload operacional do ativo, apenas metadados, AAS, termos e ofertas.
- `RF-E3-05` O sistema deve suportar busca por nome, dominio, tipo de ativo, `semanticId`, `aasId` e `irdi`.

Criterios de aceite:

- cliente sem trust nao enxerga catalogo;
- cliente membro enxerga apenas o recorte permitido;
- catalogo exibe metadados e politicas, nao dados industriais reais.

### Epico 4. Negociacao de Contrato e Tokenizacao

Objetivo: formalizar o controle de uso no plano de controle antes de qualquer trafego de dados no plano de dados.

#### Historia 4.1. Negociacao de Contrato

- `RF-E4-01` O sistema deve permitir ao client solicitar acesso a um ativo especifico por meio da assinatura da politica local de uso do ativo.
- `RF-E4-02` O sistema deve exigir `connector connection active` e `federationMembership active` como precondicoes para a negociacao.
- `RF-E4-03` O sistema deve representar a oferta contratual do ativo em `contractOffers`.
- `RF-E4-04` O sistema deve registrar o acordo negociado em `contractAgreements`, contendo `providerParticipantId`, `consumerParticipantId`, `assetId`, `status`, `validFrom`, `validUntil` e vinculo com a politica usada.
- `RF-E4-05` O sistema deve permitir ao owner aprovar, rejeitar, revogar ou expirar acordos.
- `RF-E4-06` O sistema deve emitir `credentialGrant` de uso quando o acordo for finalizado com sucesso.
- `RF-E4-07` O sistema deve impedir emissao de credencial para acordo rejeitado, revogado ou expirado.

Criterios de aceite:

- o client assina a politica do ativo antes do consumo;
- o acordo fica auditavel e associado ao ativo correto;
- sem acordo `finalized`, nao existe acesso liberado.

#### Historia 4.2. Emissao de Token de Acesso

- `RF-E4-08` O sistema deve emitir `Access Token` de vida curta somente apos `contractAgreement.finalized` e credencial de uso ativa.
- `RF-E4-09` O token deve conter as claims minimas do contrato, como `assetId`, `participantId`, `purpose`, `scopes`, `expiresAt` e referencia a `agreementId`.
- `RF-E4-10` O tempo de vida do token deve respeitar a politica local de governanca do ativo.
- `RF-E4-11` O sistema deve permitir revogar o token antes da expiracao, quando a governanca ou o owner assim determinarem.
- `RF-E4-12` O token nao deve ser emitido para cliente sem membership ativo, sem conector confiavel ou sem acordo vigente.

Criterios de aceite:

- token so nasce depois de contrato valido;
- token recebe prazo curto e escopo minimo;
- token revogado ou expirado nao permite consumo.

### Epico 5. Consumo P2P e Soberania Fisica

Objetivo: garantir que o dado seja consumido diretamente da origem com enforcement local das politicas negociadas.

#### Historia 5.1. Requisicao Direta P2P

- `RF-E5-01` O sistema deve devolver ao client a URL local do ativo e o token de acesso apos a fase de tokenizacao.
- `RF-E5-02` O client deve consumir o dado enviando `GET`, `POST` ou chamada equivalente diretamente ao sidecar do ativo, carregando o token no cabecalho.
- `RF-E5-03` O plano de controle nao deve atuar como proxy obrigatorio do payload do CPS.
- `RF-E5-04` O sistema deve registrar no plano de controle o inicio do consumo, mantendo trilha de auditoria do acesso.

Criterios de aceite:

- o client consome o dado diretamente da origem;
- o payload nao e replicado pela plataforma;
- o evento de consumo gera log auditavel.

#### Historia 5.2. Validacao Local e Policy Enforcement Point

- `RF-E5-05` O `Sidecar` do owner deve atuar como `Policy Enforcement Point`, validando token, expiracao, escopo, acordo e vigencia antes de liberar o ativo.
- `RF-E5-06` O sidecar deve rejeitar com `401` ou `403` requisicoes com token invalido, expirado, revogado ou inconsistente com o contrato.
- `RF-E5-07` O sidecar deve liberar a chamada ao CPS apenas quando as regras do contrato e da governanca local forem satisfeitas.
- `RF-E5-08` O sidecar deve registrar evento local ou remoto de bloqueio e liberacao para fins de auditoria.
- `RF-E5-09` O sidecar deve suportar conectividade nativa ao CPS por `HTTP`, `MQTT` ou outro protocolo homologado.

Criterios de aceite:

- token invalido bloqueia a chamada;
- token valido libera a rota ao CPS;
- a validacao ocorre no edge, preservando latencia e soberania do dado.

## 6. Modelo de Dados Minimo Esperado

As seguintes entidades sao necessarias para materializar os requisitos funcionais:

- `users`: identidade humana, papel, ownership e perfil.
- `connectorProfiles`: configuracao tecnica do conector, incluindo endpoints, sidecar e material criptografico.
- `connectorCredentials`: credenciais de aplicacao do consumer/provider connector.
- `identityTokens`: tokens de confianca de identidade e seus logs.
- `connectorConnections`: relacoes de confianca tecnica entre conectores.
- `federations`: estrutura de ecossistema e regras de visibilidade.
- `compliance`: termos globais e evidencias da federacao.
- `federationMemberships`: adesao do participante a federacoes.
- `federationInvites`: convites emitidos para federacoes privadas.
- `assets`: ativos industriais e seus metadados semanticos.
- `governance`: politicas locais de uso dos ativos.
- `contractOffers`: ofertas de contrato de federacao e de ativo.
- `contractAgreements`: acordos resultantes da negociacao.
- `credentialGrants`: credenciais internas emitidas apos adesao ou aprovacao.
- `catalogPublications`: publicacao de federacoes e ativos no catalogo.
- `accessRequests`: solicitacoes operacionais de consumo apos o contrato.
- `accessTokens`: tokens de vida curta para consumo P2P.
- `accessLogs`: trilha de auditoria do consumo real.

## 7. Regras de Negocio Transversais

- `RN-01` Nenhum cliente anonimo pode navegar no catalogo ou consultar ativos.
- `RN-02` Toda interacao deve estar vinculada a um `participantId`.
- `RN-03` Membership de federacao nao concede acesso automatico ao ativo.
- `RN-04` Contrato de ativo nao substitui aceite do acordo global da federacao.
- `RN-05` Token de acesso nunca pode ser emitido sem `contractAgreement.finalized`.
- `RN-06` Revogacao de membership ou acordo bloqueia novas emissoes de token.
- `RN-07` O dado bruto deve permanecer na origem como principio arquitetural.
- `RN-08` O catalogo deve publicar apenas metadados e ofertas.
- `RN-09` Todo evento relevante deve ser auditavel com `createdAt`, `updatedAt`, `actorId` e `participantId`.
- `RN-10` O significado dos dados deve ser preservado por metadados semanticos do proprio ativo.

## 8. Requisitos Nao Funcionais

- `RNF-01 Segurança`: autenticar, autorizar, auditar e revogar acessos segundo o modelo `Zero Trust`.
- `RNF-02 Latencia`: manter a transferencia de payload fora da nuvem sempre que possivel, privilegiando o acesso direto ao sidecar.
- `RNF-03 Escalabilidade`: separar colecoes do plano de controle para evitar acoplamento entre identidade, catalogo, contrato e consumo.
- `RNF-04 Rastreabilidade`: preservar trilha completa desde autenticacao, membership, contrato, token e consumo.
- `RNF-05 Interoperabilidade`: estruturar metadados compativeis com `AAS`, `IRDI`, `ECLASS` e futura extensao para DSP/EDC.
- `RNF-06 Manutenibilidade`: manter a logica de controle desacoplada da logica de interface.
- `RNF-07 Evolucao`: permitir expansao futura para interoperabilidade interorganizacional sem reconfiguracao fisica dos ativos.

## 9. Materializacao no Prototipo Lightweight

No prototipo atual, a materializacao dos requisitos ocorre assim:

- `Next.js Auth + tokens internos` cumprem o papel de `Identity Provider` local.
- `/profile/connector` representa o setup do conector e a base do `Identity Trust`.
- `/federations/[id]` concentra conexao entre conectores, membership, convites e aceite de termos.
- `/assets/[id]` concentra oferta contratual, acordo, credencial, token e inicio do consumo.
- `/access` e `/access/review` cobrem solicitacao operacional de acesso e decisao do owner.
- `firestore.rules` reforca autorizacao, ownership e leitura restrita.
- `e2e/intra-full-flow.spec.ts` valida a cadeia principal: identidade, conector, federacao, ativo, governance, convite, contrato, token e consumo.

## 10. Resultado Esperado

Com estes requisitos, o sistema passa a ser caracterizado como um `INTRA Dataspace` e nao como uma integracao convencional, porque:

- a infraestrutura de confianca existe antes do catalogo;
- a descoberta opera sobre metadados federados;
- a federacao e o ativo possuem governancas distintas;
- o uso depende de contrato e token de vida curta;
- o payload e consumido diretamente da origem;
- o controle de uso e auditavel de ponta a ponta.
