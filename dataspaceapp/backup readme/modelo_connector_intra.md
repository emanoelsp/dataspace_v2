# Modelo concreto do connector INTRA

## Objetivo

Este documento adapta o fluxo classico de connector IDS/GAIA-X/EDC para um cenario INTRA, no qual:

- o `Data Owner` cria e opera o connector;
- o `Data Client` se conecta ao connector do owner por meio do seu proprio consumer connector;
- o client explora federacoes e assets do owner;
- o consumo de dados exige adesao a regras de federacao e assinatura dos contratos do asset.

## Principios do desenho

- nenhum cliente navega em catalogo, federacao ou asset sem `Identity Trust` previo;
- descoberta e autorizacao sao coisas diferentes;
- a federacao controla `quem pode entrar e ver`;
- o asset controla `quem pode consumir e sob quais politicas`;
- o payload continua na fonte;
- o plano de controle registra identidade, politicas, solicitacoes, acordos e auditoria.

## Papeis

- `Data Owner`: publica federacoes, assets, politicas, ofertas e aprova entradas quando necessario.
- `Data Client`: descobre federacoes/assets, solicita entrada em federacao, negocia contratos e consome dados.
- `Issuer/Registry` interno: emite credenciais internas do dataspace INTRA.
- `Catalog/Federated Catalog`: agrega catalogos e expande descoberta.

Um mesmo participante pode operar mais de um connector confinado no ambiente intraorganizacional. Nesse caso:

- cada connector pode representar um projeto, departamento, planta ou ecossistema;
- um deles pode ser marcado como `default connector` para fluxos genericos do plano de controle;
- federacoes e assets podem apontar para um connector especifico do participante, evitando acoplamento a um unico endpoint.

## Separacao entre visibilidade e admissao

Nao usar mais um unico campo para representar tudo.

- `catalogVisibility`
  - `public`: aparece para qualquer participante autenticado.
  - `members`: aparece apenas para membros da federacao.
  - `hidden`: nao aparece em catalogo geral; acesso so por link/invite.
- `admissionMode`
  - `self-service`: entra aceitando o acordo da federacao.
  - `approval`: solicita entrada e aguarda aprovacao.
  - `invite-only`: entra apenas com convite assinado.

Mapeamento sugerido do modelo antigo:

- `Open` -> `catalogVisibility=public`, `admissionMode=self-service`
- `Consortium` -> `catalogVisibility=members`, `admissionMode=approval`
- `Private` -> `catalogVisibility=hidden`, `admissionMode=invite-only`

## Regras de federacao

### Federacao aberta

- o client ve a federacao no catalogo;
- assina ou aceita digitalmente o acordo de federacao;
- a plataforma registra ciencia e finalidade;
- a entrada pode ser automatica;
- isso nao substitui o contrato do asset.

### Federacao de consorcio

- o client descobre a federacao, mas o acesso detalhado depende de adesao;
- ele assina o acordo do consorcio;
- o owner/admin aprova a adesao;
- apos aprovacao, o sistema emite uma credencial de membro da federacao;
- assets internos passam a aparecer ou ficam negociaveis.

### Federacao por convite

- a federacao nao entra no catalogo geral ou aparece so como stub;
- o owner emite um convite assinado;
- o client contra-assina e devolve;
- o owner valida e ativa a participacao;
- o sistema emite a credencial interna de membro convidado.

## Contratos

Separar dois niveis de contrato:

- `FederationAgreement`
  - rege entrada e permanencia na federacao;
  - define termos comunitarios, escopo, obrigacoes gerais, auditoria, revogacao;
  - pode exigir assinatura simples, assinatura formal com aprovacao, ou convite assinado.
- `AssetContractOffer`
  - rege consumo de um asset especifico;
  - define politicas de acesso, finalidade, formato, quotas, vigencia, classificacao de dados, obrigacoes;
  - ao ser aceito/negociado vira `ContractAgreement`.

## Colecoes sugeridas

### Ja existentes

- `users`
- `federations`
- `assets`
- `compliance`
- `governance`
- `accessRequests`
- `accessLogs`

### Novas ou explicitamente recomendadas

- `connectorProfiles`
  - configura o conector de forma separada do perfil humano
- `connectorCredentials`
  - credenciais verificaveis do conector consumidor ou provedor
- `identityTokens`
  - tokens curtos de confianca de identidade emitidos antes do catalogo
- `federationMemberships`
  - vinculo participante x federacao
  - status de entrada e credencial emitida
- `federationInvites`
  - convites emitidos pelo owner
- `contractOffers`
  - ofertas de contrato publicadas para federacao ou asset
- `contractAgreements`
  - acordos firmados apos negociacao
- `credentialGrants`
  - credenciais emitidas para o participante no contexto INTRA
- `catalogPublications`
  - rastreia publicacao de federacoes/assets em catalogo

## Estrutura minima sugerida

### `federations`

- `name`
- `description`
- `catalogVisibility`
- `admissionMode`
- `mainDomain`
- `dataDomains`
- `organization`
- `ownerId`
- `participantId`
- `status`

