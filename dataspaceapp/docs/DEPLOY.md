# Deploy — INTRA Dataspace

## Plataforma padrão

- **Vercel** (Next.js)
- **Firebase** (Auth, Firestore, Rules)

## Regras

- O projeto deve passar no build antes do deploy.
- Variáveis de ambiente devem ficar no painel da Vercel.
- Nunca commitar secrets.
- Firebase config pública pode ficar no client — secrets privados não.
- Antes de cada deploy, publicar `firestore.rules` e `firestore.indexes.json` no projeto Firebase.

## Variáveis de ambiente

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

## Publicar regras e índices do Firestore

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

## Checklist antes do deploy

- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run test:e2e:full`
- [ ] `npm run build`
- [ ] Publicar `firestore.rules` atualizado
- [ ] Publicar `firestore.indexes.json` atualizado
- [ ] Testar login (owner e client)
- [ ] Testar fluxo completo ponta a ponta
- [ ] Testar bloqueio de acesso anônimo ao catálogo
- [ ] Testar expiração e revogação de token
- [ ] Testar responsividade mobile
