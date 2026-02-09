import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Box, TextField, IconButton, InputAdornment, Chip } from '@mui/material';
import { Add, Close, Edit, Check } from '@mui/icons-material';

const TABLE_FIELD_PREFIX = 'table:';
const TABLE_FIELD_SEPARATOR = '::';

const defaultFields = [
  'Номер документа',
  'Дата документа',
  'Сумма',
  'НДС',
  'Поставщик',
  'ИНН поставщика',
];

type FieldItem = {
  name: string;
  group?: string;
};

interface FieldConfigurationProps {
  onFieldsChange: (fields: string[]) => void;
  initialFields?: string[];
  readOnly?: boolean;
}

const encodeField = (field: FieldItem) => {
  if (field.group && field.group.trim()) {
    return `${TABLE_FIELD_PREFIX}${field.group.trim()}${TABLE_FIELD_SEPARATOR}${field.name.trim()}`;
  }
  return field.name.trim();
};

const decodeField = (raw: string): FieldItem => {
  const normalized = raw.trim();
  if (normalized.startsWith(TABLE_FIELD_PREFIX) && normalized.includes(TABLE_FIELD_SEPARATOR)) {
    const payload = normalized.slice(TABLE_FIELD_PREFIX.length);
    const [group, name] = payload.split(TABLE_FIELD_SEPARATOR, 2);
    return { name: name?.trim() || normalized, group: group?.trim() || undefined };
  }
  return { name: normalized };
};

const encodeFields = (items: FieldItem[]) => items.map(encodeField);

type IndexedField = { field: FieldItem; index: number };

type GroupedFields = {
  groups: Map<string, IndexedField[]>;
  singles: IndexedField[];
};

