# Importação do Prontuário Verde

Primeira etapa pronta para o legado do Prontuário Verde:

- Pacientes via `exp_paciente_8152_20260312-010951.csv`
- Fotos/anexos de imagem via campo `Foto` e `exp_paciente_anexo_8152_20260312-010952.csv`
- Extração dos arquivos para `public/imports/prontuario-verde`
- Rastreabilidade via `import_jobs`, `import_id_map` e `import_log`

Exemplo de execução no VPS:

```bash
python3 scripts/import_prontuario_verde.py \
  --data-zip /caminho/8152-20260312-010951.zip \
  --attachments-zip /caminho/8152-anexos-2026-03-12.zip \
  --extract-dir /caminho/do/projeto/public/imports/prontuario-verde \
  --db-host 127.0.0.1 \
  --db-port 3306 \
  --db-user root \
  --db-name glutec \
  --created-by 1 \
  --uploaded-by 1
```

Observações:

- O script não sobrescreve campos já preenchidos em pacientes nesta etapa.
- Isso deixa o terreno preparado para o OneDoctor prevalecer depois nos conflitos.
- A senha do MySQL pode ser passada pelo ambiente com `MYSQL_PWD`.
