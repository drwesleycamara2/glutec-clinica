-- Migration: add peso, altura, IMC e risco cirurgico (ASA) na evolucao clinica
-- weightKg em kg com 2 casas, heightCm como inteiro
-- asaRisk: classificacao ASA (1, 2, 3 ou mais) para risco cirurgico/anestesico

ALTER TABLE clinical_evolutions
  ADD COLUMN weightKg DECIMAL(5,2) NULL AFTER attendanceType,
  ADD COLUMN heightCm INT NULL AFTER weightKg,
  ADD COLUMN asaRisk ENUM('asa_1','asa_2','asa_3_or_more') NULL AFTER heightCm;
