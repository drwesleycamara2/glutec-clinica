ALTER TABLE `users`
  MODIFY COLUMN `role`
    ENUM('user','admin','medico','recepcionista','enfermeiro','gerente')
    NOT NULL DEFAULT 'user';

ALTER TABLE `user_invitations`
  MODIFY COLUMN `role`
    ENUM('user','admin','medico','recepcionista','enfermeiro','gerente')
    NOT NULL DEFAULT 'user';