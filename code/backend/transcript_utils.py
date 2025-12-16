import os
import tempfile
import time
import yt_dlp
import ffmpeg
import httpx
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from faster_whisper import WhisperModel
from PyPDF2 import PdfReader
from typing import List, Optional
import srt, webvtt
import gc

# Global Whisper model cache to prevent repeated loading
_whisper_models = {}

def get_whisper_model(model_size: str):
    """Load and cache Whisper model to avoid repeated downloads."""
    global _whisper_models
    
    if model_size not in _whisper_models:
        print(f"Loading Whisper model: {model_size}...")
        _whisper_models[model_size] = WhisperModel(
            model_size, 
            device="cpu", 
            compute_type="int8",
            download_root=os.getenv("WHISPER_MODEL_PATH", None)
        )
        print(f"✓ Whisper {model_size} model loaded and cached")
    
    return _whisper_models[model_size]

# --- YouTube transcript/caption extraction ---
def extract_youtube_id(url: str) -> Optional[str]:
    import re
    match = re.search(r"(?:v=|youtu.be/)([\w-]{11})", url)
    return match.group(1) if match else None

def get_youtube_captions_with_api(video_id: str, api_key: str):
    """
    Fetch captions using YouTube Data API v3.
    This is more reliable than scraping methods.
    """
    try:
        # Build YouTube API client
        youtube = build('youtube', 'v3', developerKey=api_key)
        
        # Get caption tracks for the video
        captions_response = youtube.captions().list(
            part='snippet',
            videoId=video_id
        ).execute()
        
        caption_tracks = captions_response.get('items', [])
        
        # Find English caption track
        english_track = None
        for track in caption_tracks:
            snippet = track.get('snippet', {})
            if snippet.get('language') == 'en':
                english_track = track
                break
        
        if not english_track:
            print(f"[YouTube API] No English captions found for video {video_id}")
            return None
        
        caption_id = english_track['id']
        
        # Download the caption (Note: This requires OAuth2 for private videos)
        # For public videos with auto-generated or manual captions, 
        # we'll fall back to youtube-transcript-api which doesn't need OAuth
        print(f"[YouTube API] Found English caption track: {caption_id}")
        
        # Use youtube-transcript-api to actually download the transcript
        # (YouTube API v3 requires OAuth for caption download)
        ytt_api = YouTubeTranscriptApi()
        transcript = ytt_api.fetch(video_id, languages=["en"])
        # New API returns FetchedTranscript object, use to_raw_data() for dict format
        raw_data = transcript.to_raw_data()
        segments = [
            {"start": seg["start"], "end": seg["start"] + seg["duration"], "text": seg["text"]}
            for seg in raw_data
        ]
        text = " ".join(seg["text"] for seg in segments)
        
        return {
            "source": "youtube_api_captions",
            "transcript_text": text,
            "segments": segments
        }
        
    except HttpError as e:
        error_reason = e.error_details[0].get('reason') if e.error_details else 'unknown'
        print(f"[YouTube API] HttpError: {error_reason} - {str(e)}")
        return None
    except Exception as e:
        print(f"[YouTube API] Error fetching captions: {str(e)}")
        return None

def get_youtube_captions_with_supadata(youtube_url: str, api_key: str):
    """
    Fetch YouTube captions using Supadata.ai API.
    This works reliably from cloud environments (no IP blocking issues).
    """
    try:
        print(f"[Supadata] Fetching transcript for: {youtube_url}")
        
        # Make request to Supadata API
        response = httpx.get(
            "https://api.supadata.ai/v1/transcript",
            params={
                "url": youtube_url,
                "lang": "en",
                "text": "false",  # Get timestamped chunks
                "mode": "auto"  # Try native first, fallback to AI generation
            },
            headers={
                "x-api-key": api_key
            },
            timeout=60.0
        )
        
        # Handle async job response (HTTP 202)
        if response.status_code == 202:
            job_data = response.json()
            job_id = job_data.get("jobId")
            print(f"[Supadata] Got async job ID: {job_id}, polling for results...")
            
            # Poll for results (max 2 minutes)
            for _ in range(24):  # 24 * 5s = 120s
                time.sleep(5)
                job_response = httpx.get(
                    f"https://api.supadata.ai/v1/transcript/{job_id}",
                    headers={"x-api-key": api_key},
                    timeout=30.0
                )
                job_result = job_response.json()
                status = job_result.get("status")
                
                if status == "completed":
                    print(f"[Supadata] Job completed successfully")
                    return _parse_supadata_response(job_result)
                elif status == "failed":
                    print(f"[Supadata] Job failed: {job_result.get('error')}")
                    return None
                else:
                    print(f"[Supadata] Job status: {status}")
            
            print("[Supadata] Job timed out after 2 minutes")
            return None
        
        # Handle immediate response (HTTP 200)
        if response.status_code == 200:
            print("[Supadata] ✓ Got transcript successfully")
            return _parse_supadata_response(response.json())
        
        # Handle errors
        print(f"[Supadata] API error: {response.status_code} - {response.text}")
        return None
        
    except Exception as e:
        print(f"[Supadata] Error: {str(e)}")
        return None

