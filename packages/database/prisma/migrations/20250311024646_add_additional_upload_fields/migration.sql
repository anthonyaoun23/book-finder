-- AlterTable
ALTER TABLE "Upload" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "rawOpenAIJson" JSONB,
ADD COLUMN     "refinedAuthor" TEXT,
ADD COLUMN     "refinedTitle" TEXT;
