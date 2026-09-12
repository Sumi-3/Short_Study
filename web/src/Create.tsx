import { useEffect, useRef, useState } from "react";
import { COURSES } from "../../src/courses";
import { VOICES } from "../../src/voices";
import { FIXED_SCRIPT_MODEL } from "../../src/models";
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

const JOB_STEPS: { status: JobEvent["status"]; label: string }[] = [
  { status: "script", label: "台本をつくる" },
  { status: "audio", label: "ナレーションをつくる" },
  { status: "captions", label: "字幕を整える" },
  { status: "manifest", label: "動画を仕上げる" },
];

const jobStepIndex = (status: JobEvent["status"]) =>
  JOB_STEPS.findIndex((step) => step.status === status);

const jobStatusLabel = (status: JobEvent["status"]) => {
  switch (status) {
    case "queued": return "生成の順番を待っています";
    case "script": return "台本をつくっています";
    case "audio": return "ナレーションをつくっています";
    case "captions": return "字幕を整えています";
    case "manifest": return "動画を仕上げています";
    case "done": return "動画ができました";
    case "error": return "生成が止まりました";
  }
};

const JobCard: React.FC<{
  job: JobEvent;
  progress: number;
  onDismiss: () => void;
  onRetry?: () => void;
}> = ({ job, progress, onDismiss, onRetry }) => {
  const settled = job.status === "done" || job.status === "error";
  const activeStep = jobStepIndex(job.status);

  return (
    <section
      className={`job job--${job.status}`}
      aria-labelledby="job-title"
      aria-live={settled ? "off" : "polite"}
      aria-atomic="true"
    >
      <div className="job__row">
        <div>
          <p className="job__eyebrow">生成の進み具合</p>
          <h2 id="job-title" className="job__title">{jobStatusLabel(job.status)}</h2>
        </div>
        {settled ? (
          <button className="job__close" onClick={onDismiss} aria-label="生成状況を閉じる">✕</button>
        ) : (
          <span className="job__percent">{Math.round(progress * 100)}%</span>
        )}
      </div>
      <p className="job__message">{job.message}</p>
      <div className="job__track">
        <div className="job__fill" style={{ width: `${progress * 100}%` }} />
      </div>
      {!settled ? (
        <ol className="job__steps" aria-label="生成工程">
          {JOB_STEPS.map((step, index) => {
            const complete = activeStep > index;
            const active = activeStep === index;
            return <li key={step.status} className={complete ? "is-complete" : active ? "is-active" : ""}>
              <span aria-hidden>{complete ? "✓" : index + 1}</span>{step.label}
            </li>;
          })}
        </ol>
      ) : null}
      {job.error ? <div className="job__failure" role="alert">
        <p className="job__error">{job.error}</p>
        {onRetry ? <button type="button" className="job__retry" onClick={onRetry}>同じ内容でもう一度試す</button> : null}
      </div> : null}
    </section>
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
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [crop, setCrop] = useState<Crop>(INITIAL_CROP);
  const [imageError, setImageError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [lastSubmission, setLastSubmission] = useState<{ topic: string; voice: string } | null>(null);
  // カメラ用と選択用で input を分ける。capture は「常に撮影」を意味し、
  // 付いた input はスマホで写真ライブラリを開けないためである。
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const topicRef = useRef<HTMLTextAreaElement>(null);
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

  useEffect(() => {
    const textarea = topicRef.current;
    if (!textarea) {
      return;
    }
    // 入力量に合わせて伸ばし、長い問題文でも編集領域をスクロールさせずに読めるようにする。
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [topic]);

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
      const result = await extractProblem(image, FIXED_SCRIPT_MODEL.id);
      setTopic(result.topic);
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : "テキストを抽出できませんでした。");
    } finally {
      setExtracting(false);
    }
  };

  const moveCropByKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const directions: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) {
      return;
    }
    const amount = event.shiftKey ? 5 : 1;
    event.preventDefault();
    setCrop((current) => ({
      ...current,
      x: clamp(current.x + direction[0] * amount, 0, 100 - current.width),
      y: clamp(current.y + direction[1] * amount, 0, 100 - current.height),
    }));
  };

  const resizeCropByKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const directions: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) {
      return;
    }
    const amount = event.shiftKey ? 5 : 1;
    event.preventDefault();
    event.stopPropagation();
    setCrop((current) => ({
      ...current,
      width: clamp(current.width + direction[0] * amount, MIN_CROP_SIZE, 100 - current.x),
      height: clamp(current.height + direction[1] * amount, MIN_CROP_SIZE, 100 - current.y),
    }));
  };

  const submitTopic = (value: string, selectedVoice: string) => {
    const trimmed = value.trim();
    if (!trimmed || busy) {
      return;
    }
    setLastSubmission({ topic: trimmed, voice: selectedVoice });
    onSubmit(trimmed, selectedVoice, FIXED_SCRIPT_MODEL.id);
    setTopic("");
  };

  return (
    <div className="create">
      {job ? <JobCard job={job} progress={progress} onDismiss={onDismiss} onRetry={job.status === "error" && lastSubmission ? () => submitTopic(lastSubmission.topic, lastSubmission.voice) : undefined} /> : null}
      <form className="composer" onSubmit={(event) => {
        event.preventDefault();
        submitTopic(topic, voice);
      }}>
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
        <header className="create__header">
          <p className="create__eyebrow">数学ショートを生成</p>
          <h1>問題を動画で解こう</h1>
          <p>写真から読み取るか、問題文を直接入力して始めます。</p>
        </header>
        <ol className="create-flow" aria-label="動画をつくる手順">
          <li className={imageSrc ? "is-complete" : ""}><span>1</span>読み取る</li>
          <li className={topic.trim() ? "is-complete" : "is-current"}><span>2</span>問題文</li>
          <li><span>3</span>声</li>
          <li><span>4</span>生成</li>
        </ol>

        <section className="create-step create-step--source" aria-labelledby="source-title">
          <div className="create-step__heading">
            <p className="create-step__number">1 <span>任意</span></p>
            <div>
              <h2 id="source-title">画像から読み取る</h2>
              <p>ノートや問題集の写真から問題文を取り出せます。</p>
            </div>
          </div>
          {!imageSrc ? <div className="image-entry">
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
          </div> : <div className="image-crop" aria-labelledby="crop-title">
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
                onKeyDown={moveCropByKey}
                tabIndex={0}
                role="group"
                aria-label="トリミング範囲。矢印キーで移動できます"
              >
                <span className="image-crop__label">問題</span>
                <button
                  type="button"
                  className="image-crop__handle"
                  aria-label="トリミング範囲を広げる。矢印キーで調整できます"
                  onKeyDown={resizeCropByKey}
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
          </div>}
        </section>
        {imageError ? <div className="create-notice create-notice--error" role="alert">
          <p>{imageError}</p><button type="button" onClick={() => libraryRef.current?.click()}>別の画像を選ぶ</button>
        </div> : null}
        {extractError ? (
          <div className="create-notice create-notice--error" role="alert">
            <p>{extractError}</p>
            <button type="button" onClick={() => void extract()} disabled={extracting}>再試行</button>
          </div>
        ) : null}
        {extracting ? <p className="create-notice" role="status">画像を縮小して、問題文を読み取っています…</p> : null}

        <section className="create-step create-step--problem" aria-labelledby="topic-title">
          <div className="create-step__heading">
            <p className="create-step__number">2 <span>必須</span></p>
            <div><h2 id="topic-title">問題文を確認・修正</h2><p>読み取り結果はそのまま編集できます。式や条件もここで整えます。</p></div>
          </div>
          <label className="topic-label" htmlFor="problem-topic">解きたい問題</label>
          <textarea ref={topicRef} id="problem-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder={COURSES.math.placeholder} rows={7} aria-describedby="topic-help" />
          <div className="topic-meta" id="topic-help"><span>入力後に、解説の台本をつくります。</span><output aria-live="off">{topic.trim().length} 文字</output></div>
        </section>

        <section className="create-step create-step--voice" aria-labelledby="voice-title">
          <div className="create-step__heading">
            <p className="create-step__number">3</p>
            <div><h2 id="voice-title">声を選ぶ</h2><p>再生ボタンで、選んだ声の話し方を確認できます。</p></div>
          </div>
          <div className="field">
          <label className="field__label" htmlFor="voice">ナレーションの声</label>
          {/* chip ではなく select にする。14個の chip なら三行にわたって scroll し、
              これは一度選べば済む設定だからである。選択時に再生するのは、label は候補を
              絞れても、決め手になるのは sample だけだからである。 */}
          <div className="voice">
            <select
              id="voice"
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
              aria-label="選んだ声を試聴する"
            >
              ▶
            </button>
          </div>
          </div>
        </section>

        <div className="create-submit">
          <p>{topic.trim() ? "問題文の準備ができました" : "問題文を入力すると生成できます"}</p>
          <button type="submit" disabled={!topic.trim() || busy}>{busy ? "動画をつくっています…" : "この内容で動画をつくる"}</button>
        </div>
      </form>
    </div>
  );
};
