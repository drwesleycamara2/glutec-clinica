# Handoff Codex -> Claude Code - Glutec System

Data: 2026-05-15  
Projeto: Glutec System / Clínica Glutée  
Objetivo deste arquivo: permitir que outro agente continue sem varrer toda a pasta.

## Local, Git e VPS

Pasta local principal:

```text
C:\Users\wesle\Downloads\Projeto Glutec Atual
```

GitHub:

```text
https://github.com/drwesleycamara2/glutec-clinica
```

VPS:

```text
Host: 129.121.52.61
Porta SSH: 22022
Usuário: root
App: /var/www/glutec-clinica
Serviço: glutec.service
Domínio: https://sistema.drwesleycamara.com.br
```

Último commit publicado pelo Codex:

```text
a927022 Fix anamnesis link copy and document drafts
```

Estado validado após esse commit:

- `corepack pnpm build` passou localmente.
- `corepack pnpm --dir /var/www/glutec-clinica build` passou no VPS.
- `systemctl is-active glutec.service` retornou `active`.
- `curl -I https://sistema.drwesleycamara.com.br/` retornou `HTTP/1.1 200 OK`.

## Stack

- Frontend: React + Vite + TypeScript.
- Backend: Node/Express + tRPC.
- Banco: MySQL, Drizzle/migrations.
- Deploy: pull no VPS, `pnpm install`, `pnpm build`, restart do serviço.

Comandos usuais:

```powershell
corepack pnpm build
git status --short
git add -- <arquivos>
git commit -m "<mensagem>"
git push origin main
ssh -i "$env:USERPROFILE\.ssh\glutec_vps" -o StrictHostKeyChecking=no -p 22022 root@129.121.52.61 "git -C /var/www/glutec-clinica pull --ff-only origin main"
ssh -i "$env:USERPROFILE\.ssh\glutec_vps" -o StrictHostKeyChecking=no -p 22022 root@129.121.52.61 "corepack pnpm --dir /var/www/glutec-clinica install --frozen-lockfile"
ssh -i "$env:USERPROFILE\.ssh\glutec_vps" -o StrictHostKeyChecking=no -p 22022 root@129.121.52.61 "corepack pnpm --dir /var/www/glutec-clinica build"
ssh -i "$env:USERPROFILE\.ssh\glutec_vps" -o StrictHostKeyChecking=no -p 22022 root@129.121.52.61 "systemctl restart glutec.service"
ssh -i "$env:USERPROFILE\.ssh\glutec_vps" -o StrictHostKeyChecking=no -p 22022 root@129.121.52.61 "systemctl is-active glutec.service"
curl.exe -I -s https://sistema.drwesleycamara.com.br/
```

## Pastas que nao devem ser commitadas

Estas aparecem como untracked/local e devem ficar fora do Git:

```text
.claude/
Backup On Doctor Março 2026 - WESLEY SERVICOS MEDICOS LTDA/
Backup Prontuário Verde Março 2026/
```

Use `git add -- <arquivos específicos>` em vez de `git add -A`, salvo se tiver certeza absoluta.

## Regra permanente do usuário

Ao concluir uma mudança:

1. Rodar build local.
2. Commitar.
3. Fazer push para `origin main`.
4. Atualizar VPS.
5. Rodar build no VPS.
6. Reiniciar `glutec.service`.
7. Verificar serviço ativo e site HTTP 200.

## Segurança e LGPD

O sistema contém dados sensíveis de pacientes. Tratar como segurança máxima:

- Não expor dados de pacientes em logs/respostas desnecessariamente.
- Não associar importações legadas por nome aproximado; conferir nome e CPF quando houver.
- Não misturar prontuário médico com anotações administrativas internas.
- Perfil de secretária não deve ver respostas de anamnese.
- Anotações internas da equipe ficam fora do prontuário clínico impresso/exportado, salvo relatório administrativo específico.

## Estado funcional atual

Módulos existentes/trabalhados:

- Prontuários.
- Evolução clínica e histórico.
- Anamneses por link seguro `/formulario-seguro/...`.
- Agenda e sala de espera.
- Prescrições.
- Pedidos de exames.
- Atestados/documentos.
- Orçamentos.
- Anexos e imagens.
- Contratos/termos.
- Estoque.
- Funcionários/prontuário funcional.
- Permissões por perfil.
- Integrações preparadas: WhatsApp, D4Sign, Certillion/VIDaaS/BirdID, A1.
- Importações legadas OnDoctor e Prontuário Verde.

## Últimas correções já feitas

### Anamnese

