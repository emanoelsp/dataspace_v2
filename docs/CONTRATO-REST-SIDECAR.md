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
| GET | `/api/proxy/{slug}/{data\|aas}[?qs]` | `Bearer <token do contrato>` | consumo P2P |
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
| POST | https://dataspace-v2.vercel.app/api/m2m/register | auto-registro do CPS (conector, federação, ativo, governança e registro no Sidecar) |
| GET | https://dataspace-v2.vercel.app/api/m2m/discover | descoberta por `?capability=&slug=&equipmentType=&q=` |
| POST | https://dataspace-v2.vercel.app/api/m2m/negotiate | negocia o contrato, gera o token e envia ao Sidecar |
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
`{sidecarEndpoint}/api/proxy/{slug}/data`, com o token do contrato.

---

## 6. Passo a passo M2M — do primeiro CPS ao consumo dos dados

Fluxo completo para quem tem CPS físicos e quer usar o Dataspace só por API:
**preparar → registrar → descobrir → assinar contrato → consumir**.

Nos exemplos: CPS em `http://192.168.1.50:8080`, túnel do Sidecar em
`https://xxxx.trycloudflare.com`, organização `lab-marcos`.

### 6.0 Preparar (uma vez)

**Segredos** — os valores ficam nas variáveis de ambiente da Vercel (projeto
`dataspaceapp`) e são passados ao operador do Sidecar por canal privado:

| Variável | Onde | Para quê | Obrigatória |
|---|---|---|---|
| `SIDECAR_ADMIN_SECRET` | `.env.local` do Sidecar | a nuvem registra CPS e empurra tokens no Sidecar; **igual ao da Vercel** | sim |
| `M2M_API_KEY` | header `X-M2M-Key` nas chamadas | protege `register` e `negotiate` | sim (está definida em produção) |
| `DATASPACE_WEBHOOK_URL` / `DATASPACE_WEBHOOK_SECRET` | `.env.local` do Sidecar | acessos aparecem no painel do Dataspace; o secret é o mesmo `SIDECAR_ADMIN_SECRET` | não |

```bash
# .env.local do Sidecar
SIDECAR_ADMIN_SECRET=<valor da Vercel>
DATASPACE_WEBHOOK_URL=https://dataspace-v2.vercel.app/api/sidecar/events
DATASPACE_WEBHOOK_SECRET=<valor da Vercel>
```

**Subir o Sidecar e expor:**

```bash
cd dataspace-sidecar
npm install && npm run dev                      # http://localhost:3100
cloudflared tunnel --url http://localhost:3100  # → https://xxxx.trycloudflare.com
```

A Vercel não alcança a LAN: a URL do túnel é o `sidecarEndpoint`. Se o túnel
reiniciar, a URL muda e é preciso repetir o registro (6.1).

**Contrato que o CPS físico precisa cumprir** (o Sidecar chama exatamente isso):

| Método | Rota no CPS | Header enviado pelo Sidecar | Resposta |
|---|---|---|---|
| GET | `{baseUrl}/api/data` | `Authorization: Bearer demo` | JSON; idealmente `{ equipmentType, eclassIrdi, timestamp, metrics: {…} }` |
| GET | `{baseUrl}/api/aas[?submodel=…]` | `Authorization: Bearer demo` | JSON (AAS Environment) |

Se o CPS fala outro protocolo (OPC UA, MQTT, Modbus) ou outras rotas, é preciso
um adaptador HTTP na frente dele. Teste da máquina do Sidecar:

```bash
curl http://192.168.1.50:8080/api/data -H "Authorization: Bearer demo"
```

### 6.1 Registrar o CPS — `POST /api/m2m/register`

| | |
|---|---|
| **Método** | `POST` |
| **URL** | `https://dataspace-v2.vercel.app/api/m2m/register` |
| **Headers** | `Content-Type: application/json`, `X-M2M-Key: <M2M_API_KEY>` |

**Body:**

