-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPERVISOR', 'USER');

-- CreateEnum
CREATE TYPE "DropdownTypeKey" AS ENUM ('STATUS', 'LOCATION', 'MATERIAL', 'PROBABILITY');

-- CreateEnum
CREATE TYPE "DeleteRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('ENQUIRY_CREATED', 'ENQUIRY_UPDATED', 'ENQUIRY_DELETE_REQUESTED', 'ENQUIRY_DELETE_APPROVED', 'ENQUIRY_DELETE_REJECTED', 'ENQUIRY_RESTORED', 'DROPDOWN_VALUE_CREATED', 'DROPDOWN_VALUE_UPDATED', 'DROPDOWN_VALUE_DEACTIVATED', 'DROPDOWN_VALUE_REACTIVATED', 'COMPANY_CREATED', 'COMPANY_UPDATED', 'USER_CREATED', 'USER_UPDATED', 'USER_DEACTIVATED', 'USER_REACTIVATED', 'USER_PASSWORD_RESET', 'USER_COMPANY_ASSIGNED', 'USER_COMPANY_REVOKED', 'SUPERVISOR_ASSIGNED', 'SUPERVISOR_REMOVED', 'DATA_EXPORTED');

-- CreateEnum
CREATE TYPE "AuditEntity" AS ENUM ('ENQUIRY', 'COMPANY', 'USER', 'DROPDOWN_VALUE', 'DELETE_REQUEST', 'SUPERVISOR_ASSIGNMENT', 'USER_COMPANY');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "legalName" TEXT,
    "logoUrl" TEXT,
    "color" TEXT NOT NULL DEFAULT '#1E4FD8',
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_counters" (
    "companyId" TEXT NOT NULL,
    "nextSerialNo" INTEGER NOT NULL DEFAULT 1,
    "nextJobNo" INTEGER NOT NULL DEFAULT 1000,
    "jobNoPrefix" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "company_counters_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayCode" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "avatarColor" TEXT NOT NULL DEFAULT '#1E4FD8',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_companies" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisor_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supervisor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "successful" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dropdown_types" (
    "id" TEXT NOT NULL,
    "key" "DropdownTypeKey" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dropdown_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dropdown_values" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "typeKey" "DropdownTypeKey" NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "numericValue" DECIMAL(6,2),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dropdown_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "serialNo" INTEGER NOT NULL,
    "jobNo" TEXT NOT NULL,
    "enquiryDate" TIMESTAMP(3) NOT NULL,
    "salesResponsibleId" TEXT,
    "customerName" TEXT NOT NULL,
    "projectName" TEXT,
    "statusValueId" TEXT,
    "locationValueId" TEXT,
    "materialValueId" TEXT,
    "enquiryDetails" TEXT,
    "quoteValue" DECIMAL(16,2),
    "probabilityValueId" TEXT,
    "expectedOrderDate" TIMESTAMP(3),
    "expectedBillingDate" TIMESTAMP(3),
    "email" TEXT,
    "phoneNumber" TEXT,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deleteReason" TEXT,

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delete_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "status" "DeleteRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "supervisorId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delete_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "actorId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity" "AuditEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "changes" JSONB,
    "metadata" JSONB,
    "enquiryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");

-- CreateIndex
CREATE INDEX "companies_isActive_idx" ON "companies"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "user_companies_companyId_idx" ON "user_companies"("companyId");

-- CreateIndex
CREATE INDEX "user_companies_userId_idx" ON "user_companies"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_companies_userId_companyId_key" ON "user_companies"("userId", "companyId");

-- CreateIndex
CREATE INDEX "supervisor_assignments_supervisorId_idx" ON "supervisor_assignments"("supervisorId");

-- CreateIndex
CREATE UNIQUE INDEX "supervisor_assignments_userId_key" ON "supervisor_assignments"("userId");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");

