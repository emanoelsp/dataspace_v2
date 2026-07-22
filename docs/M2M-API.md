# API M2M do Dataspace — contrato para a arquitetura de controle (Marcos)

> A arquitetura de controle plug-and-play do Marcos **usa** este protótipo: ela é
> o plano de controle dos CPS (agentes); o Dataspace é a infraestrutura de
> descoberta, governança e troca soberana. **O ciclo de vida (plug/play/unplug/
> failover) é da arquitetura de controle**; o Dataspace oferece as primitivas
> (registro, descoberta, negociação, consumo via PEP) e a **observabilidade**.
>
> Endpoints **abertos** (sem login Firebase). Confiança forte (DAPS/SSI) é o
> roadmap declarado; nesta PoC a identidade é o `participantId` determinístico
> atribuído no registro. Não faz parte da dissertação — só do protótipo.

## Fluxo

```
register → discover → negotiate → consume (Sidecar PEP) → monitor
```

## Endpoints

Base do Dataspace: `http://<dataspace-host>:3000`

### `GET /api/m2m` — saúde + índice das interfaces
Ponto de entrada auto-documentado. `?sidecar=<url>` também checa um Sidecar PEP.
```bash
curl http://localhost:3000/api/m2m
curl "http://localhost:3000/api/m2m?sidecar=http://192.168.0.10:3100"
```

### `POST /api/m2m/register` — auto-registro
Cria/atualiza conector + federação (cria ou entra) + compliance (se criou) +
asset no catálogo (com **capacidades colhidas** do próprio CPS) + governança +
registro no Sidecar. **Idempotente** por `organization`+`slug` (re-registrar é seguro).
```bash
curl -X POST http://localhost:3000/api/m2m/register -H "Content-Type: application/json" -d '{
  "name": "Heat Treatment Furnace",
  "baseUrl": "http://192.168.0.21:3004",
  "sidecarEndpoint": "http://192.168.0.21:3100",
  "organization": "plant1",
  "equipmentSlug": "oven",
  "federation": { "create": { "name": "plant1 — Utilities", "type": "Open" } },
  "governance": { "accessTokenTtlMinutes": 15, "requiresManualApproval": false }
}'
```
Federação alternativa: `"federation": { "join": "<federationId>" }` ou `{ "joinByName": "plant1 — Utilities" }`.
Tipos: `Open` (assina e consome), `Consortium` (só convite), `Private` (solicitação+aprovação).
Retorna `participantId`, `assetId`, `federation.admissionMode`, `dataUrl`.

### `GET /api/m2m/discover` — UDDI (só metadados)
```bash
curl "http://localhost:3000/api/m2m/discover?capability=temperature&exclude=cnc"
curl "http://localhost:3000/api/m2m/discover?equipmentType=Furnace"
curl "http://localhost:3000/api/m2m/discover?slug=oven"
```
Retorna candidatos com `assetId`, `capabilities`, `federation.admissionMode`,
`sidecarEndpoint`, `dataUrl` (o `dataUrl` só funciona depois de negociar).

### `POST /api/m2m/negotiate` — contrato → token
```bash
curl -X POST http://localhost:3000/api/m2m/negotiate -H "Content-Type: application/json" -d '{
  "consumerParticipantId": "urn:dataspace:participant:plant1:cnc",
  "consumerName": "cnc",
  "targetAssetId": "<id do discover>",
  "purpose": "compensação térmica"
}'
```
- Governança auto-concede → `{ "status":"granted", "token", "dataUrl", "expiresAt", "governance" }`.
- Governança exige aprovação → `{ "status":"pending", "requestId" }` (o dono aprova pela UI).
- `purposeBinding` na política → `purpose` é obrigatório.

### `GET {dataUrl}` — consumo P2P (fora do Dataspace, no Sidecar PEP)
```bash
curl http://192.168.0.21:3100/api/proxy/oven/data -H "Authorization: Bearer dsp_m2m_..."
curl http://192.168.0.21:3100/api/proxy/oven/aas  -H "Authorization: Bearer dsp_m2m_..."
```
O dado nunca passa pela nuvem; o PEP valida o token, herda a governança e loga o acesso.

### `GET /api/m2m/monitor` — observabilidade
Quem troca com quem (grafo), tokens/contratos ativos e acessos recentes do PEP.
```bash
curl http://localhost:3000/api/m2m/monitor
curl "http://localhost:3000/api/m2m/monitor?participant=urn:dataspace:participant:plant1:cnc"
```

## Agente CPS de exemplo (Node, sem dependências)

`scenario/m2m-agent.mjs` — registra um CPS, descobre um alvo, negocia e consome:
```bash
node scenario/m2m-agent.mjs \
  --dataspace https://<app>.vercel.app \
  --name "CNC Machining Center" --slug cnc \
  --base https://<tunel-cps> --sidecar https://<tunel-sidecar> \
  --federation "plant1 — Forming" --want-capability temperature \
  --key <M2M_API_KEY>     # obrigatório se o deploy estiver protegido
```
O `--key` também pode vir da env `M2M_API_KEY`. Só é exigido em `register`/
`negotiate` (escrita); `discover`/`monitor` são abertos.

## Como a arquitetura de controle usa (referência, não implementado aqui)

- **Plug**: `register` (ou re-register idempotente) quando o CPS entra na ordem de produção.
- **Play**: `discover` os CPS de que precisa → `negotiate` → `consume` para coordenar fases.
- **Failover**: se um provedor cai, `discover` acha equivalente por capacidade e `negotiate` de novo.
- **Unplug**: deixar o token expirar por TTL (governança), ou a arquitetura de controle para de consumir.
- **Acompanhamento**: `monitor` mostra as trocas em andamento.
