import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { unlink, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'crypto';
import * as path from 'path';

const execAsync = promisify(exec);

@Injectable()
export class PdfConverterService {
  private readonly logger = new Logger(PdfConverterService.name);

  private readonly tempDirs = [
    'txt/pdf_txt',
    'json_results',
    'json_results/json_issues',
    'logs/convert_pdf_txt',
    'logs/convert_txt_json',
    'txt/json_txt',
    'word',
    'answers/deleted',
    'answers/original',
    'answers/shifted',
  ];

  async processPdfWithProgress(
    inputFile: string,
    baseName: string,
    onProgress: (percent: number) => void,
  ): Promise<{ success: boolean; outputFilename?: string; error?: string }> {
    try {
      await this.cleanTempFiles();

      const safeBase = (baseName || crypto.randomBytes(6).toString('hex')).replace(/[^a-zA-Z0-9_-]/g, '');
      const outputPdfName = `${safeBase}.pdf`;

      const steps = [
        () =>
          this.runPythonScript('pdf_to_txt.py', {
            input_file: inputFile,
            output_dir: 'txt/pdf_txt',
            logs_dir: 'logs/convert_pdf_txt',
          }),

        () =>
          this.runPythonScript('parse_txt_to_json.py', {
            input_dir: 'txt/pdf_txt',
            json_output_dir: 'json_results',
            issues_output_dir: 'json_results/json_issues',
          }),

        () =>
          this.runPythonScript('json_to_txt.py', {
            in_dir: 'json_results',
            out_dir: 'txt/json_txt',
          }),

        () =>
          this.runPythonScript('txt_to_docx.py', {
            input_dir: 'txt/pdf_txt',
            output_dir: 'word',
          }),

        () =>
          this.runPythonScript('docx_to_pdf.py', {
            input_dir: 'word',
            output_dir: join('uploads', 'pdf-read'),
            output_name: outputPdfName,
          }),

        () =>
          this.runPythonScript('shift_answers.py', {
            issues_dir: 'json_results/json_issues',
          }),
      ];

      for (let i = 0; i < steps.length; i++) {
        await steps[i]();
        const percent = Math.round(((i + 1) / steps.length) * 100);
        onProgress(percent);
      }

      return { success: true, outputFilename: outputPdfName };
    } catch (error: any) {
      this.logger.error(error.message || error);
      return { success: false, error: error.message || String(error) };
    }
  }

  private async runPythonScript(
    scriptName: string,
    args: Record<string, string> = {},
  ): Promise<void> {
    const pythonPath =
      '/home/user/Desktop/Exam/EXAM_Backend/venv/bin/python';

    let command = `${pythonPath} scripts/${scriptName}`;
    for (const [key, value] of Object.entries(args)) {
      const safe = (value ?? '').replace(/"/g, '\\"');
      command += ` --${key}="${safe}"`;
    }

    this.logger.log(`Çalışdır: ${command}`);
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 20 * 1024 * 1024 });

    if (stderr && stderr.includes('Traceback')) {
      throw new Error(stderr);
    }

    if (stdout) {
      this.logger.log(stdout);
    }
  }

  private async cleanTempFiles(): Promise<void> {
    for (const dir of this.tempDirs) {
      const fullPath = join(process.cwd(), dir);
      try {
        const files = await readdir(fullPath);
        for (const file of files) {
          try {
            await unlink(join(fullPath, file));
          } catch (e) {
          }
        }
      } catch (e) {
      }
    }
  }

  @Cron('0 0 * * * *')
  async cleanOldPdfs(): Promise<void> {
    const outputDir = join(process.cwd(), 'uploads', 'pdf-read');
    try {
      const files = await readdir(outputDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = join(outputDir, file);
        const stats = await stat(filePath);
        const age = now - stats.birthtimeMs;

        if (age > 86400000) {
          try {
            await unlink(filePath);
            this.logger.log(`Silindi: ${file}`);
          } catch (e) {
          }
        }
      }
    } catch (e) {
    }
  }
}
