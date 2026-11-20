-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('PASTE', 'ZIP', 'GITHUB');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('QUEUED', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "source_ref" VARCHAR(300),
    "status" "AnalysisStatus" NOT NULL DEFAULT 'QUEUED',
    "use_ai" BOOLEAN NOT NULL DEFAULT false,
    "ai_enhanced" BOOLEAN NOT NULL DEFAULT false,
    "score" DECIMAL(3,1),
    "file_count" INTEGER,
    "line_count" INTEGER,
    "result" JSONB,
    "report_md" TEXT,
    "error_message" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "analyses_user_id_created_at_idx" ON "analyses"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
