# Cenário plant1 — runbook executável

Materializa o cenário do `api-equipment/fleet/README.md`: **10 CPS, 5 trocas
simultâneas via Sidecar PEP**, exercitando os 3 tipos de federação.

## Pré-requisitos

- Sidecar PEP rodando na LAN (`api-equipment/sidecar-proxy`, porta 3100)
- CPS rodando (modo multi-máquina: uma app por computador; modo dev: fleet `--port 3050`)
- Dataspace app com `FIREBASE_SERVICE_ACCOUNT_JSON` e `SIDECAR_ADMIN_SECRET`

## Passo a passo

### 1. Semear federações, ativos e governança (uma vez)
```bash
cd dataspaceapp
node ../scenario/seed-scenario.mjs --owner-uid <SEU_UID> \
  --map "oven=http://192.168.0.21:3004,press=http://192.168.0.8:3002,..."   # IPs reais
```
Cria: 3 federações (aberta/consórcio/privada), 10 ativos com **capacidades
colhidas dos CPS** (UDDI), políticas de governança por federação, e registra
os CPS no sidecar. Idempotente (pula o que já existe). `--dry` para simular.

### 2A. Medir NEGOCIAÇÃO (Cenários A/B — plano de controle)
Use o fluxo real via UI (ou adapte os specs Playwright existentes em `e2e/`):
adesão conforme o tipo de federação → contrato → token. É a medição dos
57,3 s / 19,3 s do relatório do Cenário 1, agora com os 3 fluxos de adesão.

### 2B. Provisionar tokens direto (atalho p/ carga do plano de dados)
```bash
node scenario/provision-tokens.mjs --sidecar http://192.168.0.10:3100
```
Empurra os 5 tokens **com a governança herdada** (TTL/purpose/revogação por
federação) e salva `tokens-cenario2.json`.

### 3. Carga: 5 trocas concorrentes
```bash
node scenario/load-cenario2.mjs --loops 50
```
Mede latência por requisição, agrega mín/mediana/média/p95/máx por troca e
total + vazão agregada; grava `.json` e `.csv` com todas as amostras.
Baseline sem IDS: repita apontando direto para os CPS (sem sidecar) para
isolar o overhead, como no relatório do Cenário 1.

*(Equivalente JMeter: 5 Thread Groups × 1 thread, HTTP GET
`{sidecar}/api/proxy/{provider}/data`, HeaderManager com o Bearer de cada troca.)*

### 4. Escada de escalabilidade (5 → 500)
```bash
node api-equipment/fleet/server.mjs --port 3050 --scale N
node api-equipment/fleet/register-fleet.mjs --sidecar ... --base http://<ip>:3050 --scale N
# provisionar tokens em lote e repetir a carga com mais trocas
```

## Onde a rastreabilidade aparece

- Sidecar: `.data/access-log.json` + `GET /api/access-log` (admin)
- Dataspace: coleção `accessLogs` (com `contractRef` e `governance`)
- Headers por requisição: `X-Token-Id`, `X-Contract-Ref`, `X-Governance-Policy`,
  `X-Response-Time-Ms`
