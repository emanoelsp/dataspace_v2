# Atualização do Sidecar e do fluxo M2M — Marcos (ACSM-PPU-LAI)

> **31/10/2026:** as organizações experimentais antigas (`IFSC-GASPAR`,
> `IFSC-GASPAR-2`, `IFSC-GASPAR-v2`, federações IFSC, IFSC2 e ifscv2) foram
> apagadas pelo administrador. O ambiente começa do zero: o primeiro register
> cria a organização e o segredo dela, sem precisar do Emanoel.
>
> **A `M2M_API_KEY` foi trocada em 31/10/2026.** A chave antiga recebe `401`.
> A nova foi enviada pelo Emanoel por canal privado — configure como na Parte B.0.

O Dataspace passou a suportar o que faltava na integração:

1. **5 recursos por CPS** — cada CPS é registrado uma vez, com a lista de
   recursos (`/api/v1/operational`, `/api/v1/cognitive`, …). O contrato escolhe
   quais recursos o cliente pode ler.
2. **Negociação completa** — o `negotiate` grava as mesmas etapas da interface
   (adesão à federação, oferta com diretrizes, conexão, acordo assinado pelas duas
   partes, credencial, token) e devolve `steps`.
3. **Oferta antes de assinar** — `GET /api/m2m/offer` mostra as diretrizes.
4. **API de validação** — `GET /api/m2m/agreement` confirma o que foi contratado.
5. **Segredo por organização** — o Sidecar da IFSC-GASPAR usa um segredo só dela,
   não mais o segredo global do Dataspace.
6. **Troca de URL do túnel numa chamada** — `POST /api/m2m/sidecar-endpoint`.

Referência completa de cada API: `docs/CONTRATO-REST-SIDECAR.md`, seção 6.

---

## Parte A — Atualizar o Sidecar local (prompt para o Codex)

O Sidecar da tua máquina já tem ajustes próprios (faixa de IP etc.), então
**não faça `git pull` por cima**. Cole o prompt abaixo no Codex, aberto na pasta
do teu Sidecar. Ele aplica só a mudança de recursos, preservando os teus ajustes.

````text
Contexto: este projeto é um fork local do Dataspace Sidecar (PEP), Next.js 15,
repositório original https://github.com/emanoelsp/dataspace-sidecar. Este fork
tem ajustes locais (faixa de IP, hosts, etc.) que DEVEM ser preservados.
O upstream ganhou suporte a "recursos" de um CPS no commit f4907c3
("sidecar: proxy per-resource endpoints of a CPS"). Aplique a MESMA mudança aqui,
adaptando aos ajustes locais. Não sobrescreva arquivos inteiros com a versão do
upstream; faça edições pontuais. Se possível, use
`git fetch https://github.com/emanoelsp/dataspace-sidecar.git main` e
`git show f4907c3` como referência.

Objetivo: um CPS pode expor vários recursos de dados na mesma API, cada um num
path (ex.: /api/v1/operational, /api/v1/cognitive, /api/v1/ppu/events,
/api/v1/hcm/episodes, /api/v1/hcm/knowledge). O Dataspace registra esses
recursos no Sidecar e o consumidor chama /api/proxy/{slug}/{resourceId}.

Implemente:

1. Novo módulo src/lib/resource-path.ts (sem imports com alias "@/"):
   - export interface SidecarResource { id: string; name?: string; path: string }
   - export function parseResources(input: unknown): SidecarResource[] | string
     * undefined → []
     * não-array → "resources must be an array"
     * no máximo 32 itens
     * id: /^[a-z0-9][a-z0-9-]{0,47}$/, único, diferente de "data" e "aas"
     * path: começa com "/", não contém ".." nem "://"
     * retorna a mensagem de erro (string) no primeiro item inválido
     * cada item válido vira { id, path, name? } (descarta campos extras)
   - export function upstreamPath(endpoint: string, resources: SidecarResource[] = []): string | null
     * "data" → "/api/data"; "aas" → "/api/aas"
     * senão, o path do recurso com aquele id; null se não existir
   - export function availableEndpoints(resources = []): string[]
     * ["data", "aas", ...ids]