-- CreateIndex
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "login_attempts_identifier_createdAt_idx" ON "login_attempts"("identifier", "createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_ipAddress_createdAt_idx" ON "login_attempts"("ipAddress", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "dropdown_types_key_key" ON "dropdown_types"("key");

-- CreateIndex
CREATE INDEX "dropdown_values_companyId_typeKey_isActive_sortOrder_idx" ON "dropdown_values"("companyId", "typeKey", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "dropdown_values_companyId_typeKey_label_key" ON "dropdown_values"("companyId", "typeKey", "label");

-- CreateIndex
CREATE INDEX "enquiries_companyId_isDeleted_createdAt_idx" ON "enquiries"("companyId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "enquiries_companyId_isDeleted_enquiryDate_idx" ON "enquiries"("companyId", "isDeleted", "enquiryDate" DESC);

-- CreateIndex
CREATE INDEX "enquiries_companyId_salesResponsibleId_idx" ON "enquiries"("companyId", "salesResponsibleId");

-- CreateIndex
CREATE INDEX "enquiries_companyId_statusValueId_idx" ON "enquiries"("companyId", "statusValueId");

-- CreateIndex
CREATE INDEX "enquiries_companyId_locationValueId_idx" ON "enquiries"("companyId", "locationValueId");

-- CreateIndex
CREATE INDEX "enquiries_companyId_materialValueId_idx" ON "enquiries"("companyId", "materialValueId");

-- CreateIndex
CREATE INDEX "enquiries_companyId_probabilityValueId_idx" ON "enquiries"("companyId", "probabilityValueId");

-- CreateIndex
CREATE INDEX "enquiries_companyId_expectedOrderDate_idx" ON "enquiries"("companyId", "expectedOrderDate");

-- CreateIndex
CREATE INDEX "enquiries_companyId_expectedBillingDate_idx" ON "enquiries"("companyId", "expectedBillingDate");

-- CreateIndex
CREATE INDEX "enquiries_companyId_customerName_idx" ON "enquiries"("companyId", "customerName");

-- CreateIndex
CREATE UNIQUE INDEX "enquiries_companyId_jobNo_key" ON "enquiries"("companyId", "jobNo");

-- CreateIndex
CREATE UNIQUE INDEX "enquiries_companyId_serialNo_key" ON "enquiries"("companyId", "serialNo");

-- CreateIndex
CREATE INDEX "delete_requests_companyId_status_requestedAt_idx" ON "delete_requests"("companyId", "status", "requestedAt" DESC);

-- CreateIndex
CREATE INDEX "delete_requests_supervisorId_status_idx" ON "delete_requests"("supervisorId", "status");

-- CreateIndex
CREATE INDEX "delete_requests_requestedById_status_idx" ON "delete_requests"("requestedById", "status");

-- CreateIndex
CREATE INDEX "delete_requests_enquiryId_status_idx" ON "delete_requests"("enquiryId", "status");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_createdAt_idx" ON "audit_logs"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_createdAt_idx" ON "audit_logs"("entity", "entityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_enquiryId_createdAt_idx" ON "audit_logs"("enquiryId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "company_counters" ADD CONSTRAINT "company_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dropdown_values" ADD CONSTRAINT "dropdown_values_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dropdown_values" ADD CONSTRAINT "dropdown_values_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "dropdown_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_salesResponsibleId_fkey" FOREIGN KEY ("salesResponsibleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_statusValueId_fkey" FOREIGN KEY ("statusValueId") REFERENCES "dropdown_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_locationValueId_fkey" FOREIGN KEY ("locationValueId") REFERENCES "dropdown_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_materialValueId_fkey" FOREIGN KEY ("materialValueId") REFERENCES "dropdown_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_probabilityValueId_fkey" FOREIGN KEY ("probabilityValueId") REFERENCES "dropdown_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delete_requests" ADD CONSTRAINT "delete_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delete_requests" ADD CONSTRAINT "delete_requests_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delete_requests" ADD CONSTRAINT "delete_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delete_requests" ADD CONSTRAINT "delete_requests_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delete_requests" ADD CONSTRAINT "delete_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
