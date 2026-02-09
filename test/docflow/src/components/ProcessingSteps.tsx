import React from 'react';
import {
  Box,
  Button,
  LinearProgress,
  Typography,
} from '@mui/material';
import { PlayArrow } from '@mui/icons-material';

interface ProcessingStepsProps {
  onExecute: () => void;
  isProcessing: boolean;
  processedCount?: number;
  totalCount?: number;
}

export const ProcessingSteps: React.FC<ProcessingStepsProps> = ({
  onExecute,
  isProcessing,
  processedCount = 0,
  totalCount = 0,
}) => {
  const hasProgress = totalCount > 0;
  const progressValue = hasProgress ? (processedCount / totalCount) * 100 : 0;

  return (
    <Box>
      <Button
        variant="contained"
        fullWidth
        startIcon={<PlayArrow />}
        onClick={onExecute}
        disabled={isProcessing}
        sx={{
          py: 1.25,
          fontSize: '0.875rem',
          fontWeight: 600,
          bgcolor: '#00534C',
          color: '#ffffff',
          textTransform: 'none',
          boxShadow: 'none',
          borderRadius: 1,
          '&:hover': {
            bgcolor: '#003d38',
            boxShadow: 'none',
          },
          '&:disabled': {
            bgcolor: '#e9ecef',
            color: '#adb5bd',
          },
        }}
      >
        {isProcessing ? 'Обработка...' : 'Обработать документ'}
      </Button>

      {isProcessing && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress
            variant={hasProgress ? 'determinate' : 'indeterminate'}
            value={progressValue}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: '#e9ecef',
              '& .MuiLinearProgress-bar': {
                bgcolor: '#F04923',
                borderRadius: 3,
                transition: 'transform 0.4s ease',
              },
            }}
          />
          {hasProgress && (
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                textAlign: 'center',
                mt: 1,
                color: '#6c757d',
                fontSize: '0.75rem',
              }}
            >
              Обработано {processedCount} из {totalCount}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};
