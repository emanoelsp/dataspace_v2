# Contrato REST — Dataspace, Sidecar PEP e CPS

Contratos REST dos três repositórios e como o Sidecar passa a alcançar os CPS da
LAN depois que um contrato é assinado.

| Repositório | Papel | Onde roda |
|---|---|---|
| `dataspace` (`dataspaceapp/`) | control plane: catálogo, governança, contratos, tokens | nuvem (Vercel) |
| `dataspace-sidecar` | PEP: valida token e faz proxy P2P | borda, junto dos CPS (porta 3100) |
| `dataspace-equipment` | simuladores de CPS | LAN (portas 3001–3010, ou `fleet` em 3050) |

```
consumidor ──Bearer <token do contrato>──► SIDECAR :3100 ──Bearer demo (LAN)──► CPS :300x
                                              ▲   │
          POST /api/equipment, /api/tokens    │   └── POST /api/sidecar/events (webhook, opcional)
          (Bearer SIDECAR_ADMIN_SECRET)       │
                                       DATASPACE (nuvem)
```

O dado nunca passa pela nuvem: ela só registra CPS no Sidecar e empurra tokens.

---

## 1. CPS (`dataspace-equipment`)

Cada CPS é uma app Next.js com porta própria:

| id | porta | id | porta |
|---|---|---|---|
| cnc | 3001 | agv | 3006 |
| press | 3002 | paint | 3007 |
| robot | 3003 | quality | 3008 |
| oven | 3004 | compressor | 3009 |
| conveyor | 3005 | warehouse | 3010 |

A `fleet` (`node fleet/server.mjs --port 3050`) roda N CPS num processo, com
prefixo `/eq/{id}` — o `baseUrl` registrado no Sidecar é `http://host:3050/eq/{id}`.

### Endpoints

| Método | Rota | Auth | Resposta |
|---|---|---|---|
| GET | `/api/data` | `Bearer demo` | `{ equipmentId, equipmentType, eclassIrdi, eclassClass, timestamp, state, metrics: {…} }` |
| GET | `/api/aas[?submodel=Nameplate\|TechnicalData\|OperationalData]` | `Bearer demo` | AAS Environment (IDTA-01001-3-0): `{ assetAdministrationShells: […], submodels: […] }`; headers `X-Asset-Id`, `X-Eclass-Irdi` |
| GET | `/api/health` | — (só cnc e press) | `{ status, equipment, assetId, eclassIrdi, endpoints, timestamp }` |

Exemplo de `/api/data` (cnc):

```json
{
  "equipmentId": "urn:dataspace:plant1:equipment:cnc:machiningcenter:001",
  "equipmentType": "CNC",
  "eclassIrdi": "0173-1#01-ACJ843#001",
  "eclassClass": "27-01-02-16",
  "timestamp": "2026-10-29T12:00:00.000Z",
  "state": "running",
  "metrics": { "spindleSpeed_rpm": 7800, "feedRate_mm_min": 1800, "cuttingTemp_C": 65.2, "...": "..." }
}
```

### Autenticação

`validateAccessToken` (`cnc/src/lib/equipment-aas.ts:80`):

- `demo` é sempre aceito;
- sem `EQUIPMENT_TOKEN` no ambiente, o acesso é aberto;
- `middleware.ts` injeta `Bearer demo` quando o `Host` é local (`localhost`, `127.0.0.1`, `192.168.0.82`) e adiciona CORS `*`;
- sem token: `401 { error: "Unauthorized", reason, hint: "Bearer demo" }`.

---

## 2. Sidecar PEP (`dataspace-sidecar`, porta 3100)

"admin" = `Authorization: Bearer $SIDECAR_ADMIN_SECRET`.

| Método | Rota | Auth | Contrato |
|---|---|---|---|
| GET | `/api/status` | — | saúde do PEP; sonda `GET {baseUrl}/api/data` de cada CPS; estatísticas de registro, tokens e acessos |
| GET | `/api/equipment` | — | `{ equipment: SidecarEquipment[] }` |
| POST | `/api/equipment` | admin | registra/atualiza (upsert por `id`) |
| PATCH | `/api/equipment` | admin | `{ id, status: "active" \| "disabled" }` |
| GET | `/api/tokens` | admin | `{ tokens, stats }` |
| POST | `/api/tokens` | admin | recebe o token do contrato → `201 { token }` |
| GET | `/api/tokens/:id` | admin | `{ token }` |
| PATCH | `/api/tokens/:id` | admin | `{ "action": "revoke" }` |
| GET | `/api/proxy/{slug}/{data\|aas\|resourceId}[?qs]` | `Bearer <token do contrato>` | consumo P2P |
| GET | `/api/access-log?limit=50` | admin | `{ entries, stats }` |

### `POST /api/equipment`

```json
{
  "id": "oven",
  "name": "Heat Treatment Furnace",
  "baseUrl": "http://192.168.0.21:3004",
  "displayHost": "192.168.0.x",
  "eclassIrdi": "0173-1#01-...",
  "connectorId": "<connectorProfiles id>",
  "dataOwnerId": "<uid ou participantId>",
  "dataOwnerName": "plant1"
}
```

Obrigatórios: `id` (slug `^[a-z0-9][a-z0-9-]{0,63}$`), `name`, `baseUrl` (URL válida).

### `POST /api/tokens`

```json
{
  "token": "dsp_m2m_…",
  "federationId": "…", "federationName": "…",
  "assetId": "…", "assetName": "…",
  "equipmentType": "oven",
  "dataOwnerId": "…", "dataOwnerName": "…",
  "dataClientId": "…", "dataClientName": "…",
  "expiresAt": "2026-10-29T12:30:00.000Z",
  "governanceAcceptedAt": "2026-10-29T12:00:00.000Z",
  "contractRef": "<contractAgreements id>",
  "permissions": ["data", "aas"],
  "governance": {
    "policyId": "…",
    "accessTokenTtlMinutes": 30,
    "purposeBinding": false,
    "requiresManualApproval": false,
    "revocationMode": "ttl-expiry",
    "conditions": "…"
  }
}
```

Todos obrigatórios, exceto `governance`. `equipmentType` é o slug do CPS no
Sidecar; `permissions` aceita `"data"`, `"aas"` ou `"all"`.

### Persistência

Arquivos JSON em `.data/`: `equipment.json`, `tokens.json`, `access-log.json`
(últimas 1000 entradas). O Sidecar é stateful e precisa alcançar a LAN, por
isso não roda em serverless.