### `assets`

- `name`
- `description`
- `federationId`
- `assetType`
- `semanticId`
- `apiEndpoint`
- `dataFormat`
- `accessType`
- `ownerId`
- `participantId`
- `status`
- `publishedInCatalog`

### `federationMemberships`

- `federationId`
- `participantId`
- `requesterId`
- `membershipType`
- `status`
- `agreementId`
- `inviteId`
- `credentialId`
- `requestedAt`
- `approvedAt`
- `revokedAt`

Status sugerido:

- `draft`
- `requested`
- `invited`
- `pending-signature`
- `pending-approval`
- `active`
- `rejected`
- `revoked`

### `contractOffers`

- `scope`: `federation` ou `asset`
- `scopeId`
- `policyType`: `access`, `contract`, `usage`
- `policyPayload`
- `visibility`
- `ownerId`
- `status`

### `contractAgreements`

- `offerId`
- `federationId`
- `assetId`
- `providerParticipantId`
- `consumerParticipantId`
- `negotiationId`
- `agreementType`
- `status`
- `signedByProviderAt`
- `signedByConsumerAt`
- `validFrom`
- `validUntil`
- `revokedAt`

Status sugerido:

- `requested`
- `negotiating`
- `pending-provider-signature`
- `pending-consumer-signature`
- `finalized`
- `rejected`
- `revoked`
- `expired`

## Fluxo operacional do Data Owner

1. Criar conta `Data Owner`.
2. Configurar perfil do connector:
   - `participantId`
   - `connectorDspBaseUrl`
   - `connectorManagementBaseUrl`
   - `federatedCatalogUrl`
3. Criar federacao com `catalogVisibility` e `admissionMode`.
4. Publicar `FederationAgreement`.
5. Cadastrar assets na federacao.
6. Publicar `AssetContractOffer` para cada asset.
7. Publicar a federacao no catalogo raiz do connector.
8. Publicar assets no subcatalogo da federacao.

## Fluxo operacional do Data Client

1. Criar conta `Data Client`.
2. Configurar ou registrar seu consumer connector.
3. Autenticar a identidade do conector consumidor e estabelecer `Identity Trust` com o owner.
4. Resolver/catalogar o owner via catalogo federado.
5. Explorar federacoes visiveis.
6. Entrar na federacao conforme o modo:
   - `self-service`: aceita e ativa;
   - `approval`: assina e aguarda aprovacao;
   - `invite-only`: recebe convite, assina e devolve.
7. Explorar assets da federacao.
8. Escolher `ContractOffer` do asset.
9. Negociar e assinar o `ContractAgreement`.
10. Iniciar `TransferProcess`.
11. Receber `EDR`/token e consumir na fonte.

## APIs e mensagens a espelhar do fluxo EDC

### Publicacao pelo owner

- criar asset no management API
- criar policy definition
- criar contract definition
- publicar `CatalogAsset` quando a federacao for subcatalogo

### Consumo pelo client

- `POST /api/management/v3/catalog/request`
- `POST /api/catalog/v1alpha/catalog/query`
- `POST /api/management/v3/contractnegotiations`
- `POST /api/management/v3/contractnegotiations/request`
- `POST /api/management/v3/transferprocesses`
- `POST /api/management/v3/transferprocesses/request`
- `POST /api/management/v3/edrs/request`
- `GET /api/management/v3/edrs/{transferProcessId}/dataaddress`

## Estados de tela recomendados

### Data Owner

- `/profile/connector`
  - registrar identidade tecnica do connector
- `/federations/create`
  - criar federacao e politica de admissao
- `/federations/[id]`
  - detalhe da federacao
  - publicar contrato de federacao
  - revisar membros
- `/assets/create`
  - criar asset e associar a federacao
- `/assets/[id]`
  - publicar contrato do asset
  - ativar/desativar asset
- `/accordance/*`
  - documentos legais e governanca

### Data Client

- `/search/*`
  - descobrir federacoes e assets
- `/federations/[id]`
  - ver regras da federacao e pedir entrada
- `/assets/[id]`
  - ver metadados, contratos e iniciar consumo
- `/access`
  - acompanhar pedidos de acesso e aceite de contratos

## Protecao de rotas adotada no projeto

- `public`
  - landing e descoberta
- `authenticated`
  - dashboard, profile, detalhes compartilhados de federacao e asset
- `Data Owner`
  - connector profile, gestao de federacoes, assets, compliance e governance
- `Data Client`
  - solicitacao de acesso em `/access`

## Regras de UI importantes

- paginas compartilhadas de detalhe podem ser lidas por ambos os papeis;
- editar, ativar/desativar e excluir so deve aparecer para o owner do registro;
- descoberta nao deve implicar autorizacao de consumo;
- aceitar uma federacao aberta nao deve dispensar o contrato do asset;
- um `ContractAgreement` revogado deve bloquear novas transferencias;
- a cada consumo deve haver log em `accessLogs`.
