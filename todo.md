# Glutec - Sistema de Gestão Clínica Glutée

## Fase 1: Núcleo Base (Concluído)
- [x] Autenticação com perfis de acesso (Admin, Médico, Recepcionista, Enfermeiro)
- [x] Dashboard principal com KPIs
- [x] Cadastro de pacientes com dados completos
- [x] Agenda com calendário visual
- [x] Prontuário eletrônico (CFM 1821/2007)
- [x] Prescrições médicas
- [x] Pedidos de exames
- [x] Sistema de auditoria (LGPD)
- [x] Relatórios básicos

## Fase 2: Configuração e Design (Em Progresso)
- [ ] Configurar credenciais D4Sign (contato@drwesleycamara.com.br)
- [ ] Atualizar paleta de cores para cinza + dourado metálico
- [ ] Renomear sistema para "Glutec"
- [ ] Atualizar branding da clínica "Glutée"
- [ ] Implementar favicon e logotipo
- [ ] Otimizar responsividade para mobile

## Fase 3: Gerenciamento de Empresa
- [ ] Página de configurações da clínica com dados detalhados
- [ ] Upload e gerenciamento de logotipo
- [ ] Dados de endereço, telefone, CNPJ, inscrição estadual
- [ ] Configurações de horário de funcionamento
- [ ] Especialidades oferecidas
- [ ] Importação de cadastros de pacientes (CSV/Excel)
- [ ] Exportação de cadastros de pacientes
- [ ] Importação de dados de outros sistemas

## Fase 4: Anamnese Customizável
- [ ] Editor de perguntas de anamnese por especialidade
- [ ] Geração de link único para paciente preencher
- [ ] Sincronização automática de respostas ao prontuário
- [ ] Histórico de anamnes preenchidas
- [ ] Validação de campos obrigatórios
- [ ] Envio de lembretes para paciente preencher

## Fase 5: Módulo de Fotos Avançado
- [ ] Upload de fotos antes e depois lado a lado
- [ ] Canvas para desenho sobre imagens (marcações, setas, círculos)
- [ ] Ferramentas de desenho (caneta, marcador, apagador)
- [ ] Zoom e pan em imagens
- [ ] Compressão inteligente de imagens para S3
- [ ] Armazenamento otimizado de grande volume
- [ ] Galeria com visualização em miniatura
- [ ] Histórico de versões de fotos
- [ ] Integração com câmera mobile (captura direta)

## Fase 6: Armazenamento de Mídia
- [ ] Upload de vídeos longos (otimizado para streaming)
- [ ] Upload de exames (PDF, imagens)
- [ ] Upload de documentos (RG, CPF, convênio)
- [ ] Organização por tipo de documento
- [ ] Visualizador de PDF integrado
- [ ] Reprodutor de vídeo integrado
- [ ] Limite de armazenamento por paciente
- [ ] Limpeza automática de arquivos antigos

## Fase 7: Módulo de Estoque
- [ ] Cadastro de produtos/materiais com SKU
- [ ] Controle de quantidade em estoque
- [ ] Alertas de estoque mínimo
- [ ] Histórico de movimentação
- [ ] Fornecedores e preços
- [ ] Baixa automática ao lançar procedimento
- [ ] Relatório de estoque
- [ ] Importação de estoque inicial

## Fase 8: CRM com Indicações
- [ ] Campo de "indicação de procedimento" na ficha do paciente
- [ ] Múltiplas indicações por paciente
- [ ] Filtro por indicação de procedimento
- [ ] Dashboard de pacientes com indicações pendentes
- [ ] Notificações para pacientes com indicações
- [ ] Histórico de indicações realizadas
- [ ] Acompanhamento de conversão (indicação → procedimento realizado)

## Fase 9: Integração MEMED
- [ ] Autenticação com API MEMED
- [ ] Busca de medicamentos no banco MEMED
- [ ] Preço e informações do medicamento
- [ ] Sugestão de medicamentos por diagnóstico
- [ ] Verificação de interações medicamentosas
- [ ] Histórico de medicamentos prescritos

## Fase 10: Prontuário com Validade Jurídica
- [ ] Assinatura digital por atendimento (D4Sign)
- [ ] Timestamp de assinatura
- [ ] Bloqueio de edição após assinatura
- [ ] Histórico de versões do prontuário
- [ ] Certificado digital ICP-Brasil (A1/A3)
- [ ] Comprovante de assinatura
- [ ] Exportação de prontuário assinado em PDF

