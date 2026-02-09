import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
  Box,
  CircularProgress,
  Alert,
  Snackbar,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from '@mui/material';
import { Add, Close, Edit } from '@mui/icons-material';
import { FileUpload, type DocumentData } from '../components/FileUpload';
import { ProcessingSteps } from '../components/ProcessingSteps';
import { ResultsDisplay, type ExtractedDocumentData } from '../components/ResultsDisplay';
import { ProcessingHistory, type ProcessingRun } from '../components/ProcessingHistory';
import { TriggerSettings } from '../components/TriggerSettings';
import { documentTypeApi, extractionApi, processingRunApi, type ProcessingRunResponse, type ProcessingRunDetailResponse } from '../services/api';
import type { DocumentTypeConfig } from '../types/process';
import { useAuth } from '../context/AuthContext';

type Workspace = {
  id: string;
  name: string;
  uploadedFiles: DocumentData[];
  extractedDocuments: ExtractedDocumentData[];
  isProcessing: boolean;
  processedCount: number;
  totalCount: number;
  selectedRunId?: string;
  selectedDocId?: string;
};

const generateWorkspaceId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const createWorkspace = (index: number): Workspace => ({
  id: generateWorkspaceId(),
  name: `\u041e\u043a\u043d\u043e ${index}`,
  uploadedFiles: [],
  extractedDocuments: [],
  isProcessing: false,
  processedCount: 0,
  totalCount: 0,
});
const WORKSPACES_STORAGE_KEY = 'docflow.documents.workspaces.v1';

type PersistedWorkspace = {
  id: string;
  name: string;
  selectedRunId?: string;
  selectedDocId?: string;
};

type PersistedWorkspaceState = {
  activeWorkspaceId: string;
  workspaces: PersistedWorkspace[];
};

const toWorkspace = (workspace: PersistedWorkspace): Workspace => ({
  id: workspace.id,
  name: workspace.name,
  selectedRunId: workspace.selectedRunId,
  selectedDocId: workspace.selectedDocId,
  uploadedFiles: [],
  extractedDocuments: [],
  isProcessing: false,
  processedCount: 0,
  totalCount: 0,
});

const getInitialWorkspaceState = (): { workspaces: Workspace[]; activeWorkspaceId: string } => {
  const fallback = createWorkspace(1);
  if (typeof window === 'undefined') {
    return { workspaces: [fallback], activeWorkspaceId: fallback.id };
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACES_STORAGE_KEY);
    if (!raw) {
      return { workspaces: [fallback], activeWorkspaceId: fallback.id };
    }

    const parsed = JSON.parse(raw) as PersistedWorkspaceState;
    if (!parsed.workspaces || parsed.workspaces.length === 0) {
      return { workspaces: [fallback], activeWorkspaceId: fallback.id };
    }

    const restored = parsed.workspaces.map(toWorkspace);
    const hasActive = restored.some((workspace) => workspace.id === parsed.activeWorkspaceId);
    return {
      workspaces: restored,
      activeWorkspaceId: hasActive ? parsed.activeWorkspaceId : restored[0].id,
    };
  } catch {
    return { workspaces: [fallback], activeWorkspaceId: fallback.id };
  }
};

const toPersistedWorkspace = (workspace: Workspace): PersistedWorkspace => ({
  id: workspace.id,
  name: workspace.name,
  selectedRunId: workspace.selectedRunId,
  selectedDocId: workspace.selectedDocId,
});

const cleanupDocumentUrls = (documents: ExtractedDocumentData[]) => {
  documents.forEach((doc) => {
    if (doc.documentImageUrl) {
      URL.revokeObjectURL(doc.documentImageUrl);
    }
  });
};

