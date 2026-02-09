"""
Search API routes for semantic document search using LangChain.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models.user import UserRole
from app.core.config import settings
from app.services.vectorstore_service import vectorstore_service
from app.services.llm_service import llm_service
from app.schemas.search import SearchResponse, SearchResult

router = APIRouter(prefix="/search", tags=["search"])


@router.post("", response_model=SearchResponse)
async def semantic_search(
    query: str = Query(..., min_length=1, max_length=500, description="Search query"),
    document_type_id: Optional[UUID] = Query(None, description="Filter by document_type ID"),
    limit: int = Query(10, ge=1, le=50, description="Maximum results"),
    use_rerank: bool = Query(True, description="Use LLM reranking"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Perform semantic search across documents using LangChain.

    1. Performs vector similarity search using LangChain PGVector
    2. Optionally reranks results using LLM via LCEL

    Returns documents sorted by relevance.
    """
    # Build metadata filter if document_type_id specified
    filter_dict = None
    if document_type_id:
        filter_dict = {"document_type_id": str(document_type_id)}
    if current_user.role != UserRole.ADMIN:
        filter_dict = {**(filter_dict or {}), "user_id": str(current_user.id)}

    # Get more candidates if reranking is enabled
    search_limit = settings.SEARCH_CANDIDATES if use_rerank else limit

    try:
        # LangChain similarity search
        results = vectorstore_service.similarity_search(
            query,
            k=search_limit,
            filter_metadata=filter_dict
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Vector search failed: {str(e)}"
        )

    if not results:
        return SearchResponse(
            results=[],
            total=0,
            query=query,
            used_rerank=False
        )

    # Convert LangChain results to dict format
    candidates = []
    for doc, score in results:
        candidates.append({
            "document_id": doc.metadata.get("document_id", ""),
            "filename": doc.metadata.get("filename", ""),
            "document_type_id": doc.metadata.get("document_type_id", ""),
            "document_type_name": doc.metadata.get("document_type_name", ""),
            "run_id": doc.metadata.get("run_id", ""),
            "relevance_score": max(0, 1 - score),  # Convert distance to similarity
            "snippet": doc.page_content[:300] + ("..." if len(doc.page_content) > 300 else ""),
            "status": doc.metadata.get("status", ""),
            "created_at": doc.metadata.get("created_at", ""),
        })

    # Optional LLM reranking
    used_rerank = False
    if use_rerank and llm_service.is_configured and len(candidates) > limit:
        try:
            candidates = await llm_service.rerank_documents(
                query,
                candidates,
                top_k=limit
            )
            used_rerank = True
        except Exception as e:
            print(f"LLM reranking failed, using vector search results: {e}")
            candidates = candidates[:limit]
    else:
        candidates = candidates[:limit]

    # Convert to response model
    response_results = [
        SearchResult(
            document_id=c["document_id"],
            filename=c["filename"],
            document_type_id=c["document_type_id"],
            document_type_name=c["document_type_name"],
            run_id=c["run_id"],
            relevance_score=c["relevance_score"],
            snippet=c["snippet"],
            status=c["status"],
            created_at=c["created_at"],
        )
        for c in candidates
    ]

    return SearchResponse(
        results=response_results,
        total=len(response_results),
        query=query,
        used_rerank=used_rerank
    )


@router.get("/stats")
def search_stats(current_user=Depends(get_current_user)):
    """
    Get search index statistics.
    """
    return {
        "embedding_model": settings.EMBEDDING_MODEL,
        "rerank_enabled": llm_service.is_configured,
        "rerank_model": settings.LLM_RERANK_MODEL if llm_service.is_configured else None,
        "vectorstore": "LangChain PGVector",
    }


@router.post("/reindex")
async def reindex_documents(
    batch_size: int = Query(50, ge=1, le=200, description="Documents per batch"),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin)
):
    """
    Reindex documents that are not in the vector store.

    This endpoint fetches documents from the database and adds them to LangChain vectorstore.
    """
    from app.models.processed_document import ProcessedDocument
    from app.models.processing_run import ProcessingRun
    from app.models.document_type import DocumentType

    # Get documents with OCR results
    documents = (
        db.query(ProcessedDocument)
        .join(ProcessingRun)
        .join(DocumentType)
        .filter(ProcessedDocument.ocr_result.isnot(None))
        .limit(batch_size)
        .all()
    )

    if not documents:
        return {
            "indexed": 0,
            "message": "No documents to index"
        }

    indexed = 0
    errors = 0

    for doc in documents:
        try:
            raw_text = (doc.ocr_result or {}).get("raw_text", "")

            if raw_text:
                # Get related data
                run = doc.processing_run
                document_type = run.document_type if run else None

                vectorstore_service.add_document(
                    document_id=doc.id,
                    text=raw_text,
                    metadata={
                        "filename": doc.filename,
                        "document_type_id": str(run.document_type_id) if run else "",
                        "document_type_name": document_type.name if document_type else "",
                        "run_id": str(run.id) if run else "",
                        "user_id": str(run.user_id) if run else "",
                        "status": doc.status.value if doc.status else "",
                        "created_at": doc.created_at.isoformat() if doc.created_at else "",
                    }
                )
                indexed += 1
        except Exception as e:
            print(f"Failed to index document {doc.id}: {e}")
            errors += 1

    return {
        "indexed": indexed,
        "errors": errors,
    }
