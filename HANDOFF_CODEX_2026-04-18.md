# Handoff para Codex - 2026-04-18

**Repo:** https://github.com/drwesleycamara2/glutec-clinica  
**Branch:** `main`  
**VPS:** `129.121.52.61:22022` (root / Iskursais10@)  
**URL produção:** https://sistema.drwesleycamara.com.br (`systemd: glutec`)  
**Working dir:** `C:\Users\wesle\OneDrive\Documentos\New project\glutec-clinica`  
**Package manager:** `pnpm`  
**MySQL produção:** container Docker `glutec-mysql`, banco `glutec`  
**Observação importante:** o prompt antigo informava a senha root como `Glutec@2026!`, mas na produção atual o ambiente está com `Glutec@User2026!` e `DATABASE_URL` usando `glutec_user`.

---

## Estado desta rodada

Nesta rodada havia 10 tarefas mapeadas. As 10 estão concluídas e deployadas em produção.

As 9 primeiras já estavam concluídas antes da continuação deste trabalho:

1. Certillion - botão "Testar conexão"
2. Editar cadastro de paciente - erro de `UPDATE` SQL
3. Botão "Nova Consulta" no topo
4. UI da Evolução reorganizada (Salvar/Finalizar + CID no fim)
5. CID-10 favoritos por profissional
6. Exclusão de modelos de documentos
7. Deploy anterior concluído com override de `lucide-react`
8. Separação correta entre Anamnese e Evolução
9. Auditoria de edição pós-finalização (`clinical_evolution_edit_log`)

---

## Tarefa 10 concluída

### Secretária - view limitada de prontuário

**Regra pedida pelo usuário:** recepcionista/secretária pode registrar observações operacionais no prontuário, mas não pode visualizar o conteúdo clínico inserido por médicos, nem anexos clínicos, nem conteúdo de anamnese médica.

### O que foi implementado

#### Banco / migration
- Nova migration: `drizzle/migrations/0210_secretary_notes_on_clinical_evolutions.sql`
- Nova coluna `secretaryNotes TEXT NULL` em `clinical_evolutions`
- Migration aplicada em produção

#### Schema Drizzle
- Arquivo: `drizzle/schema-clinical-evolution.ts`
- Campo `secretaryNotes` adicionado ao schema `clinicalEvolutions`

#### Backend
- Arquivo: `server/db_clinical_evolution.ts`
- Novos helpers:
  - `isReceptionDeskRole(...)`
  - `redactClinicalFieldsForViewer(...)`
  - `getClinicalEvolutionByIdInternal(...)`
- `getClinicalEvolutionById(id, viewerRole?)`
- `getClinicalEvolutionsByPatient(patientId, viewerRole?)`
- Para `role === "recepcionista"` ou `"secretaria"`, a resposta redige:
  - `clinicalNotes`
  - `icdCode`
  - `icdDescription`
  - `audioTranscription`
  - `audioUrl`
  - `audioKey`
  - `attachmentsRaw`
- Registros legados também passam pela mesma sanitização
- Novo método `updateSecretaryNotes(...)`
  - atualiza somente `secretaryNotes`
  - cria evolução mínima quando necessário
  - reaproveita a trilha de auditoria da tarefa 9

#### Router tRPC
- Arquivo: `server/routers/clinical-evolution.ts`
- `getById` e `getByPatient` agora passam `ctx.user.role` ao banco
- `create` e `update` bloqueiam uso completo por `recepcionista`
- Novo endpoint `updateSecretaryNotes`
  - permitido para `admin`, `medico`, `enfermeiro`, `recepcionista`
  - exige justificativa se a evolução já estiver `finalizado` ou `assinado`
  - grava em `clinical_evolution_edit_log`

#### Frontend
- Arquivo: `client/src/components/EvolucaoClinicaWorkspace.tsx`
- Branch de UI por role:
  - médico/enfermeiro: seguem com a ficha clínica completa
  - recepcionista: vê apenas o formulário reduzido com textarea de `Observações da secretaria`
- A UI de recepção não renderiza:
  - exame físico
  - CID
  - conduta
  - áudio/transcrição
  - anexos clínicos
- Médicos continuam vendo `Observações da secretaria` dentro do workspace clínico
- Autosave e justificativa pós-finalização também funcionam para `secretaryNotes`

- Arquivo: `client/src/pages/ProntuarioDetalhe.tsx`
- `HistoricoTab` filtrada por role
- Recepcionista vê somente:
  - data
  - status
  - observações da secretaria
- Para recepcionista, o prontuário fica restrito às abas:
  - `Histórico`
  - `Evolução`
- Abas clínicas/documentais são ocultadas para esse perfil:
  - `Anamnese`
  - `Atestados / Docs`
  - `Prescrições`
  - `Exames`
  - `Imagens`
  - `Anexos`
  - `Orçamentos`
  - `Contratos`
  - `Procedimentos`
- Botão de exportação do prontuário ocultado para recepcionista

---

## Validação em produção

### Deploy
- Arquivos enviados para `/var/www/glutec-clinica`
- Migration `0210` aplicada no MySQL do container `glutec-mysql`
- Build executado com sucesso em produção
- Serviço `glutec` reiniciado com sucesso
- Verificação HTTP final:
  - `https://sistema.drwesleycamara.com.br` -> **200**
  - `http://127.0.0.1:3000` -> **200**

### Usuário temporário de teste criado na produção
- Nome: `Recepção Teste Codex`
- E-mail: `recepcao.teste+codex@drwesleycamara.com.br`
- Role: `recepcionista`
- ID: `284`
- Senha de teste: `Recepcao@2026`

### Validação da resposta redigida
Foi executado teste direto na VPS carregando o ambiente real (`.env`) e chamando `getClinicalEvolutionsByPatient(420, "recepcionista")`.

Resultado confirmado:
- `clinicalNotes: null`
- `icdCode: null`
- `icdDescription: null`
- `audioTranscription: null`
- `attachmentsRaw: null`

Os registros clínicos continuam acessíveis para médicos, mas chegam redigidos para recepção conforme a regra de negócio.

---

## Arquivos alterados nesta tarefa 10

- `drizzle/migrations/0210_secretary_notes_on_clinical_evolutions.sql`
- `drizzle/schema-clinical-evolution.ts`
- `server/db_clinical_evolution.ts`
- `server/routers/clinical-evolution.ts`
- `client/src/components/EvolucaoClinicaWorkspace.tsx`
- `client/src/pages/ProntuarioDetalhe.tsx`

---

## Observações para a próxima IA / próxima rodada

1. O usuário temporário `recepcao.teste+codex@drwesleycamara.com.br` pode ser mantido para QA ou removido manualmente depois.
2. O teste manual por script na VPS precisa carregar o `.env`; sem isso, o `getDb()` retorna vazio e pode parecer que não há registros.
3. Importar `appRouter` completo por `tsx` na VPS hoje dispara erro de `otplib` em `server/_core/totp.ts`; para validações técnicas rápidas, prefira importar o router específico ou a camada de banco.
4. A proteção implementada foi centrada em `clinical_evolutions` e na navegação do prontuário. Se no futuro houver outros endpoints clínicos novos, repetir o mesmo filtro por role.

---

## Resultado atual

- Produção saudável
- Tarefas 1 a 10 concluídas
- Secretária com visão limitada de prontuário implementada, deployada e validada
