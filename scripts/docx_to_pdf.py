#!/usr/bin/env python3
import subprocess
import os
import shutil
import argparse
import sys
import time
import glob

parser = argparse.ArgumentParser()
parser.add_argument('--input_dir', required=True)
parser.add_argument('--output_dir', required=True)
parser.add_argument('--output_name', required=True)
args = parser.parse_args()


def find_office_cmd():
    for cmd in ("soffice", "libreoffice"):
        path = shutil.which(cmd)
        if path:
            return path
    return None


def docx_to_pdf_libreoffice(docx_path, out_dir_abs):
    """
    Convert single docx -> pdf using libreoffice (headless).
    out_dir_abs must be an absolute path.
    Returns the absolute path to the produced PDF.
    """
    office = find_office_cmd()
    if not office:
        raise FileNotFoundError("LibreOffice tapılmadı. 'soffice' və ya 'libreoffice' yoxdur.")

    docx_path = os.path.abspath(docx_path)
    out_dir_abs = os.path.abspath(out_dir_abs)
    os.makedirs(out_dir_abs, exist_ok=True)

    # run libreoffice and capture output for debugging
    cmd = [
        office,
        "--headless",
        "--nologo",
        "--nofirststartwizard",
        "--convert-to", "pdf:writer_pdf_Export",
        "--outdir", out_dir_abs,
        docx_path,
    ]

    try:
        proc = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except subprocess.CalledProcessError as e:
        # include stdout/stderr to help debugging
        raise RuntimeError(f"LibreOffice çevrilmə zamanı səhv: returncode={e.returncode}\nSTDOUT:\n{e.stdout}\nSTDERR:\n{e.stderr}")

    # give libreoffice a short moment to flush files
    time.sleep(0.8)

    # find pdfs in output dir
    pdf_files = glob.glob(os.path.join(out_dir_abs, "*.pdf"))
    if not pdf_files:
        # include proc outputs if available
        raise FileNotFoundError(f"PDF yaradılmadı: outdir={out_dir_abs}\nLibreOffice stdout:\n{proc.stdout}\nLibreOffice stderr:\n{proc.stderr}")

    # return the most recently created pdf file
    latest_pdf = max(pdf_files, key=os.path.getctime)
    return latest_pdf


def convert_one_file(input_dir, output_dir, output_name):
    # normalize to absolute paths
    input_dir_abs = os.path.abspath(input_dir)
    output_dir_abs = os.path.abspath(output_dir)

    if not os.path.isdir(input_dir_abs):
        print(f"Giriş qovluğu tapılmadı ❌ -> {input_dir_abs}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(output_dir_abs, exist_ok=True)

    # find .docx files (take the first one)
    files = [f for f in os.listdir(input_dir_abs) if f.lower().endswith(".docx")]
    if not files:
        print(f"{input_dir_abs} içində .docx fayl yoxdur ❌", file=sys.stderr)
        sys.exit(1)

    docx_file = files[0]
    docx_path = os.path.join(input_dir_abs, docx_file)

    print(f"Çevrilir ➜ {docx_path}", flush=True)

    try:
        pdf_path = docx_to_pdf_libreoffice(docx_path, output_dir_abs)
    except Exception as e:
        print(f"LibreOffice çevrilməsi uğursuz oldu: {e}", file=sys.stderr)
        sys.exit(2)

    final_path = os.path.join(output_dir_abs, output_name)

    # If produced PDF is already the same path as final_path, we're done.
    if os.path.abspath(pdf_path) == os.path.abspath(final_path):
        print("Hazırdır ✅ (birbaşa uyğun fayl) ->", final_path, flush=True)
        return

    # remove existing final file if exists
    if os.path.exists(final_path):
        try:
            os.remove(final_path)
        except Exception as e:
            print(f"Keçmiş çıxış faylını silərkən xəta: {e}", file=sys.stderr)

    # ensure source exists and is readable
    if not os.path.exists(pdf_path):
        print(f"Mənbə PDF tapılmadı: {pdf_path}", file=sys.stderr)
        sys.exit(3)

    try:
        # move the created pdf to final_path (this will copy between filesystems if needed)
        shutil.move(pdf_path, final_path)
    except Exception as e:
        print(f"Faylı köçürərkən xəta: {e}", file=sys.stderr)
        # try a fallback: copy+unlink
        try:
            shutil.copy2(pdf_path, final_path)
            os.remove(pdf_path)
        except Exception as e2:
            print(f"Fallback da uğursuz oldu: {e2}", file=sys.stderr)
            sys.exit(4)

    print("Hazırdır ✅ ->", final_path, flush=True)


if __name__ == "__main__":
    convert_one_file(args.input_dir, args.output_dir, args.output_name)
