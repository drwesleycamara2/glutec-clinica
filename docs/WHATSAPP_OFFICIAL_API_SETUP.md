# Integração WhatsApp Business API — Glutec System

Data: 2026-05-17
Provider: Meta Cloud API (Graph API v23)
Base do código: `server/whatsapp.ts`, `server/src/routes/whatsapp.ts`, migration `0245_whatsapp_official_integration.sql`

## Visão geral

O sistema já está pronto para falar com a API oficial do WhatsApp da Meta. Você precisa apenas (1) habilitar a conta na Meta, (2) cadastrar o chip da clínica como WhatsApp Business, (3) gerar tokens, (4) cadastrar templates HSM, (5) preencher as variáveis de ambiente no VPS e (6) apontar o webhook.

Casos de uso já cobertos pelo código:
- Confirmação automática de consulta (com botão de cancelar)
- Lembrete pré-consulta
- Pedido de nota/feedback pós-atendimento
- Envio de link de anamnese, prescrições, pedidos de exame e documentos clínicos

## 1. Pré-requisitos do chip

- O número do chip **não pode** estar logado no app WhatsApp comum nem no WhatsApp Business app. Se estiver, faça logout (`Configurações → Sair`) **antes** de cadastrar na Meta. A migração para Cloud API é exclusiva: ou app, ou API.
- Tenha em mãos: número (DDI+DDD+número), CNPJ da clínica (Wesley Serviços Médicos LTDA), comprovante de endereço, dados bancários (opcional, só se for vender via WhatsApp).
- O número precisa receber SMS ou ligação durante o registro.

## 2. Cadastro no Meta Business

1. Acesse https://business.facebook.com/ → criar/abrir Business Manager da clínica.
2. Crie uma **WhatsApp Business Account (WABA)** em `Configurações → Contas → Contas do WhatsApp → Adicionar`.
3. Em `Configurações → Contas → Apps`, crie um App tipo **Business**. Anote o `App ID` e gere o `App Secret` em `Configurações → Básico`.
4. Dentro do App, adicione o produto **WhatsApp**.
5. Em `WhatsApp → Configuração da API`, adicione o número do chip (`+55…`) e siga o fluxo de verificação por SMS/voz.
6. Anote os IDs gerados:
   - `Phone Number ID` (não é o número, é um ID numérico longo)
   - `WhatsApp Business Account ID` (WABA ID)

## 3. Tokens

Você vai precisar de **dois** tokens distintos:

### 3.1. Access Token de sistema (permanente)
1. `Business Manager → Configurações → Usuários → Usuários do sistema → Adicionar`.
2. Nome: `glutec-system-api`, função: `Admin`.
3. Em `Atribuir ativos` selecione o App, a WABA e o número do WhatsApp criados nos passos 2 e 3.
4. Em `Gerar novo token` selecione o App e marque as permissões: `whatsapp_business_messaging` e `whatsapp_business_management`.
5. Escolha **nunca expirar**. Copie o token (começa com `EA...`) — você só verá uma vez.

### 3.2. Webhook Verify Token (você mesmo inventa)
String aleatória, ex.: `glutec_wh_verify_<32 chars>`. Vai ser usada no passo 5.

## 4. Templates (HSM)

Templates pré-aprovados são obrigatórios para mensagens iniciadas pela clínica fora da janela de 24h.

1. No App da Meta, vá em `WhatsApp → Gerenciador de modelos → Criar`.
2. Crie estes 3 templates **no idioma `pt_BR`** (nomes em snake_case, sem espaços):

### `glutec_appointment_reminder` (UTILITY)
```
Olá, {{1}}! Lembramos que você tem consulta na Clínica Glutée em {{2}} às {{3}}.

Endereço: {{4}}
Profissional: {{5}}

Para CONFIRMAR responda 1.
Para REMARCAR responda 2.
Para CANCELAR responda 3.
```
- Botões opcionais: dois `Quick Reply`: "Confirmar" e "Cancelar".

### `glutec_anamnesis_link` (UTILITY)
```
Olá, {{1}}! A Clínica Glutée preparou sua anamnese on-line.

Acesse com segurança: {{2}}

O link é pessoal e expira em 7 dias. Em caso de dúvida, responda esta mensagem.
```

### `glutec_document_delivery` (UTILITY)
```
Olá, {{1}}! Segue {{2}} emitido pela Clínica Glutée em {{3}}.

Qualquer dúvida, responda esta mensagem.
```
- Aceita anexo PDF nos parâmetros de cabeçalho.

