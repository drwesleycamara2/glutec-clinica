# Integracao WhatsApp oficial da Clinica Glutee

Esta integracao usa a Meta WhatsApp Cloud API oficial. Tokens, IDs e secrets nao devem ser salvos na interface do sistema nem versionados no Git. Eles ficam somente no `.env` do VPS, com permissao restrita.

## Variaveis necessarias no VPS

```env
WHATSAPP_ACCESS_TOKEN=token_permanente_da_meta
WHATSAPP_PHONE_NUMBER_ID=id_do_numero_telefone_na_meta
WHATSAPP_BUSINESS_ACCOUNT_ID=id_da_conta_waba
WHATSAPP_BUSINESS_PHONE=+5519999633913
WHATSAPP_GRAPH_VERSION=v23.0
WHATSAPP_WEBHOOK_VERIFY_TOKEN=crie_um_token_longo_aleatorio
WHATSAPP_APP_SECRET=app_secret_do_app_meta
APP_URL=https://sistema.drwesleycamara.com.br
```

## Templates recomendados para aprovacao na Meta

Como lembretes, anamnese e documentos geralmente iniciam conversa fora da janela de 24 horas, a Meta exige templates aprovados. Quando os nomes abaixo forem configurados, o sistema passa a usa-los automaticamente:

```env
WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
WHATSAPP_TEMPLATE_ANAMNESIS=glutec_anamnese
WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER=glutec_lembrete_consulta
WHATSAPP_TEMPLATE_DOCUMENT=glutec_documento_clinico
```

Sugestao de template `glutec_anamnese`:

`Ola, {{1}}. A Clinica Glutee solicita o preenchimento seguro da sua anamnese antes do atendimento. Acesse: {{2}}`

Sugestao de template `glutec_lembrete_consulta`:

`Ola, {{1}}. Lembrete da sua consulta na Clinica Glutee em {{2}} as {{3}}. Profissional: {{4}}. Local: {{5}}. Se solicitado, preencha sua anamnese: {{6}}. Responda SIM para confirmar ou NAO para cancelar.`

## Webhook

URL para cadastrar na Meta:

`https://sistema.drwesleycamara.com.br/api/whatsapp/webhook`

O webhook:

- valida o `hub.verify_token`;
- valida `x-hub-signature-256` quando `WHATSAPP_APP_SECRET` estiver configurado;
- registra mensagens/status em `whatsapp_message_logs`;
- interpreta respostas de confirmacao ou cancelamento e atualiza o agendamento futuro mais proximo da paciente.

## O que ainda preciso receber para ativar envio real

- `Phone Number ID`;
- `WhatsApp Business Account ID`;
- token permanente de acesso;
- `App Secret`;
- confirmacao dos nomes dos templates aprovados na Meta.

Referencia oficial: Meta WhatsApp Cloud API em https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api.
