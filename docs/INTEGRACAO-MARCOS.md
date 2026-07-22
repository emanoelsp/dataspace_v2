# Contrato de integração — ACSM (Marcos) × Dataspace Intra (Emanoel)

> Interface objetiva para a "integração efetiva com a parte do Marcos"
> (item obrigatório definido pelo orientador em 17/04).

## Papéis

- **ACSM/PPU (Marcos)**: orquestra ciclo Plug/Play/Unplug dos CPS e consome
  dados de outros equipamentos para decidir.
- **Dataspace (Emanoel)**: plano de controle (catálogo/UDDI, federações,
  contratos, tokens, governança) + Sidecar PEP no plano de dados.

## Os 5 pontos de integração

### 1. Registrar um CPS do ACSM no Dataspace (fase Plug)
O CPS do Marcos expõe `/api/data` e `/api/aas` (mesmo contrato dos sims).
Registro: criar o ativo no Dataspace (UI ou Firestore) — o Dataspace
registra o CPS automaticamente no Sidecar PEP e **colhe as capacidades**
(métricas + semânticas) para o catálogo.

```
POST {dataspace}/api/sidecar/register-equipment   (server-to-server alternativo)
body: { idToken, id, name, baseUrl, eclassIrdi?, sidecarUrl? }
```

### 2. Descobrir dados de que o ACSM precisa (UDDI)
- Interno: coleções `federations`/`assets` ou páginas /search (por federação,
  ativo, tipo, sinal de processo — ex.: "temperature" acha `zone1Temp_C`).
- Externo/inter: `GET {dataspace}/api/gateway/catalog` (header `X-Gateway-Key`)
  → catálogo DCAT-like com `capabilities` e `admissionMode`, sem endpoints crus.

### 3. Obter acesso (contrato → token)
Fluxo por tipo de federação: aberta = assina e consome; consórcio = convite;
privada = solicitação + aprovação. Ao final, o token é entregue ao Sidecar
do dono **já com a governança herdada** (TTL, purpose binding, revogação).

### 4. Consumir dados (fase Play) — SEMPRE via Sidecar PEP
```
GET {sidecar}/api/proxy/{equipmentSlug}/data     Authorization: Bearer <token>
GET {sidecar}/api/proxy/{equipmentSlug}/aas
```
Headers de resposta que o ACSM pode usar nas decisões e nos logs dele:
`X-Token-Id`, `X-Contract-Ref`, `X-Governance-Policy`, `X-Response-Time-Ms`,
`X-Data-Owner`, `X-Federation-Id`. Acesso negado = 403 em ~250 ms (logado).

### 5. Rastreabilidade compartilhada
Todo acesso vira: log local no sidecar (`/api/access-log`, admin) + evento no
Dataspace (`accessLogs` no Firestore, com contractRef e governança). O PPU do
Marcos pode correlacionar pelos ids (tokenId/contractRef) — insumo direto para
a camada de lineage/traceability que ele mapeou no e-mail de 22/05.

## Smoke test conjunto (roteiro de 10 min)

1. Marcos sobe um CPS dele (porta livre, ex.: 3020) com `/api/data` + `/api/aas`.
2. Emanoel cria o ativo no Dataspace apontando para ele (slug ex.: `acsm-cell`).
3. Confirmar no sidecar: `GET /api/equipment` lista `acsm-cell`.
4. Contrato na federação aberta → token ativo.
5. `curl {sidecar}/api/proxy/acsm-cell/data -H "Authorization: Bearer <tok>"`.
6. Verificar governança nos headers + evento em `accessLogs`.
