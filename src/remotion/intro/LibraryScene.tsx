import { MATH_UNITS, splitUnit } from "../../curriculum";
import { PHONE_HEIGHT, PhoneFrame } from "./PhoneFrame";
import { SceneLayout } from "./SceneLayout";
import { ScreenVideo } from "./ScreenVideo";
import type { IntroScene } from "./script";
import { useTheme, withAlpha } from "../theme";

const taxonomy = MATH_UNITS.reduce<Record<string, string[]>>((groups, unit) => {
  const { major, middle } = splitUnit(unit.name);
  groups[major] ??= [];
  groups[major].push(middle);
  return groups;
}, {});

export const LibraryScene: React.FC<{ scene: IntroScene }> = ({ scene }) => {
  const theme = useTheme();
  return (
    <SceneLayout title="学習ライブラリ" narration={scene.narration} durationInFrames={scene.durationInFrames}>
      <div style={{ height: "100%", display: "grid", gridTemplateColumns: "1.3fr 0.7fr", alignItems: "center", gap: 64 }}>
        <div
          style={{
            height: "100%",
            padding: 24,
            boxSizing: "border-box",
            borderRadius: theme.radius,
            backgroundColor: theme.plate,
            border: `2px solid ${withAlpha(theme.ink, 0.1)}`,
          }}
        >
          <div style={{ color: theme.accents[0], fontFamily: theme.fontFamily, fontSize: 32, fontWeight: 900 }}>
            分野で絞り込む
          </div>
          {/* 大分類はちょうど9個なので3列で3行に揃う。4列だと最終行が1個だけ残り、
              その下に空きが出たぶん文字を小さくすることになって読めなくなる。 */}
          <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", columnGap: 18, rowGap: 22 }}>
            {Object.entries(taxonomy).map(([major, middles]) => (
              <div key={major} style={{ minWidth: 0 }}>
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: theme.radius,
                    backgroundColor: withAlpha(theme.accents[0], 0.14),
                    color: theme.accents[0],
                    fontFamily: theme.fontFamily,
                    fontSize: 30,
                    fontWeight: 900,
                  }}
                >
                  {major}
                </div>
                <div style={{ marginLeft: 12, paddingLeft: 14, borderLeft: `3px solid ${withAlpha(theme.accents[0], 0.32)}` }}>
                  {middles.map((middle) => (
                    <div key={middle} style={{ marginTop: 9, color: theme.ink, fontFamily: theme.fontFamily, fontSize: 23, lineHeight: 1.25, fontWeight: 700 }}>
                      {middle}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <PhoneFrame height={PHONE_HEIGHT}>
            <ScreenVideo placeholder="ここに 3-4 右の録画（ホーム・フィルター） が入る" />
          </PhoneFrame>
        </div>
      </div>
    </SceneLayout>
  );
};
