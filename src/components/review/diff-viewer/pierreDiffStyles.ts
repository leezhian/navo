export const pierreDiffUnsafeCss = `
:host {
  --diffs-font-size: 12px;
  --diffs-line-height: 22px;
  --diffs-gap-block: 0px;
  --diffs-gap-inline: 0px;
  --diffs-review-scrollbar-size: 8px;
  --diffs-grid-number-column-width: 52px;
  --diffs-min-number-column-width: 3ch;
  --diffs-bg: var(--background);
  --diffs-light-bg: var(--background);
  --diffs-dark-bg: var(--background);
  --diffs-light: var(--foreground);
  --diffs-dark: var(--foreground);
  --diffs-bg-context: var(--background);
  --diffs-bg-context-gutter: var(--background);
  --diffs-fg-number-override: var(--muted-foreground);
  --diffs-bg-addition-emphasis-override: rgb(134 239 172 / 0.28);
  --diffs-bg-deletion-emphasis-override: rgb(252 165 165 / 0.28);
  --diffs-bg-hover-override: var(--muted-foreground);
  background: var(--background);
}

@media (prefers-color-scheme: dark) {
  :host {
    --diffs-bg-addition-emphasis-override: rgb(74 222 128 / 0.22);
    --diffs-bg-deletion-emphasis-override: rgb(248 113 113 / 0.22);
  }
}

[data-code] {
  scrollbar-gutter: auto;
  overflow-x: auto;
  overflow-y: clip;
  position: relative;
  z-index: 0;
}

[data-code]::-webkit-scrollbar {
  height: var(--diffs-review-scrollbar-size);
}

[data-overflow=scroll] [data-code] {
  padding-bottom: var(--diffs-review-scrollbar-size);
}

[data-code]::-webkit-scrollbar-thumb {
  background-color: color-mix(in oklab, var(--muted-foreground) 36%, transparent);
  border-radius: 4px;
}

[data-code]::-webkit-scrollbar-track {
  background: transparent;
}

[data-gutter] [data-gutter-buffer],
[data-gutter] [data-column-number] {
  border-right: 1px solid color-mix(in oklab, var(--border) 45%, transparent);
}

[data-line],
[data-column-number],
[data-no-newline] {
  min-height: 22px;
}

[data-line] {
  padding-left: 14px;
  padding-right: 14px;
}

[data-column-number] {
  padding-left: 10px;
  padding-right: 10px;
  overflow: visible;
}

[data-column-number][data-hovered] [data-line-number-content] {
  opacity: 0;
}

[data-gutter-utility-slot] {
  z-index: 30;
  overflow: visible;
}

[data-line-annotation] {
  min-width: 100%;
}

[data-annotation-content] {
  width: var(--diffs-column-content-width, auto);
}

[data-utility-button] {
  position: relative;
  z-index: 31;
  width: 22px;
  height: 22px;
  margin-right: -1px;
  border-radius: 4px;
  background: var(--foreground);
  color: var(--background);
}
`;
