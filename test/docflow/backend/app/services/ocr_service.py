import os
import re
import json
import tempfile
import shutil
import asyncio
from pathlib import Path
from app.core.config import settings
from app.services.document_converter import (
    is_pdf, is_word, convert_document_for_ocr
)
from app.services.llm_service import llm_service

# === DeepSeek OCR 2 Initialization ===
OCR_INITIALIZED = False
ocr_model = None
ocr_tokenizer = None


def _init_deepseek_ocr():
    """Initialize DeepSeek OCR 2"""
    global ocr_model, ocr_tokenizer, OCR_INITIALIZED

    try:
        import torch
        from transformers import AutoModel, AutoTokenizer

        print("--- Инициализация DeepSeek OCR 2 ---")

        if settings.USE_GPU and torch.cuda.is_available():
            os.environ["CUDA_VISIBLE_DEVICES"] = '0'
            device = "cuda"
        else:
            device = "cpu"
            print("GPU недоступен, используем CPU")

        ocr_tokenizer = AutoTokenizer.from_pretrained(
            settings.DEEPSEEK_MODEL,
            trust_remote_code=True
        )

        if device == "cuda":
            # Load directly to GPU with correct dtype for Flash Attention 2
            ocr_model = AutoModel.from_pretrained(
                settings.DEEPSEEK_MODEL,
                _attn_implementation='flash_attention_2',
                trust_remote_code=True,
                use_safetensors=True,
                torch_dtype=torch.bfloat16,
                device_map="cuda"
            )
            ocr_model = ocr_model.eval()
        else:
            ocr_model = AutoModel.from_pretrained(
                settings.DEEPSEEK_MODEL,
                _attn_implementation='eager',
                trust_remote_code=True,
                use_safetensors=True
            )
            ocr_model = ocr_model.eval()

        OCR_INITIALIZED = True
        print(f"DeepSeek OCR 2 успешно инициализирован ({device.upper()} режим)")
        return True

    except Exception as e:
        print(f"Ошибка инициализации DeepSeek OCR: {e}")
        return False


# Initialize OCR
_init_deepseek_ocr()


def is_ocr_initialized() -> bool:
    """Check if OCR is initialized"""
    return OCR_INITIALIZED


# Legacy alias
def is_paddle_initialized() -> bool:
    """Legacy alias for is_ocr_initialized"""
    return OCR_INITIALIZED


TABLE_FIELD_PREFIX = "table:"
TABLE_FIELD_SEPARATOR = "::"


def _parse_field_specs(fields_to_extract: list[str]) -> tuple[list[str], dict[str, list[str]]]:
    single_fields: list[str] = []
    table_groups: dict[str, list[str]] = {}

    for raw_field in fields_to_extract:
        if not raw_field:
            continue
        raw_field = raw_field.strip()
        if raw_field.startswith(TABLE_FIELD_PREFIX) and TABLE_FIELD_SEPARATOR in raw_field:
            payload = raw_field[len(TABLE_FIELD_PREFIX):]
            group, name = payload.split(TABLE_FIELD_SEPARATOR, 1)
            group = group.strip()
            name = name.strip()
            if not group or not name:
                continue
            columns = table_groups.setdefault(group, [])
            if name not in columns:
                columns.append(name)
        else:
            if raw_field not in single_fields:
                single_fields.append(raw_field)

    return single_fields, table_groups


