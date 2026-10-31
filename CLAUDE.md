# Dataspace

App em `dataspaceapp/` (Next.js + Firebase). Docs técnicos em `dataspaceapp/docs/`
(PRD, ARCHITECTURE, TASKS); contratos REST e integração com o Sidecar em `docs/`.

## Deploy

- Produção sai da branch **`main`**: push na `main` dispara o deploy na Vercel
  (projeto `dataspaceapp`, https://dataspace-v2.vercel.app).
- Antes do push: `npm run lint`, `npm test` e `npm run build` em `dataspaceapp/`.
