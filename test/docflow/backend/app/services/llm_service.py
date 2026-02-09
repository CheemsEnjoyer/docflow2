"""
LLM service for document reranking and field extraction using OpenRouter API (Qwen2.5-VL).
Includes RAG support for context-aware field extraction.
"""
import ast
import json
import re
import httpx
from typing import Optional
from app.core.config import settings
from app.core.database import SessionLocal


class LLMService:
    """Service for LLM-based document reranking and field extraction via OpenRouter API."""

    _instance: Optional["LLMService"] = None

    OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
    MODEL = "google/gemma-3-4b-it:free"

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @property
    def is_configured(self) -> bool:
        """Check if OpenRouter API key is configured."""
        return bool(settings.OPENROUTER_API_KEY)

    def _get_headers(self) -> dict:
        """Get headers for OpenRouter API requests."""
        return {
            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "DocFlow"
        }

    async def _generate(self, prompt: str, max_tokens: int = 500) -> str:
        """Generate text using OpenRouter API."""
        if not self.is_configured:
            raise RuntimeError("OpenRouter API key not configured")

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt}
                ]
            }
        ]

        payload = {
            "model": self.MODEL,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": 0.1
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                self.OPENROUTER_API_URL,
                headers=self._get_headers(),
                json=payload
            )
            if response.status_code != 200:
                print(f"[LLM] API error {response.status_code}: {response.text[:500]}")
            response.raise_for_status()
            data = response.json()

            # Check for OpenRouter error in response body
            if "error" in data:
                print(f"[LLM] OpenRouter error: {data['error']}")
                return ""

            # Extract response text
            choices = data.get("choices", [])
            if choices:
                content = choices[0].get("message", {}).get("content", "")
                if not content:
                    print(f"[LLM] Empty content in response. Full response: {json.dumps(data)[:500]}")
                return content

            print(f"[LLM] No choices in response: {json.dumps(data)[:500]}")
            return ""

    async def rerank_documents(
        self,
        query: str,
        documents: list[dict],
        top_k: int = 5
    ) -> list[dict]:
        """
        Rerank documents by relevance to query using LLM.

        Args:
            query: User search query
            documents: List of document dicts with 'filename', 'snippet'
            top_k: Maximum number of results to return

        Returns:
            Reranked list of documents (most relevant first)
        """
        if not self.is_configured:
            return documents[:top_k]

        if len(documents) <= top_k:
            return documents

        # Format documents for prompt
        docs_text = self._format_documents(documents)

        prompt = f"""Ты - помощник для поиска документов. Пользователь ищет: "{query}"

Вот список документов с кратким содержанием:
{docs_text}

Задача: отранжируй документы по релевантности к запросу пользователя.
Верни ТОЛЬКО JSON в формате: {{"ranked": [1, 3, 2, ...]}}
где числа - номера документов в порядке убывания релевантности.
Включи только самые релевантные документы, максимум {top_k} штук.
Если документ совсем не релевантен запросу, не включай его."""

        try:
            response = await self._generate(prompt, max_tokens=200)
            ranked_indices = self._parse_ranking(response, len(documents))

            if ranked_indices:
                result = []
                for idx in ranked_indices[:top_k]:
                    if 0 <= idx < len(documents):
                        result.append(documents[idx])
                return result
        except Exception as e:
            print(f"LLM reranking failed: {e}")

        return documents[:top_k]

    def _format_documents(self, docs: list[dict]) -> str:
        """Format documents for the prompt."""
        lines = []
        for i, doc in enumerate(docs):
            snippet = doc.get('snippet', '')[:200]
            if len(doc.get('snippet', '')) > 200:
                snippet += '...'
            filename = doc.get('filename', 'Unknown')
            lines.append(f"{i + 1}. [{filename}]: {snippet}")
        return "\n".join(lines)

    def _parse_ranking(self, response: str, doc_count: int) -> Optional[list[int]]:
        """Parse LLM response to extract ranking."""
        try:
            json_match = re.search(r'\{[^}]+\}', response)
            if json_match:
                data = json.loads(json_match.group())
                if 'ranked' in data:
                    indices = [int(x) - 1 for x in data['ranked']]
                    valid_indices = [i for i in indices if 0 <= i < doc_count]
                    return valid_indices
        except (json.JSONDecodeError, ValueError, KeyError, TypeError) as e:
            print(f"Failed to parse LLM ranking response: {e}")

        return None

    def _score_document_types_simple(self, text: str, document_types: list[dict]) -> Optional[str]:
        if not text or not document_types:
            return None
        text_lower = text.lower()
        best_score = 0
        best_id = None
        for doc_type in document_types:
            name = str(doc_type.get("name", "")).lower()
            fields = doc_type.get("fields") or []
            score = 0
            if name and name in text_lower:
                score += 3
            for field in fields:
                field_str = str(field).lower()
                if field_str and field_str in text_lower:
                    score += 1
            if score > best_score:
                best_score = score
                best_id = doc_type.get("id")
        return best_id

    def _parse_classification(self, response: str, allowed_ids: set[str]) -> Optional[str]:
        try:
            json_match = re.search(r'\{[\s\S]*\}', response)
            if not json_match:
                return None
            data = json.loads(json_match.group())
            doc_id = data.get("document_type_id")
            if isinstance(doc_id, str) and doc_id in allowed_ids:
                return doc_id
        except Exception:
            return None
        return None

    async def classify_document_type(
        self,
        text: str,
        document_types: list[dict],
    ) -> Optional[str]:
        """
        Classify document text into one of the provided document types.
        Returns document_type_id or None if not confident.
        """
        if not text or not document_types:
            return None

        allowed_ids = {str(item["id"]) for item in document_types if item.get("id")}

        if not self.is_configured:
            return self._score_document_types_simple(text, document_types)

        types_payload = [
            {
                "id": str(item.get("id")),
                "name": item.get("name", ""),
                "description": item.get("description", ""),
                "fields": item.get("fields", []),
                "export_keys": item.get("export_keys", {}),
            }
            for item in document_types
        ]

        prompt = f"""Ты классификатор документов. Определи, к какому типу относится документ.
Верни ТОЛЬКО JSON: {{"document_type_id": "<id>"}} или {{"document_type_id": null}}.

ТИПЫ ДОКУМЕНТОВ:
{json.dumps(types_payload, ensure_ascii=False)}

ТЕКСТ ДОКУМЕНТА:
{text[:4000]}
"""

        try:
            response = await self._generate(prompt, max_tokens=200)
            parsed = self._parse_classification(response, allowed_ids)
            if parsed:
                return parsed
        except Exception as e:
            print(f"LLM classification failed: {e}")

        return self._score_document_types_simple(text, document_types)

    async def extract_fields(
        self,
        text: str,
        fields_to_extract: list[str],
        json_content: Optional[dict] = None,
        table_groups: Optional[dict[str, list[str]]] = None,
        document_type_id: Optional[str] = None
    ) -> list[dict]:
        """
        Extract specific fields from document text using LLM with RAG context.

        Args:
            text: Raw text content of the document
            fields_to_extract: List of field names to extract
            json_content: Optional PaddleOCR JSON with coordinates

        Returns:
            List of extracted fields with values and confidence
        """
        if not self.is_configured or (not fields_to_extract and not table_groups):
            return []

        # Limit text to avoid context overflow
        text_preview = text[:4000] if len(text) > 4000 else text

        # Get RAG context from similar documents
        rag_context = self._get_rag_context(text_preview, fields_to_extract, document_type_id=document_type_id)

        fields_list = "\n".join([f"- {field}" for field in fields_to_extract])
        table_groups = table_groups or {}
        table_groups_text = ""
        tables_json_example = '"tables": []'
        if table_groups:
            group_lines = [
                f"- {group}: {', '.join(columns)}"
                for group, columns in table_groups.items()
            ]
            # Build a concrete example for the JSON template
            first_group = next(iter(table_groups))
            first_cols = table_groups[first_group]
            example_row = ", ".join([f'"{col}": "значение"' for col in first_cols])
            tables_json_example = f'"tables": [{{"group": "{first_group}", "rows": [{{{example_row}}}]}}]'

            table_groups_text = f"""

ТАБЛИЧНЫЕ ГРУППЫ (извлеки ТОЛЬКО указанные колонки для каждой группы):
{chr(10).join(group_lines)}

ВАЖНО: Верни ТОЛЬКО те колонки, которые указаны выше. НЕ добавляй другие колонки.
Используй ТОЧНЫЕ названия колонок как указано.
Сохраняй порядок строк как в документе.
Извлеки ВСЕ строки таблицы из документа.
"""

        # Build prompt with RAG context
        if rag_context:
            prompt = f"""Ты - эксперт по извлечению данных из документов.
Проанализируй текст документа и извлеки значения для указанных полей.

ПРИМЕРЫ ИЗВЛЕЧЁННЫХ ПОЛЕЙ ИЗ ДОКУМЕНТОВ ЭТОГО ТИПА:
{rag_context}

ТЕКСТ ДОКУМЕНТА ДЛЯ АНАЛИЗА:
{text_preview}

ПОЛЯ ДЛЯ ИЗВЛЕЧЕНИЯ:
{fields_list}
{table_groups_text}

ИНСТРУКЦИИ:
1. Используй примеры для понимания формата и типичных значений полей
2. Внимательно прочитай текст документа
3. Найди значения для каждого запрошенного поля
4. Если поле встречается несколько раз (например, в таблице), верни несколько объектов с одинаковым "name" в порядке появления
5. Если поле не найдено, укажи "Не найдено"
6. Для каждого поля оцени уверенность от 0.0 до 1.0

Верни ТОЛЬКО JSON в формате:
{{
  "fields": [
    {{"name": "название поля", "value": "найденное значение", "confidence": 0.95}},
    ...
  ],
  {tables_json_example}
}}

Не добавляй никаких пояснений, только JSON."""
        else:
            prompt = f"""Ты - эксперт по извлечению данных из документов.
Проанализируй текст документа и извлеки значения для указанных полей.

ТЕКСТ ДОКУМЕНТА:
{text_preview}

ПОЛЯ ДЛЯ ИЗВЛЕЧЕНИЯ:
{fields_list}

ИНСТРУКЦИИ:
1. Внимательно прочитай текст документа
2. Найди значения для каждого запрошенного поля
3. Если поле встречается несколько раз (например, в таблице), верни несколько объектов с одинаковым "name" в порядке появления
4. Если поле не найдено, укажи "Не найдено"
5. Для каждого поля оцени уверенность от 0.0 до 1.0
{table_groups_text}

Верни ТОЛЬКО JSON в формате:
{{
  "fields": [
    {{"name": "название поля", "value": "найденное значение", "confidence": 0.95}},
    ...
  ],
  {tables_json_example}
}}

Не добавляй никаких пояснений, только JSON."""

        try:
            # Increase token limit for table extraction
            max_tokens = 500
            if table_groups:
                max_tokens = 2000

            response = await self._generate(prompt, max_tokens=max_tokens)

            if table_groups:
                print(f"[LLM] Table extraction response ({len(response)} chars): {response[:500]}")

            extracted = self._parse_extracted_fields(
                response,
                fields_to_extract,
                json_content,
                table_groups=table_groups
            )

            if table_groups:
                table_fields = [f for f in extracted if f.get("group")]
                print(f"[LLM] Extracted {len(table_fields)} table fields from {len(table_groups)} groups")

            return extracted

        except Exception as e:
            print(f"LLM field extraction failed: {e}")
            return [{"name": f, "value": "Ошибка извлечения", "confidence": 0.0, "coordinate": None} for f in fields_to_extract]

    def _get_rag_context(
        self,
        text: str,
        fields_to_extract: list[str],
        max_examples: int = 5,
        document_type_id: Optional[str] = None
    ) -> str:
        """
        Retrieve extracted fields from documents of the same type as few-shot examples.

        Args:
            text: Current document text (unused, kept for signature compatibility)
            fields_to_extract: Fields we're trying to extract
            max_examples: Maximum number of examples to include
            document_type_id: Document type ID to filter by

        Returns:
            Formatted context string with field examples
        """
        if not document_type_id:
            return ""

        try:
            from app.models.processed_document import ProcessedDocument
            from app.models.processing_run import ProcessingRun
            from sqlalchemy import desc

            db = SessionLocal()
            try:
                docs = (
                    db.query(ProcessedDocument)
                    .join(ProcessingRun, ProcessedDocument.processing_run_id == ProcessingRun.id)
                    .filter(
                        ProcessingRun.document_type_id == document_type_id,
                        ProcessedDocument.extracted_fields.isnot(None),
                    )
                    .order_by(desc(ProcessedDocument.created_at))
                    .limit(max_examples)
                    .all()
                )
            finally:
                db.close()

            if not docs:
                return ""

            context_parts = []
            for i, doc in enumerate(docs):
                fields = doc.extracted_fields
                if not fields or not isinstance(fields, list):
                    continue

                field_lines = []
                for f in fields:
                    name = f.get("name", "")
                    value = f.get("value", "")
                    if not name or not value or value in ("Не найдено", ""):
                        continue
                    field_lines.append(f"  {name}: {value}")

                if field_lines:
                    filename = doc.filename or "Документ"
                    context_parts.append(f"Пример {len(context_parts) + 1} ({filename}):\n" + "\n".join(field_lines))

            return "\n\n".join(context_parts)

        except Exception as e:
            print(f"RAG context retrieval failed: {e}")
            return ""

    def _parse_extracted_fields(
        self,
        response: str,
        fields_to_extract: list[str],
        json_content: Optional[dict] = None,
        table_groups: Optional[dict[str, list[str]]] = None
    ) -> list[dict]:
        """Parse LLM response to extract field values."""
        result: list[dict] = []

        try:
            data = self._safe_parse_json(response)
            if table_groups:
                print(f"[LLM] _parse_extracted_fields: parsed JSON = {data is not None}, table_groups = {table_groups}")
                if data is not None:
                    print(f"[LLM] JSON keys: {list(data.keys())}")
                    print(f"[LLM] tables value: {data.get('tables', 'KEY_MISSING')}")
                else:
                    print(f"[LLM] Raw response for debug: {response[:1000]}")
            if data is not None:
                table_groups = table_groups or {}
                group_lookup = {
                    key.lower().strip(): (key, columns)
                    for key, columns in table_groups.items()
                }

                tables = data.get("tables", [])
                if isinstance(tables, list):
                    for table in tables:
                        if not isinstance(table, dict):
                            continue
                        group_name = table.get("group") or table.get("name") or table.get("title")
                        if not group_name:
                            # If only one group configured, use it
                            if len(group_lookup) == 1:
                                canonical_group, columns = next(iter(group_lookup.values()))
                            else:
                                continue
                        else:
                            group_key = str(group_name).lower().strip()
                            if group_key in group_lookup:
                                canonical_group, columns = group_lookup[group_key]
                            elif len(group_lookup) == 1:
                                # LLM returned a different name but only one group configured
                                canonical_group, columns = next(iter(group_lookup.values()))
                            else:
                                # Try partial match
                                matched = None
                                for lookup_key, lookup_val in group_lookup.items():
                                    if group_key in lookup_key or lookup_key in group_key:
                                        matched = lookup_val
                                        break
                                if matched:
                                    canonical_group, columns = matched
                                else:
                                    continue

                        rows = table.get("rows") or table.get("items") or []
                        if not isinstance(rows, list):
                            continue

                        if table_groups:
                            print(f"[LLM] Table group matched: LLM='{group_name}' -> config='{canonical_group}', columns={columns}, rows={len(rows)}")

                        for row_index, row in enumerate(rows):
                            row_values: dict[str, object] = {}
                            if isinstance(row, dict):
                                row_values = row
                            elif isinstance(row, list) and columns:
                                row_values = {
                                    columns[i]: row[i]
                                    for i in range(min(len(columns), len(row)))
                                }
                            else:
                                continue

                            normalized_keys = {
                                str(key).lower().strip(): key
                                for key in row_values.keys()
                            }
                            # Only use configured columns, never all keys from LLM response
                            ordered_columns = columns

                            for column in ordered_columns:
                                column_key = str(column).lower().strip()
                                row_key = normalized_keys.get(column_key, column)
                                cell = row_values.get(row_key)
                                confidence = 0.8
                                value = cell
                                if isinstance(cell, dict):
                                    value = cell.get("value")
                                    confidence = float(cell.get("confidence", 0.8))
                                if value in (None, ""):
                                    value = "Не найдено"

                                field_data = {
                                    "name": str(column),
                                    "value": value,
                                    "confidence": confidence,
                                    "coordinate": None,
                                    "group": str(canonical_group),
                                    "row_index": row_index
                                }

                                if json_content and field_data["value"] != "Не найдено":
                                    coord = self._find_coordinate_for_value(
                                        field_data["value"],
                                        json_content
                                    )
                                    if coord:
                                        field_data["coordinate"] = coord

                                result.append(field_data)

                requested_map = {f.lower().strip(): f for f in fields_to_extract}
                seen: dict[str, int] = {}

                for llm_field in data.get("fields", []):
                    if not isinstance(llm_field, dict):
                        continue
                    name = llm_field.get("name")
                    if not name:
                        continue
                    key = str(name).lower().strip()
                    if key not in requested_map:
                        continue

                    canonical_name = requested_map[key]
                    values: list[str] = []
                    if isinstance(llm_field.get("values"), list):
                        values = llm_field.get("values") or []
                    elif isinstance(llm_field.get("value"), list):
                        values = llm_field.get("value") or []
                    else:
                        values = [llm_field.get("value")]

                    for value in values:
                        normalized_value = value if value not in (None, "") else "Не найдено"
                        field_data = {
                            "name": canonical_name,
                            "value": normalized_value,
                            "confidence": float(llm_field.get("confidence", 0.8)),
                            "coordinate": None
                        }

                        if json_content and field_data["value"] != "Не найдено":
                            coord = self._find_coordinate_for_value(
                                field_data["value"],
                                json_content
                            )
                            if coord:
                                field_data["coordinate"] = coord

                        result.append(field_data)
                        seen[canonical_name] = seen.get(canonical_name, 0) + 1

                for field_name in fields_to_extract:
                    if seen.get(field_name, 0) == 0:
                        result.append({
                            "name": field_name,
                            "value": "Не найдено",
                            "confidence": 0.0,
                            "coordinate": None
                        })

                return result

        except (json.JSONDecodeError, ValueError, KeyError, TypeError) as e:
            print(f"Failed to parse LLM field extraction response: {e}")

        # Return default if parsing failed
        return [{"name": f, "value": "Не найдено", "confidence": 0.0, "coordinate": None} for f in fields_to_extract]

    def _safe_parse_json(self, response: str) -> Optional[dict]:
        """Extract and parse JSON from LLM response with light cleanup."""
        if not response:
            return None

        fenced_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", response, re.IGNORECASE)
        candidate = fenced_match.group(1) if fenced_match else self._extract_json_object(response)
        if not candidate:
            return None

        candidate = candidate.strip()

        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

        cleaned = re.sub(r",\s*([}\]])", r"\1", candidate)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass

        try:
            literal = ast.literal_eval(cleaned)
            if isinstance(literal, dict):
                return literal
        except (ValueError, SyntaxError):
            return None

        return None

    def _extract_json_object(self, text: str) -> Optional[str]:
        """Extract the first JSON object from text by balancing braces."""
        start = text.find("{")
        if start == -1:
            return None

        depth = 0
        in_string = False
        escape = False

        for i in range(start, len(text)):
            ch = text[i]

            if in_string:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_string = False
                continue

            if ch == '"':
                in_string = True
                continue
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]

        return None

    def _find_coordinate_for_value(self, value: str, json_content: dict) -> Optional[list[float]]:
        """Find bounding box coordinates for a value in OCR JSON."""
        if not json_content:
            return None

        parsing_res_list = json_content.get('parsing_res_list', [])
        if not parsing_res_list:
            return None

        value_lower = value.lower().strip()

        for block in parsing_res_list:
            block_content = block.get('block_content', '')
            if not block_content:
                continue

            # Check if value is in this block (partial match)
            if value_lower in block_content.lower():
                block_bbox = block.get('block_bbox', [])
                if block_bbox and len(block_bbox) == 4:
                    return block_bbox

        # Try fuzzy match - look for blocks that contain significant part of value
        value_words = value_lower.split()
        if len(value_words) >= 2:
            for block in parsing_res_list:
                block_content = block.get('block_content', '').lower()
                if not block_content:
                    continue

                # Count matching words
                matching_words = sum(1 for word in value_words if word in block_content)
                if matching_words >= len(value_words) * 0.5:  # At least 50% of words match
                    block_bbox = block.get('block_bbox', [])
                    if block_bbox and len(block_bbox) == 4:
                        return block_bbox

        return None

    async def query_document(
        self,
        query: str,
        raw_text: str,
        extracted_fields: Optional[list[dict]] = None,
    ) -> str:
        """
        Answer a free-form user question about a document.

        Args:
            query: User's question
            raw_text: Full OCR text of the document
            extracted_fields: Optional list of already-extracted fields

        Returns:
            LLM answer as plain text
        """
        if not self.is_configured:
            raise RuntimeError("OpenRouter API key not configured")

        text_preview = raw_text[:4000] if len(raw_text) > 4000 else raw_text

        fields_section = ""
        if extracted_fields:
            fields_lines = []
            for f in extracted_fields:
                name = f.get("name", "")
                value = f.get("value", "")
                if value and value != "Не найдено":
                    fields_lines.append(f"- {name}: {value}")
            if fields_lines:
                fields_section = f"\n\nИЗВЛЕЧЁННЫЕ ДАННЫЕ:\n" + "\n".join(fields_lines)

        prompt = f"""Ты - помощник по анализу документов. Ответь на вопрос пользователя на основе содержимого документа.

ТЕКСТ ДОКУМЕНТА:
{text_preview}
{fields_section}

ВОПРОС: {query}

Ответь кратко и по существу на русском языке."""

        return await self._generate(prompt, max_tokens=1000)


# Global singleton instance
llm_service = LLMService()
