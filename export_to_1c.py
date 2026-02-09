"""
Экспорт извлечённых данных из OCR в форматы для импорта в 1С:
- XML (CommerceML-подобный формат)
- Excel (.xlsx)
- JSON (для веб-сервисов 1С)
"""

import json
import re
from pathlib import Path
from datetime import datetime
import xml.etree.ElementTree as ET
from xml.dom import minidom

# Опционально: pip install openpyxl
try:
    from openpyxl import Workbook
    EXCEL_AVAILABLE = True
except ImportError:
    EXCEL_AVAILABLE = False
    print("openpyxl не установлен. Excel экспорт недоступен. Установите: pip install openpyxl")


def extract_field_value(text: str, field_name: str) -> str:
    """Извлекает значение поля из текстового блока"""
    patterns = {
        "ИНН продавца": r"ИНН[/КПП]*\s*продавца[:\s]*(\d{10,12})",
        "КПП продавца": r"ИНН/КПП\s*продавца[:\s]*\d{10,12}/(\d{9})",
        "ИНН покупателя": r"ИНН[/КПП]*\s*покупателя[:\s]*(\d{10,12})",
        "КПП покупателя": r"ИНН/КПП\s*покупателя[:\s]*\d{10,12}/(\d{9})",
        "Продавец": r"Продавец[:\s]*([^\n]+)",
        "Покупатель": r"Покупатель[:\s]*([^\n]+)",
        "Адрес продавца": r"Адрес[:\s]*([^\n]+)",
        "Валюта": r"Валюта[:\s]*(?:наименование,\s*код[:\s]*)?([^,\n]+)",
        "Код валюты": r"Валюта[:\s]*наименование,\s*код[:\s]*[^,]+,\s*(\d{3})",
        "Номер счет-фактуры": r"СЧЕТ-ФАКТУРА\s*№\s*(\S+)",
        "Дата счет-фактуры": r"СЧЕТ-ФАКТУРА\s*№\s*\S+\s*от\s*(\d{1,2}\s+\w+\s+\d{4})",
        "Грузоотправитель": r"Грузоотправитель[^:]*[:\s]*([^\n]+)",
        "Грузополучатель": r"Грузополучатель[^:]*[:\s]*([^\n]+)",
    }

    pattern = patterns.get(field_name)
    if not pattern:
        return ""

    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return ""


def parse_ocr_result(json_path: Path) -> dict:
    """Парсит JSON результат OCR и извлекает структурированные данные"""

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Собираем весь текст из блоков
    all_text = "\n".join([
        block.get("block_content", "")
        for block in data.get("parsing_res_list", [])
        if block.get("block_content")
    ])

    # Извлекаем поля
    fields = [
        "ИНН продавца", "КПП продавца", "Продавец", "Адрес продавца",
        "ИНН покупателя", "КПП покупателя", "Покупатель",
        "Валюта", "Код валюты",
        "Номер счет-фактуры", "Дата счет-фактуры",
        "Грузоотправитель", "Грузополучатель"
    ]

    extracted = {}
    for field in fields:
        value = extract_field_value(all_text, field)
        if value:
            extracted[field] = value

    # Добавляем метаданные
    extracted["_source_file"] = str(json_path.name)
    extracted["_extracted_at"] = datetime.now().isoformat()

    return extracted


def export_to_xml(data: dict, output_path: Path) -> None:
    """Экспорт в XML формат для 1С"""

    root = ET.Element("ДанныеДокумента")
    root.set("xmlns", "http://v8.1c.ru/data")
    root.set("ВерсияФормата", "1.0")

    # Метаданные
    meta = ET.SubElement(root, "Метаданные")
    ET.SubElement(meta, "ИсходныйФайл").text = data.get("_source_file", "")
    ET.SubElement(meta, "ДатаИзвлечения").text = data.get("_extracted_at", "")
    ET.SubElement(meta, "ТипДокумента").text = "СчетФактура"

    # Данные продавца
    seller = ET.SubElement(root, "Продавец")
    ET.SubElement(seller, "Наименование").text = data.get("Продавец", "")
    ET.SubElement(seller, "ИНН").text = data.get("ИНН продавца", "")
    ET.SubElement(seller, "КПП").text = data.get("КПП продавца", "")
    ET.SubElement(seller, "Адрес").text = data.get("Адрес продавца", "")

    # Данные покупателя
    buyer = ET.SubElement(root, "Покупатель")
    ET.SubElement(buyer, "Наименование").text = data.get("Покупатель", "")
    ET.SubElement(buyer, "ИНН").text = data.get("ИНН покупателя", "")
    ET.SubElement(buyer, "КПП").text = data.get("КПП покупателя", "")

    # Реквизиты документа
    doc = ET.SubElement(root, "РеквизитыДокумента")
    ET.SubElement(doc, "Номер").text = data.get("Номер счет-фактуры", "")
    ET.SubElement(doc, "Дата").text = data.get("Дата счет-фактуры", "")
    ET.SubElement(doc, "Валюта").text = data.get("Валюта", "")
    ET.SubElement(doc, "КодВалюты").text = data.get("Код валюты", "")

    # Грузоотправитель/Грузополучатель
    shipping = ET.SubElement(root, "ДанныеДоставки")
    ET.SubElement(shipping, "Грузоотправитель").text = data.get("Грузоотправитель", "")
    ET.SubElement(shipping, "Грузополучатель").text = data.get("Грузополучатель", "")

    # Форматируем XML
    xml_str = minidom.parseString(ET.tostring(root, encoding='unicode')).toprettyxml(indent="  ")

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(xml_str)

    print(f"XML сохранён: {output_path}")