| Campo | Obrigatório | Descrição |
|---|---|---|
| `name` | sim | nome legível do CPS |
| `baseUrl` | sim | URL do CPS na LAN (sem `/api/data`) |
| `sidecarEndpoint` | sim | URL pública do túnel do Sidecar |
| `organization` | não (padrão `plant1`) | use o nome da sua organização |
| `equipmentSlug` | não (padrão: slug do `name`) | **único no Dataspace inteiro**, ex.: `marcos-cnc01` |
| `assetType` | recomendado | tipo do CPS (`CNC`, `Robot`, …) |
| `eclassIrdi` | recomendado | classe ECLASS |
| `capabilities` | recomendado | chaves de métrica; usadas na descoberta por capacidade |
| `description` | não | texto livre (entra na busca) |
| `federation` | não | `{ "create": { "name", "type": "Open"\|"Consortium"\|"Private" } }` \| `{ "join": "<id>" }` \| `{ "joinByName": "<nome>" }` |
| `governance` | não | `{ accessTokenTtlMinutes (padrão 30), requiresManualApproval, purposeBinding, revocationMode }` |

> `assetType`, `eclassIrdi` e `capabilities` devem ir explícitos: a colheita
> automática roda na Vercel e tenta ler o `baseUrl` da LAN, que ela não alcança.

**Exemplo — primeiro CPS (cria a federação):**

```bash
curl -X POST https://dataspace-v2.vercel.app/api/m2m/register \
  -H "Content-Type: application/json" \
  -H "X-M2M-Key: <M2M_API_KEY>" \
  -d '{
    "name": "Bancada CNC Marcos",
    "baseUrl": "http://192.168.1.50:8080",
    "sidecarEndpoint": "https://xxxx.trycloudflare.com",
    "organization": "lab-marcos",
    "equipmentSlug": "marcos-cnc01",
    "assetType": "CNC",
    "eclassIrdi": "0173-1#01-ACJ843#001",
    "capabilities": ["spindleSpeed_rpm", "temperature_C"],
    "description": "CPS físico da bancada do Marcos",
    "federation": { "create": { "name": "lab-marcos — Controle", "type": "Open" } },
    "governance": { "accessTokenTtlMinutes": 30, "requiresManualApproval": false }
  }'
```

**CPS seguintes (entram na mesma federação):**

```json
"federation": { "joinByName": "lab-marcos — Controle" }
```

**Resposta (200):**

```json
{
  "ok": true,
  "participantId": "urn:dataspace:participant:lab-marcos:marcos-cnc01",
  "connectorId": "…",
  "federation": { "id": "…", "name": "lab-marcos — Controle", "created": true, "admissionMode": "self-service" },
  "complianceId": "…",
  "assetId": "abc123",
  "equipmentSlug": "marcos-cnc01",
  "governanceId": "…",
  "capabilities": ["spindleSpeed_rpm", "temperature_C"],
  "sidecarRegistered": true,
  "dataUrl": "https://xxxx.trycloudflare.com/api/proxy/marcos-cnc01/data"
}
```

O que acontece: a nuvem cria/atualiza conector → federação → compliance →
ativo no catálogo → governança e chama `POST {sidecarEndpoint}/api/equipment`.
É idempotente por `organization` + `equipmentSlug` (repetir o POST só atualiza).

| Resposta | Causa |
|---|---|
| `sidecarRegistered: false` | nuvem não alcançou o Sidecar: túnel caído ou `SIDECAR_ADMIN_SECRET` diferente |
| `400 Required: name, baseUrl, sidecarEndpoint` | campo obrigatório ausente |
| `400 … must be valid URLs` | `baseUrl`/`sidecarEndpoint` inválidos |
| `401 Missing or invalid X-M2M-Key header.` | header ausente ou errado |
| `404 Federation not found…` | `join`/`joinByName` não existe |

**Conferir no Sidecar:**

```bash
curl https://xxxx.trycloudflare.com/api/equipment
curl https://xxxx.trycloudflare.com/api/status
```

