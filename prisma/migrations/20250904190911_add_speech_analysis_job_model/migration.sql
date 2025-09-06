-- CreateEnum
CREATE TYPE "SpeechAnalysisStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "speech_analysis_jobs" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SpeechAnalysisStatus" NOT NULL DEFAULT 'QUEUED',
    "filename" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "operationName" TEXT,
    "transcript" TEXT,
    "confidence" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "completionTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "speech_analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "speech_analysis_jobs" ADD CONSTRAINT "speech_analysis_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
