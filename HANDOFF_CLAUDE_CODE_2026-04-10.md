# Handoff Claude Code - Glutec Clinica

Data de referência: 10/04/2026  
Repositório: `drwesleycamara2/glutec-clinica`  
Branch principal: `main`  
Último commit enviado: `9225397` - `Add secure password recovery and open-chart alerts`

## 1. O que é este projeto

Sistema web premium de atendimento e gestão médica para a Clínica Glutée, com foco em:

- prontuário eletrônico;
- agenda clínica;
- pacientes;
- prescrições, exames, atestados e documentos;
- orçamentos e emissão fiscal;
- importação de legados;
- anexos, imagens e vídeos;
- assinatura eletrônica/digital;
- segurança com convite por e-mail, senha e 2FA.

O projeto usa frontend React/Vite e backend Node/Express com tRPC e Drizzle/MySQL.

## 2. Objetivo funcional do produto

O sistema precisa substituir os legados `Prontuário Verde` e `OneDoctor`, preservando histórico clínico, anexos, imagens, anamneses, contratos, prescrições, agendamentos e dados financeiros/fiscais.

Regras de negócio relevantes:

- em conflitos entre dados antigos e dados do `OneDoctor`, prevalecer o `OneDoctor`;
- em dados diferentes, manter histórico dos dois;
- acesso ao sistema deve ser seguro, sem auto-login;
- criação de contas somente por convite do administrador;
- 2FA obrigatório para todos os usuários;
- foco visual premium em preto/dourado, responsivo para desktop/tablet/mobile.

## 3. Estado atual consolidado

### 3.1. O que já está implementado

- login local com senha;
- 2FA por autenticador;
- aceite de convite por e-mail;
- troca obrigatória de senha quando aplicável;
- lock por inatividade de 30 minutos;
- salvamento provisório de atendimento em andamento;
- alerta de prontuário em aberto no layout;
- lista global de prontuários abertos com retomada do atendimento;
- fluxo inicial de recuperação de senha com:
  - página `Esqueci minha senha`;
  - página `Redefinir senha`;
  - tokens temporários em tabela própria;
  - invalidação após uso;
  - mensagens genéricas anti-enumeração;
- transcrição de áudio configurável por OpenAI no backend;
- ícone global de prontuários abertos no cabeçalho, com badge vermelho pulsante e lista clicável;
- persistência de múltiplos prontuários abertos ao mesmo tempo no `localStorage`.

### 3.2. O que foi corrigido na VPS durante esta rodada

- o site chegou a cair porque a tabela `users` da VPS estava sem a coluna `profession`;
- foi adicionada a coluna `profession` diretamente no banco da VPS;
- foi criada a tabela `password_reset_tokens` na VPS;
- o endpoint `/api/auth/forgot-password` deixou de derrubar o serviço;
- produção voltou a responder `HTTP 200`.

### 3.3. O que ainda está bloqueado

O envio real do link de recuperação de senha por e-mail ainda não está funcionando porque o SMTP do Titan não autenticou a partir da VPS.

Testes já feitos a partir da VPS:

- `smtp.titan.email:587` com `STARTTLS`
- `smtp.titan.email:465` com `SSL`

Resultado:

- erro SMTP `535 authentication failed` em ambos.

Condições já confirmadas pelo usuário:

- a conta `contato@drwesleycamara.com.br` entra no webmail;
- o 2FA do Titan está desligado;
- o menu de apps de terceiros foi habilitado;
- a tela aberta pelo Titan foi a de configuração IMAP/POP, o que sugere que apps de terceiros estão liberados.

Inferência mais provável:

- bloqueio/restrição do Titan para autenticação SMTP a partir da VPS `129.121.52.61`, ou
- necessidade de intervenção do suporte Titan.

## 4. Arquivos relevantes alterados nesta rodada

### Frontend

- `client/src/App.tsx`
- `client/src/pages/Login.tsx`
- `client/src/pages/ForgotPassword.tsx`
- `client/src/pages/ResetPassword.tsx`
- `client/src/lib/clinicalSession.ts`
- `client/src/components/DashboardLayoutPremium.tsx`
- `client/src/components/EvolucaoClinicaWorkspace.tsx`

### Backend

- `server/_core/authRoutes.ts`
- `server/_core/mailer.ts`
- `server/db.ts`

### Banco / migration

- `drizzle/migrations/0150_password_reset_tokens.sql`

## 5. Detalhes técnicos importantes

### 5.1. Recuperação de senha

Rotas novas:

- `POST /api/auth/forgot-password`
- `GET /api/auth/password-reset/:token`
- `POST /api/auth/reset-password`

Comportamento esperado:

