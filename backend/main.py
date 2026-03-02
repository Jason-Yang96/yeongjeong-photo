import io
import os
import base64
import fal_client
import httpx
from groq import Groq
from dotenv import load_dotenv
from PIL import Image
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from template_utils import composite_portrait_into_frame, TEMPLATE_PATH

load_dotenv()  # backend/.env 로드

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


# ── 추모사: 템플릿 폴백 ────────────────────────────────────────────────────
def _build_eulogy_template(
    name: str, current_age: int,
    occupation: str, family: str, values: str, final_message: str,
) -> str:
    parts: list[str] = []

    parts.append(f"{name}님의 영전에")
    parts.append("")
    parts.append("삼가 고개를 숙입니다.")
    parts.append("")
    parts.append(
        f"{name}님은 {current_age}년의 생애를 통해 우리 곁에서 따뜻한 빛이 되어주셨습니다."
        f" 그분의 삶은 언제나 사랑과 헌신으로 가득했습니다."
    )

    if occupation:
        parts.append(
            f"{occupation}으로서 맡은 바 소임을 다하시며 주변에 귀감이 되셨고, "
            f"맡은 일에 언제나 최선을 다하셨습니다."
        )

    parts.append("")
    parts.append(
        f"언제나 주변 사람들과 함께하며 살아가셨고, 그 넉넉한 품과 따뜻한 마음으로 "
        f"많은 이들에게 힘이 되어주셨습니다."
    )

    if family:
        parts.append(
            f"{family}과(와) 함께한 삶 속에서 {name}님은 사랑과 헌신으로 "
            f"가족의 중심이 되어주셨습니다."
        )

    parts.append("")

    if values:
        parts.append(
            f"평생 '{values}'을(를) 소중히 여기시며 살아오신 {name}님의 가르침은 "
            f"우리 모두에게 깊은 울림으로 남을 것입니다."
        )
        parts.append("")

    parts.append(
        f"{name}님은 한평생 존경과 사랑을 받으며 살아오셨고, "
        f"이제 그 긴 여정을 편안히 마무리하셨습니다."
    )
    parts.append(
        f"삶의 마지막 순간까지 주변을 배려하셨던 {name}님의 따뜻한 마음은 "
        f"우리 가슴속에 영원히 살아 숨쉴 것입니다."
    )

    if final_message:
        parts.append("")
        parts.append(f'"{final_message}"')
        parts.append(f"— {name}님이 남기신 말씀")

    parts.append("")
    parts.append("부디 고이 잠드소서.")
    parts.append("이제는 편안한 곳에서 영원한 안식을 누리시길 바랍니다.")
    parts.append("")
    parts.append("삼가 고인의 명복을 빕니다.")

    return "\n".join(parts)


# ── 추모사: Groq API ───────────────────────────────────────────────────────
async def _generate_eulogy_with_groq(
    name: str, current_age: int, gender: str,
    occupation: str, family: str, values: str, final_message: str,
) -> str:
    gender_kor = "남성" if gender == "male" else "여성"

    details = f"이름: {name}\n나이: {current_age}세\n성별: {gender_kor}"
    if occupation:
        details += f"\n직업/직책: {occupation}"
    if family:
        details += f"\n가족 관계: {family}"
    if values:
        details += f"\n삶에서 소중히 여긴 것: {values}"
    if final_message:
        details += f"\n남기고 싶은 말: {final_message}"

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": (
                    "당신은 한국의 장례식 추모사를 전문적으로 작성하는 작가입니다. "
                    "출력 언어 규칙 (절대 위반 금지): "
                    "오직 한글(가-힣), 숫자(0-9), 한국어 문장 부호(. , ! ? … ' \" ( ) \n)만 사용하세요. "
                    "다음 문자들은 절대 사용 금지입니다: 한자(예: 們 愛 爱 支持 熱情 先生 前 的 等), "
                    "영어 알파벳, 일본어 히라가나·가타카나. "
                    "주어진 정보를 바탕으로 진심 어린 한국어 추모사를 작성해주세요. "
                    "형식: 단락 구분이 있는 산문체. 600~900자 분량. "
                    "첫 줄은 고인의 이름으로 시작하고, 마지막은 명복을 비는 문장으로 마무리하세요. "
                    "감동적이고 인간적이며, 클리셰를 피하고 고인의 삶을 구체적으로 담아주세요. "
                    "따뜻하고 자연스러운 현대 한국어로 작성하세요."
                ),
            },
            {
                "role": "user",
                "content": f"다음 정보를 바탕으로 추모사를 작성해주세요:\n\n{details}",
            },
        ],
        max_tokens=1024,
    )
    import re
    text = response.choices[0].message.content
    # CJK 한자 범위 제거 (한글은 유지, 한자·중국어·일본어만 제거)
    text = re.sub(r"[\u2E80-\u2EFF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]", "", text)
    # 영어 알파벳 제거 (숫자는 유지)
    text = re.sub(r"[A-Za-z]+", "", text)
    # 연속 공백 정리
    text = re.sub(r" {2,}", " ", text).strip()
    return text


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


@app.post("/generate-eulogy")
async def generate_eulogy(
    name: str = Form(...),
    current_age: int = Form(...),
    gender: str = Form(default="male"),
    occupation: str = Form(default=""),
    family: str = Form(default=""),
    values: str = Form(default=""),
    final_message: str = Form(default=""),
):
    # Claude API 시도 → 실패 시 템플릿 폴백
    try:
        eulogy = await _generate_eulogy_with_groq(
            name, current_age, gender, occupation, family, values, final_message
        )
        print("[INFO] Groq API로 추모사 생성 성공")
    except Exception as e:
        print(f"[WARN] Claude API 추모사 생성 실패, 템플릿 폴백: {e}")
        eulogy = _build_eulogy_template(
            name, current_age, occupation, family, values, final_message
        )
    return JSONResponse({"eulogy": eulogy})


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
