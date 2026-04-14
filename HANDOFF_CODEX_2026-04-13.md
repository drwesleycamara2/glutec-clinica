# Handoff para IA Codex — Glutec Clinica
**Data:** 13/04/2026  
**Repo:** https://github.com/drwesleycamara2/glutec-clinica.git (branch `main`)  
**Ultimo commit:** `80a4f14 feat(agenda): novo esquema de cores do calendario mensal`

## Sessao mais recente (2026-04-13 - deploy #2)

### Redesign da Agenda — Novo esquema de cores do calendario

Arquivo: `client/src/pages/Agenda.tsx`

Foi expandido o mapa `DAY_STATUS_COLORS` e a funcao `getDayStatus()` para suportar as novas regras de cores do calendario mensal (mini-calendario lateral + grade principal):

| Cor | Significado |
|-----|-------------|
| 🟢 Verde (`bg-green-500`) | Dia livre (0 agendamentos) |
| 🟡 Amarelo (`bg-yellow-500`) | Alguns horarios ocupados (parcial) |
| 🔴 Vermelho (`bg-red-500`) | Agenda cheia (>= TIME_SLOTS.length) |
| 🟣 Roxo (`bg-purple-500`) | Dia bloqueado ou feriado (via `appointmentBlocks`) |
| ⚫ Preto (`bg-black`) | Domingo (sempre fechado) |
| ⚪ Cinza (`bg-gray-400`) | Sabado sem agendamentos |
| 🔴 Vermelho | Sabado com qualquer agendamento (regime de excecao) |

Codigo chave em `getDayStatus()`:
```ts
if (dayOfWeek === 0) return "fechado";
if (dayOfWeek === 6) {
  if (dayBlocks.length > 0) return "bloqueado";
  return dayAppointments.length > 0 ? "sabado_ocupado" : "sabado_vazio";
}
if (dayBlocks.length > 0) return "bloqueado";
if (dayAppointments.length === 0) return "livre";
if (dayAppointments.length >= TIME_SLOTS.length) return "ocupado";
return "parcial";
```

Legenda lateral tambem foi atualizada com 7 itens (incluindo sabado-excecao).

### Deploy
- ✅ Build local OK (`index-DGjrl0g8.js`)
- ✅ Push para GitHub (`main` atualizado para `80a4f14`)
- ✅ Deploy VPS via `ssh2` (node script em `deploy_tool/deploy.js`)
- ✅ Bundle em producao: `index-DJEJW0ED.js` (2.42MB)
- ✅ Servico `glutec.service` ativo
- ✅ URL: https://sistema.drwesleycamara.com.br

---

## Sessao anterior (2026-04-13 - deploy #1)

---

## Stack do Projeto

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript, Vite, tRPC React Query, Wouter (routing), Shadcn/UI, Tailwind CSS, Sonner (toasts), Lucide icons |
| Backend | Node.js, tRPC, Drizzle ORM, MySQL2, superjson |
| Auth | OpenID / session-based, middleware em `server/_core/context.ts` |
| Deploy | VPS HostGator, systemd service `glutec.service`, Nginx reverse proxy |

---

## Estrutura de Diretorios Principais

```
glutec-clinica/
  client/
    src/
      _core/hooks/         # useAuth, etc
      components/          # 85 componentes (UI, premium, funcionalidades)
      hooks/               # useMobile, etc
      lib/                 # trpc.ts, anamnesis.ts, utils.ts
      pages/               # 50 paginas .tsx
      App.tsx              # Rotas (wouter)
      main.tsx             # Entry point (tRPC provider + QueryClient)
  server/
    _core/                 # index.ts (AppRouter), context.ts, mailer.ts, totp.ts
    db.ts                  # Conexao Drizzle + helpers originais
    db_complete.ts         # Funcoes de banco expandidas (createPatient, etc)
    routers.ts             # Todos os 32 routers tRPC
    features_special.ts    # Funcionalidades especiais (catalog, budgets, etc)
    whatsapp.ts            # Integracao WhatsApp (pausada)
    schema.ts              # Schema Drizzle principal
  drizzle/                 # Migrations SQL (0000-0002)
  drizzle/migrations/      # Migrations adicionais (0020-0170)
  dist/                    # Build output (gitignored)
```

