"use client";

import { useState, useRef, useCallback, useEffect, DragEvent, ChangeEvent } from "react";

const API_URL = "http://localhost:8000";

interface GenerateResult {
  image: string;
  format: string;
  model: string;
  template_applied: boolean;
  age_increment: number;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [gender, setGender] = useState<"male" | "female">("male");
  const [ageIncrement, setAgeIncrement] = useState(0);
  const [preserveGlasses, setPreserveGlasses] = useState(false);

  const [serverReady, setServerReady] = useState(false);
  const [serverError, setServerError] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 서버 상태 폴링
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/health`);
        if (res.ok) {
          setServerReady(true);
          setServerError(false);
        } else {
          setServerReady(false);
        }
      } catch {
        setServerReady(false);
        setServerError(true);
      }
    };
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, []);

  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/")) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    setFile(f);
    setError(null);
    setResult(null);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, []);

  const onDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);

  const generate = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.append("image", file);
    fd.append("gender", gender);
    fd.append("age_increment", String(ageIncrement));
    fd.append("preserve_glasses", String(preserveGlasses));

    try {
      const res = await fetch(`${API_URL}/generate`, { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `서버 오류 (${res.status})`);
      }
      setResult(await res.json());
    } catch (e) {
      if (e instanceof TypeError && e.message.includes("fetch")) {
        setError("서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인해 주세요.");
      } else {
        setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  const downloadResult = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${result.image}`;
    a.download = "영정사진.png";
    a.click();
  };

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const canGenerate = !!file && !loading && serverReady;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <header className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-800 tracking-tight">영정사진 메이커</h1>
        <p className="mt-2 text-gray-500 text-sm">Flux Kontext Pro로 얼굴을 보존하며 변환합니다</p>
      </header>

      <div className="max-w-4xl mx-auto">

        {/* 서버 상태 */}
        <div className="mb-5 flex items-center gap-2 px-1">
          {serverReady ? (
            <>
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
              <span className="text-xs text-green-600">준비 완료 (fal.ai)</span>
            </>
          ) : serverError ? (
            <>
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              <span className="text-xs text-red-500">서버 연결 실패 — 백엔드를 실행해 주세요</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse inline-block" />
              <span className="text-xs text-gray-400">서버 연결 중…</span>
            </>
          )}
        </div>

        {/* 업로드 + 결과 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 원본 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">원본 사진</h2>
            </div>
            <div className="p-5">
              {previewUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="원본" className="w-full aspect-square object-cover rounded-xl" />
                  <button onClick={reset}
                    className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs transition-colors">
                    ✕
                  </button>
                </div>
              ) : (
                <div onClick={() => fileInputRef.current?.click()}
                  onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                  className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors select-none
                    ${isDragging ? "border-gray-600 bg-gray-100" : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"}`}>
                  <div className="text-4xl mb-3 text-gray-300">📷</div>
                  <p className="text-sm text-gray-500 font-medium">클릭하거나 사진을 드래그하세요</p>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP 지원</p>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
            </div>
          </div>

          {/* 결과 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">영정사진 결과</h2>
            </div>
            <div className="p-5">
              {loading ? (
                <div className="aspect-square rounded-xl bg-gray-50 flex flex-col items-center justify-center gap-3">
                  <div className="w-10 h-10 border-4 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">AI가 변환 중입니다…</p>
                  <p className="text-xs text-gray-400">{ageIncrement > 0 ? "20~40초 소요 (에이징 포함)" : "10~30초 소요"}</p>
                </div>
              ) : result ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`data:image/png;base64,${result.image}`} alt="결과" className="w-full aspect-square object-cover rounded-xl" />
                  <button onClick={downloadResult}
                    className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                    다운로드
                  </button>
                </div>
              ) : (
                <div className="aspect-square rounded-xl bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center">
                  <div className="text-4xl mb-3 text-gray-200">🖼️</div>
                  <p className="text-sm text-gray-400">변환된 사진이 여기에 표시됩니다</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 에러 */}
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {/* 성별 */}
        <div className="mt-5 bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-700 mb-3">성별</p>
          <div className="flex gap-3">
            {(["male", "female"] as const).map((g) => (
              <button key={g} onClick={() => setGender(g)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors
                  ${gender === g ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                {g === "male" ? "남성" : "여성"}
              </button>
            ))}
          </div>
        </div>

        {/* 안경 보존 토글 */}
        <div className="mt-5 bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">안경 보존</p>
              <p className="text-xs text-gray-400 mt-0.5">원본 사진의 안경을 그대로 유지합니다</p>
            </div>
            <button
              onClick={() => setPreserveGlasses(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
                ${preserveGlasses ? "bg-gray-800" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                ${preserveGlasses ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
        </div>

        {/* 고급 설정 */}
        <div className="mt-5 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <button onClick={() => setShowAdvanced(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <span className="font-medium">고급 설정</span>
            <span className="text-gray-400 text-xs">{showAdvanced ? "▲ 접기" : "▼ 펼치기"}</span>
          </button>

          {showAdvanced && (
            <div className="px-5 pb-5 border-t border-gray-100 pt-5">
              <label className="block text-xs font-medium text-gray-700 mb-3">
                노화 효과 <span className="text-gray-400">(0 = 끔, 숫자 = 몇 살 더 늙게)</span>
              </label>
              <input type="range" min="0" max="50" step="5" value={ageIncrement}
                onChange={e => setAgeIncrement(Number(e.target.value))} className="w-full accent-gray-700" />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>끔</span>
                <span className="font-medium text-gray-600">{ageIncrement === 0 ? "에이징 없음" : `+${ageIncrement}살`}</span>
                <span>+50살</span>
              </div>
            </div>
          )}
        </div>

        {/* 생성 버튼 */}
        <div className="mt-5">
          <button onClick={generate} disabled={!canGenerate}
            className={`w-full py-4 rounded-2xl text-sm font-semibold transition-all
              ${canGenerate
                ? "bg-gray-800 hover:bg-gray-900 text-white shadow-sm active:scale-[0.99]"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
            {loading ? "변환 중…" : !serverReady ? "서버 연결 중…" : "영정사진 생성하기"}
          </button>
        </div>

        <p className="mt-5 text-center text-xs text-gray-400">
          업로드된 사진은 서버에 저장되지 않으며, 처리 후 즉시 삭제됩니다.
        </p>
      </div>
    </div>
  );
}
