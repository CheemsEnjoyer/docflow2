import React, { useEffect, useMemo, useState } from 'react';
import {
  Paper,
  Typography,
  Box,
  Chip,
  LinearProgress,
  IconButton,
  TextField,
  Button,
  Menu,
  MenuItem,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import {
  ContentCopy,
  CheckCircle,
  Edit,
  Save,
  Close,
  Download,
  KeyboardArrowDown,
  Image as ImageIcon,
  TextFields,
  Done,
  NavigateBefore,
  NavigateNext,
  Undo,
  Send,
  SmartToy,
} from '@mui/icons-material';
import { processingRunApi } from '../services/api';
import type { DocumentTypeConfig } from '../types/process';
import { MarkdownHighlighter } from './MarkdownHighlighter';
import { DocumentHighlighter, type ExtractedField as HighlighterField } from './DocumentHighlighter';

// Extracted data interface for a single document
export interface ExtractedDocumentData {
  processingRunId?: string;
  documentId: string;
  documentName: string;
  documentImageUrl?: string;
  documentTypeId?: string;
  documentTypeName?: string | null;
  fields: Array<{
    name: string;
    value: string;
    confidence: number;
    coordinate?: [number, number, number, number];
    group?: string | null;
    row_index?: number | null;
    is_corrected?: boolean;
  }>;
  rawText?: string;
  status?: 'processing' | 'needs_review' | 'reviewed' | 'error';
}

// Legacy interface for backward compatibility
export interface ExtractedData {
  fields: Array<{
    name: string;
    value: string;
    confidence: number;
    coordinate?: [number, number, number, number];
    group?: string | null;
    row_index?: number | null;
    is_corrected?: boolean;
  }>;
  rawText?: string;
}

interface ResultsDisplayProps {
  data?: ExtractedData;
  documents?: ExtractedDocumentData[];
  isProcessing?: boolean;
  documentImageUrl?: string;
  documentName?: string;
  onDataChange?: (updatedData: ExtractedData) => void;
  onDocumentDataChange?: (docIndex: number, updatedData: ExtractedDocumentData) => void;
  onFieldSave?: (documentId: string, fieldIndex: number, value: string) => Promise<void>;
  documentTypes?: DocumentTypeConfig[];
  onDocumentTypeChange?: (runId: string, documentTypeId: string) => Promise<void>;
  onConfirm?: (documentId: string) => void;
  onCancelReview?: (documentId: string) => void;
  readOnly?: boolean;
}

type DisplayField = ExtractedData['fields'][number];
type TableCellData = { field: DisplayField; index: number };

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  data,
  documents,
  isProcessing = false,
  documentImageUrl,
  documentName,
  onDataChange,
  onDocumentDataChange,
  onFieldSave,
  documentTypes = [],
  onDocumentTypeChange,
  onConfirm,
  onCancelReview,
  readOnly = false,
}) => {
  const [hoveredFieldIndex, setHoveredFieldIndex] = useState<number | null>(null);
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(null);
  const [viewMode, setViewMode] = useState<'image' | 'text'>('text');
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [selectedTableGroup, setSelectedTableGroup] = useState<string | null>(null);
  const [documentTypeUpdating, setDocumentTypeUpdating] = useState(false);

  // AI Assistant state
  const [queryText, setQueryText] = useState('');
  const [queryHistory, setQueryHistory] = useState<Array<{ question: string; answer: string; error?: string }>>([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState<string | null>(null);
  const [isAiAssistantCollapsed, setIsAiAssistantCollapsed] = useState(false);

  // Support both single document (legacy) and multiple documents
  const hasMultipleDocuments = documents && documents.length > 0;
  const currentDoc = hasMultipleDocuments ? documents[currentDocIndex] : null;
  const effectiveData = currentDoc ? { fields: currentDoc.fields, rawText: currentDoc.rawText } : data;
  const effectiveImageUrl = currentDoc?.documentImageUrl || documentImageUrl;
  const effectiveDocName = currentDoc?.documentName || documentName;
  const effectiveDocumentTypeId = currentDoc?.documentTypeId;
  const effectiveDocumentTypeName = currentDoc?.documentTypeName
    || documentTypes.find((type) => type.id === effectiveDocumentTypeId)?.name
    || null;

  // Load query history from DB when document changes
  useEffect(() => {
    if (!currentDoc?.documentId || historyLoaded === currentDoc.documentId) return;

    let cancelled = false;
    processingRunApi
      .getQueryHistory(currentDoc.documentId)
      .then((data) => {
        if (cancelled) return;
        setQueryHistory(
          data.items.map((item) => ({
            question: item.question,
            answer: item.answer,
            error: item.error || undefined,
          })),
        );
        setHistoryLoaded(currentDoc.documentId);
      })
      .catch(() => {
        if (!cancelled) {
          setQueryHistory([]);
          setHistoryLoaded(currentDoc.documentId);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentDoc?.documentId]);

  const { tableGroups, singleFields } = useMemo(() => {
    const groups = new Map<string, { columns: string[]; rows: Map<number, Record<string, TableCellData>> }>();
    const singles: Array<{ field: DisplayField; index: number }> = [];

    if (!effectiveData?.fields) {
      return { tableGroups: [], singleFields: [] };
    }

    effectiveData.fields.forEach((field, index) => {
      if (!field.group) {
        singles.push({ field, index });
        return;
      }

      const groupName = field.group;
      if (!groups.has(groupName)) {
        groups.set(groupName, { columns: [], rows: new Map() });
      }

      const group = groups.get(groupName)!;
      if (!group.columns.includes(field.name)) {
        group.columns.push(field.name);
      }

      const rowIndex = typeof field.row_index === 'number' ? field.row_index : 0;
      if (!group.rows.has(rowIndex)) {
        group.rows.set(rowIndex, {});
      }
      group.rows.get(rowIndex)![field.name] = { field, index };
    });

    const tableGroupsArray = Array.from(groups.entries()).map(([name, group]) => ({
      name,
      columns: group.columns,
      rows: Array.from(group.rows.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, row]) => row),
    }));

    return { tableGroups: tableGroupsArray, singleFields: singles };
  }, [effectiveData]);
  const tableSelectValue = selectedTableGroup ?? tableGroups[0]?.name ?? '';

  useEffect(() => {
    if (tableGroups.length === 0) {
      setSelectedTableGroup(null);
      return;
    }
    if (!selectedTableGroup || !tableGroups.some((group) => group.name === selectedTableGroup)) {
      setSelectedTableGroup(tableGroups[0].name);
    }
  }, [tableGroups, selectedTableGroup]);

  useEffect(() => {
    if (readOnly && editingFieldIndex !== null) {
      setEditingFieldIndex(null);
      setEditValue('');
    }
  }, [readOnly, editingFieldIndex]);

  const handleViewModeChange = (_event: React.MouseEvent<HTMLElement>, newMode: 'image' | 'text' | null) => {
    if (newMode !== null) {
      setViewMode(newMode);
    }
  };

  const handleDocumentTypeChange = async (documentTypeId: string) => {
    if (!currentDoc?.processingRunId || !onDocumentTypeChange) return;
    setDocumentTypeUpdating(true);
    try {
      await onDocumentTypeChange(currentDoc.processingRunId, documentTypeId);
    } catch (error) {
      console.error('Failed to update document type:', error);
    } finally {
      setDocumentTypeUpdating(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getConfidenceLevel = (confidence: number): { label: string; bgcolor: string; color: string } => {
    if (confidence >= 0.9) {
      return { label: 'Высокая', bgcolor: '#d4edda', color: '#155724' };
    } else if (confidence >= 0.7) {
      return { label: 'Средняя', bgcolor: '#fff3cd', color: '#856404' };
    } else {
      return { label: 'Низкая', bgcolor: '#f8d7da', color: '#721c24' };
    }
  };

  const renderConfidenceChip = (field: DisplayField) => {
    if (field.is_corrected) {
      return (
        <Chip
          label="отредактировано"
          size="small"
          sx={{
            height: 20,
            fontSize: '0.62rem',
            fontWeight: 700,
            bgcolor: '#e9ecef',
            color: '#107572',
            border: '1px solid #d0d7de',
          }}
        />
      );
    }

    const { label, bgcolor, color } = getConfidenceLevel(field.confidence);

    return (
      <Chip
        label={label}
        size="small"
        sx={{
          height: 20,
          fontSize: '0.65rem',
          fontWeight: 700,
          bgcolor,
          color,
          border: 'none',
        }}
      />
    );
  };

  const handleEditStart = (fieldIndex: number, currentValue: string) => {
    if (readOnly) {
      return;
    }
    setEditingFieldIndex(fieldIndex);
    setEditValue(currentValue);
  };

  const handleEditSave = async (fieldIndex: number) => {
    if (hasMultipleDocuments && currentDoc && onDocumentDataChange) {
      const updatedFields = currentDoc.fields.map((field, index) =>
        index === fieldIndex ? { ...field, value: editValue, is_corrected: true } : field
      );
      onDocumentDataChange(currentDocIndex, { ...currentDoc, fields: updatedFields });

      // Save to database
      if (onFieldSave) {
        try {
          await onFieldSave(currentDoc.documentId, fieldIndex, editValue);
        } catch (error) {
          console.error('Failed to save field to database:', error);
        }
      }
    } else if (data && onDataChange) {
      const updatedFields = data.fields.map((field, index) =>
        index === fieldIndex ? { ...field, value: editValue, is_corrected: true } : field
      );
      onDataChange({ ...data, fields: updatedFields });
    }
    setEditingFieldIndex(null);
  };

  const handlePrevDocument = () => {
    if (currentDocIndex > 0) {
      setCurrentDocIndex(currentDocIndex - 1);
      setEditingFieldIndex(null);
      setHistoryLoaded(null);
    }
  };

  const handleNextDocument = () => {
    if (documents && currentDocIndex < documents.length - 1) {
      setCurrentDocIndex(currentDocIndex + 1);
      setEditingFieldIndex(null);
      setHistoryLoaded(null);
    }
  };

  const handleEditCancel = () => {
    setEditingFieldIndex(null);
    setEditValue('');
  };

  const handleQuerySubmit = async () => {
    const question = queryText.trim();
    if (!question || !currentDoc) return;

    setQueryLoading(true);
    setQueryText('');

    try {
      const result = await processingRunApi.queryDocument(currentDoc.documentId, question);
      setQueryHistory((prev) => [...prev, { question, answer: result.answer }]);
    } catch (error) {
      setQueryHistory((prev) => [
        ...prev,
        { question, answer: '', error: (error as Error).message || 'Не удалось выполнить запрос' },
      ]);
    } finally {
      setQueryLoading(false);
    }
  };

  const handleQueryKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleQuerySubmit();
    }
  };

  const handleExportMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setExportMenuAnchor(event.currentTarget);
  };

  const handleExportMenuClose = () => {
    setExportMenuAnchor(null);
  };

  // Helper: get fields to export (current document or all)
  const getExportFields = () => {
    if (currentDoc) return currentDoc.fields;
    if (effectiveData) return effectiveData.fields;
    return [];
  };

  const getExportFilename = () => {
    return effectiveDocName?.replace(/\.[^.]+$/, '') || 'export';
  };

  const handleExportJSON = () => {
    const fields = getExportFields();
    if (!fields.length) return;
    const exportData = { fields: fields.map(f => ({ name: f.name, value: f.value, confidence: f.confidence })) };
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${getExportFilename()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    handleExportMenuClose();
  };

  const handleExportCSV = () => {
    const fields = getExportFields();
    if (!fields.length) return;
    const headers = ['Поле', 'Значение', 'Уверенность'];
    const rows = fields.map(f => [f.name, f.value, getConfidenceLevel(f.confidence).label]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${getExportFilename()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    handleExportMenuClose();
  };

  const handleExportExcel = async () => {
    const fields = getExportFields();
    if (!fields.length) return;

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Извлеченные данные');

    worksheet.columns = [
      { header: 'Поле', key: 'field', width: 30 },
      { header: 'Значение', key: 'value', width: 50 },
      { header: 'Уверенность', key: 'confidence', width: 15 },
    ];

    fields.forEach(f => {
      worksheet.addRow({
        field: f.name,
        value: f.value,
        confidence: getConfidenceLevel(f.confidence).label,
      });
    });

    worksheet.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${getExportFilename()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    handleExportMenuClose();
  };

  if (isProcessing && !effectiveData) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="body1" sx={{ mb: 2, color: '#107572', fontWeight: 500 }}>
          Обработка документа...
        </Typography>
        <LinearProgress
          sx={{
            maxWidth: 400,
            mx: 'auto',
            height: 3,
            borderRadius: 2,
            bgcolor: '#e9ecef',
            '& .MuiLinearProgress-bar': { bgcolor: '#F04923' }
          }}
        />
      </Box>
    );
  }

  if (!effectiveData) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: '12px',
            bgcolor: '#f8f9fa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 3,
            border: '2px dashed #dee2e6',
          }}
        >
          <Typography component="span" sx={{ fontSize: 36, lineHeight: 1 }}>
            📄
          </Typography>
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 600, color: '#00504E', mb: 1 }}>
          Нет результатов
        </Typography>
        <Typography variant="body2" sx={{ color: '#107572' }}>
          Загрузите документ и нажмите "Обработать документ"
        </Typography>
      </Box>
    );
  }

  // Render fields panel
  const renderFieldsPanel = () => (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header with Export Button */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <CheckCircle sx={{ fontSize: 18, color: '#28a745', mr: 1 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#00504E', fontSize: '0.875rem' }}>
            Извлеченные поля
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Download />}
          endIcon={<KeyboardArrowDown />}
          onClick={handleExportMenuOpen}
          sx={{
            color: '#00504E',
            borderColor: '#dee2e6',
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.75rem',
            py: 0.5,
            '&:hover': {
              borderColor: '#00504E',
              bgcolor: 'transparent',
            },
          }}
        >
          Экспорт
        </Button>
        <Menu
          anchorEl={exportMenuAnchor}
          open={Boolean(exportMenuAnchor)}
          onClose={handleExportMenuClose}
        >
          <MenuItem onClick={handleExportJSON} sx={{ fontSize: '0.875rem' }}>
            JSON (текущий)
          </MenuItem>
          <MenuItem onClick={handleExportCSV} sx={{ fontSize: '0.875rem' }}>
            CSV (текущий)
          </MenuItem>
          <MenuItem onClick={handleExportExcel} sx={{ fontSize: '0.875rem' }}>
            Excel (текущий)
          </MenuItem>
        </Menu>
      </Box>

      {/* Fields list - scrollable */}
      <Box sx={{ flex: 1, overflowY: 'auto', pr: 1 }}>
        <Stack spacing={2}>
          {tableGroups.length > 1 && (
            <FormControl size="small" sx={{ mb: 1, minWidth: 200 }}>
              <InputLabel>Таблица</InputLabel>
              <Select
                value={tableSelectValue}
                label="Таблица"
                onChange={(event) => setSelectedTableGroup(String(event.target.value))}
              >
                {tableGroups.map((option) => (
                  <MenuItem key={option.name} value={option.name}>
                    {option.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {(selectedTableGroup
            ? tableGroups.filter((group) => group.name === selectedTableGroup)
            : tableGroups
          ).map((group) => (
            <Box key={group.name}>
              {tableGroups.length === 1 && (
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    mb: 1,
                    color: '#107572',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Таблица: {group.name}
                </Typography>
              )}
              <Table size="small" sx={{ mb: 1 }}>
                <TableHead>
                  <TableRow>
                    {group.columns.map((column) => (
                      <TableCell
                        key={column}
                        sx={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          color: '#00504E',
                          bgcolor: '#f8f9fa',
                          borderColor: '#e9ecef',
                        }}
                      >
                        {column}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {group.rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={group.columns.length || 1}
                        sx={{ fontSize: '0.75rem', color: '#6c757d' }}
                      >
                        Нет данных
                      </TableCell>
                    </TableRow>
                  ) : (
                    group.rows.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {group.columns.map((column) => {
                          const cellData = row[column];
                          const field = cellData?.field;
                          const fieldIndex = cellData?.index;
                          const isEditing = fieldIndex !== undefined && editingFieldIndex === fieldIndex;
                          return (
                            <TableCell
                              key={column}
                              onMouseEnter={() => {
                                if (fieldIndex !== undefined) {
                                  setHoveredFieldIndex(fieldIndex);
                                }
                              }}
                              onMouseLeave={() => {
                                setHoveredFieldIndex(null);
                              }}
                              sx={{ fontSize: '0.75rem', color: '#00504E', borderColor: '#e9ecef' }}
                            >
                              {field ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                  {isEditing ? (
                                    <TextField
                                      fullWidth
                                      size="small"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      autoFocus
                                      sx={{
                                        '& .MuiOutlinedInput-root': {
                                          fontSize: '0.75rem',
                                          bgcolor: '#ffffff',
                                        },
                                      }}
                                    />
                                  ) : (
                                    <Typography sx={{ fontSize: '0.75rem', color: '#00504E' }}>
                                      {field.value || '?'}
                                    </Typography>
                                  )}
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    {renderConfidenceChip(field)}
                                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                                      {isEditing ? (
                                        <>
                                          {!readOnly && fieldIndex !== undefined && (
                                            <IconButton
                                              size="small"
                                              onClick={() => handleEditSave(fieldIndex)}
                                              sx={{
                                                width: 22,
                                                height: 22,
                                                color: '#28a745',
                                                '&:hover': { bgcolor: '#f8f9fa' },
                                              }}
                                            >
                                              <Save sx={{ fontSize: 12 }} />
                                            </IconButton>
                                          )}
                                          <IconButton
                                            size="small"
                                            onClick={handleEditCancel}
                                            sx={{
                                              width: 22,
                                              height: 22,
                                              color: '#6c757d',
                                              '&:hover': { bgcolor: '#f8f9fa' },
                                            }}
                                          >
                                            <Close sx={{ fontSize: 12 }} />
                                          </IconButton>
                                        </>
                                      ) : (
                                        <>
                                          {!readOnly && fieldIndex !== undefined && (
                                            <IconButton
                                              size="small"
                                              onClick={() => handleEditStart(fieldIndex, field.value)}
                                              sx={{
                                                width: 22,
                                                height: 22,
                                                color: '#107572',
                                                '&:hover': { bgcolor: '#f8f9fa', color: '#00504E' },
                                              }}
                                            >
                                              <Edit sx={{ fontSize: 12 }} />
                                            </IconButton>
                                          )}
                                          <IconButton
                                            size="small"
                                            onClick={() => handleCopy(field.value)}
                                            sx={{
                                              width: 22,
                                              height: 22,
                                              color: '#107572',
                                              '&:hover': { bgcolor: '#f8f9fa', color: '#00504E' },
                                            }}
                                          >
                                            <ContentCopy sx={{ fontSize: 12 }} />
                                          </IconButton>
                                        </>
                                      )}
                                    </Box>
                                  </Box>
                                </Box>
                              ) : (
                                '?'
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Box>
          ))}

          {singleFields.map(({ field, index }) => (
            <Paper
              key={index}
              elevation={0}
              onMouseEnter={() => setHoveredFieldIndex(index)}
              onMouseLeave={() => setHoveredFieldIndex(null)}
              sx={{
                p: 2,
                borderRadius: 1,
                border: hoveredFieldIndex === index && editingFieldIndex !== index
                  ? '1px solid #00504E'
                  : '1px solid #e9ecef',
                bgcolor: editingFieldIndex === index ? '#f8f9fa' : '#ffffff',
                transition: 'all 0.2s',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
                <Typography
                  variant="caption"
                  sx={{
                    color: '#107572',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em'
                  }}
                >
                  {field.name}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                  {renderConfidenceChip(field)}
                  {editingFieldIndex !== index && (
                    <>
                      {!readOnly && (
                        <IconButton
                          size="small"
                          onClick={() => handleEditStart(index, field.value)}
                          sx={{
                            width: 24,
                            height: 24,
                            color: '#107572',
                            '&:hover': {
                              bgcolor: '#f8f9fa',
                              color: '#00504E',
                            },
                          }}
                        >
                          <Edit sx={{ fontSize: 14 }} />
                        </IconButton>
                      )}
                      <IconButton
                        size="small"
                        onClick={() => handleCopy(field.value)}
                        sx={{
                          width: 24,
                          height: 24,
                          color: '#107572',
                          '&:hover': {
                            bgcolor: '#f8f9fa',
                            color: '#00504E',
                          },
                        }}
                      >
                        <ContentCopy sx={{ fontSize: 14 }} />
                      </IconButton>
                    </>
                  )}
                </Box>
              </Box>

              {editingFieldIndex === index ? (
                <Box>
                  <TextField
                    fullWidth
                    size="small"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                    multiline
                    rows={2}
                    sx={{
                      mb: 1,
                      '& .MuiOutlinedInput-root': {
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        bgcolor: '#ffffff',
                      },
                    }}
                  />
                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Close />}
                      onClick={handleEditCancel}
                      sx={{
                        textTransform: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#107572',
                        borderColor: '#dee2e6',
                        py: 0.25,
                      }}
                    >
                      Отмена
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<Save />}
                      onClick={() => handleEditSave(index)}
                      sx={{
                        textTransform: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        bgcolor: '#00504E',
                        py: 0.25,
                        '&:hover': {
                          bgcolor: '#0f0f1a',
                        },
                      }}
                    >
                      Сохранить
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Typography variant="body2" sx={{ fontWeight: 500, color: '#00504E', fontSize: '0.875rem', lineHeight: 1.4 }}>
                  {field.value}
                </Typography>
              )}
            </Paper>
          ))}
        </Stack>
      </Box>

      {/* AI Assistant */}
      {currentDoc && effectiveData?.rawText && (
        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #e9ecef' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <SmartToy sx={{ fontSize: 16, color: '#107572' }} />
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  color: '#107572',
                  fontSize: '0.6875rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                AI помощник
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={() => setIsAiAssistantCollapsed((prev) => !prev)}
              sx={{
                p: 0.25,
                color: '#107572',
                transition: 'transform 0.15s ease',
                transform: isAiAssistantCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              }}
            >
              <KeyboardArrowDown sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>

          {!isAiAssistantCollapsed && (
            <>
              {/* Chat history */}
              {queryHistory.length > 0 && (
                <Box sx={{ maxHeight: 240, overflowY: 'auto', mb: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {queryHistory.map((entry, i) => (
                    <Box key={i}>
                      {/* User question */}
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
                        <Box
                          sx={{
                            maxWidth: '85%',
                            px: 1.5,
                            py: 0.75,
                            bgcolor: '#00504E',
                            color: '#fff',
                            borderRadius: '12px 12px 4px 12px',
                            fontSize: '0.8125rem',
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {entry.question}
                        </Box>
                      </Box>
                      {/* AI answer */}
                      <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <Box
                          sx={{
                            maxWidth: '85%',
                            px: 1.5,
                            py: 0.75,
                            bgcolor: entry.error ? '#fef2f0' : '#f0f9f8',
                            border: entry.error ? '1px solid #f8d7da' : '1px solid #d0e8e6',
                            borderRadius: '12px 12px 12px 4px',
                            fontSize: '0.8125rem',
                            color: entry.error ? '#F04923' : '#00504E',
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {entry.error || entry.answer}
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}

              {/* Input */}
              <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-end' }}>
                <TextField
                  fullWidth
                  size="small"
                  multiline
                  maxRows={3}
                  placeholder="Задайте вопрос по документу..."
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  onKeyDown={handleQueryKeyDown}
                  disabled={queryLoading}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      fontSize: '0.8125rem',
                      bgcolor: '#ffffff',
                      borderRadius: '8px',
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#107572',
                      },
                    },
                  }}
                />
                <IconButton
                  onClick={handleQuerySubmit}
                  disabled={queryLoading || !queryText.trim()}
                  sx={{
                    bgcolor: '#107572',
                    color: '#fff',
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    flexShrink: 0,
                    '&:hover': { bgcolor: '#00504E' },
                    '&.Mui-disabled': { bgcolor: '#e9ecef', color: '#adb5bd' },
                  }}
                >
                  <Send sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
              {queryLoading && (
                <LinearProgress
                  sx={{
                    mt: 1,
                    height: 2,
                    borderRadius: 1,
                    bgcolor: '#e9ecef',
                    '& .MuiLinearProgress-bar': { bgcolor: '#107572' },
                  }}
                />
              )}
            </>
          )}
        </Box>
      )}

      {/* Confirm/Cancel buttons */}
      {!readOnly && (onConfirm || onCancelReview) && currentDoc && (
        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #e9ecef', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {currentDoc.status !== 'reviewed' && onConfirm && (
            <Button
              fullWidth
              variant="contained"
              startIcon={<Done />}
              onClick={() => onConfirm(currentDoc.documentId)}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                bgcolor: '#28a745',
                py: 1.25,
                '&:hover': {
                  bgcolor: '#218838',
                },
              }}
            >
              {"\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c"}
            </Button>
          )}
          {currentDoc.status === 'reviewed' && onCancelReview && (
            <Button
              fullWidth
              variant="outlined"
              startIcon={<Undo />}
              onClick={() => onCancelReview(currentDoc.documentId)}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: '#6c757d',
                borderColor: '#dee2e6',
                py: 1.25,
                '&:hover': {
                  borderColor: '#6c757d',
                  bgcolor: '#f8f9fa',
                },
              }}
            >
              {"\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435"}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );

  // Render document panel
  const renderDocumentPanel = () => (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* View Mode Toggle */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        {documentTypes.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>{"\u041a\u043b\u0430\u0441\u0441 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430"}</InputLabel>
            <Select
              label={"\u041a\u043b\u0430\u0441\u0441 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430"}
              value={effectiveDocumentTypeId || ''}
              onChange={(event) => handleDocumentTypeChange(String(event.target.value))}
              disabled={readOnly || documentTypeUpdating || !currentDoc?.processingRunId}
            >
              {documentTypes.map((type) => (
                <MenuItem key={type.id} value={type.id}>
                  {type.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        {!documentTypes.length && effectiveDocumentTypeName && (
          <Typography sx={{ fontSize: '0.8125rem', color: '#107572', fontWeight: 600 }}>
            {"\u041a\u043b\u0430\u0441\u0441: "}{effectiveDocumentTypeName}
          </Typography>
        )}

        {effectiveData && (effectiveImageUrl || effectiveData.rawText) && (
          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={handleViewModeChange}
              size="small"
              sx={{
                bgcolor: '#f8f9fa',
                '& .MuiToggleButton-root': {
                  border: 'none',
                  px: 2,
                  py: 0.75,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#107572',
                  textTransform: 'none',
                  '&.Mui-selected': {
                    bgcolor: '#00504E',
                    color: '#ffffff',
                    '&:hover': {
                      bgcolor: '#00504E',
                    },
                  },
                  '&:hover': {
                    bgcolor: '#e9ecef',
                  },
                },
              }}
            >
              <ToggleButton value="image" disabled={!effectiveImageUrl}>
                <ImageIcon sx={{ fontSize: 16, mr: 0.75 }} />
                {"\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442"}
              </ToggleButton>
              <ToggleButton value="text" disabled={!effectiveData?.rawText}>
                <TextFields sx={{ fontSize: 16, mr: 0.75 }} />
                {"\u0422\u0435\u043a\u0441\u0442"}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}
      </Box>

      {/* Document content - scrollable */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            opacity: viewMode === 'image' ? 1 : 0,
            pointerEvents: viewMode === 'image' ? 'auto' : 'none',
            transition: 'opacity 0.15s ease',
            overflow: 'auto',
          }}
        >
          {effectiveImageUrl && effectiveDocName && (
            <DocumentHighlighter
              imageUrl={effectiveImageUrl}
              extractedFields={effectiveData?.fields?.map((f): HighlighterField => ({
                name: f.name,
                value: f.value,
                confidence: f.confidence,
                coordinate: f.coordinate,
              }))}
              selectedField={
                hoveredFieldIndex !== null && effectiveData?.fields?.[hoveredFieldIndex]
                  ? effectiveData.fields[hoveredFieldIndex].name
                  : undefined
              }
              onFieldHover={(fieldName) => {
                if (!fieldName) {
                  setHoveredFieldIndex(null);
                  return;
                }
                const index = effectiveData?.fields?.findIndex((f) => f.name === fieldName);
                if (index !== undefined && index !== -1) {
                  setHoveredFieldIndex(index);
                }
              }}
            />
          )}
        </Box>

        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            opacity: viewMode === 'text' ? 1 : 0,
            pointerEvents: viewMode === 'text' ? 'auto' : 'none',
            transition: 'opacity 0.15s ease',
            overflowY: 'auto',
          }}
        >
          {effectiveData?.rawText && (
            <MarkdownHighlighter
              markdownText={effectiveData.rawText}
              extractedFields={effectiveData.fields}
              selectedFieldIndex={hoveredFieldIndex ?? undefined}
              fileName={effectiveDocName}
            />
          )}
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Document navigation for multiple documents */}
      {hasMultipleDocuments && documents.length > 1 && (
        <Box sx={{
          mb: 2,
          pb: 2,
          borderBottom: '1px solid #e9ecef',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}>
          <IconButton
            size="small"
            onClick={handlePrevDocument}
            disabled={currentDocIndex === 0}
            sx={{ color: '#107572' }}
          >
            <NavigateBefore />
          </IconButton>
          <Typography sx={{ fontWeight: 600, color: '#00504E', fontSize: '0.875rem' }}>
            Документ {currentDocIndex + 1} из {documents.length}: {effectiveDocName}
          </Typography>
          <IconButton
            size="small"
            onClick={handleNextDocument}
            disabled={currentDocIndex === documents.length - 1}
            sx={{ color: '#107572' }}
          >
            <NavigateNext />
          </IconButton>
        </Box>
      )}

      {/* Split view: Document on left, Fields on right */}
      <Box sx={{
        flex: 1,
        display: 'flex',
        gap: 3,
        minHeight: 0,
      }}>
        {/* Left side - Document */}
        <Box sx={{
          flex: '1 1 68%',
          minWidth: 0,
          bgcolor: '#ffffff',
          borderRadius: 1,
          border: '1px solid #e9ecef',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
        }}>
          {renderDocumentPanel()}
        </Box>

        {/* Right side - Fields */}
        <Box sx={{
          flex: '0 1 32%',
          minWidth: { xs: 0, lg: 300 },
          maxWidth: { xs: 'none', lg: 480 },
          bgcolor: '#ffffff',
          borderRadius: 1,
          border: '1px solid #e9ecef',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          overflowX: 'auto',
        }}>
          {renderFieldsPanel()}
        </Box>
      </Box>
    </Box>
  );
};

