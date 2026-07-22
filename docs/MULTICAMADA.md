# "Cadê a multicamada?" — resposta de defesa e estado da implementação

> Preparação para a banca (Prof. Ayala fará comparativos com o piloto Brasil–UE).
> Este documento vira texto da dissertação na versão final.

## A resposta em 30 segundos

A arquitetura é multicamada **por construção de prontidão (readiness), não por
duplicação de implementação**. A camada **Intra** está implementada e medida:
governança, contratos, tokens e plano de dados P2P auditado na borda. A camada
**Inter** é materializada por **um gateway seletivo já funcional**
(`/api/gateway/catalog`): o catálogo interno é exposto para fora **filtrado
pelas políticas locais** — só federações públicas, só metadados e semântica
(AAS/ECLASS/capacidades), **nunca** endpoints de dados. Qualquer consumo
externo cai obrigatoriamente no mesmo funil soberano do intra: admissão na
federação → contrato → token → Sidecar PEP dentro da fábrica.

## Os três argumentos que sustentam a resposta

1. **A fronteira intra/inter é uma política, não uma nova arquitetura.** O que
   muda de uma camada para outra é *quem confia em quem* — e isso já é
   parametrizado: `catalogVisibility` decide o que o gateway expõe;
   `admissionMode` decide como se entra; a governança do ativo viaja com o
   token até o PEP. O gateway inter é a MESMA máquina de governança com um
   recorte de visibilidade mais estreito.

2. **Prontidão demonstrável.** O ativo interno já carrega tudo o que a camada
   inter precisa: identidade AAS (aasId), semântica ECLASS/IRDI, capacidades
   colhidas do próprio CPS e política de uso herdável. A exposição externa é
   uma projeção (seletiva) desse registro — demonstrada pelo gateway — e não
   um novo cadastro. É exatamente o conceito de "readiness" defendido na
   dissertação (Acatech/RAMI: resolver o dever de casa interno antes de
   federar para fora).

3. **O que falta é confiança forte, e isso está declarado.** A diferença real
   entre a PoC inter e um Gaia-X pleno é o arcabouço de identidade
   (DAPS/SSI, certificação) — item explícito do roadmap (Cap. 7), com a
   simplificação atual (chave compartilhada de gateway) declarada no texto.
   A banca não pode cobrar surpresa do que está assumido.

## Estado por componente

| Componente | Estado |
|---|---|
| Plano de controle intra (federações, contratos, compliance, governança) | ✅ implementado |
| Plano de dados intra (Sidecar PEP, tokens, logs, P2P na borda) | ✅ implementado e medido (Cenário 1) |
| Herança de governança política→token→PEP→log | ✅ implementado |
| **Gateway Inter (catálogo seletivo DCAT-like)** | ✅ implementado (`/api/gateway/catalog`, chave via `GATEWAY_API_KEY`) |
| Identidade forte inter (DAPS/SSI) | 📋 roadmap declarado (Cap. 7) |
| Federação Gaia-X plena / Dataspace Protocol completo | 📋 roadmap declarado (Cap. 7) |

## Comparativo com o piloto Brasil–UE (pergunta provável do Prof. Ayala)

- O demonstrador Brasil–UE é **inter** por natureza (empresas distintas,
  conector EDC/Angular, nuvem): resolve confiança entre organizações.
- Esta dissertação ataca o degrau **anterior e complementar**: o chão de
  fábrica de UMA organização, com latência crítica e legados — e entrega a
  *prontidão* para participar de demonstradores como o deles via gateway.
- Frase de defesa: *"O piloto nacional mostra o ecossistema entre empresas;
  este trabalho mostra como uma fábrica fica pronta para entrar nele sem
  abrir mão da soberania interna — e o gateway é a tomada onde o conector
  deles se pluga."*

## Integração com o trabalho do Marcos (ACSM)

Ver `docs/INTEGRACAO-MARCOS.md` — contrato de integração com endpoints e
exemplos: descoberta (UDDI/gateway), contrato+token, consumo via PEP com
governança nos headers, e registro dos CPS dele no mesmo sidecar.
