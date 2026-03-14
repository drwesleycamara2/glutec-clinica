# Glutec - Sistema de Gestão Clínica Glutée
## Roadmap de Desenvolvimento

> Última atualização: 14/03/2026
> Conformidade: LGPD (Lei 13.709/2018), CFM 1.821/2007, CDC (Lei 8.078/1990)

---

## Fase 1: Núcleo Base - CONCLUÍDA
- [x] Autenticação com perfis de acesso (Admin, Médico, Recepcionista, Enfermeiro)
- [x] Dashboard principal com KPIs (6 cards: pacientes, consultas, médicos, orçamentos, estoque, CRM)
- [x] Cadastro de pacientes com dados completos
- [x] Agenda com calendário visual (react-big-calendar)
- [x] Prontuário eletrônico (CFM 1821/2007)
- [x] Prescrições médicas (simples, especial azul/amarelo, antimicrobiano)
- [x] Pedidos de exames
- [x] Integração D4Sign (assinaturas digitais)
- [x] Sistema de auditoria LGPD com hash SHA-256 encadeado
- [x] Relatórios básicos
- [x] Perfil do usuário

## Fase 2: Configuração e Design - CONCLUÍDA
- [x] Paleta de cores cinza + dourado metálico (#d4a853)
- [x] Renomear sistema para "Glutec" em toda a aplicação
- [x] Menu lateral com todos os módulos organizados por seção
- [x] Responsividade mobile no DashboardLayout
- [x] Implementar favicon e logotipo personalizados (Glutée) - versões clara e escura
- [x] Fonte Montserrat em todo o sistema
- [x] Botões com degradê dourado metálico
- [x] Configurar credenciais D4Sign produção (live_*)

## Fase 3: Gerenciamento de Empresa - CONCLUÍDA
- [x] Tabela `clinic_settings` com dados completos da clínica
- [x] Página de configurações da empresa (CNPJ, endereço, horários)
- [x] Upload de logotipo via S3
- [x] Endpoints tRPC para CRUD de configurações
- [x] Dados de endereço, telefone, CNPJ, inscrição estadual
- [x] Configurações de horário de funcionamento
- [x] Especialidades oferecidas

## Fase 4: Anamnese Customizável - CONCLUÍDA
- [x] Tabela `anamnesis_links` com token, expiração e respostas
- [x] Geração de link único para paciente preencher
- [x] Endpoints para criar link, buscar por token e submeter respostas
- [x] Sincronização de respostas ao prontuário via templateId
- [x] Validação de expiração e status do link

## Fase 5: Módulo de Fotos Avançado - CONCLUÍDA
- [x] Tabela `patient_photos` com categorias (antes, depois, evolução, intraoperatório)
- [x] Upload via S3 com compressão automática
- [x] Componente MobilePhotoCapture para captura direta da câmera
- [x] Página de Fotos com galeria por paciente e categoria
- [x] Componente FileDropZone com drag & drop

## Fase 6: Agenda Avançada - CONCLUÍDA
- [x] Visualização por dia, semana e mês
- [x] Cores de status por dia (verde, amarelo, vermelho, preto)
- [x] Filtro por profissional com agenda individual
- [x] Status de agendamentos (agendado, confirmado, presente, atendido, cancelado, falta)
- [x] Bloqueio de horários (estrutura pronta)
- [x] Seleção de sala e tipo de atendimento
- [x] Calendário mini com legenda de cores

## Fase 7: Armazenamento de Documentos - CONCLUÍDA
- [x] Tabela `patient_documents` para documentos gerais
- [x] Upload e listagem de documentos por paciente
- [x] Endpoints para CRUD de documentos

## Fase 8: Módulo de Estoque - CONCLUÍDA
- [x] Tabelas `inventory_products` e `inventory_movements`
- [x] Página de Estoque com listagem, cadastro e movimentações
- [x] Alerta de estoque baixo no Dashboard
- [x] Tipos de movimentação: entrada, saída, ajuste
- [x] Atualização automática de estoque ao registrar movimentação

## Fase 9: CRM com Indicações - CONCLUÍDA
- [x] Tabela `crm_indications` com status e recompensa
- [x] Página de CRM com listagem e cadastro de indicações
- [x] Métricas de conversão nos Relatórios
- [x] Status: indicado, agendado, realizado, cancelado

## Fase 10: Integração MEMED - ESTRUTURA PRONTA
- [x] Estrutura de integração preparada no código
- [ ] Aguardando credenciais de API MEMED para ativação

## Fase 11: Prontuário Inteligente com Templates Dinâmicos - CONCLUÍDA
- [x] Tabela `medical_record_templates` com campos JSON tipados
- [x] Página de criação/edição de templates (radio, select, multi_select, text, number)
- [x] Exemplo: Exame Físico Genital Feminino com Hipercromia (radio buttons)
- [x] Renderização dinâmica de formulários baseados em template
- [x] Integração com prontuário via `templateId` e `templateResponses`
- [x] Campo obrigatório de Chaperone (tabela `medical_record_chaperones`)

## Fase 12: IA para Transcrição - ESTRUTURA PRONTA
- [x] Tabela `audio_transcriptions` com status e resultado
- [x] Funções de banco para CRUD de transcrições
- [ ] Aguardando integração com API de transcrição (Whisper/similar)

## Fase 13: Motor de Orçamentos (CDC) - CONCLUÍDA
- [x] Tabelas: `budget_procedure_catalog`, `budget_procedure_areas`, `budget_procedure_pricing`
- [x] Cascata condicional: Procedimento > Área > Complexidade (P/M/G)
- [x] Exemplo: Mini Lipo com 4 áreas e 3 tamanhos
- [x] Auto-soma no backend
- [x] Tabela `budget_payment_plans` com 6 condições de pagamento
- [x] Página de Catálogo de Procedimentos para configurar preços
- [x] Página de Orçamentos com criação, itens e protocolo terapêutico
- [x] Validade de 10 dias conforme CDC Art. 40
- [x] Protocolo: total, pagamento, sessões estimadas, intervalo entre sessões

## Fase 14: Módulo Financeiro - CONCLUÍDA
- [x] Tabela `financial_transactions` com receitas e despesas
- [x] Página Financeiro com listagem e cadastro de transações
- [x] Resumo financeiro (receitas, despesas, saldo)
- [x] Métodos de pagamento: PIX, dinheiro, cartão crédito/débito, transferência, boleto

## Fase 15: Chat Integrado - CONCLUÍDA
- [x] Tabela `chat_messages` com canais e menções
- [x] Página de Chat com envio de mensagens
- [x] Suporte a arquivos e menções de usuários

## Fase 16: Níveis de Acesso Granulares - CONCLUÍDA
- [x] Tabela `permissions` com CRUD por módulo por usuário
- [x] Página de Permissões com toggle de permissões
- [x] Endpoint para consultar e definir permissões

## Fase 17: Alertas de Alergias - CONCLUÍDA
- [x] Componente AllergyAlert com 3 variantes (banner, inline, modal)
- [x] Verificação de interação medicamentosa (checkAllergyInteraction)
- [x] Mapeamento de alergias comuns e medicamentos relacionados
- [x] PrescriptionAllergyWarning para alertar ao prescrever
- [x] Integrado no ProntuarioDetalhe

## Fase 18: Exportação de Prontuário - CONCLUÍDA
- [x] Componente ExportProntuarioButton com download de PDF
- [x] Componente ExportOptions com múltiplos formatos (PDF completo, resumido, HTML)
- [x] Integrado no ProntuarioDetalhe

## Fase 19: Responsividade Mobile - CONCLUÍDA
- [x] Componente MobilePhotoCapture com captura de câmera
- [x] Compressão automática de imagens
- [x] FileDropZone com drag & drop
- [x] DashboardLayout responsivo com sidebar colapsável

## Fase 20: Relatórios Completos - CONCLUÍDA
- [x] 4 abas: Geral, Financeiro, Orçamentos, CRM
- [x] 6 KPIs no topo (pacientes, consultas, médicos, orçamentos, estoque, CRM)
- [x] Gráficos de barras e pizza (Recharts)
- [x] Métricas de conversão de orçamentos e indicações
- [x] Alerta de estoque baixo integrado
- [x] Tabela detalhada por profissional e status

## Fase 21: Performance e Otimização - CONCLUÍDA
- [x] Lazy loading de todas as páginas (React.lazy + Suspense)
- [x] Code splitting automático via Vite
- [x] PageLoader com spinner durante carregamento

## Fase 22: D4Sign Produção + NFS-e + Documentos - CONCLUÍDA (14/03/2026)
- [x] Editor de prescrições em texto livre com formatação
- [x] Editor de pedidos de exames em texto livre
- [x] Editor de atestados em texto livre
- [x] Sistema de modelos salvos por tipo de documento
- [x] Interface para carregar e salvar modelos
- [x] Tabelas no banco: `document_templates`, `free_text_documents`, `attestations`
- [x] Página de Documentos com abas por tipo
- [x] Menu integrado no DashboardLayout
- [x] **D4Sign com credenciais de PRODUÇÃO (live_*)**
- [x] **Serviço D4Sign centralizado (server/d4sign.ts)**
- [x] **7 cofres mapeados (prontuário, contratos, termos, distratos, adendos, etc.)**
- [x] **Função selectSafe() para roteamento automático por tipo de documento**
- [x] **Fluxo completo: upload → signatários → envio para assinatura**
- [x] **NFS-e: Página de emissão em 4 etapas (espelhando Portal Nacional nfse.gov.br)**
- [x] **NFS-e: Autocomplete de pacientes + busca CEP via ViaCEP**
- [x] **NFS-e: Texto legal fixo conforme Art-31 Lei 8.212/91**
- [x] **NFS-e: Tributação Mogi Guaçu/SP, Simples Nacional 18,63%**
- [x] **NFS-e: Histórico com visualização e cancelamento**
- [x] **Configurações Fiscais completas (dados emitente, tributação, texto legal)**
- [x] **Ambiente homologação/produção configurável**
- [x] **Schema nfse_emissions + fiscal_settings + DB functions + tRPC routers**

## Fase 23: Testes e QA - CONCLUÍDA (14/03/2026)
- [x] Build de produção sem erros de compilação (nos novos arquivos)
- [x] **80 testes unitários e de integração com Vitest (100% passando)**
- [x] **d4sign.test.ts: 20 testes (cofres, selectSafe, instanciação)**
- [x] **nfse.test.ts: 25 testes (schemas Zod, cálculos, validações CPF/CNPJ)**
- [x] **routers.test.ts: 12 testes (auth, estrutura router, permissões)**
- [x] **security.test.ts: 22 testes (SHA-256 LGPD, sanitização, XSS, e-mail)**
- [x] **auth.logout.test.ts: 1 teste (cookie de sessão)**

## Fase 24: Deploy e Documentação - PENDENTE
- [x] Código versionado no GitHub
- [x] Migration SQL gerada para todas as tabelas
- [ ] Documentação do sistema (manual do usuário)
- [ ] Treinamento da equipe

---

## Resumo de Status

| Fase | Descrição | Status |
|------|-----------|--------|
| 1 | Núcleo Base | CONCLUÍDA |
| 2 | Configuração e Design | CONCLUÍDA |
| 3 | Gerenciamento de Empresa | CONCLUÍDA |
| 4 | Anamnese Customizável | CONCLUÍDA |
| 5 | Módulo de Fotos | CONCLUÍDA |
| 6 | Agenda Avançada | CONCLUÍDA |
| 7 | Armazenamento de Documentos | CONCLUÍDA |
| 8 | Estoque e Inventário | CONCLUÍDA |
| 9 | CRM com Indicações | CONCLUÍDA |
| 10 | Integração MEMED | ESTRUTURA PRONTA |
| 11 | Prontuário Inteligente + Chaperone | CONCLUÍDA |
| 12 | IA Transcrição | ESTRUTURA PRONTA |
| 13 | Motor de Orçamentos (CDC) | CONCLUÍDA |
| 14 | Módulo Financeiro | CONCLUÍDA |
| 15 | Chat Integrado | CONCLUÍDA |
| 16 | Níveis de Acesso Granulares | CONCLUÍDA |
| 17 | Alertas de Alergias | CONCLUÍDA |
| 18 | Exportação de Prontuário | CONCLUÍDA |
| 19 | Responsividade Mobile | CONCLUÍDA |
| 20 | Relatórios Completos | CONCLUÍDA |
| 21 | Performance e Otimização | CONCLUÍDA |
| 22 | D4Sign Produção + NFS-e + Documentos | CONCLUÍDA |
| 23 | Testes e QA (80 testes) | CONCLUÍDA |
| 24 | Deploy e Documentação | PENDENTE |

**Total: 23/24 fases concluídas, 1 pendente (documentação), 2 módulos aguardando credenciais externas (MEMED e IA)**

---

## Stack Tecnológica
- **Frontend:** React 19 + TypeScript + TailwindCSS 4 + Radix UI + Recharts
- **Backend:** Express + tRPC + Drizzle ORM
- **Banco de Dados:** MySQL (TiDB) - 31 tabelas
- **Autenticação:** Manus OAuth + RBAC granular
- **Assinatura Digital:** D4Sign (PRODUÇÃO - 7 cofres mapeados)
- **NFS-e:** Portal Nacional nfse.gov.br (4 etapas)
- **Armazenamento:** AWS S3
- **Testes:** Vitest (80 testes, 5 suites)
- **Conformidade:** LGPD, CFM 1821/2007, CDC Art. 40, Lei 8.212/91
