# INTRA Dataspace

Protótipo de um **Dataspace intraorganizacional** alinhado aos princípios da IDSA, Gaia-X e Dataspace Protocol, implementado com **Next.js + Firebase**.

## Documentação

```
docs/
  PRD.md          → Requisitos do produto (épicos, RFs, modelo de dados, RNs)
  ARCHITECTURE.md → Stack, coleções Firestore, máquinas de estado, estrutura
  AGENTS.md       → Regras do agente de IA para desenvolvimento
  TASKS.md        → Backlog e progresso por fase
  TESTING.md      → Estratégia de testes (Vitest + Playwright)
  DESIGN.md       → Design system, UI stack e regras de interface
  DEPLOY.md       → Checklist de deploy (Vercel + Firebase)
```

## Como executar

```bash
cp .env.example .env.local
# preencha com as credenciais Firebase

npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev            # servidor de desenvolvimento
npm run build          # build de produção
npm run lint           # lint
npm run test           # testes unitários (Vitest)
npm run test:e2e       # teste E2E básico (Playwright)
npm run test:e2e:full  # fluxo completo ponta a ponta
```

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 15 + TypeScript |
| Estilo | Tailwind CSS + shadcn/ui |
| Auth | Firebase Auth |
| Banco | Firestore |
| Deploy | Vercel |
| Testes | Vitest + Playwright |

## O que é um INTRA Dataspace

O sistema materializa um ecossistema de dados interno onde:

- **dados permanecem na origem** (soberania física, sem cópia para Data Lake central)
- **catálogo publica apenas metadados** e ofertas — nunca o payload industrial
- **Zero Trust**: nenhum participante anônimo acessa federações, ativos ou catálogo
- **confiança de identidade** antecede catálogo, membership e contrato
- **federação governa entrada** no ecossistema; **ativo governa o uso** concreto do dado
- **consumo P2P**: o Data Client acessa o dado diretamente no sidecar do CPS, com token de vida curta

## Papéis

- **Data Owner** — cria federações, publica ativos e políticas, aprova memberships e contratos
- **Data Client** — descobre federações e ativos, solicita membership, negocia contratos e consome dados

## Contexto acadêmico

Este projeto é o protótipo desenvolvido como parte da qualificação de dissertação de mestrado sobre Dataspaces intraorganizacionais, demonstrando a viabilidade de implementar os princípios do Dataspace Protocol com stack web moderna (Next.js + Firebase).
