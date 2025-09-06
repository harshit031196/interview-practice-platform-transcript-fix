-- CreateTable
CREATE TABLE "vision_analysis_frames" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "joyLikelihood" INTEGER NOT NULL,
    "sorrowLikelihood" INTEGER NOT NULL,
    "angerLikelihood" INTEGER NOT NULL,
    "surpriseLikelihood" INTEGER NOT NULL,
    "eyeContact" BOOLEAN NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vision_analysis_frames_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "vision_analysis_frames" ADD CONSTRAINT "vision_analysis_frames_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
