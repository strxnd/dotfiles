import type { GuidanceFields } from "../rpiv-config/index.ts";
import { configPath, loadJsonConfig, validateGuidanceFields } from "../rpiv-config/index.ts";

const CONFIG_PATH = configPath("rpiv-ask-user-question");

interface AskUserQuestionConfig {
	guidance?: GuidanceFields;
}

export function loadConfig(): AskUserQuestionConfig {
	return loadJsonConfig<AskUserQuestionConfig>(CONFIG_PATH);
}

export { validateGuidanceFields };
