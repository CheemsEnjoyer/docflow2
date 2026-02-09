import { useState, useMemo, type ReactNode } from 'react';
import { Box, Paper, Typography, Tooltip } from '@mui/material';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

export interface ExtractedField {
  name: string;
  value: string;
  confidence: number;
  coordinate?: [number, number, number, number];
  group?: string | null;
  row_index?: number | null;
  is_corrected?: boolean;
}

interface MarkdownHighlighterProps {
  markdownText: string;
  extractedFields?: ExtractedField[];
  selectedField?: string;
  selectedFieldIndex?: number;
  fileName?: string;
}


const getConfidenceTone = (confidence: number) => {
  if (confidence >= 0.9) {
    return { color: '#37d399', glow: 'rgba(55, 211, 153, 0.45)' };
  }
  if (confidence > 0.7) {
    return { color: '#f6c453', glow: 'rgba(246, 196, 83, 0.4)' };
  }
  return { color: '#f16a5b', glow: 'rgba(241, 106, 91, 0.45)' };
};

const getConfidenceLabel = (confidence: number): string => {
  if (confidence >= 0.9) return 'Высокая';
  if (confidence >= 0.7) return 'Средняя';
  return 'Низкая';
};

const tooltipSurfaceSx = {
  bgcolor: 'rgba(6, 62, 61, 0.96)',
  backgroundImage: 'linear-gradient(135deg, rgba(16, 117, 114, 0.95), rgba(6, 62, 61, 0.98))',
  border: '1px solid rgba(156, 191, 206, 0.35)',
  borderRadius: '10px',
  color: '#ffffff',
  px: 1.5,
  py: 1.25,
  boxShadow: '0 12px 30px rgba(0, 0, 0, 0.25)',
  backdropFilter: 'blur(8px)',
};

const renderFieldTooltipContent = (field: ExtractedField) => {
  const confidencePercent = Math.round(field.confidence * 100);
  const tone = getConfidenceTone(field.confidence);

  return (
    <Box sx={{ minWidth: 200, maxWidth: 260, color: '#ffffff' }}>
      <Typography
        sx={{
          fontSize: '0.9rem',
          color: '#ffffff',
          fontWeight: 600,
          mb: 0.75,
          wordBreak: 'break-word',
        }}
      >
        {field.name}
      </Typography>
      {field.is_corrected ? (
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            px: 1,
            py: 0.35,
            borderRadius: 999,
            bgcolor: 'rgba(255, 255, 255, 0.14)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            fontSize: '0.7rem',
            fontWeight: 600,
            color: '#ffffff',
          }}
        >
          РћС‚СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРѕ
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              flex: 1,
              height: 6,
              bgcolor: 'rgba(255, 255, 255, 0.18)',
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                width: `${confidencePercent}%`,
                height: '100%',
                bgcolor: tone.color,
                boxShadow: `0 0 8px ${tone.glow}`,
              }}
            />
          </Box>
          <Typography
            sx={{
              fontSize: '0.7rem',
              fontWeight: 600,
              color: '#ffffff',
            }}
          >
            {getConfidenceLabel(field.confidence)}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