---

## 3. Dataspace (`dataspaceapp`) — rotas que alimentam o Sidecar

### Fluxo M2M (sem login; `X-M2M-Key` se `M2M_API_KEY` estiver definido)

**`POST /api/m2m/register`** — auto-registro de um CPS.

```json
{
  "name": "Heat Treatment Furnace",
  "baseUrl": "http://192.168.0.21:3004",
  "sidecarEndpoint": "https://algo.trycloudflare.com",
  "organization": "plant1",
  "equipmentSlug": "oven",
  "federation": { "create": { "name": "plant1 — Utilities", "type": "Open" } },
  "governance": { "accessTokenTtlMinutes": 15, "requiresManualApproval": false }
}
```

Colhe capacidades do CPS (`/api/data` + `/api/aas?submodel=OperationalData`),
faz upsert de conector → federação → compliance → ativo → governança e chama
`POST {sidecarEndpoint}/api/equipment`. Idempotente por `participantId`
(`urn:dataspace:participant:{organization}:{slug}`). Retorna
`{ participantId, connectorId, federation, assetId, governanceId, capabilities, sidecarRegistered, dataUrl }`.

**`GET /api/m2m/discover`** — `?capability=&equipmentType=&slug=&federationId=&q=&status=&exclude=&limit=`.
Só metadados; o `dataUrl` exige negociar antes.

**`POST /api/m2m/negotiate`**

```json
{
  "consumerParticipantId": "urn:dataspace:participant:plant1:cnc",
  "consumerName": "cnc",
  "targetSlug": "oven",
  "purpose": "compensação térmica"
}
```

- `purposeBinding` sem `purpose` → `422`;
- `requiresManualApproval` → `202 { status: "pending", requestId }` (cria `accessRequests`);
- senão: cria `contractAgreements` (`finalized`), gera `dsp_m2m_<hex>` com TTL da
  governança, chama `POST {sidecar}/api/tokens`, grava `accessTokens` e devolve:

```json
{
  "status": "granted",
  "token": "dsp_m2m_…",
  "tokenType": "Bearer",
  "dataUrl": "https://…/api/proxy/oven/data",
  "aasUrl": "https://…/api/proxy/oven/aas",
  "expiresAt": "…",
  "contractRef": "…",
  "sidecarTokenId": "…",
  "governance": { "…": "…" }
}
```

### Fluxo humano (UI com login Firebase)

| Momento | Chamada da UI | Rota da nuvem | Chamada ao Sidecar |
|---|---|---|---|
| Criação do ativo (`app/assets/create/page.tsx:396`) | `POST /api/sidecar/register-equipment` `{ idToken, sidecarUrl?, id, name, baseUrl, … }` | só aceita sidecar declarado em `connectorProfiles` do próprio usuário (isolamento multi-tenant) | `POST /api/equipment` |
| Aceite do contrato (`app/assets/[id]/page.tsx:1073`) | `POST /api/sidecar/push-token` `{ idToken, sidecarUrl, token, …campos do token }` | valida o `idToken` | `POST /api/tokens` |

### Webhook de rastreabilidade

`POST /api/sidecar/events` recebe o evento `proxy_access` do Sidecar
(`Authorization: Bearer <SIDECAR_ADMIN_SECRET>`) e grava em `accessLogs`.

---

## 4. Configuração do Sidecar para acessar os CPS locais

### 4.1 `.env.local`

```bash
# DEVE ser igual ao SIDECAR_ADMIN_SECRET do dataspaceapp
SIDECAR_ADMIN_SECRET=troque-por-um-segredo-forte

# (opcional) seed legado — só usado se .data/equipment.json não existir
# EQUIPMENT_CNC_URL=http://192.168.0.70:3001
# EQUIPMENT_PRESS_URL=http://192.168.0.8:3002
# EQUIPMENT_ROBOT_URL=http://192.168.0.9:3003

# (opcional) rastreabilidade de volta à nuvem
# DATASPACE_WEBHOOK_URL=https://<app>.vercel.app/api/sidecar/events
# DATASPACE_WEBHOOK_SECRET=<igual ao SIDECAR_ADMIN_SECRET do dataspaceapp>
```

### 4.2 Expor o Sidecar

```bash
npm run dev                                   # http://localhost:3100
cloudflared tunnel --url http://localhost:3100  # → https://algo.trycloudflare.com
```

A URL pública é o `sidecarEndpoint` do conector/ativo: a nuvem usa para empurrar
tokens e o consumidor usa para buscar dados. Se a URL efêmera mudar, basta
re-registrar os CPS (o register é idempotente).

### 4.3 Sequência

1. **Registro do CPS** — a nuvem faz `POST /api/equipment` com
   `baseUrl = http://<IP-LAN>:<porta>`; o Sidecar guarda `slug → baseUrl`.
2. **Contrato assinado** — a nuvem faz `POST /api/tokens`; o token fica `active`
   até `expiresAt` (expira sozinho na próxima leitura do store).
3. **Consumo** — `GET {sidecar}/api/proxy/{slug}/data` com `Authorization: Bearer <token>`.
   O proxy (`src/app/api/proxy/[...path]/route.ts`):
   1. confere se o CPS existe e está `active` (senão `404`);
   2. confere se o endpoint é `data` ou `aas` (senão `400`);
   3. confere o token: ausente/desconhecido/expirado → `401`; revogado → `403`;
   4. exige `token.equipmentType === slug` e permissão do endpoint (ou `all`) → senão `403`;
   5. faz `fetch(${baseUrl}/api/${endpoint}${qs})` com **`Authorization: Bearer demo`** (timeout 5 s; falha → `503 Equipment unreachable`);
   6. devolve o corpo com headers `X-Sidecar-Proxy`, `X-Token-Id`, `X-Contract-Ref`,
      `X-Data-Owner`, `X-Data-Client`, `X-Federation-Id`, `X-Governance-Policy`,
      `X-Response-Time-Ms`, `Cache-Control: no-store`;
   7. registra em `access-log.json`, incrementa `usageCount` e envia `proxy_access`
      ao webhook sem bloquear.
4. **Revogação** — `PATCH /api/tokens/:id { "action": "revoke" }` (no M2M, via
   `sidecarRevokeToken` em `lib/m2m.ts`).

```bash
# exemplo ponta a ponta
curl https://algo.trycloudflare.com/api/proxy/oven/data \
  -H "Authorization: Bearer dsp_m2m_…"
```

