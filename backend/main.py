import io
import base64
import torch
from PIL import Image
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from diffusers import StableDiffusionImg2ImgPipeline

app = FastAPI(title="영정 사진 생성 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 모델 로드 (앱 시작 시 1회)
MODEL_ID = "runwayml/stable-diffusion-v1-5"
pipeline = None


def get_device():
    if torch.backends.mps.is_available():
        return "mps"
    elif torch.cuda.is_available():
        return "cuda"
    return "cpu"


def load_pipeline():
    global pipeline
    device = get_device()
    print(f"[INFO] 디바이스: {device}")
    print("[INFO] 모델 로딩 중... (처음 실행 시 수 분 소요)")

    pipeline = StableDiffusionImg2ImgPipeline.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float16 if device != "cpu" else torch.float32,
        safety_checker=None,
    )
    pipeline = pipeline.to(device)
    pipeline.enable_attention_slicing()
    print("[INFO] 모델 로드 완료!")


@app.on_event("startup")
async def startup_event():
    load_pipeline()


@app.get("/health")
async def health():
    return {"status": "ok", "device": get_device()}


YEONGJEONG_POSITIVE = (
    "professional portrait photo, formal attire, clean white or light gray background, "
    "sharp focus, studio lighting, high quality, photorealistic, "
    "dignified expression, Korean memorial portrait style"
)

YEONGJEONG_NEGATIVE = (
    "blurry, low quality, cartoon, anime, painting, illustration, "
    "busy background, outdoor, casual clothing, distorted face, "
    "extra limbs, watermark, text"
)


@app.post("/generate")
async def generate(
    image: UploadFile = File(...),
    prompt: str = Form(default=""),
    negative_prompt: str = Form(default=""),
    strength: float = Form(default=0.55),
    guidance_scale: float = Form(default=7.5),
    num_inference_steps: int = Form(default=30),
):
    if pipeline is None:
        raise HTTPException(status_code=503, detail="모델이 아직 로딩 중입니다.")

    # 이미지 읽기
    contents = await image.read()
    input_image = Image.open(io.BytesIO(contents)).convert("RGB")

    # 512x512로 리사이즈 (SD v1.5 최적 해상도)
    input_image = input_image.resize((512, 512), Image.LANCZOS)

    # 프롬프트 조합 (사용자 추가 프롬프트 + 기본 영정 스타일)
    final_prompt = f"{prompt}, {YEONGJEONG_POSITIVE}" if prompt else YEONGJEONG_POSITIVE
    final_negative = f"{negative_prompt}, {YEONGJEONG_NEGATIVE}" if negative_prompt else YEONGJEONG_NEGATIVE

    try:
        with torch.no_grad():
            result = pipeline(
                prompt=final_prompt,
                negative_prompt=final_negative,
                image=input_image,
                strength=strength,
                guidance_scale=guidance_scale,
                num_inference_steps=num_inference_steps,
            )

        output_image = result.images[0]

        # base64 인코딩으로 반환
        buffer = io.BytesIO()
        output_image.save(buffer, format="PNG")
        buffer.seek(0)
        img_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

        return JSONResponse({
            "image": img_b64,
            "format": "png",
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