def _parse_deepseek_grounding(ocr_result: str, img_width: int, img_height: int) -> list[dict]:
    """
    Parse DeepSeek OCR 2 grounding output to structured format.

    DeepSeek output format:
    <|ref|>label<|/ref|><|det|>[[x1, y1, x2, y2]]<|/det|>
    text content (on next lines until next <|ref|> or end)
    """
    blocks = []

    if not ocr_result:
        return []

    # Split by <|ref|> tags to get each block
    # Pattern: capture label, coords, and content until next <|ref|> or end
    pattern = r'<\|ref\|>([^<]*)<\|/ref\|><\|det\|>\[\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]\]<\|/det\|>\s*\n?([\s\S]*?)(?=<\|ref\|>|$)'

    matches = re.findall(pattern, ocr_result)

    for i, match in enumerate(matches):
        label, x1, y1, x2, y2, text = match

        # Clean text content
        text = text.strip()
        # Remove trailing empty lines
        text = re.sub(r'\n\s*$', '', text)

        # DeepSeek coords are normalized to 1000, convert to pixels
        x1_px = int(int(x1) * img_width / 1000)
        y1_px = int(int(y1) * img_height / 1000)
        x2_px = int(int(x2) * img_width / 1000)
        y2_px = int(int(y2) * img_height / 1000)

        blocks.append({
            "block_id": i,
            "block_label": label.strip(),
            "block_content": text,
            "block_bbox": [x1_px, y1_px, x2_px, y2_px]
        })

    return blocks


def _normalize_deepseek_markdown(text: str) -> str:
    """Extract clean markdown text from DeepSeek grounding output."""
    if not text:
        return ""

    # Remove all grounding tags but keep the content after them
    # Pattern: remove <|ref|>...<|/ref|><|det|>...<|/det|> but keep what follows
    cleaned = re.sub(r'<\|ref\|>[^<]*<\|/ref\|><\|det\|>\[\[[^\]]+\]\]<\|/det\|>\s*', '', text)

    # Remove any remaining tags
    cleaned = re.sub(r'<\|/?[^|]+\|>', '', cleaned)

    # Clean up multiple newlines
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)

    return cleaned.strip()


def _coerce_deepseek_result(result: object) -> str:
    if isinstance(result, str):
        return result
    if isinstance(result, list):
        return "\n".join(str(item) for item in result if item)
    if isinstance(result, dict):
        for key in ("markdown", "text", "result", "output", "content"):
            value = result.get(key)
            if isinstance(value, str) and value.strip():
                return value
    return ""


def _load_deepseek_output_text(output_dir: str) -> str:
    try:
        base = Path(output_dir)
        candidates = []
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            # Include .mmd (markdown) files from DeepSeek OCR 2
            if path.suffix.lower() in {".md", ".mmd", ".txt"}:
                candidates.append(path)
            elif path.suffix.lower() == ".json":
                candidates.append(path)

        if not candidates:
            return ""

        # Prefer largest file
        candidates.sort(key=lambda p: p.stat().st_size, reverse=True)
        for path in candidates:
            try:
                if path.suffix.lower() == ".json":
                    payload = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
                    for key in ("markdown", "text", "result", "output", "content"):
                        value = payload.get(key)
                        if isinstance(value, str) and value.strip():
                            return value
                    # Fallback to raw JSON string
                    return path.read_text(encoding="utf-8", errors="ignore")
                return path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
    except Exception:
        return ""

    return ""


