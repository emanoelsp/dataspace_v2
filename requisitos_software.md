# Requisitos de Software

## Visão Geral
Este sistema implementa uma Prova de Conceito de um Dataspace multicamada para manufatura avançada, com foco no plano de controle de um ecossistema federado de dados. A solução atual utiliza Next.js (App Router), Tailwind CSS e Firebase para orquestrar identidade, federação, catálogo, conformidade, governança, solicitações de acesso e rastreabilidade.

O documento de qualificação de mestrado define como problema central a existência de silos de dados em ambientes industriais brownfield, nos quais ativos heterogêneos precisam compartilhar dados de forma interoperável, soberana, segura, auditável e governada, sem centralização física do payload.

## Problema
Arquiteturas industriais tradicionais, hierárquicas e centralizadas, dificultam:

- a interoperabilidade entre sistemas legados e modernos;
- a descoberta dinâmica de ativos e capacidades;
- o compartilhamento seguro e governado de dados;
- a preservação da soberania do dado na origem;
- a rastreabilidade e a conformidade das trocas.

O sistema precisa reduzir o atrito de integração intraorganizacional e preparar os ativos para futura federação interorganizacional.

## Objetivo do Sistema
Conceber e operacionalizar uma arquitetura de Dataspace multicamada baseada em princípios IDSA, Gaia-X e RAMI 4.0 para permitir que sistemas computacionais e sistemas ciberfísicos industriais compartilhem dados de forma interoperável, soberana, segura, governada e com conformidade.

## Requisitos Funcionais
- `RF01` O sistema deve permitir cadastro e autenticação de participantes via Firebase Auth.
- `RF02` O sistema deve manter perfis de usuários com papel de `Data Owner` ou `Data Client`.
- `RF03` O sistema deve permitir criar, consultar, editar e excluir federações de dados.
- `RF04` O sistema deve permitir cadastrar ativos de dados/CPS vinculados a uma federação.
- `RF05` O sistema deve armazenar metadados do ativo, incluindo tipo, propósito, endpoint, formato, acesso e identificador semântico.
- `RF06` O sistema deve permitir registrar conformidade, base legal, termos, consentimento e assinatura digital.
- `RF07` O sistema deve permitir registrar políticas de governança por federação e por conjunto de ativos.
- `RF08` O sistema deve disponibilizar catálogo federado para descoberta de federações e ativos.
- `RF09` O sistema deve permitir solicitações de acesso a ativos com declaração explícita de finalidade de uso.
- `RF10` O sistema deve registrar trilhas de auditoria de solicitações de acesso e início de consumo.
- `RF11` O sistema deve permitir a consulta direta ao endpoint do ativo após aceite de conformidade no fluxo de consumo.
- `RF12` O sistema deve apresentar visão operacional consolidada em dashboard com métricas do ecossistema.
- `RF13` O sistema deve persistir metadados de ownership e atualização para os documentos de controle.
- `RF14` O sistema deve preparar a estrutura de dados para futura federação interorganizacional, sem exigir reestruturação física dos ativos.

## Requisitos Não Funcionais
- Performance:
  O sistema deve usar renderização e composição do Next.js de forma compatível com App Router, mantendo o plano de controle separado do plano de dados. Quando possível, a troca de payload deve ocorrer diretamente no endpoint do ativo, sem proxy central.
- Segurança:
  Escritas devem exigir autenticação. As regras do Firestore devem restringir criação, leitura e mutação conforme ownership, requester e participação no fluxo de acesso.
- Escalabilidade:
  A modelagem deve evitar duplicação desnecessária de dados e manter coleções separadas para federação, ativos, conformidade, governança, solicitações e logs.
- Usabilidade:
  Os fluxos principais devem permanecer navegáveis, responsivos, com feedback de sucesso/erro e progressão guiada por etapas.
- Manutenibilidade:
  As mudanças devem ser incrementais, reutilizando componentes e padrões existentes do projeto.
- Observabilidade:
  Eventos relevantes do plano de controle devem ser persistidos com timestamp e identidade do usuário.

## Regras de Negócio
- `RN01` Somente usuários autenticados podem criar novos registros de federação, ativo, compliance, governança, solicitação de acesso e log de acesso.
- `RN02` Toda federação deve possuir nome, descrição, organização, tipo, domínio principal e contato.
- `RN03` Todo ativo deve estar vinculado a uma federação existente.
- `RN04` Todo ativo deve possuir endpoint técnico válido para consumo federado.
- `RN05` Toda solicitação de acesso deve conter finalidade de uso declarada.
- `RN06` O consumo de dados deve ser precedido por aceite explícito de conformidade/contrato.
- `RN07` O sistema não deve centralizar o payload operacional do ativo como regra arquitetural.
- `RN08` Registros do plano de controle devem incluir metadados de ownership e timestamps de criação/atualização.
- `RN09` Logs de acesso devem ser imutáveis após criação.
- `RN10` A descoberta deve operar sobre metadados, e não sobre replicação obrigatória do dado.
- `RN11` A federação deve preservar a soberania do proprietário do dado sobre quem acessa e sob quais condições.
- `RN12` O modelo deve ser compatível com futura extensão para contratos digitais mais robustos e federação externa.

## Critérios de Aceitação
- `CA01` Um usuário consegue criar conta, autenticar-se e permanecer identificado no header.
- `CA02` Um usuário autenticado consegue criar uma federação e o documento salvo contém `ownerId`, `ownerEmail`, `createdAt` e `updatedAt`.
- `CA03` Um usuário autenticado consegue cadastrar um ativo vinculado a uma federação e com endpoint válido.
- `CA04` Um usuário autenticado consegue registrar compliance e governança com rastreabilidade de ownership.
- `CA05` Um usuário autenticado consegue solicitar acesso a um ativo e a solicitação fica persistida em `accessRequests`.
- `CA06` Ao iniciar a consulta de um ativo autenticado, o sistema registra um evento em `accessLogs`.
- `CA07` O dashboard apresenta contagens reais oriundas do Firestore para federações, ativos, compliance, governança, solicitações e logs.
- `CA08` A landing page comunica claramente problema, funcionalidades centrais, benefícios e CTA sem romper o layout existente.
- `CA09` O sistema continua operando com App Router, Tailwind e Firebase sem mudança de arquitetura global.