> O consumidor também precisa de identidade: registre-o do mesmo jeito
> (ex.: `equipmentSlug: "marcos-robo01"`) e use o `participantId` devolvido.

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
| `slug` | `?slug=marcos-cnc01` | slug exato |
| `capability` | `?capability=temperature` | capacidades, semânticas, chaves de métrica |
| `equipmentType` | `?equipmentType=CNC` | `assetType` (contém) |
| `federationId` | `?federationId=<id>` | uma federação |
| `q` | `?q=bancada` | texto livre (nome, descrição, IRDI, capacidades) |
| `exclude` | `?exclude=marcos-robo01` | ignora slug ou participantId informado |
| `status` | `?status=any` | padrão `available` |
| `limit` | `?limit=10` | padrão 50, máx. 200 |

**Exemplos:**

```bash
curl "https://dataspace-v2.vercel.app/api/m2m/discover?slug=marcos-cnc01"
curl "https://dataspace-v2.vercel.app/api/m2m/discover?capability=spindleSpeed&exclude=marcos-robo01"
curl "https://dataspace-v2.vercel.app/api/m2m/discover?federationId=<id>"
```

**Resposta (200):**

```json
{
  "count": 1,
  "query": { "capability": "", "equipmentType": "", "slug": "marcos-cnc01", "federationId": "", "q": "", "status": "available" },
  "results": [{
    "assetId": "abc123",
    "name": "Bancada CNC Marcos",
    "equipmentSlug": "marcos-cnc01",
    "equipmentType": "CNC",
    "description": "CPS físico da bancada do Marcos",
    "capabilities": ["spindleSpeed_rpm", "temperature_C"],
    "irdi": "0173-1#01-ACJ843#001",
    "aasId": "",
    "status": "available",
    "federation": { "id": "…", "name": "lab-marcos — Controle", "admissionMode": "self-service" },
    "owner": "urn:dataspace:participant:lab-marcos:marcos-cnc01",
    "sidecarEndpoint": "https://xxxx.trycloudflare.com",
    "dataUrl": "https://xxxx.trycloudflare.com/api/proxy/marcos-cnc01/data"
  }]
}
```

Guarde o **`assetId`** para a negociação. O `dataUrl` só responde com token.

> Federação `Consortium` fica oculta na descoberta aberta — só aparece com
> `?federationId=<id>`.

### 6.3 Assinar o contrato — `POST /api/m2m/negotiate`

| | |
|---|---|
| **Método** | `POST` |
| **URL** | `https://dataspace-v2.vercel.app/api/m2m/negotiate` |
| **Headers** | `Content-Type: application/json`, `X-M2M-Key: <M2M_API_KEY>` |

**Body:**

| Campo | Obrigatório | Descrição |
|---|---|---|
| `consumerParticipantId` | sim | `participantId` do consumidor (do register dele) |
| `targetAssetId` ou `targetSlug` | um dos dois | prefira `targetAssetId` (o slug pega o primeiro ativo com aquele nome) |
| `consumerName` | não | nome legível nos logs |
| `purpose` | se a governança tiver `purposeBinding: true` | finalidade do uso |

**Exemplo:**

```bash
curl -X POST https://dataspace-v2.vercel.app/api/m2m/negotiate \
  -H "Content-Type: application/json" \
  -H "X-M2M-Key: <M2M_API_KEY>" \
  -d '{
    "consumerParticipantId": "urn:dataspace:participant:lab-marcos:marcos-robo01",
    "consumerName": "marcos-robo01",
    "targetAssetId": "abc123",
    "purpose": "controle adaptativo da bancada"
  }'
```

**Resposta — concedido (200):**

```json
{
  "status": "granted",
  "token": "dsp_m2m_9f3c…",
  "tokenType": "Bearer",
  "dataUrl": "https://xxxx.trycloudflare.com/api/proxy/marcos-cnc01/data",
  "aasUrl": "https://xxxx.trycloudflare.com/api/proxy/marcos-cnc01/aas",
  "sidecarEndpoint": "https://xxxx.trycloudflare.com",
  "equipmentSlug": "marcos-cnc01",
  "expiresAt": "2026-10-29T13:30:00.000Z",
  "contractRef": "<contractAgreements id>",
  "sidecarTokenId": "<id do token no Sidecar>",
  "governance": {
    "policyId": "…",
    "accessTokenTtlMinutes": 30,
    "purposeBinding": false,
    "requiresManualApproval": false,
    "revocationMode": "ttl-expiry",
    "conditions": "controle adaptativo da bancada"
  },
  "usage": "GET {dataUrl}  Authorization: Bearer {token}"
}
```