3. Aguarde aprovação (normalmente minutos a algumas horas).

## 5. Webhook

URL: `https://sistema.drwesleycamara.com.br/api/whatsapp/webhook`

1. No App da Meta, `WhatsApp → Configuração → Webhooks → Editar`.
2. **Callback URL**: cole a URL acima.
3. **Verify Token**: cole o mesmo valor que você gerou em 3.2.
4. Clique **Verificar e salvar**. O servidor responde com o `hub.challenge` automaticamente.
5. Em **Webhook fields**, assine: `messages`, `message_template_status_update`, `messaging_postbacks`.

## 6. Variáveis de ambiente no VPS

Edite `/var/www/glutec-clinica/.env` (ou onde o `glutec.service` lê), adicione:

```
WHATSAPP_ACCESS_TOKEN=EAAG...                # token do passo 3.1
WHATSAPP_PHONE_NUMBER_ID=123456789012345     # passo 2
WHATSAPP_BUSINESS_ACCOUNT_ID=098765432109876 # passo 2
WHATSAPP_BUSINESS_PHONE=+5519999633913       # número do chip
WHATSAPP_GRAPH_VERSION=v23.0
WHATSAPP_APP_SECRET=abcdef0123...            # passo 2 (App Secret)
WHATSAPP_WEBHOOK_VERIFY_TOKEN=glutec_wh_verify_xxxxx  # passo 3.2
WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER=glutec_appointment_reminder
WHATSAPP_TEMPLATE_ANAMNESIS=glutec_anamnesis_link
WHATSAPP_TEMPLATE_DOCUMENT=glutec_document_delivery
WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
APP_URL=https://sistema.drwesleycamara.com.br
```

Reinicie o serviço:
```bash
systemctl restart glutec.service
systemctl is-active glutec.service
```

## 7. Teste end-to-end

```bash
# 1. Salud-check da configuração
curl -s https://sistema.drwesleycamara.com.br/api/whatsapp/health

# 2. Envio de teste (precisa que o destinatário tenha enviado uma msg
#    para o número nas últimas 24h, OU usar um template aprovado).
curl -X POST https://sistema.drwesleycamara.com.br/api/whatsapp/send-test \
  -H "Content-Type: application/json" \
  -d '{"to":"+5519XXXXXXXXX","template":"glutec_appointment_reminder",
       "params":["Paciente Teste","17/05/2026","14:30","Rua X, 100","Dr. Wesley"]}'
```

Se o `/health` voltar `ok` com todas as envs preenchidas e o `/send-test` retornar `messageId`, está funcionando.

## 8. Limites e custos

- **Janela de 24h**: depois que o paciente responder, você pode mandar mensagem livre por 24h. Fora disso, apenas templates aprovados.
- **Conversation Pricing** (2024+): cobrado por conversa iniciada, não por mensagem. Categorias:
  - Marketing: ~R$ 0,40
  - Utilitário (lembretes, confirmações): ~R$ 0,08
  - Serviço (resposta dentro da janela 24h): grátis nos primeiros 1.000/mês
- A Meta cobra direto no cartão cadastrado no Business Manager.

## 9. LGPD / consentimento

- O paciente já consente em receber comunicação por WhatsApp ao aceitar o termo de cadastro (verificar texto em `client/src/components/PatientEditDialog.tsx`).
- Toda mensagem enviada fica registrada em `whatsapp_message_logs` (criada pela migration 0245) com `patientId`, `appointmentId`, `templateName`, `status` — base para auditoria.
- Para opt-out: criar handler no router que ao receber "SAIR" / "PARAR" marca o paciente como `whatsappOptOut=true`. (Não implementado ainda — pedir quando precisar.)

## 10. Checklist final

- [ ] Chip deslogado do app WhatsApp comum
- [ ] WABA criada e número verificado
- [ ] Phone Number ID e WABA ID anotados
- [ ] Access Token de sistema gerado e copiado
- [ ] App Secret copiado
- [ ] 3 templates criados em pt_BR e **aprovados** pela Meta
- [ ] Webhook URL configurada e verificada
- [ ] Variáveis de ambiente no `.env` do VPS
- [ ] `glutec.service` reiniciado
- [ ] `/api/whatsapp/health` respondendo ok
- [ ] Envio de teste recebido pelo seu próprio celular
