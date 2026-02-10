import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Typography,
  Box,
  TextField,
  Button,
  Paper,
  Stack,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  FolderOpen,
  PlayArrow,
  Stop,
  Delete,
  Add,
  CheckCircle,
} from '@mui/icons-material';
import { triggerApi, type TriggerData } from '../services/api';

interface TriggerSettingsProps {
  userId: string;
}

export const TriggerSettings: React.FC<TriggerSettingsProps> = ({ userId }) => {
  const [triggers, setTriggers] = useState<TriggerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFolderPath, setNewFolderPath] = useState('');
  const [saving, setSaving] = useState(false);
  const directoryInputRef = useRef<HTMLInputElement | null>(null);

  const loadTriggers = useCallback(async () => {
    try {
      const data = await triggerApi.list();
      setTriggers(data);
    } catch (e) {
      console.error('Failed to load triggers:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTriggers();
  }, [loadTriggers]);

  useEffect(() => {
    if (directoryInputRef.current) {
      directoryInputRef.current.setAttribute('webkitdirectory', '');
      directoryInputRef.current.setAttribute('directory', '');
    }
  }, []);

  const handleAddFolder = async () => {
    if (!newFolderPath.trim()) return;
    setSaving(true);
    try {
      const created = await triggerApi.create({
        user_id: userId,
        folder: newFolderPath.trim(),
        enabled: false,
      });
      setTriggers((prev) => [...prev, created]);
      setNewFolderPath('');
    } catch (e) {
      console.error('Failed to create trigger:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTrigger = async (trigger: TriggerData) => {
    const newEnabled = !trigger.enabled;
    try {
      const updated = await triggerApi.update(trigger.id, { enabled: newEnabled });
      setTriggers((prev) => prev.map((t) => (t.id === trigger.id ? updated : t)));
    } catch (e) {
      console.error('Failed to toggle trigger:', e);
    }
  };

  const handleDeleteTrigger = async (triggerId: string) => {
    try {
      await triggerApi.delete(triggerId);
      setTriggers((prev) => prev.filter((t) => t.id !== triggerId));
    } catch (e) {
      console.error('Failed to delete trigger:', e);
    }
  };

  const handleSelectFolder = () => {
    if (!directoryInputRef.current) return;

    if ('showDirectoryPicker' in window) {
      (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> })
        .showDirectoryPicker?.()
        .then((handle) => {
          if (handle?.name) setNewFolderPath(handle.name);
        })
        .catch(() => {
          directoryInputRef.current?.click();
        });
      return;
    }

    directoryInputRef.current.click();
  };

  const handleDirectoryPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const firstFile = files[0] as File & { webkitRelativePath?: string };
    const relativePath = firstFile.webkitRelativePath || '';
    const folderName = relativePath.split('/')[0];
    if (folderName) setNewFolderPath(folderName);
    event.target.value = '';
  };

  return (
    <Box>
      <Typography
        variant="subtitle2"
        sx={{
          mb: 2.5,
          fontWeight: 600,
          color: '#107572',
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        Автоматическая обработка
      </Typography>

      <Alert
        severity="info"
        sx={{
          mb: 3,
          fontSize: '0.8125rem',
          bgcolor: '#e7f3ff',
          color: '#004085',
          border: '1px solid #b8daff',
          '& .MuiAlert-icon': { color: '#004085' },
        }}
      >
        Настройте автоматическую обработку документов при появлении новых файлов в указанных папках.
      </Alert>

      <Box sx={{ mb: 3 }}>
        <Typography
          variant="body2"
          sx={{ mb: 1.5, fontWeight: 600, color: '#107572', fontSize: '0.875rem' }}
        >
          Отслеживаемые папки
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} sx={{ color: '#107572' }} />
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {triggers.length === 0 && (
              <Typography variant="caption" sx={{ color: '#6c757d', textAlign: 'center', py: 2 }}>
                Нет настроенных триггеров
              </Typography>
            )}
            {triggers.map((trigger) => (
              <Paper
                key={trigger.id}
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 1,
                  border: '1px solid #e9ecef',
                  bgcolor: trigger.enabled ? '#f8f9fa' : '#ffffff',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }} title={trigger.folder || ''}>
                    <FolderOpen
                      sx={{
                        fontSize: 20,
                        flexShrink: 0,
                        color: trigger.enabled ? '#F04923' : '#107572',
                        mr: 1,
                      }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: '#00504E', fontSize: '0.8125rem', lineHeight: 1.3 }}
                      >
                        {(trigger.folder || '').split(/[/\\]/).pop() || trigger.folder}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: '#6c757d',
                          fontSize: '0.7rem',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          lineHeight: 1.3,
                        }}
                      >
                        {trigger.folder}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    <Chip
                      label={trigger.enabled ? 'Активен' : 'Остановлен'}
                      size="small"
                      icon={trigger.enabled ? <CheckCircle sx={{ fontSize: 14 }} /> : undefined}
                      sx={{
                        height: 24,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        bgcolor: trigger.enabled ? '#d4edda' : '#e9ecef',
                        color: trigger.enabled ? '#155724' : '#107572',
                        border: 'none',
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => handleToggleTrigger(trigger)}
                      sx={{ width: 32, height: 32, color: trigger.enabled ? '#dc3545' : '#28a745' }}
                    >
                      {trigger.enabled ? <Stop sx={{ fontSize: 18 }} /> : <PlayArrow sx={{ fontSize: 18 }} />}
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteTrigger(trigger.id)}
                      sx={{ width: 32, height: 32, color: '#107572', '&:hover': { color: '#dc3545' } }}
                    >
                      <Delete sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Box>
                </Box>
              </Paper>
            ))}
          </Stack>
        )}

        {/* Add New Folder */}
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Путь к папке"
              value={newFolderPath}
              onChange={(e) => setNewFolderPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddFolder();
              }}
              sx={{
                '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', bgcolor: '#ffffff' },
              }}
            />
            <IconButton
              onClick={handleSelectFolder}
              sx={{
                width: 40,
                height: 40,
                borderRadius: 1,
                border: '1px solid #dee2e6',
                color: '#107572',
                bgcolor: '#ffffff',
                '&:hover': { borderColor: '#00504E', color: '#00504E', bgcolor: '#f8f9fa' },
              }}
            >
              <FolderOpen sx={{ fontSize: 20 }} />
            </IconButton>
            <Button
              variant="contained"
              onClick={handleAddFolder}
              disabled={!newFolderPath.trim() || saving}
              sx={{
                minWidth: 40,
                px: 1.5,
                bgcolor: '#00504E',
                '&:hover': { bgcolor: '#004d4a' },
              }}
            >
              {saving ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : <Add />}
            </Button>
          </Box>
        </Box>
        <input
          ref={directoryInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleDirectoryPicked}
          multiple
        />
      </Box>
    </Box>
  );
};
