# Features Essenciais Ainda Ausentes — Contexto Acadêmico de Dataspace

Este documento lista as funcionalidades que, segundo o estado da arte da literatura de Dataspaces
(IDSA Reference Architecture, Gaia-X, IDS-RAM 4.0, IDTA AAS Specification), são consideradas
**essenciais para caracterizar o sistema como um Dataspace válido** e não como uma integração
convencional. São gaps reais no protótipo atual.

---

## 1. Usage Control Engine (Controle de Uso Executável)

**O que é**: Mecanismo que interpreta e aplica políticas de uso *durante* e *após* o consumo,
não apenas no momento da concessão do token. Na literatura: ODRL (Open Digital Rights Language)
como linguagem de política executável.

**Por que é essencial**: No IDS-RAM, o Usage Control é o diferencial central de um Dataspace em
relação a um hub de APIs. Sem ele, a "política" é apenas texto — não tem enforcement técnico.

**O que falta no protótipo**:
- Políticas de uso representadas como ODRL (JSON-LD), não apenas como campos livres no Firestore
- Motor de avaliação de ODRL (interpret `odrl:action`, `odrl:constraint`, `odrl:obligation`)
- Restrições executáveis: `timeInterval`, `count`, `purpose`, `spatial`, `system`
- Obrigações pós-consumo: `notifyParty`, `deleteAfterUse`, `anonymize`
- PEP (Policy Enforcement Point) real que consulta PDP (Policy Decision Point) a cada requisição
- PIP (Policy Information Point) que fornece contexto ao PDP (hora, localização, contador de uso)

**Referências**:
- IDS Usage Control (IDSA)
- ODRL 2.2 W3C Recommendation
- Fraunhofer IESE — myData / IDS Usage Control

---

## 2. Verifiable Credentials (Identidade Verificável)

**O que é**: Credenciais criptograficamente verificáveis seguindo W3C Verifiable Credentials (VC)
e DID (Decentralized Identifiers). No IDS-RAM: Dynamic Attribute Token (DAT) e X.509 certificates.

**Por que é essencial**: O modelo de confiança do Dataspace depende de identidade técnica
verificável — qualquer participante deve poder provar quem é sem depender de um repositório
centralizado (o que o Firebase Auth provê é centralizado, não descentralizado).

**O que falta no protótipo**:
- Emissão de Verifiable Credentials para participantes (VC com assinatura do Issuer)
- DID Document para cada participante (`did:web:...`)
- Validação de VC no momento do handshake de Identity Trust
- Dynamic Attribute Token (DAT) no formato IDS com `@context`, `iss`, `sub`, `dat`, `aud`
- Assinatura criptográfica real em ContractAgreements (hoje é apenas campo de data)

**Referências**:
- W3C Verifiable Credentials Data Model 2.0
- IDS-RAM 4.0 — Identity Layer
- GAIA-X Trust Framework — Self-Descriptions

---

## 3. Dataspace Protocol (DSP) — Mensagens Padronizadas

**O que é**: O Dataspace Protocol (IDSA/IDTA) define as mensagens HTTP exatas que conectores
devem trocar para Catalog Request, Contract Negotiation e Transfer Process.

**Por que é essencial**: Para interoperabilidade com outros conectores (ex.: EDC, TRUE Connector,
Connector-X). Sem DSP, o sistema é proprietário e não interopera com o ecossistema real de
Dataspaces industriais.

**O que falta no protótipo**:
- `POST /catalog/request` — DSP Catalog Request Message
- `POST /negotiations` — ContractRequestMessage / ContractOfferMessage / ContractAgreementMessage
- `POST /transfers` — TransferRequestMessage / TransferStartMessage / TransferSuspensionMessage
- Mensagens DSP no formato JSON-LD com `@context: "https://w3id.org/dspace/v0.8/context.json"`
- Endpoint `/.well-known/dspace-version` declarando suporte ao protocolo
- Compatibilidade com EDC (Eclipse Dataspace Components) como referência de implementação

**Referências**:
- IDSA Dataspace Protocol Specification v0.8 (2024)
- Eclipse Dataspace Components (EDC) — Management API v3
- IDTA AAS Part 2 — API Specification

---

## 4. Self-Description / Trust Anchor (Gaia-X)

**O que é**: Documento JSON-LD assinado que descreve o participante, seus ativos e suas claims
de conformidade (o que o Gaia-X chama de Self-Description / Verifiable Presentation).

**Por que é essencial**: No Gaia-X Trust Framework, todo participante publica uma Self-Description
assinada que outros participantes usam para verificar confiança *antes* de iniciar qualquer
negociação. É o Trust Anchor do ecossistema.

**O que falta no protótipo**:
- `GET /api/self-description` por participante — retorna Verifiable Presentation JSON-LD
- Registro de Self-Description no Gaia-X Catalogue (ou simulação local)
- Validação de Self-Description de outros participantes no handshake de connector connection
- Campos `gx:legalName`, `gx:legalRegistrationNumber`, `gx:headquarterAddress` nas descrições

**Referências**:
- Gaia-X Trust Framework 22.10
- IDSA InfoModel — Self-Description
- Gaia-X AISBL — Self-Description Schema

---

## 5. Provenance & Lineage (Rastreabilidade de Linhagem)