export const DocumentsPage: React.FC = () => {
  const { user } = useAuth();
  const canManage = user?.role === 'admin';
  const initialStateRef = useRef<{ workspaces: Workspace[]; activeWorkspaceId: string } | null>(null);
  if (!initialStateRef.current) {
    initialStateRef.current = getInitialWorkspaceState();
  }
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialStateRef.current.workspaces);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(initialStateRef.current.activeWorkspaceId);
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const [processingHistory, setProcessingHistory] = useState<ProcessingRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeConfig[]>([]);
  const [documentTypesLoaded, setDocumentTypesLoaded] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameWorkspaceId, setRenameWorkspaceId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'warning' | 'info' }>(
    { open: false, message: '', severity: 'info' }
  );

  const showToast = (message: string, severity: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const updateWorkspace = useCallback((id: string, updater: (workspace: Workspace) => Workspace) => {
    setWorkspaces((prev) => prev.map((workspace) => (workspace.id === id ? updater(workspace) : workspace)));
  }, []);

  const handleAddWorkspace = () => {
    const newWorkspace = createWorkspace(workspaces.length + 1);
    setWorkspaces((prev) => [...prev, newWorkspace]);
    setActiveWorkspaceId(newWorkspace.id);
  };

  const handleWorkspaceChange = (_event: React.SyntheticEvent, value: string) => {
    setActiveWorkspaceId(value);
  };

  const handleRenameWorkspace = (workspaceId: string) => {
    const current = workspaces.find((workspace) => workspace.id === workspaceId);
    if (!current) {
      return;
    }

    setRenameWorkspaceId(workspaceId);
    setRenameValue(current.name);
    setRenameDialogOpen(true);
  };

  const handleRenameDialogClose = () => {
    setRenameDialogOpen(false);
    setRenameWorkspaceId(null);
    setRenameValue('');
  };

  const handleRenameDialogSave = () => {
    if (!renameWorkspaceId) {
      handleRenameDialogClose();
      return;
    }

    const trimmed = renameValue.trim();
    if (!trimmed) {
      return;
    }

    updateWorkspace(renameWorkspaceId, (workspace) => ({ ...workspace, name: trimmed }));
    handleRenameDialogClose();
  };

  const handleCloseWorkspace = (workspaceId: string) => {
    if (workspaces.length === 1) {
      return;
    }

    const closingWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
    if (closingWorkspace) {
      cleanupDocumentUrls(closingWorkspace.extractedDocuments);
    }

    const currentIndex = workspaces.findIndex((workspace) => workspace.id === workspaceId);
    const remaining = workspaces.filter((workspace) => workspace.id !== workspaceId);
    const nextActive = remaining[Math.min(currentIndex, remaining.length - 1)]?.id ?? remaining[0].id;

    setWorkspaces(remaining);
    if (activeWorkspaceId === workspaceId) {
      setActiveWorkspaceId(nextActive);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || workspaces.length === 0) {
      return;
    }

    const validActiveWorkspaceId = workspaces.some((workspace) => workspace.id === activeWorkspaceId)
      ? activeWorkspaceId
      : workspaces[0].id;

    const payload: PersistedWorkspaceState = {
      activeWorkspaceId: validActiveWorkspaceId,
      workspaces: workspaces.map(toPersistedWorkspace),
    };

    window.localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(payload));
  }, [workspaces, activeWorkspaceId]);

  const resolveDocumentTypeName = (run: ProcessingRunResponse | ProcessingRunDetailResponse) =>
    run.document_type_name || documentTypes.find((type) => type.id === run.document_type_id)?.name || null;

  const transformRunToHistory = (run: ProcessingRunResponse | ProcessingRunDetailResponse): ProcessingRun => ({
    id: run.id,
    timestamp: new Date(run.created_at),
    source: run.source,
    triggerName: run.trigger_name || undefined,
    documentTypeId: run.document_type_id || null,
    documentTypeName: resolveDocumentTypeName(run),
    status: run.status === 'processing' ? 'needs_review' : run.status,
    documents: run.documents.map((doc) => ({
      id: doc.id,
      name: doc.filename,
      status: doc.status === 'processing' ? 'needs_review' : doc.status,
      fieldsCount: (doc as { fields_count?: number; extracted_fields?: unknown[] }).fields_count ?? (doc as { extracted_fields?: unknown[] }).extracted_fields?.length ?? 0,
    })),
  });

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const runs = await processingRunApi.getAll();
      const history = runs.map(transformRunToHistory);
      setProcessingHistory(history);
      if (history.length > 0) {
        setWorkspaces((prev) =>
          prev.map((workspace) =>
            workspace.selectedRunId
              ? workspace
              : {
                  ...workspace,
                  selectedRunId: history[0].id,
                  selectedDocId: history[0].documents[0]?.id,
                }
          )
        );
      }
    } catch (error) {
      console.error('Failed to load processing history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [documentTypes]);

  useEffect(() => {
    const loadDocumentTypes = async () => {
      try {
        const { documentTypes: types } = await documentTypeApi.getAll({ pageSize: 200, sortBy: 'name', sortOrder: 'asc' });
        setDocumentTypes(types);
      } catch (error) {
        console.error('Failed to load document types:', error);
      } finally {
        setDocumentTypesLoaded(true);
      }
    };
    void loadDocumentTypes();
  }, []);

  useEffect(() => {
    if (documentTypesLoaded) {
      loadHistory();
    }
  }, [loadHistory, documentTypesLoaded]);

  const handleFilesChange = (files: DocumentData[]) => {
    if (!activeWorkspace) return;
    cleanupDocumentUrls(activeWorkspace.extractedDocuments);
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      uploadedFiles: files,
      extractedDocuments: [],
    }));
  };

  const handleExecute = async () => {
    if (!activeWorkspace || activeWorkspace.uploadedFiles.length === 0) return;
    const workspaceId = activeWorkspace.id;
    const filesToProcess = activeWorkspace.uploadedFiles;
    const total = filesToProcess.filter((f) => f.file).length;

    updateWorkspace(workspaceId, (workspace) => ({
      ...workspace,
      isProcessing: true,
      processedCount: 0,
      totalCount: total,
      uploadedFiles: workspace.uploadedFiles.map((f) => ({ ...f, status: 'pending' as const })),
    }));

    let processed = 0;
    let batchRunId: string | undefined;
    let hasErrors = false;

    for (const fileData of filesToProcess) {
      if (!fileData.file) continue;

      updateWorkspace(workspaceId, (workspace) => ({
        ...workspace,
        uploadedFiles: workspace.uploadedFiles.map((f) =>
          f.id === fileData.id ? { ...f, status: 'processing' as const } : f
        ),
      }));

      try {
        const result = await extractionApi.extractAuto(fileData.file, 'manual', batchRunId);
        if (!batchRunId) {
          batchRunId = result.processingRunId;
        }
        processed++;
        updateWorkspace(workspaceId, (workspace) => ({
          ...workspace,
          processedCount: processed,
          uploadedFiles: workspace.uploadedFiles.map((f) =>
            f.id === fileData.id ? { ...f, status: 'completed' as const } : f
          ),
        }));
      } catch (error) {
        console.error(`Failed to process ${fileData.name}:`, error);
        hasErrors = true;
        processed++;
        updateWorkspace(workspaceId, (workspace) => ({
          ...workspace,
          processedCount: processed,
          uploadedFiles: workspace.uploadedFiles.map((f) =>
            f.id === fileData.id ? { ...f, status: 'error' as const } : f
          ),
        }));
      }
    }

    await loadHistory();
    if (hasErrors) {
      showToast('Часть документов обработана с ошибками', 'warning');
    } else {
      showToast('Документы успешно обработаны', 'success');
    }
    updateWorkspace(workspaceId, (workspace) => ({
      ...workspace,
      isProcessing: false,
      processedCount: 0,
      totalCount: 0,
    }));
  };

  const handleSelectRun = (runId: string) => {
    if (!activeWorkspace) return;
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      selectedRunId: runId,
    }));
  };

  const handleSelectDocument = async (runId: string, docId: string) => {
    if (!activeWorkspace) return;
    const workspaceId = activeWorkspace.id;

    updateWorkspace(workspaceId, (workspace) => ({
      ...workspace,
      selectedRunId: runId,
      selectedDocId: docId,
    }));

    try {
      const runData = await processingRunApi.getById(runId);
      const doc = runData.documents.find((d) => d.id === docId);
      if (doc) {
        const resolvedTypeName = runData.document_type_name
          || documentTypes.find((type) => type.id === runData.document_type_id)?.name
          || null;

        const previousDocuments = workspaces.find((workspace) => workspace.id === workspaceId)?.extractedDocuments ?? [];
        cleanupDocumentUrls(previousDocuments);

        updateWorkspace(workspaceId, (workspace) => ({
          ...workspace,
          extractedDocuments: [{
            processingRunId: runData.id,
            documentId: doc.id,
            documentName: doc.filename,
            documentImageUrl: doc.file_path
              ? (doc.preview_image
                ? processingRunApi.getDocumentPreviewUrl(doc.id)
                : processingRunApi.getDocumentFileUrl(doc.id))
              : undefined,
            documentTypeId: runData.document_type_id,
            documentTypeName: resolvedTypeName,
            fields: doc.extracted_fields?.map((f) => ({
              name: f.name,
              value: f.value || '',
              confidence: f.confidence,
              coordinate: f.coordinate ?? undefined,
              group: (f as { group?: string | null }).group ?? undefined,
              row_index: (f as { row_index?: number | null }).row_index ?? undefined,
              is_corrected: (f as { is_corrected?: boolean | null }).is_corrected ?? false,
            })) || [],
            rawText: doc.raw_text || '',
            status: doc.status as 'processing' | 'needs_review' | 'reviewed' | 'error',
          }],
        }));
      }
    } catch (error) {
      console.error('Failed to load document data:', error);
    }
  };

  const handleDeleteRun = async (runId: string) => {
    try {
      await processingRunApi.delete(runId);
      setProcessingHistory((prev) => prev.filter((r) => r.id !== runId));
      setWorkspaces((prev) =>
        prev.map((workspace) =>
          workspace.selectedRunId === runId
            ? { ...workspace, selectedRunId: undefined, selectedDocId: undefined, extractedDocuments: [] }
            : workspace
        )
      );
    } catch (error) {
      console.error('Failed to delete run:', error);
    }
  };

  const handleMarkReviewed = async (runId: string) => {
    try {
      const updatedRun = await processingRunApi.markReviewed(runId);
      const transformedRun = transformRunToHistory(updatedRun);
      setProcessingHistory((prev) =>
        prev.map((run) => (run.id === runId ? transformedRun : run))
      );
      // Also update extractedDocuments if they belong to this run
      const reviewedDocIds = new Set(updatedRun.documents.map((d) => d.id));
      setWorkspaces((prev) =>
        prev.map((workspace) => ({
          ...workspace,
          extractedDocuments: workspace.extractedDocuments.map((doc) =>
            reviewedDocIds.has(doc.documentId) ? { ...doc, status: 'reviewed' as const } : doc
          ),
        }))
      );
    } catch (error) {
      console.error('Failed to mark as reviewed:', error);
    }
  };

  const handleDocumentDataChange = (docIndex: number, updatedData: ExtractedDocumentData) => {
    if (!activeWorkspace) return;
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      extractedDocuments: workspace.extractedDocuments.map((doc, idx) => (idx === docIndex ? updatedData : doc)),
    }));
  };

  const handleFieldSave = async (documentId: string, fieldIndex: number, value: string) => {
    try {
      await processingRunApi.updateField(documentId, fieldIndex, value);
      showToast('Поле сохранено', 'success');
    } catch (error) {
      console.error('Failed to save field:', error);
      showToast('Не удалось сохранить поле', 'error');
      throw error;
    }
  };

  const updateHistoryAfterReview = (
    documentId: string,
    docStatus: ProcessingRun['documents'][number]['status'],
    runStatus: ProcessingRun['status'] | null,
  ) => {
    setProcessingHistory((prev) =>
      prev.map((run) => {
        const hasDoc = run.documents.some((doc) => doc.id === documentId);
        if (!hasDoc) return run;
        return {
          ...run,
          status: (runStatus as ProcessingRun['status']) || run.status,
          documents: run.documents.map((doc) => (doc.id === documentId ? { ...doc, status: docStatus } : doc)),
        };
      })
    );
  };

  const handleConfirmDocument = async (documentId: string) => {
    try {
      const updated = await processingRunApi.markDocumentReviewed(documentId);
      setWorkspaces((prev) =>
        prev.map((workspace) => ({
          ...workspace,
          extractedDocuments: workspace.extractedDocuments.map((doc) =>
            doc.documentId === documentId ? { ...doc, status: updated.status } : doc
          ),
        }))
      );
      updateHistoryAfterReview(documentId, updated.status, updated.run_status);
      showToast('Документ подтверждён', 'success');
    } catch (error) {
      console.error('Failed to confirm document:', error);
      showToast('Не удалось подтвердить документ', 'error');
    }
  };

  const handleCancelReviewDocument = async (documentId: string) => {
    try {
      const updated = await processingRunApi.cancelDocumentReview(documentId);
      setWorkspaces((prev) =>
        prev.map((workspace) => ({
          ...workspace,
          extractedDocuments: workspace.extractedDocuments.map((doc) =>
            doc.documentId === documentId ? { ...doc, status: updated.status } : doc
          ),
        }))
      );
      updateHistoryAfterReview(documentId, updated.status, updated.run_status);
      showToast('Подтверждение отменено', 'info');
    } catch (error) {
      console.error('Failed to cancel document review:', error);
      showToast('Не удалось отменить подтверждение', 'error');
    }
  };

  const handleDocumentTypeChange = async (runId: string, documentTypeId: string) => {
    try {
      const updated = await processingRunApi.updateDocumentType(runId, documentTypeId);
      const updatedTypeName = updated.document_type_name
        || documentTypes.find((type) => type.id === documentTypeId)?.name
        || null;

      setProcessingHistory((prev) =>
        prev.map((run) =>
          run.id === runId
            ? { ...run, documentTypeId: documentTypeId, documentTypeName: updatedTypeName }
            : run
        )
      );

      setWorkspaces((prev) =>
        prev.map((workspace) => ({
          ...workspace,
          extractedDocuments: workspace.extractedDocuments.map((doc) =>
            doc.processingRunId === runId
              ? { ...doc, documentTypeId: documentTypeId, documentTypeName: updatedTypeName }
              : doc
          ),
        }))
      );
      showToast('Тип документа обновлён', 'success');
    } catch (error) {
      console.error('Failed to update document type:', error);
      showToast('Не удалось изменить тип документа', 'error');
      throw error;
    }
  };

  if (historyLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}>
        <CircularProgress sx={{ color: '#107572' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2,
          py: 1.5,
          borderBottom: '1px solid #e9ecef',
          bgcolor: '#ffffff',
        }}
      >
        <Tabs
          value={activeWorkspaceId}
          onChange={handleWorkspaceChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              minHeight: 40,
              textTransform: 'none',
            },
          }}
        >
          {workspaces.map((workspace) => (
            <Tab
              key={workspace.id}
              value={workspace.id}
              label={(
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  {workspace.isProcessing && <CircularProgress size={12} sx={{ color: '#107572' }} />}
                  <Box component="span" sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {workspace.name}
                  </Box>
                  <Tooltip title="Переименовать вкладку">
                    <IconButton
                      component="span"
                      size="small"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRenameWorkspace(workspace.id);
                      }}
                      sx={{ p: 0.25 }}
                    >
                      <Edit sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                  {workspaces.length > 1 && (
                    <Tooltip title="Закрыть вкладку">
                      <IconButton
                        component="span"
                        size="small"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleCloseWorkspace(workspace.id);
                        }}
                        sx={{ p: 0.25 }}
                      >
                        <Close sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              )}
            />
          ))}
        </Tabs>
        <Tooltip title="Новое окно">
          <IconButton
            size="small"
            onClick={handleAddWorkspace}
            sx={{
              ml: 1,
              border: '1px solid #e9ecef',
              bgcolor: '#ffffff',
            }}
          >
            <Add fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ display: 'flex', flexGrow: 1, minHeight: 0, overflow: 'hidden' }}>
        <Box
          sx={{
            width: 360,
            minWidth: 320,
            maxWidth: 420,
            p: 3,
            borderRight: '1px solid #e9ecef',
            bgcolor: '#ffffff',
            overflowY: 'auto',
          }}
        >
          <FileUpload files={activeWorkspace?.uploadedFiles ?? []} onFilesChange={handleFilesChange} disabled={activeWorkspace?.isProcessing ?? false} />
          <Box sx={{ mt: 2 }}>
            <ProcessingSteps onExecute={handleExecute} isProcessing={activeWorkspace?.isProcessing ?? false} processedCount={activeWorkspace?.processedCount ?? 0} totalCount={activeWorkspace?.totalCount ?? 0} />
          </Box>
          <Box sx={{ mt: 3 }}>
            <TriggerSettings userId={user?.id ?? ''} />
          </Box>
        </Box>

        <Box sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            {(activeWorkspace?.isProcessing ?? false) && <Alert severity="info" sx={{ mb: 2 }}>Обработка документов…</Alert>}
            <ResultsDisplay
              documents={activeWorkspace?.extractedDocuments ?? []}
              isProcessing={activeWorkspace?.isProcessing ?? false}
              onDocumentDataChange={handleDocumentDataChange}
              onFieldSave={handleFieldSave}
              documentTypes={documentTypes}
              onDocumentTypeChange={handleDocumentTypeChange}
              onConfirm={handleConfirmDocument}
              onCancelReview={handleCancelReviewDocument}
            />
          </Box>
        </Box>

        <Box sx={{ width: 360, borderLeft: '1px solid #e9ecef', bgcolor: '#f8f9fa' }}>
          <ProcessingHistory
            history={processingHistory}
            onSelectRun={handleSelectRun}
            onSelectDocument={handleSelectDocument}
            onDeleteRun={handleDeleteRun}
            onMarkReviewed={handleMarkReviewed}
            onExportRun={async (runId) => {
              try {
                await processingRunApi.exportRun(runId, 'xlsx');
              } catch (e) {
                console.error('Export failed:', e);
              }
            }}
            selectedRunId={activeWorkspace?.selectedRunId}
            selectedDocId={activeWorkspace?.selectedDocId}
            canManage={canManage}
          />
        </Box>

        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        >
          <Alert severity={snackbar.severity} onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}>
            {snackbar.message}
          </Alert>
        </Snackbar>

        <Dialog
          open={renameDialogOpen}
          onClose={handleRenameDialogClose}
          maxWidth="xs"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 2,
            },
          }}
        >
          <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Переименовать окно</DialogTitle>
          <DialogContent sx={{ pt: '8px !important' }}>
            <TextField
              autoFocus
              fullWidth
              label="Название вкладки"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              error={!renameValue.trim()}
              helperText={!renameValue.trim() ? 'Введите название' : ' '}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleRenameDialogSave();
                }
              }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleRenameDialogClose} color="inherit">
              Отмена
            </Button>
            <Button
              onClick={handleRenameDialogSave}
              variant="contained"
              disabled={!renameValue.trim()}
              sx={{ bgcolor: '#00504E', '&:hover': { bgcolor: '#00413f' } }}
            >
              Сохранить
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};






