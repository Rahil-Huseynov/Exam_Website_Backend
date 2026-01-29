import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import { Prisma } from '@prisma/client';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private aiQueue: Promise<void> = Promise.resolve();
  private idleTimeoutMs = 60_000;
  private idleTimer?: NodeJS.Timeout;
  private paused = false;
  private killOllamaOnIdle = process.env.KILL_OLLAMA_ON_IDLE === '1';
  private memoryLimitBytes = Number(process.env.OLLAMA_MEMORY_LIMIT_BYTES) || 5 * 1024 * 1024 * 1024;
  private usePrlimitEnv = process.env.USE_PRLIMIT !== '0';
  private prlimitAvailable = false;
  private lastPausedState: boolean | null = null;

  constructor(private readonly prisma: PrismaService) {
    try {
      if (this.usePrlimitEnv && process.platform === 'linux') {
        const which = spawnSync('which', ['prlimit']);
        this.prlimitAvailable = which.status === 0;
        if (this.prlimitAvailable) {
          this.logger.log(`prlimit found — will enforce memory limit ${this.memoryLimitBytes} bytes for ollama worker`);
        } else {
          this.logger.warn('prlimit not found — memory limit for ollama will NOT be enforced (falling back)');
        }
      } else {
        this.logger.log('prlimit disabled by env or non-linux platform; memory limiting is off');
      }
    } catch (err) {
      this.logger.error('prlimit detection failed: ' + (err as any)?.message);
      this.prlimitAvailable = false;
    }
  }

  private escapeShellArg(s: string) {
    return `'${s.replace(/'/g, `'\"'\"'`)}'`;
  }

  async onModuleInit() {
    this.logger.log('AI service started, scanning unfinished answers...');

    const unfinished = await this.prisma.attemptAnswer.findMany({
      where: {
        score: null,
        feedback: null,
        question: {
          is: {
            bank: {
              is: {
                type: 'WRITING',
              },
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    for (const ans of unfinished) {
      const checked = await this.prisma.aiCheckedAnswer.create({
        data: {
          attemptAnswerId: ans.id,
          status: 'PENDING',
        },
      });

      this.enqueueAiCheck(checked.id);
    }

    this.logger.log(`Found ${unfinished.length} unfinished answers`);

    for (const a of unfinished) {
      this.enqueueWritingCheck(a.id);
    }

    this.scheduleIdleShutdown();
  }

  private async safeCheckWithRetry(aiCheckedAnswerId: string) {
    while (true) {
      try {
        await this.checkWithAi(aiCheckedAnswerId);
        return;
      } catch (e) {
        this.logger.error(
          'AI check failed, will retry in 30s: ' + (e as any)?.message,
        );
        await new Promise((res) => setTimeout(res, 30_000));
      }
    }
  }

  private markActive() {
    if (this.paused) {
      this.paused = false;

      if (this.lastPausedState !== this.paused) {
        this.logger.warn('🟢 AI worker RESUMED (paused=false)');
        this.lastPausedState = this.paused;
      }
    }

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }


  private scheduleIdleShutdown() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.shutdownWorker(), this.idleTimeoutMs);
  }

  private shutdownWorker() {
    this.paused = true;

    if (this.lastPausedState !== this.paused) {
      this.logger.warn(`🟡 AI worker PAUSED (idle for ${this.idleTimeoutMs} ms)`);
      this.lastPausedState = this.paused;
    }

    if (this.killOllamaOnIdle) {
      try {
        this.logger.log('Killing lingering ollama processes (KILL_OLLAMA_ON_IDLE=1)');
        const p = spawn('pkill', ['-f', 'ollama']);
        p.on('exit', (code) => {
          this.logger.log(`pkill exited with ${code}`);
        });
      } catch (err) {
        this.logger.error('Failed to pkill ollama: ' + (err as any)?.message);
      }
    }
  }

  private enqueueAiCheck(aiCheckedAnswerId: string) {
    this.markActive();

    this.logger.debug(`📥 enqueueAiCheck called | paused=${this.paused}`);

    this.aiQueue = this.aiQueue
      .then(() => this.safeCheckWithRetry(aiCheckedAnswerId))
      .catch((e) => {
        this.logger.error('AI queue fatal error', e);
      })
      .finally(() => {
        this.scheduleIdleShutdown();
        this.logger.debug(`⏳ queue finished | paused=${this.paused}`);
      });
  }

  enqueueWritingCheck(aiCheckedAnswerId: string) {
    this.enqueueAiCheck(aiCheckedAnswerId);
  }

  private async runLlama(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const safeForLog = prompt.replace(/\r/g, '').replace(/\n+/g, ' ').trim().slice(0, 20000);
        this.logger.warn(
          `Running ollama with prompt (truncated for log): ${safeForLog.length > 400 ? safeForLog.slice(0, 400) + '... (truncated)' : safeForLog}`
        );

        let child;
        const ollamaArgs = ['run', 'llama3.1:8b-instruct-q4_K_M'];
        if (this.prlimitAvailable) {
          const asArg = `--as=${this.memoryLimitBytes}`;
          this.logger.log(`Spawning prlimit to enforce memory limit: ${this.memoryLimitBytes} bytes`);
          child = spawn('prlimit', [asArg, '--', 'ollama', ...ollamaArgs], {
            env: {
              ...process.env,
              OLLAMA_NUM_THREADS: '4',
              OLLAMA_KEEP_ALIVE: '0',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        } else {
          child = spawn('ollama', ollamaArgs, {
            env: {
              ...process.env,
              OLLAMA_NUM_THREADS: '4',
              OLLAMA_KEEP_ALIVE: '0',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        }

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          const chunk = data.toString();
          stderr += chunk;

          const text = chunk.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
          const sample = text.length > 200 ? text.slice(0, 200) + '...' : text;
          this.logger.error(`[Llama stderr chunk] ${sample}`);

          try {
            fs.appendFileSync('/tmp/ollama-stderr.bin', data);
          } catch { }
        });

        child.on('error', (err) => {
          this.logger.error('spawn error', err as any);
          if (this.prlimitAvailable) {
            this.logger.warn('prlimit spawn failed — falling back to direct ollama spawn');
            try {
              const fallback = spawn('ollama', ollamaArgs, {
                env: {
                  ...process.env,
                  OLLAMA_NUM_THREADS: '4',
                  OLLAMA_KEEP_ALIVE: '0',
                },
                stdio: ['pipe', 'pipe', 'pipe'],
              });

              fallback.stdout.on('data', (d) => { stdout += d.toString(); });
              fallback.stderr.on('data', (d) => { stderr += d.toString(); });
              fallback.on('error', (e) => { reject(e); });
              fallback.on('close', (code) => {
                try {
                  fs.writeFileSync('/tmp/ollama-stderr.log', stderr, { encoding: 'binary' });
                  fs.writeFileSync('/tmp/ollama-stdout.log', stdout, { encoding: 'utf8' });
                } catch { }

                if (code === 0) {
                  resolve(stdout);
                } else {
                  const e = new Error(`Llama exited with code ${code}. See /tmp/ollama-stderr.log`);
                  (e as any).stderr = stderr;
                  reject(e);
                }
              });

              fallback.stdin.write(prompt);
              fallback.stdin.end();
              return;
            } catch (fallbackErr) {
              this.logger.error('fallback spawn failed', fallbackErr as any);
              reject(fallbackErr);
              return;
            }
          } else {
            reject(err);
          }
        });

        child.on('close', (code) => {
          try {
            fs.writeFileSync('/tmp/ollama-stderr.log', stderr, { encoding: 'binary' });
            fs.writeFileSync('/tmp/ollama-stdout.log', stdout, { encoding: 'utf8' });
          } catch { }

          if (code === 0) {
            resolve(stdout);
          } else {
            const e = new Error(`Llama exited with code ${code}. See /tmp/ollama-stderr.log`);
            (e as any).stderr = stderr;
            reject(e);
          }
        });

        child.stdin.write(prompt);
        child.stdin.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  async createQuestion(bankId: string, prompt: string, title?: string | null, answerKey?: string | null, adminId?: number | null) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } });
    if (!bank || bank.type !== 'WRITING') throw new Error('Invalid bank for writing question');
    const maxSortRow = await this.prisma.question.findFirst({
      where: { bankId },
      orderBy: { sort: 'desc' },
      select: { sort: true },
    });
    const nextSort = (maxSortRow?.sort ?? 0) + 1;
    return this.prisma.question.create({
      data: {
        bankId,
        text: title ?? prompt,
        prompt,
        answerKey: answerKey ?? null,
        difficulty: 1,
        sort: nextSort,
        createdByAdminId: adminId ?? null,
      },
    });
  }

  async updateQuestion(
    id: string,
    prompt?: string,
    title?: string | null,
    answerKey?: string | null,
  ) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: { bank: true },
    });
    if (!question || question.bank.type !== 'WRITING')
      throw new Error('Invalid writing question');

    return this.prisma.question.update({
      where: { id },
      data: {
        ...(prompt !== undefined && { prompt }),
        ...(title !== undefined && title !== null && { text: title }),
        ...(answerKey !== undefined && answerKey !== null && {
          answerKey: answerKey,
        }),
      },
    });
  }

  async deleteQuestion(id: string) {
    const question = await this.prisma.question.findUnique({ where: { id }, include: { bank: true } });
    if (!question || question.bank.type !== 'WRITING') throw new Error('Invalid writing question');
    return this.prisma.question.delete({ where: { id } });
  }

  async getAllQuestions() {
    return this.prisma.question.findMany({
      where: { bank: { type: 'WRITING' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getQuestion(id: string) {
    const question = await this.prisma.question.findUnique({ where: { id }, include: { bank: true } });
    if (!question || question.bank.type !== 'WRITING') throw new Error('Invalid writing question');
    return question;
  }

  async submitTextAnswer(userId: number, questionId: string, studentAnswer: string) {
    const question = await this.prisma.question.findUnique({ where: { id: questionId }, include: { bank: true } });
    if (!question || question.bank.type !== 'WRITING') throw new Error(`Invalid writing question`);
    const attempt = await this.prisma.attempt.findFirst({
      where: { userId, bankId: question.bankId, status: 'IN_PROGRESS' },
    });
    if (!attempt) throw new Error('No active attempt for this bank');

    let attemptQuestion = await this.prisma.attemptQuestion.findUnique({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId } },
    });
    if (!attemptQuestion) {
      const order = await this.prisma.attemptQuestion.count({ where: { attemptId: attempt.id } }) + 1;
      attemptQuestion = await this.prisma.attemptQuestion.create({
        data: { attemptId: attempt.id, questionId, order },
      });
    }

    let attemptAnswer = await this.prisma.attemptAnswer.findUnique({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId } },
    });
    if (!attemptAnswer) {
      attemptAnswer = await this.prisma.attemptAnswer.create({
        data: { attemptId: attempt.id, questionId, studentTextAnswer: studentAnswer, selectedOptionId: null, isCorrect: null },
      });
    } else {
      await this.prisma.attemptAnswer.update({
        where: { id: attemptAnswer.id },
        data: { studentTextAnswer: studentAnswer },
      });
    }

    const checked = await this.prisma.aiCheckedAnswer.create({
      data: { attemptAnswerId: attemptAnswer.id, status: 'PENDING' },
    });

    this.enqueueAiCheck(checked.id);

    return { message: 'Cavab qəbul edildi, yoxlanılır...', attemptId: attempt.id, checkId: checked.id };
  }

  private async checkWithAi(aiCheckedAnswerId: string) {
    const checked = await this.prisma.aiCheckedAnswer.findUnique({
      where: { id: aiCheckedAnswerId },
      include: {
        attemptAnswer: {
          include: { question: true, attempt: { include: { user: true } } },
        },
      },
    });

    if (!checked || !checked.attemptAnswer) {
      try {
        await this.prisma.aiCheckedAnswer.update({
          where: { id: aiCheckedAnswerId },
          data: { status: 'FAILED' },
        });
      } catch { }
      this.logger.error(`Checked record or attemptAnswer not found for id=${aiCheckedAnswerId}`);
      return;
    }

    const attemptAnswer = checked.attemptAnswer;
    const question = attemptAnswer.question;
    const studentAnswer = attemptAnswer.studentTextAnswer || '';

    const questionText = (question.prompt && question.prompt.trim()) || (question.text || '').trim();
    if (!questionText) {
      await this.prisma.aiCheckedAnswer.update({
        where: { id: aiCheckedAnswerId },
        data: { status: 'FAILED' },
      });
      this.logger.error(`No prompt/text found for questionId=${attemptAnswer.questionId}`);
      return;
    }

    let prompt = `
Sən universitet səviyyəli təcrübəli müəllimsən.
Sual ilə tələbənin cavabını diqqətlə müqayisə et və rəsmi Azərbaycan dilində geniş və izahlı feedback yaz.

Tələblər:
1. Feedback qrammatik cəhətdən düzgün, tam cümlələrlə və rəsmi üslubda olmalıdır.
2. Feedbackdə mütləq aşağıdakılar yer alsın:
   - tələbənin güclü tərəfləri,
   - zəif tərəfləri,
   - konkret səhvlər,
   - bu səhvlərin səbəbləri,
   - bu səhvlərin necə düzəldilməli olduğu izah edilsin.
3. Sual ilə cavab arasındakı uyğunluğu əsaslandıraraq qiymətləndir.
4. Qiymətləndirmə 0–10 arası tam ədəd (integer) olmalıdır.
5. Feedback ətraflı və izahlı olsun (təxminən 200–400 söz).
6. Feedback sual və cavab hansı dildədirsə, o dildə olsun (AZ olduqda rəsmi Azərbaycan dili).
Ən əsası əgər sual və cavab Azərbaycan dilindədirsə, feedback üçün mətn yazdıqda mütləq həm leksik həm də qrammatik cəhətdən düzgün rəsmi Azərbaycan dilindən istifadə et və eyni zamanda digər dillərdə olduqda da həmin dildə də leksik və qrammatik cəhətdən düzgün yaz!!!
7. Yalnız JSON formatında cavab ver, əlavə mətn yazma.

Sual/Prompt: ${questionText}
`;

    if (question.answerKey) {
      prompt += `\nAnswer Key: ${question.answerKey}`;
    }

    prompt += `
Tələbənin cavabı: ${studentAnswer}

{
  "score": number,
  "feedback": string
}
`;

    const maxAttempts = 5;
    let attemptCount = 0;
    let finalJson: any = null;

    while (attemptCount < maxAttempts) {
      attemptCount++;
      this.logger.warn(`AI attempt ${attemptCount}/${maxAttempts} for checkedId=${aiCheckedAnswerId}`);

      try {
        const text = await this.runLlama(prompt);
        this.logger.warn('RAW AI RESPONSE:\n' + (text.length > 1000 ? text.slice(0, 1000) + '... (truncated)' : text));

        const json = this.extractJson(text);

        if (json && typeof json.score === 'number' && typeof json.feedback === 'string') {
          finalJson = json;
          break;
        }
      } catch (err) {
        this.logger.error('runLlama error', err as any);
      }

      prompt = `
Sən təcrübəli universitet müəllimisisən.
Sualı və tələbənin cavabını diqqətlə oxu və yalnız JSON formatında cavab ver. Heç bir əlavə mətn və izah yazma.

Tələblər:
1) Feedback rəsmi Azərbaycan dilində, qrammatik cəhətdən düzgün və tam cümlələrlə olmalıdır.
2) Üslub universitet səviyyəli, obyektiv və elmi olmalıdır.
3) Feedbackdə mütləq aşağıdakılar əhatə olunsun:
   - tələbənin güclü tərəfləri,
   - zəif tərəfləri,
   - konkret səhvləri,
   - bu səhvlərin səbəbləri,
   - bu səhvlərin necə düzəldilməli olduğu izah edilsin.
4) Sual ilə cavab arasındakı uyğunluğu əsaslandıraraq qiymətləndir.
5) Qiymətləndirmə 0–10 arası tam ədəd (integer) olmalıdır.
6) Feedback ətraflı və izahlı olsun (təxminən 200–400 söz).
Ən əsası əgər sual və cavab Azərbaycan dilindədirsə, feedback üçün mətn yazdıqda mütləq həm leksik həm də qrammatik cəhətdən düzgün rəsmi Azərbaycan dilindən istifadə et və eyni zamanda digər dillərdə olduqda da həmin dildə də leksik və qrammatik cəhətdən düzgün yaz!!!
7) Çıxış mütləq və yalnız bu JSON obyektindən ibarət olmalıdır:
{
  "score": number,
  "feedback": string
}
8) JSON-dan kənar heç bir simvol, mətn, izah və ya işarə yazma. Əgər düzgün nəticə mümkün deyilsə, yenə də etibarlı JSON qaytar (məsələn: score=0 və qısa feedback).

Sual/Prompt: ${questionText}
`;
      if (question.answerKey) {
        prompt += `\nAnswer Key: ${question.answerKey}`;
      }

      prompt += `
Tələbənin cavabı: ${studentAnswer}

Yalnız bu formatda cavab ver:
{
  "score": number,
  "feedback": string
}
`;

      await new Promise((r) => setTimeout(r, 400));
    }

    if (!finalJson) {
      await this.prisma.aiCheckedAnswer.update({
        where: { id: aiCheckedAnswerId },
        data: { status: 'FAILED' },
      });
      this.logger.error(`AI check failed for id=${aiCheckedAnswerId} after ${maxAttempts} attempts`);
      return;
    }

    const rawScore = Number(finalJson.score || 0);
    const score = Math.max(0, Math.min(10, Math.round(rawScore)));

    await this.prisma.aiCheckedAnswer.update({
      where: { id: aiCheckedAnswerId },
      data: {
        score,
        feedback: finalJson.feedback,
        status: 'DONE',
      },
    });

    await this.prisma.attemptAnswer.update({
      where: { id: attemptAnswer.id },
      data: {
        score,
        feedback: finalJson.feedback,
      },
    });

    const attempt = attemptAnswer.attempt;
    const attemptQuestions = await this.prisma.attemptQuestion.findMany({ where: { attemptId: attempt.id } });
    const attemptAnswers = await this.prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
    const allChecked = attemptAnswers.length === attemptQuestions.length && attemptAnswers.every(a => a.score != null);
    if (allChecked) {
      const totalScore = attemptAnswers.reduce((sum, a) => sum + (a.score || 0), 0);
      const maxTotal = attemptAnswers.length * 10;
      await this.prisma.attempt.update({
        where: { id: attempt.id },
        data: { status: 'FINISHED', finishedAt: new Date(), score: totalScore, total: maxTotal },
      });
    }

    this.logger.log(`AI DONE checkedId=${aiCheckedAnswerId} score=${score}`);
  }

  private extractJson(text: string): any | null {
    try {
      const first = text.indexOf('{');
      if (first === -1) return null;
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = first; i < text.length; i++) {
        const ch = text[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        if (ch === '}') {
          depth--;
          if (depth === 0) {
            const candidate = text.slice(first, i + 1);
            return JSON.parse(candidate);
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async getResultByCheckedId(id: string) {
    return this.prisma.aiCheckedAnswer.findUnique({
      where: { id },
      include: {
        attemptAnswer: {
          include: { question: true, attempt: { select: { id: true, user: { select: { id: true, email: true } } } } },
        },
      },
    });
  }

  async getResultByAttemptId(attemptId: string) {
    return this.prisma.aiCheckedAnswer.findMany({
      where: { attemptAnswer: { attemptId } },
      include: {
        attemptAnswer: {
          include: { question: true, attempt: { select: { id: true, user: { select: { id: true, email: true } } } } },
        },
      },
    });
  }

  async recheckAnswerByCheckedId(id: string) {
    await this.prisma.aiCheckedAnswer.update({
      where: { id },
      data: { status: 'PENDING' },
    });

    this.enqueueAiCheck(id);
    return { message: 'Recheck triggered', id };
  }
}
