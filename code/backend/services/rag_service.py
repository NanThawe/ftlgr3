import os
import re
import time
from typing import List, Dict, Any, Tuple, Optional
import chromadb
from chromadb.config import Settings
import google.generativeai as genai
from .cache_service import get_cached_result, set_cached_result

# Initialize ChromaDB
CHROMA_PATH = "./data/chroma"
os.makedirs(CHROMA_PATH, exist_ok=True)
chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)

# Collection for transcript chunks
collection_name = "transcript_chunks"

RAG_SYSTEM_PROMPT = """You are a helpful educational assistant answering questions based ONLY on the provided transcript snippets.

IMPORTANT RULES:
1. ONLY use information from the provided snippets
2. DO NOT add any outside knowledge or assumptions
3. If the answer is not in the snippets, say "I don't have enough information in this transcript to answer that question."
4. Answer in the SAME LANGUAGE as the question. If the question is in Burmese, answer in Burmese. If in English, answer in English.
5. Use clear, natural formatting:
   - Use numbered lists (1., 2., 3.) for multiple points
   - Use bullet points (- or •) for sub-items
   - Use **bold** for emphasis on key terms, formulas, or important concepts
   - Use proper paragraph breaks for readability
6. Be concise and clear in B1-B2 level language
7. Preserve technical terms as-is without translation or modification
8. For equations and mathematical content:
   - Explain step-by-step when describing calculations
   - Include the equation or formula exactly as mentioned (use bold for formulas)
   - Explain what each variable or term represents
   - If showing an example, walk through the logic clearly
9. When explaining techniques or methods:
   - State the technique name clearly in **bold**
   - Explain the purpose or when to use it
   - Break down the steps involved
   - Provide context from the snippets
10. If snippets contain both summary and detailed content, synthesize them coherently"""

def chunk_transcript_by_segments(segments: List[dict]) -> List[Dict[str, Any]]:
    """Convert ASR segments to chunks."""
    chunks = []
    for i, seg in enumerate(segments):
        chunks.append({
            "chunk_id": f"seg_{i}",
            "text": seg.get("text", ""),
            "start_time": seg.get("start"),
            "end_time": seg.get("end"),
            "source_type": "asr_segment"
        })
    return chunks

def chunk_transcript_by_text(text: str) -> List[Dict[str, Any]]:
    """Chunk plain text into overlapping windows with semantic awareness."""
    # Split by sentences but keep equation patterns and technical markers together
    # Pattern to detect equations: "equals", "=", formulas, etc.
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks = []
    window_size = 7  # Increased from 5 for more context
    overlap = 3  # Increased from 2 to ensure continuity
    
    for i in range(0, len(sentences), window_size - overlap):
        window = sentences[i:i + window_size]
        chunk_text = " ".join(window)
        if chunk_text.strip():
            # Detect if chunk contains mathematical or technical content
            is_technical = bool(re.search(r'\b(equation|formula|theorem|proof|calculate|derive|solve|method|technique|algorithm|step)\b', chunk_text, re.IGNORECASE))
            
            chunks.append({
                "chunk_id": f"text_{i}",
                "text": chunk_text,
                "start_time": None,
                "end_time": None,
                "source_type": "text_chunk",
                "is_technical": is_technical
            })
    return chunks

