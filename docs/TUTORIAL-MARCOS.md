# Tutorial — Integrando a arquitetura de controle ao Dataspace (M2M)

Este guia é para o **Marcos** testar a integração da arquitetura de controle
(CPS plug-and-play) com o **Dataspace** do Emanoel.

## Arquitetura em dois planos

A proposta separa **quem decide o acesso** de **onde o dado trafega** — a ideia
central da dissertação (soberania na origem + baixa latência).

**🌐 Plano de controle — Dataspace na nuvem (Vercel)**
É a "autoridade" do ecossistema. Cuida de *quem pode acessar o quê e sob quais
regras*, **sem nunca tocar no dado**:
- catálogo/descoberta de serviços (UDDI) e federações;
- negociação de contratos e **emissão dos tokens** de acesso;
- governança (TTL, finalidade, revogação) e registro dos contratos.

**🏭 Plano de dados — Sidecar PEP na rede local**
É o **PEP (Policy Enforcement Point)** que roda na **tua** rede, colado nos CPS.
Cuida da *troca real do dado, sob o controle do token*:
- recebe o token que a nuvem emitiu e o mantém localmente (**controle de token**);
- a cada requisição, **valida o token** (assinatura, TTL, escopo, governança
  herdada) e só então faz o **proxy P2P** ao CPS na LAN;
- registra os logs de acesso (rastreabilidade).

O dado **nunca sobe para a nuvem** — só o token é negociado lá. Se a conexão com
a nuvem cair, o Sidecar continua validando e servindo com o token local até o TTL
expirar.

```
   PLANO DE CONTROLE (nuvem / Vercel)              PLANO DE DADOS (tua rede local)
 ┌───────────────────────────────────┐          ┌──────────────────────────────────┐
 │  Dataspace                        │  token   │  Sidecar PEP                     │
 │  catálogo · contratos · governança├─────────►│  valida token · aplica política  │
 │  emite o token (não vê o dado)    │  (HTTPS) │  proxy P2P · logs                │
 └───────────────────────────────────┘          └───────────────┬──────────────────┘
        ▲ register / discover / negotiate                        │ dados (LAN, P2P)
        │                                                        ▼
   agente / arquitetura de controle  ───────(consome via PEP)──►  CPS
```

Resumo do fluxo: você **descobre e negocia** no plano de controle (nuvem) e
**consome** no plano de dados (teu Sidecar) — o token é a ponte entre os dois.

---

## 0. Quem roda o quê (importante)

O protótipo tem **3 componentes em 3 repositórios**:

| Componente | Onde roda | Repositório |
|---|---|---|
| **Dataspace** (catálogo, governança, tokens) | Nuvem (Vercel) — o Emanoel | `dataspace_v2` |
| **Sidecar PEP** (valida token, proxy P2P, logs) | **Tua** rede, junto dos CPS | `dataspace-sidecar` |
| **CPS** (dados) | **Tua** rede, atrás do Sidecar | `dataspace-equipment` (exemplos) ou os teus |

O plano de dados é **todo teu** (Sidecar + CPS na tua rede); a nuvem só descobre,
governa e emite tokens. Duas formas de testar:

- **Setup A — integração real (recomendado):** você roda os **teus CPS** + um
  Sidecar na tua rede. É o que valida a integração da tua arquitetura de controle.
- **Setup B — só experimentar a API:** você usa os CPS de exemplo do
  `dataspace-equipment` para ver o fluxo funcionando ponta a ponta.

Em ambos: **um Sidecar** atende vários CPS da mesma rede, e ele precisa ser
alcançável pela nuvem (túnel — passo 3).

## 0.1 O que você precisa do Emanoel

- **URL base do Dataspace**: `https://<app>.vercel.app`
- **Chave M2M** (`X-M2M-Key`): usada em `register` e `negotiate`
- **SIDECAR_ADMIN_SECRET**: o mesmo segredo configurado no Dataspace (o teu
  Sidecar precisa usar o mesmo para aceitar os tokens que a nuvem empurra)

