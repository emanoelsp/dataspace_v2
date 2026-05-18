# Arquitetura — INTRA Dataspace

## Stack principal

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 15 + TypeScript (App Router) |
| Estilo | Tailwind CSS + shadcn/ui |
| Auth | Firebase Auth |
| Banco | Firestore |
| Deploy | Vercel |
| Testes unitários | Vitest |
| Testes E2E | Playwright |
| Validação | Zod |

## Separação arquitetural fundamental

```
Control Plane (Next.js + Firebase)
  → identidade, catálogo, membership, contratos, tokens, auditoria

Data Plane (Sidecar / CPS)
  → payload consumido diretamente na fonte pelo Data Client
  → validação de token no edge (Policy Enforcement Point)
```

O plano de controle **nunca** atua como proxy obrigatório do payload industrial.

## Estrutura do projeto

```
/src
  /app               — App Router (páginas e rotas de API)
    /api             — Route Handlers server-side
    /access          — Solicitação e revisão de acesso
    /assets          — Criação e detalhe de ativos
    /federations     — Criação e detalhe de federações
    /profile         — Perfil humano e conector
    /search          — Catálogo e busca federada
  /components        — Componentes de UI compartilhados
  /lib               — Lógica de domínio, Firebase, tipos, guards
/e2e                 — Testes E2E Playwright
/docs                — Documentação do projeto
/firestore.indexes.json
/firestore.rules
```

## Coleções Firestore

### Plano de Identidade e Confiança

| Coleção | Propósito |
|---------|-----------|
| `users` | Identidade humana, papel (`owner`/`client`), ownership |
| `connectorProfiles` | Configuração técnica do conector (endpoints, sidecar, protocolo) |
| `connectorCredentials` | Credenciais de aplicação (`clientId`, `clientSecretHash`) |
| `identityTokens` | Tokens de confiança de identidade (vida curta, auditáveis) |
| `identityTrustLogs` | Auditoria de autenticação mútua entre conectores |
| `connectorConnections` | Relações de confiança técnica entre conectores |

### Plano de Federação e Catálogo

| Coleção | Propósito |
|---------|-----------|
| `federations` | Ecossistema de dados — `catalogVisibility`, `admissionMode` |
| `compliance` | Termos globais e evidências da federação (FederationAgreement) |
| `federationMemberships` | Vínculo participante × federação com máquina de estados |
| `federationInvites` | Convites emitidos pelo owner para federações `invite-only` |
| `catalogPublications` | Publicação de federações e ativos no catálogo federado |

### Plano de Contratos e Credenciais

| Coleção | Propósito |
|---------|-----------|
| `assets` | Ativos industriais com metadados semânticos (AAS, IRDI, ECLASS) |
| `governance` | Políticas locais de uso dos ativos (Usage Policy) |
| `contractOffers` | Ofertas de contrato publicadas para federação ou ativo |
| `contractAgreements` | Acordos firmados após negociação (máquina de estados) |
| `credentialGrants` | Credenciais internas emitidas após adesão ou aprovação |
| `accessRequests` | Solicitações operacionais vinculadas ao contractAgreement |
| `accessTokens` | Tokens de vida curta para consumo P2P |
| `accessLogs` | Trilha de auditoria do consumo real |

## Máquinas de estado principais

### `connectorProfiles`
`draft → configured → active → revoked`

### `connectorCredentials`
`issued → active → rotated → revoked → expired`

### `identityTokens`
`issued → active → expired → revoked → rejected`

### `federationMemberships`

```
self-service:   draft → pending-signature → active
approval:       draft → requested → pending-signature → pending-approval → active | rejected
invite-only:    invited → pending-signature → pending-approval → active | rejected
saída:          active → revoked
```

### `federationInvites`
`issued → sent → accepted | declined | expired | cancelled`

### `contractOffers`
`draft → published → suspended → retired`

### `contractAgreements`
`requested → negotiating → pending-provider-signature → pending-consumer-signature → finalized → rejected | revoked | expired`

## Separação de visibilidade e admissão

