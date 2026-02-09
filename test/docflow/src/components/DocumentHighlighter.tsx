import { useRef, useEffect, useState, useCallback } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { Add, Remove, CenterFocusStrong } from '@mui/icons-material';
import { authStorage } from '../services/api';

export interface HighlightData {
  width?: number;
  height?: number;
  boxes?: Array<{
    coordinate: [number, number, number, number];
    label?: string;
    score?: number;
  }>;
}

export interface ExtractedField {
  name: string;
  value: string;
  confidence: number;
  coordinate?: [number, number, number, number];
}

interface DocumentHighlighterProps {
  imageUrl: string;
  highlightData?: HighlightData;
  extractedFields?: ExtractedField[];
  selectedField?: string;
  onFieldHover?: (fieldName: string | null) => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

export function DocumentHighlighter({
  imageUrl,
  highlightData,
  extractedFields,
  selectedField,
  onFieldHover,
}: DocumentHighlighterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoveredField, setHoveredField] = useState<ExtractedField | null>(null);
  const [baseScale, setBaseScale] = useState(1);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!imageUrl) return;

    let objectUrl: string | null = null;
    const token = authStorage.getToken();
    const isBlobLike = imageUrl.startsWith('blob:') || imageUrl.startsWith('data:');

    const loadImage = (src: string) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = src;
      imageRef.current = image;

      image.onload = () => {
        drawCanvas();
      };
    };

    if (!token || isBlobLike) {
      loadImage(imageUrl);
      return undefined;
    }

    // Fetch image with authorization
    const controller = new AbortController();
    fetch(imageUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        loadImage(objectUrl);
      })
      .catch((error) => {
        if ((error as { name?: string } | null)?.name === 'AbortError') {
          return;
        }
        // Fallback to direct URL
        loadImage(imageUrl);
      });

    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [imageUrl]);

  // Reset zoom when image changes
  useEffect(() => {
    setZoom(1);
  }, [imageUrl]);

  // Redraw when selectedField, extractedFields, or zoom change
  useEffect(() => {
    if (imageRef.current && imageRef.current.complete) {
      drawCanvas();
    }
  }, [selectedField, extractedFields, hoveredField, zoom]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const container = containerRef.current;

    if (!canvas || !image || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get original image dimensions
    const originalWidth = highlightData?.width || image.width;
    const originalHeight = highlightData?.height || image.height;

    // Calculate base scale to fit container
    const containerWidth = container.clientWidth;
    const imageAspectRatio = originalWidth / originalHeight;
    const displayWidth = Math.min(containerWidth - 32, 1200);
    const displayHeight = displayWidth / imageAspectRatio;

    const scaleX = displayWidth / originalWidth;
    const scaleY = displayHeight / originalHeight;
    const newBaseScale = Math.min(scaleX, scaleY);
    setBaseScale(newBaseScale);

    const currentScale = newBaseScale * zoom;

    // Set canvas size
    canvas.width = originalWidth * currentScale;
    canvas.height = originalHeight * currentScale;

    // Draw image scaled to canvas
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Draw highlighting only for selected or hovered field
    if (extractedFields) {
      extractedFields.forEach((field) => {
        if (!field.coordinate) return;

        const isSelected = selectedField === field.name;
        const isHovered = hoveredField?.name === field.name;

        // Only draw if field is selected or hovered
        if (!isSelected && !isHovered) return;

        const [x1, y1, x2, y2] = field.coordinate;

        // Scale coordinates
        const scaledX1 = x1 * currentScale;
        const scaledY1 = y1 * currentScale;
        const scaledWidth = (x2 - x1) * currentScale;
        const scaledHeight = (y2 - y1) * currentScale;

        // Draw filled rectangle
        if (isSelected) {
          ctx.fillStyle = 'rgba(240, 73, 35, 0.25)';
          ctx.strokeStyle = '#F04923';
          ctx.lineWidth = 3;
        } else {
          ctx.fillStyle = 'rgba(16, 117, 114, 0.2)';
          ctx.strokeStyle = '#107572';
          ctx.lineWidth = 2;
        }

        ctx.fillRect(scaledX1, scaledY1, scaledWidth, scaledHeight);
        ctx.strokeRect(scaledX1, scaledY1, scaledWidth, scaledHeight);

        // Draw field name label
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillStyle = isSelected ? '#F04923' : '#107572';

        const textMetrics = ctx.measureText(field.name);
        const textWidth = textMetrics.width;
        const padding = 8;

        // Label background
        ctx.fillRect(
          scaledX1,
          scaledY1 - 22,
          textWidth + padding * 2,
          20
        );

        // Label text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(field.name, scaledX1 + padding, scaledY1 - 7);
      });
    }
  }, [highlightData, extractedFields, selectedField, hoveredField, zoom]);

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !extractedFields) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const currentScale = baseScale * zoom;

    const field = extractedFields.find((f) => {
      if (!f.coordinate) return false;
      const [x1, y1, x2, y2] = f.coordinate;
      const scaledX1 = x1 * currentScale;
      const scaledY1 = y1 * currentScale;
      const scaledX2 = x2 * currentScale;
      const scaledY2 = y2 * currentScale;

      return x >= scaledX1 && x <= scaledX2 && y >= scaledY1 && y <= scaledY2;
    });

    const newHoveredField = field || null;
    setHoveredField(newHoveredField);
    canvas.style.cursor = field ? 'pointer' : 'default';

    // Notify parent about hover change
    if (onFieldHover) {
      onFieldHover(newHoveredField?.name || null);
    }

    // Redraw on hover change
    if ((field && !hoveredField) || (!field && hoveredField) || (field && hoveredField && field.name !== hoveredField.name)) {
      drawCanvas();
    }
  };

  const handleCanvasMouseLeave = () => {
    setHoveredField(null);
    if (canvasRef.current) {
      canvasRef.current.style.cursor = 'default';
    }
    // Notify parent
    if (onFieldHover) {
      onFieldHover(null);
    }
    drawCanvas();
  };

  const handleWheel = useCallback((event: React.WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((prev) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta)));
  }, []);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(MAX_ZOOM, prev + ZOOM_STEP));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(MIN_ZOOM, prev - ZOOM_STEP));
  };

  const handleZoomReset = () => {
    setZoom(1);
  };

  const zoomPercent = Math.round(zoom * 100);

  return (
    <Box ref={containerRef} sx={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Zoom controls */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          py: 0.5,
          flexShrink: 0,
        }}
      >
        <IconButton size="small" onClick={handleZoomOut} disabled={zoom <= MIN_ZOOM} sx={{ color: '#107572' }}>
          <Remove sx={{ fontSize: 18 }} />
        </IconButton>
        <Typography
          onClick={handleZoomReset}
          sx={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#107572',
            minWidth: 44,
            textAlign: 'center',
            cursor: 'pointer',
            userSelect: 'none',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {zoomPercent}%
        </Typography>
        <IconButton size="small" onClick={handleZoomIn} disabled={zoom >= MAX_ZOOM} sx={{ color: '#107572' }}>
          <Add sx={{ fontSize: 18 }} />
        </IconButton>
        {zoom !== 1 && (
          <IconButton size="small" onClick={handleZoomReset} sx={{ color: '#107572', ml: 0.5 }} title="Сбросить">
            <CenterFocusStrong sx={{ fontSize: 18 }} />
          </IconButton>
        )}
      </Box>

      {/* Scrollable canvas area */}
      <Box
        ref={scrollRef}
        onWheel={handleWheel}
        sx={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          justifyContent: zoom <= 1 ? 'center' : 'flex-start',
          alignItems: zoom <= 1 ? 'flex-start' : 'flex-start',
          bgcolor: '#f8f9fa',
          borderRadius: 1,
          p: 2,
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
          style={{
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            backgroundColor: '#ffffff',
            flexShrink: 0,
          }}
        />
      </Box>
    </Box>
  );
}

export default DocumentHighlighter;
