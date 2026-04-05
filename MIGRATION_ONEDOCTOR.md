# Importacao do OneDoctor

O backup do OneDoctor passa a ser a fonte mais recente e, portanto, tem precedencia sobre o Prontuario Verde quando houver divergencia nos dados do paciente.

## O que o importador cobre

- pacientes de `PESSOA.csv`
- agenda de `AGENDA.csv`
- prontuarios de `PRONTUARIO.csv`
- prescricoes de `PRESCRICAO.csv`
- orcamentos de `ORCAMENTO.csv` e `ORCAMENTO_ITEM.csv`
- recebimentos de `RECEBER.csv`
- anexos e arquivos de `ANEXO.csv` + `ANEXO_PASTA.csv` + pasta `arquivos/`
- rastreabilidade em `import_jobs`, `import_id_map` e `import_log`

## Regra de precedencia

- dados do OneDoctor sobrescrevem conflitos do Prontuario Verde
- dados ausentes no OneDoctor nao apagam informacoes ja existentes
- arquivos e historicos legados sao preservados

## Preparacao no VPS

1. Suba o backup do OneDoctor para o servidor.
2. Aplique as migrations pendentes antes da importacao.
3. Garanta que o backup esteja:
   - extraido em uma pasta
   - ou em um arquivo que o comando `tar -xf` do servidor consiga abrir

Se o `tar` do VPS nao extrair `.rar`, extraia o backup antes e aponte o script para a pasta extraida.

## Exemplo de uso

```bash
python3 scripts/import_onedoctor.py \
  --source "/home/ubuntu/import/29450 - WESLEY SERVICOS MEDICOS LTDA" \
  --mysql-bin mysql \
  --host 127.0.0.1 \
  --port 3306 \
  --user glutec \
  --database glutec \
  --created-by 1 \
  --doctor-id 1 \
  --public-root "/var/www/glutec-clinica/public/imports/onedoctor"
```

## Se a origem for um arquivo compactado

```bash
python3 scripts/import_onedoctor.py \
  --source "/home/ubuntu/import/29450 - WESLEY SERVICOS MEDICOS LTDA.rar" \
  --mysql-bin mysql \
  --host 127.0.0.1 \
  --port 3306 \
  --user glutec \
  --database glutec \
  --created-by 1 \
  --doctor-id 1 \
  --public-root "/var/www/glutec-clinica/public/imports/onedoctor"
```

## Resultado esperado

- pacientes atualizados com precedencia do OneDoctor
- prontuarios, receitas, agenda, orcamentos e recebimentos migrados
- arquivos copiados para `public/imports/onedoctor`
- imagens vinculadas em `patient_photos`
- demais anexos vinculados em `patient_documents`
