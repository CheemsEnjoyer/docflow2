import React, { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Stack,
  IconButton,
  Divider,
} from '@mui/material';
import { ArrowBack, Add, Delete } from '@mui/icons-material';
import { FieldConfiguration } from '../components/FieldConfiguration';
import type { DocumentTypeConfig } from '../types/process';

interface DocumentTypeEditorPageProps {
  documentType: DocumentTypeConfig;
  onBack: () => void;
  onUpdate: (updates: Partial<DocumentTypeConfig>) => Promise<void>;
}

type ExportKeyRow = { key: string; value: string };

export const DocumentTypeEditorPage: React.FC<DocumentTypeEditorPageProps> = ({
  documentType,
  onBack,
  onUpdate,
}) => {
  const [name, setName] = useState(documentType.name);
  const [description, setDescription] = useState(documentType.description);
  const [fields, setFields] = useState<string[]>(documentType.fields || []);

  const [exportRows, setExportRows] = useState<ExportKeyRow[]>(() => {
    const entries = Object.entries(documentType.exportKeys || {});
    return entries.length ? entries.map(([key, value]) => ({ key, value })) : [{ key: '', value: '' }];
  });

  const exportKeys = useMemo(() => {
    const result: Record<string, string> = {};
    exportRows.forEach(({ key, value }) => {
      if (key.trim()) {
        result[key.trim()] = value.trim();
      }
    });
    return result;
  }, [exportRows]);

  const handleSave = async () => {
    await onUpdate({
      name: name.trim(),
      description: description.trim(),
      fields,
      exportKeys,
    });
  };

  const handleFieldChange = (newFields: string[]) => {
    setFields(newFields);
  };

  const handleExportKeyChange = (index: number, field: 'key' | 'value', value: string) => {
    setExportRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const handleAddExportRow = () => {
    setExportRows((prev) => [...prev, { key: '', value: '' }]);
  };

  const handleRemoveExportRow = (index: number) => {
    setExportRows((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Box sx={{ width: '100%', height: '100%', p: 3, overflowY: 'auto' }}>
      <Button startIcon={<ArrowBack />} onClick={onBack} sx={{ mb: 2 }}>
        Назад
      </Button>

      <Paper sx={{ p: 3, mb: 3, width: '100%' }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#00504E' }}>
          Настройки типа документа
        </Typography>

        <Stack spacing={2}>
          <TextField
            label="Название"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
          />
          <TextField
            label="Описание"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
          />
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, mb: 3, width: '100%' }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#00504E' }}>
          Поля для извлечения
        </Typography>
        <FieldConfiguration initialFields={fields} onFieldsChange={handleFieldChange} />
      </Paper>

      <Paper sx={{ p: 3, mb: 3, width: '100%' }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#00504E' }}>
          Ключи экспорта в 1С
        </Typography>
        <Stack spacing={2}>
          {exportRows.map((row, index) => (
            <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                label="Ключ 1С"
                value={row.key}
                onChange={(e) => handleExportKeyChange(index, 'key', e.target.value)}
                fullWidth
              />
              <TextField
                label="Поле"
                value={row.value}
                onChange={(e) => handleExportKeyChange(index, 'value', e.target.value)}
                fullWidth
              />
              <IconButton onClick={() => handleRemoveExportRow(index)}>
                <Delete fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <Divider />
          <Button startIcon={<Add />} onClick={handleAddExportRow}>
            Добавить ключ
          </Button>
        </Stack>
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" onClick={handleSave}>
          Сохранить
        </Button>
      </Box>
    </Box>
  );
};