2. src/lib/equipment-store.ts: adicionar `resources?: SidecarResource[]` em
   SidecarEquipment e em RegisterEquipmentInput (import type do novo módulo).
   O upsert existente já guarda o campo.

3. src/lib/equipment-config.ts: adicionar
   export function getEquipmentResources(id: string): SidecarResource[]
   que retorna getEquipment(id)?.resources ?? [].

4. src/app/api/equipment/route.ts (POST): depois das validações atuais, chamar
   parseResources(body.resources); se retornar string → 400 { error }. Gravar com
   registerEquipment({ ...body, resources }).

5. src/app/api/proxy/[...path]/route.ts:
   - trocar a checagem fixa `["data","aas"].includes(endpoint)` por:
       const resources = getEquipmentResources(equipment)
       const targetPath = upstreamPath(endpoint, resources)
       if (!targetPath) → 400 { error: `Invalid endpoint: ${endpoint}`, available: availableEndpoints(resources) }
   - montar o destino como `${equipmentBase}${targetPath}${qs}` (qs = query string original)
   - manter a checagem de permissão do token como está:
       tokenDoc.permissions.includes("all") || tokenDoc.permissions.includes(endpoint)
     (o Dataspace agora coloca os ids dos recursos contratados em permissions)
   - manter o header Authorization enviado ao CPS e todo o resto (logs, CORS,
     headers X-*, webhook) exatamente como no fork.

6. src/app/api/status/route.ts: ao sondar um CPS, se `${baseUrl}/api/data`
   responder 404 e o CPS tiver resources, sondar `${baseUrl}${resources[0].path}`.

7. Testes com o runner nativo (sem dependência nova):
   - src/lib/resource-path.test.ts com node:test cobrindo: data/aas fixos,
     recurso mapeado para o path, endpoint desconhecido → null,
     availableEndpoints, parse válido e os inválidos (id com espaço, "data",
     duplicado, path relativo, "/../etc/passwd", "http://…").
     Importar como "./resource-path.ts".
   - package.json: "test": "node --test src/lib/*.test.ts" (Node 23.6+).
   - tsconfig.json: adicionar "**/*.test.ts" em "exclude" (o build do Next não
     aceita import com extensão .ts).

Critérios de aceite:
- `npm test` passa e `npm run build` compila.
- Com o Sidecar rodando (SIDECAR_ADMIN_SECRET=<segredo>):
  a) POST /api/equipment com Authorization: Bearer <segredo> e
     {"id":"cpslai1","name":"CPS-LAI-01","baseUrl":"http://127.0.0.1:3101",
      "resources":[{"id":"operational","path":"/api/v1/operational"}]}
     → 200, e GET /api/equipment mostra os resources;
  b) resources com path "/../x" → 400;
  c) com um token cujo permissions contém "operational",
     GET /api/proxy/cpslai1/operational?limit=5 chega no CPS em
     /api/v1/operational?limit=5;
  d) GET /api/proxy/cpslai1/cognitive com esse token → 400 se o recurso não está
     registrado, ou 403 "Insufficient permission" se está registrado mas não
     contratado;
  e) /api/proxy/cpslai1/data continua funcionando.

Ao final, liste os arquivos alterados e confirme que os ajustes locais do fork
(faixa de IP, hosts confiáveis etc.) continuam intactos.
````

Depois que o Codex terminar: `npm test`, `npm run build` e reinicie o Sidecar.

---

## Parte B.0 — Chave da API M2M (`M2M_API_KEY`)

Todas as chamadas ao Dataspace (`register`, `negotiate`, `agreement`,
`sidecar-endpoint`, `DELETE`) exigem o header `X-M2M-Key`. A chave é a mesma
para todos os participantes e é enviada pelo Emanoel por canal privado.

Ela **não vai no Sidecar**: vai no programa que chama a API do Dataspace (a
ACSM, os scripts do Codex). Coloque no `.env` desse cliente:

