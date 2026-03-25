# Backlog tecnico INTRA Dataspace

Este backlog detalha a trilha gradativa `1 -> 5` para evoluir o prototipo atual para um conector INTRA alinhado ao modelo documentado em `modelo_connector_intra.md`.

## 1. Novas colecoes Firestore

Objetivo: separar descoberta, adesao a federacao, contrato e credencial.

### 1.1 Colecoes novas

- `federationMemberships`
  - relacao entre participante e federacao
  - usada para `self-service`, `approval` e `invite-only`
- `federationInvites`
  - convites emitidos pelo owner
  - controla assinatura, expiracao e aceite
- `contractOffers`
  - ofertas publicadas para federacao ou asset
  - separa politica de descoberta e politica de uso
- `contractAgreements`
  - acordo resultante da negociacao
  - referencia offer, provider, consumer e vigencia
- `credentialGrants`
  - credenciais internas emitidas no INTRA
  - ex.: membership, usage, processing-level
- `catalogPublications`
  - rastreia publicacao de federacoes/assets no catalogo

### 1.2 Campos a adicionar nas colecoes atuais

- `federations`
  - `catalogVisibility`
  - `admissionMode`
  - `participantId`
  - `status`
- `assets`
  - `assetKind`
  - `exchangeMode`
  - `publishedInCatalog`
  - `participantId`
  - `status`
- `accessRequests`
  - `membershipId`
  - `contractOfferId`
  - `contractAgreementId`
  - `decisionById`
  - `decisionAt`
- `users`
  - opcionalmente `iamGroupIds`, `projectIds`, `defaultParticipantId`

### 1.3 Indices recomendados

- `federationMemberships`
  - `requesterId + status`
  - `federationId + status`
  - `participantId + status`
- `federationInvites`
  - `inviteeEmail + status`
  - `federationId + status`
- `contractOffers`
  - `scope + scopeId + status`
  - `federationId + status`
  - `assetId + status`
- `contractAgreements`
  - `consumerParticipantId + status`
  - `providerParticipantId + status`
  - `assetId + status`

### 1.4 Critério de aceite

- as novas colecoes existem e tem esquema documentado;
- o codigo passa a usar nomes de estados consistentes;
- `Open/Consortium/Private` deixa de ser a unica representacao de acesso.

## 2. Estados e transicoes

Objetivo: tornar o fluxo auditavel e previsivel.

### 2.1 Membership da federacao

Estados:

- `draft`
- `requested`
- `invited`
- `pending-signature`
- `pending-approval`
- `active`
- `rejected`
- `revoked`

Transicoes:

- `self-service`
  - `draft -> pending-signature -> active`
- `approval`
  - `draft -> requested -> pending-signature -> pending-approval -> active|rejected`
- `invite-only`
  - `invited -> pending-signature -> pending-approval -> active|rejected`
- saida/revogacao
  - `active -> revoked`

### 2.2 Convites

Estados:

- `issued`
- `sent`
- `accepted`
- `declined`
- `expired`
- `cancelled`

### 2.3 Contract offers

Estados:

- `draft`
- `published`
- `suspended`
- `retired`

### 2.4 Contract agreements

Estados:

- `requested`
- `negotiating`
- `pending-provider-signature`
- `pending-consumer-signature`
- `finalized`
- `rejected`
- `revoked`
- `expired`

Transicao minima:

- `requested -> negotiating -> pending-provider-signature -> pending-consumer-signature -> finalized`

### 2.5 Regras importantes

- federacao ativa nao implica acesso automatico ao asset;
- asset sem `contractAgreement.finalized` nao pode gerar token/EDR;
- `contractAgreement.revoked` bloqueia novos consumos;
- `membership.revoked` remove visibilidade e bloqueia nova negociacao.

## 3. Telas por papel

Objetivo: refletir o dominio INTRA na UI sem misturar responsabilidades.

### 3.1 Data Owner

- `/profile/connector`
  - identidade tecnica do connector
- `/federations/create`
  - incluir `catalogVisibility` e `admissionMode`
