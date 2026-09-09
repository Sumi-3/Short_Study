import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

/**
 * 一通りの方法で構築する API client。
 *
 * SDK には workspace 用の option がないため header に入れる。空値は拒否されるので、設定時だけ渡す。
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
