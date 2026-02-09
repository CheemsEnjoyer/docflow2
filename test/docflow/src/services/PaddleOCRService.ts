export interface ExtractedFieldData {
  name: string;
  value: string;
  confidence: number;
  coordinate?: [number, number, number, number];
}

export interface PaddleOCRResponse {
  fields: ExtractedFieldData[];
  rawText: string;
  htmlContent: string;
  jsonContent: Record<string, unknown>;
  success: boolean;
  error?: string;
}

export class PaddleOCRService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || import.meta.env.VITE_PADDLE_URL || 'http://localhost:5000';
  }

  /**
   * Check if PaddleOCR service is running
   */
  async healthCheck(): Promise<{ ok: boolean; apiConfigured: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`);
      const data = await response.json();
      return {
        ok: data.status === 'ok',
        apiConfigured: data.api_configured === true
      };
    } catch (error) {
      console.error('PaddleOCR service health check failed:', error);
      return { ok: false, apiConfigured: false };
    }
  }

  /**
   * Extract data from document (image or PDF) with HTML output
   */
  async extractDocument(
    file: File,
    fieldsToExtract: string[] = []
  ): Promise<{
    fields: ExtractedFieldData[];
    rawText: string;
    htmlContent: string;
    jsonContent: Record<string, unknown>;
  }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fields', JSON.stringify(fieldsToExtract));

      const response = await fetch(`${this.baseUrl}/api/extract`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to extract data from document');
      }

      const data: PaddleOCRResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Extraction failed');
      }

      return {
        fields: data.fields,
        rawText: data.rawText,
        htmlContent: data.htmlContent,
        jsonContent: data.jsonContent,
      };
    } catch (error) {
      console.error('Error extracting document:', error);
      throw error;
    }
  }

  /**
   * Extract data with JSON output format
   */
  async extractDocumentJson(
    file: File,
    fieldsToExtract: string[] = []
  ): Promise<{
    fields: ExtractedFieldData[];
    jsonContent: Record<string, unknown>;
  }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fields', JSON.stringify(fieldsToExtract));

      const response = await fetch(`${this.baseUrl}/api/extract-json`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to extract data from document');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Extraction failed');
      }

      return {
        fields: data.fields,
        jsonContent: data.jsonContent,
      };
    } catch (error) {
      console.error('Error extracting document JSON:', error);
      throw error;
    }
  }
}

export default PaddleOCRService;
