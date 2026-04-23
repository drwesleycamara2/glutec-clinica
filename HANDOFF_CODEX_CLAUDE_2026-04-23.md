# Handoff Codex -> Claude Code - 2026-04-23

## Localizacao e estado do repo

- Pasta local: `C:\Users\wesle\Downloads\Projeto Glutec Atual`
- Repositorio GitHub: `https://github.com/drwesleycamara2/glutec-clinica.git`
- Branch: `main`
- Commit ja enviado ao GitHub antes deste handoff: `aed837c4a7535366a538c761c89cafa64058c759`
- Mensagem do commit: `Fix prontuario workflows and legacy imports`
- Importante: o deploy no VPS NAO foi concluido. O usuario interrompeu a rodada logo depois do push para GitHub.

## O que foi concluido no commit aed837c

1. Prontuario > Atestados/Docs
   - Botao "Fazer na hora" renomeado para "Criar novo".
   - "Criar novo" abre editor de texto livre parecido com a aba Evolucao.
   - "Usar modelo" abre lista de modelos de atestado/declaracao/laudo.
   - Modelos com HTML sao limpos antes de entrar no campo de texto.

2. Anamnese publica
   - Corrigido bug em que a primeira resposta preenchia todas as perguntas seguintes.
   - IDs das perguntas agora sao serializados e tornados unicos no formulario publico.

3. Exclusao de prontuario
   - `PatientEditDialog` mostra "Excluir prontuario" somente para `admin`.
   - Backend tem `patients.delete` admin-only.
   - Exclusao e logica: `patients.active = 0`; listagens filtram ativos.

4. Contratos e termos
   - Nova pagina `client/src/pages/Contratos.tsx`.
   - Rota `/contratos` registrada em `App.tsx`.
   - Menu lateral premium recebeu item "Contratos".
   - `/contratos` usa permissao do modulo `documentos`.
   - Backend tem `medicalRecords.listContracts`.
   - Dedupe de contratos/termos importados.
   - Recuperacao de PDF por `fileUrl`, `fileKey` ou texto "Arquivo original: ...pdf` dentro de descricao/nome.
   - Contratos/termos sem arquivo baixavel nao aparecem nas listas, para tudo exibido ter PDF.

5. Fiscal/NFS-e
   - Aba fiscal ganhou botao "Emitir nota" que navega para `/nfse`.
   - Busca de paciente na emissao de NFS-e usa `name || fullName` e CPF.

6. Textos importados/legados
   - Historico do prontuario limpa HTML tipo `<p class=...>`, `<br>`, entidades HTML e mojibake.
   - Agenda tambem limpa observacoes importadas antes de exibir.
   - Historico mostra so 3 linhas inicialmente e possui "Ver mais/Ver menos".
   - Historico mostra exames, prescricoes e documentos relacionados por `medicalRecordId`, `appointmentId` ou mesma data.

7. Anamnese dentro do prontuario
   - Perguntas ficaram em grade de duas colunas em telas grandes.
   - Cartoes foram compactados e removida a linha repetida "Preenchimento obrigatorio".

8. Prescricoes
   - Corrigido erro de salvar/imprimir: rota agora passa `ctx.user.id` corretamente e `createPrescription` valida `doctorId`.

9. Secretaria
   - Aba do prontuario foi ajustada para "Secretaria" com acento no texto renderizado como entidade JSX.

10. Configuracoes
   - Card admin-only para "Backup e portabilidade", apontando para `/relatorios/portabilidade`.

## Arquivos alterados no commit aed837c

- `client/src/App.tsx`
- `client/src/components/DashboardLayoutPremium.tsx`
- `client/src/components/PatientEditDialog.tsx`
- `client/src/lib/access.ts`
- `client/src/lib/anamnesis.ts`
- `client/src/pages/Agenda.tsx`
- `client/src/pages/AnamnesePublica.tsx`
- `client/src/pages/ConfiguracoesFiscaisNacional.tsx`
- `client/src/pages/ConfiguracoesSafe.tsx`
- `client/src/pages/Contratos.tsx` novo
- `client/src/pages/NfseEmissao.tsx`
- `client/src/pages/ProntuarioDetalhe.tsx`
- `server/db_clinical_evolution.ts`
- `server/db_complete.ts`
- `server/routers.ts`

## Validacao ja feita

- `git diff --check` passou.
- `corepack pnpm check` NAO rodou nesta pasta porque nao ha `node_modules` local e `tsc` nao existe no ambiente local.
- Antes do commit, uma varredura confirmou ausencia de "Fazer na hora" nos arquivos alterados.

## Onde a rodada parou

Depois do commit e push:

- `git push origin main` concluiu com sucesso:
  - de `e2419f7` para `aed837c` em `main`.
- Em seguida foi iniciada uma verificacao do VPS com:
  - `ssh -o StrictHostKeyChecking=no -p 22022 root@129.121.52.61 "pwd; ls -la /var/www; ls -la /var/www/glutec-clinica"`
- Essa verificacao SSH foi interrompida/time-out pelo usuario antes de retornar resultado util.
- Nenhum `git pull`, build, restart ou migration foi executado no VPS nesta rodada.

## Proximo passo recomendado para Claude Code

1. Confirmar layout atual do VPS, porque documentos antigos citam caminhos diferentes:
   - `/var/www/glutec-clinica` com systemd `glutec`.
   - `/app/glutec-clinica-repo` ou stack Docker em `/app`.
2. Via SSH no VPS `root@129.121.52.61 -p 22022`, rodar algo como:
   - `pwd; ls -la /var/www; ls -la /app; systemctl status glutec --no-pager || true; docker ps || true`
3. Puxar o commit `aed837c` no diretorio de producao correto.
4. Buildar e reiniciar conforme stack real encontrada:
   - systemd historico: `git pull origin main && corepack pnpm build && systemctl restart glutec`.
   - Docker historico: `git pull origin main && docker compose build && docker compose up -d`.
5. Validar:
   - `systemctl is-active glutec` se systemd.
   - `docker ps` se Docker.
   - `curl -I -s https://sistema.drwesleycamara.com.br/`.

## Observacoes importantes

- Nao ha migration nova neste pacote.
- O backend assume que as colunas `active` em `patients`, `appointmentId`/`medicalRecordId` em prescricoes/exames/documentos ja existem; as migrations antigas do projeto indicam que sim.
- O projeto local de Downloads nao tinha `node_modules`; se Claude precisar validar localmente, instalar dependencias primeiro.
