# Handoff para Codex / Claude Code - 2026-04-19

Este arquivo complementa o handoff anterior [HANDOFF_CODEX_2026-04-18.md](C:\Users\wesle\OneDrive\Documentos\New project\glutec-clinica\HANDOFF_CODEX_2026-04-18.md) e descreve o que foi feito na rodada seguinte.

## Estado do repositório

- Repo: `drwesleycamara2/glutec-clinica`
- Branch de trabalho: `main`
- Working dir local: `C:\Users\wesle\OneDrive\Documentos\New project\glutec-clinica`
- Produção: `https://sistema.drwesleycamara.com.br`
- VPS: `129.121.52.61:22022`
- Serviço: `glutec`

## O que foi feito nesta rodada

### 1. Usuário temporário de QA removido da produção

O usuário de teste criado para validar a visão limitada da recepção foi removido do banco de produção.

- Usuário removido: `recepcao.teste+codex@drwesleycamara.com.br`
- Resultado do `DELETE`: `1`

Observação:
- O handoff de 2026-04-18 ainda menciona esse usuário porque ele existia naquele momento.
- O estado atual correto é: **usuário temporário não existe mais em produção**.

### 2. D4Sign validada com chamada real

Foi executado teste real na VPS usando as credenciais do ambiente da clínica e a integração respondeu corretamente.

Resultado:
- `ok: true`
- `safeCount: 7`

Os cofres retornados incluíram, entre outros:
- `Cópia de prontuário médico`
- `Adendos contratuais`
- `Pacientes Modelo`
- `Distratos`
- `Documentos de terceiros`

Conclusão:
- A integração D4Sign está funcional no nível de autenticação e comunicação com a API.

Arquivos principais relacionados:
- `server/lib/d4sign-integration.ts`
- `server/d4sign.ts`
- `server/routers.ts`

### 3. Certillion corrigido

#### Problema encontrado

O sistema estava usando rotas do tipo:

- `/api/oauth/client_token`
- `/api/oauth/token`
- `/api/oauth/authorize`

Na prática, essas rotas retornavam `403` em produção com erro de CSRF:

- `Could not verify the provided CSRF token because your session was not found.`

#### Diagnóstico feito na VPS

Foram testados os endpoints reais do provedor, e o comportamento ficou assim:

- `https://cloud.certillion.com/api/oauth/client_token` -> `403`
- `https://cloud.certillion.com/css/restful/application/oauth/client_token` -> `200`
- `https://cloud-ws.certillion.com/api/oauth/client_token` -> `403`
- `https://cloud-ws.certillion.com/css/restful/application/oauth/client_token` -> `200`

Conclusão:
- O cliente estava apontando para o caminho errado.
- O caminho correto da integração programática é:
  - `/css/restful/application/oauth/...`

#### Correções aplicadas

Arquivo alterado:
- `server/lib/certillion.ts`

Mudanças:
- criação do helper `oauthUrl(path)`
- troca de todas as chamadas Certillion para:
  - `client_token`
  - `authorize`
  - `token`
  - `signature`
  - `document`
  - `user-discovery`
  usando o prefixo `/css/restful/application/oauth/`
- `client_token` e `token` enviados como `application/x-www-form-urlencoded`
- melhoria na extração de mensagens de erro da API
- ajuste do `findPscAccounts` para o formato de payload usado pela API oficial

Arquivo alterado:
- `server/_core/index.ts`

Mudança:
- o callback do Certillion agora passa o `psc` salvo na sessão ao fazer `exchangeCodeForToken(...)`

#### Validação final

Depois do redeploy na VPS:
- build executado com sucesso
- serviço `glutec` reiniciado com sucesso
- novo teste real do `client_token` retornou:
  - `ok: true`
  - `enabled: true`
  - `baseUrl: https://cloud.certillion.com`
  - `defaultPsc: VIDAAS`
  - `expiresIn: 300`

Conclusão:
- O Certillion agora está autenticando corretamente em produção.

### 4. Situação atual da emissão de NFS-e

Foi feita uma checagem do estado atual da camada fiscal.

Resultado encontrado:
- configuração fiscal da clínica está preenchida
- certificado A1 PJ está salvo
- ambiente atual está em `homologacao`
- provedor atual está em `nfse_nacional`
- teste de conexão TLS com a API nacional respondeu com sucesso
- no banco, ainda não havia NFS-e criada/emitida registrada no momento da checagem (`recentNfse: []`)

Conclusão objetiva:
- a infraestrutura fiscal está configurada
- o certificado está carregado
- a conexão com o webservice nacional está funcionando
- porém o fluxo ponta a ponta de emissão real ainda não foi validado com uma NFS-e emitida de fato pelo sistema

Arquivos principais:
- `server/lib/nfse-nacional.ts`
- `server/db_complete.ts`
- `server/routers.ts`
- `client/src/pages/NfseEmissao.tsx`

## Deploy desta rodada

Houve redeploy em produção para aplicar a correção do Certillion.

Executado na VPS:
- sobrescrita dos arquivos alterados
- `corepack pnpm build`
- `systemctl restart glutec`
- `systemctl is-active glutec`

Resultado:
- serviço voltou `active`

## Próximos passos recomendados

### Prioridade alta

1. Validar o fluxo completo do Certillion no navegador:
   - iniciar assinatura por popup/QR
   - completar callback
   - confirmar persistência da assinatura no documento

2. Validar emissão de NFS-e ponta a ponta em homologação:
   - criar um rascunho real
   - emitir pela API nacional
   - confirmar gravação de:
     - `numeroNfse`
     - `chaveAcesso`
     - `xmlRetorno`
     - `linkNfse`

### Prioridade média

3. Se a homologação da NFS-e passar, planejar transição controlada de `homologacao` para `producao`.

4. Revisar se há outros pontos do Certillion ainda usando payload legado fora de `server/lib/certillion.ts`.

## Arquivos alterados nesta rodada

- `server/lib/certillion.ts`
- `server/_core/index.ts`

## Resumo executivo

Estado atual após esta rodada:

- visão limitada da recepção: concluída e validada
- usuário temporário de QA: removido da produção
- D4Sign: operacional
- Certillion: corrigido e autenticando corretamente
- NFS-e: infraestrutura pronta, mas emissão ponta a ponta ainda pendente de validação real
