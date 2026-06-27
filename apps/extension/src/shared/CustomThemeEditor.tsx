import type { CSSProperties } from 'react';

import { Button } from '@grape/ui';
import type { CustomThemeConfig } from '@grape/core';

const CUSTOM_THEME_FIELDS: Array<{
  key: keyof CustomThemeConfig;
  label: string;
  description: string;
}> = [
  {
    key: 'background',
    label: 'Background',
    description: 'Main backdrop tone.'
  },
  {
    key: 'surface',
    label: 'Surface',
    description: 'Cards and panels.'
  },
  {
    key: 'text',
    label: 'Text',
    description: 'Primary reading color.'
  },
  {
    key: 'accent',
    label: 'Accent One',
    description: 'Primary action color.'
  },
  {
    key: 'accent2',
    label: 'Accent Two',
    description: 'Secondary glow color.'
  }
];

type CustomThemeEditorProps = {
  theme: CustomThemeConfig;
  onChange: (theme: CustomThemeConfig) => void | Promise<void>;
  onReset: () => void | Promise<void>;
};

export function CustomThemeEditor(props: CustomThemeEditorProps) {
  const previewStyle = {
    '--custom-theme-background': props.theme.background,
    '--custom-theme-surface': props.theme.surface,
    '--custom-theme-text': props.theme.text,
    '--custom-theme-accent': props.theme.accent,
    '--custom-theme-accent-2': props.theme.accent2
  } as CSSProperties;

  return (
    <div className="custom-theme-editor stack">
      <div className="custom-theme-preview" style={previewStyle}>
        <div className="custom-theme-preview-card">
          <span className="custom-theme-preview-eyebrow">Live preview</span>
          <strong>Grape Wallet</strong>
          <p>Your custom skin updates the full extension UI.</p>
          <div className="custom-theme-preview-pills">
            <span className="custom-theme-preview-pill custom-theme-preview-pill-primary">Primary</span>
            <span className="custom-theme-preview-pill">Surface</span>
          </div>
        </div>
      </div>
      <div className="custom-theme-grid">
        {CUSTOM_THEME_FIELDS.map((field) => (
          <label key={field.key} className="custom-theme-field">
            <span className="custom-theme-field-copy">
              <strong>{field.label}</strong>
              <small className="muted">{field.description}</small>
            </span>
            <span className="custom-theme-field-control">
              <input
                className="custom-theme-color"
                type="color"
                value={props.theme[field.key]}
                onChange={(event) =>
                  void props.onChange({
                    ...props.theme,
                    [field.key]: event.target.value
                  })
                }
              />
              <code>{props.theme[field.key].toUpperCase()}</code>
            </span>
          </label>
        ))}
      </div>
      <div className="settings-row">
        <span className="muted">Reset your custom colors back to the default Grape palette.</span>
        <Button tone="secondary" onClick={() => void props.onReset()}>
          Reset custom skin
        </Button>
      </div>
    </div>
  );
}
