from pydantic import BaseModel
from typing import List, Optional, Dict

class CEFRAnalyzeRequest(BaseModel):
    transcript_text: str

class WordAnnotation(BaseModel):
    word: str
    cefr_level: str
    confidence: float
    frequency: int
    part_of_speech: Optional[str] = None
    phonetic: Optional[str] = None
    definition: Optional[str] = None
    example: Optional[str] = None

class CEFRLevelStats(BaseModel):
    level: str
    count: int
    percentage: float
    words: List[str]

class CEFRStatistics(BaseModel):
    total_words: int
    unique_words: int
    average_difficulty: float
    approximate_level: str
    level_distribution: List[CEFRLevelStats]
    difficulty_interpretation: str

class CEFRAnalyzeResponse(BaseModel):
    annotations: List[WordAnnotation]
    statistics: CEFRStatistics
    elapsed_ms: float
    from_cache: bool

class WordDefinitionRequest(BaseModel):
    word: str

class WordDefinitionResponse(BaseModel):
    word: str
    part_of_speech: Optional[str] = None
    phonetic: Optional[str] = None
    definition: Optional[str] = None
    example: Optional[str] = None
    found: bool
    elapsed_ms: float

class AdvancedWordsResponse(BaseModel):
    """Response for B2-C2 level words with definitions"""
    words: List[WordAnnotation]
    total_count: int
    level_breakdown: Dict[str, int]