```
catalogVisibility
  public    → visível para qualquer participante autenticado
  members   → visível apenas para membros da federação
  hidden    → não aparece no catálogo geral; acesso só por link/invite

admissionMode
  self-service   → entra aceitando o acordo da federação
  approval       → solicita entrada e aguarda aprovação
  invite-only    → entra apenas com convite assinado
```

Mapeamento do modelo antigo:
- `Open` → `catalogVisibility=public`, `admissionMode=self-service`
- `Consortium` → `catalogVisibility=members`, `admissionMode=approval`
- `Private` → `catalogVisibility=hidden`, `admissionMode=invite-only`

## Dois níveis de contrato

| Tipo | Escopo | Propósito |
|------|--------|-----------|
| `FederationAgreement` | Federação | Rege entrada e permanência — termos comunitários, obrigações gerais, auditoria |
| `AssetContractOffer` → `ContractAgreement` | Ativo | Rege consumo — políticas de acesso, finalidade, quotas, vigência, classificação |

Aceitar a federação **não** substitui o contrato do ativo.

## Rotas e responsabilidades

| Rota | Ator | Função principal |
|------|------|-----------------|
| `/profile/connector` | Owner/Client | Configuração de conector e Identity Trust |
| `/federations/create` | Owner | Criar federação com visibilidade e admissão |
| `/federations/[id]` | Owner/Client | Detalhe, memberships, invites, agreement, catálogo |
| `/assets/create` | Owner | Criar ativo com metadados semânticos |
| `/assets/[id]` | Owner/Client | Detalhe, contract offers, agreements, access logs |
| `/access` | Client | Acompanhar membership requests, asset agreements, histórico |
| `/access/review` | Owner | Fila de decisões sobre solicitações de acesso |
| `/search` | Client (autenticado) | Catálogo federado filtrado por identity + membership |
| `/api/*` | Servidor | Route Handlers para operações sensíveis (server-side) |

## Proteção de rotas

| Nível | Rotas |
|-------|-------|
| Público | Landing page, descoberta básica |
| Autenticado | Dashboard, perfil, detalhes compartilhados de federação e ativo |
| Data Owner | `/profile/connector`, gestão de federações, ativos, compliance, governance |
| Data Client | `/access` (solicitação de acesso) |

## Regras técnicas

- Preferir Server Components quando possível.
- Usar Client Components apenas quando necessário (interatividade, estado local).
- Nunca acessar Firestore diretamente em componentes complexos — usar `src/lib/`.
- Centralizar configuração Firebase em `src/lib/firebase`.
- Operações sensíveis (emissão de token, decisões de acesso) devem ser Route Handlers server-side.
- Separar lógica de domínio da lógica de UI.
- Validar dados com Zod nas boundaries (formulários, APIs).
- Usar TypeScript estrito.

## Bibliotecas utilizadas

- `firebase` — Auth e Firestore
- `shadcn/ui` — componentes de UI
- `lucide-react` — ícones
- `tailwindcss` — estilos
- `zod` — validação
- `vitest` — testes unitários
- `@playwright/test` — testes E2E

## Estado atual do protótipo

| Épico | Cobertura |
|-------|-----------|
| 0 — Identity Trust | Parcialmente coberto — falta endurecer connectorCredentials e identityTokens |
| 1 — Setup do Provedor | Coberto — federação, compliance, ativo, governance, ofertas |
| 2 — Onboarding Consumidor | Coberto — conector, conexão, membership, credencial |
| 3 — Descoberta | Coberto — catálogo com visibilidade, membership, ownership |
| 4 — Contrato e Token | Coberto — contract offer, agreement, credentialGrant, accessToken |
| 5 — Consumo P2P | Parcialmente — consumo P2P funciona; falta sidecar real como PEP no edge |

## Próximos passos arquiteturais

1. Extrair lógica de decisões, emissão de credenciais e tokenização para Route Handlers server-side.
2. Endurecer `connectorCredentials`, rotação formal e `identityTokens` dedicados.
3. Criar sidecar HTTP/MQTT simplificado como Policy Enforcement Point.
4. Endurecer `firestore.rules` para refletir integralmente a separação entre trust, membership, agreement e consumo.
5. Ampliar testes automatizados para cobrir falhas de autenticação, expiração de token, revogação e bloqueio por policy.
