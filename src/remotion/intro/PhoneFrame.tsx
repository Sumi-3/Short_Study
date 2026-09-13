import type { ReactNode } from "react";
import { useTheme, withAlpha } from "../theme";

/**
 * 見出しと1行の字幕帯を除いた縦を使い切る画面高さ。中身が主役なので端末は入る限り大きく取る。
 * 3台並べるシーンだけは横幅が先に尽きるため個別に決めている。
 */
export const PHONE_HEIGHT = 750;

/** `height` は画面の高さで、ベゼルはその外側に付く。 */
export const PhoneFrame: React.FC<{
  height: number;
  /** 画面の横幅 ÷ 高さ。縦型 short 以外は録画の実寸を渡す。 */
  aspectRatio?: number;
  children: ReactNode;
}> = ({ height, aspectRatio = 9 / 16, children }) => {
  const theme = useTheme();
  const width = height * aspectRatio;
  // ベゼルを内側の padding で作ると画面が 9:16 より縦長になり、等倍で流し込んだ short が
  // 横にはみ出して切れる。画面の寸法を先に決め、枠はその外へ足す。
  const bezel = Math.max(10, height * 0.025);

  return (
    <div
      style={{
        width: width + bezel * 2,
        height: height + bezel * 2,
        padding: bezel,
        borderRadius: height * 0.09,
        backgroundColor: theme.ink,
        boxShadow: `0 ${height * 0.035}px ${height * 0.09}px ${withAlpha(theme.ink, 0.25)}`,
        boxSizing: "border-box",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width,
          height,
          overflow: "hidden",
          borderRadius: height * 0.065,
          backgroundColor: theme.bgDeep,
          position: "relative",
        }}
      >
        {children}
      </div>
    </div>
  );
};
