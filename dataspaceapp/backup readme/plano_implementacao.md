# Plano de Implementacao

## Referencias Canonicas

- `requisitos_software.md`: especificacao formal dos requisitos por epico, do `Identity Trust` ao consumo P2P.
- `modelo_connector_intra.md`: modelo conceitual do conector INTRA e da separacao entre federacao, ativo, contrato e token.
- `backlog_intra_dataspace.md`: backlog tecnico gradativo `0 -> 5`.
- `src/lib/intra-dataspace.ts`: tipos, estados e colecoes do dominio implementado no codigo.

## Cobertura Atual do Prototipo

### Epico 0. Infraestrutura e Identity Trust

- `parcialmente coberto`
- existe autenticacao de usuario, perfil de conector e aprovacao de `connectorConnections`
- falta endurecer a camada de identidade tecnica com `connectorCredentials`, rotacao formal de credenciais e `identityTokens` dedicados

### Epico 1. Setup e Governanca do Provedor

- `coberto no plano de controle`
- owner cria conector, federacao, compliance, ativo, governance e publica ofertas
- federacao e ativo ja suportam visibilidade, admissao, semantica e governanca local

### Epico 2. Onboarding e Identidade do Consumidor

- `coberto no fluxo principal`
- client registra conector, estabelece conexao com owner, solicita membership e recebe credencial de federacao
- falta apenas refinar a separacao entre sessao humana e token tecnico do conector

### Epico 3. Descoberta de Servicos

- `coberto`
- o catalogo mostra metadados publicados e respeita visibilidade, membership e ownership
- ainda vale evoluir indices e busca semantica mais forte

### Epico 4. Negociacao de Contrato e Tokenizacao

- `coberto no fluxo principal`
- contract offer, agreement, credential grant e access token de vida curta ja existem
- falta reforcar assinatura criptografica e claims padronizadas de estilo DSP/OAuth

### Epico 5. Consumo P2P e Policy Enforcement

- `parcialmente coberto`
- o client ja consome dado diretamente do endpoint do ativo com token curto
- falta um sidecar real ou endpoint backend dedicado que valide o token no edge como `PEP`

## Ordem Recomendada de Evolucao

1. Implementar a camada dedicada de `connectorProfiles`, `connectorCredentials` e `identityTokens` para fechar o Epico 0.
2. Extrair a logica critica de decisoes, emissao de credenciais e tokenizacao para rotas server-side e servicos compartilhados.
3. Criar um `sidecar` HTTP/MQTT simplificado para validar `accessTokens` e atuar como `Policy Enforcement Point`.
4. Endurecer `firestore.rules` e fluxos Admin para refletir integralmente a separacao entre trust, membership, agreement e consumo.
5. Ampliar testes automatizados para cobrir falhas de autenticacao, expiracao de token, revogacao e bloqueio por policy.

## Validacao Recomendada

- `npm run lint`
- `npm run test:e2e:full`

O teste `e2e/intra-full-flow.spec.ts` deve permanecer como cenario de validacao de ponta a ponta do processo descrito nos epicos.
