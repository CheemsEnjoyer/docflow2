export interface DocumentTypeConfig {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  fields: string[];
  exportKeys: Record<string, string>;
}
