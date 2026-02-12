import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { spawn, spawnSync, ChildProcess } from 'child_process';
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

  private childProcesses: Map<number, ChildProcess> = new Map();

  private ollamaServeChild: ChildProcess | null = null;

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

  /**
   * Shutdown worker: qəti kill/ pkill istifadə etmirik.
   * Əgər KILL_OLLAMA_ON_IDLE=1 isə yalnız xidmətin yaratdığı child proseslərinə SIGTERM göndəririk.
   */
  private shutdownWorker() {
    this.paused = true;

    if (this.lastPausedState !== this.paused) {
      this.logger.warn(`🟡 AI worker PAUSED (idle for ${this.idleTimeoutMs} ms)`);
      this.lastPausedState = this.paused;
    }

    if (this.killOllamaOnIdle) {
      try {
        if (this.childProcesses.size === 0 && !this.ollamaServeChild) {
          this.logger.log('No tracked ollama child processes to gracefully terminate (KILL_OLLAMA_ON_IDLE=1).');
          return;
        }

        this.logger.log('Gracefully terminating tracked ollama child processes (no forced kill).');

        for (const [pid, cp] of this.childProcesses.entries()) {
          try {
            if (!cp.killed) {
              const ok = cp.kill('SIGTERM'); 
              this.logger.log(`Sent SIGTERM to pid=${pid} (kill returned ${ok})`);
            } else {
              this.logger.log(`Process pid=${pid} already marked killed`);
            }
          } catch (err) {
            this.logger.error(`Failed to send SIGTERM to pid=${pid}: ${(err as any)?.message}`);
          }
        }

        if (this.ollamaServeChild && !this.ollamaServeChild.killed) {
          try {
            const ok = this.ollamaServeChild.kill('SIGTERM');
            this.logger.log(`Sent SIGTERM to ollama serve pid=${this.ollamaServeChild.pid} (kill returned ${ok})`);
          } catch (err) {
            this.logger.error('Failed to SIGTERM ollama serve child: ' + (err as any)?.message);
          }
        }

        this.logger.log('Graceful termination requested; not forcing SIGKILL. If processes were started outside this service they will remain intact.');
      } catch (err) {
        this.logger.error('Error while attempting graceful termination of ollama children: ' + (err as any)?.message);
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

  /**
   * Yardımcı: yaradılan child prosesini izləmək.
   */
  private trackChild(child: ChildProcess | null) {
    if (!child) return;
    const pid = child.pid;
    if (typeof pid === 'number') {
      try {
        this.childProcesses.set(pid, child);
        this.logger.log(`Tracking ollama child pid=${pid}`);
      } catch { /* ignore */ }
    }

    const remove = () => {
      try {
        if (typeof pid === 'number') this.childProcesses.delete(pid);
      } catch {}
    };

    child.on('exit', (code, sig) => {
      remove();
      this.logger.log(`ollama child pid=${pid} exited code=${code} sig=${sig}`);
    });

    child.on('close', (code, sig) => {
      remove();
      this.logger.log(`ollama child pid=${pid} closed code=${code} sig=${sig}`);
    });

    child.on('error', (err) => {
      remove();
      this.logger.error(`ollama child pid=${pid} error: ${(err as any)?.message}`);
    });
  }


  private async ensureOllamaServerRunning(timeoutMs = 15000, intervalMs = 500): Promise<void> {
    if (this.ollamaServeChild && !this.ollamaServeChild.killed) {
      this.logger.log(`ollama serve child already spawned pid=${this.ollamaServeChild.pid}`);
    }

    const responsive = () => {
      try {
        const res = spawnSync('ollama', ['list'], { timeout: 3000 });
        return res.status === 0;
      } catch {
        return false;
      }
    };

    if (responsive()) {
      return;
    }

    if (!this.ollamaServeChild || this.ollamaServeChild.killed) {
      try {
        this.logger.log('Starting ollama serve as background child (will wait until responsive)...');
        const serve = spawn('ollama', ['serve'], {
          env: { ...process.env },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        this.ollamaServeChild = serve;
        this.trackChild(serve);

        serve.stdout?.on('data', (d) => {
          try {
            const s = d.toString();
            const sample = s.length > 300 ? s.slice(0, 300) + '...' : s;
            this.logger.log(`[ollama serve stdout] ${sample}`);
          } catch {}
        });
        serve.stderr?.on('data', (d) => {
          try {
            const s = d.toString();
            const sample = s.length > 300 ? s.slice(0, 300) + '...' : s;
            this.logger.error(`[ollama serve stderr] ${sample}`);
          } catch {}
        });
      } catch (err) {
        this.logger.error('Failed to spawn ollama serve: ' + (err as any)?.message);
      }
    } else {
      this.logger.log('ollama serve already spawned, waiting for responsiveness...');
    }

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (responsive()) {
        this.logger.log('ollama CLI responsive — server ready');
        return;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error('Timed out waiting for ollama serve to become responsive');
  }

  private async runLlama(prompt: string): Promise<string> {
    try {
      await this.ensureOllamaServerRunning();
    } catch (err) {
      this.logger.error('ensureOllamaServerRunning failed: ' + (err as any)?.message);
    }

    return new Promise((resolve, reject) => {
      try {
        const safeForLog = prompt.replace(/\r/g, '').replace(/\n+/g, ' ').trim().slice(0, 20000);
        this.logger.warn(
          `Running ollama with prompt (truncated for log): ${safeForLog.length > 400 ? safeForLog.slice(0, 400) + '... (truncated)' : safeForLog}`
        );

        let child: ChildProcess | null = null;
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
          this.trackChild(child);
        } else {
          child = spawn('ollama', ollamaArgs, {
            env: {
              ...process.env,
              OLLAMA_NUM_THREADS: '4',
              OLLAMA_KEEP_ALIVE: '0',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          this.trackChild(child);
        }

        let stdout = '';
        let stderr = '';

        if (!child || !child.stdout || !child.stderr || !child.stdin) {
          reject(new Error('Failed to spawn ollama child process with proper stdio'));
          return;
        }

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
              this.trackChild(fallback);

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

              if (fallback.stdin) {
                fallback.stdin.write(prompt);
                fallback.stdin.end();
              } else {
                reject(new Error('Fallback spawn has no stdin'));
              }
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

        child.on('close', async (code) => {
          try {
            fs.writeFileSync('/tmp/ollama-stderr.log', stderr, { encoding: 'binary' });
            fs.writeFileSync('/tmp/ollama-stdout.log', stdout, { encoding: 'utf8' });
          } catch { }

          if (code === 0) {
            resolve(stdout);
            return;
          } else {
            const e: any = new Error(`Llama exited with code ${code}. See /tmp/ollama-stderr.log`);
            e.stderr = stderr;

            if (typeof stderr === 'string' && stderr.includes('ollama server not responding')) {
              this.logger.warn('Detected "ollama server not responding" — attempting to spawn serve and retry once');
              try {
                await this.ensureOllamaServerRunning(20000, 500);
                try {
                  const retryOut = await this.runLlama(prompt);
                  resolve(retryOut);
                  return;
                } catch (retryErr) {
                  this.logger.error('Retry after starting ollama serve failed: ' + (retryErr as any)?.message);
                  reject(retryErr);
                  return;
                }
              } catch (ensureErr) {
                this.logger.error('Failed to start/wait for ollama serve: ' + (ensureErr as any)?.message);
                reject(e);
                return;
              }
            }

            reject(e);
            return;
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

    const MAIN_PROMPT = `
Siz universitet səviyyəli təcrübəli müəllimsiniz. Aşağıdakılara ciddi əməl edərək yalnız JSON obyektində cavab verin.

Girişlər:
- Sual/Prompt: >>>${questionText}<<<
${question.answerKey ? `- Answer Key: >>>${question.answerKey}<<<\n` : ''}
- Tələbənin cavabı: >>>${studentAnswer}<<<

Tələblər (qısa və dəqiq):
1) Çıxış yalnız və məcburi JSON formatında olmalıdır:
{
  "score": number,
  "feedback": string
}
2) \`score\` 0–10 aralığında tam ədəd olmalıdır. Uyğunluq əsaslı qiymətləndirin.
3) \`feedback\` rəsmi, qrammatik cəhətdən düzgün olmalı, tam cümlələrdən ibarət olmalıdır.
4) \`feedback\` içində mütləq bu başlıqlar əhatə olunmalıdır (nümunə kimi cümlələrə daxil edin):
   - Güclü tərəflər
   - Zəif tərəflər
   - Konkret səhvlər və onların səbəbləri
   - Bu səhvlərin necə düzəldilməsi (konkret addımlar)
   - Əgər riyazi hesablamalar varsa, hesablamaların düzgünlüyü yoxlanılsın və lazım gələrsə nümunə düzəliş verilsin
5) Sual və cavabın dili ilə eyni dildə yazın. (AZ → rəsmi Azərbaycan dili; EN → formal English; RU → официальный русский.)
6) Heç bir əlavə mətn, başlıq, şərh və ya JSON-dan kənar simvol yazmayın. Əgər tam tələblərə cavab mümkün deyilsə, yenə də etibarlı JSON verin (məsələn: \`"score": 0\` və qısa \`feedback\`).
7) \`feedback\` mümkün qədər konkret və praktik olsun — tələbəyə nəyi necə düzəltməli olduğunu dəqiq göstərsin.
Verdiyin feedback-i özün nəzərdən keçir dəfələrlə sual və cavab hansı dildədirsə, feedback həmin dildə olmalıdır!!!! 
Verdiyin feedback həqiqətəndə tələbəyə köməklik görsətməlidir!!! 
Verdiyin feedback-i tələbə həqiqətəndə başa düşməlidir!!!

Nümunə düzgün çıxış:
{
  "score": 7,
  "feedback": "Tələbənin cavabında ... (200–400 söz)."
}
`;

    const RETRY_PROMPT = `
Təcrübəli universitet müəllimisiniz. ƏVVƏLÖN və DƏQİQ TƏLƏBLƏR:
- Çıxış MÜTLƏQ və YALNIZ JSON obyektindən ibarət olmalıdır:
{
  "score": number,
  "feedback": string
}

Giriş:
Sual/Prompt: >>>${questionText}<<<
${question.answerKey ? `Answer Key: >>>${question.answerKey}<<<\n` : ''}
Tələbənin cavabı: >>>${studentAnswer}<<<

Qaydalar (qısa):
1) Score: integer 0–10.
2) Feedback: rəsmi, qrammatik cəhətdən düzgün, sualın dilində yazılmış 200–400 söz; əgər vaxt/yer məhdudiyyətinə görə mümkün deyilsə, ən az 40 söz.
3) Feedback daxilində aydın şəkildə:
   - güclü tərəflər,
   - zəif tərəflər,
   - konkret səhvlər və onların səbəbləri,
   - düzəliş üzrə konkret məsləhətlər (addım-addım),
   - riyazi səhv olduqda hesablamanı yoxlayın və düz formada göstərərək izah edin.
4) JSON-dan kənar heç nə yazmayın. Əgər tam məlumat vermək mümkün deyilsə, qısa və etibarlı JSON qaytarın (məsələn score=0 ilə).
Verdiyin feedback-i özün nəzərdən keçir dəfələrlə sual və cavab hansı dildədirsə, feedback həmin dildə olmalıdır!!!! 
Verdiyin feedback həqiqətəndə tələbəyə köməklik görsətməlidir!!! 
Verdiyin feedback-i tələbə həqiqətəndə başa düşməlidir!!!

Çıxış nümunəsi:
{
  "score": 5,
  "feedback": "..."
}
`;

    const maxAttempts = 5;
    let attemptCount = 0;
    let finalJson: any = null;
    let prompt = MAIN_PROMPT;

    while (attemptCount < maxAttempts) {
      attemptCount++;
      this.logger.warn(`AI attempt ${attemptCount}/${maxAttempts} for checkedId=${aiCheckedAnswerId}`);

      try {
        let text = await this.runLlama(prompt);

        if (typeof text === 'string') {
          text = text.replace(/^[\u0000-\u001F]+/, '');
        }

        this.logger.warn('RAW AI RESPONSE:\n' + (text.length > 1000 ? text.slice(0, 1000) + '... (truncated)' : text));

        const json = this.extractJson(text);

        if (json && typeof json.score === 'number' && typeof json.feedback === 'string') {
          finalJson = json;
          break;
        }
      } catch (err) {
        this.logger.error('runLlama error', err as any);
      }

      prompt = RETRY_PROMPT;
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