---

## 5. URLs públicas do Dataspace (Vercel)

Base de produção: **https://dataspace-v2.vercel.app** (projeto Vercel `dataspaceapp`).
Lista extraída de `dataspaceapp/src/app/api/**/route.ts`.

### M2M (aberto; `X-M2M-Key` só se `M2M_API_KEY` estiver definido)

| Método | URL | Descrição |
|---|---|---|
| GET | https://dataspace-v2.vercel.app/api/m2m | índice da API M2M |
| POST | https://dataspace-v2.vercel.app/api/m2m/register | auto-registro do CPS (conector, federação, ativo com recursos, governança, oferta e registro no Sidecar) |
| GET | https://dataspace-v2.vercel.app/api/m2m/discover | descoberta por `?capability=&slug=&equipmentType=&q=` |
| GET | https://dataspace-v2.vercel.app/api/m2m/offer | oferta de contrato e diretrizes de um ativo |
| POST | https://dataspace-v2.vercel.app/api/m2m/negotiate | negocia o contrato (adesão, oferta, conexão, acordo, credencial), gera o token e envia ao Sidecar |
| GET | https://dataspace-v2.vercel.app/api/m2m/agreement | validação de um contrato negociado (só as partes) |
| POST | https://dataspace-v2.vercel.app/api/m2m/organization | admin: define/reseta o segredo do Sidecar de uma organização |
| DELETE | https://dataspace-v2.vercel.app/api/m2m/organization?organization=… | a organização apaga tudo o que registrou via M2M e recomeça |
| POST | https://dataspace-v2.vercel.app/api/m2m/sidecar-endpoint | troca a URL do Sidecar de todos os CPS da organização e re-registra cada CPS |
| GET | https://dataspace-v2.vercel.app/api/m2m/monitor | monitor M2M |

### Sidecar

| Método | URL | Descrição |
|---|---|---|
| POST | https://dataspace-v2.vercel.app/api/sidecar/register-equipment | registra o CPS no Sidecar do próprio usuário (exige `idToken`) |
| POST | https://dataspace-v2.vercel.app/api/sidecar/push-token | envia o token do contrato ao Sidecar (exige `idToken`) |
| POST | https://dataspace-v2.vercel.app/api/sidecar/events | webhook `proxy_access` vindo do Sidecar (`Bearer SIDECAR_ADMIN_SECRET`) |
| POST | https://dataspace-v2.vercel.app/api/sidecar/monitor | monitor do Sidecar |
| POST | https://dataspace-v2.vercel.app/api/sidecar/owner-token | token do dono dos dados |

### Credenciais e identidade

| Método | URL |
|---|---|
| POST | https://dataspace-v2.vercel.app/api/connector-credentials/issue |
| POST | https://dataspace-v2.vercel.app/api/connector-credentials/revoke |
| POST | https://dataspace-v2.vercel.app/api/connector-credentials/rotate |
| POST | https://dataspace-v2.vercel.app/api/identity-tokens/issue |
| POST | https://dataspace-v2.vercel.app/api/identity-tokens/revoke |
| POST | https://dataspace-v2.vercel.app/api/access-requests/decision |

### EDC, catálogo e equipamentos

| Método | URL |
|---|---|
| GET | https://dataspace-v2.vercel.app/api/edc |
| POST | https://dataspace-v2.vercel.app/api/edc/register |
| GET | https://dataspace-v2.vercel.app/api/edc/data/{assetId} |
| GET | https://dataspace-v2.vercel.app/api/gateway/catalog |
| GET | https://dataspace-v2.vercel.app/api/equipment |
| GET | https://dataspace-v2.vercel.app/api/equipment/cnc |
| GET | https://dataspace-v2.vercel.app/api/equipment/press |
| GET | https://dataspace-v2.vercel.app/api/equipment/robot |
| GET | https://dataspace-v2.vercel.app/api/probe |

Os dados não passam por essas URLs: o consumo é sempre no Sidecar, em
`{sidecarEndpoint}/api/proxy/{slug}/{data|aas|resourceId}`, com o token do contrato.

---

## 6. Passo a passo M2M — do primeiro CPS ao consumo dos dados

Fluxo completo para quem tem CPS físicos e quer usar o Dataspace só por API:
**preparar → registrar → descobrir → ver a oferta → assinar contrato → consumir → validar**.

Nos exemplos: CPS em `http://127.0.0.1:3101` com 5 recursos, túnel do Sidecar em
`https://xxxx.trycloudflare.com`, organização `IFSC-GASPAR`.

### 6.0 Preparar (uma vez)

**Segredos e headers:**

| Item | Onde | Para quê | Obrigatório |
|---|---|---|---|
| `M2M_API_KEY` | header `X-M2M-Key` nas chamadas de escrita | protege `register`, `negotiate`, `sidecar-endpoint` e `agreement` | sim (definida em produção; valor passado pelo Emanoel) |
| Segredo do Sidecar da organização | `SIDECAR_ADMIN_SECRET` no `.env.local` do Sidecar **e** header `X-Sidecar-Secret` | a nuvem fala com o Sidecar da organização com esse segredo; prova a identidade da organização em `register`, `sidecar-endpoint`, `negotiate` (consumidor) e `agreement` | sim |
| `DATASPACE_WEBHOOK_URL` / `DATASPACE_WEBHOOK_SECRET` | `.env.local` do Sidecar | acessos aparecem no painel do Dataspace (o secret é o `SIDECAR_ADMIN_SECRET` **global** do Dataspace, passado pelo Emanoel) | não |

**O segredo do Sidecar é por organização**, não global. Duas formas de criá-lo:

- **Recomendado — você escolhe:** gere um valor (≥ 32 caracteres), coloque em
  `SIDECAR_ADMIN_SECRET` e envie o mesmo valor em `X-Sidecar-Secret` no primeiro
  register da organização. Ele vira o segredo dela e o registro no Sidecar já
  funciona na primeira chamada.

  ```bash
  openssl rand -hex 32
  ```

- **O Dataspace gera:** sem o header no primeiro register, a resposta traz
  `sidecarSecret` (mostrado **uma única vez**). Coloque no `.env.local`, reinicie
  o Sidecar e repita o register com o header.

A partir do primeiro register, **toda** chamada de `register` e
`sidecar-endpoint` dessa organização exige `X-Sidecar-Secret`, e o `negotiate`
exige o segredo da organização **do consumidor**. Sem ele: `403`.

