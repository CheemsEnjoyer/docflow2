import type { DocumentTypeConfig } from '../types/process';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AUTH_TOKEN_KEY = 'docflow_auth_token';
const AUTH_USER_KEY = 'docflow_auth_user';

export interface AuthUser {
  id: string;
  username: string;
  full_name?: string | null;
  role: 'admin' | 'user';
}

export const authStorage = {
  getToken: (): string | null => localStorage.getItem(AUTH_TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(AUTH_TOKEN_KEY, token),
  clearToken: () => localStorage.removeItem(AUTH_TOKEN_KEY),
  getUser: (): AuthUser | null => {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  },
  setUser: (user: AuthUser) => localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user)),
  clearUser: () => localStorage.removeItem(AUTH_USER_KEY),
  clearAll: () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  },
};

const getAuthHeaders = () => {
  const token = authStorage.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Document types API
interface DocumentTypeApiResponse {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  fields: string[];
  export_keys: Record<string, string> | null;
}

interface DocumentTypeListApiResponse {
  items: DocumentTypeApiResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

const transformDocumentType = (data: DocumentTypeApiResponse): DocumentTypeConfig => ({
  id: data.id,
  name: data.name,
  description: data.description || '',
  createdAt: new Date(data.created_at),
  updatedAt: new Date(data.updated_at),
  fields: data.fields || [],
  exportKeys: data.export_keys || {},
});

export const documentTypeApi = {
  async getAll(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    sortBy?: 'name' | 'created_at';
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ documentTypes: DocumentTypeConfig[]; total: number; pages: number }> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.pageSize) searchParams.set('page_size', params.pageSize.toString());
    if (params?.search) searchParams.set('search', params.search);
    if (params?.sortBy) searchParams.set('sort_by', params.sortBy);
    if (params?.sortOrder) searchParams.set('sort_order', params.sortOrder);

    const response = await fetch(`${API_BASE_URL}/document-types?${searchParams}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch document types');
    }

    const data: DocumentTypeListApiResponse = await response.json();
    return {
      documentTypes: data.items.map(transformDocumentType),
      total: data.total,
      pages: data.pages,
    };
  },

  async getById(id: string): Promise<DocumentTypeConfig> {
    const response = await fetch(`${API_BASE_URL}/document-types/${id}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Document type not found');
    }

    const data: DocumentTypeApiResponse = await response.json();
    return transformDocumentType(data);
  },

  async create(
    name: string,
    description: string,
    fields?: string[],
    exportKeys?: Record<string, string>
  ): Promise<DocumentTypeConfig> {
    const response = await fetch(`${API_BASE_URL}/document-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        name,
        description,
        fields: fields || [],
        export_keys: exportKeys || {},
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create document type');
    }

    const data: DocumentTypeApiResponse = await response.json();
    return transformDocumentType(data);
  },

  async update(
    id: string,
    updates: Partial<{
      name: string;
      description: string;
      fields: string[];
      exportKeys: Record<string, string>;
    }>
  ): Promise<DocumentTypeConfig> {
    const body: Record<string, unknown> = {};
    if (updates.name !== undefined) body.name = updates.name;
    if (updates.description !== undefined) body.description = updates.description;
    if (updates.fields !== undefined) body.fields = updates.fields;
    if (updates.exportKeys !== undefined) body.export_keys = updates.exportKeys;

    const response = await fetch(`${API_BASE_URL}/document-types/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update document type');
    }

    const data: DocumentTypeApiResponse = await response.json();
    return transformDocumentType(data);
  },

  async delete(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/document-types/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok && response.status !== 204) {
      throw new Error('Failed to delete document type');
    }
  },
};

// Processing runs API
export interface ProcessedDocumentBrief {
  id: string;
  filename: string;
  status: 'processing' | 'needs_review' | 'reviewed' | 'error';
  fields_count: number;
}

