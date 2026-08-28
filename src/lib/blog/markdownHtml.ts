function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function markdownToHtml(markdown: string): string {
  const blocks = (markdown || '').trim().split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = escapeHtml(block).split('\n');
      const first = lines[0] ?? '';
      if (first.startsWith('### ')) return `<h3>${first.slice(4)}</h3>`;
      if (first.startsWith('## ')) return `<h2>${first.slice(3)}</h2>`;
      if (first.startsWith('# ')) return `<h1>${first.slice(2)}</h1>`;
      return `<p>${lines.join('<br/>')}</p>`;
    })
    .join('\n');
}

export function toMarkdownDraft(input: {
  title: string;
  intro: string;
  story: string;
  places: string;
  closing: string;
}): string {
  return [
    `# ${input.title}`,
    '',
    '## 도입부',
    input.intro,
    '',
    '## 여행 이야기',
    input.story,
    '',
    '## 장소 소개',
    input.places,
    '',
    '## 마무리 소감',
    input.closing,
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

export function proseCharCount(parts: string[]): number {
  return parts.map((part) => part.replace(/\s+/g, ' ').trim()).join('').length;
}