def _process_image(image_path: str, output_dir: str) -> tuple[str, dict, str]:
    """Process image with DeepSeek OCR 2"""
    from PIL import Image

    # Get image dimensions
    with Image.open(image_path) as img:
        img_w, img_h = img.size

    if settings.DEBUG:
        print(f"[DeepSeek OCR] Processing: {image_path} ({img_w}x{img_h})")

    # Run OCR with grounding
    prompt = "<image>\n<|grounding|>Convert the document to markdown. "

    try:
        # Convert path to absolute and use forward slashes for compatibility
        abs_image_path = os.path.abspath(image_path).replace('\\', '/')
        abs_output_dir = os.path.abspath(output_dir).replace('\\', '/')

        # Capture stdout in case model prints result instead of returning it
        import io
        import sys

        old_stdout = sys.stdout
        sys.stdout = captured_output = io.StringIO()

        try:
            result = ocr_model.infer(
                ocr_tokenizer,
                prompt=prompt,
                image_file=abs_image_path,
                output_path=abs_output_dir,
                base_size=settings.DEEPSEEK_BASE_SIZE,
                image_size=settings.DEEPSEEK_IMAGE_SIZE,
                crop_mode=True,
                save_results=True
            )
        finally:
            sys.stdout = old_stdout

        captured_text = captured_output.getvalue()
        # Only log in debug mode, suppress noisy model output
        if settings.DEBUG:
            print(f"[DeepSeek OCR] infer() returned: {type(result)}")

        # If result is None but we captured output, try to extract OCR result
        if result is None and captured_text:
            lines = captured_text.split('\n')
            ocr_lines = [l for l in lines if '<|ref|>' in l or '<|det|>' in l or
                        (l.strip() and not l.startswith('=') and 'it/s' not in l and
                         '%|' not in l and 'BASE:' not in l and 'PATCHES:' not in l)]
            if ocr_lines:
                result = '\n'.join(ocr_lines)
    except Exception as e:
        print(f"[DeepSeek OCR] infer() exception: {e}")
        import traceback
        traceback.print_exc()
        result = None

    raw_result = _coerce_deepseek_result(result)

    if not raw_result:
        raw_result = _load_deepseek_output_text(abs_output_dir)
        if settings.DEBUG:
            print(f"[DeepSeek OCR] Loaded from files, length: {len(raw_result) if raw_result else 0}")

    # Parse grounding blocks
    blocks = _parse_deepseek_grounding(raw_result, img_w, img_h)

    if settings.DEBUG:
        print(f"[DeepSeek OCR] Parsed {len(blocks)} blocks, text length: {len(raw_result)}")

    json_content = {
        "input_path": image_path,
        "width": img_w,
        "height": img_h,
        "parsing_res_list": blocks
    }

    # Extract markdown (clean text without grounding tags)
    if settings.DEEPSEEK_CLEAN_MARKDOWN:
        markdown = _normalize_deepseek_markdown(raw_result)
    else:
        markdown = raw_result or ""

    # If markdown is empty, use raw result
    if not markdown:
        markdown = raw_result or ""

    # Ensure markdown is always a string
    if not isinstance(markdown, str):
        markdown = str(markdown) if markdown else ""

    return markdown, json_content, raw_result or ""


def extract_document(file_path: str, fields_to_extract: list[str] = None, document_type_id: str | None = None) -> dict:
    """
    Extract content from a document using DeepSeek OCR 2.
    Supports images, PDF, and Word documents.

    Args:
        file_path: Path to the document file
        fields_to_extract: List of field names to extract (uses LLM for extraction)
        document_type_id: Optional process ID for tracking
    """
    if not OCR_INITIALIZED or ocr_model is None:
        raise Exception("DeepSeek OCR не инициализирован")

    filename = os.path.basename(file_path)
    temp_dir = None
    all_markdown_content = []
    all_raw_content = []
    all_json_content = {"parsing_res_list": []}
    extracted_text_fallback = None

    try:
        # Check if document needs conversion
        if is_pdf(filename) or is_word(filename):
            temp_dir = tempfile.mkdtemp()
            conversion_result = convert_document_for_ocr(file_path, temp_dir)
            images_to_process = conversion_result["images"]
            extracted_text_fallback = conversion_result["extracted_text"]
        else:
            images_to_process = [file_path]

        # Create output directory for results
        output_dir = tempfile.mkdtemp()

        # Process each image/page
        for i, image_path in enumerate(images_to_process):
            # Skip non-image files
            if image_path.endswith('.txt'):
                continue

            markdown, json_content, raw_result = _process_image(image_path, output_dir)
            if markdown is None:
                markdown = ""

            all_markdown_content.append(markdown)
            if raw_result:
                all_raw_content.append(raw_result)
            all_json_content["parsing_res_list"].extend(json_content.get("parsing_res_list", []))

        markdown_content = "\n\n---\n\n".join(all_markdown_content)
        raw_text_raw = "\n\n---\n\n".join(all_raw_content)

        # If OCR didn't extract text but we have fallback text from PDF/Word
        if not markdown_content.strip() and extracted_text_fallback:
            markdown_content = extracted_text_fallback
        if settings.OCR_LOG_PREVIEW_CHARS > 0:
            preview = markdown_content[: settings.OCR_LOG_PREVIEW_CHARS].replace("\n", "\\n")
            print(f"OCR preview ({len(markdown_content)} chars): {preview}")

        # Extract fields using LLM
        extracted_fields = []
        if fields_to_extract:
            single_fields, table_groups = _parse_field_specs(fields_to_extract)
            if single_fields or table_groups:
                extracted_fields = extract_fields_with_llm(
                    markdown_content,
                    single_fields,
                    all_json_content,
                    table_groups=table_groups,
                    document_type_id=document_type_id
                )

        # Cleanup output directory
        shutil.rmtree(output_dir, ignore_errors=True)

        # Create highlighted image if fields were extracted
        highlighted_image_path = None
        if extracted_fields and images_to_process:
            try:
                # Use first image for highlighting
                original_image = images_to_process[0]
                if not original_image.endswith('.txt'):
                    highlighted_image_path = create_highlighted_image(
                        original_image,
                        extracted_fields,
                        all_json_content
                    )
            except Exception as e:
                print(f"Failed to create highlighted image: {e}")

        return {
            "fields": extracted_fields,
            "rawText": markdown_content,
            "rawTextRaw": raw_text_raw,
            "jsonContent": all_json_content,
            "highlightedImage": highlighted_image_path,
            "pageImages": images_to_process if (is_pdf(filename) or is_word(filename)) else [],
            "_temp_dir": temp_dir,
        }

    except Exception:
        # Cleanup temp directory on error
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise


