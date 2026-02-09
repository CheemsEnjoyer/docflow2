import React, { useState } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
} from '@mui/material';
import { Add, OpenInNew, Delete } from '@mui/icons-material';
import type { DocumentTypeConfig } from '../types/process';

interface DocumentTypesPageProps {
  documentTypes: DocumentTypeConfig[];
  onOpen: (documentTypeId: string) => void;
  onDelete: (documentTypeId: string) => void;
  onCreate: (name: string, description: string) => void;
}

export const DocumentTypesPage: React.FC<DocumentTypesPageProps> = ({
  documentTypes,
  onOpen,
  onDelete,
  onCreate,
}) => {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreate(newName.trim(), newDescription.trim());
    setCreateDialogOpen(false);
    setNewName('');
    setNewDescription('');
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, color: '#00504E' }}>
          Типы документов
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setCreateDialogOpen(true)}
          sx={{ bgcolor: '#00534C', '&:hover': { bgcolor: '#003d38' } }}
        >
          Новый тип
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Название</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Поля</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Обновлен</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {documentTypes.map((docType) => (
              <TableRow key={docType.id} hover>
                <TableCell>{docType.name}</TableCell>
                <TableCell>{docType.fields.length}</TableCell>
                <TableCell>{docType.updatedAt.toLocaleDateString('ru-RU')}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => onOpen(docType.id)}>
                    <OpenInNew fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => onDelete(docType.id)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Новый тип документа</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            margin="dense"
            label="Название"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <TextField
            fullWidth
            margin="dense"
            label="Описание"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Отмена</Button>
          <Button onClick={handleCreate} variant="contained">Создать</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
