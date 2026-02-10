"""
LangChain PGVector semantic index service for document storage and similarity search.
"""
from typing import Optional
from uuid import UUID
from app.core.config import settings
from app.services.embedding_service import embedding_service


class SemanticIndexService:
    """Singleton service for managing semantic document vectors using LangChain PGVector."""

    _instance: Optional["SemanticIndexService"] = None
    _semantic_index = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _ensure_loaded(self):
        """Lazy load the semantic index on first use."""
        if self._semantic_index is None:
            from langchain_community.vectorstores import PGVector

            # Convert postgres:// to postgresql:// if needed
            connection_string = settings.DATABASE_URL
            if connection_string.startswith("postgres://"):
                connection_string = connection_string.replace("postgres://", "postgresql://", 1)

            print(f"--- SemanticIndex connecting to: {connection_string} ---")

            self._semantic_index = PGVector(
                embedding_function=embedding_service.embeddings,
                collection_name="document_embeddings",
                connection_string=connection_string,
                use_jsonb=True,
            )

    @property
    def semantic_index(self):
        """Get the LangChain PGVector instance."""
        self._ensure_loaded()
        return self._semantic_index

    def add_document(
        self,
        document_id: UUID,
        text: str,
        metadata: dict
    ) -> None:
        """
        Add a document to the semantic index.

        Args:
            document_id: Unique document identifier
            text: Document text content to embed
            metadata: Additional metadata (filename, process_id, etc.)
        """
        self._ensure_loaded()
        from langchain_core.documents import Document

        doc = Document(
            page_content=text,
            metadata={
                "document_id": str(document_id),
                **metadata
            }
        )
        self._semantic_index.add_documents([doc], ids=[str(document_id)])

    def similarity_search(
        self,
        query: str,
        k: int = 20,
        filter_metadata: Optional[dict] = None
    ) -> list[tuple]:
        """
        Search for similar documents.

        Args:
            query: Search query text
            k: Maximum number of results
            filter_metadata: Optional metadata filter

        Returns:
            List of (Document, score) tuples
        """
        self._ensure_loaded()
        return self._semantic_index.similarity_search_with_score(
            query,
            k=k,
            filter=filter_metadata
        )

    def delete_document(self, document_id: UUID) -> None:
        """
        Remove a document from the semantic index.

        Args:
            document_id: Document identifier to delete
        """
        self._ensure_loaded()
        self._semantic_index.delete(ids=[str(document_id)])

    def update_document(
        self,
        document_id: UUID,
        text: str,
        metadata: dict
    ) -> None:
        """
        Update a document in the semantic index by re-embedding.

        Args:
            document_id: Document identifier to update
            text: New text content to embed
            metadata: Updated metadata payload
        """
        self._ensure_loaded()
        try:
            self._semantic_index.delete(ids=[str(document_id)])
        except Exception:
            pass
        from langchain_core.documents import Document

        doc = Document(
            page_content=text,
            metadata={
                "document_id": str(document_id),
                **metadata
            }
        )
        self._semantic_index.add_documents([doc], ids=[str(document_id)])

    def get_indexed_count(self) -> int:
        """Get count of indexed documents (approximate)."""
        self._ensure_loaded()
        try:
            results = self._semantic_index.similarity_search("", k=1)
            return len(results) if results else 0
        except Exception:
            return 0


# Global singleton instance
semantic_index_service = SemanticIndexService()

