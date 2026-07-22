# Deploy no Vercel — APIs M2M públicas para o Marcos testar

O `dataspaceapp` é o **plano de controle** (Vercel/nuvem). Os **CPS e o Sidecar
PEP** rodam na rede do Marcos. Entender esse recorte é o que evita a única
pegadinha do deploy.

## 1. Projeto no Vercel

O app Next fica na subpasta `dataspaceapp/` do repo `dataspace_v2`. Ao
importar/configurar o projeto:

- **Root Directory: `dataspaceapp`** ← essencial (o app não está na raiz do repo)
- Framework: Next.js (detectado) · Build: `next build` (padrão)
- Já existe deploy anterior em `dataspace-v2.vercel.app` — se for o mesmo projeto,
  só atualize as variáveis e faça *Redeploy*.

## 2. Variáveis de ambiente (Settings → Environment Variables)

Copie de `dataspaceapp/.env.example`. As essenciais:

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` (7) | mesma config do `.env.local` |
| **`FIREBASE_SERVICE_ACCOUNT_JSON`** | o JSON da service account **em uma linha, SEM aspas em volta** (ver abaixo) |
| `SIDECAR_ADMIN_SECRET` | o mesmo segredo que o Sidecar do Marcos usa |
| `M2M_API_KEY` | (recomendado) chave que protege register/negotiate; passe ao Marcos |
| `GATEWAY_API_KEY` | (opcional) protege o gateway inter |

Deixe `SIDECAR_URL` **em branco** — o endpoint do sidecar vem no corpo de cada
requisição (cada CPS informa o seu); um localhost padrão seria inútil na nuvem.

### Como pegar o valor do `FIREBASE_SERVICE_ACCOUNT_JSON`
No `.env.local` o valor está entre **aspas simples**. No Vercel, cole **sem** as
aspas. Para extrair a linha pronta:
```bash
cd dataspaceapp
grep '^FIREBASE_SERVICE_ACCOUNT_JSON=' .env.local | sed "s/^[^=]*=//; s/^'//; s/'$//" | pbcopy
# agora é só colar (Cmd+V) no campo de valor do Vercel
```

## 3. A pegadinha: a nuvem precisa alcançar o Sidecar

No fluxo M2M, o Dataspace (Vercel) faz duas chamadas **de saída** para o Sidecar:
- `register` → registra o CPS no PEP;
- `negotiate` → empurra o token ao PEP.

A Vercel **não enxerga IP de LAN** (`192.168.x`). Então o `sidecarEndpoint` que o
Marcos informar tem que ser **público**. Opções (da mais simples):

1. **Túnel (ideal para teste):** na máquina do sidecar,
   `cloudflared tunnel --url http://localhost:3100` (ou `ngrok http 3100`) →
   gera uma URL https pública. O Marcos usa **essa URL** como `sidecarEndpoint`
   no `register`/`negotiate`. Idem para o CPS (`baseUrl`) se quiser a colheita
   de capacidades — ou ele passa `capabilities` explícitas no corpo.
2. **Host público:** rodar sidecar/CPS numa máquina com IP público e porta aberta.
3. **Só validar o plano de controle:** sem sidecar alcançável, `register` ainda
   cria a entrada no catálogo e `negotiate` ainda devolve o token (o push ao
   sidecar é best-effort) — mas o token só será utilizável quando houver um
   sidecar público. Bom para testar descoberta/negociação isoladamente.

O **consumo** (agente do Marcos → `{sidecar}/api/proxy/...`) é local à rede dele
— não passa pela Vercel.

## 4. Firestore

Funciona direto da Vercel via Admin SDK (a service account autentica). Sem
config extra. ⚠️ `register`/`negotiate` escrevem no **Firestore real**; as
entidades M2M têm `source: "m2m"` para você filtrar/limpar depois.

## 5. Deploy e verificação

Deploy: `git push` (se o Vercel está ligado ao GitHub) ou `vercel --prod` na
pasta `dataspaceapp`. Depois:

```bash
# saúde + índice das interfaces (deve mostrar firestore: true e o catálogo)
curl https://<app>.vercel.app/api/m2m | python3 -m json.tool

# se M2M_API_KEY estiver setada, os writes exigem o header:
curl -X POST https://<app>.vercel.app/api/m2m/register \
  -H "Content-Type: application/json" -H "X-M2M-Key: <sua-chave>" \
  -d '{ "name":"CNC", "baseUrl":"https://<tunel-cps>", "sidecarEndpoint":"https://<tunel-sidecar>", "federation":{"create":{"name":"plant1 — Forming","type":"Open"}} }'
```

## 6. O que entregar ao Marcos

- URL base: `https://<app>.vercel.app`
- `M2M_API_KEY` (se você ativou)
- O contrato: `docs/M2M-API.md` e o agente de exemplo `scenario/m2m-agent.mjs`
- Lembrete: expor o sidecar (e o CPS) por túnel/IP público para a nuvem alcançar.

## Notas
- Endpoints M2M já enviam **CORS** (teste por navegador funciona).
- `register` faz colheita (4s) + push ao sidecar (4s) com timeouts — cabe no
  limite de função do Hobby (10s); o plano Pro dá folga se as redes forem lentas.
