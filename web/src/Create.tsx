import { useEffect, useRef, useState } from "react";
import { COURSES } from "../../src/courses";
import { VOICES } from "../../src/voices";
import { SCRIPT_MODELS } from "../../src/models";
import { extractProblem, type JobEvent } from "./api";
import { playSample } from "./voiceSamples";

type Crop = { x: number; y: number; width: number; height: number };

const INITIAL_CROP: Crop = { x: 8, y: 8, width: 84, height: 84 };
const MIN_CROP_SIZE = 12;
const MAX_CROP_EDGE = 2_048;
// 2.4 MB の JPEG は base64 化しても最大 3.2 MB なので、JSON を足しても Vercel の 4.5 MB 未満になる。
const MAX_JPEG_BYTES = 2_400_000;

const clamp = (value: number, lower: number, upper: number) =>
  Math.min(Math.max(value, lower), upper);

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("画像をJPEGに変換できませんでした"));
      }
    }, "image/jpeg", quality);
  });

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("画像を読み込めませんでした"));
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });

/** 写真は送信前に 2048px と 2.4 MB に収める。圧縮不足なら解像度も段階的に下げる。 */
const cropToJpeg = async (image: HTMLImageElement, crop: Crop) => {
  const sourceWidth = image.naturalWidth * (crop.width / 100);
  const sourceHeight = image.naturalHeight * (crop.height / 100);
  const sourceX = image.naturalWidth * (crop.x / 100);
  const sourceY = image.naturalHeight * (crop.y / 100);
  let scale = Math.min(1, MAX_CROP_EDGE / Math.max(sourceWidth, sourceHeight));

  for (;;) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("画像を処理できませんでした");
    }
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    for (let quality = 0.9; quality >= 0.5; quality -= 0.1) {
      const jpeg = await toBlob(canvas, quality);
      if (jpeg.size <= MAX_JPEG_BYTES) {
        return toBase64(jpeg);
      }
    }
    // JPEG の品質だけをこれ以上下げると細い数式が潰れるので、寸法を下げて読みやすさを保つ。
    scale *= 0.8;
  }
};

const JobCard: React.FC<{ job: JobEvent; progress: number; onDismiss: () => void }> = ({
  job,
  progress,
  onDismiss,
}) => {
  const settled = job.status === "done" || job.status === "error";

  return (
    <div className={`job job--${job.status}`}>
      <div className="job__row">
        <span className="job__message">{job.message}</span>
        {settled ? (
          <button className="job__close" onClick={onDismiss} aria-label="閉じる">
            ✕
          </button>
        ) : (
          <span className="job__percent">{Math.round(progress * 100)}%</span>
        )}
      </div>
      <div className="job__track">
        <div className="job__fill" style={{ width: `${progress * 100}%` }} />
      </div>
      {job.error ? <p className="job__error">{job.error}</p> : null}
    </div>
  );
};

