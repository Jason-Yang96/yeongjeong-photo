"""
영정사진 액자 템플릿 합성 유틸리티

사용법:
  1. 액자+꽃 이미지를 backend/templates/frame.png 로 저장
  2. python template_utils.py  → 초상화 영역 자동 검출 후 frame_config.json 생성
  3. main.py 가 자동으로 템플릿 합성을 수행함
"""

import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

TEMPLATES_DIR = Path(__file__).parent / "templates"
TEMPLATE_PATH = TEMPLATES_DIR / "frame.png"
CONFIG_PATH = TEMPLATES_DIR / "frame_config.json"


def detect_portrait_bounds(template_path: Path) -> dict:
    """
    액자 이미지에서 초상화(내부 사진) 영역을 자동 검출합니다.

    전략: 금색 액자 테두리(H=15~40, S≥150)를 찾고,
    그 안쪽 경계를 초상화 영역으로 판단합니다.
    """
    img_bgr = cv2.imread(str(template_path))
    if img_bgr is None:
        raise FileNotFoundError(f"템플릿 이미지를 찾을 수 없습니다: {template_path}")

    h, w = img_bgr.shape[:2]
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)

    # 금색 액자: H=15~40, S≥150 (황금/앰버 계열)
    gold_mask = cv2.inRange(hsv,
                            np.array([15, 150, 100]),
                            np.array([40, 255, 255]))

    # 노이즈 제거
    k = np.ones((5, 5), np.uint8)
    gold_mask = cv2.morphologyEx(gold_mask, cv2.MORPH_CLOSE, k)

    # 중간 절반 행/열에서 금색 픽셀의 첫/끝 위치 스캔
    mid_y1, mid_y2 = h // 3, 2 * h // 3
    mid_x1, mid_x2 = w // 3, 2 * w // 3

    left_xs, right_xs, top_ys, bot_ys = [], [], [], []

    for y in range(mid_y1, mid_y2):
        cols = np.where(gold_mask[y] > 0)[0]
        if len(cols) > 5:
            left_xs.append(cols[0])
            right_xs.append(cols[-1])

    for x in range(mid_x1, mid_x2):
        rows = np.where(gold_mask[:, x] > 0)[0]
        if len(rows) > 5:
            top_ys.append(rows[0])
            bot_ys.append(rows[-1])

    if not left_xs:
        raise RuntimeError(
            "금색 액자를 검출하지 못했습니다. "
            "frame_config.json 을 수동으로 작성하거나 다른 템플릿을 사용해주세요."
        )

    left_bound = int(np.median(left_xs))
    right_bound = int(np.median(right_xs))
    top_bound = int(np.median(top_ys)) if top_ys else 0
    bot_bound = int(np.median(bot_ys)) if bot_ys else h

    # 금색 프레임 두께만큼 안쪽으로 이동
    frame_thickness = 25
    x1 = max(0, left_bound + frame_thickness)
    y1 = max(0, top_bound + frame_thickness)
    x2 = min(w, right_bound - frame_thickness)
    y2 = min(h, bot_bound - frame_thickness)

    return {
        "portrait_bounds": [x1, y1, x2, y2],
        "template_size": [w, h],
        "detection_area_ratio": round(((x2 - x1) * (y2 - y1)) / (w * h), 3),
    }


def create_frame_mask(template_path: Path, portrait_bounds: list) -> np.ndarray:
    """
    액자 마스크를 생성합니다.
    - 흰색(255): 초상화 영역 (AI 사진으로 채울 곳)
    - 검정(0): 액자/꽃 영역 (템플릿 원본 유지)
    """
    img = cv2.imread(str(template_path))
    h, w = img.shape[:2]
    x1, y1, x2, y2 = portrait_bounds

    mask = np.zeros((h, w), dtype=np.uint8)
    mask[y1:y2, x1:x2] = 255
    return mask


def composite_portrait_into_frame(
    portrait: Image.Image,
    template_path: Path | None = None,
    config_path: Path | None = None,
) -> Image.Image:
    """
    AI 생성 초상화를 영정사진 액자 템플릿에 합성합니다.

    Returns:
        합성된 이미지 (템플릿이 없으면 원본 초상화 반환)
    """
    tpl_path = template_path or TEMPLATE_PATH
    cfg_path = config_path or CONFIG_PATH

    if not tpl_path.exists():
        return portrait  # 템플릿 없으면 그냥 반환

    # 설정 로드 (없으면 자동 검출)
    if cfg_path.exists():
        with open(cfg_path) as f:
            config = json.load(f)
        x1, y1, x2, y2 = config["portrait_bounds"]
    else:
        config = detect_portrait_bounds(tpl_path)
        x1, y1, x2, y2 = config["portrait_bounds"]

    template = Image.open(tpl_path).convert("RGBA")
    tw, th = template.size

    pw = x2 - x1
    ph = y2 - y1

    # 초상화를 초상화 영역 크기에 맞게 리사이즈
    portrait_resized = portrait.resize((pw, ph), Image.LANCZOS).convert("RGBA")

    # 합성: 초상화를 먼저 배경에 놓고, 액자를 위에 올림
    # 액자의 초상화 영역을 투명하게 만들어야 뒤에 초상화가 보임
    output = Image.new("RGBA", (tw, th), (255, 255, 255, 255))
    output.paste(portrait_resized, (x1, y1))

    # 액자 이미지에서 초상화 영역을 투명 처리 후 합성
    frame_with_hole = _cut_portrait_hole(template, x1, y1, x2, y2)
    output.paste(frame_with_hole, (0, 0), frame_with_hole)

    return output.convert("RGB")


def _cut_portrait_hole(frame_rgba: Image.Image, x1: int, y1: int, x2: int, y2: int) -> Image.Image:
    """
    액자 이미지의 초상화 영역을 투명하게 만듭니다.
    이렇게 하면 뒤에 합성된 AI 초상화가 보이게 됩니다.
    """
    frame = frame_rgba.copy()
    frame_arr = np.array(frame)

    # 초상화 영역 알파값을 0(투명)으로 설정
    frame_arr[y1:y2, x1:x2, 3] = 0

    return Image.fromarray(frame_arr)


def calibrate_and_save(template_path: Path | None = None) -> dict:
    """템플릿 자동 검출 후 frame_config.json 저장"""
    tpl_path = template_path or TEMPLATE_PATH
    config = detect_portrait_bounds(tpl_path)

    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

    print(f"[OK] 검출 완료: {config}")
    print(f"[OK] 설정 저장: {CONFIG_PATH}")
    return config


# ── 미리보기 (직접 실행 시) ─────────────────────────────────────────────────
if __name__ == "__main__":
    import sys

    if not TEMPLATE_PATH.exists():
        print(f"[ERROR] 템플릿 이미지를 {TEMPLATE_PATH} 에 저장 후 실행하세요.")
        sys.exit(1)

    config = calibrate_and_save()
    x1, y1, x2, y2 = config["portrait_bounds"]
    w, h = config["template_size"]

    # 검출 결과 시각화
    img = cv2.imread(str(TEMPLATE_PATH))
    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 4)
    preview_path = TEMPLATES_DIR / "calibration_preview.png"
    cv2.imwrite(str(preview_path), img)
    print(f"[OK] 미리보기 저장: {preview_path}")
    print(f"     초상화 영역: ({x1},{y1}) ~ ({x2},{y2})  /  전체: {w}x{h}")