- `/federations/[id]`
  - abas:
    - `Overview`
    - `Memberships`
    - `Invites`
    - `Agreement`
    - `Catalog Publication`
- `/assets/create`
  - incluir `assetKind` e `exchangeMode`
- `/assets/[id]`
  - abas:
    - `Overview`
    - `Contract Offers`
    - `Agreements`
    - `Access Logs`
- novas rotas sugeridas
  - `/federations/[id]/memberships`
  - `/federations/[id]/invites`
  - `/assets/[id]/contracts`

### 3.2 Data Client

- `/search/*`
  - descoberta filtrada por visibilidade e membership
- `/federations/[id]`
  - CTA conforme `admissionMode`
  - `Join federation`, `Request approval`, `Accept invite`
- `/assets/[id]`
  - mostrar ofertas disponiveis
  - negociar contrato
- `/access`
  - separar em:
    - `Membership requests`
    - `Asset agreements`
    - `Consumption history`

### 3.3 Telas administrativas futuras

- `/access/requests`
  - fila do owner para decisoes
- `/access/logs`
  - trilha consolidada por owner
- `/dashboard`
  - cards de memberships ativas, convites pendentes, agreements ativos

## 4. Regras de acesso

Objetivo: alinhar UI, route guard e Firestore.

### 4.1 Regras de rota

Ja implementado:

- `Data Owner`
  - federacoes, assets, accordance, connector
- `Data Client`
  - `/access`
- ambos autenticados
  - detalhes e dashboard

### 4.2 Regras Firestore

Adicionar:

- `federationMemberships`
  - create: requester autenticado ou owner em convite
  - read: requester, owner e admin de federacao
  - update: owner/admin para decisao; requester para assinatura quando permitido
- `federationInvites`
  - create/read/update: owner/admin e convidado
- `contractOffers`
  - create/update/delete: owner do asset/federacao
  - read: conforme visibilidade e membership
- `contractAgreements`
  - create: consumer autenticado
  - read: provider e consumer
  - update: provider/consumer conforme etapa de assinatura
- `credentialGrants`
  - read: holder e issuer
  - create/update: issuer/service account

### 4.3 Regras de ownership

- detalhe de asset/federacao continua legivel;
- editar, excluir e publicar so o `ownerId`;
- `Data Client` nunca altera metadado estrutural de owner;
- logs continuam imutaveis.

### 4.4 Regras de policy enforcement

- `access policy`
  - controla quem ve o ativo/oferta
- `contract policy`
  - controla quem pode negociar
- `usage policy`
  - controla finalidade, quota, prazo e obrigacoes

## 5. Ordem de implementacao

Objetivo: reduzir retrabalho e manter entregas pequenas.

### Fase 5.1

- criar `src/lib/intra-dataspace.ts`
- adicionar campos novos em federacao/asset
- preparar colecoes novas no Firestore
- atualizar formularios para `catalogVisibility` e `admissionMode`

Entrega:

- modelo de dominio estabilizado

### Fase 5.2

- implementar `federationMemberships`
- CTA de entrada em federacao no detalhe
- fila de aprovacao minima para owner
- regras Firestore iniciais de membership

Entrega:

- cliente entra ou solicita entrada em federacao

### Fase 5.3

- implementar `federationInvites`
- fluxo `invite-only`
- assinatura simples com registro de aceite
- expiracao e revogacao

Entrega:

- owner convida, cliente aceita, federacao ativa

### Fase 5.4

- implementar `contractOffers` e `contractAgreements`
- mostrar ofertas no asset detail
- negociacao e assinatura em duas etapas
- vincular `accessRequests` ao `contractAgreement`

Entrega:

- cliente explora asset e firma contrato utilizavel

### Fase 5.5

- emissao de `credentialGrants`
- preparo para token/EDR
- dashboard e logs consolidados
- endurecimento final das `firestore.rules`

Entrega:

- fluxo ponta a ponta do INTRA pronto para evoluir para EDC real

## Dependencias chave

- membership vem antes de invite e contrato;
- contrato vem antes de credencial;
- regras Firestore devem acompanhar cada fase;
- telas de owner/client devem ser entregues no mesmo passo da colecao correspondente.
