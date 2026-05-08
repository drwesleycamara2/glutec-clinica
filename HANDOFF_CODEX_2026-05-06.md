# Handoff para Codex — 2026-05-06

Continuei o projeto Glutec System em paralelo aqui (Claude). Aplique os
itens pendentes abaixo **acrescentando** ao que já está em main; **não
reverta** nada.

## Estado atual

- Branch: `main`
- Último commit (Claude): `3f582a4 — Dedup intra-record + legacy OnDoctor
  signature backfill`
- Antes disso (Codex): `9342126 — Fix scheduling professionals and waiting
  room flow`
- Local, GitHub e VPS estão sincronizados em `3f582a4`.

## O que rodou nas últimas ondas no Claude (commits desde `9342126`)

Cada commit tem seu próprio escopo no `git log`. Resumo em ordem cronológica:

1. `f8ad5bd` — Patient autocomplete + admin backfill UI
   - `<PatientAutocomplete>` reutilizável (debounce 220 ms, ordem por
     prefixo do primeiro nome — `LET → Letícia Maria` antes de
     `Ana Letícia`). Backend: `searchPatientsAutocomplete` + `listPatients`
     agora aceitam telefone (digits-only) e ordenam por prefixo. Wire
     no diálogo de Agenda. Página admin `/admin/backfill-anamnese`
     (com helper `server/lib/legacy-anamnese-backfill.ts`) para
     reescrever `#73693:` por `Pergunta legível (#73693):`.
2. `3f582a4` — Dedup intra-record + legacy OnDoctor signature backfill
   - `dedupeRepeatedSections` em `EvolucaoClinicaWorkspace.tsx` e
     `ProntuarioDetalhe.tsx`: para registros importados que vieram com
     o mesmo conteúdo em `**Anamnese / História**` e `**Evolução**`,
     mostra só a primeira ocorrência.
   - Novo `server/lib/legacy-signature-backfill.ts` +
     `admin.backfillOnDoctorSignatures` + UI no `/admin/backfill-anamnese`
     (segunda card). Lê `FORMULARIO_CLIENTE.csv` do backup OnDoctor,
     casa por `medical_records.sourceId = csv.id` (com `sourceSystem in
     ('ondoctor','onedoctor')`) e grava `signedAt`, `signatureHash`,
     `signedPdfUrl`, `d4signDocumentKey`, `d4signStatus='assinado'`,
     `status='assinado'`.

### Schema relevante já confirmada na produção

- `medical_records.sourceSystem` ∈ {`ondoctor` (343), `onedoctor` (440),
  `prontuario_verde` (617)} — colunas existentes:
  `signedAt`, `signatureHash`, `signedPdfUrl`, `d4signDocumentKey`,
  `d4signStatus`. **Não** tem `signatureMethod`, `signatureProvider`,
  `signatureCertificateLabel`, `signatureValidationCode`.
- `patient_documents.sourceSystem` ∈ {`ondoctor`, `onedoctor`,
  `prontuario_verde`}, com totais por tipo:
  - `prontuario_verde / contrato`: 347
  - `prontuario_verde / termo`: 467
  - `prontuario_verde / prescricao`: 434
  - `prontuario_verde / evolucao_pdf`: 324
  - `prontuario_verde / solicitacao_exames`: 267
  - `ondoctor / outro`: 710
  - `onedoctor / foto`: 650
  - `prontuario_verde / foto`: 15
  - `ondoctor / solicitacao_exames`: 18
- `patient_documents` **não tem nenhuma coluna de assinatura**. Schema
  atual: `id, patientId, doctorId, appointmentId, medicalRecordId, type,
  name, description, fileUrl, fileKey, fileSize, mimeType, sourceSystem,
  sourceId, createdAt, updatedAt, folderLabel`.

### Backups legados disponíveis no repositório

Pastas já no working tree (não rastreadas no git por serem grandes):

```
Backup On Doctor Março 2026 - WESLEY SERVICOS MEDICOS LTDA/
  FORMULARIO_CLIENTE.csv  ← já consumido pelo backfill atual
  FORMULARIO_PERGUNTA.csv ← opções (Sim/Não) com coluna `alerta` que dá
                            dica do tópico da pergunta
  FORMULARIO_RESPOSTA.csv
  ...

Backup Prontuário Verde Março 2026/
  8152-20260312-010951.zip  ← contém os exp_*.csv
  8152-anexos-2026-03-12.zip ← arquivos PDF/PNG dos anexos
```

Header/colunas do `exp_contrato_termo` (Verde):
`CLI_ID;Unidade;Tipo;Lan‹ado por;PAC_ID;Nome Paciente;Emitido;Assinado em;
Assinado por;Documento`

Header do `exp_paciente_evolucao` (Verde):
`CLI_ID;PAC_ID;Nome Paciente;Unidade;Data;Data Registro;Particular/Conv“nio;
Profissional;Evolu‹fÆo HTML;Procedimentos;DOCUMENTO`

Encoding dos exports do Verde está em latin1 com mojibake — qualquer
parser precisa normalizar `Assinado em / Assinado por / Documento`.

## Pendências para você executar

### 1. Backfill de assinatura para contratos/termos importados do Verde

**Por que**: `patient_documents` (onde estão os contratos importados)
não guarda assinatura digital hoje. O backup do Verde traz isso em
`exp_contrato_termo.Assinado em / Assinado por / Documento`.

**Fazer**:

a) Migration `drizzle/migrations/0241_patient_documents_signature.sql`:

