-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN "ownerId" UUID;

-- CreateIndex
CREATE INDEX "Quiz_ownerId_idx" ON "Quiz"("ownerId");
