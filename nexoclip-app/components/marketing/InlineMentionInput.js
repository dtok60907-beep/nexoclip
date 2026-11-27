'use client';

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';

function createMentionPillNode(id, displayLabel, previewUrl = '') {
  const span = document.createElement('span');
  span.setAttribute('contenteditable', 'false');
  span.dataset.mentionId = id;
  span.dataset.mentionLabel = displayLabel;
  span.className =
    'mx-0.5 inline-flex select-none items-center gap-1 rounded-[6px] border border-[#E0E0EA] bg-[#EFEFF4] px-1.5 py-[1px] align-baseline text-[13px] font-medium leading-[1.4] text-[#282A35]';
  if (previewUrl) {
    const img = document.createElement('img');
    img.src = previewUrl;
    img.alt = displayLabel;
    img.className = 'h-3.5 w-3.5 rounded-[3px] object-cover';
    span.appendChild(img);
  }
  const textSpan = document.createElement('span');
  textSpan.textContent = `@${displayLabel}`;
  span.appendChild(textSpan);
  return span;
}

function walkEditorNodes(root) {
  let text = '';
  const mentionIds = [];
  const walk = (node, isFirstChild) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += (node.nodeValue || '').replace(/\u00A0/g, ' ');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    if (el.dataset?.mentionId) {
      const label = el.dataset.mentionLabel || el.textContent?.replace(/^@/, '') || '';
      mentionIds.push(el.dataset.mentionId);
      text += `@${label}`;
      return;
    }
    if (el.tagName === 'BR') {
      text += '\n';
      return;
    }
    const isBlock = el.tagName === 'DIV' || el.tagName === 'P';
    if (isBlock && !isFirstChild && text && !text.endsWith('\n')) {
      text += '\n';
    }
    Array.from(el.childNodes).forEach((child, idx) => walk(child, idx === 0));
  };
  if (root) {
    Array.from(root.childNodes).forEach((child, idx) => walk(child, idx === 0));
  }
  return {
    text: text.replace(/\u200B/g, ''),
    mentionIds,
  };
}

/**
 * Rich plain-text composer input with inline non-editable gray `@mention` chips
 * directly inside the user's sentence flow (e.g. "baca @My Brand fokus ke @Pricing").
 */
