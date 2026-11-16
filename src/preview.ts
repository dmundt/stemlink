import { stemPattern } from "./core";

interface MarkdownToken {
  type: string;
  content: string;
}

interface InlineState {
  src: string;
  pos: number;
  posMax: number;
  level: number;
  linkLevel?: number;
  tokens: MarkdownToken[];
  push(type: string, tag: string, nesting: number): MarkdownToken;
}

export interface MarkdownParser {
  inline: {
    ruler: {
      before(
        existing: string,
        name: string,
        rule: (state: InlineState, silent: boolean) => boolean,
      ): void;
    };
  };
  renderer: {
    rules: Record<
      string,
      | ((tokens: MarkdownToken[], index: number, options: unknown, environment: unknown) => string)
      | undefined
    >;
  };
  utils: { escapeHtml(text: string): string };
}

export function extendMarkdownPreview(
  markdown: MarkdownParser,
  trusted: () => boolean,
  resolve: (stem: string, environment: unknown) => string | undefined,
): MarkdownParser {
  markdown.inline.ruler.before("link", "stemlink_wikilink", (state, silent) => {
    if (
      silent ||
      !trusted() ||
      (state.linkLevel ?? 0) > 0 ||
      !state.src.startsWith("[[", state.pos)
    )
      return false;
    // Older host parsers do not expose linkLevel.
    if (state.level > 0) {
      for (let index = state.tokens.length - 1; index >= 0; index--) {
        if (state.tokens[index].type === "link_close") break;
        if (state.tokens[index].type === "link_open") return false;
      }
    }
    const end = state.src.indexOf("]]", state.pos + 2);
    if (end < 0 || end + 2 > state.posMax) return false;
    const stem = state.src.slice(state.pos + 2, end);
    if (!stemPattern.test(stem)) return false;
    state.push("stemlink_wikilink", "", 0).content = stem;
    state.pos = end + 2;
    return true;
  });
  markdown.renderer.rules.stemlink_wikilink = (tokens, index, _options, environment) => {
    const stem = tokens[index].content;
    const target = trusted() ? resolve(stem, environment) : undefined;
    if (!target) return markdown.utils.escapeHtml(`[[${stem}]]`);
    const href = markdown.utils.escapeHtml(target);
    return `<a href="${href}" data-href="${href}">${markdown.utils.escapeHtml(stem)}</a>`;
  };
  return markdown;
}