- resposta genérica para não vazar se o e-mail existe;
- token temporário com hash em banco;
- token expira;
- token só pode ser usado uma vez;
- reset não faz login automático;
- o usuário continua sujeito ao fluxo normal de login + 2FA.

Observação técnica:

- a função `createPasswordResetToken` em `server/db.ts` precisou ser ajustada para usar `db.execute(sql\`...\`)`, porque o insert do Drizzle em tabela raw estava quebrando a aplicação na VPS.

### 5.2. Prontuários abertos

Antes:

- só existia um rascunho de atendimento em `localStorage`.

Agora:

- `clinicalSession.ts` suporta múltiplos rascunhos;
- `DashboardLayoutPremium.tsx` lê todos e mostra:
  - contador vermelho pulsante;
  - dropdown com pacientes e horário da última atualização;
  - clique para retomar o prontuário.

### 5.3. Transcrição de áudio

Já existe configuração de OpenAI na VPS.

Foi implementado suporte a modelo configurável por variável de ambiente:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL=https://api.openai.com`
- `OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe`

Commit relacionado:

- `327e72e` - `Enable configurable OpenAI transcription model`

## 6. Estado da produção / VPS

Hospedagem:

- HostGator VPS
- domínio de produção: `https://sistema.drwesleycamara.com.br/`

Aplicação:

- serviço: `glutec.service`
- diretório do projeto em produção: `/var/www/glutec-clinica`

Banco:

- MySQL em container Docker
- nome do container visto na VPS: `glutec-mysql`

Observação importante:

- não repetir segredos em código, commits ou arquivos de handoff;
- as credenciais sensíveis já foram compartilhadas em conversa, mas não foram reproduzidas neste documento por segurança.

## 7. Situação do Git

Estado atual do repositório local:

- limpo, exceto por `tmp_tuss_202601.zip` não versionado;
- esse zip deve continuar fora do commit.

Commits recentes importantes:

1. `9225397` - `Add secure password recovery and open-chart alerts`
2. `327e72e` - `Enable configurable OpenAI transcription model`
3. `d4e7f2d` - merge anterior do trabalho maior de importação/layout

## 8. Próximos passos recomendados para o Claude Code

### Prioridade alta

1. Fechar o SMTP real do sistema:
   - revalidar o Titan;
   - se continuar falhando, abrir chamado com o suporte Titan informando o IP da VPS;
   - alternativa: configurar SMTP temporário confiável para o sistema já enviar recuperação de senha.

2. Testar o fluxo completo de recuperação de senha:
   - pedir recuperação;
   - receber link;
   - abrir link;
   - redefinir senha;
   - voltar ao login;
   - passar por 2FA.

3. Revisar consistência do schema da VPS:
   - comparar schema local com schema em produção;
   - identificar outras colunas antigas/migrations não aplicadas;
   - padronizar forma segura de aplicar migrations sem quebrar produção.

### Prioridade média

4. Continuar integração fiscal e assinaturas:
   - NFS-e nacional;
   - D4Sign;
   - certificados A1/A3;
   - emissão de documentos assinados.

5. Continuar importação legada completa:
   - garantir que anamneses, contratos, prescrições, imagens, anexos e histórico cheguem ao prontuário atual;
   - revisar pacientes exemplo citados pelo usuário, como `Elizete Dias`, para conferência de integridade.

6. Continuar sweep de PT-BR:
   - ainda há histórico de problemas de acentuação/mojibake em partes do sistema;
   - seguir verificando páginas com textos antigos.

### Prioridade de UX

7. Refinar o recurso de prontuários abertos:
   - talvez permitir fechar manualmente um rascunho da lista;
   - exibir profissional, tipo de atendimento e status;
   - opcionalmente mover também para a sidebar se o usuário desejar.

## 9. Testes úteis para a próxima IA

### No app

- login do administrador;
- abrir um atendimento, navegar para outra tela e voltar;
- verificar badge de prontuários abertos;
- verificar múltiplos pacientes em aberto;
- testar lock por inatividade;
- testar recuperação de senha.

### Na VPS

- `systemctl status glutec.service`
- `journalctl -u glutec.service -n 100 --no-pager`
- `curl -I -s https://sistema.drwesleycamara.com.br/login`
- testar endpoint `POST /api/auth/forgot-password`

## 10. Observações finais para continuidade

- o usuário quer que, ao final de cada tarefa bem-sucedida, seja perguntado se deseja salvar/atualizar no GitHub;
- o usuário prefere continuidade prática, com execução real, não só análise;
- decisões com impacto em produção devem ser feitas com cuidado, porque o sistema já está em uso/validação;
- para qualquer credencial sensível nova, usar armazenamento seguro e evitar repetir em arquivos versionados.

