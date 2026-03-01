#!/usr/bin/env python3
"""
CivitAI 모델 다운로드 스크립트
사용법: python download_model.py <model_version_id> --token YOUR_API_TOKEN

추천 모델 (모두 SD 1.5 기반, img2img 호환):
  MajicMIX Realistic v7  : 버전 ID 176425  (사실적 한국인 얼굴)
  ChilloutMix            : 버전 ID 11745   (동아시아 특화)
  DreamShaper v8         : 버전 ID 128713  (범용 고품질)

예시:
  python download_model.py 176425 --token abc123xyz
"""

import sys
import argparse
import subprocess
from pathlib import Path

CIVITAI_DOWNLOAD_URL = "https://civitai.com/api/download/models/{version_id}"
MODELS_DIR = Path(__file__).parent / "models"


def download(version_id, token=None):
    MODELS_DIR.mkdir(exist_ok=True)

    url = CIVITAI_DOWNLOAD_URL.format(version_id=version_id)

    # 파일명 확인 (curl HEAD)
    print(f"[INFO] 다운로드 URL: {url}")
    print("[INFO] 파일명 확인 중…")

    head_cmd = [
        "curl", "-sI", "-L",
        "-H", f"Authorization: Bearer {token}" if token else "User-Agent: downloader",
        url,
    ]
    if token:
        head_cmd = ["curl", "-sI", "-L", "-H", f"Authorization: Bearer {token}", url]
    else:
        head_cmd = ["curl", "-sI", "-L", url]

    result = subprocess.run(head_cmd, capture_output=True, text=True)
    filename = f"civitai_{version_id}.safetensors"
    for line in result.stdout.splitlines():
        if line.lower().startswith("content-disposition:"):
            if "filename=" in line:
                filename = line.split("filename=")[-1].strip().strip('"').strip("'")
                break

    dest = MODELS_DIR / filename
    if dest.exists():
        print(f"[INFO] 이미 존재함: {dest}")
        return

    print(f"[INFO] 파일명: {filename}")
    print(f"[INFO] 저장 경로: {dest}")
    print("[INFO] 다운로드 시작… (약 2~6 GB, 수 분 소요)\n")

    # curl로 다운로드 (진행률 표시 포함)
    dl_cmd = [
        "curl", "-L", "--progress-bar",
        "-o", str(dest),
    ]
    if token:
        dl_cmd += ["-H", f"Authorization: Bearer {token}"]
    dl_cmd.append(url)

    try:
        proc = subprocess.run(dl_cmd)
        if proc.returncode != 0:
            if dest.exists():
                dest.unlink()
            print("[ERROR] 다운로드 실패")
            sys.exit(1)
        print(f"\n[OK] 다운로드 완료: {dest.name}")
        print(f"[INFO] 백엔드를 재시작하면 모델 선택 목록에 '{dest.name}' 이 나타납니다.")
    except Exception as exc:
        if dest.exists():
            dest.unlink()
        print(f"\n[ERROR] {exc}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="CivitAI 모델 다운로드")
    parser.add_argument("version_id", type=int, help="CivitAI 모델 버전 ID")
    parser.add_argument("--token", default=None, help="CivitAI API 토큰")
    args = parser.parse_args()

    download(args.version_id, args.token)


if __name__ == "__main__":
    main()
