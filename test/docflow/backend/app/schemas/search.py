"""
Search schemas for semantic document search.
"""
from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional
from datetime import datetime


class SearchRequest(BaseModel):
    """Request body for search endpoint."""
    query: str = Field(..., min_length=1, max_length=500, description="Search query")
    document_type_id: Optional[UUID] = Field(None, description="Filter by document type ID")
    limit: int = Field(10, ge=1, le=50, description="Maximum results to return")
    use_rerank: bool = Field(True, description="Use LLM reranking")


class SearchResult(BaseModel):
    """Single search result."""
    document_id: UUID
    filename: str
    document_type_id: UUID
    document_type_name: str
    run_id: UUID
    relevance_score: float = Field(..., description="Cosine similarity score (0-1)")
    snippet: str = Field(..., description="Text snippet from document")
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class SearchResponse(BaseModel):
    """Response from search endpoint."""
    results: list[SearchResult]
    total: int
    query: str
    used_rerank: bool = False
