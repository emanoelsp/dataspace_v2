# Tasks — INTRA Dataspace

## Concluído — fase atual

- [x] Landing page com narrativa de federação, onboarding de CPS e consumo
- [x] Cadastro e login com Firebase Auth
- [x] Perfil de usuário persistido em `users`
- [x] Cadastro de federações em múltiplas etapas com `catalogVisibility` e `admissionMode`
- [x] Cadastro de ativos com metadados semânticos (`assetKind`, `exchangeMode`, `semanticId`, `aasId`, `irdi`)
- [x] Cadastro de compliance (FederationAgreement) com base legal, termos, consentimento e assinatura
- [x] Cadastro de governance com políticas de uso (Usage Policy) por ativo
- [x] Catálogo federado com busca por nome, domínio, tipo, semanticId
- [x] Detalhe de ativo com consumo direto no endpoint do CPS
- [x] Solicitação de acesso persistida em Firestore (`accessRequests`)
- [x] Log de acesso ao iniciar consumo autenticado (`accessLogs`)
- [x] Dashboard com métricas reais do Firestore
- [x] Configuração do conector (`/profile/connector`) — `connectorProfiles`
- [x] Conexão entre conectores owner × client (`connectorConnections`)
- [x] Membership de federação — máquina de estados com `self-service`, `approval`, `invite-only`
- [x] Fluxo de convites (`federationInvites`) com aceite e expiração
- [x] Contract Offers e Contract Agreements para ativo
- [x] Emissão de `credentialGrant` após acordo finalizado
- [x] Emissão de `accessToken` de vida curta
- [x] Decisão do owner sobre solicitações de acesso (`/access/review`)
- [x] Regras `firestore.rules` iniciais para ownership, membership e leitura restrita
- [x] Teste E2E de fluxo completo (`e2e/intra-full-flow.spec.ts`)
- [x] Tipos de domínio centralizados (`src/lib/intra-dataspace.ts`)
- [x] Índices Firestore (`firestore.indexes.json`)
- [x] TTL e `expiresAt` corretos nos `accessTokens` (lê de governance policy, fallback 60min)
- [x] `status: "active"` e `scope: "data:read"` definidos na criação do token
- [x] `vitest.config.ts` com path alias `@/` resolvido
- [x] 34 testes unitários passando (AAS helpers, decisões de acesso, visibilidade)
- [x] 3 rotas sidecar simuladas para equipamentos metal-mecânicos:
  - `GET /api/equipment` — registro de ativos da planta (sem autenticação)
  - `GET /api/equipment/cnc` — Centro de Usinagem CNC (AAS + ECLASS `0173-1#01-ACJ843#001`)
  - `GET /api/equipment/robot` — Robô Industrial 6 eixos (AAS + ECLASS `0173-1#01-AKJ975#001`)
  - `GET /api/equipment/press` — Prensa Hidráulica (AAS + ECLASS `0173-1#01-ADN573#001`)
- [x] Cada rota de equipamento: token PEP validation, 3 submodelos (Nameplate/TechnicalData/OperationalData), dados em tempo real
- [x] `src/lib/equipment-aas.ts` — utilitários AAS/ECLASS compartilhados

## Em andamento

- [ ] Endurecer `connectorCredentials` — rotação formal, `clientSecretHash`, auditoria de revogação
- [ ] Implementar `identityTokens` dedicados com trilha de emissão, expiração e revogação
- [ ] Extrair operações sensíveis (emissão de token, decisões de acesso) para Route Handlers server-side

## Backlog — Prioridade alta

- [ ] Sidecar HTTP simplificado como Policy Enforcement Point (valida token no edge, libera chamada ao CPS)
- [ ] Suporte a MQTT no sidecar para CPS industriais
- [ ] `identityTrustLogs` — auditoria de autenticação mútua entre conectores
- [ ] Endurecer `firestore.rules` para todas as coleções novas (federationMemberships, contractAgreements, credentialGrants)
- [ ] Route Handler para emissão de `accessToken` (mover do client para servidor)
- [ ] Route Handler para decisão de `contractAgreement` (approve/reject)

## Backlog — Prioridade média

- [ ] Testes unitários com Vitest para lógica de domínio (`src/lib/`)
- [ ] Testes de cobertura para falhas de autenticação, expiração de token e revogação
- [ ] Ampliação da busca semântica no catálogo (AAS, IRDI, ECLASS mais ricos)
- [ ] Dashboard — cards de memberships ativas, convites pendentes, agreements ativos
- [ ] `/access/logs` — trilha consolidada por owner
- [ ] Validação de ownership em todas as telas de edição/exclusão

## Backlog — Prioridade baixa / futura

- [ ] Assinatura criptográfica formal em contractAgreements (estilo DSP/OAuth)
- [ ] Claims padronizadas do token compatíveis com DSP/EDC
- [ ] Publicação real em broker federado externo
- [ ] Integração interorganizacional com conector EDC externo
- [ ] Camada semântica AAS/ECLASS formal no modelo de dados (não apenas em metadados livres)
- [ ] Paginação e índices avançados para escalabilidade do catálogo

## Ordem de implementação recomendada

### Fase 1 — Fechar Épico 0 (Identity Trust)
1. Implementar `connectorCredentials` com rotação e auditoria
2. Implementar `identityTokens` dedicados
3. Adicionar `identityTrustLogs`

### Fase 2 — Extrair para servidor
1. Route Handler para emissão de `accessToken`
2. Route Handler para decisões de acesso e contrato
3. Mover lógica crítica do client para `src/app/api/`

### Fase 3 — Sidecar PEP
1. Criar endpoint HTTP simples que valida `accessToken` e encaminha ao CPS
2. Registrar bloqueio/liberação no `accessLogs`
3. Suportar MQTT como segundo protocolo

### Fase 4 — Endurecimento e testes
1. Endurecer `firestore.rules` por coleção
2. Ampliar testes unitários e E2E
3. Cobrir expiração de token, revogação e bloqueio por policy

## Validação

```bash
npm run lint
npm run test
npm run test:e2e:full
npm run build
```

O teste `e2e/intra-full-flow.spec.ts` é o cenário de validação ponta a ponta do processo completo descrito nos épicos.