**Organização que já tinha CPS antes do segredo por organização** (ex.:
IFSC-GASPAR, plant1) não pode ser assumida pelo register — senão qualquer um
com a `X-M2M-Key` ficaria com ela. O administrador do Dataspace define o segredo
uma vez:

```bash
curl -X POST https://dataspace-v2.vercel.app/api/m2m/organization \
  -H "Content-Type: application/json" \
  -H "X-M2M-Admin-Key: <M2M_ADMIN_KEY>" \
  -d '{ "organization": "IFSC-GASPAR", "sidecarSecret": "<segredo escolhido pela organização>" }'
```

Sem `sidecarSecret`, a rota gera um e devolve uma vez. A mesma rota reseta o
segredo de quem o perdeu.

```bash
# .env.local do Sidecar
SIDECAR_ADMIN_SECRET=<segredo da organização>
```

**Subir o Sidecar e expor:**

```bash
cd dataspace-sidecar
npm install && npm run dev                      # http://localhost:3100
cloudflared tunnel --url http://localhost:3100  # → https://xxxx.trycloudflare.com
```

A Vercel não alcança a LAN: a URL do túnel é o `sidecarEndpoint`. Se o túnel
reiniciar, use 6.7 para trocar a URL de todos os CPS numa chamada.

**Contrato que o CPS precisa cumprir** (o Sidecar chama exatamente isso, sempre
com `Authorization: Bearer demo`, esperando JSON):

| Endpoint no Sidecar | Path chamado no CPS |
|---|---|
| `/api/proxy/{slug}/data` | `{baseUrl}/api/data` |
| `/api/proxy/{slug}/aas` | `{baseUrl}/api/aas` |
| `/api/proxy/{slug}/{resourceId}` | `{baseUrl}{resource.path}` (ex.: `/api/v1/operational`) |

A query string é repassada ao CPS. Teste da máquina do Sidecar:

```bash
curl http://127.0.0.1:3101/api/v1/operational -H "Authorization: Bearer demo"
```

### 6.1 Registrar o CPS — `POST /api/m2m/register`

| | |
|---|---|
| **Método** | `POST` |
| **URL** | `https://dataspace-v2.vercel.app/api/m2m/register` |
| **Headers** | `Content-Type: application/json`, `X-M2M-Key: <M2M_API_KEY>`, `X-Sidecar-Secret: <segredo da organização>` |

**Body:**

| Campo | Obrigatório | Descrição |
|---|---|---|
| `name` | sim | nome legível do CPS |
| `baseUrl` | sim | URL do CPS na LAN, vista pelo Sidecar (sem `/api/data`) |
| `sidecarEndpoint` | sim | URL pública do túnel do Sidecar |
| `organization` | não (padrão `plant1`) | nome da organização; define o segredo do Sidecar |
| `equipmentSlug` | não (padrão: slug do `name`) | **único no Dataspace inteiro**, ex.: `cpslai1` |
| `assetType` | recomendado | tipo do CPS (`Conveyor`, `CNC`, …) |
| `eclassIrdi` | recomendado | classe ECLASS |
| `capabilities` | recomendado | chaves de métrica; usadas na descoberta por capacidade |
| `description` | não | texto livre (entra na busca) |
| `resources` | não | recursos de dados do CPS: `[{ "id", "name", "path", "description"?, "semanticId"? }]` |
| `federation` | não | `{ "create": { "name", "type": "Open"\|"Consortium"\|"Private" } }` \| `{ "join": "<id>" }` \| `{ "joinByName": "<nome>" }` |
| `governance` | não | `{ accessTokenTtlMinutes (padrão 30), requiresManualApproval, purposeBinding, revocationMode }` |

Regras de `resources`: `id` em slug minúsculo (`a-z`, `0-9`, `-`), único, diferente
de `data` e `aas`; `path` absoluto no CPS (começa com `/`, sem `..`); até 32 itens.

> `assetType`, `eclassIrdi` e `capabilities` devem ir explícitos: a colheita
> automática roda na Vercel e tenta ler o `baseUrl` da LAN, que ela não alcança.

**Exemplo — CPS com 5 recursos (primeiro CPS da organização, cria a federação):**

```bash
curl -X POST https://dataspace-v2.vercel.app/api/m2m/register \
  -H "Content-Type: application/json" \
  -H "X-M2M-Key: <M2M_API_KEY>" \
  -H "X-Sidecar-Secret: <segredo da organização>" \
  -d '{
    "name": "CPS-LAI-01 - Distribution/Conveyor Station",
    "baseUrl": "http://127.0.0.1:3101",
    "sidecarEndpoint": "https://xxxx.trycloudflare.com",
    "organization": "IFSC-GASPAR",
    "equipmentSlug": "cpslai1",
    "assetType": "Conveyor",
    "eclassIrdi": "0173-1#01-...",
    "capabilities": ["beltSpeed_m_s"],
    "federation": { "create": { "name": "ifsc", "type": "Open" } },
    "governance": { "accessTokenTtlMinutes": 30, "requiresManualApproval": false },
    "resources": [
      { "id": "operational",   "name": "Operational Data",    "path": "/api/v1/operational" },
      { "id": "cognitive",     "name": "Cognitive Knowledge", "path": "/api/v1/cognitive" },
      { "id": "ppu-events",    "name": "Lifecycle Events",    "path": "/api/v1/ppu/events" },
      { "id": "hcm-episodes",  "name": "HCM Episodes",        "path": "/api/v1/hcm/episodes" },
      { "id": "hcm-knowledge", "name": "HCM Knowledge",       "path": "/api/v1/hcm/knowledge" }
    ]
  }'
```

**CPS seguintes:** mesmo header `X-Sidecar-Secret` e
`"federation": { "joinByName": "ifsc" }`.

**Resposta (200):**

```json
{
  "ok": true,
  "participantId": "urn:dataspace:participant:ifsc-gaspar:cpslai1",
  "connectorId": "…",
  "federation": { "id": "…", "name": "ifsc", "created": true, "admissionMode": "self-service" },
  "complianceId": "…",
  "assetId": "abc123",
  "equipmentSlug": "cpslai1",
  "governanceId": "…",
  "contractOfferId": "…",
  "capabilities": ["beltSpeed_m_s"],
  "resources": [{ "id": "operational", "name": "Operational Data" }, "…"],
  "resourceUrls": {
    "operational": "https://xxxx.trycloudflare.com/api/proxy/cpslai1/operational",
    "…": "…"
  },
  "sidecarRegistered": true,
  "dataUrl": "https://xxxx.trycloudflare.com/api/proxy/cpslai1/data"
}
```