def _parse_supadata_response(data: dict):
    """
    Parse Supadata API response into our standard format.
    """
    content = data.get("content")
    
    # Handle timestamped chunks (when text=false)
    if isinstance(content, list):
        segments = [
            {
                "start": chunk.get("offset", 0) / 1000,  # Convert ms to seconds
                "end": (chunk.get("offset", 0) + chunk.get("duration", 0)) / 1000,
                "text": chunk.get("text", "")
            }
            for chunk in content
        ]
        text = " ".join(chunk.get("text", "") for chunk in content)
    else:
        # Handle plain text response (when text=true)
        text = content or ""
        segments = [{"start": 0, "end": 0, "text": text}]
    
    return {
        "source": "supadata",
        "transcript_text": text,
        "segments": segments
    }

def get_youtube_captions(youtube_url: str):
    """
    Fetch YouTube captions with multiple fallback strategies:
    1. Supadata.ai API (most reliable for cloud deployments)
    2. YouTube Data API v3 (checks if captions exist)
    3. youtube-transcript-api (direct caption fetch - may be blocked on cloud)
    4. Return None to trigger audio download + ASR fallback
    """
    video_id = extract_youtube_id(youtube_url)
    if not video_id:
        print("[Captions] Invalid YouTube URL")
        return None
    
    # Strategy 1: Try Supadata.ai API first (works best on cloud deployments)
    supadata_api_key = os.getenv("SUPADATA_API_KEY")
    if supadata_api_key:
        print(f"[Captions] Attempting Supadata API for video {video_id}")
        result = get_youtube_captions_with_supadata(youtube_url, supadata_api_key)
        if result:
            return result
    else:
        print("[Captions] No SUPADATA_API_KEY found in environment")
    
    # Strategy 2: Try YouTube Data API v3 (if API key is available)
    youtube_api_key = os.getenv("YOUTUBE_API_KEY")
    if youtube_api_key:
        print(f"[Captions] Attempting YouTube API for video {video_id}")
        result = get_youtube_captions_with_api(video_id, youtube_api_key)
        if result:
            return result
    else:
        print("[Captions] No YOUTUBE_API_KEY found in environment")
    
    # Strategy 3: Fallback to youtube-transcript-api (direct scraping - may be blocked)
    try:
        print(f"[Captions] Attempting youtube-transcript-api for video {video_id}")
        ytt_api = YouTubeTranscriptApi()
        transcript = ytt_api.fetch(video_id, languages=["en"])
        # New API returns FetchedTranscript object, use to_raw_data() for dict format
        raw_data = transcript.to_raw_data()
        segments = [
            {"start": seg["start"], "end": seg["start"] + seg["duration"], "text": seg["text"]}
            for seg in raw_data
        ]
        text = " ".join(seg["text"] for seg in segments)
        return {
            "source": "youtube_transcript_api",
            "transcript_text": text,
            "segments": segments
        }
    except (TranscriptsDisabled, NoTranscriptFound) as e:
        print(f"[Captions] No transcript available: {str(e)}")
        return None
    except Exception as e:
        print(f"[Captions] youtube-transcript-api failed: {str(e)}")
        return None

# --- Audio download and ASR ---
def download_youtube_audio(youtube_url: str, out_path: str):
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': out_path,
        'quiet': False,  # Enable logging to debug issues
        'noplaylist': True,
        'nocheckcertificate': True,
        'no_warnings': False,
        'extract_flat': False,
        # Add user agent to avoid bot detection
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        # Reduce memory usage and improve reliability
        'socket_timeout': 30,
        'retries': 5,
        'fragment_retries': 5,
        # Prefer formats that don't require additional processing
        'prefer_free_formats': True,
        # Skip unavailable fragments
        'skip_unavailable_fragments': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([youtube_url])

def convert_audio_to_wav(src_path: str, dst_path: str):
    (
        ffmpeg.input(src_path)
        .output(dst_path, ac=1, ar=16000, format='wav')
        .overwrite_output()
        .run(quiet=True)
    )

def transcribe_with_whisper(audio_path: str, model_size: str):
    """Transcribe audio using cached Whisper model."""
    try:
        model = get_whisper_model(model_size)
        segments, _ = model.transcribe(audio_path, language="en")
        segs = []
        texts = []
        for seg in segments:
            segs.append({"start": seg.start, "end": seg.end, "text": seg.text})
            texts.append(seg.text)
        
        result = {"source": "asr", "transcript_text": " ".join(texts), "segments": segs}
        
        # Force garbage collection after transcription
        gc.collect()
        
        return result
    except Exception as e:
        print(f"Transcription error: {e}")
        raise

# --- File upload handling ---
def parse_pdf(file_path: str):
    reader = PdfReader(file_path)
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    return {"source": "uploaded_file", "file_type": "pdf", "transcript_text": text, "segments": [{"start": None, "end": None, "text": text}]}

def parse_txt(file_path: str):
    with open(file_path, encoding="utf-8") as f:
        text = f.read()
    return {"source": "uploaded_file", "file_type": "txt", "transcript_text": text, "segments": [{"start": None, "end": None, "text": text}]}

def parse_srt(file_path: str):
    with open(file_path, encoding="utf-8") as f:
        subs = list(srt.parse(f.read()))
    segments = [{"start": sub.start.total_seconds(), "end": sub.end.total_seconds(), "text": sub.content} for sub in subs]
    text = " ".join(sub.content for sub in subs)
    return {"source": "uploaded_file", "file_type": "srt", "transcript_text": text, "segments": segments}

def parse_vtt(file_path: str):
    vtt = webvtt.read(file_path)
    segments = [{"start": float(caption.start_in_seconds), "end": float(caption.end_in_seconds), "text": caption.text} for caption in vtt]
    text = " ".join(caption.text for caption in vtt)
    return {"source": "uploaded_file", "file_type": "vtt", "transcript_text": text, "segments": segments}
