import pickle
import re
import time
import httpx
from typing import Dict, List, Tuple, Optional, Any
from collections import Counter
from pathlib import Path
from services.cache_service import get_cached_result, set_cached_result

# Global model variables
_model = None
_vectorizer = None
_model_classes = None
_feature_names = None
_model_loaded = False

# CEFR level mappings
LEVEL_TO_NUM = {'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6}
NUM_TO_LEVEL = {v: k for k, v in LEVEL_TO_NUM.items()}

# CEFR color scheme
CEFR_COLORS = {
    'A1': '#90EE90',  # Light Green
    'A2': '#9ACD32',  # Yellow Green
    'B1': '#FFD700',  # Yellow
    'B2': '#FFA500',  # Orange
    'C1': '#F08080',  # Light Coral
    'C2': '#FF6B6B',  # Red
}

# Word annotation cache
_word_cache: Dict[str, Dict[str, Any]] = {}

def load_model() -> bool:
    """Load the CEFR classifier model from pickle file."""
    global _model, _vectorizer, _model_classes, _feature_names, _model_loaded
    
    if _model_loaded:
        return True
    
    try:
        # Try multiple paths for the model file
        model_paths = [
            Path(__file__).parent.parent / "cefr_classifier_sgd.pkl",  # Backend folder (Render deployment)
            Path(__file__).parent.parent.parent.parent / "cefr_classifier_sgd.pkl",  # Root folder (local dev)
            Path("/app/cefr_classifier_sgd.pkl"),  # Docker container path
            Path("/opt/render/project/src/cefr_classifier_sgd.pkl"),  # Render default path
        ]
        
        model_path = None
        for path in model_paths:
            if path.exists():
                model_path = path
                break
        
        if model_path is None:
            print(f"Warning: Model file not found. Tried paths: {[str(p) for p in model_paths]}")
            return False
        
        with open(model_path, 'rb') as f:
            model_data = pickle.load(f)
        
        _model = model_data['model']
        _vectorizer = model_data['vectorizer']
        _model_classes = model_data['classes']
        _feature_names = model_data['feature_names']
        _model_loaded = True
        
        print(f"✓ CEFR model loaded successfully from {model_path}")
        print(f"  Classes: {_model_classes}")
        return True
    except Exception as e:
        print(f"Error loading CEFR model: {e}")
        return False

def is_model_loaded() -> bool:
    """Check if the model is loaded."""
    return _model_loaded

def extract_char_features(word: str) -> str:
    """Extract character-level n-grams from word (matching notebook implementation)."""
    word = word.lower()
    char_ngrams = []
    for n in range(2, 6):
        for i in range(len(word) - n + 1):
            char_ngrams.append(word[i:i+n])
    return ' '.join(char_ngrams)

def classify_word(word: str) -> Tuple[str, float]:
    """
    Classify a single word and return CEFR level and confidence.
    Returns tuple of (cefr_level, confidence_score)
    """
    global _model, _vectorizer
    
    if not _model_loaded:
        if not load_model():
            return ('B1', 0.0)  # Default fallback
    
    # Check cache first
    word_lower = word.lower()
    if word_lower in _word_cache:
        cached = _word_cache[word_lower]
        return (cached['level'], cached['confidence'])
    
    try:
        # Extract features
        char_feat = extract_char_features(word_lower)
        word_tfidf = _vectorizer.transform([char_feat])
        
        # Predict
        prediction = _model.predict(word_tfidf)[0]
        
        # Get decision function scores (confidence)
        decision_scores = _model.decision_function(word_tfidf)[0]
        confidence = float(max(decision_scores))
        
        # Cache the result
        _word_cache[word_lower] = {
            'level': prediction,
            'confidence': confidence
        }
        
        return (prediction, confidence)
    except Exception as e:
        print(f"Error classifying word '{word}': {e}")
        return ('B1', 0.0)

def extract_words_from_text(text: str) -> List[str]:
    """Extract words from text, removing punctuation and numbers."""
    words = re.findall(r'\b[a-zA-Z]+\b', text.lower())
    return words

def analyze_transcript(transcript_text: str) -> Tuple[Dict[str, Dict], Counter, float]:
    """
    Analyze a transcript and return word annotations and statistics.
    
    Returns:
        - word_annotations: Dict mapping words to their CEFR info
        - word_freq: Counter of word frequencies
        - elapsed_ms: Processing time in milliseconds
    """
    start_time = time.perf_counter()
    
    # Check cache
    cache_key = f"cefr_analysis"
    cached = get_cached_result(transcript_text, cache_key)
    if cached:
        elapsed = (time.perf_counter() - start_time) * 1000
        return cached['annotations'], cached['word_freq'], elapsed
    
    # Extract words
    words = extract_words_from_text(transcript_text)
    word_freq = Counter(words)
    unique_words = list(set(words))
    
    # Classify each unique word
    word_annotations = {}
    for word in unique_words:
        level, confidence = classify_word(word)
        word_annotations[word] = {
            'level': level,
            'confidence': confidence,
            'frequency': word_freq[word]
        }
    
    # Cache the result
    set_cached_result(transcript_text, cache_key, {
        'annotations': word_annotations,
        'word_freq': dict(word_freq)
    })
    
    elapsed = (time.perf_counter() - start_time) * 1000
    return word_annotations, word_freq, elapsed

def calculate_statistics(word_annotations: Dict[str, Dict], word_freq: Counter) -> Dict:
    """Calculate CEFR statistics for the analyzed transcript."""
    total_words = sum(word_freq.values())
    unique_words = len(word_annotations)
    
    # Calculate weighted average difficulty
    weighted_sum = 0
    for word, freq in word_freq.items():
        if word in word_annotations:
            level = word_annotations[word]['level']
            weighted_sum += LEVEL_TO_NUM.get(level, 3) * freq
    
    average_difficulty = weighted_sum / total_words if total_words > 0 else 3.0
    approximate_level = NUM_TO_LEVEL.get(round(average_difficulty), 'B1')
    
    # Calculate level distribution
    level_counts = Counter([info['level'] for info in word_annotations.values()])
    level_distribution = []
    for level in ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']:
        count = level_counts.get(level, 0)
        pct = (count / unique_words * 100) if unique_words > 0 else 0
        words_at_level = sorted([w for w, info in word_annotations.items() if info['level'] == level])
        level_distribution.append({
            'level': level,
            'count': count,
            'percentage': round(pct, 2),
            'words': words_at_level[:50]  # Limit to 50 words per level
        })
    
    # Generate interpretation
    if average_difficulty < 2.5:
        interpretation = "Beginner level (A1-A2) - Basic everyday vocabulary"
    elif average_difficulty < 3.5:
        interpretation = "Intermediate level (B1) - Common topics and situations"
    elif average_difficulty < 4.5:
        interpretation = "Upper-Intermediate level (B2) - Complex topics"
    else:
        interpretation = "Advanced level (C1-C2) - Sophisticated vocabulary"
    
    return {
        'total_words': total_words,
        'unique_words': unique_words,
        'average_difficulty': round(average_difficulty, 2),
        'approximate_level': approximate_level,
        'level_distribution': level_distribution,
        'difficulty_interpretation': interpretation
    }

def get_advanced_words(word_annotations: Dict[str, Dict]) -> List[Dict]:
    """Get words at B2 level and above, sorted by frequency."""
    advanced_levels = ['B2', 'C1', 'C2']
    advanced_words = [
        {
            'word': word,
            'cefr_level': info['level'],
            'confidence': info['confidence'],
            'frequency': info['frequency']
        }
        for word, info in word_annotations.items()
        if info['level'] in advanced_levels
    ]
    
    # Sort by frequency descending
    advanced_words.sort(key=lambda x: x['frequency'], reverse=True)
    return advanced_words

async def fetch_word_definition(word: str) -> Optional[Dict]:
    """
    Fetch word definition from Free Dictionary API.
    API: https://dictionaryapi.dev/
    """
    cache_key = f"definition_{word.lower()}"
    
    # Check memory cache
    if cache_key in _word_cache:
        return _word_cache[cache_key].get('definition_data')
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}"
            response = await client.get(url)
            
            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    entry = data[0]
                    meanings = entry.get('meanings', [])
                    
                    if meanings:
                        first_meaning = meanings[0]
                        part_of_speech = first_meaning.get('partOfSpeech', 'unknown')
                        definitions = first_meaning.get('definitions', [])
                        
                        if definitions:
                            definition = definitions[0].get('definition', 'No definition available')
                            example = definitions[0].get('example', '')
                            
                            result = {
                                'word': word,
                                'part_of_speech': part_of_speech,
                                'definition': definition,
                                'example': example,
                                'phonetic': entry.get('phonetic', '')
                            }
                            
                            # Cache the result
                            if word.lower() not in _word_cache:
                                _word_cache[word.lower()] = {}
                            _word_cache[word.lower()]['definition_data'] = result
                            
                            return result
        return None
    except Exception as e:
        print(f"Error fetching definition for '{word}': {e}")
        return None

def get_cefr_colors() -> Dict[str, str]:
    """Return the CEFR color scheme."""
    return CEFR_COLORS.copy()

def clear_word_cache() -> None:
    """Clear the word annotation cache."""
    global _word_cache
    _word_cache.clear()
