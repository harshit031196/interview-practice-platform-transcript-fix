/*
  Warnings:

  - A unique constraint covering the columns `[sessionId,segmentIndex]` on the table `video_analysis` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `segmentIndex` to the `video_analysis` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "video_analysis_sessionId_userId_key";

-- AlterTable
ALTER TABLE "video_analysis" ADD COLUMN     "segmentIndex" INTEGER; 
UPDATE "video_analysis" SET "segmentIndex" = 0 WHERE "segmentIndex" IS NULL;
ALTER TABLE "video_analysis" ALTER COLUMN "segmentIndex" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "video_analysis_sessionId_segmentIndex_key" ON "video_analysis"("sessionId", "segmentIndex");

-- AddForeignKey
ALTER TABLE "video_analysis" ADD CONSTRAINT "video_analysis_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
