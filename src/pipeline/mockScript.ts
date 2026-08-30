import type { Script } from "../types";

/**
 * Stands in for the Claude call when running with `--mock`, so the audio,
 * caption and Remotion steps can be exercised without an API key.
 */
export const mockScript: Script = {
  topic: "微分積分の基本を教えて",
  unit: "数II 微分・積分",
  course: "math",
  subject: "math",
  scenes: [
    {
      scene_id: 1,
      narration:
        "微分と積分、実は正反対の操作だって知っていましたか。ここを押さえると一気に見通しが良くなります。",
      visual_type: "hook",
      visual_content: "微分と積分は逆",
      visual: undefined,
    },
    {
      scene_id: 2,
      narration:
        "まず微分。これはある瞬間の変化の速さを求める操作です。位置のグラフを微分すると、速度が出てきます。",
      visual_type: "point",
      visual_content: "微分 = 瞬間の傾き",
      visual: {
        kind: "formula",
        lines: ["f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}"],
        caption: "傾きの極限",
      },
    },
    {
      scene_id: 3,
      narration:
        "次に積分。こちらはグラフと軸で囲まれた面積を、細長い長方形を無限に足し合わせて求める操作です。",
      visual_type: "point",
      visual_content: "積分 = 面積の足し算",
      visual: {
        kind: "plot",
        xRange: [-1, 3],
        yRange: [-1, 9],
        curves: [{ expr: "x^2", exprY: null, label: "y = x²", region: null }],
        tRange: null,
        shade: [0, 2],
        points: [],
      },
    },
    {
      scene_id: 4,
      narration:
        "そして微分積分学の基本定理。積分してから微分すると、元の関数に戻ります。この二つは行き来できるんです。",
      visual_type: "point",
      visual_content: "基本定理でつながる",
      visual: {
        kind: "bullets",
        items: ["微分は分ける", "積分は集める", "互いに逆の操作"],
      },
    },
    {
      scene_id: 5,
      narration:
        "変化を見たいなら微分、積み重ねを見たいなら積分。この使い分けだけ覚えて帰ってください。",
      visual_type: "summary",
      visual_content: "変化なら微分 積み重ねなら積分",
      visual: {
        kind: "bullets",
        items: ["変化 → 微分", "累積 → 積分"],
      },
    },
  ],
};
