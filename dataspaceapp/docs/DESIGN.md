# Design System — INTRA Dataspace

## Estilo visual

- Interface moderna, limpa e responsiva
- Minimalista com boa hierarquia visual
- Espaçamento consistente
- Foco em fluxos técnicos complexos com UX simplificada

## UI stack

- Tailwind CSS
- shadcn/ui
- lucide-react para ícones

## Regras de UI

- Usar shadcn/ui como base — evitar criar componentes do zero se existir equivalente.
- Componentes devem ser acessíveis.
- Layout mobile-first.
- Usar cards, tabs, dialogs e forms de forma consistente.
- Estados obrigatórios em toda feature:
  - `loading`
  - `empty`
  - `error`
  - `success`

## Padrão visual

- Bordas arredondadas
- Sombras leves
- Espaçamento generoso
- Tipografia clara
- Botões com feedback visual
- Formulários simples, em múltiplas etapas quando necessário

## Regras de UI específicas do INTRA Dataspace

- Páginas compartilhadas de detalhe (federação, ativo) podem ser lidas por owner e client.
- Ações de editar, ativar/desativar e excluir só aparecem para o owner do registro.
- Descoberta não implica autorização de consumo — deixar isso visualmente claro.
- Aceitar uma federação aberta não dispensa o contrato do ativo — fluxo separado.
- `ContractAgreement` revogado deve bloquear CTAs de consumo.
- Status de membership, acordo e token devem ser visíveis e atualizados.
- CTAs da federação variam por `admissionMode`:
  - `self-service` → "Join federation"
  - `approval` → "Request approval"
  - `invite-only` → "Accept invite"

## Organização de telas por papel

### Data Owner

- `/profile/connector` — identidade técnica do conector
- `/federations/create` — criação com `catalogVisibility` e `admissionMode`
- `/federations/[id]` — abas: Overview, Memberships, Invites, Agreement, Catalog Publication
- `/assets/create` — criação com `assetKind` e `exchangeMode`
- `/assets/[id]` — abas: Overview, Contract Offers, Agreements, Access Logs
- `/access/review` — fila de decisões sobre solicitações

### Data Client

- `/search` — descoberta filtrada por visibilidade e membership
- `/federations/[id]` — CTA conforme `admissionMode`
- `/assets/[id]` — ver ofertas, negociar contrato, iniciar consumo
- `/access` — separado em: Membership requests, Asset agreements, Consumption history
