# shift_answers.py
import json
import re
from pathlib import Path
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--issues_dir', default='json_results/json_issues')
parser.add_argument('--deleted_dir', default='answers/deleted')
parser.add_argument('--original_dir', default='answers/original')
parser.add_argument('--shifted_dir', default='answers/shifted')
args = parser.parse_args()

# ---------- Helpers ----------
def safe_filename(name: str) -> str:
    name = name.strip()
    name = re.sub(r'[\\/:*?"<>|]+', "_", name)  
    name = re.sub(r"\s+", " ", name)           
    return name

def parse_answers(text: str) -> list[str]:
    pairs = re.findall(r"(\d+)\s*-\s*([A-E])", text.upper())
    if not pairs:
        raise ValueError("Heç bir 'nömrə-hərf' (məs: 12-A) tapılmadı.")

    pairs = sorted(((int(n), a) for n, a in pairs), key=lambda x: x[0])
    max_q = pairs[-1][0]

    arr = [None] * (max_q + 1)  
    for q, a in pairs:
        arr[q] = a

    return arr[1:]  

def shift_answers(original_answers: list[str], deleted_questions: list[int]) -> list[str]:
    deleted_set = set(deleted_questions)
    new_answers = []
    for q_num, ans in enumerate(original_answers, start=1):
        if q_num in deleted_set:
            continue
        if ans is None:
            raise ValueError(f"{q_num}-ci sualın cavabı tapılmadı (None).")
        new_answers.append(ans)
    return new_answers

def format_answers(answers: list[str]) -> str:
    return ", ".join(f"{i}-{a}" for i, a in enumerate(answers, start=1))

def read_text_any_encoding(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8-sig")

# ---------- Main pipeline ----------
def write_deleted_and_shift_if_original_exists(
    issues_dir: Path = Path(args.issues_dir),
    deleted_dir: Path = Path(args.deleted_dir),
    original_dir: Path = Path(args.original_dir),
    shifted_dir: Path = Path(args.shifted_dir),
) -> None:
    deleted_dir.mkdir(parents=True, exist_ok=True)
    original_dir.mkdir(parents=True, exist_ok=True)
    shifted_dir.mkdir(parents=True, exist_ok=True)

    if not issues_dir.exists():
        raise FileNotFoundError(f"Qovluq tapılmadı: {issues_dir}")

    json_files = sorted(issues_dir.glob("*.json"))
    if not json_files:
        print(f"Bu qovluqda .json yoxdur: {issues_dir}")
        return

    written_deleted = 0
    created_original_templates = 0
    shifted_done = 0
    shifted_skipped_empty = 0
    failed = 0

    for jp in json_files:
        try:
            data = json.loads(read_text_any_encoding(jp))
        except json.JSONDecodeError as e:
            print(f"JSON oxunmadı (format səhv): {jp.name} -> {e}")
            failed += 1
            continue

        skipped = data.get("skipped_questions", [])
        if not isinstance(skipped, list):
            print(f"skipped_questions list deyil: {jp.name}")
            failed += 1
            continue

        cleaned = []
        for x in skipped:
            try:
                cleaned.append(int(x))
            except (TypeError, ValueError):
                pass
        cleaned = sorted(set(cleaned))

        source_file = data.get("source_file")
        if isinstance(source_file, str) and source_file.strip():
            base = Path(source_file).stem
        else:
            base = jp.stem

        base = safe_filename(base)


        deleted_path = deleted_dir / f"{base}_deleted.txt"
        deleted_text = ", ".join(map(str, cleaned))
        deleted_path.write_text(deleted_text, encoding="utf-8")
        written_deleted += 1

        original_path = original_dir / f"{base}_original.txt"
        if not original_path.exists():

            original_path.write_text(
                "BURAYA cavabları yapışdırın (məs: 1-A, 2-C, 3-D ...)\n",
                encoding="utf-8"
            )
            created_original_templates += 1

        raw_original = original_path.read_text(encoding="utf-8").strip()

        if not re.search(r"\d+\s*-\s*[A-E]", raw_original.upper()):
            shifted_skipped_empty += 1
            print(f"SHIFT YOX: original boşdur -> {original_path.name}")
            continue

        try:
            original_answers = parse_answers(raw_original)
            shifted_answers = shift_answers(original_answers, cleaned)
            shifted_text = format_answers(shifted_answers)

            shifted_path = shifted_dir / f"{base}_shifted.txt"
            shifted_path.write_text(shifted_text, encoding="utf-8")
            shifted_done += 1
            print(f"SHIFT OK: {base} -> {shifted_path}")
        except Exception as e:
            failed += 1
            print(f"SHIFT FAIL: {base} -> {e}")

    print("\n--- YEKUN ---")
    print("Deleted yazıldı:", written_deleted)
    print("Original template yaradıldı:", created_original_templates)
    print("Shift olundu:", shifted_done)
    print("Shift olunmadı (original boş):", shifted_skipped_empty)
    print("Xəta:", failed)

if __name__ == "__main__":
    write_deleted_and_shift_if_original_exists()