Se o Dataspace gerou o segredo (primeiro register sem header), a resposta traz
também `sidecarSecret` e `sidecarSecretNotice`.

O que acontece: cria/atualiza conector → federação (+ adesão: `active` em
federação self-service ou criada por você; `pending-approval` nas demais, ver
`federation.membershipStatus`) → compliance → ativo (com os recursos) →
governança → **oferta de contrato** com as diretrizes, e chama
`POST {sidecarEndpoint}/api/equipment` com o segredo da organização e o mapa de
recursos. Idempotente por `organization` + `equipmentSlug`.

| Resposta | Causa |
|---|---|
| `sidecarRegistered: false` | o Sidecar não aceitou: túnel caído ou `SIDECAR_ADMIN_SECRET` ≠ segredo da organização |
| `400 Required: name, baseUrl, sidecarEndpoint` | campo obrigatório ausente |
| `400 resources: …` | recurso inválido (id, path, duplicado) |
| `400 X-Sidecar-Secret must have at least 32 characters.` | segredo curto no primeiro register |
| `401 Missing or invalid X-M2M-Key header.` | header ausente ou errado |
| `403 Organization "…" is already registered…` | organização já tem segredo e o header faltou ou está errado |
| `403 Organization "…" already has CPS registered without a sidecar secret…` | organização legada: o admin precisa definir o segredo (`/api/m2m/organization`) |
| `404 Federation not found…` | `join`/`joinByName` não existe |
| `503 Sidecar secret store unavailable` | configuração da nuvem — avise o Emanoel |

**Conferir no Sidecar:**

```bash
curl https://xxxx.trycloudflare.com/api/equipment   # cpslai1 com "resources": [...]
curl https://xxxx.trycloudflare.com/api/status
```

> O consumidor também precisa de identidade: registre-o do mesmo jeito (ex.:
> `equipmentSlug: "acsm"`) e use o `participantId` devolvido.

### 6.2 Descobrir CPS — `GET /api/m2m/discover`

| | |
|---|---|
| **Método** | `GET` |
| **URL** | `https://dataspace-v2.vercel.app/api/m2m/discover` |
| **Headers** | nenhum (rota aberta) |

Devolve só metadados, nunca dados do CPS.

**Filtros (query string, combináveis com AND):**

| Parâmetro | Exemplo | Casa com |
|---|---|---|
| `slug` | `?slug=cpslai1` | slug exato |
| `capability` | `?capability=temperature` | capacidades, semânticas, chaves de métrica |
| `equipmentType` | `?equipmentType=Conveyor` | `assetType` (contém) |
| `federationId` | `?federationId=<id>` | uma federação |
| `q` | `?q=hcm` | texto livre (nome, descrição, IRDI, capacidades, **recursos**) |
| `exclude` | `?exclude=acsm` | ignora slug ou participantId informado |
| `status` | `?status=any` | padrão `available` |
| `limit` | `?limit=10` | padrão 50, máx. 200 |

**Exemplo:**

```bash
curl "https://dataspace-v2.vercel.app/api/m2m/discover?slug=cpslai1"
```

**Resposta (200):**

```json
{
  "count": 1,
  "results": [{
    "assetId": "abc123",
    "name": "CPS-LAI-01 - Distribution/Conveyor Station",
    "equipmentSlug": "cpslai1",
    "equipmentType": "Conveyor",
    "capabilities": ["beltSpeed_m_s"],
    "federation": { "id": "…", "name": "ifsc", "admissionMode": "self-service" },
    "owner": "urn:dataspace:participant:ifsc-gaspar:cpslai1",
    "sidecarEndpoint": "https://xxxx.trycloudflare.com",
    "dataUrl": "https://xxxx.trycloudflare.com/api/proxy/cpslai1/data",
    "resources": [
      { "id": "operational", "name": "Operational Data", "description": "", "semanticId": "",
        "url": "https://xxxx.trycloudflare.com/api/proxy/cpslai1/operational" }
    ]
  }]
}
```

Guarde o **`assetId`**. As URLs só respondem com token.

> Federação `Consortium` fica oculta na descoberta aberta — só aparece com
> `?federationId=<id>`.

### 6.3 Ver a oferta de contrato — `GET /api/m2m/offer`

| | |
|---|---|
| **Método** | `GET` |
| **URL** | `https://dataspace-v2.vercel.app/api/m2m/offer?assetId=<id>` (ou `?slug=<slug>`) |
| **Headers** | nenhum |

Mostra as diretrizes que o consumidor aceita ao negociar.

**Resposta (200):**

```json
{
  "asset": { "assetId": "abc123", "name": "CPS-LAI-01 …", "equipmentSlug": "cpslai1", "owner": "urn:…:cpslai1" },
  "federation": { "id": "…", "name": "ifsc", "admissionMode": "self-service" },
  "offer": { "id": "…", "version": 1, "status": "published" },
  "directives": {
    "purposeBinding": false,
    "requiresManualApproval": false,
    "validForHours": 24,
    "accessTokenTtlMinutes": 30,
    "revocation": "ttl-expiry",
    "revocable": true,
    "governancePolicyId": "…",
    "governancePolicies": "…",
    "usagePeriods": "",
    "resources": [{ "id": "operational", "name": "Operational Data" }, "…"]
  },
  "resources": [{ "id": "operational", "name": "Operational Data", "url": "https://…/api/proxy/cpslai1/operational" }],
  "negotiation": "automatic",
  "howToSign": {
    "method": "POST", "path": "/api/m2m/negotiate",
    "body": { "consumerParticipantId": "<your participantId>", "targetAssetId": "abc123", "resources": ["operational", "…"] }
  }
}
```

| Campo de `directives` | Significado |
|---|---|
| `purposeBinding` | se `true`, o negotiate exige `purpose` |
| `requiresManualApproval` | se `true`, o negotiate devolve `pending` (evite em M2M) |
| `validForHours` | validade do acordo assinado |
| `accessTokenTtlMinutes` | validade de cada token (nunca além do acordo) |
| `revocation` / `revocable` | modo de revogação |
| `resources` | recursos que podem ser contratados |

### 6.4 Assinar o contrato — `POST /api/m2m/negotiate`

