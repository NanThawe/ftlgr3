
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Literal
import os, tempfile, shutil
from dotenv import load_dotenv
from transcript_utils import get_youtube_captions, download_youtube_audio, convert_audio_to_wav, transcribe_with_whisper, parse_pdf, parse_txt, parse_srt, parse_vtt
from routes.llm import router as llm_router
from routes.cefr import router as cefr_router

# Load environment variables
load_dotenv()

app = FastAPI()

# Global exception handler to ensure CORS headers on errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Get origin from request
    origin = request.headers.get("origin")
    
    # Set up CORS headers for error responses
    headers = {}
    if origin:
        # Check if origin is allowed
        frontend_origins = os.getenv("FRONTEND_ORIGIN", "")
        if not frontend_origins:
            allowed_origins = [
                "https://ftlgr3.vercel.app",
                "http://localhost:3000",
                "http://localhost:3001",
            ]
        else:
            allowed_origins = [o.strip() for o in frontend_origins.split(",")]
        
        if origin in allowed_origins or "*" in allowed_origins:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Methods"] = "*"
            headers["Access-Control-Allow-Headers"] = "*"
    
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
        headers=headers,
    )

# Include LLM routes
app.include_router(llm_router)

# Include CEFR routes
app.include_router(cefr_router)

# CORS - Support multiple origins from environment variable (comma-separated)
# e.g., FRONTEND_ORIGIN="https://ftlgr3.vercel.app,http://localhost:3000"
frontend_origins = os.getenv("FRONTEND_ORIGIN", "")
if not frontend_origins:
    # Default to common origins if not specified
    allowed_origins = [
        "https://ftlgr3.vercel.app",
        "http://localhost:3000",
        "http://localhost:3001",
    ]
else:
    allowed_origins = [origin.strip() for origin in frontend_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,  # Changed to False to allow multiple origins
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
    import gc
    print(f"[Transcribe] Processing YouTube URL: {req.youtube_url}")
    
    # 1. Try YouTube captions
    try:
        captions = get_youtube_captions(req.youtube_url)
        if captions:
            print("[Transcribe] ✓ Successfully extracted YouTube captions")
            return captions
    except Exception as e:
        print(f"[Transcribe] YouTube captions failed: {str(e)}")
    
    # 2. Fallback: download audio, convert, run ASR
    print("[Transcribe] Falling back to audio download + ASR")
    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, "audio.%(ext)s")
        try:
            print("[Transcribe] Downloading audio...")
            download_youtube_audio(req.youtube_url, audio_path)
            
            # yt-dlp may use .webm/.m4a, find the file
            found = None
            for ext in ("webm", "m4a", "mp3", "opus"): # common
                p = audio_path.replace("%(ext)s", ext)
                if os.path.exists(p):
                    found = p
                    print(f"[Transcribe] Found audio file: {ext}")
                    break
            
            if not found:
                print("[Transcribe] ERROR: No audio file found after download")
                raise HTTPException(
                    status_code=500, 
                    detail="Audio download failed. The video may be restricted or unavailable."
                )
            
            print("[Transcribe] Converting audio to WAV...")
            wav_path = os.path.join(tmpdir, "audio.wav")
            convert_audio_to_wav(found, wav_path)
            
            print(f"[Transcribe] Running Whisper ASR (model: {req.model_size})...")
            result = transcribe_with_whisper(wav_path, req.model_size)
            
            # Force cleanup
            gc.collect()
            
            print("[Transcribe] ✓ Transcription completed successfully")
            return result
            
        except HTTPException:
            gc.collect()
            raise
        except Exception as e:
            gc.collect()
            error_msg = str(e)
            print(f"[Transcribe] ERROR: {error_msg}")
            
            # Provide more helpful error messages
            if "Sign in to confirm you're not a bot" in error_msg or "DownloadError" in error_msg:
                raise HTTPException(
                    status_code=503,
                    detail="YouTube is blocking automated access. Please try again in a few minutes or try a different video."
                )
            elif "Video unavailable" in error_msg:
                raise HTTPException(
                    status_code=404,
                    detail="This video is unavailable or private."
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Transcription error: {error_msg}"
                )

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
