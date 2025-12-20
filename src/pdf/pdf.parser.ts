export type DraftOption = { tempOptionId: string; text: string };
export type DraftQuestion = { tempId: string; text: string; options: DraftOption[] };

function normalizeSpaces(s: string) {
  return s.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseQuestionsFromText(raw: string): DraftQuestion[] {
  const text = normalizeSpaces(raw);
  const qSplit = text.split(/\n(?=(?:Sual|Question)?\s*\d{1,3}\s*[.)-])/i);

  const drafts: DraftQuestion[] = [];
  let qIndex = 0;

  for (const block of qSplit) {
    const b = block.trim();
    if (!b) continue;

    const lines = b.split("\n").map((x) => x.trim()).filter(Boolean);
    const optionStartIdx = lines.findIndex((ln) => /^[A-Da-d][)\].-]\s+/.test(ln));
    if (optionStartIdx === -1) continue;

    const qText = lines
      .slice(0, optionStartIdx)
      .join(" ")
      .replace(/^(?:Sual|Question)?\s*\d{1,3}\s*[.)-]\s*/i, "")
      .trim();

    if (!qText) continue;

    const optionLines = lines.slice(optionStartIdx);
    const options: string[] = [];
    let current = "";

    for (const ln of optionLines) {
      const isNew = /^[A-Da-d][)\].-]\s+/.test(ln);
      if (isNew) {
        if (current) options.push(current.trim());
        current = ln.replace(/^[A-Da-d][)\].-]\s+/, "").trim();
      } else {
        current += " " + ln;
      }
    }
    if (current) options.push(current.trim());

    const cleaned = options.map((o) => o.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (cleaned.length < 2) continue;

    drafts.push({
      tempId: `q_${Date.now()}_${qIndex++}`,
      text: qText,
      options: cleaned.slice(0, 4).map((ot, i) => ({
        tempOptionId: `o_${Date.now()}_${qIndex}_${i}`,
        text: ot,
      })),
    });
  }

  return drafts;
}