| | |
|---|---|
| **Método** | `POST` |
| **URL** | `https://dataspace-v2.vercel.app/api/m2m/negotiate` |
| **Headers** | `Content-Type: application/json`, `X-M2M-Key: <M2M_API_KEY>`, `X-Sidecar-Secret: <segredo da organização do CONSUMIDOR>` |

O `consumerParticipantId` precisa ter sido registrado via `/api/m2m/register`,
e o header prova que o chamador é da organização dele — ninguém negocia em nome
de outro participante.

**Body:**

| Campo | Obrigatório | Descrição |
|---|---|---|
| `consumerParticipantId` | sim | `participantId` do consumidor (do register dele) |
| `targetAssetId` ou `targetSlug` | um dos dois | prefira `targetAssetId` |
| `consumerName` | não | nome legível nos logs |
| `purpose` | se `purposeBinding: true` | finalidade do uso |
| `resources` | não | ids dos recursos a contratar; padrão: todos os do ativo |

**Exemplo — contratar só 2 dos 5 recursos:**

```bash
curl -X POST https://dataspace-v2.vercel.app/api/m2m/negotiate \
  -H "Content-Type: application/json" \
  -H "X-M2M-Key: <M2M_API_KEY>" \
  -H "X-Sidecar-Secret: <segredo da organização do consumidor>" \
  -d '{
    "consumerParticipantId": "urn:dataspace:participant:ifsc-gaspar:acsm",
    "consumerName": "acsm",
    "targetAssetId": "abc123",
    "purpose": "controle adaptativo",
    "resources": ["operational", "hcm-episodes"]
  }'
```

**Etapas gravadas** (as mesmas do fluxo pela interface):

| # | Etapa | Coleção | Observação |
|---|---|---|---|
| 1 | adesão à federação | `federationMemberships` | reaproveita adesão `active`; cria automaticamente só em federação `self-service` |
| 2 | oferta de contrato | `contractOffers` | a publicada no register |
| 3 | conexão entre conectores | `connectorConnections` | reaproveitada nas próximas negociações |
| 4 | acordo assinado | `contractAgreements` | `signedByConsumerAt` + `signedByProviderAt`, `validFrom`/`validUntil`, recursos |
| 5 | credencial de uso | `credentialGrants` | válida até o fim do acordo |
| 6 | token | `accessTokens` + Sidecar | `permissions` = `data`, `aas` + recursos contratados |

**Resposta — concedido (200):**

```json
{
  "status": "granted",
  "token": "dsp_m2m_9f3c…",
  "tokenType": "Bearer",
  "dataUrl": "https://xxxx.trycloudflare.com/api/proxy/cpslai1/data",
  "aasUrl": "https://xxxx.trycloudflare.com/api/proxy/cpslai1/aas",
  "resourceUrls": {
    "operational": "https://xxxx.trycloudflare.com/api/proxy/cpslai1/operational",
    "hcm-episodes": "https://xxxx.trycloudflare.com/api/proxy/cpslai1/hcm-episodes"
  },
  "expiresAt": "2026-10-31T13:30:00.000Z",
  "contractRef": "<contractAgreements id>",
  "agreementValidUntil": "2026-11-01T13:00:00.000Z",
  "offerId": "…",
  "credentialGrantId": "…",
  "sidecarTokenId": "<id do token no Sidecar>",
  "permissions": ["data", "aas", "operational", "hcm-episodes"],
  "governance": { "policyId": "…", "accessTokenTtlMinutes": 30, "…": "…" },
  "steps": [
    { "step": "federation-membership", "id": "…", "status": "created" },
    { "step": "contract-offer",        "id": "…", "status": "reused" },
    { "step": "connector-connection",  "id": "…", "status": "created" },
    { "step": "contract-agreement",    "id": "…", "status": "created" },
    { "step": "credential-grant",      "id": "…", "status": "created" },
    { "step": "access-token",          "id": "…", "status": "created" }
  ],
  "validate": "GET /api/m2m/agreement?contractRef=<contractRef>"
}
```

| Resposta | Causa |
|---|---|
| `sidecarTokenId: null` | o token não chegou ao Sidecar (túnel ou segredo); o consumo dará `401 Token not found` |
| `202 { status: "pending", requestId }` | governança com `requiresManualApproval: true` (ver aviso) |
| `400 Required: consumerParticipantId and (targetAssetId or targetSlug)` | body incompleto |
| `400 resources must be an array of resource ids` | `resources` mal formado |
| `403 Consumer not authenticated…` | `X-Sidecar-Secret` ausente/errado ou organização do consumidor não registrada |
| `403 The asset federation does not admit new members automatically.` | federação com aprovação/convite e consumidor não é membro |
| `403 Federation membership is pending-approval…` | adesão aguardando o dono da federação |
| `403 Connector connection revoked/rejected by the provider.` | o provedor bloqueou esse consumidor |
| `404 Target asset not found` | `assetId`/slug inexistente |
| `409 Target asset has no equipmentSlug/sidecarEndpoint` | ativo sem Sidecar |
| `409 The provider organization has no sidecar secret yet…` | ativo registrado antes do segredo por organização: o provedor precisa refazer o register |
| `422 Unknown resources: …` (+ `availableResources`) | recurso pedido não existe no ativo |
| `422 This asset requires 'purpose'` | `purposeBinding` ativo e `purpose` vazio |

> **Não use aprovação manual em CPS registrado por M2M.** Só um usuário logado
> cujo `uid` seja o dono do ativo pode aprovar, e o dono M2M é um
> `participantId`. O pedido fica pendente para sempre.

### 6.5 Consumir os dados — Sidecar `GET /api/proxy/{slug}/{data|aas|resourceId}`

| | |
|---|---|
| **Método** | `GET` |
| **URL** | qualquer entrada de `resourceUrls`, ou `dataUrl` / `aasUrl` |
| **Headers** | `Authorization: Bearer <token do negotiate>` |

Os dados vão direto do Sidecar ao consumidor — não passam pela Vercel. A query
string é repassada ao CPS.

```bash
curl "https://xxxx.trycloudflare.com/api/proxy/cpslai1/operational?limit=50" \
  -H "Authorization: Bearer dsp_m2m_9f3c…"

curl https://xxxx.trycloudflare.com/api/proxy/cpslai1/hcm-episodes \
  -H "Authorization: Bearer dsp_m2m_9f3c…"
```

