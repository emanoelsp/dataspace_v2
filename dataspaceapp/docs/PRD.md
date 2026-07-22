# PRD — INTRA Dataspace

## Tipo de projeto

Sistema Web

## Objetivo

Materializar um **INTRA Dataspace** — um conector de dados intraorganizacional alinhado aos princípios da IDSA, Gaia-X e Dataspace Protocol, implementado como protótipo lightweight com Next.js + Firebase.

O objetivo não é construir uma integração convencional entre sistemas. É criar um ecossistema de dados interno onde:

- os dados permanecem na origem (soberania física);
- o catálogo publica apenas metadados e ofertas;
- nenhum cliente anônimo navega no ecossistema;
- a confiança de identidade antecede catálogo, membership e contrato;
- a federação governa a entrada no ecossistema;
- o ativo governa o uso concreto do dado;
- o plano de controle registra identidade, políticas, contratos, tokens e auditoria;
- o plano de dados entrega o payload diretamente da fonte, com baixa latência.

## Público-alvo

- **Data Owner**: operadores industriais, responsáveis por CPS/ativos, gestores de ecossistemas de dados.
- **Data Client**: consumidores de dados dentro do ecossistema, que precisam acessar ativos publicados por owners.
- **Pesquisadores e avaliadores de mestrado**: contexto de qualificação de dissertação — o sistema serve como protótipo acadêmico validando os conceitos de Dataspace intraorganizacional.

## Problema que resolve

Integrações industriais convencionais copiam dados, criam acoplamentos rígidos e não possuem controle de uso auditável. O INTRA Dataspace resolve isso separando:

- **plano de controle** (identidade, catálogo, contratos, tokens, auditoria) do **plano de dados** (payload consumido diretamente na fonte);
- **descoberta** de **autorização** (catálogo ≠ acesso);
- **governança da federação** da **governança do ativo** (dois níveis de contrato distintos).

## Fronteiras arquiteturais

Para ser considerado um Dataspace válido (e não apenas um hub de APIs):

- `Descentralização física`: payload não consolidado em Data Lake/DW da plataforma.
- `Zero Trust`: todo participante prova identidade antes de ver catálogos, federações ou ativos.
- `Federated Catalog`: descoberta sobre metadados e self-descriptions, não sobre cópia do dado.
- `Usage Control`: acesso inicial não basta; uso posterior respeita finalidade, vigência, revogação e obrigações negociadas.
- `Control Plane × Data Plane`: negociação, tokenização e auditoria no plano de controle; troca do dado no plano de dados.
- `Pay-as-you-go semantics`: interpretação semântica baseada em AAS, IRDI, ECLASS e metadados distribuídos.

## Atores

| Ator | Papel |
|------|-------|
| `Data Owner` | Cria conector provedor, define federações, políticas, ativos e aprova acessos |
| `Data Client` | Registra conector consumidor, estabelece confiança, entra em federações, negocia contratos e consome dados |
| `Connector Control Plane` | Camada Next.js + Firebase — identidade, catálogo, membership, contratos, tokens, auditoria |
| `Connector Data Plane / Sidecar` | Gateway local junto ao ativo/CPS — valida token e encaminha a requisição ao endpoint físico |
| `Identity Provider interno` | No protótipo lightweight: Auth + tokens internos cumprem o papel de IdP local |
| `CPS / Asset Endpoint` | Fonte física do dado industrial, preservada na origem |

## Processo macro

1. `Epico 0` — Setup de Infraestrutura e Identity Trust
2. `Epico 1` — Setup e Governança do Provedor
3. `Epico 2` — Onboarding e Identidade do Consumidor
4. `Epico 3` — Descoberta de Serviços e Metadata Broker
5. `Epico 4` — Negociação de Contrato e Tokenização
6. `Epico 5` — Consumo P2P e Soberania Física

## Funcionalidades principais

