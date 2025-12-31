import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { diskStorage } from "multer"
import * as path from "path"
import * as fs from "fs"
import { QuestionsService } from "./questions.service"
import { CreateExamDto } from "./dto/create-exam.dto"
import { ImportQuestionsDirectDto } from "./dto/import-direct.dto"
import { UpdateQuestionDto } from "./dto/update-question.dto"
import { CreateQuestionDto } from "./dto/create-question.dto"

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
}

function safeExt(originalname: string) {
  const ext = path.extname(originalname || "").toLowerCase()
  const allowed = [".png", ".jpg", ".jpeg", ".webp", ".svg"]
  return allowed.includes(ext) ? ext : ""
}

@Controller("questions")
export class QuestionsController {
  constructor(private qs: QuestionsService) {}

  @Get("universities")
  async getUniversities() {
    return this.qs.listUniversities()
  }

  @Post("university")
  async createUniversity(
    @Body()
    body: { name: string; nameAz?: string; nameEn?: string; nameRu?: string; logo?: string | null },
  ) {
    return this.qs.createUniversity(body)
  }

  /**
   * Logo upload endpoint
   * form-data:
   *   key: file   (type: file)
   */
  @Post("university/:universityId/logo")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = path.join(process.cwd(), "uploads", "university")
          ensureDir(dir)
          cb(null, dir)
        },
        filename: (req, file, cb) => {
          const ext = safeExt(file.originalname)
          if (!ext) return cb(new Error("Invalid file type"), "")
          const rnd = Math.random().toString(16).slice(2)
          cb(null, `${Date.now()}-${rnd}${ext}`)
        },
      }),
      fileFilter: (req, file, cb) => {
        const ext = safeExt(file.originalname)
        if (!ext) return cb(new Error("Only png/jpg/jpeg/webp/svg allowed"), false)
        cb(null, true)
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadUniversityLogo(@Param("universityId") universityId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Logo file is required")
    const publicPath = `/uploads/university/${file.filename}`
    return this.qs.setUniversityLogo(universityId, publicPath)
  }

  @Patch("bank/:bankId")
  async updateBank(
    @Param("bankId") bankId: string,
    @Body()
    body: { title?: string; year?: number | string; price?: number | string },
  ) {
    return this.qs.updateBank(bankId, body)
  }

  @Patch("university/:universityId")
  async updateUniversity(
    @Param("universityId") universityId: string,
    @Body() body: { name?: string; nameAz?: string; nameEn?: string; nameRu?: string; logo?: string | null },
  ) {
    return this.qs.updateUniversity(universityId, body)
  }

  @Delete("university/:universityId")
  async deleteUniversity(@Param("universityId") universityId: string) {
    return this.qs.deleteUniversity(universityId)
  }

  @Get("subjects")
  async getSubjects() {
    return this.qs.listSubjects()
  }

  @Post("subject")
  async createSubject(@Body() body: { name: string; nameAz?: string; nameEn?: string; nameRu?: string }) {
    return this.qs.createSubject(body)
  }

  @Patch("subject/:subjectId")
  async updateSubject(
    @Param("subjectId") subjectId: string,
    @Body() body: { name?: string; nameAz?: string; nameEn?: string; nameRu?: string },
  ) {
    return this.qs.updateSubject(subjectId, body)
  }

  @Delete("subject/:subjectId")
  async deleteSubject(@Param("subjectId") subjectId: string) {
    return this.qs.deleteSubject(subjectId)
  }

  @Get("exams")
  async getExams(
    @Query("universityId") universityId?: string,
    @Query("subjectId") subjectId?: string,
    @Query("year") year?: string,
  ) {
    return this.qs.getExams({
      universityId,
      subjectId,
      year: year ? Number(year) : undefined,
    })
  }

  @Post("exam")
  async createExam(@Body() dto: CreateExamDto) {
    return this.qs.createExam(dto)
  }

  @Get("exam/:examId")
  async getExamQuestions(@Param("examId") examId: string) {
    throw new BadRequestException("Use /attempts/:attemptId/questions endpoint")
  }

  @Get("bank/:bankId/questions")
  async listBankQuestions(@Param("bankId") bankId: string) {
    return this.qs.listBankQuestions(bankId)
  }

  @Post("bank/:bankId/question")
  async createQuestion(@Param("bankId") bankId: string, @Body() dto: CreateQuestionDto) {
    return this.qs.createQuestion(bankId, dto)
  }

  @Post("bank/:bankId/questions")
  async createQuestionAlias(@Param("bankId") bankId: string, @Body() dto: CreateQuestionDto) {
    return this.qs.createQuestion(bankId, dto)
  }

  @Patch("question/:questionId")
  async updateQuestion(@Param("questionId") questionId: string, @Body() dto: UpdateQuestionDto) {
    return this.qs.updateQuestion(questionId, dto)
  }

  @Delete("question/:questionId")
  async deleteQuestion(@Param("questionId") questionId: string) {
    return this.qs.deleteQuestion(questionId)
  }

  @Delete("bank/:bankId")
  async deleteBank(@Param("bankId") bankId: string) {
    return this.qs.deleteBank(bankId)
  }

  @Get("years")
  async getYears(@Query("universityId") universityId?: string) {
    return this.qs.listExamYears({ universityId })
  }
}

@Controller()
export class BankQuestionsController {
  constructor(private qs: QuestionsService) {}

  @Post("banks/:bankId/questions/import-direct")
  async importDirect(@Param("bankId") bankId: string, @Body() dto: ImportQuestionsDirectDto) {
    return this.qs.importQuestionsDirect(bankId, dto)
  }
}