const InlineMentionInput = forwardRef(function InlineMentionInput(
  {
    placeholder = 'Describe your ad, campaign, or marketing objective…',
    minHeightClass = 'min-h-[76px]',
    mentionMenuOpen = false,
    onChangeSnapshot,
    onMentionQuery,
    onCloseMention,
    onSubmit,
  },
  ref,
) {
  const editorRef = useRef(null);
  const savedRangeRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const emitSnapshot = useCallback(() => {
    const snap = walkEditorNodes(editorRef.current);
    const empty = !snap.text.trim() && snap.mentionIds.length === 0;
    setIsEmpty(empty);
    onChangeSnapshot?.(snap);
    return snap;
  }, [onChangeSnapshot]);

  const detectMentionAtCaret = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editorRef.current) {
      onMentionQuery?.({ open: false, query: '' });
      return;
    }
    const range = sel.getRangeAt(0);
    if (!editorRef.current.contains(range.startContainer)) {
      return;
    }
    savedRangeRef.current = range.cloneRange();

    if (range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE) {
      const node = range.startContainer;
      const before = (node.nodeValue || '').slice(0, range.startOffset).replace(/\u00A0/g, ' ');
      const m = before.match(/(?:^|\s)@([^\s@]*)$/);
      if (m) {
        const startOffset = range.startOffset - m[1].length - 1;
        onMentionQuery?.({
          open: true,
          query: m[1],
          node,
          startOffset,
          endOffset: range.startOffset,
        });
        return;
      }
    }
    onMentionQuery?.({ open: false, query: '' });
  }, [onMentionQuery]);

  const placeCaretAfter = (node) => {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    savedRangeRef.current = range.cloneRange();
  };

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        const el = editorRef.current;
        if (!el) return;
        el.focus();
        const sel = window.getSelection();
        if (sel && (!sel.rangeCount || !el.contains(sel.anchorNode))) {
          const r = document.createRange();
          r.selectNodeContents(el);
          r.collapse(false);
          sel.removeAllRanges();
          sel.addRange(r);
          savedRangeRef.current = r.cloneRange();
        }
      },
      clear: () => {
        if (!editorRef.current) return;
        editorRef.current.innerHTML = '';
        savedRangeRef.current = null;
        setIsEmpty(true);
        onChangeSnapshot?.({ text: '', mentionIds: [] });
      },
      setPlainText: (nextText) => {
        if (!editorRef.current) return;
        editorRef.current.textContent = String(nextText || '');
        const el = editorRef.current;
        el.focus();
        const sel = window.getSelection();
        if (sel) {
          const r = document.createRange();
          r.selectNodeContents(el);
          r.collapse(false);
          sel.removeAllRanges();
          sel.addRange(r);
          savedRangeRef.current = r.cloneRange();
        }
        emitSnapshot();
      },
      getSnapshot: () => walkEditorNodes(editorRef.current),
      insertMention: ({ id, displayLabel, previewUrl = '' }, replaceInfo = null) => {
        const el = editorRef.current;
        if (!el) return;
        el.focus();

        const pill = createMentionPillNode(id, displayLabel, previewUrl);
        const spaceNode = document.createTextNode(' ');

        let range = null;
        if (
          replaceInfo?.node &&
          el.contains(replaceInfo.node) &&
          replaceInfo.node.nodeType === Node.TEXT_NODE
        ) {
          range = document.createRange();
          const maxLen = (replaceInfo.node.nodeValue || '').length;
          range.setStart(replaceInfo.node, Math.max(0, Math.min(replaceInfo.startOffset, maxLen)));
          range.setEnd(replaceInfo.node, Math.max(0, Math.min(replaceInfo.endOffset, maxLen)));
          range.deleteContents();
        } else if (savedRangeRef.current && el.contains(savedRangeRef.current.startContainer)) {
          range = savedRangeRef.current.cloneRange();
          range.deleteContents();
        } else {
          range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
        }

        // If inserting right after non-whitespace text, add a leading space for readability
        if (
          range.startContainer.nodeType === Node.TEXT_NODE &&
          range.startOffset > 0 &&
          !/\s$/.test((range.startContainer.nodeValue || '').slice(0, range.startOffset))
        ) {
          const leadSpace = document.createTextNode(' ');
          range.insertNode(leadSpace);
          range.setStartAfter(leadSpace);
          range.collapse(true);
        }

        range.insertNode(spaceNode);
        range.insertNode(pill);
        placeCaretAfter(spaceNode);
        emitSnapshot();
      },
    }),
    [emitSnapshot, onChangeSnapshot],
  );

  const handlePaste = (e) => {
    e.preventDefault();
    const plain = e.clipboardData?.getData('text/plain') || '';
    if (!plain) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(plain);
    range.insertNode(textNode);
    placeCaretAfter(textNode);
    emitSnapshot();
    detectMentionAtCaret();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && mentionMenuOpen) {
      e.preventDefault();
      onCloseMention?.();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <div className="relative w-full">
      {isEmpty && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-1.5 top-1 select-none text-[14.5px] leading-relaxed text-[#8E91A2]"
        >
          {placeholder}
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Prompt AI Creative Marketing"
        onInput={() => {
          emitSnapshot();
          detectMentionAtCaret();
        }}
        onKeyUp={detectMentionAtCaret}
        onClick={detectMentionAtCaret}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        className={`${minHeightClass} max-h-44 w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-1.5 py-1 text-[14.5px] leading-relaxed text-[#171821] outline-none`}
      />
    </div>
  );
});

export default InlineMentionInput;