```bash
M2M_API_KEY=<chave enviada pelo Emanoel>
```

e faça o código ler dessa variável para montar o header
`X-M2M-Key: ${M2M_API_KEY}`. Não commite o `.env`. Teste rápido (deve responder
`404`, organização inexistente — `401` significa chave errada):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE \
  "https://dataspace-v2.vercel.app/api/m2m/organization?organization=teste-chave" \
  -H "X-M2M-Key: $M2M_API_KEY"
```

---

## Parte B — Segredo do Sidecar da organização

A partir de agora o Sidecar da IFSC-GASPAR tem **um segredo só dele**. Você
escolhe o valor:

```bash
openssl rand -hex 32
```

1. Coloque no `.env.local` do Sidecar:

   ```bash
   SIDECAR_ADMIN_SECRET=<o valor gerado>
   ```

2. Reinicie o Sidecar (o Next.js só lê o `.env.local` na subida).
3. Envie **o mesmo valor** no header `X-Sidecar-Secret` em todo `register`,
   `sidecar-endpoint`, `negotiate`, `agreement` e no `DELETE` da Parte E. O
   **primeiro register** da organização grava esse valor como o segredo dela —
   não precisa mandar nada ao Emanoel.

Sem o header certo, essas chamadas recebem `403` — ninguém mais consegue
redirecionar os teus CPS nem negociar em nome da IFSC-GASPAR.

> Guarde o valor e não compartilhe. Se perder, o Emanoel reseta como administrador.

---

## Parte C — Registrar os 3 CPS com os 5 recursos

Um register por CPS (não mais um por recurso). Exemplo do CPS-LAI-01 — o
primeiro cria a federação e define o segredo da organização:

```bash
curl -X POST https://dataspace-v2.vercel.app/api/m2m/register \
  -H "Content-Type: application/json" \
  -H "X-M2M-Key: <M2M_API_KEY>" \
  -H "X-Sidecar-Secret: <segredo da Parte B>" \
  -d '{
    "name": "CPS-LAI-01 - Distribution/Conveyor Station",
    "baseUrl": "http://127.0.0.1:3101",
    "sidecarEndpoint": "https://<tunel>.trycloudflare.com",
    "organization": "IFSC-GASPAR",
    "equipmentSlug": "cpslai1",
    "assetType": "Conveyor",
    "eclassIrdi": "0173-1#01-...",
    "capabilities": ["operational", "cognitive", "ppu-events", "hcm-episodes", "hcm-knowledge"],
    "federation": { "create": { "name": "IFSC", "type": "Open" } },
    "governance": { "accessTokenTtlMinutes": 30, "requiresManualApproval": false, "purposeBinding": false },
    "resources": [
      { "id": "operational",   "name": "Operational Data",    "path": "/api/v1/operational" },
      { "id": "cognitive",     "name": "Cognitive Knowledge", "path": "/api/v1/cognitive" },
      { "id": "ppu-events",    "name": "Lifecycle Events",    "path": "/api/v1/ppu/events" },
      { "id": "hcm-episodes",  "name": "HCM Episodes",        "path": "/api/v1/hcm/episodes" },
      { "id": "hcm-knowledge", "name": "HCM Knowledge",       "path": "/api/v1/hcm/knowledge" }
    ]
  }'
