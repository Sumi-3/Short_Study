import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

const BASIC_CREDENTIALS = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const digest = (value: string) => createHash("sha256").update(value).digest();

export const basicAuthEnabled = () => Boolean(config.basicAuthPassword);

export const checkBasicAuth = (header: string | undefined): boolean => {
  if (!basicAuthEnabled() || !header) {
    return false;
  }

  const match = /^Basic\s+(.+)$/i.exec(header.trim());
  if (!match || !BASIC_CREDENTIALS.test(match[1])) {
    return false;
  }

  try {
    const credentials = Buffer.from(match[1], "base64").toString("utf-8");
    const separator = credentials.indexOf(":");
    if (separator === -1) {
      return false;
    }

    const user = credentials.slice(0, separator);
    const password = credentials.slice(separator + 1);
    // 固定長のダイジェストにしてから照合し、値の長さで比較自体が例外になるのを避ける。
    const userMatches = timingSafeEqual(digest(user), digest(config.basicAuthUser));
    const passwordMatches = timingSafeEqual(
      digest(password),
      digest(config.basicAuthPassword),
    );
    return userMatches && passwordMatches;
  } catch {
    return false;
  }
};
