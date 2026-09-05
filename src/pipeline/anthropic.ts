import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

/**
 * The API client, built the one way.
 *
 * The workspace goes in as a header because the SDK has no option for it, and
 * only when set, since an empty value is rejected.
 */
export const anthropic = () =>
  new Anthropic({
    apiKey: config.anthropicApiKey,
    ...(config.anthropicWorkspaceId
      ? {
          defaultHeaders: {
            "anthropic-workspace-id": config.anthropicWorkspaceId,
          },
        }
      : {}),
  });