**Resposta (200):** o JSON do próprio CPS, com headers de rastreabilidade
`X-Sidecar-Proxy`, `X-Token-Id`, `X-Contract-Ref`, `X-Data-Owner`,
`X-Data-Client`, `X-Federation-Id`, `X-Governance-Policy`, `X-Response-Time-Ms`.

| Resposta | Causa |
|---|---|
| `400 Invalid endpoint` (+ `available`) | recurso não registrado nesse CPS |
| `401 Token required` / `Token not found` | faltou `Authorization`, ou o token não chegou ao Sidecar |
| `401 Token expired` | passou o TTL — negocie de novo |
| `403 Token revoked` | token revogado |
| `403 Token not authorized for this equipment` | token de outro slug |
| `403 Insufficient permission` | recurso não contratado |
| `404 Unknown equipment` | slug não registrado ou desabilitado no Sidecar |
| `503 Equipment unreachable` | Sidecar não alcançou o CPS na LAN |

**Renovação:** o token vale até `expiresAt`. Para consumo contínuo, chame o
`negotiate` de novo antes de expirar.

### 6.6 Validar o contrato — `GET /api/m2m/agreement`

| | |
|---|---|
| **Método** | `GET` |
| **URL** | `https://dataspace-v2.vercel.app/api/m2m/agreement?contractRef=<contractRef>` |
| **Headers** | `X-M2M-Key: <M2M_API_KEY>`, `X-Sidecar-Secret: <segredo da organização do consumidor ou do provedor>` |

Confere o que foi contratado e se ainda vale. Só as partes do contrato consultam
(`403` para os demais). Nunca devolve o valor do token.

**Resposta (200):**

```json
{
  "contractRef": "…",
  "effectiveStatus": "active",
  "agreement": {
    "status": "finalized",
    "offerId": "…",
    "assetId": "abc123", "assetName": "CPS-LAI-01 …",
    "provider": "urn:dataspace:participant:ifsc-gaspar:cpslai1",
    "consumer": "urn:dataspace:participant:ifsc-gaspar:acsm",
    "federationId": "…",
    "governancePolicyId": "…",
    "purpose": "controle adaptativo",
    "resources": ["operational", "hcm-episodes"],
    "signedByConsumerAt": "2026-10-31T13:00:00.000Z",
    "signedByProviderAt": "2026-10-31T13:00:00.000Z",
    "validFrom": "2026-10-31T13:00:00.000Z",
    "validUntil": "2026-11-01T13:00:00.000Z"
  },
  "credential": { "id": "…", "status": "active", "expiresAt": "2026-11-01T13:00:00.000Z" },
  "tokens": [
    { "id": "…", "status": "active", "expiresAt": "…", "permissions": ["data", "aas", "operational", "hcm-episodes"],
      "sidecarTokenId": "…", "deliveredToSidecar": true }
  ]
}
```

| `effectiveStatus` | Significado |
|---|---|
| `active` | acordo válido e há token ativo |
| `agreement-valid-no-active-token` | acordo válido, tokens expirados — negocie de novo para outro token |
| `expired` | acordo vencido |
| outro (`rejected`, `revoked`…) | status do acordo |

### 6.7 Trocar a URL do Sidecar — `POST /api/m2m/sidecar-endpoint`

| | |
|---|---|
| **Método** | `POST` |
| **URL** | `https://dataspace-v2.vercel.app/api/m2m/sidecar-endpoint` |
| **Headers** | `Content-Type: application/json`, `X-M2M-Key: <M2M_API_KEY>`, `X-Sidecar-Secret: <segredo da organização>` |

**Body:**

| Campo | Obrigatório | Descrição |
|---|---|---|
| `organization` | sim | a mesma `organization` do register (maiúsculas não importam) |
| `sidecarEndpoint` | sim | nova URL pública do Sidecar |
| `equipmentSlug` | não | limita a atualização a um CPS |

```bash
curl -X POST https://dataspace-v2.vercel.app/api/m2m/sidecar-endpoint \
  -H "Content-Type: application/json" \
  -H "X-M2M-Key: <M2M_API_KEY>" \
  -H "X-Sidecar-Secret: <segredo da organização>" \
  -d '{ "organization": "IFSC-GASPAR", "sidecarEndpoint": "https://nova-url.trycloudflare.com" }'
```

**Resposta (200):**

```json
{
  "ok": true,
  "organization": "IFSC-GASPAR",
  "sidecarEndpoint": "https://nova-url.trycloudflare.com",
  "updated": { "connectors": 3, "federations": 1, "assets": 3, "accessTokens": 2 },
  "equipment": [{ "equipmentSlug": "cpslai1", "assetId": "abc123", "sidecarRegistered": true }],
  "sidecarRegistered": true
}
```

Atualiza conectores, federações, ativos e `accessTokens` ativos da organização e
re-registra cada CPS (com os recursos) no novo Sidecar. Tokens já emitidos
continuam válidos; só as URLs mudam.

| Resposta | Causa |
|---|---|
| `sidecarRegistered: false` | o novo Sidecar não respondeu 2xx: túnel fora do ar ou segredo diferente |
| `400 Required: organization, sidecarEndpoint` / `… valid URL` | body inválido |
| `401 Missing or invalid X-M2M-Key header.` | header ausente ou errado |
| `403 Missing or invalid X-Sidecar-Secret header.` | segredo ausente ou errado |
| `404 Organization "…" has no sidecar secret yet…` | a organização nunca fez o register com segredo |
| `404 No M2M participants found…` | nenhum CPS M2M com essa organização/slug |

> URL fixa evita esse passo: domínio estático gratuito do ngrok
> (`ngrok http --url=<nome>.ngrok-free.app 3100`) ou túnel nomeado do cloudflared.

### 6.8 Resumo do fluxo

