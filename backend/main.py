import io
import os
import base64
import fal_client
import httpx
from PIL import Image
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from template_utils import composite_portrait_into_frame, TEMPLATE_PATH

os.environ["FAL_KEY"] = "15f2a001-47c9-407a-92af-5f8fd30861fa:d6b401f6fee74d457311d777a9f7dd9e"

app = FastAPI(title="영정 사진 생성 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 프롬프트 ───────────────────────────────────────────────────────────────
# Flux Kontext Pro: 입력 이미지 얼굴 정체성 보존 + 스타일 변환
# 사실성 극대화 — AI 생성 느낌 최소화

_PROMPT_BASE = {
    "male": (
        "Transform this photo into a formal Korean memorial portrait (영정사진). "
        "Strictly preserve the subject's exact facial identity: face shape, eye shape, "
        "nose structure, lip shape, skin tone — do not alter the face at all. "
        "Replace clothing with a dark charcoal business suit jacket, "
        "white dress shirt, and dark necktie. "
        "Replace background with a pure white seamless studio backdrop, "
        "no background shadows, no gradients. "
        "Composition: upper body portrait, head and shoulders visible, "
        "subject facing directly forward, neutral dignified closed-mouth expression, "
        "eyes looking straight into camera. "
        "Lighting: soft professional studio strobes with even frontal illumination, "
        "subtle natural catchlight in both eyes. "
        "Camera: 85mm portrait lens, full-frame sensor, f/2.8, sharp focus on eyes. "
        "Render realistic skin texture with visible pores, "
        "individual hair strands, natural micro-expressions — "
        "no digital smoothing, no airbrushing, no plastic skin. "
        "The final result must look indistinguishable from an actual studio photograph."
    ),
    "female": (
        "Transform this photo into a formal Korean memorial portrait (영정사진). "
        "Strictly preserve the subject's exact facial identity: face shape, eye shape, "
        "nose structure, lip shape, skin tone — do not alter the face at all. "
        "Replace clothing with a formal dark jacket and white blouse. "
        "Replace background with a pure white seamless studio backdrop, "
        "no background shadows, no gradients. "
        "Composition: upper body portrait, head and shoulders visible, "
        "subject facing directly forward, neutral dignified closed-mouth expression, "
        "eyes looking straight into camera. "
        "Lighting: soft professional studio strobes with even frontal illumination, "
        "subtle natural catchlight in both eyes. "
        "Camera: 85mm portrait lens, full-frame sensor, f/2.8, sharp focus on eyes. "
        "Render realistic skin texture with visible pores, "
        "individual hair strands, natural micro-expressions — "
        "no digital smoothing, no airbrushing, no plastic skin. "
        "The final result must look indistinguishable from an actual studio photograph."
    ),
}

_AGING_SUFFIX = (
    " Also age this person's appearance by approximately {n} years. "
    "Add photorealistic aging details to the face only: "
    "deep forehead wrinkles, crow's feet at eye corners, nasolabial folds, "
    "slight skin sagging along the jawline and cheeks, age spots on skin. "
    "Hair transitions to salt-and-pepper or grey. "
    "All aging must appear as if captured in a real photograph — "
    "not digitally processed or filtered. "
    "Keep the suit, necktie, and white background unchanged."
)

_GLASSES_CLAUSE = (
    " The subject is wearing glasses. "
    "Preserve the exact glasses from the original photo: "
    "keep the identical frame shape, frame color, lens shape, and positioning on the face. "
    "Do not remove, replace, or alter the glasses in any way."
)


def _build_prompt(gender: str, age_increment: int, preserve_glasses: bool) -> str:
    base = _PROMPT_BASE.get(gender, _PROMPT_BASE["male"])
    if preserve_glasses:
        base += _GLASSES_CLAUSE
    if age_increment > 0:
        base += _AGING_SUFFIX.format(n=age_increment)
    return base


def _square_crop_from_top(img: Image.Image) -> Image.Image:
    """최 상단 기준, width에 맞춰 정사각형으로 크롭."""
    w, h = img.size
    if w == h:
        return img
    if h >= w:
        # 세로가 더 긴 경우: 상단부터 w×w 크롭
        return img.crop((0, 0, w, w))
    else:
        # 가로가 더 긴 경우: 가로 중앙 기준 h×h 크롭
        x = (w - h) // 2
        return img.crop((x, 0, x + h, h))


# ── 엔드포인트 ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "device": "cloud (fal.ai)",
        "model_ready": True,
        "model_loading": False,
        "model_error": None,
    }


@app.get("/template/status")
async def template_status():
    return {
        "template_available": TEMPLATE_PATH.exists(),
        "template_path": str(TEMPLATE_PATH),
    }


@app.post("/generate")
async def generate(
    image: UploadFile = File(...),
    gender: str = Form(default="male"),
    use_template: bool = Form(default=True),
    age_increment: int = Form(default=0),
    preserve_glasses: bool = Form(default=False),
):
    contents = await image.read()

    # 이미지 유효성 검사
    try:
        pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="이미지를 읽을 수 없습니다.")

    # 정사각형 크롭 (최 상단 기준, width 우선)
    pil_img = _square_crop_from_top(pil_img)

    # fal.ai 스토리지에 이미지 업로드 → URL 획득
    try:
        image_url = await fal_client.upload_image_async(pil_img, format="jpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"이미지 업로드 실패: {e}")

    prompt = _build_prompt(gender, age_increment, preserve_glasses)
    print(f"[INFO] fal.ai 호출 — gender={gender}, age_increment={age_increment}, preserve_glasses={preserve_glasses}")

    # Flux Kontext Pro 호출
    try:
        result = await fal_client.run_async(
            "fal-ai/flux-pro/kontext",
            arguments={
                "prompt": prompt,
                "image_url": image_url,
                "guidance_scale": 3.5,
                "num_inference_steps": 28,
                "output_format": "jpeg",
                "safety_tolerance": "5",
            },
        )
    except Exception as e:
        print(f"[ERROR] fal.ai 호출 실패: {e}")
        raise HTTPException(status_code=500, detail=f"생성 실패: {e}")

    result_url = result["images"][0]["url"]
    print(f"[INFO] 결과 URL: {result_url}")

    # 결과 이미지 다운로드
    async with httpx.AsyncClient(timeout=60) as client:
        img_resp = await client.get(result_url)
    result_image = Image.open(io.BytesIO(img_resp.content)).convert("RGB")

    # 템플릿 액자 합성
    template_used = False
    if use_template:
        try:
            composited = composite_portrait_into_frame(result_image)
            if composited is not result_image:
                result_image = composited
                template_used = True
        except Exception as e:
            print(f"[WARN] 템플릿 합성 실패: {e}")

    buffer = io.BytesIO()
    result_image.save(buffer, format="PNG")
    img_b64 = base64.b64encode(buffer.getvalue()).decode()

    return JSONResponse({
        "image": img_b64,
        "format": "png",
        "model": "flux-pro-kontext",
        "template_applied": template_used,
        "age_increment": age_increment,
    })
