import posixpath
from pathlib import Path
from typing import Iterable, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import settings


class S3StorageService:
    def __init__(self) -> None:
        self.bucket = settings.S3_BUCKET
        self._bucket_checked = False
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            use_ssl=settings.S3_USE_SSL,
            config=Config(s3={"addressing_style": settings.S3_ADDRESSING_STYLE}),
        )

    def _ensure_bucket(self) -> None:
        if self._bucket_checked:
            return
        try:
            self.client.head_bucket(Bucket=self.bucket)
            self._bucket_checked = True
            return
        except ClientError as exc:
            error_code = str(exc.response.get("Error", {}).get("Code", ""))
            if error_code not in {"404", "NoSuchBucket"}:
                raise

        create_kwargs = {"Bucket": self.bucket}
        if settings.S3_REGION and settings.S3_REGION != "us-east-1":
            create_kwargs["CreateBucketConfiguration"] = {
                "LocationConstraint": settings.S3_REGION
            }
        self.client.create_bucket(**create_kwargs)
        self._bucket_checked = True

    @staticmethod
    def build_key(*parts: str) -> str:
        cleaned: list[str] = []
        for part in parts:
            if part is None:
                continue
            value = str(part).strip().replace("\\", "/").strip("/")
            if value:
                cleaned.append(value)
        return posixpath.join(*cleaned)

    def save_file(self, local_path: str | Path, key: str, content_type: Optional[str] = None) -> None:
        self._ensure_bucket()
        extra_args = {"ContentType": content_type} if content_type else None
        self.client.upload_file(
            str(local_path),
            self.bucket,
            key,
            ExtraArgs=extra_args or {},
        )

    def save_bytes(self, data: bytes, key: str, content_type: Optional[str] = None) -> None:
        self._ensure_bucket()
        kwargs = {"Bucket": self.bucket, "Key": key, "Body": data}
        if content_type:
            kwargs["ContentType"] = content_type
        self.client.put_object(**kwargs)

    def read_bytes(self, key: str) -> bytes:
        self._ensure_bucket()
        response = self.client.get_object(Bucket=self.bucket, Key=key)
        return response["Body"].read()

    def delete(self, key: str) -> None:
        self._ensure_bucket()
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def exists(self, key: str) -> bool:
        self._ensure_bucket()
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as exc:
            error_code = str(exc.response.get("Error", {}).get("Code", ""))
            if error_code in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise

    def find_available_key(self, prefix_parts: Iterable[str], filename: str) -> str:
        original_name = Path(filename).stem
        suffix = Path(filename).suffix
        counter = 0
        while True:
            candidate_name = f"{original_name}{suffix}" if counter == 0 else f"{original_name}_{counter}{suffix}"
            key = self.build_key(*prefix_parts, candidate_name)
            if not self.exists(key):
                return key
            counter += 1


storage_service = S3StorageService()