---

## Routers tRPC Disponiveis (32 routers)

| Router | Procedures |
|--------|-----------|
| system | health, notifyOwner |
| auth | me, updateMe, logout |
| icd10 | search, getFavorites, addFavorite, removeFavorite, importData |
| audio | createTranscription, getTranscription, updateTranscription |
| admin | getUsers, listUsers, getDoctors, getDashboardStats, getAppointmentStats, getAuditLogs, generateSystemExport, inviteUser, updateUserStatus, updateUserPermissions, deleteUser, getUserPermissions, setUserPermission, updateUserProfile, updateUserRole |
| patients | list, create, getById |
| appointments | create, getByDate, updateStatus |
| appointmentBlocks | list, create, delete |
| prescriptions | create, getByPatient, listTemplates, createTemplate |
| exams | create, getByPatient, listTemplates, createTemplate |
| examRequests | create, getByPatient, listTemplates, createTemplate |
| financial | create, list, getSummary |
| catalog | searchTuss, listProcedures, createProcedure, createArea, getAreas, getProcedure, getPrice, listPaymentPlans, createPaymentPlan, upsertPricing |
| inventory | listProducts, createProduct, getLowStock, createMovement |
| photos | getByPatient, upload, delete |
| chat | getMessages, sendMessage |
| clinic | get, update |
| fiscal | get, upsert, uploadCertificate, testNationalApi, syncMunicipalParameters |
| nfse | list, create, emit, cancel |
| budgets | list, create, emit, approve, emitNfse |
| crm | list, create, update |
| signatures | getIntegrationStatus, saveCredentials, testConnection, listSafes, sendForSignature |
| cloudSignature | getConfig, saveConfig, initiateA3, pollA3, generateQrCode, listSessions |
| templates | list, create |
| medicalRecords | listTemplates, getHistory, getDocuments |
| whatsapp | sendMessage, sendAnamnesisRequest, sendAppointmentReminder, sendTomorrowReminders, sendDocumentToPatient |
| ai | chat |
| retroactiveAppointments | create, list |
| photoGallery | createFolder, getFolders, updateFolder, deleteFolder, uploadToFolder, getByFolder, createComparison, createUploadLink, listUploadLinks, revokeUploadLink |
| anamnesisShare | createLink |
| anamneses | listByPatient, create |
| patientSearch | autocomplete |
| permissions | checkPermission, getUserMatrix, setModulePermissions, copyPermissions, getUserAuditLog, getResourceAuditLog |
| a1Certificate | getStatus, upload, signDocument |
| clinicalEvolution | getByPatient, create, update (em router separado) |
| twoFactor | (em router separado) |

---

## Banco de Dados (MySQL)

### Tabela `patients` (colunas reais)
```
id, fullName, birthDate, gender, cpf, rg, phone, email, address, city, state, zipCode,
insuranceName, insuranceNumber, photoUrl, photoKey, bloodType, allergies, chronicConditions,
emergencyContactName, emergencyContactPhone, active, createdBy, createdAt, updatedAt
```
**ATENCAO:** NAO existe coluna `neighborhood` — esse campo e armazenado dentro do JSON do campo `address`.

### Funcao `createPatient` (server/db_complete.ts)
Usa `db.execute(sql\`INSERT INTO patients (...) VALUES (...)\`)` com SQL direto (NAO usa `db.insert().values()`). Isso foi feito porque Drizzle crashava com campos extras que nao existem na tabela.

---

## O Que Foi Corrigido Nesta Sessao

### 1. Erro ao cadastrar paciente
- `db_complete.ts`: reescreveu `createPatient` com SQL direto
- `Pacientes.tsx`: null guard para `fullName`, campo birthDate aceita colar

### 2. Integracao D4Sign
- Credenciais salvas em `clinic_settings` (colunas `d4signTokenApi`, `d4signCryptKey`)
- Endpoint `signatures.saveCredentials` em `routers.ts`
- UI de config em `Assinaturas.tsx`