Guarde numa variável para os exemplos:
```bash
export DS=https://<app>.vercel.app
export KEY=<M2M_API_KEY do Emanoel>
```

---

## 1. Confirme que o Dataspace está no ar

```bash
curl $DS/api/m2m | python3 -m json.tool
```
Deve retornar `health.firestore: true` e a lista de interfaces. Esse endpoint é
**aberto e auto-documentado** — é o teu mapa da API.

---

## 2. Suba o Sidecar PEP e um CPS na tua rede

**Sidecar** (clone o repo, use o MESMO segredo do Dataspace):
```bash
git clone https://github.com/emanoelsp/dataspace-sidecar.git
cd dataspace-sidecar
cp .env.local.example .env.local        # edite: SIDECAR_ADMIN_SECRET=<mesmo do Dataspace>
npm install && npm run dev              # http://localhost:3100
```

**Um CPS** — no Setup A use o teu; no Setup B, um simulador de exemplo:
```bash
git clone https://github.com/emanoelsp/dataspace-equipment.git
cd dataspace-equipment/press            # ou cnc, robot, oven, ...
npm install && npm run dev              # http://localhost:3002  (/api/data e /api/aas)
```

Teste local:
```bash
curl http://localhost:3100/api/status
curl http://localhost:3002/api/data -H "Authorization: Bearer demo"
```

> Para os testes de escala (muitos CPS), o `dataspace-equipment` tem a `fleet`
> (`node fleet/server.mjs --scale N`) — ver o README de lá.

---

## 3. A pegadinha: exponha o Sidecar (e o CPS) para a nuvem

A Vercel **não enxerga IP da tua LAN**. Como o Dataspace precisa alcançar o
Sidecar (para registrar o CPS e empurrar o token), crie um **túnel público**:

```bash
# opção A — cloudflared (sem cadastro)
cloudflared tunnel --url http://localhost:3100     # → https://algo.trycloudflare.com  (SIDECAR)
cloudflared tunnel --url http://localhost:3002     # → https://outro.trycloudflare.com (CPS)

# opção B — ngrok
ngrok http 3100      # e, em outra aba, ngrok http 3002
```

Anote as URLs https geradas:
```bash
export SIDECAR=https://<tunel-do-3100>
export CPS=https://<tunel-do-3002>
```
> Se não quiser expor o CPS, tudo bem: passe as `capabilities` na mão no
> registro (passo 4). O Sidecar, porém, **precisa** ser alcançável.

---

## 4. Registre o CPS no Dataspace (plug)

```bash
curl -X POST $DS/api/m2m/register \
  -H "Content-Type: application/json" -H "X-M2M-Key: $KEY" \
  -d "{
    \"name\": \"Hydraulic Press\",
    \"equipmentSlug\": \"press\",
    \"organization\": \"plant1\",
    \"baseUrl\": \"$CPS\",
    \"sidecarEndpoint\": \"$SIDECAR\",
    \"federation\": { \"create\": { \"name\": \"plant1 — Forming\", \"type\": \"Open\" } },
    \"governance\": { \"accessTokenTtlMinutes\": 30, \"requiresManualApproval\": false }
  }"
```
O Dataspace cria conector + federação + compliance + asset (colhendo as
**capacidades** do teu CPS) + governança, e registra o CPS no teu Sidecar.
Guarde o `assetId` e o `participantId` da resposta.

Tipos de federação:
- `Open` → qualquer um assina o contrato e consome;
- `Consortium` → só entra por convite;
- `Private` → precisa de solicitação + aprovação do dono.

Registre quantos CPS quiser (repita com outro `slug`/`baseUrl`). Re-registrar o
mesmo é **idempotente** (seguro no plug).

---

## 5. Descubra outro CPS por serviço (UDDI)

