-- ============================================================
-- Migração: Módulo Fiscal - NFS-e
-- Data: 2026-04-05
-- Descrição: Emissão e histórico de Notas Fiscais de Serviço
--            Eletrônicas (NFS-e), configuração fiscal e integração
--            com prefeitura via WebService.
-- ============================================================

-- ─── 1. CONFIGURAÇÃO FISCAL DA CLÍNICA ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS `fiscal_config` (
  `id`                    INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cnpj`                  VARCHAR(18)   NULL COMMENT 'CNPJ com máscara: 00.000.000/0001-00',
  `razaoSocial`           VARCHAR(256)  NULL,
  `nomeFantasia`          VARCHAR(256)  NULL,
  `inscricaoMunicipal`    VARCHAR(32)   NULL COMMENT 'Inscrição Municipal (IM)',
  `inscricaoEstadual`     VARCHAR(32)   NULL,
  `codigoMunicipio`       VARCHAR(16)   NULL COMMENT 'Código IBGE do município',
  `municipio`             VARCHAR(128)  NULL,
  `uf`                    VARCHAR(2)    NULL,
  `cep`                   VARCHAR(9)    NULL,
  `logradouro`            VARCHAR(256)  NULL,
  `numero`                VARCHAR(16)   NULL,
  `complemento`           VARCHAR(128)  NULL,
  `bairro`                VARCHAR(128)  NULL,
  `telefone`              VARCHAR(20)   NULL,
  `email`                 VARCHAR(320)  NULL,
  `regimeTributario`      ENUM('simples_nacional','lucro_presumido','lucro_real','mei') NULL DEFAULT 'simples_nacional',
  `aliquotaIss`           DECIMAL(5,2)  NULL DEFAULT 2.00 COMMENT 'Alíquota ISS em %',
  `codigoServico`         VARCHAR(32)   NULL COMMENT 'Código de serviço municipal (LC 116)',
  `itemListaServico`      VARCHAR(16)   NULL COMMENT 'Item da lista de serviços (ex: 4.03)',
  `cnaeServico`           VARCHAR(16)   NULL COMMENT 'CNAE principal',
  `descricaoServico`      TEXT          NULL COMMENT 'Descrição padrão do serviço',
  `numeracaoSequencial`   INT           NOT NULL DEFAULT 1 COMMENT 'Próximo número de NFS-e',
  `ambiente`              ENUM('producao','homologacao') NOT NULL DEFAULT 'homologacao',
  `certificadoDigital`    TEXT          NULL COMMENT 'Certificado A1 em base64',
  `certificadoSenha`      TEXT          NULL COMMENT 'Senha do certificado (criptografada)',
  `certificadoVencimento` DATE          NULL,
  `provedor`              VARCHAR(64)   NULL COMMENT 'ginfes | betha | paulistana | nfse_nacional | outro',
  `webserviceUrl`         TEXT          NULL COMMENT 'URL do WebService da prefeitura',
  `ativo`                 TINYINT(1)    NOT NULL DEFAULT 0,
  `createdAt`             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 2. TOMADORES DE SERVIÇO (CLIENTES FISCAIS) ──────────────────────────────
-- Complementa dados do paciente com dados fiscais para emissão de NFS-e
CREATE TABLE IF NOT EXISTS `fiscal_tomadores` (
  `id`                    INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `patientId`             INT           NULL COMMENT 'Referência ao paciente (opcional)',
  `tipoPessoa`            ENUM('fisica','juridica') NOT NULL DEFAULT 'fisica',
  `cpfCnpj`               VARCHAR(18)   NULL COMMENT 'CPF ou CNPJ do tomador',
  `nome`                  VARCHAR(256)  NOT NULL,
  `email`                 VARCHAR(320)  NULL,
  `telefone`              VARCHAR(20)   NULL,
  `inscricaoMunicipal`    VARCHAR(32)   NULL,
  `inscricaoEstadual`     VARCHAR(32)   NULL,
  `cep`                   VARCHAR(9)    NULL,
  `logradouro`            VARCHAR(256)  NULL,
  `numero`                VARCHAR(16)   NULL,
  `complemento`           VARCHAR(128)  NULL,
  `bairro`                VARCHAR(128)  NULL,
  `municipio`             VARCHAR(128)  NULL,
  `codigoMunicipio`       VARCHAR(16)   NULL,
  `uf`                    VARCHAR(2)    NULL,
  `createdAt`             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_ftom_patient` (`patientId`),
  INDEX `idx_ftom_cpfcnpj` (`cpfCnpj`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 3. NOTAS FISCAIS DE SERVIÇO ELETRÔNICAS (NFS-e) ─────────────────────────
CREATE TABLE IF NOT EXISTS `nfse` (
  `id`                    INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  -- Referências
  `patientId`             INT           NULL,
  `tomadorId`             INT           NULL,
  `appointmentId`         INT           NULL,
  `paymentId`             INT           NULL,
  `budgetId`              INT           NULL,
  -- Numeração
  `numeroNfse`            VARCHAR(32)   NULL COMMENT 'Número da NFS-e emitida pela prefeitura',
  `numeroRps`             INT           NOT NULL COMMENT 'Número do RPS (Recibo Provisório de Serviços)',
  `serieRps`              VARCHAR(5)    NOT NULL DEFAULT 'RPS',
  `tipoRps`               VARCHAR(5)    NOT NULL DEFAULT '1' COMMENT '1=RPS, 2=Mista, 3=Cupom',
  -- Datas
  `dataEmissao`           DATETIME      NOT NULL,
  `dataCompetencia`       DATE          NOT NULL COMMENT 'Mês de competência do serviço',
  -- Tomador (snapshot no momento da emissão)
  `tomadorNome`           VARCHAR(256)  NULL,
  `tomadorCpfCnpj`        VARCHAR(18)   NULL,
  `tomadorEmail`          VARCHAR(320)  NULL,
  `tomadorEndereco`       TEXT          NULL COMMENT 'JSON com endereço completo',
  -- Serviço
  `descricaoServico`      TEXT          NOT NULL,
  `codigoServico`         VARCHAR(32)   NULL,
  `itemListaServico`      VARCHAR(16)   NULL,
  `cnaeServico`           VARCHAR(16)   NULL,
  `codigoMunicipioIncidencia` VARCHAR(16) NULL,
  -- Valores
  `valorServicos`         DECIMAL(12,2) NOT NULL,
  `valorDeducoes`         DECIMAL(12,2) NOT NULL DEFAULT 0,
  `valorPis`              DECIMAL(12,2) NOT NULL DEFAULT 0,
  `valorCofins`           DECIMAL(12,2) NOT NULL DEFAULT 0,
  `valorInss`             DECIMAL(12,2) NOT NULL DEFAULT 0,
  `valorIr`               DECIMAL(12,2) NOT NULL DEFAULT 0,
  `valorCsll`             DECIMAL(12,2) NOT NULL DEFAULT 0,
  `issRetido`             TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '0=Não retido, 1=Retido na fonte',
  `valorIss`              DECIMAL(12,2) NOT NULL DEFAULT 0,
  `valorIssRetido`        DECIMAL(12,2) NOT NULL DEFAULT 0,
  `outrasRetencoes`       DECIMAL(12,2) NOT NULL DEFAULT 0,
  `baseCalculo`           DECIMAL(12,2) NOT NULL DEFAULT 0,
  `aliquota`              DECIMAL(5,4)  NOT NULL DEFAULT 0 COMMENT 'Alíquota em decimal (ex: 0.02 = 2%)',
  `valorLiquidoNfse`      DECIMAL(12,2) NOT NULL DEFAULT 0,
  `descontoIncondicionado` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `descontoCondicionado`  DECIMAL(12,2) NOT NULL DEFAULT 0,
  -- Status e integração
  `status`                ENUM('rascunho','aguardando','autorizada','cancelada','substituida','erro') NOT NULL DEFAULT 'rascunho',
  `codigoVerificacao`     VARCHAR(64)   NULL COMMENT 'Código de verificação da prefeitura',
  `ambiente`              ENUM('producao','homologacao') NOT NULL DEFAULT 'homologacao',
  -- XMLs e PDF
  `xmlEnviado`            LONGTEXT      NULL COMMENT 'XML do RPS enviado',
  `xmlRetorno`            LONGTEXT      NULL COMMENT 'XML de retorno da prefeitura',
  `xmlNfse`               LONGTEXT      NULL COMMENT 'XML da NFS-e autorizada',
  `pdfUrl`                TEXT          NULL COMMENT 'URL do PDF da nota',
  `linkNfse`              TEXT          NULL COMMENT 'Link para consulta na prefeitura',
  -- Cancelamento/substituição
  `motivoCancelamento`    TEXT          NULL,
  `dataCancelamento`      DATETIME      NULL,
  `nfseSubstituidaId`     INT           NULL COMMENT 'NFS-e que esta substitui',
  -- Controle
  `erroMensagem`          TEXT          NULL COMMENT 'Mensagem de erro em caso de falha',
  `tentativas`            INT           NOT NULL DEFAULT 0,
  `enviadoPorId`          INT           NULL COMMENT 'userId que emitiu',
  `createdAt`             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_nfse_patient`   (`patientId`),
  INDEX `idx_nfse_numero`    (`numeroNfse`),
  INDEX `idx_nfse_rps`       (`numeroRps`),
  INDEX `idx_nfse_status`    (`status`),
  INDEX `idx_nfse_emissao`   (`dataEmissao`),
  INDEX `idx_nfse_competencia` (`dataCompetencia`),
  FOREIGN KEY (`patientId`)  REFERENCES `patients`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`tomadorId`)  REFERENCES `fiscal_tomadores`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 4. LOG DE EVENTOS FISCAIS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `nfse_events` (
  `id`          INT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `nfseId`      INT       NOT NULL,
  `event`       VARCHAR(64) NOT NULL COMMENT 'emissao | cancelamento | consulta | reenvio | erro',
  `status`      VARCHAR(32) NULL,
  `message`     TEXT      NULL,
  `xmlRequest`  LONGTEXT  NULL,
  `xmlResponse` LONGTEXT  NULL,
  `userId`      INT       NULL,
  `createdAt`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_nfse_evt_nfse` (`nfseId`),
  FOREIGN KEY (`nfseId`) REFERENCES `nfse`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 5. DASHBOARD FISCAL - VIEW AUXILIAR ─────────────────────────────────────
-- Totais por mês de competência (para relatórios)
CREATE OR REPLACE VIEW `v_nfse_mensal` AS
SELECT
  DATE_FORMAT(dataCompetencia, '%Y-%m') AS mes,
  COUNT(*)                               AS total_notas,
  SUM(CASE WHEN status = 'autorizada'  THEN 1 ELSE 0 END) AS autorizadas,
  SUM(CASE WHEN status = 'cancelada'   THEN 1 ELSE 0 END) AS canceladas,
  SUM(CASE WHEN status = 'erro'        THEN 1 ELSE 0 END) AS com_erro,
  SUM(CASE WHEN status = 'autorizada'  THEN valorServicos  ELSE 0 END) AS total_servicos,
  SUM(CASE WHEN status = 'autorizada'  THEN valorIss       ELSE 0 END) AS total_iss,
  SUM(CASE WHEN status = 'autorizada'  THEN valorLiquidoNfse ELSE 0 END) AS total_liquido
FROM `nfse`
GROUP BY DATE_FORMAT(dataCompetencia, '%Y-%m')
ORDER BY mes DESC;