export interface ProcessingRunResponse {
  id: string;
  document_type_id: string;
  document_type_name: string | null;
  user_id: string;
  source: 'manual' | 'trigger';
  trigger_name: string | null;
  status: 'processing' | 'needs_review' | 'reviewed' | 'error';
  created_at: string;
  updated_at: string;
  documents: ProcessedDocumentBrief[];
}

export interface ExtractedField {
  name: string;
  value: string | null;
  confidence: number;
  coordinate: [number, number, number, number] | null;
  group?: string | null;
  row_index?: number | null;
  original_value: string | null;
  is_corrected: boolean;
}

export interface ProcessedDocumentResponse {
  id: string;
  filename: string;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  status: 'processing' | 'needs_review' | 'reviewed' | 'error';
  raw_text: string | null;
  raw_text_raw: string | null;
  highlighted_image: string | null;
  preview_image: string | null;
  fields_count: number;
  extracted_fields: ExtractedField[];
  created_at: string;
}

export interface ProcessingRunDetailResponse {
  id: string;
  document_type_id: string;
  document_type_name: string | null;
  user_id: string;
  source: 'manual' | 'trigger';
  trigger_name: string | null;
  status: 'processing' | 'needs_review' | 'reviewed' | 'error';
  created_at: string;
  updated_at: string;
  documents: ProcessedDocumentResponse[];
}

export const processingRunApi = {
  async getAll(params?: { skip?: number; limit?: number; userId?: string }): Promise<ProcessingRunResponse[]> {
    const searchParams = new URLSearchParams();
    if (params?.skip !== undefined) searchParams.set('skip', params.skip.toString());
    if (params?.limit !== undefined) searchParams.set('limit', params.limit.toString());
    if (params?.userId) searchParams.set('user_id', params.userId);

    const response = await fetch(`${API_BASE_URL}/processing-runs?${searchParams}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch processing runs');
    }
    const data = await response.json();
    return data.items || [];
  },

  async getByDocumentType(documentTypeId: string): Promise<ProcessingRunResponse[]> {
    const response = await fetch(`${API_BASE_URL}/processing-runs/by-document-type/${documentTypeId}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch processing runs');
    }
    const data = await response.json();
    return data.items || [];
  },

  async getById(runId: string): Promise<ProcessingRunDetailResponse> {
    const response = await fetch(`${API_BASE_URL}/processing-runs/${runId}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Processing run not found');
    }
    return response.json();
  },

  async updateDocumentType(runId: string, documentTypeId: string): Promise<ProcessingRunResponse> {
    const response = await fetch(`${API_BASE_URL}/processing-runs/${runId}/document-type`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ document_type_id: documentTypeId }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update document type');
    }
    return response.json();
  },

  async delete(runId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/processing-runs/${runId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!response.ok && response.status !== 204) {
      throw new Error('Failed to delete processing run');
    }
  },

  async markReviewed(runId: string): Promise<ProcessingRunResponse> {
    const response = await fetch(`${API_BASE_URL}/processing-runs/${runId}/mark-reviewed`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to mark as reviewed');
    }
    return response.json();
  },

  async cancelReview(runId: string): Promise<ProcessingRunResponse> {
    const response = await fetch(`${API_BASE_URL}/processing-runs/${runId}/cancel-review`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to cancel review');
    }
    return response.json();
  },

  async markDocumentReviewed(documentId: string): Promise<ProcessedDocumentResponse & { run_status: string | null }> {
    const response = await fetch(`${API_BASE_URL}/processing-runs/documents/${documentId}/mark-reviewed`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to mark document as reviewed');
    }
    return response.json();
  },

  async cancelDocumentReview(documentId: string): Promise<ProcessedDocumentResponse & { run_status: string | null }> {
    const response = await fetch(`${API_BASE_URL}/processing-runs/documents/${documentId}/cancel-review`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to cancel document review');
    }
    return response.json();
  },

  async updateDocumentStatus(
    documentId: string,
    status: 'processing' | 'needs_review' | 'reviewed' | 'error'
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/processing-runs/documents/${documentId}/status?status=${status}`,
      {
        method: 'PATCH',
        headers: getAuthHeaders(),
      },
    );
    if (!response.ok) {
      throw new Error('Failed to update document status');
    }
  },

  async updateField(documentId: string, fieldIndex: number, value: string): Promise<ProcessedDocumentResponse> {
    const response = await fetch(`${API_BASE_URL}/processing-runs/documents/${documentId}/fields`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ field_index: fieldIndex, value }),
    });
    if (!response.ok) {
      throw new Error('Failed to update field');
    }
    return response.json();
  },

  getDocumentFileUrl(documentId: string): string {
    return `${API_BASE_URL}/documents/${documentId}/file`;
  },

  getHighlightedImageUrl(documentId: string): string {
    return `${API_BASE_URL}/documents/${documentId}/highlighted`;
  },

  getDocumentPreviewUrl(documentId: string): string {
    return `${API_BASE_URL}/documents/${documentId}/preview`;
  },

  async queryDocument(documentId: string, query: string): Promise<{ answer: string; document_id: string }> {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Query failed' }));
      throw new Error(error.detail || 'Failed to query document');
    }
    return response.json();
  },

  async getQueryHistory(documentId: string): Promise<{
    document_id: string;
    items: Array<{ id: string; question: string; answer: string; error?: string; created_at: string }>;
  }> {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/query-history`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to load query history');
    }
    return response.json();
  },

  async clearQueryHistory(documentId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/query-history`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to clear query history');
    }
  },

  async exportRun(runId: string, format: 'xlsx' | 'csv' = 'xlsx'): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/processing-runs/${runId}/export?format=${format}`,
      { headers: getAuthHeaders() },
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Export failed' }));
      throw new Error(error.detail || 'Failed to export');
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const filenameMatch = disposition.match(/filename="?(.+?)"?$/);
    const filename = filenameMatch ? filenameMatch[1] : `export.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// Extraction API
