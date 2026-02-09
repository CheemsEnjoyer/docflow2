export type NodeType = 'upload' | 'ocr' | 'extract' | 'export';

export interface WorkflowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    config?: any;
    status?: 'idle' | 'running' | 'success' | 'error';
    result?: any;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface ExtractedData {
  fields: Array<{
    name: string;
    value: string;
    confidence: number;
  }>;
  rawText?: string;
}

export interface DocumentData {
  id: string;
  name: string;
  type: string;
  uploadDate: Date;
  status: 'processing' | 'completed' | 'error';
  extractedData?: ExtractedData;
}

// Types for document extraction platform
