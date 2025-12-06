# RAG System Optimization for Technical Content

## Problem Analysis

Your RAG system was experiencing accuracy issues when handling transcripts containing:
- Mathematical equations and formulas
- Technical explanations and methodologies
- Step-by-step procedures
- Educational content where the summary was more organized than the raw transcript

## Root Causes Identified

1. **Simple Chunking Strategy**: Fixed 5-sentence windows were breaking logical units (equations, proofs, examples)
2. **No Summary Integration**: Summaries contained more organized information but weren't used in retrieval
3. **Limited Context**: Only 3 chunks might miss related concepts across different parts
4. **Generic Scoring**: Fixed 40/60 keyword/semantic weights didn't adapt to question type
5. **No Technical Content Detection**: Mathematical notation and technical terms weren't handled specially

## Implemented Optimizations

### 1. Enhanced Chunking Strategy

**Changes:**
- Increased window size: 5 → 7 sentences (more context per chunk)
- Increased overlap: 2 → 3 sentences (better continuity)
- Added technical content detection using regex patterns:
  - Detects: equation, formula, theorem, proof, calculate, derive, solve, method, technique, algorithm, step
  - Marks chunks with `is_technical` metadata flag

**Benefits:**
- Preserves mathematical explanations within single chunks
- Improves context for technical discussions
- Enables prioritization of technical chunks for technical questions

### 2. Hybrid Indexing with Summary Integration

**Changes:**
- `build_rag_index()` now accepts optional `summary_en` and `summary_mm` parameters
- Summary is chunked separately and added to the index with `source_type="summary_en"` or `"summary_mm"`
- Frontend automatically generates summaries before indexing
- Index contains both:
  - Raw transcript chunks (detailed, specific information)
  - Summary chunks (organized, high-level overview)

**Benefits:**
- Summary provides well-structured answers for general questions
- Transcript provides detailed explanations for specific questions
- Better coverage of content at multiple abstraction levels

### 3. Adaptive Retrieval Strategy

**Changes:**
- Increased `top_k`: 5 → 10 for initial retrieval (better recall)
- Lowered `keyword_threshold`: 0.2 → 0.15 (catches more technical terms)
- Dynamic scoring weights based on question type:
  - Technical questions (how/why/explain/calculate): 30% keyword + 70% semantic
  - Other questions: 40% keyword + 60% semantic
- **Summary chunk boost**: +15% score for summary chunks (more organized)
- **Technical content boost**: +10% score when technical chunk matches technical question
- Intelligent chunk selection:
  - Balances between summary chunks (max 2) and transcript chunks (max 4)
  - Ensures diversity of information sources
- Final context uses 5 chunks (increased from 3)

**Benefits:**
- More nuanced ranking for technical content
- Leverages organized summary information
- Better coverage of complex topics

### 4. Enhanced Answer Generation

**Updated System Prompt:**
- Explicit instructions for handling equations and mathematical content:
  - Explain step-by-step
  - Include equations exactly as mentioned
  - Explain variables and terms
  - Walk through examples clearly
- Instructions for explaining techniques/methods:
  - State technique name
  - Explain purpose
  - Break down steps
  - Provide context
- Instruction to synthesize summary + transcript content coherently

**Improved Context Organization:**
- Separates summary chunks from transcript chunks in prompt
- Labels them as "High-level overview" vs "Detailed information"
- Helps LLM understand information hierarchy
- Explicit reminder to be clear with equations and techniques

**Benefits:**
- More structured, educational answers
- Better handling of mathematical content
- Leverages both organized summaries and detailed transcripts

### 5. Enhanced User Experience

**Frontend Changes:**
- Automatic summary generation during indexing
- Source type badges in chunk display ("Summary" tag for summary chunks)
- Shows up to 5 source chunks (increased from 3)
- Better visual distinction between content sources

## How to Use the Optimized System

### Basic Workflow:

1. **Upload or transcribe content** (unchanged)

2. **Index for Q&A**:
   ```
   Click "Index Transcript for Q&A"
   → System automatically:
      - Generates English and Burmese summaries
      - Chunks both transcript and summaries
      - Creates embeddings
      - Stores in ChromaDB with metadata
   ```