export const extractionApi = {
  async healthCheck(): Promise<{ ok: boolean; apiConfigured: boolean }> {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      const data = await response.json();
      return {
        ok: data.status === 'ok',
        apiConfigured: data.api_configured === true,
      };
    } catch {
      return { ok: false, apiConfigured: false };
    }
  },

  async extract(
    file: File,
    fields: string[] = []
  ): Promise<{
    fields: Array<{
      name: string;
      value: string;
      confidence: number;
      coordinate?: [number, number, number, number];
      group?: string | null;
      row_index?: number | null;
    }>;
    rawText: string;
    rawTextRaw: string;
    jsonContent: Record<string, unknown>;
  }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fields', JSON.stringify(fields));

    const response = await fetch(`${API_BASE_URL}/extract`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to extract data');
    }

    const data = await response.json();
    return {
      fields: data.fields,
      rawText: data.raw_text,
      rawTextRaw: data.raw_text_raw || '',
      jsonContent: data.json_content,
    };
  },

  async extractAndSave(
    documentTypeId: string,
    file: File,
    fields: string[] = [],
    source: 'manual' | 'trigger' = 'manual',
    processingRunId?: string
  ): Promise<{
    success: boolean;
    processingRunId: string;
    documentId: string;
    documentTypeId: string;
    documentTypeName: string;
    fieldsExtracted: number;
    status: string;
  }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fields', JSON.stringify(fields));
    formData.append('source', source);
    if (processingRunId) {
      formData.append('processing_run_id', processingRunId);
    }

    const response = await fetch(`${API_BASE_URL}/document-type/${documentTypeId}/extract`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to extract and save');
    }

    const data = await response.json();
    return {
      success: data.success,
      processingRunId: data.processing_run_id,
      documentId: data.document_id,
      documentTypeId: data.document_type_id,
      documentTypeName: data.document_type_name,
      fieldsExtracted: data.fields_extracted,
      status: data.status,
    };
  },

  async extractAuto(
    file: File,
    source: 'manual' | 'trigger' = 'manual',
    processingRunId?: string
  ): Promise<{
    success: boolean;
    processingRunId: string;
    documentId: string;
    documentTypeId: string;
    documentTypeName: string;
    fieldsExtracted: number;
    status: string;
  }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('source', source);
    if (processingRunId) {
      formData.append('processing_run_id', processingRunId);
    }

    const response = await fetch(`${API_BASE_URL}/extract-auto`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to auto-extract');
    }

    const data = await response.json();
    return {
      success: data.success,
      processingRunId: data.processing_run_id,
      documentId: data.document_id,
      documentTypeId: data.document_type_id,
      documentTypeName: data.document_type_name,
      fieldsExtracted: data.fields_extracted,
      status: data.status,
    };
  },
};

