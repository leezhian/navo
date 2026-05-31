export const pierreDiffUnsafeCss = `
:host {
  --diffs-font-size: 12px;
  --diffs-gap-block: 0px;
  --diffs-gap-inline: 8px;
  --diffs-bg: var(--background);
  --diffs-light-bg: var(--background);
  --diffs-dark-bg: var(--background);
  --diffs-light: var(--foreground);
  --diffs-dark: var(--foreground);
  --diffs-bg-context: var(--background);
  --diffs-bg-context-gutter: var(--background);
  --diffs-bg-hover-override: var(--muted-foreground);
  background: var(--background);
}

[data-code] {
  scrollbar-gutter: auto;
  overflow-x: auto;
  overflow-y: clip;
  position: relative;
  z-index: 0;
}

[data-diffs-header="custom"][data-sticky] {
  background: var(--background);
}

[data-gutter] [data-gutter-buffer],
[data-gutter] [data-column-number] {
  border-right: 1px solid color-mix(in oklab, var(--border) 45%, transparent);
}

[data-column-number] {
  overflow: visible;
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
  width: 1lh;
  height: 1lh;
  margin-right: -1px;
  border-radius: 4px;
  background: var(--foreground);
  color: var(--background);
}
`;
