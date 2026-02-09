import React, { useState } from 'react';
import {
  Typography,
  Box,
  IconButton,
  Chip,
  Tooltip,
  Collapse,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { Dayjs } from 'dayjs';
import 'dayjs/locale/ru';
import {
  CheckCircle,
  Warning,
  Schedule,
  Description,
  Delete,
  AutoMode,
  ExpandMore,
  ExpandLess,
  Search,
  Download,
} from '@mui/icons-material';

export type ProcessingStatus = 'processing' | 'needs_review' | 'reviewed' | 'error';
export type ProcessingSource = 'manual' | 'trigger';

export interface ProcessedDocument {
  id: string;
  name: string;
  status: ProcessingStatus;
  fieldsCount: number;
}

export interface ProcessingRun {
  id: string;
  timestamp: Date;
  source: ProcessingSource;
  triggerName?: string;
  documentTypeId?: string | null;
  documentTypeName?: string | null;
  documents: ProcessedDocument[];
  status: ProcessingStatus;
}

interface ProcessingHistoryProps {
  history: ProcessingRun[];
  onSelectRun: (runId: string) => void;
  onSelectDocument: (runId: string, docId: string) => void;
  onDeleteRun: (runId: string) => void;
  onMarkReviewed: (runId: string) => void;
  onExportRun?: (runId: string) => void;
  selectedRunId?: string;
  selectedDocId?: string;
  canManage?: boolean;
}

const getStatusColor = (status: ProcessingStatus) => {
  switch (status) {
    case 'processing':
      return '#107572';
    case 'needs_review':
      return '#ffc107';
    case 'reviewed':
      return '#28a745';
    case 'error':
      return '#F04923';
    default:
      return '#6c757d';
  }
};

const getStatusIcon = (status: ProcessingStatus) => {
  switch (status) {
    case 'processing':
      return <Schedule sx={{ fontSize: 16 }} />;
    case 'needs_review':
      return <Warning sx={{ fontSize: 16 }} />;
    case 'reviewed':
      return <CheckCircle sx={{ fontSize: 16 }} />;
    case 'error':
      return <Warning sx={{ fontSize: 16 }} />;
    default:
      return null;
  }
};

const getStatusLabel = (status: ProcessingStatus) => {
  switch (status) {
    case 'processing':
      return 'Обработка';
    case 'needs_review':
      return 'Требует проверки';
    case 'reviewed':
      return 'Проверено';
    case 'error':
      return 'Ошибка';
    default:
      return '';
  }
};

const formatDateTime = (date: Date) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (date.toDateString() === today.toDateString()) {
    return `Сегодня, ${time}`;
  } else if (date.toDateString() === yesterday.toDateString()) {
    return `Вчера, ${time}`;
  } else {
    const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return `${dateStr}, ${time}`;
  }
};

