# Handoff para Claude Code - Glutec Clinica

Data do handoff: 2026-05-01
Projeto local: `C:\Users\wesle\Downloads\Projeto Glutec Atual`
Branch atual: `main`
Commit atual: `7819bd9` (`Rotate session cookie after timeout hardening`)
Estado local no momento do handoff: limpo antes da criacao deste arquivo e do script `scripts/sync-ondoctor-agenda.mjs`.

## Leia Isto Primeiro

O usuario esta construindo o sistema Glutec Clinica e vai continuar no Claude Code. Nao assuma que dados locais, arquivos exportados antigos, GitHub ou banco antigo representam a agenda atual. Para agenda, a fonte de verdade e a agenda atual do OnDoctor exibida no site, via API atual do proprio OnDoctor.

Nao salve senhas em arquivos. Se precisar acessar OnDoctor ou VPS, peca ao usuario as credenciais no momento. Use variaveis de ambiente para scripts.

## Ultimo Trabalho Concluido

Foi feita sincronizacao direta da agenda atual do OnDoctor para o banco de producao do Glutec, a partir de `2026-04-01`.

Endpoints OnDoctor descobertos e usados:

- Login: `POST https://api.ondoctor.app/v1/login/auth`
- Lista da agenda usada pelo site: `GET /agenda/empresa/{idEmpresa}/tipo/todos/sala/0/situacao/todas/convenio/0/dtIni/{from}/dtFim/{to}/visualizacao/lista?profissionais={idUsuario}`
- Detalhe de agendamento: `GET /agenda/{id}`
- Cadastro do paciente: `GET /cliente/{idCliente}`

Resultado da sincronizacao executada em producao:

- Fonte consultada: OnDoctor atual, periodo `2026-04-01` ate `2027-12-31`
- Agendamentos atuais retornados: `140`
- Status OnDoctor retornados: `Atendido=26`, `Confirmar=94`, `Cancelado=1`, `Chegou=1`, `Em atendimento=18`
- Inseridos no Glutec: `107`
- Atualizados no Glutec: `33`
- Pacientes criados por aparecerem na agenda e ainda nao existirem no Glutec: `3`
- Origem antiga normalizada: `sourceSystem` de `ondoctor` para `onedoctor` em `appointments` e `patients`
- Linhas antigas/duplicadas removidas: `117`
- Total final no banco para `sourceSystem='onedoctor'` desde `2026-04-01`: `140`

Conferencia especifica de `2026-04-30` apos limpeza:

- `14:00` Valdemar Rondon Jose, status `em_atendimento`, sala `Consultorio 1`
- `14:30` Lilyan Kelly Pedao Tiburcio, status `em_atendimento`, sala `Consultorio 1`
- `15:30` Fernanda Maria Andrade Pereira, status `agendada`, sala `Centro cirurgico`

Observacao de timezone: MySQL guarda `scheduledAt` como `datetime`. Ao imprimir por Node/JSON pode aparecer com deslocamento UTC, mas os horarios inseridos sao locais a partir de `data + horarioIni` do OnDoctor.

## Script Criado Para Continuidade

Arquivo local criado:

- `scripts/sync-ondoctor-agenda.mjs`

Ele nao contem senhas. Use assim, com variaveis de ambiente:

```powershell
$env:ONDOCTOR_EMAIL="..."
$env:ONDOCTOR_PASSWORD="..."
$env:DATABASE_URL="mysql://..."
$env:DOCTOR_ID="1"
$env:ONDOCTOR_SYNC_FROM="2026-04-01"
$env:ONDOCTOR_SYNC_TO="2027-12-31"
$env:DRY_RUN="1"
node scripts/sync-ondoctor-agenda.mjs
```

No VPS, o `DATABASE_URL` ja esta no `.env` da aplicacao em `/var/www/glutec-clinica`; execute de la, sem expor o valor.

## Commits Recentes Importantes

- `7819bd9` Rotate session cookie after timeout hardening
- `9d7298c` Apply session timeout to all auth flows
- `a9feee8` Fix clinical security and appointment display issues
- `1aefc7b` Update anamnesis intake and registration flow
- `123b731` Fix public anamnesis and patient record numbers
- `006767b` Fix anamnesis privacy, CID picker, and address repair
- `9998f2e` Create optional module tables and fix escaped labels
- `435b4f6` Audit pages and harden optional modules

## Correcoes Ja Implementadas Antes Deste Handoff

