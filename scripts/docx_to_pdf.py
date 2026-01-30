# docx_to_pdf.py
import subprocess
import os
import shutil
import argparse
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--input_dir', required=True)
parser.add_argument('--output_dir', required=True)
parser.add_argument('--output_name', required=True) 
args = parser.parse_args()


def find_office_cmd():
    for cmd in ("soffice", "libreoffice"):
        if shutil.which(cmd):
            return cmd
    return None


def docx_to_pdf_libreoffice(docx_path, out_dir):
    office = find_office_cmd()
    if not office:
        raise FileNotFoundError("LibreOffice tapılmadı. 'soffice' və ya 'libreoffice' yoxdur.")

    docx_path = os.path.abspath(docx_path)
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    result = subprocess.run(
        [
            office,
            "--headless",
            "--nologo",
            "--nofirststartwizard",
            "--convert-to", "pdf:writer_pdf_Export",
            "--outdir", out_dir,
            docx_path,
        ],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    # LibreOffice-in yaratdığı default PDF adı
    generated_pdf = os.path.join(
        out_dir,
        os.path.splitext(os.path.basename(docx_path))[0] + ".pdf"
    )

    return generated_pdf


def convert_one_file(input_dir, output_dir, output_name):
    if not os.path.isdir(input_dir):
        print(f"Giriş qovluğu tapılmadı ❌ -> {input_dir}")
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    files = [f for f in os.listdir(input_dir) if f.lower().endswith(".docx")]
    if not files:
        print(f"{input_dir} içində .docx fayl yoxdur ❌")
        sys.exit(1)

    # yalnız birinci docx götürürük
    docx_file = files[0]
    docx_path = os.path.join(input_dir, docx_file)

    print(f"Çevrilir ➜ {docx_path}")

    pdf_path = docx_to_pdf_libreoffice(docx_path, output_dir)

    final_path = os.path.join(output_dir, output_name)

    # əgər eyni adlı fayl varsa sil
    if os.path.exists(final_path):
        os.remove(final_path)

    os.rename(pdf_path, final_path)

    print("Hazırdır ✅ ->", final_path)


if __name__ == "__main__":
    convert_one_file(args.input_dir, args.output_dir, args.output_name)
