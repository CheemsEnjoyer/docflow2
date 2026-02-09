from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import asc
from app.models.document_query import DocumentQuery


def get_queries_by_document(
    db: Session,
    document_id: UUID,
    user_id: UUID,
) -> list[DocumentQuery]:
    """Get all queries for a document, ordered by creation time"""
    return (
        db.query(DocumentQuery)
        .filter(
            DocumentQuery.document_id == document_id,
            DocumentQuery.user_id == user_id,
        )
        .order_by(asc(DocumentQuery.created_at))
        .all()
    )


def create_query(
    db: Session,
    document_id: UUID,
    user_id: UUID,
    question: str,
    answer: str,
    error: Optional[str] = None,
) -> DocumentQuery:
    """Save a query/answer pair"""
    db_query = DocumentQuery(
        document_id=document_id,
        user_id=user_id,
        question=question,
        answer=answer,
        error=error,
    )
    db.add(db_query)
    db.commit()
    db.refresh(db_query)
    return db_query


def delete_queries_by_document(
    db: Session,
    document_id: UUID,
    user_id: UUID,
) -> int:
    """Delete all queries for a document. Returns count of deleted rows."""
    count = (
        db.query(DocumentQuery)
        .filter(
            DocumentQuery.document_id == document_id,
            DocumentQuery.user_id == user_id,
        )
        .delete()
    )
    db.commit()
    return count
