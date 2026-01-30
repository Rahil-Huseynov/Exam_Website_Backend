# docx_to_pdf.py
import subprocess
import os
import shutil
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--input_dir', default='word')
parser.add_argument('--output_dir', default='pdf_results')
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

    pdf_path = os.path.join(
        out_dir,
        os.path.splitext(os.path.basename(docx_path))[0] + ".pdf"
    )

    return pdf_path


def convert_folder(input_dir=args.input_dir, output_dir=args.output_dir):
    if not os.path.isdir(input_dir):
        print(f"Giriş qovluğu tapılmadı ❌ -> {input_dir}")
        return

    os.makedirs(output_dir, exist_ok=True)

    files = [f for f in os.listdir(input_dir) if f.lower().endswith(".docx")]
    if not files:
        print(f"{input_dir} içində .docx fayl yoxdur ❌")
        return

    print(f"Başladı ✅ | {len(files)} fayl tapıldı")

    for filename in sorted(files):
        docx_path = os.path.join(input_dir, filename)
        try:
            pdf_path = docx_to_pdf_libreoffice(docx_path, output_dir)
            print(f"Hazırdır ✅ -> {pdf_path}")
        except subprocess.CalledProcessError as e:
            print(f"Xəta ❌ ({filename})")
            if e.stderr:
                print("stderr:", e.stderr.strip())
            else:
                print("error:", e)
        except FileNotFoundError as e:
            print(f"Xəta ❌: {e}")
            print("Quraşdırma (Ubuntu/Debian): sudo apt update && sudo apt install -y libreoffice")
            return

    print("Bitdi ✅")


if __name__ == "__main__":
    convert_folder()