3. **Ask questions**:
   ```
   - System detects if question is technical
   - Adjusts ranking strategy accordingly
   - Retrieves and ranks chunks
   - Prioritizes summary chunks for organization
   - Prioritizes technical chunks for technical questions
   - Generates comprehensive answer using top 5 chunks
   ```

### Expected Improvements:

**For equations/formulas:**
- ✅ Better preservation of mathematical expressions in chunks
- ✅ Step-by-step explanations from both summary and transcript
- ✅ Clearer variable definitions

**For techniques/methods:**
- ✅ More organized explanations (from summary)
- ✅ Detailed steps (from transcript)
- ✅ Better context and examples

**For general comprehension:**
- ✅ More comprehensive answers using 5 chunks instead of 3
- ✅ Better balance of overview and details
- ✅ Adaptive ranking based on question type

## Performance Characteristics

**Indexing Time:**
- Now includes summary generation (~2-5 seconds additional)
- Total chunks increase by ~40-60% (includes summary chunks)
- One-time cost per transcript

**Query Time:**
- Similar response time (~1-3 seconds)
- More compute in ranking but better caching
- Higher quality answers justify minimal overhead

## Configuration Options

You can tune these parameters in `rag_service.py`:

```python
# Chunking
window_size = 7      # Sentences per chunk (increase for more context)
overlap = 3          # Sentence overlap (increase for continuity)

# Retrieval
top_k = 10           # Initial retrieval count (increase for better recall)
keyword_threshold = 0.15  # Minimum keyword overlap (lower = more lenient)

# Scoring weights (for technical questions)
keyword_weight = 0.3
semantic_weight = 0.7

# Boost factors
summary_boost = 1.15    # Multiplier for summary chunks (1.15 = 15% boost)
technical_boost = 1.1   # Multiplier for technical content (1.1 = 10% boost)

# Context size
final_chunks = 5     # Chunks sent to LLM (increase for more context)
max_summary_chunks = 2   # Maximum summary chunks in final context
max_transcript_chunks = 4  # Maximum transcript chunks in final context
```

## Troubleshooting

**If answers are still not accurate enough:**

1. **Increase context window**: Set `final_chunks = 7` or `8`
2. **Adjust summary boost**: Increase to `1.2` or `1.25` if summaries are very organized
3. **Check chunking**: Use RAG Inspector to verify chunks contain complete thoughts
4. **Review technical detection**: Add more keywords to the regex pattern in `chunk_transcript_by_text()`

**If answers are too verbose:**

1. **Reduce final_chunks**: Set to `3` or `4`
2. **Update system prompt**: Add "Be concise" instruction

**If missing technical details:**

1. **Increase technical_boost**: Set to `1.15` or `1.2`
2. **Add more technical keywords** to detection regex
3. **Increase max_transcript_chunks**: Set to `5` or `6`

## Technical Details

### New Metadata Fields:
- `source_type`: "text_chunk", "asr_segment", "summary_en", "summary_mm"
- `is_technical`: Boolean flag for technical content detection

### Scoring Algorithm:
```
For each chunk:
  semantic_score = 1.0 - cosine_distance
  keyword_score = overlap_words / total_question_words
  
  if is_technical_question:
    combined = 0.3 * keyword + 0.7 * semantic
  else:
    combined = 0.4 * keyword + 0.6 * semantic
  
  if chunk is summary:
    combined *= 1.15
  
  if is_technical_question AND chunk is technical:
    combined *= 1.1
```

### Chunk Selection:
1. Sort all chunks by combined score
2. Select top chunks with diversity constraints:
   - Max 2 summary chunks (organized overview)
   - Max 4 transcript chunks (detailed info)
   - Fill remaining slots with highest-scored chunks
3. Present to LLM with clear labeling

## Future Enhancements (Optional)

1. **Query Expansion**: Automatically expand technical terms with synonyms
2. **Citation Tracking**: Show which chunk each sentence comes from
3. **Confidence Scores**: Indicate answer confidence based on retrieval scores
4. **Multi-hop Reasoning**: Chain multiple queries for complex questions
5. **User Feedback Loop**: Learn from user ratings to improve ranking