def compute_embeddings(texts: List[str]) -> List[List[float]]:
    """Compute embeddings using Gemini."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found")
    
    genai.configure(api_key=api_key)
    embeddings = []
    
    try:
        for text in texts:
            # Truncate very long texts
            text_to_embed = text[:8000] if len(text) > 8000 else text
            result = genai.embed_content(
                model="models/text-embedding-004",
                content=text_to_embed
            )
            embeddings.append(result['embedding'])
        return embeddings
    except Exception as e:
        print(f"Gemini embedding error: {e}")
        print(f"Falling back to sentence-transformers")
        # Fallback: use sentence-transformers for local embeddings
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer('all-MiniLM-L6-v2')
        embeddings = model.encode(texts).tolist()
        return embeddings

def keyword_score(question: str, text: str) -> float:
    """Simple keyword overlap score (BM25-like)."""
    q_words = set(question.lower().split())
    t_words = set(text.lower().split())
    
    if not q_words:
        return 0.0
    
    overlap = len(q_words & t_words)
    return overlap / len(q_words)

def build_rag_index(transcript_text: str, segments: Optional[List[dict]] = None, summary_en: Optional[str] = None, summary_mm: Optional[str] = None) -> Dict[str, Any]:
    """Build or update RAG index with optional summary integration.
    
    Args:
        transcript_text: Raw transcript text
        segments: Optional ASR segments with timestamps
        summary_en: Optional English summary (more organized)
        summary_mm: Optional Burmese summary
    """
    try:
        print(f"Starting RAG indexing...")
        print(f"Transcript length: {len(transcript_text)} chars")
        print(f"Segments provided: {len(segments) if segments else 0}")
        print(f"Summary provided: {bool(summary_en)}")
        
        # Determine chunking strategy
        # If only 1 segment, use text-based chunking for better granularity
        if segments and len(segments) > 1:
            chunks = chunk_transcript_by_segments(segments)
        else:
            chunks = chunk_transcript_by_text(transcript_text)
        
        # Add summary chunks if provided - these are more organized and provide better high-level answers
        if summary_en:
            summary_chunks = chunk_transcript_by_text(summary_en)
            for chunk in summary_chunks:
                chunk["source_type"] = "summary_en"
                chunk["chunk_id"] = f"summary_en_{chunk['chunk_id']}"
            chunks.extend(summary_chunks)
            print(f"Added {len(summary_chunks)} summary chunks (English)")
        
        if summary_mm:
            summary_chunks_mm = chunk_transcript_by_text(summary_mm)
            for chunk in summary_chunks_mm:
                chunk["source_type"] = "summary_mm"
                chunk["chunk_id"] = f"summary_mm_{chunk['chunk_id']}"
            chunks.extend(summary_chunks_mm)
            print(f"Added {len(summary_chunks_mm)} summary chunks (Burmese)")
        
        if not chunks:
            raise ValueError("No chunks generated from transcript")
        
        print(f"Generated {len(chunks)} total chunks")
        
        # Compute embeddings
        texts = [c["text"] for c in chunks]
        print(f"Computing embeddings for {len(texts)} texts...")
        embeddings = compute_embeddings(texts)
        print(f"Got {len(embeddings)} embeddings")
        
        # Store in ChromaDB
        try:
            collection = chroma_client.get_collection(collection_name)
            chroma_client.delete_collection(collection_name)
            print(f"Deleted existing collection")
        except Exception as e:
            print(f"No existing collection to delete: {e}")
        
        print(f"Creating new collection: {collection_name}")
        collection = chroma_client.create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}
        )
        
        print(f"Adding {len(chunks)} chunks to collection...")
        # Build metadata, filtering out None values (ChromaDB doesn't accept None)
        metadatas = []
        for c in chunks:
            metadata = {"source_type": c.get("source_type", "unknown")}
            if c.get("start_time") is not None:
                metadata["start_time"] = c.get("start_time")
            if c.get("end_time") is not None:
                metadata["end_time"] = c.get("end_time")
            if c.get("is_technical") is not None:
                metadata["is_technical"] = c.get("is_technical")
            metadatas.append(metadata)
        
        collection.add(
            ids=[c["chunk_id"] for c in chunks],
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas
        )
        
        print(f"Successfully indexed {len(chunks)} chunks")
        return {"indexed_chunks": len(chunks), "status": "success"}
        
    except Exception as e:
        print(f"ERROR in build_rag_index: {e}")
        import traceback
        traceback.print_exc()
        raise

def query_rag(question: str, top_k: int = 10, keyword_threshold: float = 0.15) -> Tuple[str, List[Dict[str, Any]], float, bool]:
    """Query RAG system with enhanced two-stage ranking.
    
    Args:
        question: User's question
        top_k: Number of chunks to retrieve (increased for better recall)
        keyword_threshold: Minimum keyword overlap score (lowered for technical content)
    
    Returns:
        Tuple of (answer, top_chunks, elapsed_ms, from_cache)
    """
    
    # Check cache
    cache_key = f"rag:{question}"
    cached = get_cached_result(cache_key, "rag_answer")
    if cached:
        return cached["answer"], cached["top_chunks"], 0, True
    
    start = time.perf_counter()
    
    try:
        collection = chroma_client.get_collection(collection_name)
    except:
        return "Please index a transcript first before asking questions.", [], (time.perf_counter() - start) * 1000, False
    
    # Get all chunks for keyword scoring
    all_data = collection.get()
    all_chunks = [
        {
            "chunk_id": all_data["ids"][i],
            "text": all_data["documents"][i],
            "metadata": all_data["metadatas"][i]
        }
        for i in range(len(all_data["ids"]))
    ]
    
    # Compute keyword scores
    keyword_scores = {c["chunk_id"]: keyword_score(question, c["text"]) for c in all_chunks}
    max_keyword = max(keyword_scores.values()) if keyword_scores else 0
    
    # Semantic search - truncate question if too long
    truncated_question = question[:8000] if len(question) > 8000 else question
    
    try:
        q_embedding = genai.embed_content(
            model="models/text-embedding-004",
            content=truncated_question
        )
    except Exception as e:
        # Fallback to sentence-transformers for local embeddings
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer('all-MiniLM-L6-v2')
        q_embedding = {"embedding": model.encode(truncated_question).tolist()}
    
    results = collection.query(
        query_embeddings=[q_embedding['embedding']],
        n_results=min(top_k, len(all_chunks))
    )
    
    # Enhanced scoring: prioritize semantic understanding for technical content
    # Detect if question is technical
    is_technical_question = bool(re.search(r'\b(how|why|what|explain|calculate|solve|derive|prove|show|formula|equation|method|technique|step)\b', question, re.IGNORECASE))
    
    # Adjust weights: for technical questions, favor semantic understanding
    if is_technical_question:
        keyword_weight, semantic_weight = 0.3, 0.7
    else:
        keyword_weight, semantic_weight = 0.4, 0.6
    
    ranked_chunks = []
    for i, chunk_id in enumerate(results["ids"][0]):
        semantic_score = 1.0 - results["distances"][0][i]  # Convert distance to similarity
        kw_score = keyword_scores.get(chunk_id, 0)
        combined_score = keyword_weight * kw_score + semantic_weight * semantic_score
        
        # Find metadata for this chunk
        chunk_metadata = results["metadatas"][0][i]
        
        # Boost score if chunk is from summary (more organized)
        if "summary" in chunk_metadata.get("source_type", ""):
            combined_score *= 1.15  # 15% boost for summary chunks
        
        # Boost score if chunk is marked as technical and question is technical
        if is_technical_question and chunk_metadata.get("is_technical", False):
            combined_score *= 1.1  # 10% boost for technical content
        
        ranked_chunks.append({
            "chunk_id": chunk_id,
            "score": combined_score,
            "text": results["documents"][0][i],
            "text_preview": results["documents"][0][i][:200] + "..." if len(results["documents"][0][i]) > 200 else results["documents"][0][i],
            "start_time": chunk_metadata.get("start_time"),
            "end_time": chunk_metadata.get("end_time"),
            "source_type": chunk_metadata.get("source_type", "unknown")
        })
    
    ranked_chunks.sort(key=lambda x: x["score"], reverse=True)
    
    # Use top 5 chunks (increased from 3) for more comprehensive answers
    # Prioritize diversity: try to get both summary and transcript chunks
    top_chunks = []
    summary_count = 0
    transcript_count = 0
    
    for chunk in ranked_chunks:
        if len(top_chunks) >= 5:
            break
        source_type = chunk.get("source_type", "")
        
        # Balance between summary and transcript chunks
        if "summary" in source_type:
            if summary_count < 2:  # Max 2 summary chunks
                top_chunks.append(chunk)
                summary_count += 1
        else:
            if transcript_count < 4:  # Max 4 transcript chunks
                top_chunks.append(chunk)
                transcript_count += 1
    
    # If we don't have 5 chunks yet, add more regardless of type
    if len(top_chunks) < 5:
        for chunk in ranked_chunks:
            if chunk not in top_chunks:
                top_chunks.append(chunk)
                if len(top_chunks) >= 5:
                    break
    
    # Detect question language
    def is_burmese(text: str) -> bool:
        """Check if text contains Burmese characters."""
        return any('\u1000' <= char <= '\u109F' for char in text)
    
    question_is_burmese = is_burmese(question)
    
    # Check if we have relevant content
    if max_keyword < keyword_threshold and (not top_chunks or top_chunks[0]["score"] < 0.3):
        if question_is_burmese:
            answer = "ဤမှတ်တမ်းအပေါ် အခြေခံ၍သာ မေးခွန်းများကို ဖြေဆိုနိုင်ပါသည်။ သင့်မေးခွန်းအတွက် သက်ဆိုင်သောအချက်အလက်များ ရှာမတွေ့ပါ။"
        else:
            answer = "I can only answer questions based on this transcript. I couldn't find relevant information to answer your question."
        elapsed_ms = (time.perf_counter() - start) * 1000
        result = {"answer": answer, "top_chunks": top_chunks}
        set_cached_result(cache_key, "rag_answer", result)
        return answer, top_chunks, elapsed_ms, False
    
    # Generate answer with Gemini
    # Organize context: summary chunks first (if any), then transcript chunks
    summary_chunks = [c for c in top_chunks if "summary" in c.get("source_type", "")]
    transcript_chunks = [c for c in top_chunks if "summary" not in c.get("source_type", "")]
    
    context_parts = []
    if summary_chunks:
        context_parts.append("High-level overview (from organized summary):")
        for i, c in enumerate(summary_chunks):
            context_parts.append(f"Overview {i+1}:\n{c['text']}")
    
    if transcript_chunks:
        if summary_chunks:
            context_parts.append("\nDetailed information (from transcript):")
        for i, c in enumerate(transcript_chunks):
            context_parts.append(f"Detail {i+1}:\n{c['text']}")
    
    context = "\n\n".join(context_parts)
    
    prompt = f"""{RAG_SYSTEM_PROMPT}