def create_highlighted_image(
    image_path: str,
    extracted_fields: list[dict],
    json_content: dict,
    output_path: str = None
) -> str:
    """
    Create an image with highlighted extracted fields.

    Args:
        image_path: Path to the original image
        extracted_fields: List of extracted fields with 'coordinate' (bbox) from LLM
        json_content: OCR result with parsing_res_list (for fallback lookup)
        output_path: Optional output path, if None - creates next to original

    Returns:
        Path to the highlighted image
    """
    from PIL import Image, ImageDraw, ImageFont

    # Load original image
    img = Image.open(image_path).convert('RGB')
    draw = ImageDraw.Draw(img, 'RGBA')

    # Build value -> bbox mapping from json_content for fallback
    value_to_bbox = {}
    for block in json_content.get("parsing_res_list", []):
        content = block.get("block_content", "")
        bbox = block.get("block_bbox")
        if content and bbox and len(bbox) == 4:
            value_to_bbox[content.lower().strip()] = bbox

    # Color palette for different fields
    colors = [
        ((231, 76, 60), (231, 76, 60, 80)),      # Red
        ((52, 152, 219), (52, 152, 219, 80)),    # Blue
        ((155, 89, 182), (155, 89, 182, 80)),    # Purple
        ((46, 204, 113), (46, 204, 113, 80)),    # Green
        ((243, 156, 18), (243, 156, 18, 80)),    # Orange
        ((26, 188, 156), (26, 188, 156, 80)),    # Teal
        ((230, 126, 34), (230, 126, 34, 80)),    # Dark Orange
        ((22, 160, 133), (22, 160, 133, 80)),    # Dark Teal
    ]

    # Try to load a font for labels
    try:
        font = ImageFont.truetype("arial.ttf", 14)
    except:
        font = ImageFont.load_default()

    # Draw each field
    field_colors = {}
    color_idx = 0
    highlighted_count = 0

    for field in extracted_fields:
        field_name = field.get("name", "")
        field_value = field.get("value", "")

        # Skip "Не найдено" fields
        if field_value == "Не найдено":
            continue

        # Get bbox from field's coordinate or try to find by value
        bbox = field.get("coordinate")

        if not bbox:
            # Try to find bbox by matching value in json_content
            value_lower = str(field_value).lower().strip()
            for content, content_bbox in value_to_bbox.items():
                if value_lower in content or content in value_lower:
                    bbox = content_bbox
                    break

        if not bbox or len(bbox) != 4:
            continue

        # Assign color to field
        if field_name not in field_colors:
            field_colors[field_name] = colors[color_idx % len(colors)]
            color_idx += 1

        line_color, fill_color = field_colors[field_name]

        x1, y1, x2, y2 = bbox

        # Ensure coordinates are integers
        x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)

        # Draw semi-transparent fill
        draw.rectangle([x1, y1, x2, y2], fill=fill_color, outline=line_color, width=2)

        # Draw label above the box
        label = f"{field_name}: {field_value[:30]}..." if len(str(field_value)) > 30 else f"{field_name}: {field_value}"
        text_bbox = draw.textbbox((x1, y1 - 18), label, font=font)

        # Background for label
        draw.rectangle(
            [text_bbox[0] - 2, text_bbox[1] - 2, text_bbox[2] + 2, text_bbox[3] + 2],
            fill=line_color
        )
        draw.text((x1, y1 - 18), label, fill=(255, 255, 255), font=font)
        highlighted_count += 1

    # Only save if we highlighted something
    if highlighted_count == 0:
        return None

    # Determine output path
    if not output_path:
        base, ext = os.path.splitext(image_path)
        output_path = f"{base}_highlighted{ext}"

    img.save(output_path)
    return output_path


