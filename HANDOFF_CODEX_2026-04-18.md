# Handoff para Codex — 2026-04-18

**Repo:** https://github.com/drwesleycamara2/glutec-clinica
**Branch:** `main`
**Último commit:** `68ab7fe feat(audit): justificativa + log de edicao em consultas finalizadas`
**VPS:** `129.121.52.61:22022` (root / Iskursais10@)
**URL produção:** https://sistema.drwesleycamara.com.br (systemd: `glutec`)
**MySQL:** Docker container `glutec-mysql`, senha `Glutec@2026!`, DB `glutec`
**Working dir:** `C:\Users\wesle\OneDrive\Documentos\New project\glutec-clinica`
**Package manager:** pnpm workspaces

---

## O que já foi entregue nesta sessão (pronto + deployado)

Lista de 10 tarefas abertas pelo usuário; **9 concluídas**, **1 pendente**.

### ✅ 1. Certillion — botão "Testar conexão"
- `server/certillion.ts`: chamada correta ao endpoint `/api/v1/client_token` (antes dava 403)

### ✅ 2. Editar cadastro de paciente — erro UPDATE SQL
- Migração `drizzle/migrations/0190_patients_missing_columns.sql` (aplicada em produção em 2026-04-17)
- Colunas faltantes adicionadas à tabela `patients`

### ✅ 3. Botão "Nova Consulta" (topo do sistema)
- `client/src/components/DashboardLayoutPremium.tsx`: agora abre seletor de paciente → workspace de atendimento (antes redirecionava para Agenda)

### ✅ 4. UI Evolução — Salvar/Finalizar + CID no FIM
- `client/src/components/EvolucaoClinicaWorkspace.tsx`: botões Salvar / Finalizar e bloco de CID-10 movidos para **abaixo** da ficha de evolução

### ✅ 5. CID-10 favoritos por profissional
- Cada médico tem lista própria de CIDs favoritos (tabela `user_icd10_favorites`)
- Estrelinha ao lado do CID: clique adiciona; clique novamente pede confirmação para remover

### ✅ 6. Excluir modelos de documentos
- Soft delete (botão Trash2) em `Templates.tsx`, `Prescricoes.tsx` e `Exames.tsx`

### ✅ 7. Deploy anterior concluído (commit `bf2dcfa` / `dfe6f7c`)
- Inclui fix de lucide-react via `pnpm.overrides`

### ✅ 8. Separar Anamnese vs Evolução (commit `ba17d96`)
**Problema:** a aba de Anamneses listava fichas de atendimento importadas (Prontuário Verde / OneDoctor), poluindo os questionários reais.

**Solução:**
- `server/db_complete.ts`:
  - `listPatientAnamneses` → retorna apenas `anamnesis_share_links` (questionários reais)
  - `patientHasAnyAnamnesis` → só conta `anamnesis_share_links`
- `server/db_clinical_evolution.ts`:
  - Nova função `getLegacyEvolutionsFromMedicalRecords(patientId)` — mapeia `medical_records` legados para o shape de `ClinicalEvolution`, com flag `isLegacy: true`, id negativo, `legacySource`, `legacySourceLabel`
  - `getClinicalEvolutionsByPatient` mescla evoluções atuais + legado, ordenadas por data desc
- `client/src/pages/ProntuarioDetalhe.tsx` e `client/src/components/EvolucaoClinicaWorkspace.tsx`:
  - Badge "Prontuário Verde (importado)" / "OneDoctor (importado)" / "Registro legado"
  - Botões `Continuar` / `Assinar` **desabilitados** em registros legados (não têm row em `clinical_evolutions`); apenas `Exportar` permanece

### ✅ 9. Auditoria de edição em consulta finalizada (commit `68ab7fe`)
**Problema:** usuário podia editar silenciosamente uma consulta já finalizada, sem trilha de auditoria.

**Solução:**
- Nova tabela `clinical_evolution_edit_log` (migration `0200_clinical_evolution_edit_log.sql`) com:
  - `clinicalEvolutionId`, `editedByUserId`, `editedByUserName`, `editedByUserRole`
  - `previousStatus` / `newStatus`
  - `justification` (TEXT obrigatório, min 10 chars)
  - `changedFields` (JSON: nomes dos campos alterados)
  - `previousSnapshot` / `newSnapshot` (JSON — estado completo antes/depois)
  - `ipAddress`, `userAgent`, `editedAt`
- `drizzle/schema-clinical-evolution.ts`: `clinicalEvolutionEditLog` + tipos
- `server/db_clinical_evolution.ts`: `buildEvolutionSnapshot`, `diffSnapshots`, `createClinicalEvolutionEditLog`, `getClinicalEvolutionEditLogs`
- `server/routers/clinical-evolution.ts`:
  - `update` agora aceita `editJustification`; **obriga** mínimo 10 chars quando `status` atual é `finalizado` ou `assinado` → caso contrário `BAD_REQUEST`
  - Grava snapshot antes e depois + diff + metadados
  - Novo endpoint `getEditHistory(evolutionId)`
- `client/src/components/EvolucaoClinicaWorkspace.tsx`:
  - Detecta `status === "finalizado" | "assinado"` ao clicar Continuar → toast de aviso
  - Ao clicar Salvar ou Finalizar numa consulta travada, abre **diálogo de justificativa** (Textarea, min 10 chars)
  - Botão **"Histórico"** em cada atendimento salvo abre diálogo com todas as edições auditadas (quem, quando, de→para status, justificativa, campos alterados)

---

## 🚧 O que ainda falta (1 item aberto)

### 10. Secretária — view limitada de prontuário (pendente)

Do briefing original do usuário:

> Secretária precisa poder fazer anotações e registros no prontuário, porém **sem conseguir acessar o que foi colocado (inclusive anexos) pelos médicos**. Mas no caso dela, a ficha que abre precisa **só ter espaço pra fazer observações** (e não, atendimento com exame físico ou conduta ou CID).

**Regras esperadas:**
1. Usuários com `role === "recepcionista"` (ou `"secretaria"` se existir) **não** podem ver `clinicalNotes`, `icdCode`, `icdDescription`, `audioTranscription`, nem anexos clínicos.
2. Eles têm um campo próprio de "Observação da secretaria" que:
   - Fica visível para médicos também
   - É persistido e auditável
3. A ficha de atendimento quando aberta por uma secretária deve mostrar somente o campo de observações — ocultar UI de exame físico, conduta, CID, anexos.
4. Precisa funcionar tanto na tela de Evolução Clínica (`EvolucaoClinicaWorkspace.tsx`) quanto no `ProntuarioDetalhe.tsx`.

**Sugestão de implementação (ainda não iniciada):**

Backend:
- Adicionar coluna `secretaryNotes TEXT NULL` em `clinical_evolutions` + migration
  - (ou tabela separada `clinical_evolution_secretary_notes` se quiser versionamento)
- No schema `clinicalEvolutions`, adicionar `secretaryNotes`
- Em `getClinicalEvolutionsByPatient` e `getClinicalEvolutionById`, quando `ctx.user.role === "recepcionista"`, retornar os registros com os campos clínicos **nulos/redigidos**, mantendo apenas: id, patientId, doctorName, startedAt, status, secretaryNotes
- Novo endpoint `clinicalEvolution.updateSecretaryNotes({ id, notes })` ou integrar em `update` com filtro por role
- Policy: recepcionista só pode escrever `secretaryNotes`; médico escreve tudo incluindo `secretaryNotes`
- Gravar edições de `secretaryNotes` no `clinical_evolution_edit_log` também? (decisão de produto — recomendo sim)

Frontend:
- `client/src/_core/hooks/useAuth.ts` já expõe `user.role` — usar para branch de UI
- No `EvolucaoClinicaWorkspace.tsx`: se `role === "recepcionista"`, renderizar uma versão reduzida do form com apenas Textarea "Observações da secretaria" + botão Salvar
- No `ProntuarioDetalhe.tsx` (HistoricoTab): secretária vê apenas data + status + `secretaryNotes`; demais campos ocultos
- Esconder aba "Anamnese" e "Documentos" para secretária se contiverem conteúdo clínico
- Verificar se anexos (campo `attachments` em `medical_records` e uploads via `file-router`) estão filtrados

Ver também:
- `server/routers/clinical-evolution.ts` (linhas 82-86 getByPatient)
- `server/db_clinical_evolution.ts` (linha ~61 getClinicalEvolutionsByPatient)
- `client/src/components/EvolucaoClinicaWorkspace.tsx` (linhas 420+ handleSelectEvolution e JSX da ficha)

---

## Arquivos-chave (para orientação)

| Arquivo | Função |
|---|---|
| `drizzle/migrations/0200_clinical_evolution_edit_log.sql` | Tabela de auditoria criada na tarefa 9 |
| `drizzle/schema-clinical-evolution.ts` | Schema Drizzle para `clinical_evolutions`, `signature_audit_log`, `clinical_evolution_edit_log` |
| `server/db_clinical_evolution.ts` | CRUD + funções de snapshot / legacy / edit log |
| `server/db_complete.ts` | `listPatientAnamneses` (limpo), `patientHasAnyAnamnesis`, `getPatientById`, `getPatientHistory` |
| `server/routers/clinical-evolution.ts` | tRPC: create/update/sign/delete/getByPatient/getEditHistory/getSignatureAuditLog |
| `server/routers.ts` | Root router (linha 2031: `anamneses.listByPatient`) |
| `client/src/components/EvolucaoClinicaWorkspace.tsx` | UI completa do atendimento (inclui diálogo de justificativa e histórico) |
| `client/src/pages/ProntuarioDetalhe.tsx` | HistoricoTab + AnamneseTab |

---

## Regras operacionais importantes

1. **Deploy**: `git push origin main` → o deploy não é automático; usar scripts em `C:\tmp\ssh-deploy\step36-deploy-audit.js` como template (pull + migração + build + restart + verify)
2. **Migrations**: colocar em `drizzle/migrations/NNNN_*.sql`; aplicar via `docker cp` + `docker exec glutec-mysql mysql -uroot -p'Glutec@2026!' glutec < /tmp/file.sql`
3. **pnpm.overrides em package.json raiz** já fixa `lucide-react: ^0.453.0` para evitar bug no workspace
4. **TypeScript**: `tsc --noEmit` tem ~40 erros pré-existentes (não introduzidos por esta sessão); `esbuild` ignora e builda mesmo assim
5. **Autenticação**: `ctx.user` exposto em procedimentos `protectedProcedure`; role possíveis conhecidas: `admin | medico | enfermeiro | recepcionista | user`

---

## Commits desta sessão (em ordem)

```
9224399 feat(patients): editar cadastro + Certillion em Prescrições/Exames
bf2dcfa fix: Certillion API path, patient UPDATE schema, Nova consulta, CID favorites, template delete
dfe6f7c fix(deps): force pnpm override lucide-react ^0.453.0 across workspace
ba17d96 fix(prontuario): separar anamnese (questionário) de evolução (atendimento)
68ab7fe feat(audit): justificativa + log de edicao em consultas finalizadas
```

Todos já em `origin/main`. Migrations aplicadas no MySQL de produção: até **0200** inclusive.
