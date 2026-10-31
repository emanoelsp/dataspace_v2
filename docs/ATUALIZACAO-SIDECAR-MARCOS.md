# Atualização do Sidecar e do fluxo M2M — Marcos (ACSM-PPU-LAI)

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

## Parte B — Segredo do Sidecar da organização

A partir de agora o Sidecar da IFSC-GASPAR tem **um segredo só dele**. Você
escolhe o valor:

```bash
openssl rand -hex 32
```

1. **Mande o valor ao Emanoel por canal privado.** A IFSC-GASPAR já tem CPS
   cadastrados, então o register não deixa ninguém "assumir" a organização: o
   Emanoel cadastra o teu segredo como administrador
   (`POST /api/m2m/organization`). Espere a confirmação dele.
2. Coloque no `.env.local` do Sidecar:

   ```bash
   SIDECAR_ADMIN_SECRET=<o valor gerado>
   ```

3. Reinicie o Sidecar (o Next.js só lê o `.env.local` na subida).
4. Envie **o mesmo valor** no header `X-Sidecar-Secret` em todo `register`,
   `sidecar-endpoint`, `negotiate` e `agreement`.

Sem o header certo, essas chamadas recebem `403` — ninguém mais consegue
redirecionar os teus CPS nem negociar em nome da IFSC-GASPAR.

> Guarde o valor. Se perder, o Emanoel reseta pela mesma rota de administrador.

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
    "federation": { "joinByName": "ifsc" },
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

- Se a federação `ifsc` ainda não existir, troque por
  `"federation": { "create": { "name": "ifsc", "type": "Open" } }`.
- CPS-LAI-02: `"equipmentSlug": "cpslai2"`, `"baseUrl": "http://127.0.0.1:3102"`.
- CPS-LAI-03: `"equipmentSlug": "cpslai3"`, `"baseUrl": "http://127.0.0.1:3103"`.
- **Mantenha `requiresManualApproval: false`** — em M2M não há usuário logado
  para aprovar pedidos pendentes.

Esperado na resposta: `"sidecarRegistered": true`, `contractOfferId` e
`resourceUrls` com as 5 URLs. Conferir no Sidecar:

```bash
curl https://<tunel>.trycloudflare.com/api/equipment   # cada CPS com "resources"
```

Registre também a **ACSM como consumidora**, para ter um `participantId`
(ex.: `"equipmentSlug": "acsm"`, sem `resources` se ela não expõe dados). Na
mesma organização, ela usa o mesmo segredo.

> Os ativos antigos (um por recurso) continuam no catálogo; podem ser ignorados.
> O Emanoel remove depois.

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

## Checklist

- [ ] Parte A aplicada pelo Codex; `npm test` e `npm run build` passam; Sidecar reiniciado
- [ ] segredo enviado ao Emanoel e cadastrado por ele (Parte B)
- [ ] `.env.local` com o segredo da organização; Sidecar reiniciado (Parte B)
- [ ] 3 CPS registrados com `resources` e `sidecarRegistered: true` (Parte C)
- [ ] ACSM registrada como consumidora
- [ ] discover → offer → negotiate → leitura de um recurso → agreement (Parte D)