- `Gerar link de anamnese` no cadastro do paciente agora copia link diretamente.
- Para secretária, o botão usa modo `copyOnly`, sem abrir dropdown de WhatsApp.
- Secretária não acessa respostas de anamnese.
- Preview do link de anamnese usa `logo-glutee.png`.
- Backfill de anamneses legadas aplicado no VPS: 208 registros em `medical_records` atualizados, trocando IDs `#73693:` etc. por texto real das perguntas.

Arquivos relevantes:

```text
client/src/components/SendAnamnesisButton.tsx
client/src/components/PatientEditDialog.tsx
server/_core/index.ts
server/lib/legacy-anamnese-backfill.ts
scripts/backfill-legacy-anamnese-questions.mjs
```

### Anotações internas

- Aba `Secretária` foi renomeada para `Anotações`.
- Botão/área `Anotações da equipe` funciona para perfis autorizados.
- Admin também consegue registrar anotações internas.
- Essas anotações são administrativas e separadas do prontuário clínico.

Arquivos relevantes:

```text
client/src/pages/ProntuarioDetalhe.tsx
server/routers/clinical-evolution.ts
server/db_clinical_evolution.ts
```

### Documentos clínicos, exames e prescrições

- Pedido de exames salvo continua no editor.
- Enquanto não estiver assinado, pedido de exames pode ser reaberto/editado/atualizado.
- Prescrição salva pode ser reaberta/editada/atualizada enquanto não assinada.
- Atestados/documentos clínicos podem ser atualizados enquanto não assinados.
- Ao assinar digitalmente, alteração é bloqueada: precisa criar nova versão/novo documento.
- Botão de imprimir em documentos salvos não exige assinatura digital.

Arquivos relevantes:

```text
client/src/pages/ProntuarioDetalhe.tsx
client/src/components/ClinicalDocumentSignatureActions.tsx
server/routers.ts
server/db_complete.ts
```

### Impressão/PDF

O template de impressão foi redesenhado para:

- Visual mais clean/minimalista.
- Barra vertical dourada metálica na margem esquerda.
- Logo menor no canto superior esquerdo.
- Dados compactos do paciente logo abaixo do título.
- Conteúdo começando mais alto para aproveitar espaço.
- Rodapé com telefone, e-mail, Instagram e endereço.
- Área de assinatura reservada no rodapé.
- Carimbo do médico impresso acima da linha de assinatura.
- Receituário simples inclui nome, CPF e endereço.

Arquivo principal:

```text
client/src/components/PdfExporter.tsx
```

Assets usados:

```text
client/public/logo-glutee.png
client/public/clinical-print/carimbo-wesley.png
```

## Arquivos-chave para olhar antes de mexer

Evite varrer tudo. Comece por estes conforme a tarefa:

Prontuário/abas/anamnese/exames/prescrições/atestados:

```text
client/src/pages/ProntuarioDetalhe.tsx
```

PDF/impressão:

```text
client/src/components/PdfExporter.tsx
client/src/components/ClinicalDocumentSignatureActions.tsx
```

Cadastro do paciente/anamnese por link:

```text
client/src/components/PatientEditDialog.tsx
client/src/components/SendAnamnesisButton.tsx
client/src/pages/PacienteDetalheContent.tsx
```

Rotas tRPC:

```text
server/routers.ts
server/routers/clinical-evolution.ts
```

Banco e helpers:

```text
server/db_complete.ts
server/db_clinical_evolution.ts
drizzle/
```

Agenda:

```text
client/src/pages/Agenda.tsx
client/src/pages/SalaEspera.tsx
server/db_complete.ts
```

Estoque:

```text
client/src/pages/Estoque.tsx
server/db_complete.ts
server/routers.ts
```

Funcionários:

```text
client/src/pages/Funcionarios.tsx
server/db_complete.ts
server/routers.ts
```

## Observações técnicas úteis

- `corepack pnpm check` historicamente falha por erros TypeScript preexistentes em áreas amplas; o critério usado até aqui foi `corepack pnpm build`.
- O build alerta sobre chunk grande, mas não falha.
- Vite no VPS mostra aviso: `NODE_ENV=production is not supported in the .env file...`; aviso conhecido, build passa.
- Evitar `git add -A` por causa das pastas de backup.

## Como continuar

1. Ler este arquivo.
2. Rodar `git status --short`.
3. Confirmar que só existem untracked de backup/`.claude`.
4. Trabalhar apenas nos arquivos relevantes para a solicitação atual.
5. Validar com build.
6. Commit/push/deploy.

