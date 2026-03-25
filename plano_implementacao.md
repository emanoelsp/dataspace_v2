# Plano de Implementação

## Alta Prioridade
- ✅ Autenticação funcional com Firebase Auth no header.
- ✅ Cadastro de usuários com persistência em `users`.
- ✅ Cadastro de federações com ownership e auditoria básica.
- ✅ Cadastro de ativos com ownership, endpoint validado e vínculo com federação.
- ✅ Cadastro de compliance com ownership e trilha temporal.
- ✅ Cadastro de governança com ownership e trilha temporal.
- ✅ Solicitação de acesso persistida em `accessRequests`.
- ✅ Registro de início de consumo em `accessLogs`.
- ✅ Dashboard com métricas reais do Firestore.
- ✅ `firestore.rules` inicial para proteger escrita, ownership e participação.
- ⚠️ Descoberta federada existe, mas depende de índices e refinamento de consulta.
- ⚠️ Edição/exclusão ainda não expõem claramente, na UI, restrições por ownership.
- ❌ Aprovação/rejeição de solicitações de acesso pelo dono do ativo.
- ❌ Emissão de token/credencial de acesso após negociação.
- ❌ Contrato digital executável com enforcement completo de uso.

## Média Prioridade
- ✅ Landing page atualizada com problema, capacidades, benefícios e CTA.
- ⚠️ Consumo direto do ativo existe, mas a governança aplicada antes do acesso ainda é simplificada.
- ⚠️ Compliance e governance já armazenam políticas, mas sem mecanismo automatizado de decisão.
- ⚠️ Dashboard consolidado existe, mas ainda sem séries temporais e alertas operacionais.
- ❌ Modelagem semântica explícita em AAS/ECLASS.
- ❌ Publicação real em catálogo/broker federado externo.
- ❌ Fluxo de federação interorganizacional/gateway externo.
- ❌ Server Actions ou backend dedicado para operações sensíveis.
- ❌ Índices do Firestore formalizados para busca avançada.

## Baixa Prioridade
- ⚠️ Storage foi preparado na camada Firebase, mas ainda não é explorado funcionalmente.
- ❌ Exportação documental formal em PDF/DOCX dos registros.
- ❌ Analytics avançado de uso por ativo, federação e perfil.
- ❌ Automação de notificações para solicitações pendentes.
- ❌ Testes automatizados de integração e regressão.

## Sequência Recomendada
1. Implementar revisão de solicitações de acesso pelo `Data Owner`, com mudança de status em `accessRequests`.
2. Integrar emissão e validação de token de acesso após aceite da solicitação.
3. Formalizar o modelo semântico do ativo com estrutura compatível com AAS/ECLASS.
4. Introduzir índices do Firestore e paginação nas telas de busca, dashboard e auditoria.
5. Migrar operações sensíveis para camada server-side e adicionar testes automatizados.

## Trilha INTRA 1 a 5
- O detalhamento técnico da evolução para o cenário INTRA foi consolidado em `backlog_intra_dataspace.md`.
- O modelo de domínio usado como referência do código está em `src/lib/intra-dataspace.ts`.
- A recomendação atual é executar a trilha INTRA antes de tentar integração EDC/Gaia-X completa, porque ela organiza membership, convites, contratos e credenciais no plano de controle já existente.

## Observações
- O repositório já cobre bem o plano de controle do protótipo acadêmico.
- O maior gap restante não é CRUD, mas governança executável e interoperabilidade semântica real.
- As mudanças desta iteração foram deliberadamente incrementais para não quebrar o comportamento existente nem o padrão visual do projeto.
