import fs from "node:fs";
import { coursePrompts } from "../src/prompts/math.js";
import { OUTLINE_RULE } from "../src/prompts/outline.js";
import { SCRIPT_MAX_TOKENS } from "../src/scriptBudget.js";
const dump = [
  // TOPIC_RULE は mathPrompt() に取り込まれたので、下の mathPrompt 節に含まれる。
  "### mathPrompt", coursePrompts.math.buildSystemPrompt(),
  "### OUTLINE_RULE", OUTLINE_RULE,
  "### budget", String(SCRIPT_MAX_TOKENS),
  "### units", JSON.stringify(coursePrompts.math.units),
  "### meta", JSON.stringify({ id: coursePrompts.math.id, label: coursePrompts.math.label,
    subject: coursePrompts.math.subject, placeholder: coursePrompts.math.placeholder }),
].join("\n");
fs.writeFileSync(process.argv[2], dump);
console.log("total length:", dump.length);
