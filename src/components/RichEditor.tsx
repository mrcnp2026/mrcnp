'use client';
// 서식 있는 글쓰기 (게시판 · 공지 · 업무 메시지, 2026-10-16 의뢰인: 사진 첨부 · 끌어다 놓기로 본문에 바로 넣기 · 간단한 편집).
// 편집기는 TipTap(MIT). 굵게 · 기울임 · 밑줄 · 취소선 · 제목 2단계 · 목록 · 번호 목록 · 인용 · 구분선 · 링크 · 사진 · 되돌리기.
// 사진: [사진] 단추 · 끌어다 놓기 · 붙여넣기 → 긴 변 1920px로 줄여 /api/images에 올리고 그 자리에 넣는다.
// 저장은 부르는 쪽이 한다 — 바뀔 때마다 onChange(html), 폼으로 보낼 때를 위해 숨은 칸(name)에도 담는다. 서버가 다시 거른다(lib/rich-text).
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import Image from '@tiptap/extension-image';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Loader2, Minus, Quote, Redo2, Strikethrough, Underline, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

const MAX_SIDE = 1920;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** 큰 사진은 긴 변 1920px로 줄인다(gif는 움직임이 깨지지 않게 그대로) */
async function shrink(file: File): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b ?? file), 'image/jpeg', 0.85));
}

export function RichEditor({ name, defaultHtml = '', kind, placeholder, onChange, minHeight = 'min-h-48' }: { name?: string; defaultHtml?: string; kind: 'board' | 'notice' | 'message'; placeholder?: string; onChange?: (html: string) => void; minHeight?: string }) {
  const t = useTranslations('rich');
  const [html, setHtml] = useState(defaultHtml);
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  async function upload(files: File[], at?: number) {
    const ed = editorRef.current;
    if (!ed) return;
    setErr(null);
    for (const f of files.filter((x) => TYPES.includes(x.type))) {
      setBusy((n) => n + 1);
      try {
        const body = new FormData();
        body.append('file', await shrink(f), f.name);
        body.append('kind', kind);
        const res = await fetch('/api/images', { method: 'POST', body });
        const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !json.url) {
          setErr(t(`err.${json.error === 'image_too_large' || json.error === 'image_type' || json.error === 'db_update_required' ? json.error : 'upload'}`));
          continue;
        }
        const chain = ed.chain().focus();
        (at !== undefined ? chain.insertContentAt(at, { type: 'image', attrs: { src: json.url, alt: f.name } }) : chain.setImage({ src: json.url, alt: f.name })).run();
      } catch {
        setErr(t('err.upload'));
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (files.some((x) => !TYPES.includes(x.type))) setErr(t('err.image_type'));
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true, protocols: ['https', 'http', 'mailto', 'tel'] } }), Image.configure({ inline: false, allowBase64: false })],
    content: defaultHtml,
    editorProps: {
      attributes: { class: `rich-body ${minHeight} px-3 py-2 outline-none`, 'aria-label': placeholder ?? t('label'), role: 'textbox', 'aria-multiline': 'true' },
      handleDrop: (view, event, _slice, moved) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (moved || files.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void upload(files, pos);
        return true;
      },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])];
        if (files.length === 0) return false;
        event.preventDefault();
        void upload(files);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      const v = e.isEmpty ? '' : e.getHTML();
      setHtml(v);
      onChange?.(v);
    },
  });
  editorRef.current = editor;

  const btn = (on: boolean) => `flex size-9 items-center justify-center rounded-button ${on ? 'bg-primary-tint text-primary' : 'text-muted hover:bg-surface hover:text-text'}`;
  const tools: { key: string; icon: typeof Bold; run: (e: Editor) => void; on?: (e: Editor) => boolean }[] = [
    { key: 'bold', icon: Bold, run: (e) => e.chain().focus().toggleBold().run(), on: (e) => e.isActive('bold') },
    { key: 'italic', icon: Italic, run: (e) => e.chain().focus().toggleItalic().run(), on: (e) => e.isActive('italic') },
    { key: 'underline', icon: Underline, run: (e) => e.chain().focus().toggleUnderline().run(), on: (e) => e.isActive('underline') },
    { key: 'strike', icon: Strikethrough, run: (e) => e.chain().focus().toggleStrike().run(), on: (e) => e.isActive('strike') },
    { key: 'h2', icon: Heading2, run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), on: (e) => e.isActive('heading', { level: 2 }) },
    { key: 'h3', icon: Heading3, run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), on: (e) => e.isActive('heading', { level: 3 }) },
    { key: 'bullet', icon: List, run: (e) => e.chain().focus().toggleBulletList().run(), on: (e) => e.isActive('bulletList') },
    { key: 'ordered', icon: ListOrdered, run: (e) => e.chain().focus().toggleOrderedList().run(), on: (e) => e.isActive('orderedList') },
    { key: 'quote', icon: Quote, run: (e) => e.chain().focus().toggleBlockquote().run(), on: (e) => e.isActive('blockquote') },
    { key: 'hr', icon: Minus, run: (e) => e.chain().focus().setHorizontalRule().run() },
    {
      key: 'link',
      icon: Link2,
      on: (e) => e.isActive('link'),
      run: (e) => {
        if (e.isActive('link')) return void e.chain().focus().unsetLink().run();
        const url = window.prompt(t('linkPrompt'), 'https://');
        if (url && /^(https?:\/\/|mailto:|tel:)/i.test(url.trim())) e.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
      },
    },
    { key: 'undo', icon: Undo2, run: (e) => e.chain().focus().undo().run() },
    { key: 'redo', icon: Redo2, run: (e) => e.chain().focus().redo().run() },
  ];

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-border bg-bg focus-within:border-primary" data-rich-editor>
      <div role="toolbar" aria-label={t('toolbar')} className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface px-1 py-1">
        {tools.map(({ key, icon: Icon, run, on }) => (
          <button key={key} type="button" title={t(`tool.${key}`)} aria-label={t(`tool.${key}`)} aria-pressed={on && editor ? on(editor) : undefined} disabled={!editor} onClick={() => editor && run(editor)} className={btn(!!(on && editor && on(editor)))}>
            <Icon aria-hidden size={17} strokeWidth={2} />
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <button type="button" disabled={!editor} onClick={() => fileRef.current?.click()} className="flex h-9 items-center gap-1 rounded-button px-2 text-sm font-semibold text-primary hover:bg-primary-tint">
          {busy > 0 ? <Loader2 aria-hidden size={17} /> : <ImagePlus aria-hidden size={17} />}
          {t('tool.image')}
        </button>
        <input ref={fileRef} type="file" accept={TYPES.join(',')} multiple hidden onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </div>
      <EditorContent editor={editor} />
      <p className="border-t border-border bg-surface px-3 py-1.5 text-xs text-faint">{busy > 0 ? t('uploading', { n: busy }) : err ?? t('hint')}</p>
      {name && <input type="hidden" name={name} value={html} />}
    </div>
  );
}
