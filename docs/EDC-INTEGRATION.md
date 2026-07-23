# Camada inter-organizacional via EDC

Como o dataspace **intra** participa de um dataspace **inter-org** usando o
**Eclipse Dataspace Connector (EDC)** — fechando o modelo multicamada.

## Ideia

O EDC fala o **Dataspace Protocol** (catálogo DCAT + negociação de contrato ODRL
+ transfer) e cuida da identidade inter-org (DCP/DAPS). Reimplementar isso seria
pesado e contra a tese (leveza/soberania). Então:

> O dataspace intra permanece leve e soberano e se **registra como fonte de dados
> no EDC** da organização. O contrato inter-org é negociado no EDC/ODRL, mas o
> *enforcement* de uso continua no **Sidecar PEP intra** — inclusive as leituras
> inter-org passam pelo PEP e ficam auditadas.

```
  INTER-ORG (DSP)                     ORGANIZAÇÃO                         BORDA
 ┌───────────────┐   DSP    ┌───────────────────────────┐   ponte   ┌──────────────┐
 │ EDC externo   │◄────────►│ EDC da org  ◄── register ──┤ dataspace │ Sidecar PEP  │
 │ (consumidor)  │ catálogo │ (Management API v3)        │  intra    │ + CPS        │
 └───────────────┘ contrato └───────────────┬───────────┘           └──────▲───────┘
                            transfer (data plane puxa) │  /api/edc/data/{id} │
                                                       └─────────────────────┘
                                                        (serve via PEP intra)
```

## Endpoints (adaptador EDC)

| Método | Rota | Papel |
|---|---|---|
| GET | `/api/edc` | saúde + índice + variáveis de ambiente |
| POST | `/api/edc/register` | gera os artefatos EDC v3 e (se configurado) registra no EDC |
| GET | `/api/edc/data/{assetId}` | `dataAddress.baseUrl` que o data plane do EDC puxa (serve via PEP) |

## Variáveis de ambiente

| Var | Papel |
|---|---|
| `EDC_MANAGEMENT_URL` | URL do Management API do EDC (ex.: `http://host:19193/management`) — habilita o push |
| `EDC_MANAGEMENT_API_KEY` | `X-Api-Key` do EDC |
| `EDC_DATA_SECRET` | segredo que o data plane do EDC apresenta à ponte (recomendado) |
| `EDC_PUBLIC_BASE_URL` | URL pública deste dataspace (para o `dataAddress`); se ausente, usa a origem da requisição |

## Uso

### 1. Registrar ativos no EDC (a "interface")
```bash
# um ativo
curl -X POST https://<app>.vercel.app/api/edc/register \
  -H "Content-Type: application/json" -d '{ "assetId": "<id>" }'

# uma federação inteira
curl -X POST https://<app>.vercel.app/api/edc/register \
  -H "Content-Type: application/json" -d '{ "federationId": "<id>" }'
```
- **Sem `EDC_MANAGEMENT_URL`** → modo *export*: retorna os `bundles`
  (`asset` + `policy` + `contractDefinition`) prontos para você `POST` manualmente
  em `/v3/assets`, `/v3/policydefinitions`, `/v3/contractdefinitions`.
- **Com `EDC_MANAGEMENT_URL`** → registra automaticamente e retorna o resultado.

### 2. O que o EDC recebe (formato v3, exemplo)
```jsonc
// asset
{ "@context": { "@vocab": "https://w3id.org/edc/v0.0.1/ns/" },
  "@id": "<assetId>",
  "properties": { "name": "...", "intra:eclassIrdi": "...", "intra:capabilities": "temperature,pressure",
                  "intra:enforcement": "usage control enforced at intra Sidecar PEP (edge)" },
  "dataAddress": { "type": "HttpData", "baseUrl": "https://<app>/api/edc/data/<assetId>",
                   "proxyPath": "false", "header:X-EDC-Data-Secret": "***" } }
// policy (ODRL Set) e contractDefinition ligam asset ↔ política
```

### 3. Fluxo completo inter-org
1. `register` → o EDC da org passa a expor o ativo no **catálogo DSP**.
2. Um **EDC externo** (consumidor) descobre no catálogo, **negocia o contrato** (ODRL).
3. Fechado o contrato, o **transfer** faz o data plane do EDC puxar a ponte
   `/api/edc/data/{assetId}`.
4. A ponte **mint** um token curto e busca o dado pelo **Sidecar PEP intra** →
   valida política, registra o log, retorna o dado. Mesmo o inter passa pela borda.

## Decisão de projeto (defesa)

- **Interoperável de verdade:** produz o formato oficial do EDC Management API v3
  (JSON-LD), então pluga em qualquer EDC/Catena-X sem gambiarra.
- **Leve e soberano:** o intra não vira um connector DSP completo; delega o
  protocolo/identidade ao EDC (o "não reinventar a roda" do IDSA Rulebook).
- **Soberania preservada:** a política ODRL enviada ao EDC é mínima e o
  enforcement real fica no PEP intra — a governança de uso (TTL, finalidade,
  revogação) viaja como metadados e é imposta na borda, não delegada ao externo.
- **Evolução declarada:** mapear a governança intra para ODRL *enforceable*
  (com evaluators no EDC) e adotar DCP/DAPS para identidade forte são os próximos
  passos (mesmo roadmap do Cap. 7 da dissertação).

## Testar sem um EDC vivo
O modo *export* (`/api/edc/register` sem `EDC_MANAGEMENT_URL`) devolve os bundles —
dá para validar o formato e mostrar a interface na dissertação. A ponte
`/api/edc/data/{id}` pode ser exercitada direto (com `X-EDC-Data-Secret` se
configurado) para provar que o dado vem através do PEP.
