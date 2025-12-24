-- DropForeignKey
ALTER TABLE "Attempt" DROP CONSTRAINT "Attempt_bankId_fkey";

-- DropForeignKey
ALTER TABLE "Attempt" DROP CONSTRAINT "Attempt_userId_fkey";

-- DropForeignKey
ALTER TABLE "AttemptAnswer" DROP CONSTRAINT "AttemptAnswer_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "AttemptAnswer" DROP CONSTRAINT "AttemptAnswer_questionId_fkey";

-- DropForeignKey
ALTER TABLE "PdfImport" DROP CONSTRAINT "PdfImport_bankId_fkey";

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_bankId_fkey";

-- DropForeignKey
ALTER TABLE "QuestionBank" DROP CONSTRAINT "QuestionBank_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "QuestionBank" DROP CONSTRAINT "QuestionBank_topicId_fkey";

-- DropForeignKey
ALTER TABLE "QuestionBank" DROP CONSTRAINT "QuestionBank_universityId_fkey";

-- DropForeignKey
ALTER TABLE "QuestionOption" DROP CONSTRAINT "QuestionOption_questionId_fkey";

-- AddForeignKey
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfImport" ADD CONSTRAINT "PdfImport_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "QuestionBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "QuestionBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "QuestionBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
