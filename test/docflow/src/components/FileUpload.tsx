import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  CircularProgress,
} from '@mui/material';
import {
  CloudUpload,
  Delete,
  InsertDriveFile,
  CheckCircle,
  Error as ErrorIcon,
  HourglassEmpty,
} from '@mui/icons-material';

export interface DocumentData {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadDate: Date;
  status: 'pending' | 'processing' | 'completed' | 'error';
  extractedData?: any;
  file?: File;
}

interface FileUploadProps {
  files: DocumentData[];
  onFilesChange: (files: DocumentData[]) => void;
  disabled?: boolean;
}

const StatusIcon: React.FC<{ status: DocumentData['status'] }> = ({ status }) => {
  switch (status) {
    case 'processing':
      return <CircularProgress size={20} sx={{ color: '#F04923' }} />;
    case 'completed':
      return <CheckCircle sx={{ color: '#28a745', fontSize: 20 }} />;
    case 'error':
      return <ErrorIcon sx={{ color: '#dc3545', fontSize: 20 }} />;
    case 'pending':
      return <HourglassEmpty sx={{ color: '#adb5bd', fontSize: 20 }} />;
    default:
      return <InsertDriveFile sx={{ color: '#F04923', fontSize: 20 }} />;
  }
};

const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];

const isAcceptedFile = (file: File) => {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
};

export const FileUpload: React.FC<FileUploadProps> = ({ files, onFilesChange, disabled }) => {
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback((fileList: File[]) => {
    const accepted = fileList.filter(isAcceptedFile);
    if (accepted.length === 0) return;

    const newFiles: DocumentData[] = accepted.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      type: file.type,
      uploadDate: new Date(),
      status: 'pending' as const,
      file: file,
    }));

    onFilesChange([...files, ...newFiles]);
  }, [files, onFilesChange]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles) return;
    addFiles(Array.from(selectedFiles));
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, [disabled, addFiles]);

  const handleDelete = (id: string) => {
    const filtered = files.filter((f) => f.id !== id);
    onFilesChange(filtered);
  };

  return (
    <Box>
      <Typography
        variant="subtitle2"
        sx={{
          mb: 2,
          fontWeight: 600,
          color: '#107572',
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        Загрузка документа
      </Typography>

      <Box
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        sx={{
          border: '2px dashed',
          borderColor: dragOver ? '#00534C' : '#dee2e6',
          borderRadius: 1,
          p: 3,
          textAlign: 'center',
          mb: 2,
          bgcolor: dragOver ? '#e6f2f1' : '#f8f9fa',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition: 'all 0.2s',
          ...(!disabled && {
            '&:hover': {
              bgcolor: '#ffffff',
              borderColor: '#00504E',
            },
          }),
        }}
      >
        <input
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          id="file-upload"
          disabled={disabled}
        />
        <label htmlFor="file-upload" style={{ cursor: disabled ? 'default' : 'pointer', width: '100%', display: 'block' }}>
          <CloudUpload sx={{ fontSize: 40, color: '#107572', mb: 1 }} />
          <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 600, color: '#00504E', fontSize: '0.875rem' }}>
            {dragOver ? 'Отпустите файлы' : 'Выберите или перетащите файлы'}
          </Typography>
          <Typography variant="caption" sx={{ color: '#107572', fontSize: '0.75rem' }}>
            PDF, DOC, DOCX, JPG, PNG
          </Typography>
        </label>
      </Box>

      {files.length > 0 && (
        <List disablePadding>
          {files.map((file) => (
            <ListItem
              key={file.id}
              secondaryAction={
                !disabled && (
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={() => handleDelete(file.id)}
                    sx={{
                      color: '#107572',
                      '&:hover': {
                        color: '#dc3545',
                      },
                    }}
                  >
                    <Delete sx={{ fontSize: 18 }} />
                  </IconButton>
                )
              }
              sx={{
                bgcolor: '#ffffff',
                mb: 1,
                borderRadius: 1,
                border: '1px solid',
                borderColor:
                  file.status === 'processing' ? '#F04923' :
                  file.status === 'completed' ? '#28a745' :
                  file.status === 'error' ? '#dc3545' : '#e9ecef',
                py: 1,
                px: 1.5,
                transition: 'border-color 0.3s',
                '&:hover': {
                  borderColor: file.status === 'pending' ? '#00504E' : undefined,
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <StatusIcon status={file.status} />
              </ListItemIcon>
              <ListItemText
                primary={file.name}
                secondary={`${(file.size / 1024).toFixed(1)} KB`}
                primaryTypographyProps={{
                  variant: 'body2',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: '#00504E',
                }}
                secondaryTypographyProps={{
                  variant: 'caption',
                  fontSize: '0.7rem',
                  color: '#107572',
                }}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
};
