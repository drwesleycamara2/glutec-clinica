# Legacy Import — Prontuário Verde + OnDoctor → Glutec Clínica

Ferramentas para migrar dados dos sistemas legados **Prontuário Verde** e **OnDoctor** para a Glutec Clínica (MySQL + Cloudflare R2).

**Status da migração (2026-04-17): COMPLETA.** Toda a metadata e 100% dos binários vinculados já estão no banco de produção e no R2. Esta pasta documenta o que foi feito e fornece as ferramentas para rodar novamente (idempotente) ou auditar.

---

## Resultado final

| Item                              | Verde | OnDoctor | Total |
|-----------------------------------|------:|---------:|------:|
| Pacientes importados              |       |          | 168   |
| Documentos (metadata)             |       |          | 2.564 |
| Anexos/PDFs enviados ao R2        | 1.447 | 710      | 2.157 |
| Orçamentos                        |       |          | 296   |
| Prescrições                       |       |          | 2.345 |
| Contratos/Termos (UI separada)    |       |          | 814   |

Breakdown por `patient_documents.type`: foto 665, termo 467, prescricao 434, contrato 347, evolucao_pdf 324, solicitacao_exames 267, outro 60.

Rastreabilidade: tabela `import_id_map` com 13.401 registros (sourceSystem, sourceTable, sourceId → targetTable, targetId). Toda linha importada também tem `sourceSystem` + `sourceId` na tabela alvo, permitindo rerun idempotente.

---

## Arquitetura

```
┌────────────────────────────────────────────────────────────────────────┐
│  Backups locais (Windows)                                              │
│   ├─ Backup Prontuário Verde Março 2026/8152-anexos-2026-03-12.zip     │
│   ├─ Backup Prontuário Verde Março 2026/csvs/*.csv                     │
│   └─ Backup On Doctor Março 2026/(csvs + arquivos/)                    │
└────────────────────────────────────────────────────────────────────────┘
                │                                    │
                │ SFTP                               │ SFTP (zip + tar)
                ▼                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  VPS (129.121.52.61 :22022) — /root/glutec_import                      │
│   ├─ csvs/            ── metadata CSVs                                 │
│   └─ bin/             ── binários (verde extraído + ond filtrado)      │
└────────────────────────────────────────────────────────────────────────┘
                │                                    │
                │ docker cp + docker exec            │ docker cp
                ▼                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Docker stack (/app/docker-compose.yml)                                │
│   ├─ glutec-mysql       — MySQL 8 (tabela principal)                   │
│   ├─ glutec-backend     — tRPC + executor dos scripts de import/R2     │
│   ├─ glutec-frontend    — Vite + React                                 │
│   └─ glutec-n8n                                                        │
│                                                                        │
│  glutec-backend roda:                                                  │
│   1) import_legacy.cjs    (lê CSVs, insere MySQL, match por CPF)       │
│   2) upload_binaries_to_r2.cjs (lê MySQL, faz upload R2, atualiza DB)  │
└────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Cloudflare R2 — bucket glutec-clinica                                 │
│   ├─ legacy/verde/prontuarioverde-anexos/...                           │
│   ├─ legacy/verde/prontuarioverde-documentos/...                       │
│   └─ legacy/ond/pessoaAnexo_*.{jpg,png,mp4,pdf,...}                    │
└────────────────────────────────────────────────────────────────────────┘
```

Regra de conflitos acordada com o usuário: **OnDoctor prevalece** sobre Verde em caso de duplicidade (match por CPF; fallback nome + data de nascimento).

---

## Pré-requisitos

- Node.js 20+ (Windows/Linux)
- Acesso SSH ao VPS de produção
- Credenciais: ver `.env.example` → copiar para `.env` e preencher
- Backups legados disponíveis localmente (ver `VERDE_ZIP` e `OND_DIR` no .env)

```bash
cd scripts/legacy-import
cp .env.example .env    # editar e preencher
npm install
```

---

## Pipeline completo (do zero)

Se alguém precisar reimportar tudo em um ambiente novo:

### 1. Metadata (CSVs → MySQL)
```bash
node import/import_legacy.cjs           # orquestrador simples (lê CSVs locais e envia por SFTP)
# ou separadamente:
#   - faz SFTP dos CSVs para /root/glutec_import/csvs
#   - faz docker cp para o container backend
#   - roda o importador com DRY_RUN=0
```
Opções importantes no importador:
- `DRY_RUN=1` — só loga, não grava
- `ONLY_VERDE=1` / `ONLY_OND=1` — pular um dos sistemas
- É idempotente via `import_id_map` — rodar de novo não duplica nada.

### 2. Binários (anexos / PDFs → R2)
```bash
# Passo 2a — Verde (zip 139 MB, extração no VPS)
node deploy/upload_binaries.js          # SFTP do zip + tar, extrai, docker cp, roda uploader

# Passo 2b — OnDoctor filtrado (só os 710 que estão referenciados no DB)
node deploy/fetch_ond_keys.js           # gera deploy/ond_keys.txt lendo do MySQL
node deploy/build_ond_tar.js            # empacota só os 710 de ~1.4 GB (de 1.6 GB no backup)
node deploy/upload_ond.js               # SFTP + extract + docker cp + run uploader
```

### 3. Re-upload de URLs antigas (ex: `/imports/...`)
```bash
node deploy/reupload_verde_stale.js     # NULL no fileUrl e re-roda o uploader
```

