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
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common"
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express"
import { diskStorage } from "multer"
import * as path from "path"
import * as fs from "fs"
import { QuestionsService } from "./questions.service"
import { CreateExamDto } from "./dto/create-exam.dto"
import { ImportQuestionsDirectDto } from "./dto/import-direct.dto"
import { UpdateQuestionDto } from "./dto/update-question.dto"
import { CreateQuestionDto } from "./dto/create-question.dto"
import { UpdateExamDto } from "./dto/update-exam.dto"

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
}

function safeExt(originalname: string) {
  const ext = path.extname(originalname || "").toLowerCase()
  const allowed = [".png", ".jpg", ".jpeg", ".webp", ".svg"]
  return allowed.includes(ext) ? ext : ""
}

function makeImageStorage(subdir: string) {
  return diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(process.cwd(), "uploads", subdir)
      ensureDir(dir)
      cb(null, dir)
    },
    filename: (req, file, cb) => {
      const ext = safeExt(file.originalname)
      if (!ext) return cb(new Error("Invalid file type"), "")
      const rnd = Math.random().toString(16).slice(2)
      cb(null, `${Date.now()}-${rnd}${ext}`)
    },
  })
}

@Controller("questions")
export class QuestionsController {
  constructor(private qs: QuestionsService) { }

  // ---------------- Universities ----------------
  @Get("universities")
  async getUniversities() {
    return this.qs.listUniversities()
  }

  @Post("university")
  async createUniversity(
    @Body() body: { name: string; nameAz?: string; nameEn?: string; nameRu?: string; logo?: string | null },
  ) {
    return this.qs.createUniversity(body)
  }

  @Post("university/:universityId/logo")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: makeImageStorage("university"),
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

  // ---------------- Subjects ----------------
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

  // ---------------- Exams / Banks ----------------
  @Get("exams")
  async getExams(
    @Query("universityId") universityId?: string,
    @Query("subjectId") subjectId?: string,
    @Query("year") year?: string,
    @Query("search") search?: string,
    @Query("page") pageStr?: string,
    @Query("limit") limitStr?: string,
  ) {
    const page = pageStr ? parseInt(pageStr, 10) : 1
    const limit = limitStr ? parseInt(limitStr, 10) : 10
    if (isNaN(page) || page < 1) throw new BadRequestException("Invalid page")
    if (isNaN(limit) || limit < 1 || limit > 100) throw new BadRequestException("Invalid limit")

    return this.qs.getExams({
      universityId,
      subjectId,
      year: year ? Number(year) : undefined,
      search,
      page,
      limit,
    })
  }

  @Get("exams-admin")
  async getExamsForAdmin(
    @Query("universityId") universityId?: string,
    @Query("subjectId") subjectId?: string,
    @Query("year") year?: string,
    @Query("search") search?: string,
    @Query("page") pageStr?: string,
    @Query("limit") limitStr?: string,
  ) {
    const page = pageStr ? parseInt(pageStr, 10) : 1
    const limit = limitStr ? parseInt(limitStr, 10) : 10
    if (isNaN(page) || page < 1) throw new BadRequestException("Invalid page")
    if (isNaN(limit) || limit < 1 || limit > 100) throw new BadRequestException("Invalid limit")

    return this.qs.getExamsForAdmin({
      universityId,
      subjectId,
      year: year ? Number(year) : undefined,
      search,
      page,
      limit,
    })
  }

  @Post("exam")
  async createExam(@Body() dto: CreateExamDto) {
    return this.qs.createExam(dto)
  }

  @Patch("bank/:bankId")
  async updateBank(
    @Param("bankId") bankId: string,
    @Body() dto: UpdateExamDto,
  ) {
    return this.qs.updateBank(bankId, dto)
  }

  @Delete("bank/:bankId")
  async deleteBank(@Param("bankId") bankId: string) {
    return this.qs.deleteBank(bankId)
  }

  @Get("bank/:bankId/questions")
  async listBankQuestions(@Param("bankId") bankId: string) {
    return this.qs.listBankQuestions(bankId)
  }

  // ---------------- Questions CRUD ----------------
  @Post("bank/:bankId/question")
  async createQuestion(@Param("bankId") bankId: string, @Body() dto: CreateQuestionDto) {
    return this.qs.createQuestion(bankId, dto as any)
  }

  @Post("bank/:bankId/questions")
  async createQuestionAlias(@Param("bankId") bankId: string, @Body() dto: CreateQuestionDto) {
    return this.qs.createQuestion(bankId, dto as any)
  }

  @Patch("question/:questionId")
  async updateQuestion(@Param("questionId") questionId: string, @Body() dto: UpdateQuestionDto) {
    return this.qs.updateQuestion(questionId, dto)
  }

  @Delete("question/:questionId")
  async deleteQuestion(@Param("questionId") questionId: string) {
    return this.qs.deleteQuestion(questionId)
  }

  @Post("question/:questionId/images")
  @UseInterceptors(
    FilesInterceptor("files", 20, {
      storage: makeImageStorage("question"),
      fileFilter: (req, file, cb) => {
        const ext = safeExt(file.originalname)
        if (!ext) return cb(new Error("Only png/jpg/jpeg/webp/svg allowed"), false)
        cb(null, true)
      },
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async uploadQuestionImages(@Param("questionId") questionId: string, @UploadedFiles() files?: Express.Multer.File[]) {
    if (!files || files.length === 0) throw new BadRequestException("At least 1 image is required")
    const publicUrls = files.map((f) => `/uploads/question/${f.filename}`)
    return this.qs.addQuestionImages(questionId, publicUrls)
  }

  @Delete("question-image/:imageId")
  async deleteQuestionImage(@Param("imageId") imageId: string) {
    return this.qs.deleteQuestionImage(imageId)
  }

  // ---------------- Years ----------------
  @Get("years")
  async getYears(
    @Query("universityId") universityId?: string,
    @Query("subjectId") subjectId?: string,
  ) {
    return this.qs.listExamYears({ universityId, subjectId })
  }
}

@Controller()
export class BankQuestionsController {
  constructor(private qs: QuestionsService) { }

 @Post("banks/:bankId/questions/import-direct")
async importDirect(
  @Param("bankId") bankId: string,
  @Body() dto: any
) {
  return this.qs.importQuestionsDirect(bankId, dto);
}

}