### 3. Prontuario — 7 abas faltantes criadas
Em `ProntuarioDetalhe.tsx`, foram criados inline:
- `AtestadosTab` — placeholder (sem backend dedicado)
- `PrescricoesTab` — usa `trpc.prescriptions.getByPatient`
- `OrcamentoTab` — link para `/orcamentos?patientId=X`
- `ImagensTab` — usa `trpc.photos.getByPatient`
- `AnexosTab` — usa `trpc.medicalRecords.getDocuments`
- `ExamesTab` — usa `trpc.examRequests.getByPatient`
- `ProcedimentosTab` — placeholder (sem backend dedicado)

### 4. Correcoes em 13 arquivos (quebras de pagina)
- `isLoading` -> `isPending` (tRPC v11) em ProntuarioDetalhe e PacienteDetalheContent
- `totalReceitas` -> `totalReceita` em Financeiro e Relatorios
- `useMobile.tsx` retorna `{ isMobile }` em vez de boolean
- `DashboardLayout.tsx` usa `state === "collapsed"` em vez de `isCollapsed`
- Dashboard/Dashboard.premium: cast `as any` para campos extras do stats
- Orcamentos/NfseEmissao: `useQuery(undefined as any)` para queries void

---

## O Que Falta Fazer

### Prioridade Alta
1. **AtestadosTab real** — Criar router backend `atestados` (CRUD) com tabela `medical_certificates` e substituir o placeholder em ProntuarioDetalhe.tsx por formulario de emissao de atestado medico
2. **ProcedimentosTab real** — Criar backend que registre procedimentos realizados por paciente (pode usar `catalog.listProcedures` como base)
3. **Dashboard stats completo** — Adicionar `pendingSignatures`, `totalDoctors`, `pendingBudgets`, `lowStockItems` ao router `admin.getDashboardStats`

### Prioridade Media
4. **Auditoria.tsx** — Tipagem do retorno de `getAuditLogs` esta como `{}`, precisa ajustar
5. **Catalogo.tsx** — `areas` e `pricing` nao estao no tipo de retorno do tRPC
6. **Code-splitting** — Bundle de 2.4MB, implementar lazy loading das rotas com `React.lazy()`
7. **Erros TS do servidor** — ~50 erros de tipagem em `db_complete.ts` e `features_special.ts` (uso de `db.select().from(sql\`...\`)` nao bate com tipos Drizzle). Funciona em runtime mas `tsc --noEmit` falha.

### Pausado (usuario pediu para ignorar por enquanto)
8. **Integracao WhatsApp (Meta)** — Codigo existe em `server/whatsapp.ts`, `WhatsAppSendButton.tsx`, `WhatsAppIntegration.tsx` mas nao esta configurada

---

## Infraestrutura de Producao

| Item | Valor |
|------|-------|
| VPS | HostGator |
| IP | 129.121.52.61 |
| SSH | porta 22022, usuario root |
| Diretorio | `/var/www/glutec-clinica` |
| Servico | `glutec.service` (systemd) — roda `node dist/index.js` |
| DB | MySQL local (servico `mysql-glutec.service`) |
| URL | https://sistema.drwesleycamara.com.br |
| Deploy | `cd /var/www/glutec-clinica && git pull origin main && npm install --legacy-peer-deps && npm run build && systemctl restart glutec` |

---

## Credenciais D4Sign (ja configuradas)
- **TokenAPI:** `live_7d0a13cc11af0765b3100c9bdca360c862b57ae63bf9f5836d41cb67394dd790`
- **CryptKey:** `live_crypt_hShAdQ3il2jfdGWF7U1wybozsqGGouPC`
- **API Base:** `https://secure.d4sign.com.br/api/v1`

---

## Comandos Uteis

```bash
# Build local
npm run build

# TypeScript check (mostra ~50 erros de tipo no server, mas build funciona)
npx tsc --noEmit

# Dev mode
npm run dev

# Deploy em producao (via SSH)
cd /var/www/glutec-clinica && git pull origin main && npm install --legacy-peer-deps && npm run build && systemctl restart glutec
```
