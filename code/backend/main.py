
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Literal
import os, tempfile, shutil
from transcript_utils import get_youtube_captions, download_youtube_audio, convert_audio_to_wav, transcribe_with_whisper, parse_pdf, parse_txt, parse_srt, parse_vtt
from routes.llm import router as llm_router
from routes.cefr import router as cefr_router

app = FastAPI()

# Global exception handler to ensure CORS headers on errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
    )

# Include LLM routes
app.include_router(llm_router)

# Include CEFR routes
app.include_router(cefr_router)

# CORS - Support multiple origins from environment variable (comma-separated)
# e.g., FRONTEND_ORIGIN="https://ftlgr3.vercel.app,http://localhost:3000"
frontend_origins = os.getenv("FRONTEND_ORIGIN", "*")
if frontend_origins == "*":
    allowed_origins = ["*"]
else:
    allowed_origins = [origin.strip() for origin in frontend_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "ok", "message": "Lecture Companion API"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

class TranscriptSegment(BaseModel):
    start: Optional[float]
    end: Optional[float]
    text: str

class YouTubeTranscriptRequest(BaseModel):
    youtube_url: str
    model_size: Literal["small", "medium"]

class TranscriptResponse(BaseModel):
    source: str
    transcript_text: str
    segments: List[TranscriptSegment]
    file_type: Optional[str] = None

@app.post("/api/transcribe/youtube", response_model=TranscriptResponse)
def transcribe_youtube(req: YouTubeTranscriptRequest):
    # 1. Try YouTube captions
    captions = get_youtube_captions(req.youtube_url)
    if captions:
        return captions
    # 2. Fallback: download audio, convert, run ASR
    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, "audio.%(ext)s")
        try:
            download_youtube_audio(req.youtube_url, audio_path)
            # yt-dlp may use .webm/.m4a, find the file
            found = None
            for ext in ("webm", "m4a", "mp3", "opus"): # common
                p = audio_path.replace("%(ext)s", ext)
                if os.path.exists(p):
                    found = p
                    break
            if not found:
                raise HTTPException(status_code=500, detail="Audio download failed.")
            wav_path = os.path.join(tmpdir, "audio.wav")
            convert_audio_to_wav(found, wav_path)
            result = transcribe_with_whisper(wav_path, req.model_size)
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"ASR error: {str(e)}")

@app.post("/api/transcribe/upload", response_model=TranscriptResponse)
def transcribe_upload(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[-1].lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    try:
        if ext == ".pdf":
            return parse_pdf(tmp_path)
        elif ext == ".txt":
            return parse_txt(tmp_path)
        elif ext == ".srt":
            return parse_srt(tmp_path)
        elif ext == ".vtt":
            return parse_vtt(tmp_path)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File parse error: {str(e)}")
    finally:
        os.remove(tmp_path)