export const Create: React.FC<{
  job: JobEvent | null;
  /** 進みは App が持つ。tab を離れてもこの component が消えても、途中の値を失わない。 */
  progress: number;
  busy: boolean;
  onSubmit: (topic: string, voice: string, model: string) => void;
  onDismiss: () => void;
}> = ({ job, progress, busy, onSubmit, onDismiss }) => {
  const [topic, setTopic] = useState("");
  const [voice, setVoice] = useState(VOICES[0].id);
  const [model, setModel] = useState(SCRIPT_MODELS[0].id);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [crop, setCrop] = useState<Crop>(INITIAL_CROP);
  const [imageError, setImageError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  // カメラ用と選択用で input を分ける。capture は「常に撮影」を意味し、
  // 付いた input はスマホで写真ライブラリを開けないためである。
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const cropBoundsRef = useRef<HTMLDivElement>(null);
  const imageUrlRef = useRef<string | null>(null);
  const cropDragRef = useRef<{
    action: "move" | "resize";
    clientX: number;
    clientY: number;
    crop: Crop;
  } | null>(null);

  useEffect(() => () => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
    }
  }, []);

  const chooseImage = (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setImageError("画像ファイルを選んでください。");
      return;
    }
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
    }
    const source = URL.createObjectURL(file);
    imageUrlRef.current = source;
    setImageSrc(source);
    setImageReady(false);
    setCrop(INITIAL_CROP);
    setImageError(null);
    setExtractError(null);
  };

  const pickImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    chooseImage(event.target.files?.[0]);
    // 同じ写真を撮り直して選んでも change を発火させ、すぐ再試行できるようにする。
    event.target.value = "";
  };

  const clearImage = () => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
    }
    setImageSrc(null);
    setImageReady(false);
    setImageError(null);
    setExtractError(null);
  };

  const startCropDrag = (action: "move" | "resize") =>
    (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      cropDragRef.current = { action, clientX: event.clientX, clientY: event.clientY, crop };
    };

  const updateCropDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current;
    const bounds = cropBoundsRef.current?.getBoundingClientRect();
    if (!drag || !bounds) {
      return;
    }
    const dx = ((event.clientX - drag.clientX) / bounds.width) * 100;
    const dy = ((event.clientY - drag.clientY) / bounds.height) * 100;
    if (drag.action === "move") {
      setCrop({
        ...drag.crop,
        x: clamp(drag.crop.x + dx, 0, 100 - drag.crop.width),
        y: clamp(drag.crop.y + dy, 0, 100 - drag.crop.height),
      });
      return;
    }
    setCrop({
      ...drag.crop,
      width: clamp(drag.crop.width + dx, MIN_CROP_SIZE, 100 - drag.crop.x),
      height: clamp(drag.crop.height + dy, MIN_CROP_SIZE, 100 - drag.crop.y),
    });
  };

  const extract = async () => {
    if (!imageRef.current || !imageReady || extracting) {
      return;
    }
    setExtracting(true);
    setExtractError(null);
    try {
      const image = await cropToJpeg(imageRef.current, crop);
      const result = await extractProblem(image, model);
      setTopic(result.topic);
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : "テキストを抽出できませんでした。");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="create">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!topic.trim() || busy) {
            return;
          }
          onSubmit(topic.trim(), voice, model);
          setTopic("");
        }}
        >
        <input
          ref={cameraRef}
          className="image-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={pickImage}
        />
        <input
          ref={libraryRef}
          className="image-input"
          type="file"
          accept="image/*"
          onChange={pickImage}
        />
        <h2>解きたい問題は？</h2>
        {!imageSrc ? (
          <div className="image-entry">
            <div className="image-entry__choices">
              <button type="button" className="image-entry__button" onClick={() => cameraRef.current?.click()}>
                <span aria-hidden>▣</span>
                <span>写真を撮る</span>
              </button>
              <button type="button" className="image-entry__button" onClick={() => libraryRef.current?.click()}>
                <span aria-hidden>▤</span>
                <span>画像を選ぶ</span>
              </button>
            </div>
            <p>問題の部分を切り抜いてから、文字を読み取れます。</p>
          </div>
        ) : (
          <section className="image-crop" aria-labelledby="crop-title">
            <div className="image-crop__heading">
              <div>
                <h3 id="crop-title">問題の部分を囲む</h3>
                <p>枠をドラッグして移動し、右下で大きさを調整します。</p>
              </div>
              <div className="image-crop__change">
                <button type="button" onClick={() => cameraRef.current?.click()}>
                  撮り直す
                </button>
                <button type="button" onClick={() => libraryRef.current?.click()}>
                  選び直す
                </button>
              </div>
            </div>
            <div className="image-crop__viewport" ref={cropBoundsRef}>
              <img
                ref={imageRef}
                src={imageSrc}
                alt="選択した問題の写真"
                onLoad={() => setImageReady(true)}
                onError={() => setImageError("画像を表示できませんでした。別の画像を選んでください。")}
              />
              <div
                className="image-crop__selection"
                style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.width}%`, height: `${crop.height}%` }}
                onPointerDown={startCropDrag("move")}
                onPointerMove={updateCropDrag}
                onPointerUp={() => { cropDragRef.current = null; }}
                onPointerCancel={() => { cropDragRef.current = null; }}
              >
                <span className="image-crop__label">問題</span>
                <span
                  className="image-crop__handle"
                  aria-label="トリミング範囲を広げる"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    startCropDrag("resize")(event);
                  }}
                />
              </div>
            </div>
            <div className="image-crop__actions">
              <button type="button" className="image-crop__cancel" onClick={clearImage}>画像を閉じる</button>
              <button type="button" className="image-crop__extract" onClick={() => void extract()} disabled={extracting || !imageReady}>
                {extracting ? "テキストを抽出中…" : imageReady ? "テキストを抽出" : "画像を読み込み中…"}
              </button>
            </div>
          </section>
        )}
        {imageError ? <p className="image-message image-message--error" role="alert">{imageError}</p> : null}
        {extractError ? (
          <div className="image-message image-message--error" role="alert">
            <span>{extractError}</span>
            <button type="button" onClick={() => void extract()} disabled={extracting}>再試行</button>
          </div>
        ) : null}
        {extracting ? <p className="image-message" aria-live="polite">画像を縮小して、問題文を読み取っています…</p> : null}
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={COURSES.math.placeholder}
          rows={5}
        />

        <div className="field">
          <span className="field__label">声</span>
          {/* chip ではなく select にする。14個の chip なら三行にわたって scroll し、
              これは一度選べば済む設定だからである。選択時に再生するのは、label は候補を
              絞れても、決め手になるのは sample だけだからである。 */}
          <div className="voice">
            <select
              value={voice}
              onChange={(e) => {
                setVoice(e.target.value);
                playSample(e.target.value);
              }}
            >
              <optgroup label="日本語ボイス">
                {VOICES.filter((entry) => entry.native).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="多言語ボイス（日本語も話せます）">
                {VOICES.filter((entry) => !entry.native).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <button
              type="button"
              className="voice__play"
              onClick={() => playSample(voice)}
              aria-label="声を試聴する"
            >
              ▶
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field__label">台本モデル</span>
          {/* 声と違って2択なので chip にする。選ぶたびに開かせる理由がない。
              速さと深さのどちらを取ったかを、選んだ後も読めるようにしておく。 */}
          <div className="models">
            {SCRIPT_MODELS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`models__chip${model === entry.id ? " is-on" : ""}`}
                onClick={() => setModel(entry.id)}
                aria-pressed={model === entry.id}
              >
                <span className="models__name">{entry.label}</span>
                <span className="models__note">{entry.note}</span>
              </button>
            ))}
          </div>
        </div>

        <button type="submit" disabled={!topic.trim() || busy}>
          {busy ? "生成中…" : "動画をつくる"}
        </button>
      </form>

      {job ? <JobCard job={job} progress={progress} onDismiss={onDismiss} /> : null}
    </div>
  );
};