- [x] Autenticação Zero Trust (Firebase Auth + tokens internos)
- [x] Configuração de Conector (Data Owner e Data Client)
- [x] Criação e gestão de Federações com catalogVisibility e admissionMode
- [x] Registro de ativos industriais com metadados semânticos (AAS, IRDI, ECLASS)
- [x] Catálogo federado com filtragem por identidade e membership
- [x] Membership de federação (self-service, approval, invite-only)
- [x] Negociação de contratos (FederationAgreement e AssetContractOffer)
- [x] Emissão de token de acesso de vida curta
- [x] Consumo P2P direto no endpoint do ativo
- [x] Policy Enforcement Point (sidecar) com validação de token
- [x] Auditoria completa (accessLogs, identityTrustLogs)
- [x] Dashboard operacional com métricas do Firestore

## Requisitos funcionais por épico

### Épico 0 — Infraestrutura e Identity Trust

- `RF-E0-01` Registrar conector provedor com `organizationLegalName`, `participantId`, `connectorDspBaseUrl`, `connectorManagementBaseUrl`, `federatedCatalogUrl`, `sidecarProtocol`, `sidecarEndpoint`.
- `RF-E0-01A` Permitir que um participante opere múltiplos conectores (por projeto, departamento, planta, cliente ou ecossistema).
- `RF-E0-02` Associar ao conector uma identidade técnica verificável (`certificateRef`, `keyPairRef` ou equivalente).
- `RF-E0-03` Validar se o sidecar declara protocolo nativo suportado (`HTTP`, `MQTT`).
- `RF-E0-04` Registrar auditoria de criação, atualização, ativação, revogação e rotação da identidade do conector.
- `RF-E0-05` Registrar conector consumidor com `participantId`, `connectorDspBaseUrl`, `connectorManagementBaseUrl`, `federatedCatalogUrl`.
- `RF-E0-05A` Manter `default connector` por participante.
- `RF-E0-06` Cadastrar cliente no módulo de identidade e emitir `clientId` e `clientSecretHash`.
- `RF-E0-07` Permitir revogar, regenerar e auditar credenciais sem perder histórico.
- `RF-E0-08` Bloquear solicitações de membership, contrato ou acesso de conectores sem identidade ativa.
- `RF-E0-09` Exigir autenticação do Data Client antes de qualquer navegação em catálogo.
- `RF-E0-12` Emitir `Identity Token` de vida curta com `participantId`, `userType`, `organization`, `scopes`, `expiresAt`.
- `RF-E0-13` Rejeitar interação não autenticada com `401 Unauthorized` ou `403 Forbidden`.

### Épico 1 — Setup e Governança do Provedor

- `RF-E1-01` Criar `Federation` com `name`, `description`, `organization`, `catalogVisibility`, `admissionMode`, `mainDomain`, `dataDomains`, `participantId`.
- `RF-E1-02` Registrar termos globais de compliance em `FederationAgreement`.
- `RF-E1-04` Registrar política global da federação separada da política local de cada ativo.
- `RF-E1-05` Publicar ou ocultar a federação no catálogo conforme `catalogVisibility`.
- `RF-E1-06` Registrar ativos industriais com `name`, `description`, `assetType`, `assetKind`, `apiEndpoint`, `dataFormat`, `exchangeMode`, `semanticId`, `aasId`, `irdi`, `semanticModel`.
- `RF-E1-07` Exigir que todo ativo declare endpoint e tipo de troca (`batch`, `stream`, `hybrid`).
- `RF-E1-08` Permitir associar a cada ativo uma `Usage Policy` local.
- `RF-E1-09` Usage Policy deve suportar `purposeBinding`, `requiresManualApproval`, `agreementTtlHours`, `accessTokenTtlMinutes`, `revocationMode`.
- `RF-E1-10` Impedir publicação de oferta contratual sem política de governança válida.

### Épico 2 — Onboarding e Identidade do Consumidor

