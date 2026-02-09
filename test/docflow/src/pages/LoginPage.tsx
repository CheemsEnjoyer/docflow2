import { useState } from 'react';
import { Box, Button, Paper, TextField, Typography, Alert } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#f5f5f5',
        p: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 420,
          p: 4,
          borderRadius: 2,
          border: '1px solid #e9ecef',
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 600, color: '#00504E', mb: 1 }}>
          Вход в систему
        </Typography>
        <Typography variant="body2" sx={{ color: '#107572', mb: 3 }}>
          Введите логин и пароль, чтобы продолжить
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 2 }}>
          <TextField
            label="Логин"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          <TextField
            label="Пароль"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <Button
            type="submit"
            variant="contained"
            disabled={!username.trim() || !password || loading}
            sx={{ bgcolor: '#F04923', '&:hover': { bgcolor: '#c72f00' } }}
          >
            {loading ? 'Вход...' : 'Войти'}
          </Button>
        </Box>

        <Typography variant="body2" sx={{ mt: 3, color: '#107572' }}>
          Нет аккаунта?{' '}
          <Link to="/register" style={{ color: '#F04923', textDecoration: 'none', fontWeight: 600 }}>
            Зарегистрироваться
          </Link>
        </Typography>
      </Paper>
    </Box>
  );
};