Question: {question}

Relevant content from transcript:
{context}

Answer (remember to be clear and structured, especially for equations and techniques):"""
    
    model = genai.GenerativeModel("gemini-2.5-flash")
    response = model.generate_content(prompt)
    answer = response.text
    
    elapsed_ms = (time.perf_counter() - start) * 1000
    
    # Cache result
    result = {"answer": answer, "top_chunks": top_chunks}
    set_cached_result(cache_key, "rag_answer", result)
    
    return answer, top_chunks, elapsed_ms, False


def get_index_stats(collection_name: str = "lecture_transcript") -> dict:
    """
    Get statistics about the indexed collection.
    Returns chunk count, sample chunks, and metadata info.
    """
    try:
        collection = chroma_client.get_collection(collection_name)
    except Exception as e:
        return {
            "indexed": False,
            "error": str(e),
            "chunk_count": 0
        }
    
    # Get all data
    all_data = collection.get()
    chunk_count = len(all_data["ids"])
    
    if chunk_count == 0:
        return {
            "indexed": False,
            "chunk_count": 0,
            "message": "Collection exists but is empty"
        }
    
    # Get sample chunks (first 5)
    sample_chunks = []
    for i in range(min(5, chunk_count)):
        sample_chunks.append({
            "chunk_id": all_data["ids"][i],
            "text_preview": all_data["documents"][i][:200] + "..." if len(all_data["documents"][i]) > 200 else all_data["documents"][i],
            "full_text": all_data["documents"][i],
            "metadata": all_data["metadatas"][i]
        })
    
    return {
        "indexed": True,
        "chunk_count": chunk_count,
        "collection_name": collection_name,
        "sample_chunks": sample_chunks
    }


def get_all_chunks(collection_name: str = "lecture_transcript") -> list:
    """
    Get all indexed chunks with their full content.
    """
    try:
        collection = chroma_client.get_collection(collection_name)
    except Exception as e:
        return []
    
    all_data = collection.get()
    
    chunks = []
    for i in range(len(all_data["ids"])):
        chunks.append({
            "chunk_id": all_data["ids"][i],
            "text": all_data["documents"][i],
            "metadata": all_data["metadatas"][i]
        })
    
    return chunks


def clear_index(collection_name: str = "lecture_transcript") -> dict:
    """
    Clear the RAG index by deleting the collection.
    """
    try:
        chroma_client.delete_collection(collection_name)
        return {"success": True, "message": f"Collection '{collection_name}' deleted successfully"}
    except Exception as e:
        return {"success": False, "error": str(e)}