- `RF-E2-01` Validar credenciais e emitir token/sessão de identidade reconhecida pelo ecossistema.
- `RF-E2-02` Vincular token ao `participantId` do conector consumidor e aos escopos de atuação.
- `RF-E2-05` Permitir solicitar participação em federação somente após `connector connection` válida com o owner.
- `RF-E2-06` Suportar `self-service`, `approval` e `invite-only` como modos de admissão.
- `RF-E2-07` Exigir aceite digital dos termos globais antes de ativar o membership.
- `RF-E2-08` Registrar adesão em `federationMemberships` com status, timestamps, assinatura e vínculo ao participante.
- `RF-E2-09` Permitir ao owner aprovar, rejeitar, convidar ou revogar membros.
- `RF-E2-10` Emitir credencial interna de membership quando a entrada for ativada.
- `RF-E2-11` Bloquear catálogo de ativos para o client até membership estar `active`.

### Épico 3 — Descoberta de Serviços

- `RF-E3-01` Manter `Federated Catalog` com apenas metadados, ofertas, endpoints lógicos e referências semânticas.
- `RF-E3-02` Filtrar resultados por `Identity Trust`, `catalogVisibility`, `membershipStatus` e políticas de acesso.
- `RF-E3-03` Exibir ao client apenas ativos e federações para os quais possui elegibilidade.
- `RF-E3-04` Catálogo não deve expor payload operacional — apenas metadados, AAS, termos e ofertas.
- `RF-E3-05` Suportar busca por nome, domínio, tipo de ativo, `semanticId`, `aasId`, `irdi`.

### Épico 4 — Negociação de Contrato e Tokenização

- `RF-E4-01` Permitir ao client solicitar acesso ao ativo via assinatura da política local de uso.
- `RF-E4-02` Exigir `connector connection active` e `federationMembership active` como pré-condições.
- `RF-E4-04` Registrar acordo em `contractAgreements` com `providerParticipantId`, `consumerParticipantId`, `assetId`, `status`, `validFrom`, `validUntil`.
- `RF-E4-05` Permitir ao owner aprovar, rejeitar, revogar ou expirar acordos.
- `RF-E4-06` Emitir `credentialGrant` quando o acordo for finalizado.
- `RF-E4-08` Emitir `Access Token` de vida curta somente após `contractAgreement.finalized`.
- `RF-E4-09` Token com claims mínimas: `assetId`, `participantId`, `purpose`, `scopes`, `expiresAt`, `agreementId`.
- `RF-E4-11` Permitir revogar o token antes da expiração.
- `RF-E4-12` Não emitir token para cliente sem membership ativo, conector confiável ou acordo vigente.

### Épico 5 — Consumo P2P e Soberania Física

- `RF-E5-01` Devolver ao client a URL local do ativo e o token após tokenização.
- `RF-E5-02` Client consome dado enviando requisição diretamente ao sidecar com o token no cabeçalho.
- `RF-E5-03` Plano de controle não atua como proxy obrigatório do payload do CPS.
- `RF-E5-04` Registrar início do consumo no plano de controle para auditoria.
- `RF-E5-05` Sidecar atua como `Policy Enforcement Point`, validando token, expiração, escopo, acordo e vigência.
- `RF-E5-06` Sidecar rejeita com `401/403` requisições com token inválido, expirado ou revogado.
- `RF-E5-07` Sidecar libera chamada ao CPS apenas quando regras de contrato e governança local forem satisfeitas.
- `RF-E5-09` Sidecar suporta conectividade nativa ao CPS por `HTTP`, `MQTT` ou protocolo homologado.

## Modelo de dados mínimo

