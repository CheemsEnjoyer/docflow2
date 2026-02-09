interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system';
  content: Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
      url: string;
    };
  }>;
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}

export interface ExtractedFieldData {
  name: string;
  value: string;
  confidence: number;
  coordinate?: [number, number, number, number]; // [x1, y1, x2, y2]
}

export interface LayoutDetectionBox {
  cls_id: number;
  label: string;
  score: number;
  coordinate: [number, number, number, number];
}

export interface LayoutDetectionResult {
  boxes: LayoutDetectionBox[];
}

export class OpenRouterService {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async convertImageToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async extractDataFromImage(
    imageFile: File,
    fieldsToExtract: string[]
  ): Promise<{
    fields: ExtractedFieldData[];
    rawText: string;
    layout_det_res?: LayoutDetectionResult;
    width?: number;
    height?: number;
  }> {
    try {
      // Convert image to base64
      const base64Image = await this.convertImageToBase64(imageFile);

      // Get image dimensions
      const img = new Image();
      img.src = base64Image;
      await new Promise((resolve) => {
        img.onload = resolve;
      });
      const imageWidth = img.width;
      const imageHeight = img.height;

      // Create prompt for field extraction with coordinates
      const prompt = `Проанализируй этот документ и извлеки следующие данные в формате JSON:

ПОЛЯ ДЛЯ ИЗВЛЕЧЕНИЯ:
${fieldsToExtract.map(field => `- ${field}`).join('\n')}

Верни ответ ТОЛЬКО в формате JSON без дополнительного текста:
{
  "fields": [
    {
      "name": "название поля",
      "value": "значение",
      "confidence": 0.95,
      "coordinate": [x1, y1, x2, y2]
    }
  ],
  "rawText": "весь распознанный текст документа",
  "layout_det_res": {
    "boxes": [
      {
        "cls_id": 22,
        "label": "text",
        "score": 0.9,
        "coordinate": [x1, y1, x2, y2]
      }
    ]
  }
}

ВАЖНО:
- Для каждого поля укажи:
  * name - название поля
  * value - извлеченное значение
  * confidence - уровень уверенности (от 0 до 1)
  * coordinate - координаты [x1, y1, x2, y2] где находится это значение на документе
- Если поле не найдено, укажи "Не найдено" в значении, confidence 0, и coordinate null
- Координаты указывай в формате [x1, y1, x2, y2] где x1,y1 - верхний левый угол, x2,y2 - нижний правый угол
- Для layout_det_res используй label: "header", "text", "table", "paragraph_title" или "footer"
- Размер изображения: ${imageWidth}x${imageHeight} пикселей
- КРИТИЧНО: Для каждого извлеченного поля найди точные координаты где это значение находится на документе!`;

      const messages: OpenRouterMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: base64Image,
              },
            },
          ],
        },
      ];

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Document AI',
        },
        body: JSON.stringify({
          model: 'google/gemma-3-4b-it:free',
          messages,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.statusText}`);
      }

      const data: OpenRouterResponse = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No content in response');
      }

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid JSON response from API');
      }

      const parsedData = JSON.parse(jsonMatch[0]);

      // Return data with layout detection and dimensions
      return {
        fields: parsedData.fields || [],
        rawText: parsedData.rawText || '',
        layout_det_res: parsedData.layout_det_res,
        width: imageWidth,
        height: imageHeight,
      };
    } catch (error) {
      console.error('Error extracting data from image:', error);
      throw error;
    }
  }

  async extractDataFromPDF(
    pdfFile: File,
    fieldsToExtract: string[]
  ): Promise<{ fields: ExtractedFieldData[]; rawText: string }> {
    // For now, PDFs need to be converted to images first
    // This is a placeholder - you would need PDF.js or similar library
    throw new Error('PDF extraction not yet implemented. Please convert PDF to image first.');
  }
}

export default OpenRouterService;
