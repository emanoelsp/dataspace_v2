# Sidecar do Marcos — `sidecarRegistered: false`

> **Atualização (31/10/2026):** o segredo do Sidecar passou a ser **por
> organização** (não mais o `SIDECAR_ADMIN_SECRET` global), os CPS ganharam
> `resources` e a negociação grava todas as etapas do contrato. O passo a passo
> atual está em `docs/ATUALIZACAO-SIDECAR-MARCOS.md`; este documento fica como
> histórico do diagnóstico de `sidecarRegistered: false`.

Situação: o `POST /api/m2m/register` do **CPS-LAI-01** funcionou (ativo
`ciEehJ5tmlsy7MxhyUeh`, slug `cpslai1`, participante
`urn:dataspace:participant:ifsc-gaspar:cpslai1`), mas o Dataspace não conseguiu
registrar o CPS no Sidecar local. Este documento lista o que falta configurar.

Referência completa das APIs: `docs/CONTRATO-REST-SIDECAR.md` (seção 6).

---

## 1. O que `sidecarRegistered: false` significa

No fim do register, a Vercel chama o Sidecar pelo túnel:

```
POST https://notified-rotary-inch-investigate.trycloudflare.com/api/equipment
Authorization: Bearer <SIDECAR_ADMIN_SECRET da Vercel>
Content-Type: application/json

{ "id": "cpslai1", "name": "...", "baseUrl": "http://127.0.0.1:3101",
  "eclassIrdi": "...", "dataOwnerId": "urn:dataspace:participant:ifsc-gaspar:cpslai1",
  "dataOwnerName": "IFSC-GASPAR" }
```

`sidecarRegistered` vira `false` se essa chamada:

- responder qualquer código fora de 2xx — na prática **401**, segredo diferente; ou
- não responder em **4 segundos** (túnel caído ou lento).

O Dataspace **não grava** o código HTTP dessa chamada, então os logs da Vercel
não mostram se foi 401. O lugar certo para ver é o **terminal do Sidecar**: o
`npm run dev` imprime cada requisição recebida, por exemplo
`POST /api/equipment 401`.

| O que aparece no terminal do Sidecar | Causa |
|---|---|
| `POST /api/equipment 401` | `SIDECAR_ADMIN_SECRET` diferente do da Vercel |
| `POST /api/equipment 400` | body inválido (não deve acontecer pelo register) |
| nenhuma linha | a requisição não chegou: túnel caído ou URL do túnel mudou |

---

## 2. Segredo global ou por Sidecar?

**Hoje é um segredo global.** Existe uma única variável `SIDECAR_ADMIN_SECRET`
no projeto da Vercel, usada para falar com **todos** os Sidecars. Não há
credencial por Sidecar ou por organização. Por isso o Sidecar do Marcos precisa
ter exatamente o mesmo valor configurado na Vercel.

O valor é passado pelo Emanoel por canal privado.

---

## 3. Configuração que falta

### 3.1 Colocar o segredo no Sidecar

Arquivo `.env.local` na raiz do `dataspace-sidecar`:

```bash
SIDECAR_ADMIN_SECRET=<valor enviado pelo Emanoel>

# opcional — acessos aparecem no painel do Dataspace
DATASPACE_WEBHOOK_URL=https://dataspace-v2.vercel.app/api/sidecar/events
DATASPACE_WEBHOOK_SECRET=<o mesmo valor acima>
```

Cuidados:

- sem aspas, sem espaço antes ou depois do `=`, sem espaço no fim da linha;
- o arquivo é `.env.local` (não `.env.local.example`);
- sem a variável, o Sidecar assume `admin` — que não é o valor da Vercel.

### 3.2 Reiniciar o Sidecar

O Next.js só lê o `.env.local` na subida. Depois de editar:

```bash
# Ctrl+C no terminal do Sidecar e depois
npm run dev
```

O túnel do cloudflared pode continuar rodando. Se ele também for reiniciado, a
URL `https://…trycloudflare.com` muda e o `sidecarEndpoint` do register precisa
ser atualizado.

### 3.3 Testar o Sidecar com o segredo (antes de chamar o Dataspace)

Da máquina do Marcos, simulando o que a Vercel faz:

```bash
curl -i -X POST https://notified-rotary-inch-investigate.trycloudflare.com/api/equipment \
  -H "Authorization: Bearer <SIDECAR_ADMIN_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{ "id": "cpslai1", "name": "CPS-LAI-01 - Distribution/Conveyor Station", "baseUrl": "http://127.0.0.1:3101" }'
```

| Resposta | Significado |
|---|---|
| `200 { "ok": true, "equipment": {…} }` | Sidecar aceita o segredo — siga para 3.4 |
| `401 { "error": "Unauthorized" }` | o Sidecar não carregou o valor: revise o `.env.local` e reinicie |

> Observação: `GET /api/equipment` e `GET /api/status` são públicos e respondem
> 200 sem autenticação. Os 401 sem autenticação vêm das rotas administrativas
> (`POST /api/equipment`, `/api/tokens`, `/api/access-log`) — o que só prova que
> o túnel chega no Sidecar, não que o segredo está certo.

### 3.4 Conferir o contrato do CPS

O Sidecar vai buscar os dados em `{baseUrl}/api/data` e `{baseUrl}/api/aas`,
sempre com `Authorization: Bearer demo`, esperando JSON. Como o `baseUrl` é
`http://127.0.0.1:3101`, o CPS precisa estar **na mesma máquina** do Sidecar.
Teste nessa máquina:

```bash
curl -i http://127.0.0.1:3101/api/data -H "Authorization: Bearer demo"
curl -i http://127.0.0.1:3101/api/aas  -H "Authorization: Bearer demo"
```

Os dois devem responder `200` com JSON. Formato recomendado para `/api/data`:

```json
{
  "equipmentType": "Conveyor",
  "eclassIrdi": "0173-1#01-...",
  "timestamp": "2026-10-30T16:00:00.000Z",
  "metrics": { "beltSpeed_m_s": 0.4, "...": "..." }
}
```

Se o CPS estiver em outra máquina, use o IP da LAN no `baseUrl`
(`http://192.168.x.y:3101`), não `127.0.0.1`.

### 3.5 Repetir o register

O register é idempotente por `organization` + `equipmentSlug`: repetir o mesmo
POST só atualiza o que existe, não duplica.

```bash
curl -X POST https://dataspace-v2.vercel.app/api/m2m/register \
  -H "Content-Type: application/json" \
  -H "X-M2M-Key: <M2M_API_KEY>" \
  -d '{
    "name": "CPS-LAI-01 - Distribution/Conveyor Station",
    "baseUrl": "http://127.0.0.1:3101",
    "sidecarEndpoint": "https://notified-rotary-inch-investigate.trycloudflare.com",
    "organization": "IFSC-GASPAR",
    "equipmentSlug": "cpslai1",
    "assetType": "Conveyor",
    "eclassIrdi": "0173-1#01-...",
    "capabilities": ["beltSpeed_m_s"],
    "federation": { "joinByName": "ifsc" },
    "governance": { "accessTokenTtlMinutes": 30, "requiresManualApproval": false }
  }'
```

- `assetType`, `eclassIrdi` e `capabilities` devem ir explícitos: a Vercel não
  alcança `127.0.0.1` da rede do Marcos, então a colheita automática volta vazia.
- Se a federação `ifsc` já foi criada no primeiro register, use
  `"joinByName": "ifsc"`; se ainda não existe, use
  `"create": { "name": "ifsc", "type": "Open" }`.
- **Mantenha `requiresManualApproval: false`**: em CPS registrado por M2M não há
  usuário logado que possa aprovar o pedido, e a negociação ficaria pendente.

Esperado agora: `"sidecarRegistered": true`. No terminal do Sidecar deve
aparecer `POST /api/equipment 200`.

### 3.6 Confirmar

```bash
curl https://notified-rotary-inch-investigate.trycloudflare.com/api/equipment
curl https://notified-rotary-inch-investigate.trycloudflare.com/api/status
```

O `cpslai1` deve aparecer com `status: "active"` e, no `/api/status`, como
`online` (o Sidecar sonda `{baseUrl}/api/data`).

---

## 4. Depois do registro

O mesmo segredo é usado quando o Dataspace empurra o token após o contrato.
Com o passo 3 resolvido, o restante funciona sem configuração extra:

1. **Descobrir:** `GET https://dataspace-v2.vercel.app/api/m2m/discover?slug=cpslai1`
2. **Assinar contrato:** `POST https://dataspace-v2.vercel.app/api/m2m/negotiate`
   com `{ consumerParticipantId, targetAssetId: "ciEehJ5tmlsy7MxhyUeh" }` → `token`
   (confira se `sidecarTokenId` veio preenchido)
3. **Consumir:** `GET https://notified-rotary-inch-investigate.trycloudflare.com/api/proxy/cpslai1/data`
   com `Authorization: Bearer <token>`

Detalhes de cada chamada: `docs/CONTRATO-REST-SIDECAR.md`, seções 6.2 a 6.6.

---

## 5. Quando a URL do cloudflared mudar

Ao reiniciar o computador ou o `cloudflared`, a URL `https://…trycloudflare.com`
muda. Uma chamada atualiza todos os CPS da organização no Dataspace e os
re-registra no Sidecar:

```bash
curl -X POST https://dataspace-v2.vercel.app/api/m2m/sidecar-endpoint \
  -H "Content-Type: application/json" \
  -H "X-M2M-Key: <M2M_API_KEY>" \
  -d '{ "organization": "IFSC-GASPAR", "sidecarEndpoint": "https://<nova-url>.trycloudflare.com" }'
```

- Para atualizar só um CPS, inclua `"equipmentSlug": "cpslai1"`.
- Esperado: `"sidecarRegistered": true` e a lista `equipment` com cada CPS.
- O Sidecar precisa estar no ar com o `SIDECAR_ADMIN_SECRET` correto antes da chamada.
- Tokens já emitidos continuam válidos; os `dataUrl` passam a usar a URL nova.

Detalhes: `docs/CONTRATO-REST-SIDECAR.md`, seção 6.7.

---

## 6. Checklist

- [ ] `.env.local` com `SIDECAR_ADMIN_SECRET` igual ao da Vercel
- [ ] Sidecar reiniciado depois de editar o `.env.local`
- [ ] `POST /api/equipment` com o segredo responde 200 (3.3)
- [ ] CPS responde `/api/data` e `/api/aas` com `Bearer demo` na máquina do Sidecar (3.4)
- [ ] Register repetido com a URL atual do túnel → `sidecarRegistered: true` (3.5)
- [ ] `cpslai1` aparece em `/api/equipment` e `online` em `/api/status` (3.6)