| Coleção | Propósito |
|---------|-----------|
| `users` | Identidade humana, papel, ownership e perfil |
| `connectorProfiles` | Configuração técnica do conector (endpoints, sidecar, material criptográfico) |
| `connectorCredentials` | Credenciais de aplicação do consumer/provider connector |
| `identityTokens` | Tokens de confiança de identidade e seus logs |
| `connectorConnections` | Relações de confiança técnica entre conectores |
| `federations` | Estrutura de ecossistema e regras de visibilidade |
| `compliance` | Termos globais e evidências da federação |
| `federationMemberships` | Adesão do participante a federações |
| `federationInvites` | Convites emitidos para federações privadas |
| `assets` | Ativos industriais e seus metadados semânticos |
| `governance` | Políticas locais de uso dos ativos |
| `contractOffers` | Ofertas de contrato de federação e de ativo |
| `contractAgreements` | Acordos resultantes da negociação |
| `credentialGrants` | Credenciais internas emitidas após adesão ou aprovação |
| `catalogPublications` | Publicação de federações e ativos no catálogo |
| `accessRequests` | Solicitações operacionais de consumo após o contrato |
| `accessTokens` | Tokens de vida curta para consumo P2P |
| `accessLogs` | Trilha de auditoria do consumo real |

## Regras de negócio transversais

- `RN-01` Nenhum cliente anônimo pode navegar no catálogo ou consultar ativos.
- `RN-02` Toda interação deve estar vinculada a um `participantId`.
- `RN-03` Membership de federação não concede acesso automático ao ativo.
- `RN-04` Contrato de ativo não substitui aceite do acordo global da federação.
- `RN-05` Token de acesso nunca pode ser emitido sem `contractAgreement.finalized`.
- `RN-06` Revogação de membership ou acordo bloqueia novas emissões de token.
- `RN-07` O dado bruto deve permanecer na origem como princípio arquitetural.
- `RN-08` O catálogo deve publicar apenas metadados e ofertas.
- `RN-09` Todo evento relevante deve ser auditável com `createdAt`, `updatedAt`, `actorId`, `participantId`.
- `RN-10` O significado dos dados deve ser preservado por metadados semânticos do próprio ativo.

## Requisitos não funcionais

- `RNF-01 Segurança`: autenticar, autorizar, auditar e revogar acessos segundo o modelo Zero Trust.
- `RNF-02 Latência`: manter transferência de payload fora da nuvem sempre que possível, privilegiando acesso direto ao sidecar.
- `RNF-03 Escalabilidade`: separar coleções do plano de controle para evitar acoplamento entre identidade, catálogo, contrato e consumo.
- `RNF-04 Rastreabilidade`: preservar trilha completa desde autenticação, membership, contrato, token e consumo.
- `RNF-05 Interoperabilidade`: estruturar metadados compatíveis com AAS, IRDI, ECLASS e futura extensão para DSP/EDC.
- `RNF-06 Manutenibilidade`: manter lógica de controle desacoplada da lógica de interface.
- `RNF-07 Evolução`: permitir expansão futura para interoperabilidade interorganizacional sem reconfiguração física dos ativos.

## Critérios de aceite

- O sistema deve bloquear qualquer usuário anônimo de ver federações, ativos ou catálogo.
- O fluxo completo (identidade → conector → federação → ativo → contrato → token → consumo) deve ser validado pelo teste e2e `intra-full-flow.spec.ts`.
- O build deve passar sem erro (`npm run build`).
- Os testes principais devem passar (`npm run test`, `npm run test:e2e:full`).
- Toda ação relevante deve gerar log auditável no Firestore.
- Token expirado ou revogado deve bloquear consumo sem exceção.

## Materialização no protótipo lightweight

| Componente | Implementação |
|-----------|---------------|
| Identity Provider | Next.js Auth + tokens internos |
| Conector / Identity Trust | `/profile/connector` |
| Federação + Membership | `/federations/[id]` |
| Ativo + Contrato + Token | `/assets/[id]` |
| Solicitação de Acesso | `/access` e `/access/review` |
| Enforcement | `firestore.rules` |
| Validação E2E | `e2e/intra-full-flow.spec.ts` |