| # | Passo | Método | URL | Auth |
|---|---|---|---|---|
| 0 | Sidecar no ar + túnel | — | `cloudflared tunnel --url http://localhost:3100` | segredo da organização no `.env.local` |
| 1 | Registrar CPS (provedor e consumidor) | POST | `https://dataspace-v2.vercel.app/api/m2m/register` | `X-M2M-Key`, `X-Sidecar-Secret` |
| 2 | Descobrir | GET | `https://dataspace-v2.vercel.app/api/m2m/discover?…` | — |
| 3 | Ver oferta e diretrizes | GET | `https://dataspace-v2.vercel.app/api/m2m/offer?assetId=…` | — |
| 4 | Assinar contrato / obter token | POST | `https://dataspace-v2.vercel.app/api/m2m/negotiate` | `X-M2M-Key`, `X-Sidecar-Secret` (consumidor) |
| 5 | Consumir dados | GET | `{sidecarEndpoint}/api/proxy/{slug}/{resourceId}` | `Bearer <token>` |
| 6 | Validar contrato | GET | `https://dataspace-v2.vercel.app/api/m2m/agreement?contractRef=…` | `X-M2M-Key`, `X-Sidecar-Secret` (uma das partes) |
| — | Segredo de organização legada / perdido | POST | `https://dataspace-v2.vercel.app/api/m2m/organization` | `X-M2M-Admin-Key` (admin) |
| — | URL do túnel mudou | POST | `https://dataspace-v2.vercel.app/api/m2m/sidecar-endpoint` | `X-M2M-Key`, `X-Sidecar-Secret` |
| — | Recomeçar do zero | DELETE | `https://dataspace-v2.vercel.app/api/m2m/organization?organization=…` | `X-M2M-Key`, `X-Sidecar-Secret` |

### 6.9 Recomeçar do zero — `DELETE /api/m2m/organization`

Apaga tudo o que a organização registrou via M2M, para refazer os registers do
zero sem depender do administrador.

| Query | Obrigatório | Descrição |
|---|---|---|
| `organization` | sim | a mesma `organization` do register (maiúsculas não importam) |
| `dryRun` | não | `true` só conta o que seria apagado |

Headers: `X-M2M-Key` e `X-Sidecar-Secret` (o segredo da organização).

```bash
# 1) simulação: o que seria apagado
curl -X DELETE "https://dataspace-v2.vercel.app/api/m2m/organization?organization=IFSC-GASPAR&dryRun=true" \
  -H "X-M2M-Key: <M2M_API_KEY>" \
  -H "X-Sidecar-Secret: <segredo da organização>"

# 2) apagar de verdade
curl -X DELETE "https://dataspace-v2.vercel.app/api/m2m/organization?organization=IFSC-GASPAR" \
  -H "X-M2M-Key: <M2M_API_KEY>" \
  -H "X-Sidecar-Secret: <segredo da organização>"
```

Resposta (200):

```json
{
  "ok": true,
  "organization": "IFSC-GASPAR",
  "deleted": { "connectorProfiles": 3, "assets": 3, "federations": 1, "compliance": 1,
               "governance": 3, "contractOffers": 3, "federationMemberships": 4,
               "contractAgreements": 2, "credentialGrants": 2, "accessTokens": 2,
               "m2mOrganizations": 1 },
  "keptShared": { "contractAgreements": 1, "accessTokens": 1 },
  "keptFederations": [],
  "revokedTokens": 3,
  "next": "Clear the Sidecar .data/ folder, then POST /api/m2m/register again: the first register sets a new sidecar secret."
}
```

O que é apagado: conectores, ativos, federações criadas pela organização (com
compliance e adesões de terceiros), governança, ofertas, adesões da organização
a outras federações, conexões, acordos, credenciais, tokens e solicitações entre
CPS da própria organização. Por último, o registro do segredo.

O que fica:

- **contratos com outras organizações** (`keptShared`): são também histórico da
  outra parte. O token ativo é revogado no Sidecar do provedor e marcado
  `revoked` no Dataspace;
- **federação da organização com ativo de outra organização**
  (`keptFederations`): apagar deixaria o ativo alheio órfão;
- documentos criados pela interface web (não M2M).

Depois de apagar, a organização está livre: o próximo register cria um segredo
novo (header `X-Sidecar-Secret` ou gerado). Apague a pasta `.data/` do Sidecar
para limpar o lado local.

| Resposta | Causa |
|---|---|
| `400 Required query param: organization` | falta `?organization=` |
| `401 Missing or invalid X-M2M-Key header.` | header ausente ou errado |
| `403 Missing or invalid X-Sidecar-Secret header.` | segredo ausente ou errado |
| `404 Organization "…" has no sidecar secret…` | organização sem segredo: o admin define antes (`POST /api/m2m/organization`) |

---

## 7. Pontos de atenção

- **`push-token` não confere o contrato.** No fluxo humano, quem gera o token e
  chama `/api/sidecar/push-token` é o navegador do consumidor; a rota só valida o
  `idToken`. Não verifica contrato, dono do ativo nem se o `sidecarUrl` é
  legítimo — qualquer usuário logado pode registrar um token próprio para
  qualquer ativo ou fazer a nuvem chamar uma URL arbitrária. O fluxo M2M não tem
  esse problema (o token é gerado no servidor).
- O Sidecar ignora `aasEndpoint`/`dataEndpoint` enviados no registro e sempre
  usa `{baseUrl}/api/data|aas`.
- `SIDECAR_ADMIN_SECRET` cai em `"admin"` se não estiver definido, nos dois lados.
- **Segredo por organização (M2M):** CPS registrados por M2M usam o segredo do
  Sidecar da organização (cifrado no Firestore com `SIDECAR_SECRETS_KEY`, só na
  Vercel). Se essa chave for perdida ou trocada, os segredos não decifram e as
  rotas M2M dessas organizações respondem 503; a recuperação é apagar o documento
  da organização em `m2mOrganizations` e refazer o register. O fluxo humano
  (`push-token`, `register-equipment`) continua com o segredo global.
- O primeiro register de uma organização **nova** define o segredo dela
  (confiança no primeiro uso). Organizações cujo prefixo de id já é usado (por
  CPS M2M ou por conectores/ativos/federações do fluxo humano) só recebem segredo
  pelo administrador (`/api/m2m/organization`, `M2M_ADMIN_KEY`). Limitação
  conhecida: um usuário da interface pode gravar um `participantId` com o prefixo
  de uma organização e bloquear o claim dela pelo register — o admin resolve
  pela rota acima (o usuário não ganha acesso, pois a identidade M2M exige
  conector criado pelo servidor).
- A identidade M2M é por organização: quem tem o segredo da organização age por
  qualquer `participantId` dela.
- O trecho LAN Sidecar → CPS usa o token fixo `demo`, que os CPS aceitam mesmo
  com `EQUIPMENT_TOKEN` definido; a soberania depende de o CPS não ser acessível
  fora da LAN.
- O mascaramento por `displayHost` existe no Sidecar, mas nenhuma rota da nuvem
  envia esse campo.
