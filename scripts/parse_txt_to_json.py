# parse_txt_to_json.py
import os
import re
import json
from datetime import datetime
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--input_dir', default='txt/pdf_txt')
parser.add_argument('--json_output_dir', default='json_results')
parser.add_argument('--issues_output_dir', default='json_results/json_issues')
parser.add_argument('--terminal_logs_dir', default='logs/convert_txt_json')
args = parser.parse_args()

QUESTION_RE = re.compile(r"^\s*(\d{1,3})\.\s*(.+?)\s*$")
OPTION_RE = re.compile(r"^\s*([A-Z])\)\s*(.*)\s*$")

def one_line_skipped_questions(json_text: str) -> str:
    pattern = r'("skipped_questions"\s*:\s*)\[\s*([\s\S]*?)\s*\]'
    def repl(m):
        prefix = m.group(1)
        inner = m.group(2)
        nums = [x.strip() for x in inner.split(",") if x.strip()]
        return prefix + "[" + ", ".join(nums) + "]"
    return re.sub(pattern, repl, json_text, count=1)

def parse_questions(text: str, context_file: str):
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")

    items = []
    issues = []

    current = None
    current_opt = None
    seen_numbers = set()
    question_order = []  

    def add_issue(kind, message, line_no=None, line=None, severity="warning", question_num=None):
        issues.append({
            "file": context_file,
            "question_num": question_num,
            "kind": kind,
            "message": message,
            "line_no": line_no,
            "line": line,
            "severity": severity,
            "skipped": False  
        })

    def flush_current():
        nonlocal current, current_opt
        if not current:
            return

        qn = current.get("number")
        current["options"] = [o for o in current["options"] if o.get("text", "").strip() != ""]

        pre_len = len(issues)

        if not current["question"].strip():
            add_issue("EMPTY_QUESTION", f"Sual mətni boşdur (#{qn}).", severity="error", question_num=qn)

        opt_count = len(current["options"])
        if opt_count == 0:
            add_issue("NO_OPTIONS", f"Sualda variant yoxdur (#{qn}).", severity="error", question_num=qn)

        keys = [o["key"] for o in current["options"] if "key" in o]
        if keys:
            expected = [chr(ord("A") + i) for i in range(len(keys))]
            if keys != expected:
                add_issue(
                    "OPTION_SEQUENCE",
                    f"Variant ardıcıllığı qəribədir: {keys} (gözlənən: {expected}) (#{qn}).",
                    severity="warning",
                    question_num=qn
                )

        local_issues = issues[pre_len:]
        has_any_problem = any(x.get("question_num") == qn for x in local_issues)  

        if not has_any_problem:
            items.append(current)

        current = None
        current_opt = None

    for idx, raw_ln in enumerate(lines, start=1):
        ln = raw_ln.rstrip()
        if not ln.strip():
            continue

        q = QUESTION_RE.match(ln)
        if q:
            flush_current()
            qnum = int(q.group(1))
            qtext = q.group(2).strip()

            question_order.append(qnum)

            if qnum in seen_numbers:
                add_issue(
                    "DUPLICATE_NUMBER",
                    f"Eyni sual nömrəsi təkrarlandı: {qnum}.",
                    idx, ln,
                    severity="warning",
                    question_num=qnum
                )
            seen_numbers.add(qnum)

            current = {"number": qnum, "question": qtext, "options": []}
            current_opt = None
            continue

        o = OPTION_RE.match(ln)
        if o:
            letter = o.group(1)
            otext = o.group(2).strip()

            if current is None:
                add_issue("OPTION_WITHOUT_QUESTION", "Sual başlamadan variant gəldi.", idx, ln, severity="error")
                continue

            qn = current.get("number")
            existing_keys = {x.get("key") for x in current["options"]}
            if letter in existing_keys:
                add_issue(
                    "DUPLICATE_OPTION_KEY",
                    f"Eyni variant açarı təkrarlandı: {letter}) (#{qn}).",
                    idx, ln,
                    severity="warning",
                    question_num=qn
                )

            opt_obj = {"key": letter, "text": otext}
            current["options"].append(opt_obj)
            current_opt = opt_obj
            continue

        if current is None:
            add_issue("TEXT_OUTSIDE_QUESTION", "Sual blokundan kənar mətn tapıldı.", idx, ln, severity="warning")
            continue

        qn = current.get("number")

        if len(current["options"]) == 0:
            current["question"] = (current["question"] + " " + ln.strip()).strip()
            continue

        if current_opt is not None:
            current_opt["text"] = (current_opt["text"] + " " + ln.strip()).strip()
            continue

        add_issue("UNCLASSIFIED_LINE", "Sətir təsnif edilə bilmədi.", idx, ln, severity="warning", question_num=qn)

    flush_current()
    return items, issues, question_order