def create_highlighted_image_from_blocks(
    image_path: str,
    blocks: list[dict],
    output_path: str = None,
    show_all: bool = False
) -> str:
    """
    Create an image with highlighted OCR blocks.

    Args:
        image_path: Path to the original image
        blocks: List of blocks with block_bbox and optionally block_label
        output_path: Optional output path
        show_all: If True, highlight all blocks; if False, only labeled ones

    Returns:
        Path to the highlighted image
    """
    from PIL import Image, ImageDraw, ImageFont

    img = Image.open(image_path).convert('RGB')
    draw = ImageDraw.Draw(img, 'RGBA')

    # Color by label type
    label_colors = {
        "text": ((100, 100, 100), (100, 100, 100, 40)),
        "table": ((52, 152, 219), (52, 152, 219, 60)),
        "sub_title": ((231, 76, 60), (231, 76, 60, 60)),
        "title": ((155, 89, 182), (155, 89, 182, 60)),
    }
    default_color = ((46, 204, 113), (46, 204, 113, 50))

    try:
        font = ImageFont.truetype("arial.ttf", 12)
    except:
        font = ImageFont.load_default()

    for block in blocks:
        bbox = block.get("block_bbox")
        label = block.get("block_label", "")

        if not bbox or len(bbox) != 4:
            continue

        if not show_all and label == "text":
            continue

        x1, y1, x2, y2 = bbox
        line_color, fill_color = label_colors.get(label, default_color)

        draw.rectangle([x1, y1, x2, y2], fill=fill_color, outline=line_color, width=2)

        if label:
            draw.text((x1 + 2, y1 + 2), label, fill=line_color, font=font)

    if not output_path:
        base, ext = os.path.splitext(image_path)
        output_path = f"{base}_blocks{ext}"

    img.save(output_path)
    return output_path


def extract_fields_with_llm(
    text: str,
    fields_to_extract: list[str],
    json_content: dict,
    table_groups: dict[str, list[str]] | None = None,
    document_type_id: str | None = None
) -> list[dict]:
    """
    Extract fields using LLM service.
    Runs async code in sync context.
    """
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    try:
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    asyncio.run,
                    llm_service.extract_fields(
                        text,
                        fields_to_extract,
                        json_content,
                        table_groups=table_groups,
                        document_type_id=document_type_id
                    )
                )
                return future.result()
        else:
            return loop.run_until_complete(
                llm_service.extract_fields(
                    text,
                    fields_to_extract,
                    json_content,
                    table_groups=table_groups,
                    document_type_id=document_type_id
                )
            )
    except Exception as e:
        print(f"LLM extraction failed: {e}")
        raise