```sql
ALTER TABLE `patient_documents`
  ADD COLUMN `signedAt`            datetime    NULL AFTER `mimeType`,
  ADD COLUMN `signedBy`            varchar(255) NULL AFTER `signedAt`,
  ADD COLUMN `signatureSourceUrl`  text        NULL AFTER `signedBy`,
  ADD COLUMN `signatureNote`       text        NULL AFTER `signatureSourceUrl`,
  ADD COLUMN `signatureProvider`   varchar(64) NULL AFTER `signatureNote`,
  ADD COLUMN `signatureMethod`     varchar(64) NULL AFTER `signatureProvider`;
```

(O front pode mostrar `signedAt + signedBy` como "Assinado eletronicamente
por X em Y" no relatório de prontuário e no card de Contratos.)

b) Novo `server/lib/legacy-verde-document-backfill.ts`:
   - Aceita CSV ou stream do `exp_contrato_termo_*.csv`.
   - Para cada linha com `Assinado em` não vazio, cria um fingerprint do
     contrato pelo nome do `Documento` (último segmento da string que
     o importer atual gravou em `patient_documents.sourceId`, formato
     `ct_<PAC_ID>_<DD/MM/AA>_...;8152/<PAC_ID>/documentos/<docId>.pdf`).
   - Match: `patient_documents` onde `sourceSystem='prontuario_verde'`
     e `type in ('contrato','termo')` e `sourceId LIKE %<basename do
     Documento>%` (basename = parte depois do último `/`).
   - Update: `signedAt`, `signedBy`, `signatureProvider='ProntuarioVerde'`,
     `signatureMethod='legacy_eletronica'`. Idempotente (não regrava se
     `signedAt` já existir e for igual).
   - Sempre suportar `dryRun: true` por padrão.
   - Retornar o mesmo shape do `runOnDoctorSignatureBackfill` (totalRows,
     rowsMarkedSigned, matchedInGlutec, updated, unmatchedSourceIds,
     errors, sampleMatched).

c) Novo procedure `admin.backfillVerdeContractSignatures` em
   `server/routers.ts`, mesmo padrão do `backfillOnDoctorSignatures`.

d) Adicionar uma terceira card em `client/src/pages/BackfillAnamnese.tsx`
   chamada **"Importar assinaturas — Contratos Verde"**. Mesma UX que
   a card OnDoctor (textarea + Pré-visualizar + Aplicar no banco com
   confirmação + tabela de amostra + lista de IDs sem match).

e) Atualizar a renderização dos cards de contrato (busque por
   `medicalRecords.listContracts` no `client/src`) para mostrar
   "Assinado em DD/MM/AA por Fulano" quando `signedAt` existir.

### 2. (Opcional) Backfill de PDF assinado para evoluções Verde

**Por que**: `exp_paciente_evolucao.DOCUMENTO` já traz o nome do PDF do
prontuário, mas o `medical_records.signedPdfUrl` está vazio para os
617 registros `prontuario_verde`. Não há hash/link de assinatura
digital — só URL do PDF para referência visual.

**Fazer**:
   - Helper que lê `exp_paciente_evolucao_*.csv`, casa por `CLI_ID` em
     `medical_records.sourceId` (sourceSystem='prontuario_verde') e
     popula `signedPdfUrl = /imports/prontuario-verde/<DOCUMENTO>` se
     o nome existir.
   - Não tocar `signatureHash` nem `d4signDocumentKey` — Verde não tem
     esse dado. Aceitar `signedAt` apenas se a `Data Registro` casar
     com algum log que mostre assinatura.
   - Reaproveitar o procedure pattern + UI card.

### Garantia anti-regressão

Antes de mergear, rodar local:

```bash
npm run build           # vite + esbuild devem terminar sem erro
node -e "require('./dist/index.js')"   # checa que o bundle carrega
```

Eu já validei o build do meu lado (`dist/index.js = 489.8 kB`), então
seu primeiro `npm run build` deve continuar passando. Se quebrar, o
provável é colisão na lista de imports/exports de `server/routers.ts`
— resolva mantendo os dois procedures (`backfillOnDoctorSignatures` e
o novo `backfillVerdeContractSignatures`) lado a lado dentro do bloco
`admin: router({ ... })`.

### Após terminar

- Commit em commits separados por escopo (1 migration + helper + UI por
  pendência).
- Push para `origin/main`.
- VPS: aplicar a migration `0241_patient_documents_signature.sql` antes
  de reiniciar o serviço (a UI nova lê `signedAt` via tRPC; sem o
  ALTER TABLE o select quebra). Comando padrão na pasta
  `/var/www/glutec-clinica`:

```bash
mysql ... < drizzle/migrations/0241_patient_documents_signature.sql
npm run build
systemctl restart glutec.service
```

## Ferramentas já no /admin/backfill-anamnese

| Card | Função |
|---|---|
| Mapeamento CSV | Reescreve `#73693:` → `Pergunta (#73693):` em `clinical_evolution.clinicalNotes/anamnesis` e `anamnesis_share_links` |
| Importar assinaturas digitais (OnDoctor) | Aplica `signedAt/signatureHash/signedPdfUrl/d4signDocumentKey` em `medical_records` para anamneses do OnDoctor |
| **(novo a fazer)** Importar assinaturas — Contratos Verde | Vide pendência 1 acima |
| **(novo a fazer)** Importar PDF assinado — Evoluções Verde | Vide pendência 2 acima |