function HighlightedText({
  text,
  extractedFields,
  selectedField,
  selectedFieldIndex,
  hoveredText,
  setHoveredText,
}: {
  text: string;
  extractedFields: ExtractedField[];
  selectedField?: string;
  selectedFieldIndex?: number;
  hoveredText: string | null;
  setHoveredText: (value: string | null) => void;
}) {
  // Р Р°Р·Р±РёРІР°РµРј С‚РµРєСЃС‚ РЅР° С‡Р°СЃС‚Рё РґР»СЏ РїРѕРґСЃРІРµС‚РєРё
  const parts = useMemo(() => {
    if (!extractedFields || extractedFields.length === 0) {
      return [{ text, field: null, isHighlighted: false }];
    }

    const highlights: Array<{
      start: number;
      end: number;
      field: ExtractedField;
      fieldIndex: number;
    }> = [];

    const collectMatchIndexes = (sourceText: string, needle: string): number[] => {
      if (!needle) return [];

      const indexes: number[] = [];
      let pos = 0;

      while (pos < sourceText.length) {
        const idx = sourceText.indexOf(needle, pos);
        if (idx === -1) break;
        indexes.push(idx);
        pos = idx + 1;
      }

      // If exact-case matches are absent, fallback to case-insensitive matching.
      if (indexes.length === 0) {
        const lowerSource = sourceText.toLocaleLowerCase('ru-RU');
        const lowerNeedle = needle.toLocaleLowerCase('ru-RU');
        pos = 0;
        while (pos < lowerSource.length) {
          const idx = lowerSource.indexOf(lowerNeedle, pos);
          if (idx === -1) break;
          indexes.push(idx);
          pos = idx + 1;
        }
      }

      return indexes;
    };

    // РЎРѕСЂС‚РёСЂСѓРµРј РїРѕР»СЏ РїРѕ РґР»РёРЅРµ Р·РЅР°С‡РµРЅРёСЏ (РѕС‚ Р±РѕР»СЊС€РµРіРѕ Рє РјРµРЅСЊС€РµРјСѓ)
    const sortedFields = extractedFields
      .map((field, index) => ({ field, index }))
      .sort((a, b) => b.field.value.length - a.field.value.length);

        sortedFields.forEach(({ field, index: fieldIndex }) => {
      if (!field.value || field.value === 'РќРµ РЅР°Р№РґРµРЅРѕ') return;

      const matchIndexes = collectMatchIndexes(text, field.value);
      matchIndexes.forEach((index) => {
        const overlaps = highlights.some(
          (h) =>
            (index >= h.start && index < h.end) ||
            (index + field.value.length > h.start && index + field.value.length <= h.end)
        );

        if (!overlaps) {
          highlights.push({
            start: index,
            end: index + field.value.length,
            field,
            fieldIndex,
          });
        }
      });
    });

    highlights.sort((a, b) => a.start - b.start);

    const result: Array<{ text: string; field: ExtractedField | null; fieldIndex?: number; isHighlighted: boolean }> = [];
    let lastPos = 0;

    highlights.forEach((highlight) => {
      if (highlight.start > lastPos) {
        result.push({
          text: text.substring(lastPos, highlight.start),
          field: null,
        fieldIndex: undefined,
          isHighlighted: false,
        });
      }

      result.push({
        text: text.substring(highlight.start, highlight.end),
        field: highlight.field,
        fieldIndex: highlight.fieldIndex,
        isHighlighted: true,
      });

      lastPos = highlight.end;
    });

    if (lastPos < text.length) {
      result.push({
        text: text.substring(lastPos),
        field: null,
        fieldIndex: undefined,
        isHighlighted: false,
      });
    }

    return result;
  }, [text, extractedFields]);

  return (
    <>
      {parts.map((part, index) => {
        if (!part.isHighlighted || !part.field) {
          return <span key={index}>{part.text}</span>;
        }

        const isSelected = (selectedFieldIndex !== undefined && part.fieldIndex === selectedFieldIndex) || selectedField === part.field.name;
        const isHovered = hoveredText === part.field.value;

        let backgroundColor = 'rgba(156, 191, 206, 0.3)';
        let borderColor = 'rgba(156, 191, 206, 0.5)';
        let borderWidth = '1px';
        let boxShadow = 'none';

        if (isSelected) {
          backgroundColor = 'rgba(240, 73, 35, 0.25)';
          borderColor = '#F04923';
          borderWidth = '2px';
          boxShadow = '0 0 0 3px rgba(240, 73, 35, 0.1)';
        } else if (isHovered) {
          backgroundColor = 'rgba(16, 117, 114, 0.25)';
          borderColor = '#107572';
        }

        return (
          <Tooltip
            key={index}
            title={renderFieldTooltipContent(part.field)}
            arrow
            placement="top"
            enterDelay={200}
            leaveDelay={0}
            disableInteractive
            componentsProps={{
              tooltip: {
                sx: {
                  ...tooltipSurfaceSx,
                  '& *': {
                    color: '#ffffff !important',
                  },
                },
              },
              arrow: {
                sx: {
                  color: 'rgba(6, 62, 61, 0.96)',
                },
              },
            }}
          >
            <Box
              component="mark"
              onMouseEnter={() => setHoveredText(part.field!.value)}
              onMouseLeave={() => setHoveredText(null)}
              sx={{
                backgroundColor,
                padding: '1px 4px',
                borderRadius: '3px',
                border: `${borderWidth} solid ${borderColor}`,
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontWeight: isSelected || isHovered ? 600 : 'inherit',
                boxShadow,
                display: 'inline',
              }}
            >
              {part.text}
            </Box>
          </Tooltip>
        );
      })}
    </>
  );
}