- Foto de perfil do prontuario nao deve ser trocada automaticamente por anexos comuns. Somente anamnese publica ou admin devem alterar foto de perfil.
- Lista de CID no atendimento foi refeita para funcionar com favoritos, busca e rolagem.
- Salvar evolucao nao exige CID; finalizar consulta exige CID.
- Sessao endurecida: timeout de 60 minutos de inatividade e cookie rotacionado para `app_session_v3`.
- Audio de transcricao passou a ler uploads protegidos do disco no backend, evitando erro 401.
- Agenda tem dedupe de exibicao por paciente/profissional/horario, escolhendo status mais forte/mais recente.
- Anamnese publica recebeu ajustes de sigilo, sexo biologico/genero e envio.
- Pacientes receberam numero de prontuario e busca mostra numero.
- Varios textos importados foram limpos para remover HTML/codigos de caracteres.

## Arquivos Que Merecem Atencao

- `server/db_complete.ts`
  - Funcoes de pacientes, agendamentos, dedupe de agenda, anamnese publica, documentos e historico.
  - Area de agendamentos em torno de `createAppointment`, `getAppointmentsByDateRange`, `dedupeAppointmentsForDisplay`.
- `server/routers.ts`
  - Rotas tRPC para `appointments`, pacientes, anamnese, prescricoes, documentos.
- `server/_core/index.ts`
  - Autenticacao, cookies/sessao, uploads e endpoints HTTP auxiliares.
- `client/src`
  - Telas do prontuario, agenda, anamnese publica, configuracoes e layouts.
- `scripts/sync-ondoctor-agenda.mjs`
  - Script novo para repetir sincronizacao atual da agenda OnDoctor, com `DRY_RUN=1` por padrao recomendado.

## Pontos De Cuidado

- Nao use CSVs/exportacoes antigas como fonte da agenda atual.
- Para agenda, use sempre `sourceSystem='onedoctor'` e `sourceId=<id do agendamento OnDoctor>`.
- Havia historico com `sourceSystem='ondoctor'`; ja foi normalizado para `onedoctor` em producao.
- Se o OnDoctor remover um agendamento que ja existe no Glutec, o script pode marcar/remover conforme politica. Na sincronizacao executada, os registros antigos duplicados/stale foram removidos para a agenda refletir apenas a fonte atual.
- Se houver paciente sem cadastro no Glutec, buscar `GET /cliente/{idCliente}` e criar com endereco/CEP/telefone/email quando disponiveis. Para cidade/UF, se o OnDoctor vier apenas com codigo interno, resolver via CEP.
- Nao imprimir credenciais, tokens, `DATABASE_URL` nem dados sensiveis em respostas finais.

## Prompt Para Colar No Claude Code

Cole este prompt no Claude Code:

```text
Continue o projeto Glutec Clinica exatamente de onde o Codex parou.

Contexto essencial:
- Projeto local: C:\Users\wesle\Downloads\Projeto Glutec Atual
- Branch: main
- Commit base: 7819bd9
- Leia primeiro o arquivo HANDOFF_CLAUDE_2026-05-01.md.
- Existe um script novo em scripts/sync-ondoctor-agenda.mjs para sincronizar a agenda atual do OnDoctor de forma idempotente, sem senhas embutidas.

Regras importantes:
- Nao use dados antigos de diretoria local, GitHub, CSVs antigos ou VPS como fonte da agenda. A agenda atual deve vir do site/API do OnDoctor.
- Nao grave senhas em arquivos. Se precisar, solicite as credenciais ao usuario e use variaveis de ambiente.
- Para agenda, use sourceSystem='onedoctor' e sourceId igual ao ID original do agendamento no OnDoctor.
- Antes de qualquer escrita em producao, rode DRY_RUN=1 e mostre contagem de inseridos/atualizados/removidos.
- Preserve alteracoes existentes; nao use git reset hard nem reverta trabalho do usuario.
- Para mudancas de codigo, rode build/testes possiveis, commit e push somente quando o usuario pedir.

Estado da ultima tarefa:
- A agenda do Glutec foi sincronizada com OnDoctor de 2026-04-01 ate 2027-12-31.
- Resultado final em producao: 140 agendamentos OnDoctor atuais desde 2026-04-01.
- Foram removidas duplicidades antigas causadas por sourceSystem grafado como ondoctor/onedoctor.
- O dia 2026-04-30 foi conferido e ficou sem duplicacao aparente.

Proxima acao recomendada:
1. Verificar `git status`.
2. Ler `HANDOFF_CLAUDE_2026-05-01.md`.
3. Se o usuario pedir nova sincronizacao de agenda, usar `scripts/sync-ondoctor-agenda.mjs` com DRY_RUN=1 primeiro.
4. Se mexer em codigo, manter padroes do projeto e validar com build.
```

