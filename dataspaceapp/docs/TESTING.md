# Estratégia de Testes — INTRA Dataspace

## Stack de testes

| Tipo | Ferramenta |
|------|-----------|
| Testes unitários | Vitest |
| Testes E2E | Playwright |

## Testes unitários com Vitest

Usar para:
- Lógica de domínio em `src/lib/` (máquinas de estado, validações, policies)
- Funções utilitárias
- Schemas Zod
- Regras de negócio (emissão de token, validação de membership, expiração)

## Testes E2E com Playwright

Usar para fluxos críticos do INTRA Dataspace:
- Fluxo completo ponta a ponta: `e2e/intra-full-flow.spec.ts`
  - Identidade → Conector → Federação → Ativo → Governança → Convite → Contrato → Token → Consumo
- Login e logout
- Cadastro de usuário (owner e client)
- Bloqueio de acesso anônimo ao catálogo

## Casos críticos obrigatórios

- Usuário anônimo não consegue ver federações, ativos ou catálogo.
- Token expirado bloqueia consumo.
- Token revogado bloqueia consumo.
- Membership revogado remove visibilidade e bloqueia nova negociação.
- `contractAgreement` rejeitado não permite emissão de token.
- Client sem membership ativo não vê ativos da federação.
- Owner não consegue ver solicitações de clientes de outras federações.

## Regras obrigatórias

- Toda feature nova deve ter teste.
- Todo bug corrigido deve ter teste cobrindo o caso.
- Não criar testes frágeis.
- Priorizar comportamento do usuário.
- Evitar testar detalhes internos de implementação.
- Rodar testes antes de finalizar tarefa.

## Scripts

```bash
# Testes unitários
npm run test

# Teste E2E básico
npm run test:e2e

# Teste E2E completo (fluxo ponta a ponta)
npm run test:e2e:full
```

## Arquivo de configuração

- `vitest.config.ts` — configuração do Vitest
- `playwright.config.ts` — configuração do Playwright
- `e2e/` — testes Playwright