export const ProcessingHistory: React.FC<ProcessingHistoryProps> = ({
  history,
  onSelectRun,
  onSelectDocument,
  onDeleteRun,
  onExportRun,
  selectedRunId,
  selectedDocId,
  canManage = true,
}) => {
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  const [documentTypeFilter, setDocumentTypeFilter] = useState('all');
  const [deleteRunId, setDeleteRunId] = useState<string | null>(null);

  const toggleExpand = (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRuns((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(runId)) {
        newSet.delete(runId);
      } else {
        newSet.add(runId);
      }
      return newSet;
    });
  };

  const isExpanded = (runId: string) => expandedRuns.has(runId);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const fromDate = dateFrom ? dateFrom.startOf('day').toDate() : null;
  const toDate = dateTo ? dateTo.endOf('day').toDate() : null;
  const documentTypeOptions = Array.from(
    new Set(history.map((run) => run.documentTypeName).filter((value): value is string => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b, 'ru'));

  const matchesFilters = (run: ProcessingRun) => {
    if (fromDate && run.timestamp < fromDate) return false;
    if (toDate && run.timestamp > toDate) return false;
    if (documentTypeFilter !== 'all') {
      if (documentTypeFilter === '__none__') {
        if (run.documentTypeName) return false;
      } else if (run.documentTypeName !== documentTypeFilter) {
        return false;
      }
    }
    if (!normalizedQuery) return true;
    return run.documents.some((doc) => doc.name.toLowerCase().includes(normalizedQuery));
  };

  const filteredHistory = history.filter(matchesFilters);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography
        variant="subtitle2"
        sx={{
          p: 2,
          pb: 1.5,
          fontWeight: 600,
          color: '#107572',
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          borderBottom: '1px solid #e9ecef',
        }}
      >
        История обработок
      </Typography>

      <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid #e9ecef', display: 'grid', gap: 1 }}>
        <TextField
          size="small"
          placeholder="Поиск по названию документа"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 16, color: '#6c757d' }} />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiInputBase-root': { fontSize: '0.8125rem' },
          }}
        />
        <FormControl size="small" fullWidth>
          <InputLabel>{"\u0422\u0438\u043f \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430"}</InputLabel>
          <Select
            label={"\u0422\u0438\u043f \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430"}
            value={documentTypeFilter}
            onChange={(event) => setDocumentTypeFilter(String(event.target.value))}
          >
            <MenuItem value="all">{'\u0412\u0441\u0435 \u0442\u0438\u043f\u044b'}</MenuItem>
            <MenuItem value="__none__">{'\u0411\u0435\u0437 \u0442\u0438\u043f\u0430'}</MenuItem>
            {documentTypeOptions.map((type) => (
              <MenuItem key={type} value={type}>
                {type}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ru">
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 1,
              width: '100%',
            }}
          >
            <DatePicker
              label="С"
              value={dateFrom}
              onChange={(newValue) => setDateFrom(newValue)}
              format="дд.мм.гг"
              slotProps={{
                textField: {
                  size: 'small',
                  className: 'date-picker-field',
                  fullWidth: true,
                  sx: {
                    '& .MuiInputBase-input': {
                      fontSize: '0.75rem',
                      padding: '6px 10px',
                    },
                  },
                },
                day: {
                  sx: {
                    '&.Mui-selected': {
                      bgcolor: '#107572',
                      '&:hover': { bgcolor: '#0a5a58' },
                    },
                  },
                },
                popper: {
                  sx: {
                    '& .MuiPickersDay-root.Mui-selected': {
                      bgcolor: '#107572',
                      '&:hover': { bgcolor: '#0a5a58' },
                    },
                    '& .MuiPickersDay-root:hover': { bgcolor: '#10757220' },
                    '& .MuiPickersCalendarHeader-root': { color: '#00504E' },
                    '& .MuiPickersArrowSwitcher-button': { color: '#107572' },
                    '& .MuiDayCalendar-weekDayLabel': {
                      color: '#107572',
                      fontWeight: 600,
                    },
                  },
                },
              }}
            />
            <DatePicker
              label="По"
              value={dateTo}
              onChange={(newValue) => setDateTo(newValue)}
              format="дд.мм.гг"
              minDate={dateFrom || undefined}
              slotProps={{
                textField: {
                  size: 'small',
                  className: 'date-picker-field',
                  fullWidth: true,
                  sx: {
                    '& .MuiInputBase-input': {
                      fontSize: '0.75rem',
                      padding: '6px 10px',
                    },
                  },
                },
                day: {
                  sx: {
                    '&.Mui-selected': {
                      bgcolor: '#107572',
                      '&:hover': { bgcolor: '#0a5a58' },
                    },
                  },
                },
                popper: {
                  sx: {
                    '& .MuiPickersDay-root.Mui-selected': {
                      bgcolor: '#107572',
                      '&:hover': { bgcolor: '#0a5a58' },
                    },
                    '& .MuiPickersDay-root:hover': { bgcolor: '#10757220' },
                    '& .MuiPickersCalendarHeader-root': { color: '#00504E' },
                    '& .MuiPickersArrowSwitcher-button': { color: '#107572' },
                    '& .MuiDayCalendar-weekDayLabel': {
                      color: '#107572',
                      fontWeight: 600,
                    },
                  },
                },
              }}
            />
          </Box>
        </LocalizationProvider>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
        {filteredHistory.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Description sx={{ fontSize: 40, color: '#dee2e6', mb: 1 }} />
            <Typography variant="body2" sx={{ color: '#6c757d', fontSize: '0.8125rem' }}>
              История пуста
            </Typography>
          </Box>
        ) : (
          filteredHistory.map((run) => {
            const filteredDocs = normalizedQuery
              ? run.documents.filter((doc) => doc.name.toLowerCase().includes(normalizedQuery))
              : run.documents;
            return (
            <Box
              key={run.id}
              sx={{
                mb: 1,
                borderRadius: 1,
                border: '1px solid',
                borderColor: selectedRunId === run.id ? '#107572' : '#e9ecef',
                bgcolor: selectedRunId === run.id ? '#f0f9f8' : '#ffffff',
                overflow: 'hidden',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Run header */}
              <Box
                onClick={() => onSelectRun(run.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  p: 1,
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: selectedRunId === run.id ? '#e6f4f3' : '#f8f9fa',
                  },
                }}
              >
                {/* Expand/Collapse button */}
                <IconButton
                  size="small"
                  onClick={(e) => toggleExpand(run.id, e)}
                  sx={{
                    p: 0.25,
                    mr: 0.5,
                    color: '#6c757d',
                  }}
                >
                  {isExpanded(run.id) ? (
                    <ExpandLess sx={{ fontSize: 18 }} />
                  ) : (
                    <ExpandMore sx={{ fontSize: 18 }} />
                  )}
                </IconButton>

                {/* Source icon */}
                {run.source === 'trigger' && (
                  <Tooltip title={`Триггер: ${run.triggerName}`}>
                    <Box sx={{ mr: 1, display: 'flex', color: '#107572' }}>
                      <AutoMode sx={{ fontSize: 16 }} />
                    </Box>
                  </Tooltip>
                )}

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#00504E',
                    }}
                  >
                    {formatDateTime(run.timestamp)}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '0.6875rem',
                      color: '#6c757d',
                    }}
                  >
                    {run.documents.length} {"\u0434\u043e\u043a."}
                  </Typography>
                </Box>

                <Chip
                  icon={getStatusIcon(run.status) || undefined}
                  label={getStatusLabel(run.status)}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.625rem',
                    fontWeight: 600,
                    bgcolor: `${getStatusColor(run.status)}15`,
                    color: getStatusColor(run.status),
                    border: `1px solid ${getStatusColor(run.status)}30`,
                    '& .MuiChip-icon': {
                      color: 'inherit',
                    },
                  }}
                />
                {onExportRun && run.status !== 'processing' && (
                  <Tooltip title="Экспорт в Excel">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onExportRun(run.id);
                      }}
                      sx={{
                        p: 0.5,
                        ml: 0.5,
                        color: '#107572',
                        '&:hover': { color: '#00504E', bgcolor: '#10757215' },
                      }}
                    >
                      <Download sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>

              {/* Collapsible documents list */}
              <Collapse in={isExpanded(run.id)}>
                <Box sx={{ borderTop: '1px solid #e9ecef' }}>
                  {filteredDocs.map((doc) => (
                    <Box
                      key={doc.id}
                      onClick={() => onSelectDocument(run.id, doc.id)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        px: 1.5,
                        py: 1,
                        cursor: 'pointer',
                        bgcolor: selectedDocId === doc.id ? '#e6f4f3' : 'transparent',
                        borderBottom: '1px solid #f0f0f0',
                        '&:last-child': {
                          borderBottom: 'none',
                        },
                        '&:hover': {
                          bgcolor: selectedDocId === doc.id ? '#d9efed' : '#f8f9fa',
                        },
                      }}
                    >
                      <Description sx={{ fontSize: 18, color: '#6c757d', mr: 1.5 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          sx={{
                            fontSize: '0.8125rem',
                            color: '#00504E',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontWeight: 500,
                          }}
                        >
                          {doc.name}
                        </Typography>
                        {run.documentTypeName && (
                          <Typography
                            sx={{
                              fontSize: '0.6875rem',
                              color: '#6c757d',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {run.documentTypeName}
                          </Typography>
                        )}
                      </Box>
                      <Tooltip title={getStatusLabel(doc.status)}>
                        <Box sx={{ display: 'flex', color: getStatusColor(doc.status), ml: 1.5 }}>
                          {getStatusIcon(doc.status)}
                        </Box>
                      </Tooltip>
                      {canManage && (
                        <Tooltip title="Удалить">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteRunId(run.id);
                            }}
                            sx={{
                              p: 0.5,
                              ml: 0.5,
                              color: '#6c757d',
                              '&:hover': { color: '#F04923', bgcolor: '#F0492315' },
                            }}
                          >
                            <Delete sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  ))}
                </Box>
              </Collapse>
            </Box>
          );
          })
        )}
      </Box>

      <Dialog
        open={deleteRunId !== null}
        onClose={() => setDeleteRunId(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Удаление документа</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#495057' }}>
            Вы уверены, что хотите удалить этот документ? Это действие нельзя отменить.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteRunId(null)} color="inherit">
            Отмена
          </Button>
          <Button
            onClick={() => {
              if (deleteRunId) {
                onDeleteRun(deleteRunId);
              }
              setDeleteRunId(null);
            }}
            variant="contained"
            sx={{ bgcolor: '#F04923', '&:hover': { bgcolor: '#d63a17' } }}
          >
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