```

- **Só o primeiro CPS cria a federação** (`create`). A federação IFSC antiga foi
  apagada: `joinByName` no primeiro register volta `404 Federation not found`.
- CPS-LAI-02: `"equipmentSlug": "cpslai2"`, `"baseUrl": "http://127.0.0.1:3102"`,
  `"federation": { "joinByName": "IFSC" }`.
- CPS-LAI-03: `"equipmentSlug": "cpslai3"`, `"baseUrl": "http://127.0.0.1:3103"`,
  `"federation": { "joinByName": "IFSC" }`.
- `assetType`, `eclassIrdi` e `capabilities` vão explícitos: com `baseUrl` em
  `127.0.0.1` a Vercel não lê o AAS do CPS, e sem `capabilities` a descoberta por
  `?capability=` não encontra o CPS (só `?q=` por nome/recurso).
- **Mantenha `requiresManualApproval: false`** — em M2M não há usuário logado
  para aprovar pedidos pendentes.

Esperado na resposta: `"sidecarRegistered": true`, `contractOfferId` e
`resourceUrls` com as 5 URLs. Conferir no Sidecar:

```bash
curl https://<tunel>.trycloudflare.com/api/equipment   # cada CPS com "resources"
```

Registre também a **ACSM como consumidora**, para ter um `participantId`
(ex.: `"equipmentSlug": "acsm"`, sem `resources` se ela não expõe dados,
`"federation": { "joinByName": "IFSC" }`). Na mesma organização, ela usa o mesmo
segredo.

### C.1 Ajustes na tela "Data Publication" da ACSM

Revisão da tela de publicação (31/10/2026). O fluxo `resources[]` está certo;
para o register funcionar:

1. **Federation Registration:** no `cpslai1`, *criar* a federação IFSC
   (`create`). "Join existing federation by name" só nos CPS seguintes e na ACSM.
2. **Sidecar HTTPS Endpoint:** preencher com a URL atual do cloudflared (não o
   placeholder `https://your-sidecar.example`). Sem ela, `sidecarRegistered: false`.
3. **Recursos:** marcar os 5. Sem recurso o CPS fica só com `/data` e `/aas`, que
   o CPS não expõe (ele usa `/api/v1/...`) — a leitura daria 404.
4. **Segredo da organização:** o valor guardado no backend da ACSM tem que ser
   **idêntico** ao `SIDECAR_ADMIN_SECRET` do `.env.local` do Sidecar (Parte B).
   Diferente: o register passa, mas o Sidecar recusa o CPS e os tokens.
5. **Incluir `assetType`, `eclassIrdi` e `capabilities`** no formulário (ou fixos
   no JSON gerado), pelo motivo acima.
6. **"ACSM Administrative Credential":** se for o login da própria ACSM, ok. A
   chave de administrador do Dataspace **não** é usada no register — ele só
   precisa de `X-M2M-Key` (Parte B.0) e `X-Sidecar-Secret` (Parte B).
7. **Não usar "Provider Registration — Legacy identity flow"** (um ativo por
   recurso, fluxo antigo).

Campos de status da tela × resposta do register:

| Tela | Resposta |
|---|---|
| Organization Identity | `participantId` |
| Registered in Catalog / Federated Asset ID | `assetId` |
| Resources Effectively Published | `resources` |
| Sidecar Registered | `sidecarRegistered` |
| Contract Offer ID | `contractOfferId` |
| Organization Secret | ok se o register volta 200; `403` = segredo errado |


---

## Parte D — Fluxo da ACSM: descobrir → oferta → contrato → dados → validação

**1. Descobrir**

```bash
curl "https://dataspace-v2.vercel.app/api/m2m/discover?slug=cpslai1"
```

Cada resultado traz `assetId` e `resources[]` (id, nome e URL no Sidecar).

**2. Ver a oferta e as diretrizes (o que será assinado)**

```bash
curl "https://dataspace-v2.vercel.app/api/m2m/offer?assetId=<assetId>"
```

`directives`: finalidade obrigatória?, aprovação manual?, validade do acordo
(`validForHours`), validade do token (`accessTokenTtlMinutes`), revogação,
condições e recursos. É isso que a tela da ACSM deve mostrar antes de assinar.

**3. Assinar o contrato (escolhendo os recursos)**

```bash
curl -X POST https://dataspace-v2.vercel.app/api/m2m/negotiate \
  -H "Content-Type: application/json" \
  -H "X-M2M-Key: <M2M_API_KEY>" \
  -H "X-Sidecar-Secret: <segredo da Parte B>" \
  -d '{
    "consumerParticipantId": "urn:dataspace:participant:ifsc-gaspar:acsm",
    "consumerName": "acsm",
    "targetAssetId": "<assetId>",
    "purpose": "controle adaptativo",
    "resources": ["operational", "hcm-episodes"]
  }'
```

