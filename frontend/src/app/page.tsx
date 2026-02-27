"use client";

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from "react";

const API_URL = "http://localhost:8000";

interface GenerateResult {
  image: string; // base64
  format: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [strength, setStrength] = useState(0.55);
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [steps, setSteps] = useState(30);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/")) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    setFile(f);
    setError(null);
    setResult(null);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
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

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const generate = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("image", file);
    formData.append("strength", String(strength));
    formData.append("guidance_scale", String(guidanceScale));
    formData.append("num_inference_steps", String(steps));

    try {
      const res = await fetch(`${API_URL}/generate`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `서버 오류 (${res.status})`);
      }

      const data: GenerateResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const downloadResult = () => {
    if (!result) return;
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${result.image}`;
    link.download = "영정사진.png";
    link.click();
  };

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      {/* 헤더 */}
      <header className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-800 tracking-tight">영정사진 메이커</h1>
        <p className="mt-2 text-gray-500 text-sm">AI가 사진을 영정사진 스타일로 변환해 드립니다</p>
      </header>

      <div className="max-w-4xl mx-auto">
        {/* 업로드 + 결과 영역 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 왼쪽: 업로드 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">원본 사진</h2>
            </div>
            <div className="p-5">
              {previewUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="업로드된 원본"
                    className="w-full aspect-square object-cover rounded-xl"
                  />
                  <button
                    onClick={reset}
                    className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs transition-colors"
                    title="다시 선택"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors select-none
                    ${isDragging
                      ? "border-gray-600 bg-gray-100"
                      : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
                    }`}
                >
                  <div className="text-4xl mb-3 text-gray-300">📷</div>
                  <p className="text-sm text-gray-500 font-medium">클릭하거나 사진을 드래그하세요</p>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP 지원</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileChange}
              />
            </div>
          </div>

          {/* 오른쪽: 결과 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">영정사진 결과</h2>
            </div>
            <div className="p-5">
              {loading ? (
                <div className="aspect-square rounded-xl bg-gray-50 flex flex-col items-center justify-center gap-4">
                  <div className="w-10 h-10 border-4 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">AI가 사진을 변환 중입니다…</p>
                  <p className="text-xs text-gray-400">처음 실행 시 수 분 소요될 수 있습니다</p>
                </div>
              ) : result ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/png;base64,${result.image}`}
                    alt="생성된 영정사진"
                    className="w-full aspect-square object-cover rounded-xl"
                  />
                  <button
                    onClick={downloadResult}
                    className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                  >
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

        {/* 에러 메시지 */}
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* 고급 설정 */}
        <div className="mt-5 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <span className="font-medium">고급 설정</span>
            <span className="text-gray-400 text-xs">{showAdvanced ? "▲ 접기" : "▼ 펼치기"}</span>
          </button>

          {showAdvanced && (
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-5 border-t border-gray-100">
              {/* Strength */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  변환 강도 <span className="text-gray-400">(strength)</span>
                </label>
                <input
                  type="range"
                  min="0.3"
                  max="0.9"
                  step="0.05"
                  value={strength}
                  onChange={(e) => setStrength(Number(e.target.value))}
                  className="w-full accent-gray-700"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>0.3 (원본 유지)</span>
                  <span className="font-medium text-gray-600">{strength.toFixed(2)}</span>
                  <span>0.9 (강변환)</span>
                </div>
              </div>

              {/* Guidance Scale */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  프롬프트 충실도 <span className="text-gray-400">(guidance)</span>
                </label>
                <input
                  type="range"
                  min="4"
                  max="15"
                  step="0.5"
                  value={guidanceScale}
                  onChange={(e) => setGuidanceScale(Number(e.target.value))}
                  className="w-full accent-gray-700"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>4</span>
                  <span className="font-medium text-gray-600">{guidanceScale.toFixed(1)}</span>
                  <span>15</span>
                </div>
              </div>

              {/* Steps */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  추론 스텝 수 <span className="text-gray-400">(steps)</span>
                </label>
                <input
                  type="range"
                  min="10"
                  max="50"
                  step="5"
                  value={steps}
                  onChange={(e) => setSteps(Number(e.target.value))}
                  className="w-full accent-gray-700"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>10 (빠름)</span>
                  <span className="font-medium text-gray-600">{steps}</span>
                  <span>50 (정밀)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 생성 버튼 */}
        <div className="mt-5">
          <button
            onClick={generate}
            disabled={!file || loading}
            className={`w-full py-4 rounded-2xl text-sm font-semibold transition-all
              ${!file || loading
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-gray-800 hover:bg-gray-900 text-white shadow-sm active:scale-[0.99]"
              }`}
          >
            {loading ? "변환 중…" : "영정사진 생성하기"}
          </button>
        </div>

        {/* 안내 문구 */}
        <p className="mt-5 text-center text-xs text-gray-400">
          업로드된 사진은 서버에 저장되지 않으며, 생성 후 즉시 삭제됩니다.
        </p>
      </div>
    </div>
  );
}
