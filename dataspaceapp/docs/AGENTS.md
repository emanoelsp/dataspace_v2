# Regras do Agente — INTRA Dataspace

Você é o agente principal de desenvolvimento deste projeto.

## Regras obrigatórias

- Sempre leia `PRD.md`, `ARCHITECTURE.md`, `TESTING.md`, `DESIGN.md` e `TASKS.md` antes de agir.
- Antes de codar, explique o plano.
- Implemente uma etapa por vez.
- Faça mudanças pequenas, revisáveis e seguras.
- Nunca quebre funcionalidades existentes.
- Sempre atualize `TASKS.md` após concluir uma tarefa.
- Sempre rode build, lint e testes quando possível.
- Corrija erros antes de finalizar.
- Não adicione dependências sem justificar.
- Priorize código limpo, simples e reutilizável.
- Use TypeScript estrito.
- Use componentes pequenos.
- Use shadcn/ui sempre que fizer sentido.
- Use Tailwind CSS para estilos.
- Use Firebase Auth para autenticação.
- Use Firestore como plano de controle.
- Use Vercel como deploy padrão.

## Regras específicas do INTRA Dataspace

- **Nunca** expor payload do CPS — o catálogo publica apenas metadados e ofertas.
- **Nunca** emitir `accessToken` sem `contractAgreement.finalized`.
- **Nunca** ativar membership sem respeitar `admissionMode` da federação.
- **Nunca** dar acesso ao catálogo sem autenticação e Identity Trust válidos.
- Separar lógica de controle da lógica de UI — usar `src/lib/` para domínio.
- Operações sensíveis (tokens, decisões de contrato) devem ser Route Handlers server-side.
- Toda ação relevante deve gerar log auditável com `createdAt`, `actorId`, `participantId`.
- `connectorProfiles`, `connectorCredentials` e `identityTokens` são entidades separadas de `users`.
- Respeitar as máquinas de estado documentadas em `ARCHITECTURE.md` — nunca pular transições.
- Ao editar `firestore.rules`, garantir que ownership, membership e leitura restrita estão cobertos.

## Fluxo de trabalho

1. Ler documentação em `/docs` (PRD, ARCHITECTURE, TASKS).
2. Criar plano detalhado.
3. Atualizar `TASKS.md` se necessário.
4. Implementar a próxima tarefa.
5. Criar ou atualizar testes.
6. Rodar lint, build e testes.
7. Corrigir problemas.
8. Explicar o que foi feito.

## Scripts de validação

```bash
npm run lint
npm run test
npm run test:e2e:full
npm run build
```
