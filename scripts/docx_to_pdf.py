#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Robust docx -> pdf converter using LibreOffice (headless).
Tries plain `soffice`/`libreoffice` first; on X11 DISPLAY errors will retry using `xvfb-run` if available.
Converts the first .docx found in input_dir, places result into output_dir and renames it to output_name.
Outputs helpful STDOUT/STDERR messages for debugging.
"""

import subprocess
import os
import shutil
import argparse
import sys
import time
import glob

parser = argparse.ArgumentParser()
parser.add_argument("--input_dir", required=True)
parser.add_argument("--output_dir", required=True)
parser.add_argument("--output_name", required=True)
args = parser.parse_args()

INPUT_DIR = os.path.abspath(args.input_dir)
OUTPUT_DIR = os.path.abspath(args.output_dir)
OUTPUT_NAME = args.output_name


def find_office_cmd():
    """Return path to soffice/libreoffice or None."""
    for cmd in ("soffice", "libreoffice"):
        p = shutil.which(cmd)
        if p:
            return p
    return None


def run_cmd(cmd_list, env=None, timeout=120):
    """Run command and return CompletedProcess. Raise RuntimeError on timeout."""
    try:
        proc = subprocess.run(
            cmd_list,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            text=True,
            timeout=timeout,
        )
        return proc
    except subprocess.TimeoutExpired as te:
        raise RuntimeError(f"Komanda vaxtından artıq dayandı (timeout={timeout}s): {te}")


def convert_with_libreoffice(docx_path, out_dir_abs):
    """Try converting using libreoffice. Returns path to generated PDF on success."""
    office = find_office_cmd()
    if not office:
        raise FileNotFoundError("LibreOffice tapılmadı (soffice/libreoffice yoxdur).")

    docx_path = os.path.abspath(docx_path)
    out_dir_abs = os.path.abspath(out_dir_abs)
    os.makedirs(out_dir_abs, exist_ok=True)

    # Prepare environment: sandbox HOME and unset DISPLAY for first attempt
    env = os.environ.copy()
    env["HOME"] = "/tmp"
    env["DISPLAY"] = ""

    base_cmd = [
        office,
        "--headless",
        "--invisible",
        "--nologo",
        "--nofirststartwizard",
        "--nodefault",
        "--nolockcheck",
        "--norestore",
        "--convert-to",
        "pdf:writer_pdf_Export",
        "--outdir",
        out_dir_abs,
        docx_path,
    ]

    # 1) First attempt: direct libreoffice
    proc = run_cmd(base_cmd, env=env)

    stdout = proc.stdout or ""
    stderr = proc.stderr or ""
    rc = proc.returncode

    # Detect X11/display related messages (case-insensitive)
    err_lower = stderr.lower() + stdout.lower()
    needs_xvfb = False
    if rc != 0 and ("can't open display" in err_lower or "x11 error" in err_lower or "cannot open display" in err_lower):
        needs_xvfb = True

    # 2) If X11 problem and xvfb-run exists -> retry with xvfb-run
    if needs_xvfb:
        xvfb = shutil.which("xvfb-run")
        if xvfb:
            xvfb_cmd = [xvfb, "-a", "--server-args=-screen 0 1280x720x24"] + base_cmd
            proc2 = run_cmd(xvfb_cmd, env=env)
            stdout = proc2.stdout or ""
            stderr = proc2.stderr or ""
            rc = proc2.returncode
        else:
            # xvfb-run not available -> raise with captured output
            raise RuntimeError(
                "X11 (DISPLAY) xətası və `xvfb-run` sistemi üzərində mövcud deyil.\n"
                f"LibreOffice STDOUT:\n{stdout}\n\nSTDERR:\n{stderr}"
            )

    # Final check
    if rc != 0:
        raise RuntimeError(f"LibreOffice çevrilməsi uğursuz oldu (returncode={rc}).\nSTDOUT:\n{stdout}\n\nSTDERR:\n{stderr}")

    # wait a moment for filesystem to flush
    time.sleep(0.8)

    # find produced PDF(s) in out_dir_abs
    pdf_files = glob.glob(os.path.join(out_dir_abs, "*.pdf"))
    if not pdf_files:
        raise FileNotFoundError(
            f"PDF yaradılmadı: outdir={out_dir_abs}\nSTDOUT:\n{stdout}\n\nSTDERR:\n{stderr}"
        )

    latest_pdf = max(pdf_files, key=os.path.getctime)
    return latest_pdf


def main():
    # Validate input directory
    if not os.path.isdir(INPUT_DIR):
        print(f"Giriş qovluğu tapılmadı: {INPUT_DIR}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # pick the first docx file (same behavior as previous scripts)
    docx_files = [f for f in os.listdir(INPUT_DIR) if f.lower().endswith(".docx")]
    if not docx_files:
        print(f"{INPUT_DIR} içində .docx fayl tapılmadı.", file=sys.stderr)
        sys.exit(1)

    docx_file = docx_files[0]
    docx_path = os.path.join(INPUT_DIR, docx_file)

    print(f"Çevrilir ➜ {docx_path}", flush=True)

    try:
        produced_pdf = convert_with_libreoffice(docx_path, OUTPUT_DIR)
    except Exception as e:
        print(f"LibreOffice çevrilməsi uğursuz oldu: {e}", file=sys.stderr)
        sys.exit(2)

    final_path = os.path.join(OUTPUT_DIR, OUTPUT_NAME)

    # If produced file already has the final name, done
    try:
        if os.path.abspath(produced_pdf) == os.path.abspath(final_path):
            print(f"Hazırdır ✅ -> {final_path}", flush=True)
            sys.exit(0)
    except Exception:
        pass

    # Remove existing final file if present
    if os.path.exists(final_path):
        try:
            os.remove(final_path)
        except Exception as e:
            print(f"Keçmiş çıxış faylını silərkən xəta: {e}", file=sys.stderr)

    # Ensure source exists
    if not os.path.exists(produced_pdf):
        print(f"Mənbə PDF tapılmadı: {produced_pdf}", file=sys.stderr)
        sys.exit(3)

    # Try moving; if cross-filesystem problems occur, fallback to copy
    try:
        shutil.move(produced_pdf, final_path)
    except Exception as e:
        print(f"shutil.move xətası: {e} — fallback olaraq copy2 istifadə edilir", file=sys.stderr)
        try:
            shutil.copy2(produced_pdf, final_path)
            try:
                os.remove(produced_pdf)
            except Exception:
                # ignore
                pass
        except Exception as e2:
            print(f"Fallback da uğursuz oldu: {e2}", file=sys.stderr)
            sys.exit(4)

    print(f"Hazırdır ✅ -> {final_path}", flush=True)
    sys.exit(0)


if __name__ == "__main__":
    main()

