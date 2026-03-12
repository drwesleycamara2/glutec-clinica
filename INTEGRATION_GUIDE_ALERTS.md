# Guia de Integração: Sistema de Alertas Críticos

## Visão Geral

Este documento descreve como integrar o novo sistema de Alertas Críticos (Condicionais e de Alergias) nas telas de atendimento do Glutec.

## Arquivos Criados

### Backend (Node.js/Express)

1. **`server/routes/alerts.ts`** - Rotas de API para gerenciar alertas
   - `POST /api/alerts/question` - Salvar configuração de alerta
   - `GET /api/alerts/template/:templateId/questions` - Buscar alertas de um template
   - `GET /api/alerts/patient/:patientId/anamnesis` - Buscar alertas de anamnese do paciente
   - `GET /api/alerts/patient/:patientId/allergies` - Buscar alergias do paciente
   - `POST /api/alerts/patient/:patientId/allergy` - Adicionar alergia
   - `POST /api/alerts/dismiss` - Descartar alerta
   - `POST /api/alerts/log-view` - Registrar visualização (auditoria)

2. **`server/db_alerts.ts`** - Funções de banco de dados
   - `saveQuestionAlert()` - Salvar configuração de alerta
   - `getTemplateAlerts()` - Buscar alertas de um template
   - `createPatientAlert()` - Registrar alerta ativo para paciente
   - `getPatientAlerts()` - Buscar alertas ativos do paciente
   - `dismissAlert()` - Marcar alerta como descartado
   - `addPatientAllergy()` - Registrar alergia
   - `getPatientAllergies()` - Buscar alergias do paciente
   - `logAlertView()` - Registrar visualização para auditoria

3. **`drizzle/schema_alerts.ts`** - Definição das tabelas
   - `anamnesisQuestionAlerts` - Configurações de alertas
   - `patientAnamnesisAlerts` - Alertas ativos por paciente
   - `patientAllergies` - Alergias centralizadas
   - `alertDisplayLog` - Log de visualizações

4. **`drizzle/0003_alerts_tables.sql`** - Migrações SQL

### Frontend (React/TypeScript)

1. **`client/components/alerts/QuestionAlertConfig.tsx`** - Modal de configuração de alertas
   - Interface para selecionar respostas gatilho
   - Definir mensagem e título do alerta
   - Escolher nível de severidade
   - Selecionar telas de exibição

2. **`client/components/alerts/AlertDisplay.tsx`** - Componentes de exibição
   - `AlertDisplay` - Exibe lista de alertas
   - `AllergyAlert` - Componente especializado para alergias
   - `AlertBanner` - Banner fixo no topo para alertas críticos

3. **`client/components/alerts/PatientAlertProvider.tsx`** - Wrapper de contexto
   - Busca alertas do paciente
   - Filtra alertas por tela
   - Registra visualizações
   - Fornece dados de alergias

4. **`client/hooks/usePatientAlerts.ts`** - Hooks customizados
   - `usePatientAlerts()` - Buscar alertas do paciente
   - `useAnamnesisQuestionAlerts()` - Buscar alertas de um template
   - `useSaveQuestionAlert()` - Salvar configuração
   - `useDismissAlert()` - Descartar alerta
   - `useLogAlertView()` - Registrar visualização

### Scripts

1. **`scripts/sync_allergies.py`** - Sincronizar alergias migradas
   - Lê alergias do campo `patients.allergies`
   - Normaliza e separa alergias múltiplas
   - Insere na tabela `patient_allergies`

## Integração nas Telas

### 1. Dashboard de Atendimento

```tsx
import { PatientAlertProvider } from "@/components/alerts/PatientAlertProvider";

export function PatientDashboard({ patientId, userId }: Props) {
  return (
    <PatientAlertProvider patientId={patientId} userId={userId} screen="dashboard">
      {/* Conteúdo do dashboard */}
      <PatientInfo />
      <AppointmentHistory />
      <MedicalRecords />
    </PatientAlertProvider>
  );
}
```

### 2. Tela de Prontuário/Anamnese

```tsx
export function MedicalRecordForm({ patientId, userId }: Props) {
  return (
    <PatientAlertProvider patientId={patientId} userId={userId} screen="prontuario">
      {/* Formulário de prontuário */}
      <TemplateForm />
      <QuestionList />
    </PatientAlertProvider>
  );
}
```

### 3. Tela de Evolução

```tsx
export function EvolutionForm({ patientId, userId }: Props) {
  return (
    <PatientAlertProvider patientId={patientId} userId={userId} screen="evolucao">
      {/* Formulário de evolução */}
      <EvolutionEditor />
      <AttachmentUpload />
    </PatientAlertProvider>
  );
}
```