```bash
# por capacidade (ex.: quero quem expõe pressão)
curl "$DS/api/m2m/discover?capability=pressure" | python3 -m json.tool
# por tipo de equipamento
curl "$DS/api/m2m/discover?equipmentType=Furnace"
# excluindo a si mesmo
curl "$DS/api/m2m/discover?capability=temperature&exclude=press"
```
Retorna candidatos com `assetId`, `capabilities`, e o `admissionMode` da
federação. **Só metadados** — nenhum dado cru aqui.

---

## 6. Negocie o contrato e receba o token (play)

```bash
curl -X POST $DS/api/m2m/negotiate \
  -H "Content-Type: application/json" -H "X-M2M-Key: $KEY" \
  -d '{
    "consumerParticipantId": "urn:dataspace:participant:plant1:cnc",
    "consumerName": "cnc",
    "targetSlug": "press",
    "purpose": "coordenação de produção"
  }'
```
- Governança automática → `{ "status":"granted", "token":"dsp_m2m_...", "dataUrl":"...", "expiresAt":"..." }`
- Governança com aprovação → `{ "status":"pending", "requestId":"..." }` (o dono aprova pela UI do Dataspace)

Guarde `token` e `dataUrl`.

---

## 7. Consuma os dados P2P via Sidecar (não passa pela nuvem)

```bash
curl "$SIDECAR/api/proxy/press/data" -H "Authorization: Bearer dsp_m2m_..."
curl "$SIDECAR/api/proxy/press/aas"  -H "Authorization: Bearer dsp_m2m_..."
```
O PEP valida o token, aplica a governança e loga o acesso. Repita à vontade até
o token expirar (TTL da política). No teu código, é um GET com o header Bearer.

---

## 8. Acompanhe as trocas (observabilidade)

```bash
curl $DS/api/m2m/monitor | python3 -m json.tool
```
Mostra quem está trocando com quem (grafo), tokens/contratos ativos e os acessos
recentes registrados pelo PEP.

---

## Atalho: agente de exemplo (faz 4→7 de uma vez)

O `scenario/m2m-agent.mjs` executa register → discover → negotiate → 3 leituras:
```bash
node scenario/m2m-agent.mjs \
  --dataspace $DS --key $KEY \
  --name "CNC" --slug cnc --org plant1 \
  --base $CPS --sidecar $SIDECAR \
  --federation "plant1 — Forming" \
  --want-capability pressure
```

---

## Como a arquitetura de controle usa isso (o ciclo é TEU)

O Dataspace só oferece as primitivas; a orquestração plug/play/unplug/failover é
da tua arquitetura:

- **Plug** (CPS entra na ordem de produção): `register` (idempotente).
- **Play** (coordenar fases): `discover` os CPS necessários → `negotiate` →
  `consume` em loop enquanto produz.
- **Failover** (um provedor cai): `discover` um equivalente por capacidade e
  `negotiate` de novo — o consumidor troca de fonte sem parar.
- **Unplug** (terminou): deixe o token expirar por TTL, ou simplesmente pare de
  consumir.

---

## Erros comuns

| Sintoma | Causa provável |
|---|---|
| `401 Missing or invalid X-M2M-Key` | faltou o header `X-M2M-Key` (ou chave errada) em register/negotiate |
| `503 Server credentials not configured` | Dataspace sem `FIREBASE_SERVICE_ACCOUNT_JSON` (falar com o Emanoel) |
| register OK mas `sidecarRegistered:false` | a nuvem não alcançou teu Sidecar → falta o túnel/IP público |
| `capabilities: []` no register | o CPS não estava acessível para a colheita → exponha o CPS ou passe `capabilities` no corpo |
| consumo dá `401 Token not found` no Sidecar | o `SIDECAR_ADMIN_SECRET` do teu Sidecar difere do configurado no Dataspace |
| `negotiate` retorna `pending` | a federação/política exige aprovação manual — o dono aprova pela UI |