**O que é**: Registro auditável da origem, transformações e cadeia de custódia de um dado ao
longo de sua vida útil no ecossistema. Na literatura: Data Provenance (W3C PROV-O).

**Por que é essencial**: Para conformidade regulatória (LGPD/GDPR), disputas contratuais e
auditoria acadêmica. Um dado consumido por um participante precisa ter sua linhagem rastreável
até a origem (CPS físico).

**O que falta no protótipo**:
- Registro de provenance em formato W3C PROV-O (`prov:wasGeneratedBy`, `prov:wasDerivedFrom`)
- `dataLineage` submodel no AAS do ativo (IDTA 02026)
- Registro de cada transferência no `accessLogs` com referência ao `contractAgreementId` e
  ao `assetId` do CPS de origem
- Rastreabilidade: origem (CPS) → token → consumo → transformação (se houver)

**Referências**:
- W3C PROV-O Ontology
- IDTA Submodel Template "Data Chain" (em desenvolvimento)
- IDSA Information Model — Data Provenance

---

## 6. Federated Catalog — Query via SPARQL / Knowledge Graph

**O que é**: Catálogo federado implementado como grafo de conhecimento (RDF/OWL), consultável
via SPARQL. É a tecnologia que permite descoberta semântica real — não apenas busca textual.

**Por que é essencial**: A arquitetura atual usa Firestore para o catálogo, o que é aceitável
para o protótipo, mas academicamente o catálogo federado de Dataspaces industriais deve ser
baseado em metadados semânticos interoperáveis (AAS, ECLASS, IDS InfoModel).

**O que precisa ser feito** (futuro, conforme planejado):
- Migrar catálogo para Knowledge Graph (ex.: Apache Jena, Oxigraph, ou Neo4j)
- Indexar submodelos AAS dos ativos como grafos RDF
- Expor endpoint SPARQL para consulta semântica
- Mapeamento ECLASS → OWL/RDF para enriquecimento semântico
- Federação real: cada conector mantém seu subcatálogo e o federated catalog agrega via SPARQL
  federation (`SERVICE` keyword)

**Referências**:
- IDSA Federated Catalogue (FCC) Architecture
- Eclipse Dataspace Components — Federated Catalog Crawler
- IDTA AAS Metamodel — Concept Description
- IDS Information Model (https://github.com/International-Data-Spaces-Association/InformationModel)

---

## 7. Transfer Process State Machine (DSP)

**O que é**: Máquina de estados para a fase de transferência de dados definida no Dataspace
Protocol: REQUESTED → STARTED → SUSPENDED → COMPLETED / TERMINATED.

**Por que é essencial**: O protótipo atual vai diretamente de "token emitido" para "consumo" sem
uma máquina de estados formal de transferência. No DSP real, o TransferProcess é uma entidade
gerenciada com lifecycle próprio, separado do ContractAgreement.

**O que falta**:
- Coleção `transferProcesses` no Firestore com estados DSP
- Endpoint `POST /api/transfers` para iniciar um TransferProcess
- `TransferStartMessage` enviado pelo provider sidecar quando a transferência começa
- `TransferTerminationMessage` para encerrar a transferência formalmente
- EDR (Endpoint Data Reference) gerado a partir do TransferProcess (não do accessRequest)

---

## 8. Data Product Specification (Produto de Dados Formal)

**O que é**: Especificação formal de um ativo de dados como "Data Product" — um conceito do
Data Mesh / Dataspace Literature. Inclui: contrato de dados (SLO/SLA), schema formal, qualidade
de dados, observabilidade.

**Por que é essencial**: No contexto acadêmico de dissertação sobre Dataspaces, a noção de
"Data Product" como unidade de governança é central. Um ativo no INTRA Dataspace deveria ser
especificado como um Data Product com SLOs, schema versionado e métricas de qualidade.

**O que falta**:
- Submodel AAS `DataProduct` com: `outputSchema` (JSON Schema / Avro), `SLO` (latência,
  disponibilidade, freshness), `qualityMetrics` (completude, acurácia)
- Campo `dataProductSpec` no registro de ativo do Firestore
- Versionamento de schema do ativo (semver) visível no catálogo
- Métricas de qualidade observáveis via sidecar (ex.: `GET /api/equipment/cnc/quality`)

---

## Síntese — Priorização Acadêmica

| Feature | Esforço | Impacto Acadêmico | Prioridade |
|---------|---------|------------------|------------|
| ODRL Usage Control Engine | Alto | Muito Alto — diferencial técnico central | 1 |
| DSP Protocol Messages | Médio | Muito Alto — interoperabilidade com EDC | 2 |
| Verifiable Credentials | Alto | Alto — identidade técnica real | 3 |
| Transfer Process SM | Baixo | Alto — completar o fluxo DSP | 4 |
| Self-Description JSON-LD | Médio | Médio — alinhamento Gaia-X | 5 |
| Data Product Spec | Médio | Médio — alinhamento Data Mesh | 6 |
| Provenance W3C PROV-O | Médio | Médio — rastreabilidade formal | 7 |
| Knowledge Graph Catalog | Alto | Alto — mas planejado para futuro | 8 |

**Recomendação**: Para a dissertação, implementar ODRL Usage Control (mesmo que simplificado)
e DSP Protocol Messages (mesmo que para o subconjunto Catalog + Negotiation) seria suficiente
para argumentar que o protótipo está alinhado ao estado da arte.