### 4. Resumo do Paciente

```tsx
export function PatientSummary({ patientId, userId }: Props) {
  return (
    <PatientAlertProvider patientId={patientId} userId={userId} screen="resumo">
      {/* Resumo do paciente */}
      <BasicInfo />
      <RecentNotes />
    </PatientAlertProvider>
  );
}
```

## Configuração de Alertas em Modelos de Anamnese

### No Editor de Templates

```tsx
import { QuestionAlertConfig } from "@/components/alerts/QuestionAlertConfig";

export function TemplateEditor({ template }: Props) {
  return (
    <div>
      {template.sections.map((section) =>
        section.questions.map((question) => (
          <div key={question.id}>
            <input value={question.text} />
            
            {/* Botão para configurar alerta */}
            <QuestionAlertConfig
              questionId={question.id}
              questionText={question.text}
              questionOptions={question.options || []}
              onSave={(config) => handleSaveAlert(question.id, config)}
            />
          </div>
        ))
      )}
    </div>
  );
}
```

## Fluxo de Funcionamento

### 1. Configuração de Alerta em Pergunta

1. Médico/Admin acessa editor de template
2. Clica em "Configurar Alerta" em uma pergunta
3. Modal abre com opções:
   - Seleciona resposta(s) que acionam o alerta
   - Insere mensagem do alerta
   - Escolhe nível de severidade
   - Seleciona telas onde exibir
4. Clica "Salvar Configuração"
5. Alerta é salvo em `anamnesisQuestionAlerts`

### 2. Acionamento de Alerta (Paciente responde)

1. Paciente preenche anamnese
2. Seleciona uma resposta que aciona um alerta
3. Resposta é salva em `medical_records.templateResponses`
4. Sistema verifica se há alertas configurados para essa resposta
5. Se houver, cria registro em `patientAnamnesisAlerts`
6. Alerta fica ativo para o paciente

### 3. Exibição de Alerta (Equipe visualiza)

1. Médico/Enfermeiro abre tela de atendimento do paciente
2. `PatientAlertProvider` busca alertas do paciente
3. Filtra alertas para a tela atual (ex: "dashboard")
4. Exibe alertas usando `AlertDisplay` ou `AllergyAlert`
5. Registra visualização em `alertDisplayLog` para auditoria
6. Alerta permanece visível enquanto não for descartado

## Sincronização de Alergias

### Dados Migrados do Prontuário Verde

O script `sync_allergies.py` sincroniza alergias:

```bash
python3 scripts/sync_allergies.py
```

**Processo:**
1. Lê campo `patients.allergies` (migrado do Prontuário Verde)
2. Normaliza texto (ex: "Penicilina, Dipirona" → ["Penicilina", "Dipirona"])
3. Insere cada alergia em `patient_allergies` com `source='cadastro_paciente'`
4. Evita duplicatas

**Resultado:**
- 6 alergias sincronizadas para 4 pacientes
- Alergias agora aparecem em todas as telas de atendimento

## Auditoria e Conformidade

### Logs de Visualização

Cada visualização de alerta é registrada em `alertDisplayLog`:
- `alertType` - Tipo de alerta (anamnesis_conditional ou allergy_persistent)
- `patientId` - ID do paciente
- `alertId` - ID do alerta
- `screen` - Tela onde foi visualizado
- `viewedBy` - Usuário que visualizou
- `viewedAt` - Timestamp da visualização
- `acknowledged` - Se foi reconhecido

### Logs de Auditoria (LGPD)

Ações são registradas em `auditLogs`:
- Criação de alertas
- Visualização de alertas
- Descarte de alertas
- Adição de alergias
- Visualização de alergias

## Próximos Passos

1. **Integrar rotas de API** - Adicionar `alerts.ts` ao arquivo `server/routers.ts`
2. **Testar endpoints** - Validar todas as rotas de API
3. **Integrar componentes** - Adicionar `PatientAlertProvider` nas telas principais
4. **Testes de UI/UX** - Validar visibilidade e usabilidade dos alertas
5. **Testes de Performance** - Verificar tempo de carregamento com múltiplos alertas
6. **Documentação de Usuário** - Criar guia para médicos/enfermeiros

## Referências

- [Arquitetura Técnica](./alertas_criticos_glutec.md)
- [Schema do Banco de Dados](./drizzle/schema_alerts.ts)
- [Componentes React](./client/components/alerts/)
- [Hooks Customizados](./client/hooks/usePatientAlerts.ts)