export const FieldConfiguration: React.FC<FieldConfigurationProps> = ({
  onFieldsChange,
  initialFields,
  readOnly = false,
}) => {
  const [fields, setFields] = useState<FieldItem[]>(() => {
    const source = initialFields && initialFields.length > 0 ? initialFields : defaultFields;
    return source.map(decodeField);
  });
  const [newField, setNewField] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [groupFieldName, setGroupFieldName] = useState('');
  const [customGroups, setCustomGroups] = useState<string[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const groupedFields = useMemo<GroupedFields>(() => {
    const groups = new Map<string, IndexedField[]>();
    const singles: IndexedField[] = [];

    fields.forEach((field, index) => {
      if (field.group) {
        if (!groups.has(field.group)) {
          groups.set(field.group, []);
        }
        groups.get(field.group)!.push({ field, index });
      } else {
        singles.push({ field, index });
      }
    });

    return { groups, singles };
  }, [fields]);

  const groupOptions = useMemo(() => {
    const groups = new Set(customGroups.map((group) => group.trim()).filter(Boolean));
    groupedFields.groups.forEach((_value, key) => groups.add(key));
    return Array.from(groups);
  }, [customGroups, groupedFields]);

  useEffect(() => {
    if (!selectedGroup && groupOptions.length > 0) {
      const firstGroup = groupOptions[0];
      if (firstGroup) {
        setSelectedGroup(firstGroup);
      }
    }
  }, [groupOptions, selectedGroup]);

  const selectedGroupFields = selectedGroup ? groupedFields.groups.get(selectedGroup) || [] : [];

  const handleAddSingleField = () => {
    if (readOnly) {
      return;
    }
    const candidateName = newField.trim();
    if (!candidateName) {
      return;
    }
    const exists = fields.some((field) => field.name === candidateName && !field.group);
    if (exists) {
      return;
    }
    const updatedFields = [...fields, { name: candidateName }];
    setFields(updatedFields);
    onFieldsChange(encodeFields(updatedFields));
    setNewField('');
  };

  const handleAddGroupField = () => {
    if (readOnly) {
      return;
    }
    const candidateGroup = selectedGroup.trim();
    const candidateName = groupFieldName.trim();
    if (!candidateGroup || !candidateName) {
      return;
    }
    const exists = fields.some(
      (field) => field.name === candidateName && (field.group || '') === candidateGroup
    );
    if (exists) {
      return;
    }
    const updatedFields = [...fields, { name: candidateName, group: candidateGroup }];
    setFields(updatedFields);
    onFieldsChange(encodeFields(updatedFields));
    setGroupFieldName('');
  };

  const handleAddGroup = () => {
    if (readOnly) {
      return;
    }
    const candidateGroup = selectedGroup.trim();
    if (!candidateGroup) {
      return;
    }
    if (groupOptions.includes(candidateGroup)) {
      return;
    }
    setCustomGroups((prev) => [...prev, candidateGroup]);
  };

  const handleRemoveField = (index: number) => {
    if (readOnly) {
      return;
    }
    const updatedFields = fields.filter((_, i) => i != index);
    setFields(updatedFields);
    onFieldsChange(encodeFields(updatedFields));
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditValue('');
    }
  };

  const handleStartEdit = (index: number) => {
    if (readOnly) {
      return;
    }
    setEditingIndex(index);
    setEditValue(fields[index].name);
  };

  const handleSaveEdit = () => {
    if (readOnly) {
      return;
    }
    if (editingIndex === null || !editValue.trim()) {
      return;
    }
    const updatedFields = [...fields];
    updatedFields[editingIndex] = {
      ...updatedFields[editingIndex],
      name: editValue.trim(),
    };
    setFields(updatedFields);
    onFieldsChange(encodeFields(updatedFields));
    setEditingIndex(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditValue('');
  };

  const handleSingleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleAddSingleField();
    }
  };

  const handleGroupKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleAddGroupField();
    }
  };

  const handleGroupNameKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleAddGroup();
    }
  };

  const handleEditKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSaveEdit();
    } else if (event.key === 'Escape') {
      handleCancelEdit();
    }
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
        Поля для извлечения
      </Typography>

      <Box sx={{ mb: 2 }}>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mb: 1,
            color: '#107572',
            fontSize: '0.6875rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Обычные поля
        </Typography>

        {groupedFields.singles.length === 0 ? (
          <Typography variant="body2" sx={{ color: '#6c757d', fontSize: '0.75rem' }}>
            Поля пока нет
          </Typography>
        ) : (
          groupedFields.singles.map(({ field, index }) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                alignItems: 'center',
                py: 0.75,
                px: 1.5,
                mb: 0.5,
                bgcolor: '#f8f9fa',
                borderRadius: 1,
                border: '1px solid #dee2e6',
                '&:hover': {
                  bgcolor: '#e9ecef',
                  borderColor: '#adb5bd',
                },
              }}
            >
              {editingIndex === index ? (
                <TextField
                  fullWidth
                  size="small"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleEditKeyPress}
                  autoFocus
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      fontSize: '0.8125rem',
                      bgcolor: '#ffffff',
                      '& fieldset': {
                        borderColor: '#107572',
                      },
                    },
                    '& .MuiInputBase-input': {
                      py: 0.5,
                    },
                  }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        {!readOnly && (
                          <>
                            <IconButton
                              size="small"
                              onClick={handleSaveEdit}
                              sx={{ color: '#28a745', p: 0.25 }}
                            >
                              <Check sx={{ fontSize: 16 }} />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={handleCancelEdit}
                              sx={{ color: '#6c757d', p: 0.25 }}
                            >
                              <Close sx={{ fontSize: 16 }} />
                            </IconButton>
                          </>
                        )}
                      </InputAdornment>
                    ),
                  }}
                />
              ) : (
                <>
                  <Typography
                    sx={{
                      flex: 1,
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      color: '#00504E',
                    }}
                  >
                    {field.name}
                  </Typography>
                  {!readOnly && (
                    <>
                      <IconButton
                        size="small"
                        onClick={() => handleStartEdit(index)}
                        sx={{
                          p: 0.25,
                          color: '#6c757d',
                          '&:hover': { color: '#107572' },
                        }}
                      >
                        <Edit sx={{ fontSize: 14 }} />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveField(index)}
                        sx={{
                          p: 0.25,
                          color: '#6c757d',
                          '&:hover': { color: '#F04923' },
                        }}
                      >
                        <Close sx={{ fontSize: 14 }} />
                      </IconButton>
                    </>
                  )}
                </>
              )}
            </Box>
          ))
        )}

        {!readOnly && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Добавить поле"
              value={newField}
              onChange={(e) => setNewField(e.target.value)}
              onKeyPress={handleSingleKeyPress}
              sx={{
                '& .MuiOutlinedInput-root': {
                  fontSize: '0.8125rem',
                  borderRadius: 1,
                  bgcolor: '#ffffff',
                  '& fieldset': {
                    borderColor: '#dee2e6',
                  },
                  '&:hover fieldset': {
                    borderColor: '#adb5bd',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#F04923',
                    borderWidth: 1,
                  },
                },
              }}
            />
            <IconButton
              onClick={handleAddSingleField}
              disabled={!newField.trim()}
              size="small"
              sx={{
                bgcolor: '#F04923',
                color: '#ffffff',
                width: 32,
                height: 32,
                '&:hover': {
                  bgcolor: '#c72f00',
                },
                '&:disabled': {
                  bgcolor: '#e9ecef',
                  color: '#adb5bd',
                },
              }}
            >
              <Add sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        )}
      </Box>

      <Box>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mb: 1,
            color: '#107572',
            fontSize: '0.6875rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Табличные группы
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField
            fullWidth
            size="small"
            value={selectedGroup}
            onChange={(event) => setSelectedGroup(event.target.value)}
            onKeyDown={handleGroupNameKeyPress}
            placeholder="Введите название группы"
            sx={{
              '& .MuiOutlinedInput-root': {
                fontSize: '0.8125rem',
                borderRadius: 1,
                bgcolor: '#ffffff',
              },
            }}
          />
          {!readOnly && (
            <IconButton
              onClick={handleAddGroup}
              disabled={!selectedGroup.trim() || groupOptions.includes(selectedGroup.trim())}
              size="small"
              sx={{
                bgcolor: '#F04923',
                color: '#ffffff',
                width: 32,
                height: 32,
                '&:hover': {
                  bgcolor: '#c72f00',
                },
                '&:disabled': {
                  bgcolor: '#e9ecef',
                  color: '#adb5bd',
                },
              }}
            >
              <Add sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Box>
        {groupOptions.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
            {groupOptions.map((group) => (
              <Chip
                key={group}
                label={group}
                size="small"
                onClick={() => setSelectedGroup(group)}
                sx={{
                  height: 22,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  bgcolor: group === selectedGroup ? '#107572' : '#e9ecef',
                  color: group === selectedGroup ? '#ffffff' : '#107572',
                }}
              />
            ))}
          </Box>
        )}

        {selectedGroup ? (
          <Box sx={{ mt: 1 }}>
            {selectedGroupFields.length === 0 ? (
              <Typography variant="body2" sx={{ color: '#6c757d', fontSize: '0.75rem' }}>
                В группе пока нет полей
              </Typography>
            ) : (
              selectedGroupFields.map(({ field, index }) => (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    py: 0.75,
                    px: 1.5,
                    mb: 0.5,
                    bgcolor: '#f8f9fa',
                    borderRadius: 1,
                    border: '1px solid #dee2e6',
                    '&:hover': {
                      bgcolor: '#e9ecef',
                      borderColor: '#adb5bd',
                    },
                  }}
                >
                  {editingIndex === index ? (
                    <TextField
                      fullWidth
                      size="small"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleEditKeyPress}
                      autoFocus
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          fontSize: '0.8125rem',
                          bgcolor: '#ffffff',
                          '& fieldset': {
                            borderColor: '#107572',
                          },
                        },
                        '& .MuiInputBase-input': {
                          py: 0.5,
                        },
                      }}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            {!readOnly && (
                              <>
                                <IconButton
                                  size="small"
                                  onClick={handleSaveEdit}
                                  sx={{ color: '#28a745', p: 0.25 }}
                                >
                                  <Check sx={{ fontSize: 16 }} />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={handleCancelEdit}
                                  sx={{ color: '#6c757d', p: 0.25 }}
                                >
                                  <Close sx={{ fontSize: 16 }} />
                                </IconButton>
                              </>
                            )}
                          </InputAdornment>
                        ),
                      }}
                    />
                  ) : (
                    <>
                      <Typography
                        sx={{
                          flex: 1,
                          fontSize: '0.8125rem',
                          fontWeight: 500,
                          color: '#00504E',
                        }}
                      >
                        {field.name}
                      </Typography>
                      <Chip
                        label={`Группа: ${selectedGroup}`}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          bgcolor: '#e9ecef',
                          color: '#107572',
                          mr: 1,
                        }}
                      />
                      {!readOnly && (
                        <>
                          <IconButton
                            size="small"
                            onClick={() => handleStartEdit(index)}
                            sx={{
                              p: 0.25,
                              color: '#6c757d',
                              '&:hover': { color: '#107572' },
                            }}
                          >
                            <Edit sx={{ fontSize: 14 }} />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleRemoveField(index)}
                            sx={{
                              p: 0.25,
                              color: '#6c757d',
                              '&:hover': { color: '#F04923' },
                            }}
                          >
                            <Close sx={{ fontSize: 14 }} />
                          </IconButton>
                        </>
                      )}
                    </>
                  )}
                </Box>
              ))
            )}

            {!readOnly && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Добавить поле в группу"
                  value={groupFieldName}
                  onChange={(e) => setGroupFieldName(e.target.value)}
                  onKeyPress={handleGroupKeyPress}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      fontSize: '0.8125rem',
                      borderRadius: 1,
                      bgcolor: '#ffffff',
                      '& fieldset': {
                        borderColor: '#dee2e6',
                      },
                      '&:hover fieldset': {
                        borderColor: '#adb5bd',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#F04923',
                        borderWidth: 1,
                      },
                    },
                  }}
                />
                <IconButton
                  onClick={handleAddGroupField}
                  disabled={!groupFieldName.trim()}
                  size="small"
                  sx={{
                    bgcolor: '#F04923',
                    color: '#ffffff',
                    width: 32,
                    height: 32,
                    '&:hover': {
                      bgcolor: '#c72f00',
                    },
                    '&:disabled': {
                      bgcolor: '#e9ecef',
                      color: '#adb5bd',
                    },
                  }}
                >
                  <Add sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            )}
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: '#6c757d', fontSize: '0.75rem', mt: 1 }}>
            Введите название группы и нажмите плюс, чтобы добавить поля
        </Typography>
        )}
      </Box>
    </Box>
  );
};
