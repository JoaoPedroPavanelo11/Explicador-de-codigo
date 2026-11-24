-- Identidade da fonte (impressão digital, commit e minimapa). O código em si não é guardado.
ALTER TABLE "analyses" ADD COLUMN "source_identity" JSONB;