Sem `resources`, o contrato cobre todos. A resposta traz `token`,
`resourceUrls` (só os contratados), `contractRef`, `agreementValidUntil` e
`steps` — as 6 etapas do contrato, que a ACSM pode exibir como progresso.

**4. Ler os dados (direto no Sidecar)**

```bash
curl "https://<tunel>.trycloudflare.com/api/proxy/cpslai1/operational" \
  -H "Authorization: Bearer <token>"
```

Recurso não contratado → `403 Insufficient permission`. Token expirado →
`401 Token expired` (negocie de novo).

**5. Validar o contrato**

```bash
curl "https://dataspace-v2.vercel.app/api/m2m/agreement?contractRef=<contractRef>" \
  -H "X-M2M-Key: <M2M_API_KEY>" \
  -H "X-Sidecar-Secret: <segredo da Parte B>"
```

`effectiveStatus` = `active` | `agreement-valid-no-active-token` | `expired`,
com assinaturas, validade, recursos liberados, credencial e tokens (sem o valor).

**Quando o túnel mudar de URL**

```bash
curl -X POST https://dataspace-v2.vercel.app/api/m2m/sidecar-endpoint \
  -H "Content-Type: application/json" \
  -H "X-M2M-Key: <M2M_API_KEY>" \
  -H "X-Sidecar-Secret: <segredo da Parte B>" \
  -d '{ "organization": "IFSC-GASPAR", "sidecarEndpoint": "https://<novo-tunel>.trycloudflare.com" }'
```

Atualiza os 3 CPS de uma vez; tokens já emitidos continuam válidos.

---

## Parte E — Recomeçar do zero (apagar tudo)

Para remover tudo o que a IFSC-GASPAR registrou (CPS, federações, contratos,
tokens) e refazer as Partes C e D do zero, quando quiser. Só precisa do
segredo da organização (o mesmo do `.env.local`, Parte B) — sem chave de admin.

```bash
# 1) simulação: lista quantos documentos seriam apagados, sem apagar
curl -X DELETE "https://dataspace-v2.vercel.app/api/m2m/organization?organization=IFSC-GASPAR&dryRun=true" \
  -H "X-M2M-Key: <M2M_API_KEY>" \
  -H "X-Sidecar-Secret: <segredo da organização>"

# 2) apagar
curl -X DELETE "https://dataspace-v2.vercel.app/api/m2m/organization?organization=IFSC-GASPAR" \
  -H "X-M2M-Key: <M2M_API_KEY>" \
  -H "X-Sidecar-Secret: <segredo da organização>"
```

Depois:

1. Pare o Sidecar, apague a pasta `.data/` dele e suba de novo.
2. O registro do segredo também foi apagado: no primeiro register da Parte C,
   mande no `X-Sidecar-Secret` o segredo que está no `.env.local` (pode ser o
   mesmo de antes) — ele vira o segredo da organização outra vez.
3. Refaça a Parte C (3 CPS com os 5 recursos) e a Parte D.

Contratos feitos com CPS de **outras** organizações não são apagados (são
histórico da outra parte); os tokens deles são revogados.

---

## Checklist

- [ ] `M2M_API_KEY` nova no `.env` do cliente (ACSM/scripts); teste da Parte B.0 responde `404`
- [ ] (se for recomeçar) Parte E: dryRun conferido, DELETE feito, `.data/` do Sidecar apagada
- [ ] Parte A aplicada pelo Codex; `npm test` e `npm run build` passam; Sidecar reiniciado
- [ ] `.env.local` com o segredo da organização; Sidecar reiniciado (Parte B)
- [ ] tela de publicação ajustada (Parte C.1): federação criada no 1º CPS, URL do túnel, 5 recursos, segredo igual ao do Sidecar
- [ ] 3 CPS registrados com `resources` e `sidecarRegistered: true` (Parte C)
- [ ] ACSM registrada como consumidora
- [ ] discover → offer → negotiate → leitura de um recurso → agreement (Parte D)
