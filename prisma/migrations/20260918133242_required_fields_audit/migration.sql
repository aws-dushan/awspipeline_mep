-- Changing which fields a request must carry is an administrative decision,
-- so it belongs in the audit history like the others.
ALTER TYPE "AuditAction" ADD VALUE 'REQUIRED_FIELDS_CHANGED';
ALTER TYPE "AuditEntity" ADD VALUE 'ENQUIRY_FIELD_RULE';
