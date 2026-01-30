# json_to_txt.py
import json
from pathlib import Path
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--in_dir', default='json_results')
parser.add_argument('--out_dir', default='txt/json_txt')
args = parser.parse_args()

def json_questions_to_txt(json_path: Path, txt_path: Path):
    txt_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except UnicodeDecodeError:
        data = json.loads(json_path.read_text(encoding="utf-8-sig"))

    items = data.get("items", [])
    if not isinstance(items, list):
        raise ValueError(f"{json_path.name}: 'items' list deyil.")

    lines = []

    for item in items:
        number = item.get("number", "")
        question = str(item.get("question", "")).strip()

        lines.append(f"{number}. {question}".strip())
        lines.append("")  

        options = item.get("options", [])
        if isinstance(options, list):
            for opt in options:
                key = opt.get("key", "")
                text = str(opt.get("text", "")).strip()
                lines.append(f"{key}) {text}".strip())

        lines.append("")
        lines.append("")

    txt_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main():
    in_dir = Path(args.in_dir)
    out_dir = Path(args.out_dir)

    out_dir.mkdir(parents=True, exist_ok=True)

    if not in_dir.exists():
        print(f"Qovluq tapılmadı: {in_dir}")
        return

    json_files = sorted(in_dir.glob("*.json"))

    if not json_files:
        print(f"{in_dir} içində heç bir .json tapılmadı.")
        return

    ok = 0
    fail = 0

    for jp in json_files:
        rel = jp.relative_to(in_dir)
        txt_name = rel.with_suffix(".txt").name  
        out_path = out_dir / txt_name

        try:
            json_questions_to_txt(jp, out_path)
            ok += 1
            print(f"OK: {jp} -> {out_path}")
        except Exception as e:
            fail += 1
            print(f"FAIL: {jp} -> {e}")

    print(f"\nHazır ✅  Uğurlu: {ok}  Xəta: {fail}")


if __name__ == "__main__":
    main()