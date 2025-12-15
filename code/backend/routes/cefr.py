from fastapi import APIRouter, HTTPException
import time
from schemas.cefr import (
    CEFRAnalyzeRequest, CEFRAnalyzeResponse, WordAnnotation,
    CEFRStatistics, CEFRLevelStats, WordDefinitionResponse,
    AdvancedWordsResponse
)
from services.cefr_service import (
    load_model, is_model_loaded, analyze_transcript, calculate_statistics,
    get_advanced_words, fetch_word_definition, classify_word, get_cefr_colors
)

router = APIRouter(prefix="/api/cefr", tags=["CEFR"])

# Load model on startup
load_model()

@router.post("/analyze", response_model=CEFRAnalyzeResponse)
async def analyze_transcript_endpoint(req: CEFRAnalyzeRequest):
    """
    Analyze transcript text and return CEFR-annotated words with statistics.
    """
    if not req.transcript_text or not req.transcript_text.strip():
        raise HTTPException(status_code=400, detail="Transcript text cannot be empty")
    
    if not is_model_loaded():
        if not load_model():
            raise HTTPException(
                status_code=503, 
                detail="CEFR model not available. Please ensure the model file is properly deployed."
            )
    
    try:
        start_time = time.perf_counter()
        
        # Analyze transcript
        word_annotations, word_freq, analysis_elapsed = analyze_transcript(req.transcript_text)
        
        # Calculate statistics
        statistics = calculate_statistics(word_annotations, word_freq)
        
        # Build response annotations
        annotations = [
            WordAnnotation(
                word=word,
                cefr_level=info['level'],
                confidence=info['confidence'],
                frequency=info['frequency']
            )
            for word, info in word_annotations.items()
        ]
        
        # Sort by frequency descending
        annotations.sort(key=lambda x: x.frequency, reverse=True)
        
        total_elapsed = (time.perf_counter() - start_time) * 1000
        
        # Check if result came from cache (analysis was very fast)
        from_cache = analysis_elapsed < 10  # Less than 10ms likely means cached
        
        return CEFRAnalyzeResponse(
            annotations=annotations,
            statistics=CEFRStatistics(
                total_words=statistics['total_words'],
                unique_words=statistics['unique_words'],
                average_difficulty=statistics['average_difficulty'],
                approximate_level=statistics['approximate_level'],
                level_distribution=[
                    CEFRLevelStats(**level_data) 
                    for level_data in statistics['level_distribution']
                ],
                difficulty_interpretation=statistics['difficulty_interpretation']
            ),
            elapsed_ms=total_elapsed,
            from_cache=from_cache
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")

@router.get("/definition/{word}", response_model=WordDefinitionResponse)
async def get_word_definition(word: str):
    """
    Fetch dictionary definition for a specific word.
    """
    if not word or not word.strip():
        raise HTTPException(status_code=400, detail="Word cannot be empty")
    
    start_time = time.perf_counter()
    
    try:
        definition_data = await fetch_word_definition(word.strip())
        elapsed = (time.perf_counter() - start_time) * 1000
        
        if definition_data:
            return WordDefinitionResponse(
                word=definition_data['word'],
                part_of_speech=definition_data.get('part_of_speech'),
                phonetic=definition_data.get('phonetic'),
                definition=definition_data.get('definition'),
                example=definition_data.get('example'),
                found=True,
                elapsed_ms=elapsed
            )
        else:
            return WordDefinitionResponse(
                word=word,
                found=False,
                elapsed_ms=elapsed
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Definition fetch error: {str(e)}")

@router.post("/advanced-words", response_model=AdvancedWordsResponse)
async def get_advanced_words_endpoint(req: CEFRAnalyzeRequest):
    """
    Get B2-C2 level words from transcript with their annotations.
    """
    if not req.transcript_text or not req.transcript_text.strip():
        raise HTTPException(status_code=400, detail="Transcript text cannot be empty")
    
    if not is_model_loaded():
        if not load_model():
            raise HTTPException(
                status_code=503, 
                detail="CEFR model not available"
            )
    
    try:
        # Analyze transcript
        word_annotations, word_freq, _ = analyze_transcript(req.transcript_text)
        
        # Get advanced words
        advanced_words = get_advanced_words(word_annotations)
        
        # Calculate level breakdown
        level_breakdown = {
            'B2': sum(1 for w in advanced_words if w['cefr_level'] == 'B2'),
            'C1': sum(1 for w in advanced_words if w['cefr_level'] == 'C1'),
            'C2': sum(1 for w in advanced_words if w['cefr_level'] == 'C2')
        }
        
        return AdvancedWordsResponse(
            words=[
                WordAnnotation(
                    word=w['word'],
                    cefr_level=w['cefr_level'],
                    confidence=w['confidence'],
                    frequency=w['frequency']
                )
                for w in advanced_words
            ],
            total_count=len(advanced_words),
            level_breakdown=level_breakdown
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting advanced words: {str(e)}")

@router.get("/classify/{word}")
async def classify_single_word(word: str):
    """
    Classify a single word and return its CEFR level.
    """
    if not word or not word.strip():
        raise HTTPException(status_code=400, detail="Word cannot be empty")
    
    if not is_model_loaded():
        if not load_model():
            raise HTTPException(status_code=503, detail="CEFR model not available")
    
    try:
        level, confidence = classify_word(word.strip())
        return {
            "word": word,
            "cefr_level": level,
            "confidence": confidence
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classification error: {str(e)}")

@router.get("/colors")
async def get_colors():
    """
    Get the CEFR level color scheme.
    """
    return get_cefr_colors()

@router.get("/health")
async def health_check():
    """
    Check if CEFR service is healthy and model is loaded.
    """
    model_status = is_model_loaded()
    if not model_status:
        model_status = load_model()
    
    return {
        "status": "healthy" if model_status else "degraded",
        "model_loaded": model_status
    }
