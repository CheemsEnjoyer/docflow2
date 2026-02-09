"""
LangChain-based embedding service for semantic search.
Uses HuggingFaceEmbeddings with paraphrase-multilingual-MiniLM-L12-v2 for Russian language support.
"""
from typing import Optional
from app.core.config import settings


class EmbeddingService:
    """Singleton service for generating text embeddings using LangChain."""

    _instance: Optional["EmbeddingService"] = None
    _embeddings = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _ensure_loaded(self):
        """Lazy load the embeddings model on first use."""
        if self._embeddings is None:
            from langchain_huggingface import HuggingFaceEmbeddings
            self._embeddings = HuggingFaceEmbeddings(
                model_name=settings.EMBEDDING_MODEL
            )

    @property
    def embeddings(self):
        """Get LangChain embeddings instance for use with VectorStore."""
        self._ensure_loaded()
        return self._embeddings

    def embed_text(self, text: str) -> list[float]:
        """
        Generate embedding for a single text (query).

        Args:
            text: Input text to embed

        Returns:
            List of floats representing the embedding vector
        """
        self._ensure_loaded()
        return self._embeddings.embed_query(text)

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """
        Generate embeddings for multiple texts (documents).

        Args:
            texts: List of input texts to embed

        Returns:
            List of embedding vectors
        """
        self._ensure_loaded()
        return self._embeddings.embed_documents(texts)

    @property
    def is_loaded(self) -> bool:
        """Check if model is loaded."""
        return self._embeddings is not None

    @property
    def embedding_dimension(self) -> int:
        """Return the embedding dimension (384 for MiniLM)."""
        return 384


# Global singleton instance
embedding_service = EmbeddingService()
