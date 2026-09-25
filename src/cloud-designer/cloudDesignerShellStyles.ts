// src/cloud-designer/cloudDesignerShellStyles.ts — Cloud Designer chrome CSS

export const CLOUD_DESIGNER_SHELL_CSS = `
.cloud-designer-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: system-ui, sans-serif;
  color: #c8bfb0;
  background: #1a2228;
}
.cloud-designer-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #2a343c;
  background: #151b20;
}
.cloud-designer-header h1 {
  margin: 0;
  font-family: Georgia, serif;
  font-size: 1.15rem;
  font-weight: normal;
  font-style: italic;
}
.cloud-designer-header label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}
.cloud-designer-header select,
.cloud-designer-header button {
  background: #1a2228;
  color: #c8bfb0;
  border: 1px solid #3a454e;
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  font: inherit;
  cursor: pointer;
}
.cloud-designer-header button:hover {
  background: #2a343c;
}
.cloud-designer-header .cd-io {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
}
.cloud-designer-body {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-height: 0;
  position: relative;
}
.cloud-designer-scene-host {
  flex: 1;
  min-height: 240px;
  background: #0e1317;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cloud-designer-scene-stub {
  opacity: 0.55;
  font-family: Georgia, serif;
  font-style: italic;
  text-align: center;
  padding: 2rem;
  pointer-events: none;
}
.cloud-designer-profile {
  width: 300px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 0.75rem 1rem 1rem;
  border-left: 1px solid #2a343c;
  background: #151b20;
  font-size: 0.8rem;
}
.cloud-designer-profile h2 {
  margin: 0 0 0.75rem;
  font-family: Georgia, serif;
  font-size: 0.95rem;
  font-weight: normal;
  font-style: italic;
  color: #c8bfb0;
}
.cloud-designer-profile h3 {
  margin: 1rem 0 0.5rem;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #8a8278;
}
.cloud-designer-profile .cd-preview-note,
.cloud-designer-profile .cd-field-hint {
  margin: 0 0 0.6rem;
  font-size: 0.72rem;
  color: #6a9080;
  line-height: 1.35;
}
.cloud-designer-profile .cd-field-hint {
  margin: 0.15rem 0 0;
}
.cloud-designer-profile .cd-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin-bottom: 0.75rem;
}
.cloud-designer-profile .cd-field-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
}
.cloud-designer-profile .cd-field label {
  color: #a89f92;
}
.cloud-designer-profile .cd-field .cd-val {
  font-variant-numeric: tabular-nums;
  color: #c8bfb0;
}
.cloud-designer-profile input[type="range"] {
  width: 100%;
  accent-color: #7a8f9e;
}
.cloud-designer-profile .cd-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.cloud-designer-profile .cd-actions button {
  flex: 1;
  min-width: 5.5rem;
  padding: 0.3rem 0.45rem;
  border: 1px solid #3a454e;
  border-radius: 4px;
  background: #1a2228;
  color: #c8bfb0;
  cursor: pointer;
  font: inherit;
}
.cloud-designer-profile .cd-actions button:hover {
  background: #2a343c;
}
.cloud-designer-profile .cd-check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}
.cloud-designer-profile .cd-check input {
  margin: 0;
}
.cloud-designer-profile .cd-notes {
  margin: 0.25rem 0 0;
  padding: 0.5rem 0.6rem;
  background: #1a2228;
  border: 1px solid #2a343c;
  border-radius: 4px;
  color: #8a8278;
  line-height: 1.35;
  white-space: pre-wrap;
}
.cloud-designer-status {
  padding: 0.5rem 1rem;
  font-size: 0.8rem;
  border-top: 1px solid #2a343c;
  color: #8a8278;
}
`;