def renumber_items_compact(items, start_num):
    new_num = start_num
    for it in items:
        it["original_number"] = it["number"]
        it["number"] = new_num
        new_num += 1
    return items


def convert_folder(
    input_dir=args.input_dir,
    json_output_dir=args.json_output_dir,
    issues_output_dir=args.issues_output_dir,
    terminal_logs_dir=args.terminal_logs_dir
):
    if not os.path.isdir(input_dir):
        print(f"Giriş qovluğu tapılmadı ❌ -> {input_dir}")
        return

    os.makedirs(json_output_dir, exist_ok=True)
    os.makedirs(issues_output_dir, exist_ok=True)
    os.makedirs(terminal_logs_dir, exist_ok=True)

    date_str = datetime.now().strftime("%d-%m-%Y")
    daily_log_path = os.path.join(terminal_logs_dir, f"{date_str}.log")

    txt_files = sorted([f for f in os.listdir(input_dir) if f.lower().endswith(".txt")])
    if not txt_files:
        print(f"{input_dir} içində .txt fayl yoxdur ❌")
        return

    header = f"=== RUN {datetime.now().strftime('%d-%m-%Y %H:%M:%S')} | input={input_dir} ==="
    print(header)
    with open(daily_log_path, "a", encoding="utf-8") as lf:
        lf.write(header + "\n")

    for filename in txt_files:
        in_path = os.path.join(input_dir, filename)

        try:
            with open(in_path, "r", encoding="utf-8") as f:
                raw = f.read()
        except Exception as e:
            summary = f"[{filename}] READ_ERROR ❌ | {e}"
            print(summary)
            with open(daily_log_path, "a", encoding="utf-8") as lf:
                lf.write(summary + "\n")
            continue

        items, issues, question_order = parse_questions(raw, context_file=filename)

        skipped_qnums = sorted({
            x.get("question_num")
            for x in issues
            if x.get("question_num") is not None
        })

        skipped_set = set(skipped_qnums)
        for iss in issues:
            qn = iss.get("question_num")
            iss["skipped"] = (qn in skipped_set) if (qn is not None) else False


        for iss in issues:
            qn = iss.get("question_num")
            iss["skipped"] = (qn in skipped_qnums) if (qn is not None) else False

        start_num = question_order[0] if question_order else 1
        items = renumber_items_compact(items, start_num=start_num)

        errors = sum(1 for x in issues if x.get("severity") == "error")
        warnings = sum(1 for x in issues if x.get("severity") == "warning")

        skipped_questions = len(skipped_qnums)

        name, _ = os.path.splitext(filename)

        out_json_path = os.path.join(json_output_dir, f"{name}.json")
        data = {
            "source_file": filename,
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "stats": {
                "saved_questions": len(items),
                "skipped_questions": skipped_questions,
                "issues": len(issues),
                "errors": errors,
                "warnings": warnings
            },
            "items": items,
            
        }
        with open(out_json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        issues_path = os.path.join(issues_output_dir, f"{name}_issues.json")
        issues_payload = {
            "source_file": filename,
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "skipped_questions": sorted([q for q in skipped_qnums if q is not None]),
            "stats": {
                "issues": len(issues),
                "errors": errors,
                "warnings": warnings,
                "skipped_questions": skipped_questions
            },
            "issues": issues,   
        }
        pretty = json.dumps(issues_payload, ensure_ascii=False, indent=2)
        pretty = one_line_skipped_questions(pretty)

        with open(issues_path, "w", encoding="utf-8") as f:
            f.write(pretty)

        summary = (
            f"[{filename}] DONE ✅ | saved_questions={len(items)} | skipped_questions={skipped_questions} | "
            f"errors={errors} | warnings={warnings} | json={out_json_path} | issues={issues_path}"
        )
        print(summary)
        with open(daily_log_path, "a", encoding="utf-8") as lf:
            lf.write(summary + "\n")

    footer = "=== END RUN ==="
    print(footer)
    with open(daily_log_path, "a", encoding="utf-8") as lf:
        lf.write(footer + "\n\n")

if __name__ == "__main__":
    convert_folder()