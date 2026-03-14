# Especificações NFS-e - Extraídas do PDF

## Dados do Emitente (Prestador)
- **CNPJ:** 46.201.011/0001-30
- **Razão Social:** WESLEY SERVICOS MEDICOS LTDA
- **Telefone:** (19)3861-2800
- **E-mail:** adcon17@hotmail.com
- **Município:** Mogi Guaçu/SP
- **Opção Simples Nacional:** Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)
- **Regime de Apuração:** Regime de apuração dos tributos federais e municipal pelo Simples Nacional

## Fluxo de Emissão (4 etapas)
1. **Pessoas** - Dados do emitente e tomador
2. **Serviço** - Descrição do serviço prestado
3. **Valores/Tributação** - Valores e configuração tributária
4. **Emitir NFS-e** - Conferência e emissão

## Etapa 1: Pessoas
- **Data de Competência:** Data atual (padrão), editável pelo usuário
- **Emitente:** Prestador (fixo)
- **Tomador do Serviço:**
  - Localização: Brasil
  - Documento: CPF (padrão para pessoa física)
  - Campos obrigatórios: CPF, Nome, e-mail OU telefone (pelo menos um), endereço
  - Campos de endereço: CEP, Município, Bairro, Logradouro, Número, Complemento
- **Intermediário:** Não informado (padrão)

## Etapa 2: Serviço
- **Local da Prestação:** Brasil, Mogi Guaçu/SP
- **Código de Tributação Nacional:** 04.03.03 - Clínicas, sanatórios, manicômios, casas de saúde, prontos-socorros, ambulatórios e congêneres
- **Imunidade/exportação/não incidência ISSQN:** Não
- **Município de incidência ISSQN:** Mogi Guaçu/SP
- **Descrição do Serviço:** "Procedimentos Médicos Ambulatoriais" (fixo)
  - Complemento na descrição: forma de pagamento (Pix, débito, cartão de crédito...), se parcelada, em quantas vezes
  - Se financiamento: referente à parcela X, Y ou Z, pago via boleto ou Pix para financiadora Multban
  - Texto obrigatório abaixo: "NÃO SUJEITO A RETENCAO A SEGURIDADE SOCIAL, CONFORME ART-31 DA LEI-8.212/91, OS/INSS-209/99, IN/INSS-DC-100/03 E IN 971/09 ART.120 INCISO III. OS SERVICOS ACIMA DESCRITOS FORAM PRESTADOS PESSOALMENTE PELO(S) SOCIO(S) E SEM O CONCURSO DE EMPREGADOS OU OUTROS CONTRIBUINTES INDIVIDUAIS"
- **Item NBS:** 123012100 - Serviços de clínica médica
- **Informações Complementares:** Campos opcionais (nº doc responsabilidade técnica, doc referência, etc.)

## Etapa 3: Valores e Tributação
### Valores do Serviço Prestado
- **Valor do serviço prestado:** Campo editável (ex: R$ 13.320,00)
- Valor recebido pelo intermediário: vazio
- Desconto incondicionado: vazio
- Desconto condicionado: vazio

### Tributação Municipal
- **Tributação ISSQN:** Operação Tributável
- **Regime Especial de Tributação:** Nenhum
- **Exigibilidade recolhimento ISSQN suspensa:** Não
- **Retenção ISSQN pelo Tomador/Intermediário:** Não
- **Benefício municipal:** Não
- **Dedução/Redução base cálculo ISSQN:** Não (município não permite)
- Alíquota, BC ISSQN, Valor ISSQN: calculados automaticamente

### Tributação Federal
- **Situação Tributária PIS/COFINS:** 00 - Nenhum
- **Tipo retenção PIS/COFINS/CSLL:** PIS/COFINS/CSLL Não Retidos
- **IRRF:** R$ 0,00
- **Contribuições Sociais - Retidas:** R$ 0,00
- **Contribuição Previdenciária - Retida:** R$ 0,00

### Valor Aproximado dos Tributos
- **Opção:** Informar alíquota do Simples Nacional
- **Alíquota Simples Nacional:** 18,63%

## Etapa 4: Conferência e Emissão
- Revisão de todos os dados antes de emitir
- Prévia dos valores da NFS-e (ISSQN calculado, tributação federal, valor líquido)

## Regras de Negócio (do texto do Wésley)
1. Data de competência: padrão = data atual, editável
2. Tomador: Brasil, CPF, exigir endereço, e-mail OU telefone obrigatório
3. Configurações fiscais: opção homologação (testes) ou produção (validade fiscal)
4. Descrição: sempre "Serviços/procedimentos médicos ambulatoriais" + forma pagamento + texto legal
5. Tributação municipal: não mexer (padrão Mogi Guaçu/SP), exceto se PJ de outro município
6. Valor: editável por nota
