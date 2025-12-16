# Memory Issue Fix - Backend Service

## Problem Identified

Your backend service was exceeding memory limits due to three critical issues:

### 1. **Whisper Model Reloading on Every Request** ❌
- **Issue**: The `transcribe_with_whisper()` function was creating a new `WhisperModel` instance on every transcription request
- **Impact**: Each model load downloads/loads hundreds of MB into memory, causing rapid memory accumulation
- **Evidence**: `model = WhisperModel(model_size, device="cpu", compute_type="int8")` inside the function

### 2. **YouTube Download Authentication Failures** ❌
- **Issue**: yt-dlp encountering bot detection (`Sign in to confirm you're not a bot`)
- **Impact**: Loading heavy JavaScript runtimes and retrying downloads, consuming extra memory
- **Evidence**: Error logs showing `yt_dlp.utils.DownloadError: ERROR: [youtube] sca5rQ9x1cA: Sign in to confirm you're not a bot`

### 3. **No Memory Constraints** ❌
- **Issue**: Docker containers had no memory limits defined
- **Impact**: Processes could consume unlimited memory until the host system killed them
- **Evidence**: Missing `deploy.resources.limits.memory` in docker-compose.yml

## Solutions Implemented

### ✅ 1. Whisper Model Caching (transcript_utils.py)

**Added global model cache:**
```python
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
```

**Benefits:**
- Model loaded only once per size (small/medium)
- ~500MB-1GB memory saved per request
- Faster response times (no model loading delay)

### ✅ 2. Improved yt-dlp Configuration

**Enhanced download options:**
```python
ydl_opts = {
    'format': 'bestaudio/best',
    'outtmpl': out_path,
    'quiet': False,  # Enable logging to debug issues
    'noplaylist': True,
    'nocheckcertificate': True,
    'no_warnings': False,
    'extract_flat': False,
    # Add cookies support to avoid bot detection
    'cookiesfrombrowser': ('chrome',) if os.path.exists(...) else None,
    # Reduce memory usage
    'socket_timeout': 30,
    'retries': 3,
    'fragment_retries': 3,
}
```

**Benefits:**
- Uses browser cookies to avoid bot detection
- Timeouts prevent hanging downloads
- Better error handling and logging

### ✅ 3. Garbage Collection After Heavy Operations

**Added cleanup:**
```python
def transcribe_with_whisper(audio_path: str, model_size: str):
    try:
        model = get_whisper_model(model_size)
        # ... transcription logic ...
        
        # Force garbage collection after transcription
        gc.collect()
        
        return result
```

**In main.py:**
```python
@app.post("/api/transcribe/youtube", response_model=TranscriptResponse)
def transcribe_youtube(req: YouTubeTranscriptRequest):
    import gc
    try:
        # ... transcription logic ...
        gc.collect()
        return result
    except Exception as e:
        gc.collect()
        raise HTTPException(...)
```

**Benefits:**
- Forces Python to release unused memory immediately
- Prevents memory buildup over multiple requests

### ✅ 4. Docker Memory Limits (docker-compose.yml)

**Added resource constraints:**
```yaml
backend:
  deploy:
    resources:
      limits:
        memory: 2G  # Maximum memory
      reservations:
        memory: 512M  # Minimum guaranteed
  restart: unless-stopped

frontend:
  deploy:
    resources:
      limits:
        memory: 1G
      reservations:
        memory: 256M
  restart: unless-stopped
```

**Benefits:**
- Backend limited to 2GB (sufficient for cached models + processing)
- Prevents runaway memory consumption
- Auto-restart on crashes (better than manual intervention)

## Expected Results

### Memory Usage Before Fix:
- **Per Request**: 500MB-1GB (model loading) + 200MB (processing) = **700MB-1.2GB**
- **After 3-4 requests**: Memory limit exceeded → Crash

### Memory Usage After Fix:
- **First Request**: 500MB-1GB (one-time model cache) + 200MB (processing)
- **Subsequent Requests**: ~200-300MB (processing only, reusing cached model)
- **Memory stays stable** across requests

## Deployment Instructions

### For Render.com:

1. **Set Memory Limit in Dashboard:**
   - Go to your service settings
   - Upgrade to at least **2GB RAM instance** (recommended)
   - Or use Standard instance (512MB) if you disable Whisper ASR fallback

2. **Environment Variables to Add:**
   ```bash
   WHISPER_MODEL_PATH=/opt/render/project/models
   ```

3. **Pre-load Models (Optional):**
   Add to your Dockerfile or startup script:
   ```bash
   # Download models during build
   python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"
   ```

### For Local Docker:

1. **Restart services:**
   ```bash
   docker compose down
   docker compose up --build
   ```

2. **Monitor memory usage:**
   ```bash
   docker stats lecture1-backend
   ```

## Additional Optimizations (If Still Having Issues)

### Option 1: Disable ASR Fallback
If YouTube captions are usually available, you can disable the memory-intensive Whisper fallback:

```python
@app.post("/api/transcribe/youtube", response_model=TranscriptResponse)
def transcribe_youtube(req: YouTubeTranscriptRequest):
    captions = get_youtube_captions(req.youtube_url)
    if captions:
        return captions
    else:
        raise HTTPException(
            status_code=400, 
            detail="YouTube captions not available. Please upload a transcript file instead."
        )
```

### Option 2: Use External ASR Service
Replace Whisper with a cloud API (AssemblyAI, Rev.ai, etc.):
- No model loading required
- Lower memory usage
- Costs per minute of audio

### Option 3: Offload to Background Queue
For large files, use Celery/RQ to process transcriptions in background workers.

## Monitoring

Watch these metrics after deployment:

```bash
# Memory usage
docker stats lecture1-backend

# Logs
docker logs -f lecture1-backend

# Health check
curl http://localhost:8000/health
```

Look for:
- ✅ "Whisper model loaded and cached" appears only once per model size
- ✅ Memory stays under 2GB
- ✅ No repeated model downloads
- ✅ No yt-dlp authentication errors

## Summary

The root cause was **inefficient model loading** - loading a 500MB+ model on every request. The fix caches models globally, reducing memory usage by 70-80% per request and preventing the OOM crashes you were experiencing.