O que acontece: a nuvem grava o `contractAgreements` (status `finalized`), gera o
token com o TTL da governança, empurra ao Sidecar do dono (`POST /api/tokens`) e
registra em `accessTokens`.

| Resposta | Causa |
|---|---|
| `sidecarTokenId: null` | o token não chegou ao Sidecar (túnel ou `SIDECAR_ADMIN_SECRET`); o consumo dará `401 Token not found` |
| `202 { status: "pending", requestId }` | governança com `requiresManualApproval: true` (ver aviso abaixo) |
| `400 Required: consumerParticipantId and (targetAssetId or targetSlug)` | body incompleto |
| `404 Target asset not found` | `assetId`/slug inexistente |
| `409 Target asset has no equipmentSlug/sidecarEndpoint` | ativo sem Sidecar configurado |
| `422 This asset requires 'purpose'` | `purposeBinding` ativo e `purpose` vazio |

> **Não use aprovação manual em CPS registrado por M2M.** Só um usuário logado
> cujo `uid` seja o dono do ativo pode aprovar
> (`lib/access-request-decisions-admin.ts:62`), e o dono M2M é um
> `participantId` (`urn:dataspace:participant:…`). O pedido fica pendente para
> sempre. Mantenha `requiresManualApproval: false` no register.

### 6.4 Consumir os dados — Sidecar `GET /api/proxy/{slug}/{data|aas}`

| | |
|---|---|
| **Método** | `GET` |
| **URL** | `{sidecarEndpoint}/api/proxy/{slug}/data` ou `/aas[?submodel=Nameplate\|TechnicalData\|OperationalData]` |
| **Headers** | `Authorization: Bearer <token do negotiate>` |

Os dados vão direto do Sidecar ao consumidor — não passam pela Vercel.

**Exemplos:**

```bash
curl https://xxxx.trycloudflare.com/api/proxy/marcos-cnc01/data \
  -H "Authorization: Bearer dsp_m2m_9f3c…"

curl "https://xxxx.trycloudflare.com/api/proxy/marcos-cnc01/aas?submodel=OperationalData" \
  -H "Authorization: Bearer dsp_m2m_9f3c…"
```

**Resposta (200):** o JSON do próprio CPS, com headers de rastreabilidade:

```
X-Sidecar-Proxy: true
X-Token-Id: <id do token no Sidecar>
X-Contract-Ref: <contractAgreements id>
X-Data-Owner: urn:dataspace:participant:lab-marcos:marcos-cnc01
X-Data-Client: urn:dataspace:participant:lab-marcos:marcos-robo01
X-Federation-Id: <id>
X-Governance-Policy: <policyId>
X-Response-Time-Ms: 42
Cache-Control: no-store
```

| Resposta | Causa |
|---|---|
| `400 Invalid endpoint` | endpoint diferente de `data`/`aas` |
| `401 Token required` | faltou `Authorization` |
| `401 Token not found` | o token não chegou ao Sidecar |
| `401 Token expired` | passou o TTL — negocie de novo |
| `403 Token revoked` | token revogado |
| `403 Token not authorized for this equipment` | token de outro slug |
| `403 Insufficient permission` | token sem permissão para o endpoint |
| `404 Unknown equipment` | slug não registrado ou desabilitado no Sidecar |
| `503 Equipment unreachable` | Sidecar não alcançou o `baseUrl` do CPS na LAN |

**Renovação:** o token vale até `expiresAt` (padrão 30 min). Para consumo
contínuo, chame o `negotiate` de novo antes de expirar e troque o token.

### 6.5 Trocar a URL do Sidecar — `POST /api/m2m/sidecar-endpoint`

