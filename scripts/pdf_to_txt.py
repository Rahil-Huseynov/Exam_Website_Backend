import os
import pdfplumber
from datetime import datetime
import time
import argparse
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--input_file', required=True, help='Yalnız bu PDF fayl işlənəcək')
parser.add_argument('--output_dir', default='txt/pdf_txt')
parser.add_argument('--logs_dir', default='logs/convert_pdf_txt')
args = parser.parse_args()


def pdf_to_txt(input_file, output_dir, logs_dir):
    run_start = time.time()

    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(logs_dir, exist_ok=True)

    date_str = datetime.now().strftime("%d.%m.%Y")
    log_path = os.path.join(logs_dir, f"{date_str}.log")

    def log_line(s: str):
        print(s)
        with open(log_path, "a", encoding="utf-8") as log:
            log.write(s + "\n")

    if not os.path.exists(input_file):
        log_line(f"PDF tapılmadı ❌ -> {input_file}")
        return

    if not input_file.lower().endswith(".pdf"):
        log_line(f"PDF deyil ❌ -> {input_file}")
        return

    filename = os.path.basename(input_file)
    name, _ = os.path.splitext(filename)

    start_msg = f"=== RUN START {datetime.now().strftime('%d.%m.%Y %H:%M:%S')} | file={filename} ==="
    log_line(start_msg)

    file_start = time.time()
    text_output = []

    try:
        with pdfplumber.open(input_file) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_output.append(page_text)

        output_path = os.path.join(output_dir, f"{name}.txt")

        with open(output_path, "w", encoding="utf-8") as f:
            f.write("\n\n".join(text_output))

        dur = time.time() - file_start
        log_line(f"[{filename}] DONE ✅ -> {output_path} | pages={len(text_output)} | duration={dur:.2f}s")

    except Exception as e:
        dur = time.time() - file_start
        log_line(f"[{filename}] ERROR ❌ | duration={dur:.2f}s | {e}")

    total_dur = time.time() - run_start
    log_line(f"=== RUN END | total_duration={total_dur:.2f}s ===\n")


if __name__ == "__main__":
    pdf_to_txt(args.input_file, args.output_dir, args.logs_dir)
