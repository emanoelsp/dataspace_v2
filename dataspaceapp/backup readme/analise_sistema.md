# Análise do Sistema Atual

## Arquitetura atual
### Estrutura do Next.js
- O projeto usa `Next.js 15` com `App Router`.
- Não há diretório `pages/`; a navegação é organizada em `src/app`.
- A maioria das páginas é `client component`, especialmente nos fluxos de cadastro, navegação e consumo.

### Organização de componentes
- `src/components/header.tsx`: header com autenticação, login e cadastro.
- `src/components/nav.tsx`: navegação principal por áreas `Data Owner` e `Data Client`.
- `src/components/signin.tsx` e `src/components/signup.tsx`: formulários de autenticação.
- `src/components/toast.tsx`: feedback de sucesso/erro.

### Organização funcional em `src/app`
- `/`: landing page.
- `/federations`: criação, listagem e detalhe de federações.
- `/assets`: criação, listagem e detalhe de ativos.
- `/accordance/compliance`: cadastro, listagem e detalhe de conformidade.
- `/accordance/governance`: cadastro de governança.
- `/search`: descoberta de federações e ativos.
- `/access`: solicitação de acesso.
- `/dashboard`: visão consolidada do ecossistema.

### Integração com Firebase
- `src/lib/firebase.tsx` centraliza `app`, `auth`, `db` e `storage`.
- O sistema usa Firebase Auth para cadastro/login e Firestore como persistência do plano de controle.
- Coleções observadas no código:
  - `users`
  - `federations`
  - `assets`
  - `compliance`
  - `governance`
  - `accessRequests`
  - `accessLogs`
- Foi adicionada uma base inicial de `firestore.rules`, mas ainda depende de publicação no projeto Firebase.

## O que já existe
- Landing page robusta com narrativa de federação, onboarding de CPS e consumo de dados.
- Cadastro de usuário com persistência em `users`.
- Login funcional via Firebase Auth.
- Cadastro de federações em múltiplas etapas.
- Cadastro de ativos em múltiplas etapas com teste de endpoint.
- Cadastro de compliance com base legal, termos, consentimento e assinatura.
- Cadastro de governança com federação, ativos, políticas, auditoria e períodos de uso.
- Busca e navegação por ativos e federações.
- Detalhe de ativos com consulta em endpoint externo/simulado.
- Solicitação de acesso persistida em Firestore.
- Registro de log de acesso ao iniciar consulta autenticada.
- Dashboard com métricas reais do Firestore.

## O que atende aos requisitos
- Gestão de identidade e confiança:
  Atendido parcialmente. Há autenticação e identificação básica dos participantes.
- Catálogo federado:
  Atendido parcialmente. Existem coleções de federação e ativos com descoberta básica.
- Governança e conformidade:
  Atendido parcialmente. Há registros de compliance e governance, porém ainda sem motor de política executável.
- Rastreabilidade:
  Atendido parcialmente. Solicitações e inícios de consumo já podem ser auditados.
- Consumo direto na fonte:
  Atendido parcialmente. O detalhe do ativo consome diretamente o endpoint, sem proxy central.
- Dashboard operacional:
  Atendido parcialmente. Métricas básicas foram conectadas ao Firestore.

## O que falta
- Aprovação/rejeição operacional de solicitações de acesso pelo proprietário do ativo.
- Negociação de contratos digitais executáveis e emissão real de token de acesso.
- Modelo semântico baseado em AAS/ECLASS no código, e não apenas no discurso/metadata livre.
- Publicação real em broker federado e integração interorganizacional.
- Regras de UI para ownership em todas as telas de edição/exclusão.
- Camada server-side para operações sensíveis, hoje concentradas no cliente.
- Testes automatizados e validação de regressão.
- Índices formais do Firestore para consultas mais sofisticadas da página de busca.

## Problemas técnicos
- Predominância de `client components`, mesmo em páginas que poderiam ser parcialmente renderizadas no servidor.
- Escritas e leituras sensíveis ocorrem direto no cliente; isso aumenta dependência das regras do Firestore.
- Parte do sistema ainda depende de dados não normalizados e campos opcionais inconsistentes.
- A busca usa consultas relativamente complexas no Firestore e pode exigir índices adicionais em ambiente real.
- Não há camada de tipos/dominios mais forte para representar AAS, contratos, tokens ou semântica industrial.
- Não há suíte de testes nem validação automatizada de fluxos críticos.
- Algumas rotas do mega menu ainda apontam para páginas não implementadas.

## Riscos
- Risco funcional:
  Sem fluxo de aprovação do proprietário, a negociação de acesso ainda está incompleta.
- Risco de segurança:
  Se `firestore.rules` não for publicada, o enforcement real continua frágil.
- Risco de escalabilidade:
  A busca e dashboards podem degradar com crescimento de documentos sem índices e paginação.
- Risco arquitetural:
  A ausência de uma camada semântica explícita limita a aderência prática ao objetivo de interoperabilidade AAS/ECLASS.
- Risco de manutenção:
  A falta de testes aumenta o custo de evolução incremental segura.

## Síntese
O sistema já representa bem o plano de controle do protótipo descrito na qualificação: identidade, federação, catálogo, conformidade, governança e início do fluxo de consumo. O principal gap atual não está mais em CRUDs básicos, e sim na profundidade do dataspace: contratos executáveis, enforcement completo, semântica industrial formal e federação externa.
