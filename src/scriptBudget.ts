/**
 * シーン数や音声の尺では制限しない。複数設問の方針・途中式と adaptive thinking が
 * 旧10シーン向けの27,000 tokensで途中終了しないよう、API応答の余地だけを確保する。
 * 到達時は不完全な台本を採用せず、generateScript が stop_reason を報告する。
 */
export const SCRIPT_MAX_TOKENS = 64_000;
