# Arquitetura para Agentes de IA

> Use este arquivo apenas quando o projeto for um **Sistema Web com Agente de IA**.

## Stack de IA

- LLM provider configurável
- Temperatura configurável
- Top-p configurável
- Top-k configurável (quando suportado)
- System prompt versionado
- Tool calling
- Guardrails
- Orquestrador de ferramentas
- RAG com Pinecone
- Rerank com Cohere
- Logs de execução
- Observabilidade LLM

## Recomendados

- LangGraph ou Mastra para orquestração
- Inngest ou Trigger.dev para jobs assíncronos
- Upstash Redis para cache e rate limit
- Langfuse ou Helicone para observabilidade
- Zod para validar entradas e saídas das tools

## Regras para agentes

- Nunca executar ferramenta sem validar input.
- Toda tool deve ter schema Zod.
- Toda resposta crítica deve passar por guardrail.
- Logs devem registrar:
  - input
  - output
  - tool calls
  - tokens
  - custo estimado
  - erro (se houver)
- RAG deve citar fontes internas quando aplicável.
- Separar prompt de sistema, prompt de tarefa e contexto.
- Versionar prompts importantes.

## Estrutura sugerida

```txt
/src/ai
  /agents
  /tools
  /prompts
  /rag
  /guardrails
  /schemas
  /evaluations
```

## Configuração esperada

O sistema deve permitir configurar:
- Modelo
- Temperatura
- Top-p
- Top-k
- Máximo de tokens
- Rerank on/off
- RAG on/off
- Guardrails on/off