def export_to_excel(data: dict, output_path: Path) -> None:
    """Экспорт в Excel для загрузки через обработку 1С"""

    if not EXCEL_AVAILABLE:
        print("Excel экспорт недоступен. Установите openpyxl: pip install openpyxl")
        return

    wb = Workbook()
    ws = wb.active
    ws.title = "Данные документа"

    # Заголовки (формат, понятный для типовых обработок 1С)
    headers = [
        "Поле", "Значение", "Тип данных"
    ]
    ws.append(headers)

    # Маппинг полей на типы данных 1С
    field_types = {
        "ИНН продавца": "Строка",
        "КПП продавца": "Строка",
        "Продавец": "СправочникСсылка.Контрагенты",
        "ИНН покупателя": "Строка",
        "КПП покупателя": "Строка",
        "Покупатель": "СправочникСсылка.Контрагенты",
        "Валюта": "СправочникСсылка.Валюты",
        "Код валюты": "Строка",
        "Номер счет-фактуры": "Строка",
        "Дата счет-фактуры": "Дата",
        "Адрес продавца": "Строка",
        "Грузоотправитель": "Строка",
        "Грузополучатель": "Строка",
    }

    # Данные
    for field, value in data.items():
        if not field.startswith("_"):  # Пропускаем служебные поля
            field_type = field_types.get(field, "Строка")
            ws.append([field, value, field_type])

    # Настройка ширины колонок
    ws.column_dimensions['A'].width = 25
    ws.column_dimensions['B'].width = 50
    ws.column_dimensions['C'].width = 35

    wb.save(output_path)
    print(f"Excel сохранён: {output_path}")


def export_to_json_1c(data: dict, output_path: Path) -> None:
    """Экспорт в JSON для HTTP-сервисов 1С"""

    # Формат для REST API 1С
    export_data = {
        "Документ": {
            "Тип": "СчетФактураПолученный",
            "Реквизиты": {
                "Номер": data.get("Номер счет-фактуры", ""),
                "Дата": data.get("Дата счет-фактуры", ""),
                "Валюта": data.get("Валюта", ""),
                "КодВалюты": data.get("Код валюты", ""),
            },
            "Контрагент": {
                "Наименование": data.get("Продавец", ""),
                "ИНН": data.get("ИНН продавца", ""),
                "КПП": data.get("КПП продавца", ""),
                "Адрес": data.get("Адрес продавца", ""),
            },
            "Организация": {
                "Наименование": data.get("Покупатель", ""),
                "ИНН": data.get("ИНН покупателя", ""),
                "КПП": data.get("КПП покупателя", ""),
            },
            "ДанныеДоставки": {
                "Грузоотправитель": data.get("Грузоотправитель", ""),
                "Грузополучатель": data.get("Грузополучатель", ""),
            }
        },
        "_meta": {
            "source": data.get("_source_file", ""),
            "extracted_at": data.get("_extracted_at", ""),
            "format_version": "1.0"
        }
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(export_data, f, ensure_ascii=False, indent=2)

    print(f"JSON для 1С сохранён: {output_path}")


def process_document(json_path: str, output_dir: str = "output") -> dict:
    """
    Основная функция: обрабатывает OCR результат и экспортирует во все форматы

    Args:
        json_path: Путь к JSON файлу с результатом OCR
        output_dir: Папка для сохранения результатов

    Returns:
        Словарь с извлечёнными данными
    """
    json_path = Path(json_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(exist_ok=True)

    # Извлекаем данные
    print(f"Обработка: {json_path}")
    extracted_data = parse_ocr_result(json_path)

    # Выводим извлечённые поля
    print("\n=== Извлечённые поля ===")
    for field, value in extracted_data.items():
        if not field.startswith("_"):
            print(f"  {field}: {value}")

    # Базовое имя для файлов
    base_name = json_path.stem.replace("_res", "")

    # Экспортируем во все форматы
    print("\n=== Экспорт ===")
    export_to_xml(extracted_data, output_dir / f"{base_name}_1c.xml")
    export_to_json_1c(extracted_data, output_dir / f"{base_name}_1c.json")

    if EXCEL_AVAILABLE:
        export_to_excel(extracted_data, output_dir / f"{base_name}_1c.xlsx")

    return extracted_data


# === ПРИМЕР ИСПОЛЬЗОВАНИЯ ===
if __name__ == "__main__":
    # Обработка одного документа
    result = process_document("output/6_res.json", "output")

    print("\n=== Готово! ===")
    print("Файлы для импорта в 1С:")
    print("  - output/6_1c.xml   - для загрузки через обработку XML")
    print("  - output/6_1c.json  - для HTTP-сервисов/REST API")
    print("  - output/6_1c.xlsx  - для загрузки через табличный документ")
