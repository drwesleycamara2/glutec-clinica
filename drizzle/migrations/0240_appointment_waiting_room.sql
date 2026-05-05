ALTER TABLE `appointments`
  MODIFY COLUMN `status` ENUM('agendada','confirmada','aguardando','em_atendimento','concluida','cancelada','falta') NOT NULL DEFAULT 'agendada',
  ADD COLUMN IF NOT EXISTS `arrivedAt` DATETIME NULL;