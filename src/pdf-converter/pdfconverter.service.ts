import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { unlink, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { Cron } from '@nestjs/schedule';

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

  /**
   * inputFile - tam yol (məs: uploads/pdf/<rand>/my.pdf)
   * originalFilename - faylın orijinal adı (məs: my.pdf) - yalnız log/çıxış üçün
   * onProgress - callback(percent)
   */
  async processPdfWithProgress(
    inputFile: string,
    originalFilename: string,
    onProgress: (percent: number) => void,
  ): Promise<{ success: boolean; outputFilename?: string; error?: string }> {
    try {
      await this.cleanTempFiles();

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
            output_dir: 'uploads/pdf-read',
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

      const outputDir = './uploads/pdf-read';
      const files = await readdir(outputDir);
      const outputFile = files.find((f) => f.endsWith('.pdf'));

      if (!outputFile) {
        throw new Error('Son PDF yaradılmadı!');
      }

      return { success: true, outputFilename: outputFile };
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
      // '/mnt/Disk_1TB/Exam_Website/Exam_Website_Backend/venv/bin/python';
      '/home/user/Desktop/Exam/EXAM_Backend/venv/bin/python';
    let command = `${pythonPath} scripts/${scriptName}`;
    for (const [key, value] of Object.entries(args)) {
      const safe = (value ?? '').replace(/"/g, '\\"');
      command += ` --${key}="${safe}"`;
    }

    this.logger.log(`Çalışdır: ${command}`);
    const { stdout, stderr } = await execAsync(command);

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
          await unlink(join(fullPath, file));
        }
      } catch (e) {
      }
    }
  }

  @Cron('0 0 * * * *')
  async cleanOldPdfs(): Promise<void> {
    const outputDir = './uploads/pdf-read';
    try {
      const files = await readdir(outputDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = join(outputDir, file);
        const stats = await stat(filePath);
        const age = now - stats.birthtimeMs;

        if (age > 86400000) {
          await unlink(filePath);
          this.logger.log(`Silindi: ${file}`);
        }
      }
    } catch (e) {
    }
  }
}