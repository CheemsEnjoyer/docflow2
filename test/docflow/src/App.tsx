import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Box, ThemeProvider, createTheme, CssBaseline, CircularProgress, Alert } from '@mui/material';
import Header from './components/Header';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { DocumentTypesPage } from './pages/DocumentTypesPage';
import { DocumentTypeEditorPage } from './pages/DocumentTypeEditorPage';
import { documentTypeApi } from './services/api';
import type { DocumentTypeConfig } from './types/process';

const theme = createTheme({
  palette: {
    primary: {
      main: '#F04923',
      light: '#ff7951',
      dark: '#c72f00',
    },
    secondary: {
      main: '#107572',
      light: '#3fa39f',
      dark: '#004d4a',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
    text: {
      primary: '#00504E',
      secondary: '#107572',
    },
    success: {
      main: '#28a745',
    },
    error: {
      main: '#F04923',
    },
    info: {
      main: '#9CBFCE',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h6: {
      fontWeight: 600,
      letterSpacing: '-0.02em',
    },
    subtitle2: {
      fontWeight: 600,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      fontSize: '0.75rem',
    },
    body2: {
      fontSize: '0.875rem',
    },
  },
  shape: {
    borderRadius: 4,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        },
      },
    },
  },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}>
        <CircularProgress sx={{ color: '#107572' }} />
      </Box>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}>
        <CircularProgress sx={{ color: '#107572' }} />
      </Box>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return children;
}

function DocumentTypesWrapper({
  documentTypes,
  loading,
  error,
  onDelete,
  onCreate,
}: {
  documentTypes: DocumentTypeConfig[];
  loading: boolean;
  error: string | null;
  onDelete: (id: string) => Promise<void>;
  onCreate: (name: string, description: string) => Promise<void>;
}) {
  const navigate = useNavigate();

  const handleOpen = (documentTypeId: string) => {
    navigate(`/admin/${documentTypeId}`);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}>
        <CircularProgress sx={{ color: '#107572' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1, p: 3 }}>
        <Alert severity="error" sx={{ maxWidth: 500 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <DocumentTypesPage
      documentTypes={documentTypes}
      onOpen={handleOpen}
      onDelete={(id) => void onDelete(id)}
      onCreate={(name, description) => void onCreate(name, description)}
    />
  );
}

function DocumentTypeEditorWrapper({
  documentTypes,
  onUpdate,
}: {
  documentTypes: DocumentTypeConfig[];
  onUpdate: (id: string, updates: Partial<DocumentTypeConfig>) => Promise<void>;
}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [docType, setDocType] = useState<DocumentTypeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!id) return;
      setLoading(true);
      const cached = documentTypes.find((item) => item.id === id);
      if (cached) {
        if (active) {
          setDocType(cached);
          setLoading(false);
        }
        return;
      }
      try {
        const fetched = await documentTypeApi.getById(id);
        if (active) setDocType(fetched);
      } catch (error) {
        console.error('Failed to load document type:', error);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [id, documentTypes]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}>
        <CircularProgress sx={{ color: '#107572' }} />
      </Box>
    );
  }

  if (!docType) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Тип документа не найден</Alert>
      </Box>
    );
  }

  return (
    <DocumentTypeEditorPage
      documentType={docType}
      onBack={() => navigate('/admin')}
      onUpdate={async (updates) => {
        await onUpdate(docType.id, updates);
        const updated = { ...docType, ...updates } as DocumentTypeConfig;
        setDocType(updated);
      }}
    />
  );
}

function App() {
  const { user } = useAuth();
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDocumentTypes = async () => {
      if (!user || user.role !== 'admin') {
        setDocumentTypes([]);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const { documentTypes: items } = await documentTypeApi.getAll({ pageSize: 100 });
        setDocumentTypes(items);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки типов документов');
      } finally {
        setLoading(false);
      }
    };
    void loadDocumentTypes();
  }, [user]);

  const handleCreateDocumentType = async (name: string, description: string) => {
    const created = await documentTypeApi.create(name, description, [], {});
    setDocumentTypes((prev) => [created, ...prev]);
  };

  const handleDeleteDocumentType = async (id: string) => {
    await documentTypeApi.delete(id);
    setDocumentTypes((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdateDocumentType = async (id: string, updates: Partial<DocumentTypeConfig>) => {
    const updated = await documentTypeApi.update(id, {
      name: updates.name,
      description: updates.description,
      fields: updates.fields,
      exportKeys: updates.exportKeys,
    });
    setDocumentTypes((prev) => prev.map((item) => (item.id === id ? updated : item)));
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <Header />
          <Box sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
            <Routes>
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <DocumentsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin"
                element={
                  <RequireAdmin>
                    <DocumentTypesWrapper
                      documentTypes={documentTypes}
                      loading={loading}
                      error={error}
                      onDelete={handleDeleteDocumentType}
                      onCreate={handleCreateDocumentType}
                    />
                  </RequireAdmin>
                }
              />
              <Route
                path="/admin/:id"
                element={
                  <RequireAdmin>
                    <DocumentTypeEditorWrapper
                      documentTypes={documentTypes}
                      onUpdate={handleUpdateDocumentType}
                    />
                  </RequireAdmin>
                }
              />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Box>
        </Box>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;