export function MarkdownHighlighter({
  markdownText,
  extractedFields = [],
  selectedField,
  selectedFieldIndex,
}: MarkdownHighlighterProps) {
  const [hoveredText, setHoveredText] = useState<string | null>(null);
  const normalizedText = markdownText;

  const processChildren = (children: ReactNode): ReactNode => {
    if (typeof children === 'string') {
      return (
        <HighlightedText
          text={children}
          extractedFields={extractedFields}
          selectedField={selectedField}
          selectedFieldIndex={selectedFieldIndex}
          hoveredText={hoveredText}
          setHoveredText={setHoveredText}
        />
      );
    }
    if (Array.isArray(children)) {
      return children.map((child, i) => (
        <span key={i}>{processChildren(child)}</span>
      ));
    }
    return children;
  };

  // РЎРѕР·РґР°РµРј РєРѕРјРїРѕРЅРµРЅС‚С‹ РґР»СЏ react-markdown СЃ РїРѕРґСЃРІРµС‚РєРѕР№
  const components: Components = useMemo(() => ({
    p: ({ children }) => <p>{processChildren(children)}</p>,
    li: ({ children }) => <li>{processChildren(children)}</li>,
    td: ({ children }) => <td>{processChildren(children)}</td>,
    th: ({ children }) => <th>{processChildren(children)}</th>,
    h1: ({ children }) => <h1>{processChildren(children)}</h1>,
    h2: ({ children }) => <h2>{processChildren(children)}</h2>,
    h3: ({ children }) => <h3>{processChildren(children)}</h3>,
    h4: ({ children }) => <h4>{processChildren(children)}</h4>,
    h5: ({ children }) => <h5>{processChildren(children)}</h5>,
    h6: ({ children }) => <h6>{processChildren(children)}</h6>,
    strong: ({ children }) => <strong>{processChildren(children)}</strong>,
    em: ({ children }) => <em>{processChildren(children)}</em>,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [extractedFields, selectedField, selectedFieldIndex, hoveredText]);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 1,
        border: '1px solid #e9ecef',
        bgcolor: '#ffffff',
        overflow: 'auto',
        maxHeight: '70vh',
      }}
    >
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
        Распознанный текст
      </Typography>

      {/* Legend - moved to top */}
      {extractedFields && extractedFields.length > 0 && (
        <Box
          sx={{
            mb: 2,
            pb: 2,
            borderBottom: '1px solid #e9ecef',
            display: 'flex',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 16,
                height: 16,
                bgcolor: 'rgba(156, 191, 206, 0.3)',
                border: '1px solid rgba(156, 191, 206, 0.5)',
                borderRadius: 0.5,
              }}
            />
            <Typography variant="caption" sx={{ fontSize: '0.75rem', color: '#107572' }}>
              Извлеченные поля
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 16,
                height: 16,
                bgcolor: 'rgba(240, 73, 35, 0.25)',
                border: '2px solid #F04923',
                borderRadius: 0.5,
              }}
            />
            <Typography variant="caption" sx={{ fontSize: '0.75rem', color: '#107572' }}>
              Выбранное поле
            </Typography>
          </Box>
        </Box>
      )}

      <Box
        sx={{
          // РЎС‚РёР»Рё РґР»СЏ markdown СЌР»РµРјРµРЅС‚РѕРІ
          '& h1': {
            fontSize: '1.75rem',
            fontWeight: 700,
            color: '#00504E',
            borderBottom: '2px solid #e9ecef',
            paddingBottom: '8px',
            marginTop: '24px',
            marginBottom: '16px',
          },
          '& h2': {
            fontSize: '1.5rem',
            fontWeight: 600,
            color: '#00504E',
            borderBottom: '1px solid #e9ecef',
            paddingBottom: '6px',
            marginTop: '20px',
            marginBottom: '12px',
          },
          '& h3': {
            fontSize: '1.25rem',
            fontWeight: 600,
            color: '#00504E',
            marginTop: '16px',
            marginBottom: '8px',
          },
          '& h4, & h5, & h6': {
            fontSize: '1rem',
            fontWeight: 600,
            color: '#107572',
            marginTop: '12px',
            marginBottom: '6px',
          },
          '& p': {
            fontSize: '0.9375rem',
            lineHeight: 1.7,
            color: '#00504E',
            marginBottom: '12px',
          },
          '& ul, & ol': {
            marginLeft: '24px',
            marginBottom: '12px',
            '& li': {
              marginBottom: '4px',
              lineHeight: 1.6,
              color: '#00504E',
            },
          },
          '& table': {
            borderCollapse: 'collapse',
            width: '100%',
            marginTop: '16px',
            marginBottom: '16px',
            fontSize: '0.875rem',
          },
          '& th': {
            backgroundColor: '#f8f9fa',
            fontWeight: 600,
            color: '#00504E',
            border: '1px solid #dee2e6',
            padding: '10px 14px',
            textAlign: 'left',
          },
          '& td': {
            border: '1px solid #dee2e6',
            padding: '10px 14px',
            color: '#00504E',
          },
          '& tr:nth-of-type(even)': {
            backgroundColor: '#f8f9fa',
          },
          '& tr:hover': {
            backgroundColor: '#e9ecef',
          },
          '& blockquote': {
            margin: '16px 0',
            padding: '12px 20px',
            borderLeft: '4px solid #107572',
            backgroundColor: '#f8f9fa',
            color: '#107572',
            fontStyle: 'italic',
          },
          '& code': {
            backgroundColor: '#f8f9fa',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '0.875rem',
            fontFamily: '"Roboto Mono", monospace',
            color: '#F04923',
          },
          '& pre': {
            backgroundColor: '#f8f9fa',
            padding: '16px',
            borderRadius: '6px',
            overflow: 'auto',
            marginBottom: '16px',
            border: '1px solid #e9ecef',
            '& code': {
              backgroundColor: 'transparent',
              padding: 0,
              color: '#00504E',
            },
          },
          '& hr': {
            border: 'none',
            borderTop: '2px solid #e9ecef',
            margin: '24px 0',
          },
          '& a': {
            color: '#107572',
            textDecoration: 'none',
            borderBottom: '1px solid #9CBFCE',
            '&:hover': {
              color: '#00504E',
              borderBottomColor: '#00504E',
            },
          },
          '& img': {
            maxWidth: '100%',
            height: 'auto',
            borderRadius: '6px',
          },
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={components}
        >
          {normalizedText}
        </ReactMarkdown>
      </Box>
    </Paper>
  );
}

export default MarkdownHighlighter;