## Fase 11: IA para Transcrição
- [ ] Gravação de áudio do atendimento
- [ ] Transcrição automática com IA (Whisper)
- [ ] Preenchimento automático do prontuário
- [ ] Edição de transcrição
- [ ] Sugestão de diagnóstico baseada em transcrição
- [ ] Armazenamento seguro de áudio

## Fase 12: Módulo Financeiro
- [ ] Cadastro de procedimentos com preços
- [ ] Lançamento de atendimentos com valores
- [ ] Controle de recebimentos
- [ ] Controle de pagamentos a fornecedores
- [ ] Fluxo de caixa
- [ ] Relatório financeiro mensal
- [ ] Integração com formas de pagamento (PIX, cartão, dinheiro)
- [ ] Contas a receber
- [ ] Contas a pagar

## Fase 13: NF-e (Nota Fiscal Eletrônica)
- [ ] Configuração de dados da empresa para NF-e
- [ ] Integração com provedor de NF-e
- [ ] Emissão de NF-e para procedimentos
- [ ] Emissão de NF-e para produtos vendidos
- [ ] Histórico de notas fiscais
- [ ] Cancelamento de NF-e
- [ ] Download de XML e PDF
- [ ] Conformidade com Mogi Guaçu, SP

## Fase 14: Chat Integrado
- [ ] Chat entre membros da equipe
- [ ] Notificações push com alertas chamativos
- [ ] Menção de usuários (@usuario)
- [ ] Compartilhamento de arquivos no chat
- [ ] Histórico de conversas
- [ ] Chat por departamento/especialidade
- [ ] Status de online/offline
- [ ] Integração com WhatsApp (opcional)

## Fase 15: Níveis de Acesso Granulares
- [ ] Permissões por módulo
- [ ] Permissões por ação (criar, editar, visualizar, deletar)
- [ ] Restrição de visualização de pacientes por médico
- [ ] Restrição de edição de prontuário
- [ ] Restrição de acesso a financeiro
- [ ] Restrição de acesso a relatórios
- [ ] Auditoria de acessos

## Fase 16: Alertas de Alergias
- [ ] Banner destacado na ficha do paciente
- [ ] Alerta ao abrir prontuário
- [ ] Alerta ao prescrever medicamento
- [ ] Verificação automática de interações com alergias
- [ ] Histórico de alergias
- [ ] Atualização de alergias

## Fase 17: Exportação de Prontuário
- [ ] Exportar prontuário completo em PDF
- [ ] Exportar todos os atendimentos
- [ ] Incluir fotos e documentos
- [ ] Incluir prescrições e exames
- [ ] Incluir assinaturas digitais
- [ ] Exportar em formatos múltiplos (PDF, Word, HTML)

## Fase 18: Integração Mobile
- [ ] Captura de foto via câmera mobile
- [ ] Upload direto para prontuário
- [ ] Aplicativo mobile responsivo
- [ ] Sincronização offline
- [ ] Notificações push

## Fase 19: Relatórios Completos
- [ ] Relatório de atendimentos por período
- [ ] Relatório de receita por médico
- [ ] Relatório de procedimentos mais realizados
- [ ] Relatório de pacientes novos
- [ ] Relatório de taxa de retorno
- [ ] Relatório de estoque
- [ ] Relatório de financeiro
- [ ] Exportação de relatórios em PDF/Excel
- [ ] Agendamento de relatórios automáticos por email

## Fase 20: Performance e Otimização
- [ ] Lazy loading de imagens
- [ ] Compressão de assets
- [ ] Cache de dados
- [ ] Paginação de listas grandes
- [ ] Índices de banco de dados
- [ ] CDN para arquivos estáticos
- [ ] Monitoramento de performance

## Fase 21: Testes e QA
- [ ] Testes unitários (Vitest)
- [ ] Testes de integração
- [ ] Testes de performance
- [ ] Testes de responsividade
- [ ] Testes de segurança
- [ ] Testes de conformidade LGPD

## Fase 22: Deploy e Entrega
- [ ] Checkpoint final
- [ ] Documentação do sistema
- [ ] Manual do usuário
- [ ] Treinamento da equipe
- [ ] Suporte pós-lançamento
