"use client";

import { useState, useRef, useCallback, useEffect, DragEvent, ChangeEvent } from "react";

const API_URL = "http://localhost:8000";
const GOIPRIME_URL = "https://prime.goifuneral.co.kr";

interface GenerateResult {
  image: string;
  format: string;
  model: string;
  template_applied: boolean;
}

// ── 토글 ───────────────────────────────────────────────────────────────────
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-semibold w-7 text-right transition-colors ${on ? "text-[#f18334]" : "text-gray-400"}`}>
        {on ? "ON" : "OFF"}
      </span>
      <button
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${on ? "bg-[#f18334]" : "bg-gray-200"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

// ── 성별 버튼 ──────────────────────────────────────────────────────────────
function GenderButton({ value, label, selected, onSelect }: { value: string; label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 border-2 ${
        selected
          ? "border-[#f18334] bg-[#fef0e6] text-[#f18334]"
          : "border-gray-200 bg-white text-gray-400"
      }`}
    >
      <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${selected ? "border-[#f18334]" : "border-gray-300"}`}>
        {selected && <span className="w-2 h-2 rounded-full bg-[#f18334] block" />}
      </span>
      {label}
    </button>
  );
}

// ── 업로드 박스 ────────────────────────────────────────────────────────────
function UploadBox({
  previewUrl, isDragging, onDrop, onDragOver, onDragLeave, onClick, onReset,
}: {
  previewUrl: string | null;
  isDragging: boolean;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onClick: () => void;
  onReset: () => void;
}) {
  return previewUrl ? (
    <div className="relative w-full h-56">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={previewUrl} alt="원본" className="w-full h-full object-cover rounded-2xl" />
      <button
        onClick={onReset}
        className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm transition-colors"
      >✕</button>
    </div>
  ) : (
    <div
      onClick={onClick}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`w-full h-44 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors select-none ${isDragging ? "border-[#f18334] bg-[#fef0e6]" : "border-gray-200 bg-gray-50 hover:border-[#f18334] hover:bg-[#fef0e6]"}`}
    >
      <div className="text-4xl mb-2">📷</div>
      <p className="text-sm font-medium text-gray-500">사진을 탭하거나 드래그하세요</p>
      <p className="text-xs text-gray-400 mt-1">JPG · PNG · WEBP</p>
    </div>
  );
}

// ── 입력 필드 ──────────────────────────────────────────────────────────────
const inputCls = "w-full px-3 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#f18334] transition-colors bg-white";

// ── 메인 ──────────────────────────────────────────────────────────────────
export default function Home() {
  const [mode, setMode] = useState<"preview" | "actual">("preview");

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mode 1 폼
  const [name, setName] = useState("");
  const [currentAge, setCurrentAge] = useState("");
  const [occupation, setOccupation] = useState("");
  const [family, setFamily] = useState("");
  const [values, setValues] = useState("");
  const [finalMessage, setFinalMessage] = useState("");

  const [gender, setGender] = useState<"male" | "female">("male");
  const [preserveGlasses, setPreserveGlasses] = useState(false);

  const [result, setResult] = useState<GenerateResult | null>(null);
  const [eulogy, setEulogy] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverReady, setServerReady] = useState(false);
  const [showPostDownload, setShowPostDownload] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [resultTab, setResultTab] = useState<"photo" | "eulogy">("photo");
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem("goi-welcome-seen")) setShowWelcomeModal(true);
  }, []);
  const dismissWelcome = () => {
    setShowWelcomeModal(false);
    sessionStorage.setItem("goi-welcome-seen", "1");
  };

  useEffect(() => {
    const check = async () => {
      try { const res = await fetch(`${API_URL}/health`); setServerReady(res.ok); }
      catch { setServerReady(false); }
    };
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, []);

  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/")) { setError("이미지 파일만 업로드할 수 있습니다."); return; }
    setFile(f); setError(null); setResult(null); setEulogy(null);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleFile(f); };
  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }, []);
  const onDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);

  const reset = () => {
    setFile(null); setPreviewUrl(null); setResult(null); setEulogy(null); setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const calcAgeIncrement = () => Math.max(20, Math.min(50, 80 - (parseInt(currentAge) || 40)));

  const generate = async () => {
    if (!file) return;
    setLoading(true); setError(null); setResult(null); setEulogy(null);

    if (mode === "preview") {
      setShowResultModal(true);
      setResultTab("photo");
    } else {
      setShowResultModal(true);
    }

    const fd = new FormData();
    fd.append("image", file);
    fd.append("gender", gender);
    fd.append("preserve_glasses", String(preserveGlasses));
    fd.append("age_increment", mode === "preview" ? String(calcAgeIncrement()) : "0");

    const promises: Promise<void>[] = [
      fetch(`${API_URL}/generate`, { method: "POST", body: fd })
        .then(async (res) => {
          if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail ?? `오류 (${res.status})`); }
          setResult(await res.json());
        }),
    ];

    if (mode === "preview" && name && currentAge) {
      const ef = new FormData();
      ef.append("name", name); ef.append("current_age", currentAge); ef.append("gender", gender);
      ef.append("occupation", occupation); ef.append("family", family);
      ef.append("values", values); ef.append("final_message", finalMessage);
      promises.push(
        fetch(`${API_URL}/generate-eulogy`, { method: "POST", body: ef })
          .then(async (res) => { if (res.ok) { const d = await res.json(); setEulogy(d.eulogy); } })
          .catch(() => {})
      );
    }

    try { await Promise.all(promises); }
    catch (e) { setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다."); }
    finally { setLoading(false); }
  };

  const downloadResult = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${result.image}`;
    a.download = "영정사진.png";
    a.click();
    setShowPostDownload(true);
  };

  const handleShare = async () => {
    if (!result) return;
    try {
      const blob = await fetch(`data:image/png;base64,${result.image}`).then(r => r.blob());
      const shareFile = new File([blob], "영정사진.png", { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [shareFile] })) {
        await navigator.share({ title: "나의 영정사진 — 고이프라임", text: "고이프라임에서 AI로 생성한 나의 영정사진입니다.", files: [shareFile] });
        return;
      }
    } catch {}
    setShowShare(true);
  };

  const copyEulogy = async () => {
    if (!eulogy) return;
    await navigator.clipboard.writeText(eulogy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canGenerate = !!file && !loading && serverReady && (mode === "actual" || (!!name && !!currentAge));

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
          <a href={GOIPRIME_URL} target="_blank" rel="noreferrer">
            <span className="text-base font-bold" style={{ color: "#d4520a" }}>고이<span className="text-xs font-medium text-gray-400 ml-0.5">(간직하다)</span></span>
          </a>
          <div className="flex items-center gap-3">
            {serverReady
              ? <span className="flex items-center gap-1 text-xs text-green-600"><span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />준비 완료</span>
              : <span className="flex items-center gap-1 text-xs text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse inline-block" />연결 중</span>
            }
            <a href="tel:16669784" className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: "var(--primary)" }}>
              1666-9784
            </a>
          </div>
        </div>
      </header>

      {/* 히어로 */}
      <div className="px-4 pt-7 pb-0 text-center" style={{ background: "linear-gradient(180deg, #fef0e6 0%, #ffffff 100%)" }}>
        <p className="text-xs font-semibold tracking-widest mb-1.5" style={{ color: "var(--primary)" }}>GOIPRIME</p>
        <h1 className="text-xl font-bold text-gray-900 mb-1 leading-snug">마지막을 기반으로<br />지금을 바로 세우다</h1>
        <p className="text-xs text-gray-500 mb-5">가장 아름다운 기억으로 남을 수 있도록</p>

        {/* 모드 탭 — 선택됨: 초록 텍스트 + 볼드 + 연초록 배경 */}
        <div className="flex w-full bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
          {([
            { key: "preview", lines: ["나의 마지막 순간", "확인하기"] },
            { key: "actual",  lines: ["내 가족의 영정사진", "미리 준비하기"] },
          ] as const).map(({ key, lines }) => (
            <button
              key={key}
              onClick={() => { setMode(key); reset(); }}
              className={`flex-1 py-3.5 text-xs leading-snug transition-all ${
                mode === key
                  ? "bg-[#fef0e6] text-[#f18334] font-bold"
                  : "text-gray-400 font-medium hover:bg-gray-50 hover:text-gray-600"
              }`}
            >
              {lines.map((line, i) => <span key={i} className="block">{line}</span>)}
            </button>
          ))}
        </div>
        <div className="h-5" />
      </div>

      {/* 메인 */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 pb-20">

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {/* ── MODE 1: 나의 마지막 순간 확인하기 ── */}
        {mode === "preview" && (
          <div className="mt-4 flex flex-col gap-4">

            {/* 사진 + 성별 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-bold text-gray-800 text-sm">사진 업로드</h2>
                <p className="text-xs text-gray-400 mt-0.5">정면을 바라보는 얼굴 사진을 올려주세요</p>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <UploadBox previewUrl={previewUrl} isDragging={isDragging} onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave} onClick={() => fileInputRef.current?.click()} onReset={reset} />
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
                <div className="flex gap-2">
                  <GenderButton value="male"   label="남성" selected={gender === "male"}   onSelect={() => setGender("male")} />
                  <GenderButton value="female" label="여성" selected={gender === "female"} onSelect={() => setGender("female")} />
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-600">안경 보존</span>
                  <Toggle on={preserveGlasses} onToggle={() => setPreserveGlasses(v => !v)} />
                </div>
              </div>
            </div>

            {/* 인생 정보 폼 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-bold text-gray-800 text-sm">나에 대해 알려주세요</h2>
                <p className="text-xs text-gray-400 mt-0.5">입력하신 내용으로 추모사를 작성해 드립니다</p>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">이름 <span className="text-red-400">*</span></label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="홍길동" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">현재 나이 <span className="text-red-400">*</span></label>
                    <input type="number" value={currentAge} onChange={e => setCurrentAge(e.target.value)} placeholder="40" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">직업 / 직책</label>
                  <input value={occupation} onChange={e => setOccupation(e.target.value)} placeholder="예) 교사, 의사, 회사원" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">가족 관계</label>
                  <input value={family} onChange={e => setFamily(e.target.value)} placeholder="예) 배우자와 자녀 둘" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">삶에서 가장 소중히 여긴 것</label>
                  <input value={values} onChange={e => setValues(e.target.value)} placeholder="예) 가족, 성실함, 나눔" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">남기고 싶은 말</label>
                  <textarea value={finalMessage} onChange={e => setFinalMessage(e.target.value)} rows={3} placeholder="가족과 주변에 남기고 싶은 메시지를 적어주세요" className={`${inputCls} resize-none`} />
                </div>
                {currentAge && (
                  <p className="text-xs text-gray-400">
                    약 <span className="font-bold text-gray-600">{calcAgeIncrement()}년</span> 후 모습으로 예측합니다
                  </p>
                )}
              </div>
            </div>

            {/* 생성 버튼 */}
            <button onClick={generate} disabled={!canGenerate}
              className={`w-full py-4 rounded-2xl text-sm font-bold transition-all ${canGenerate ? "text-white shadow-md active:scale-[0.99]" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
              style={canGenerate ? { background: "var(--primary)" } : {}}>
              {loading ? "AI가 생성 중입니다… (20~40초)" : !serverReady ? "서버 연결 중…" : !name || !currentAge ? "이름과 나이를 입력해주세요" : "나의 미래 사진과 추모사 생성하기"}
            </button>

          </div>
        )}

        {/* ── MODE 2: 내 가족의 영정사진 미리 준비하기 ── */}
        {mode === "actual" && (
          <div className="mt-4 flex flex-col gap-4">

            {/* 사진 업로드 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-bold text-gray-800 text-sm">사진 업로드</h2>
                <p className="text-xs text-gray-400 mt-0.5">얼굴이 잘 보이는 정면 사진을 올려주세요</p>
              </div>
              <div className="p-4">
                <UploadBox previewUrl={previewUrl} isDragging={isDragging} onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave} onClick={() => fileInputRef.current?.click()} onReset={reset} />
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
              </div>
            </div>

            {/* 설정 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-bold text-gray-800 text-sm">설정</h2>
              </div>
              <div className="p-4 flex flex-col gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">성별</p>
                  <div className="flex gap-2">
                    <GenderButton value="male"   label="남성" selected={gender === "male"}   onSelect={() => setGender("male")} />
                    <GenderButton value="female" label="여성" selected={gender === "female"} onSelect={() => setGender("female")} />
                  </div>
                </div>
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium text-gray-700">안경 보존</p>
                    <p className="text-xs text-gray-400 mt-0.5">원본 사진의 안경을 그대로 유지합니다</p>
                  </div>
                  <Toggle on={preserveGlasses} onToggle={() => setPreserveGlasses(v => !v)} />
                </div>
                <div className="bg-[#fef0e6] rounded-xl p-3.5">
                  <p className="text-xs font-bold mb-1.5" style={{ color: "var(--primary)" }}>이런 분께 추천드립니다</p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    <li>• 미리 영정사진을 준비해 두고 싶은 분</li>
                    <li>• 부모님의 영정사진이 필요한 분</li>
                    <li>• 기존 사진을 영정사진으로 변환하고 싶은 분</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 아련한 메시지 */}
            <div className="rounded-2xl px-5 py-6 border border-gray-100" style={{ background: "#fafafa" }}>
              <p className="text-xs text-gray-400 leading-relaxed">
                이 서비스를 만든 사람은,<br />
                너무 늦은 시점에 가족의 소중함을 알았습니다.
              </p>
              <p className="text-xs text-gray-400 leading-relaxed mt-3">
                타임머신이 있다면 가족의 영상과 목소리를<br />
                기록해두었을 것입니다.<br />
                지금도 평생 후회되는 일입니다.
              </p>
              <p className="text-xs text-gray-500 leading-relaxed mt-3">
                여러분은 후회하지 않으셨으면 합니다.
              </p>
              <p className="text-xs text-gray-600 font-medium leading-relaxed mt-3">
                지금 당장, 가족의 목소리와 영상을 남겨두세요.
              </p>
              <p className="text-sm font-bold mt-4" style={{ color: "#d4520a" }}>고이(간직하세요)</p>
            </div>

            {/* 생성 버튼 */}
            <button onClick={generate} disabled={!canGenerate}
              className={`w-full py-4 rounded-2xl text-sm font-bold transition-all ${canGenerate ? "text-white shadow-md active:scale-[0.99]" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
              style={canGenerate ? { background: "var(--primary)" } : {}}>
              {loading ? "AI가 생성 중입니다… (10~30초)" : !serverReady ? "서버 연결 중…" : "영정사진 생성하기"}
            </button>

          </div>
        )}

        {/* 고이프라임 배너 */}
        <div className="mt-6 rounded-2xl p-5 text-white text-center" style={{ background: "#1a1a1a" }}>
          <p className="text-sm font-bold mb-1">미리 준비하는 장례, 고이프라임</p>
          <p className="text-xs opacity-80 mb-4">영정사진부터 장례 절차까지, 지금 준비하세요</p>
          <a href={GOIPRIME_URL} target="_blank" rel="noreferrer"
            className="inline-block text-sm font-bold px-6 py-2.5 rounded-xl text-white"
            style={{ background: "#d4520a" }}>
            고이프라임 바로가기 →
          </a>
        </div>
      </main>

      {/* 푸터 */}
      <footer className="bg-white border-t border-gray-100 py-5 px-4 text-center">
        <a href={GOIPRIME_URL} target="_blank" rel="noreferrer" className="font-bold text-sm" style={{ color: "var(--primary)" }}>고이프라임</a>
        <p className="text-xs text-gray-400 mt-1">업로드된 사진은 처리 후 즉시 삭제됩니다.</p>
        <p className="text-xs text-gray-400 mt-0.5">24시간 상담 <a href="tel:16669784" className="underline">1666-9784</a></p>
      </footer>

      {/* 다운로드 후 모달 */}
      {showPostDownload && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowPostDownload(false)}>
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-lg shadow-2xl pb-8" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🌿</div>
              <h3 className="font-bold text-gray-800 text-base mb-2">미리 준비하는 장례</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                소중한 분이 가실 때 더 편안하게 배웅할 수 있도록,<br />지금 미리 장례를 준비해 보세요.
              </p>
            </div>
            <a href={GOIPRIME_URL} target="_blank" rel="noreferrer"
              className="block w-full py-3.5 rounded-2xl text-sm font-bold text-white text-center mb-2"
              style={{ background: "var(--primary)" }}>
              고이프라임에서 장례 알아보기
            </a>
            <button onClick={() => setShowPostDownload(false)}
              className="block w-full py-3 rounded-2xl text-sm text-gray-400 text-center">
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 결과 모달 (mode 1) */}
      {showResultModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => { if (!loading) setShowResultModal(false); }}>
          <div className="bg-white rounded-t-3xl w-full max-w-lg shadow-2xl pb-safe flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}>
            {/* 핸들 + 닫기 */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-4" />
              <div className="flex-1" />
              {!loading && (
                <button onClick={() => setShowResultModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-sm">
                  ✕
                </button>
              )}
            </div>

            {/* 생성 중 */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
                <div className="w-14 h-14 border-4 border-gray-200 border-t-[#f18334] rounded-full animate-spin" />
                <p className="text-sm font-bold text-gray-700">AI가 생성하고 있습니다…</p>
                <p className="text-xs text-gray-400 text-center">영정사진과 추모사를 함께 만들고 있어요.<br />20~40초 정도 걸립니다.</p>
              </div>
            )}

            {/* 결과 */}
            {!loading && result && (
              <>
                {/* 탭 (mode 1만) */}
                {mode === "preview" && (
                  <div className="flex mx-5 mb-4 bg-gray-100 rounded-2xl p-1 flex-shrink-0">
                    {(["photo", "eulogy"] as const).map((tab) => (
                      <button key={tab} onClick={() => setResultTab(tab)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${resultTab === tab ? "bg-white text-[#f18334] shadow-sm" : "text-gray-400"}`}>
                        {tab === "photo" ? "영정사진" : "추모사"}
                      </button>
                    ))}
                  </div>
                )}

                <div className="overflow-y-auto flex-1 px-5 pb-8">
                  {/* 영정사진 (mode 1 photo탭 or mode 2 전체) */}
                  {(mode === "actual" || resultTab === "photo") && (
                    <div className="flex flex-col gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`data:image/png;base64,${result.image}`} alt="결과" className="w-full rounded-2xl bg-gray-50 object-contain" />
                      <button onClick={downloadResult} className="w-full py-3.5 rounded-2xl text-sm font-bold text-white" style={{ background: "var(--primary)" }}>
                        다운로드
                      </button>
                      <button onClick={handleShare} className="w-full py-3.5 rounded-2xl text-sm font-bold bg-gray-100 text-gray-700">
                        친지와 공유하기
                      </button>
                      {/* mode 2: 서비스 만든 사람의 한마디 */}
                      {mode === "actual" && (
                        <div className="rounded-2xl px-5 py-6 border border-gray-100 mt-1" style={{ background: "#fafafa" }}>
                          <p className="text-xs text-gray-400 leading-relaxed">
                            이 서비스를 만든 사람은,<br />
                            너무 늦은 시점에 가족의 소중함을 알았습니다.
                          </p>
                          <p className="text-xs text-gray-400 leading-relaxed mt-3">
                            타임머신이 있다면 가족의 영상과 목소리를<br />
                            기록해두었을 것입니다.<br />
                            지금도 평생 후회되는 일입니다.
                          </p>
                          <p className="text-xs text-gray-500 leading-relaxed mt-3">
                            여러분은 후회하지 않으셨으면 합니다.
                          </p>
                          <p className="text-xs text-gray-600 font-medium leading-relaxed mt-3">
                            지금 당장, 가족의 목소리와 영상을 남겨두세요.
                          </p>
                          <p className="text-sm font-bold mt-4" style={{ color: "#d4520a" }}>고이(간직하세요)</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 추모사 탭 (mode 1만) */}
                  {mode === "preview" && resultTab === "eulogy" && (
                    <div className="flex flex-col gap-3">
                      {eulogy ? (
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap leading-7 font-[inherit] bg-[#f8f6f3] rounded-2xl p-5">{eulogy}</pre>
                      ) : (
                        <div className="h-36 bg-gray-50 rounded-2xl flex flex-col items-center justify-center gap-1">
                          <p className="text-sm text-gray-400">추모사를 생성하지 않았습니다</p>
                          <p className="text-xs text-gray-400">이름과 나이를 입력해야 합니다</p>
                        </div>
                      )}
                      {eulogy && (
                        <>
                          <button onClick={copyEulogy} className="w-full py-3.5 rounded-2xl text-sm font-bold bg-gray-100 text-gray-700">
                            {copied ? "✓ 복사됨" : "복사하기"}
                          </button>
                          <button onClick={async () => {
                            try {
                              await navigator.share({ title: "추모사 — 고이프라임", text: eulogy ?? "" });
                            } catch {
                              await navigator.clipboard.writeText(eulogy ?? "");
                              setCopied(true); setTimeout(() => setCopied(false), 2000);
                            }
                          }} className="w-full py-3.5 rounded-2xl text-sm font-bold text-white" style={{ background: "var(--primary)" }}>
                            친지와 공유하기
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* 다음 단계 CTA */}
                  <div className="mt-5 pt-5 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-700 text-center mb-2">이제 실제로 준비하실 수 있습니다</p>
                    <p className="text-xs text-gray-400 text-center leading-relaxed mb-4">
                      오늘 생성한 영정사진과 추모사를,<br />
                      가족이 실제로 사용할 수 있게<br />
                      지금 미리 준비해두면 어떨까요?
                    </p>
                    <a href={GOIPRIME_URL} target="_blank" rel="noreferrer"
                      className="block w-full py-3.5 rounded-2xl text-sm font-bold text-white text-center"
                      style={{ background: "#1a1a1a" }}>
                      고이프라임으로 장례 준비 시작하기 →
                    </a>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 공유 모달 */}
      {showShare && result && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowShare(false)}>
          <div className="bg-white rounded-t-3xl p-5 w-full max-w-lg shadow-2xl pb-8" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
            <h3 className="font-bold text-gray-800 text-sm mb-4 text-center">공유하기</h3>
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                { label: "카카오톡", emoji: "💬", color: "#FEE500", textColor: "#1A1A1A", action: () => { navigator.clipboard.writeText("고이프라임 AI 영정사진 서비스: " + GOIPRIME_URL); alert("링크가 복사되었습니다. 카카오톡에 붙여넣기 하세요."); } },
                { label: "문자", emoji: "📱", color: "#4CAF50", textColor: "#fff", action: () => { window.location.href = `sms:?body=${encodeURIComponent("고이프라임 AI 영정사진: " + GOIPRIME_URL)}`; } },
                { label: "페이스북", emoji: "f", color: "#1877F2", textColor: "#fff", action: () => { window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(GOIPRIME_URL)}`, "_blank"); } },
                { label: "인스타", emoji: "📸", color: "#E1306C", textColor: "#fff", action: () => { downloadResult(); alert("사진을 저장 후 인스타그램 앱에서 공유하세요."); } },
              ].map(({ label, emoji, color, textColor, action }) => (
                <button key={label} onClick={action} className="flex flex-col items-center gap-1.5">
                  <span className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold shadow-sm" style={{ background: color, color: textColor }}>{emoji}</span>
                  <span className="text-xs text-gray-500">{label}</span>
                </button>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-4">
              <button
                onClick={async () => { await navigator.clipboard.writeText(GOIPRIME_URL); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="w-full py-3 rounded-xl text-sm font-medium bg-gray-100 text-gray-700">
                {copied ? "✓ 링크 복사됨" : "🔗 링크 복사"}
              </button>
            </div>
            <button onClick={() => setShowShare(false)} className="mt-2 w-full py-3 rounded-xl text-sm text-gray-400">
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 웰컴 모달 — 고이의 가치관 */}
      {showWelcomeModal && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center px-7" style={{ background: "#0f0f0f" }}>
          <div className="w-full max-w-sm flex flex-col items-center text-center">

            {/* MEMENTO MORI */}
            <p className="text-xs tracking-[0.35em] uppercase mb-10" style={{ color: "#555" }}>Memento Mori</p>

            {/* 스티브 잡스 인용 */}
            <div className="mb-6">
              <p className="text-xl font-bold leading-relaxed text-white">
                "오늘이 마지막 날이라면,<br />지금 하려는 일을 하겠는가?"
              </p>
              <p className="text-xs mt-3" style={{ color: "#555" }}>
                — 스티브 잡스가 매일 아침 거울 앞에서 스스로에게 물었던 질문
              </p>
            </div>

            <div className="w-10 h-px my-6" style={{ background: "#333" }} />

            {/* 철학 */}
            <p className="text-sm leading-8 mb-4" style={{ color: "#888" }}>
              죽음 앞에서는 모든 것이 사라집니다.<br />
              부끄러움도, 두려움도, 남의 기대도.<br />
              <span style={{ color: "#ddd" }}>결국 진짜 중요한 것만 남습니다.</span>
            </p>

            {/* 고이의 메시지 */}
            <p className="text-sm leading-8 mb-10" style={{ color: "#888" }}>
              삶의 방향을 잡기 어렵다면,<br />
              내가 원하는 <span style={{ color: "#ddd" }}>마지막</span>을 먼저 상상해 보세요.<br />
              그 끝에서 바라본 오늘이<br />
              <span style={{ color: "#ddd" }}>진짜 삶을 알려줄 것입니다.</span>
            </p>

            {/* CTA */}
            <button
              onClick={dismissWelcome}
              className="w-full py-4 rounded-2xl text-sm font-bold text-white mb-3"
              style={{ background: "var(--primary)" }}>
              나의 마지막을 상상하며 시작하기
            </button>
            <button onClick={dismissWelcome} className="text-xs py-2" style={{ color: "#444" }}>
              나중에 보기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