### 4. Deploy da UI (aba Contratos/Termos)
```bash
node deploy/deploy_docker.js            # git pull + docker compose build/up na stack real
```

### 5. Verificação
```bash
node verify/count_pending.js            # quantos faltam por sourceSystem
node verify/verify_samples.js           # top pacientes, contagens, amostras de URL
node verify/check_log.js                # tail do último log do uploader no VPS
```

---

## Detalhes de cada diretório

### `import/`
Rodam **dentro do container `glutec-backend`**. Nome `.cjs` proposital: `/app/package.json` tem `"type": "module"`.

- **`import_legacy.cjs`** — importador principal. Processa CSVs do Verde e do OnDoctor. Matching: CPF normalizado (digits only) → nome+data nascimento. Mantém `sourceSystem`/`sourceId` em todas as tabelas alvo + `import_id_map` centralizada.
- **`upload_binaries_to_r2.cjs`** — lê `patient_documents` onde `fileKey IS NOT NULL AND (fileUrl IS NULL OR '')`, encontra o arquivo em disco, envia ao R2, atualiza `fileKey = legacy/<verde|ond>/...` e `fileUrl = <R2 public url>`. Parâmetros via env: `DRY_RUN`, `LIMIT`, `VERDE_BIN_DIR`, `OND_BIN_DIR`.

### `deploy/`
Rodam **localmente** (Windows/Linux) e orquestram a execução remota via SSH/SFTP.

- **`deploy_docker.js`** — `git pull` + `docker compose build/up` para `glutec-frontend` e `glutec-backend`.
- **`upload_binaries.js`** — pipeline ponta-a-ponta: SFTP Verde.zip + OnDoctor.tar → extrai → docker cp → roda uploader (com `setsid nohup` para não morrer junto do SSH).
- **`build_ond_tar.js`** — copia só os 710 arquivos do backup OnDoctor local para um tar filtrado (~1.4 GB em vez de 1.6 GB).
- **`fetch_ond_keys.js`** — extrai a lista de fileKeys OnDoctor pendentes do MySQL, grava em `ond_keys.txt`.
- **`upload_ond.js`** — variante otimizada do `upload_binaries.js` que sobe só o tar filtrado e dispara o uploader.
- **`reupload_verde_stale.js`** — NULL nos `fileUrl` antigos (`/imports/...`) e re-roda o uploader. Necessário porque uma versão anterior do importador gravava paths relativos em vez de URLs R2.

### `verify/`
Queries rápidas para auditoria e troubleshooting.

- **`count_pending.js`** — contagem de pendentes por sourceSystem.
- **`verify_samples.js`** — top pacientes por nº de documentos, counts gerais, amostras de fileUrl.
- **`check_log.js`** — tail do último log do uploader em `/root/glutec_import/r2_*.log`.

### `debug/`
Scripts one-off usados durante a migração (mantidos para referência).

- **`debug_filekeys.js`** — dump dos primeiros 20 fileKeys pendentes vs estrutura real de diretórios.
- **`debug_paths.js`** — comparação entre o DB fileKey (ex: `prontuarioverde-anexos/8152/968599/878595.jpg`) e o disco (sem o segmento `8152/`).
- **`check_verde_urls.js`** — confere o prefixo dos fileUrl antigos (`/imports/...`).

### `lib/`
- **`config.js`** — carrega `.env` e exporta `ssh`, `mysql`, `r2`, `paths`.
- **`ssh.js`** — helpers de `connect`, `exec`, `sftp`, `sftpPut`, `mysqlCmd`.

---

## Bugs notáveis resolvidos durante a migração

1. **fileKey do Verde com clinic-id**: DB grava `prontuarioverde-anexos/8152/968599/878595.jpg`, mas o zip extraído não tem o segmento `8152/`. O `findVerdeFile` em `upload_binaries_to_r2.cjs` strip-a via regex.
2. **URLs `/imports/...` antigas**: uma versão anterior do importer preenchia `fileUrl` com paths relativos em vez de URLs R2 reais. Resolvido em `reupload_verde_stale.js`.
3. **SSH stream mata docker exec**: comandos longos (horas) precisam de `setsid nohup bash -c "..."` para não morrerem quando a sessão SSH fecha.
4. **`/app/package.json` com `"type": "module"`**: scripts que usam `require()` devem ter extensão **`.cjs`** dentro do container.
5. **`mysqldump` bloqueado de fora**: MySQL só aceita de `172.18.0.0/16` (rede interna do Docker). Rodar dentro do container: `docker exec glutec-mysql sh -c 'mysqldump ...'`.

---

## URL pública R2

Os fileUrl salvos no DB têm o formato:
```
https://<account-id>.r2.cloudflarestorage.com/<bucket>/legacy/<verde|ond>/...
```
**Este endpoint não é público** — devolve HTTP 400 em HEAD direto. O backend precisa assinar (ou usar `fileKey` para gerar URL signed no momento do acesso). Se no futuro o bucket ganhar domínio customizado, trocar `buildPublicUrl` em `upload_binaries_to_r2.cjs` e rodar um `UPDATE patient_documents SET fileUrl = REPLACE(...)`.

---

## Contato / Contexto

Ver `HANDOFF_CODEX_2026-04-13.md` na raiz do repo para o contexto completo do projeto (funcionalidades, decisões de arquitetura, estado geral).