Túneis efêmeros (`cloudflared tunnel --url …` sem conta) geram uma URL nova a
cada reinício. Em vez de repetir o register de cada CPS/recurso, uma chamada
atualiza todos os CPS M2M da organização.

| | |
|---|---|
| **Método** | `POST` |
| **URL** | `https://dataspace-v2.vercel.app/api/m2m/sidecar-endpoint` |
| **Headers** | `Content-Type: application/json`, `X-M2M-Key: <M2M_API_KEY>` |

**Body:**

| Campo | Obrigatório | Descrição |
|---|---|---|
| `organization` | sim | a mesma `organization` usada no register (maiúsculas não importam) |
| `sidecarEndpoint` | sim | nova URL pública do Sidecar |
| `equipmentSlug` | não | limita a atualização a um CPS |

**Exemplo:**

```bash
curl -X POST https://dataspace-v2.vercel.app/api/m2m/sidecar-endpoint \
  -H "Content-Type: application/json" \
  -H "X-M2M-Key: <M2M_API_KEY>" \
  -d '{ "organization": "lab-marcos", "sidecarEndpoint": "https://nova-url.trycloudflare.com" }'
```

**Resposta (200):**

```json
{
  "ok": true,
  "organization": "lab-marcos",
  "sidecarEndpoint": "https://nova-url.trycloudflare.com",
  "updated": { "connectors": 3, "federations": 1, "assets": 3, "accessTokens": 2 },
  "equipment": [
    { "equipmentSlug": "marcos-cnc01", "assetId": "abc123", "sidecarRegistered": true }
  ],
  "sidecarRegistered": true
}
```

O que acontece: atualiza `sidecarEndpoint` em conectores, federações, ativos e
`accessTokens` ativos de cada participante `urn:dataspace:participant:{organization}:*`
e chama `POST {novo sidecar}/api/equipment` para cada CPS (com o `baseUrl` do
register). Tokens já emitidos continuam valendo: ficam no `.data/` do Sidecar;
só o `dataUrl` passa a usar a URL nova.

| Resposta | Causa |
|---|---|
| `sidecarRegistered: false` (geral ou por CPS) | o novo Sidecar não respondeu 2xx: túnel fora do ar ou `SIDECAR_ADMIN_SECRET` diferente |
| `400 Required: organization, sidecarEndpoint` | campo ausente |
| `400 sidecarEndpoint must be a valid URL` | URL inválida |
| `401 Missing or invalid X-M2M-Key header.` | header ausente ou errado |
| `404 No M2M participants found…` | nenhum CPS registrado por M2M com essa organização/slug |

> URL fixa evita esse passo: domínio estático gratuito do ngrok
> (`ngrok http --url=<nome>.ngrok-free.app 3100`) ou túnel nomeado do
> cloudflared (exige domínio na Cloudflare).

### 6.6 Resumo do fluxo

| # | Passo | Método | URL | Auth |
|---|---|---|---|---|
| 0 | Sidecar no ar + túnel | — | `cloudflared tunnel --url http://localhost:3100` | `SIDECAR_ADMIN_SECRET` no `.env.local` |
| 1 | Registrar CPS (provedor e consumidor) | POST | `https://dataspace-v2.vercel.app/api/m2m/register` | `X-M2M-Key` |
| 2 | Descobrir | GET | `https://dataspace-v2.vercel.app/api/m2m/discover?…` | — |
| 3 | Assinar contrato / obter token | POST | `https://dataspace-v2.vercel.app/api/m2m/negotiate` | `X-M2M-Key` |
| 4 | Consumir dados | GET | `{sidecarEndpoint}/api/proxy/{slug}/data` | `Bearer <token>` |
| — | URL do túnel mudou | POST | `https://dataspace-v2.vercel.app/api/m2m/sidecar-endpoint` | `X-M2M-Key` |

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
- O trecho LAN Sidecar → CPS usa o token fixo `demo`, que os CPS aceitam mesmo
  com `EQUIPMENT_TOKEN` definido; a soberania depende de o CPS não ser acessível
  fora da LAN.
- O mascaramento por `displayHost` existe no Sidecar, mas nenhuma rota da nuvem
  envia esse campo.