// Search API
export interface SearchResult {
  document_id: string;
  filename: string;
  document_type_id: string;
  document_type_name: string;
  run_id: string;
  relevance_score: number;
  snippet: string;
  status: 'processing' | 'needs_review' | 'reviewed' | 'error';
  created_at: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  used_rerank: boolean;
}

export interface SearchStats {
  indexed_documents: number;
  pending_documents: number;
  total_documents: number;
  embedding_model: string;
  rerank_enabled: boolean;
  rerank_model: string | null;
}

export const searchApi = {
  async search(
    query: string,
    options?: {
      documentTypeId?: string;
      limit?: number;
      useRerank?: boolean;
    }
  ): Promise<SearchResponse> {
    const params = new URLSearchParams({ query });
    if (options?.documentTypeId) params.set('document_type_id', options.documentTypeId);
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.useRerank !== undefined) params.set('use_rerank', String(options.useRerank));

    const response = await fetch(`${API_BASE_URL}/search?${params}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Search failed');
    }

    return response.json();
  },

  async getStats(): Promise<SearchStats> {
    const response = await fetch(`${API_BASE_URL}/search/stats`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to get search stats');
    }
    return response.json();
  },

  async reindex(batchSize?: number): Promise<{ processed: number; errors: number; remaining: number }> {
    const params = batchSize ? `?batch_size=${batchSize}` : '';
    const response = await fetch(`${API_BASE_URL}/search/reindex${params}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to reindex documents');
    }
    return response.json();
  },
};

// Triggers API
export interface TriggerData {
  id: string;
  user_id: string;
  enabled: boolean;
  folder: string | null;
  created_at: string;
  updated_at: string;
}

export interface TriggerCreateData {
  user_id: string;
  enabled?: boolean;
  folder?: string;
}

export interface TriggerUpdateData {
  enabled?: boolean;
  folder?: string;
}

export const triggerApi = {
  async list(): Promise<TriggerData[]> {
    const response = await fetch(`${API_BASE_URL}/triggers`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to load triggers');
    return response.json();
  },

  async create(data: TriggerCreateData): Promise<TriggerData> {
    const response = await fetch(`${API_BASE_URL}/triggers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create trigger');
    }
    return response.json();
  },

  async update(triggerId: string, data: TriggerUpdateData): Promise<TriggerData> {
    const response = await fetch(`${API_BASE_URL}/triggers/${triggerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update trigger');
    return response.json();
  },

  async delete(triggerId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/triggers/${triggerId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete trigger');
  },
};

export interface AuthResponse {
  access_token: string;
  user: AuthUser;
}

export const authApi = {
  async login(username: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to login');
    }
    return response.json();
  },

  async register(username: string, password: string, fullName?: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, full_name: fullName?.trim() || undefined }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to register');
    }
    return response.json();
  },

  async me(): Promise<AuthUser> {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to load profile');
    }
    return response.json();
  },

  async logout(): Promise<void> {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  },
};

export default {
  documentType: documentTypeApi,
  processingRun: processingRunApi,
  extraction: extractionApi,
  search: searchApi,
  auth: authApi,
  trigger: triggerApi,
};
