import fs from "node:fs";
import { coursePrompts } from "../src/prompts/math.js";
import { TOPIC_RULE, OUTLINE_RULE } from "../src/prompts/scriptFormat.js";
import { budgetFor, scriptMaxTokens } from "../src/scriptBudget.js";
const budget = budgetFor();
const dump = [
  "### mathPrompt", coursePrompts.math.buildSystemPrompt(),
  "### TOPIC_RULE", TOPIC_RULE,
  "### OUTLINE_RULE", OUTLINE_RULE,
  "### budget", JSON.stringify(budget), String(scriptMaxTokens(budget)),
  "### units", JSON.stringify(coursePrompts.math.units),
  "### meta", JSON.stringify({ id: coursePrompts.math.id, label: coursePrompts.math.label,
    subject: coursePrompts.math.subject, placeholder: coursePrompts.math.placeholder }),
].join("\n");
fs.writeFileSync(process.argv[2], dump);
console.log("total length:", dump.length);
