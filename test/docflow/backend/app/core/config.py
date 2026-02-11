from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = ""

    # App
    APP_NAME: str = "Document Extraction API"
    DEBUG: bool = True

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000", "*"]

    # File Upload
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB
    ALLOWED_EXTENSIONS: set[str] = {"png", "jpg", "jpeg", "gif", "bmp", "tiff", "pdf", "doc", "docx"}
    UPLOAD_DIR: str = "uploads"

    # Storage for processed documents (MinIO / S3)
    S3_BUCKET: str = "docflow"
    S3_REGION: str = "us-east-1"
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    S3_USE_SSL: bool = False
    S3_ADDRESSING_STYLE: str = "path"

    # OCR Settings
    USE_GPU: bool = True
    OCR_ENGINE: str = "deepseek"
    DEEPSEEK_MODEL: str = "deepseek-ai/DeepSeek-OCR-2"
    DEEPSEEK_BASE_SIZE: int = 1024
    DEEPSEEK_IMAGE_SIZE: int = 768
    DEEPSEEK_CLEAN_MARKDOWN: bool = True
    OCR_LOG_PREVIEW_CHARS: int = 500

    # Semantic indexing / search
    EMBEDDING_MODEL: str = "paraphrase-multilingual-MiniLM-L12-v2"
    SEMANTIC_SEARCH_CANDIDATES: int = 20
    SEMANTIC_RERANK_TOP_K: int = 5

    # OpenRouter API (Qwen2.5-VL)
    OPENROUTER_API_KEY: str = ""

    # Celery + Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    class Config:
        env_file = ["../.env", ".env"]  # Ищем .env в родительской папке и текущей
        case_sensitive = True
        extra = "ignore"  # Игнорировать переменные из .env, которых нет в Settings


settings = Settings()
