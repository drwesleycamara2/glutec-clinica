-- Migration: add attendanceType to clinical_evolutions
-- Tipo de atendimento: presencial ou online (obrigatório na evolução clínica)

ALTER TABLE clinical_evolutions
  ADD COLUMN attendanceType ENUM('presencial', 'online') NULL
  AFTER appointmentId;
