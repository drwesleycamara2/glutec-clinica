ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS patientAttachmentFolders TEXT NULL;

ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS folderLabel VARCHAR(128) NULL;
