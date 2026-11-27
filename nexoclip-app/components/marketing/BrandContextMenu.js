'use client';

import { useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  ExternalLink,
  Home,
  MessageSquare,
  Plus,
  ShoppingBag,
  SwatchBook,
  TrendingUp,
  User,
} from 'lucide-react';

function SectionIcon({ sectionKey, className = 'h-3.5 w-3.5 text-[#7A7D8F]' }) {
  if (sectionKey === 'overview') return <Home className={className} strokeWidth={1.75} />;
  if (sectionKey === 'brand-kit') return <SwatchBook className={className} strokeWidth={1.75} />;
  if (sectionKey === 'audience') return <User className={className} strokeWidth={1.75} />;
  if (sectionKey === 'messaging') return <MessageSquare className={className} strokeWidth={1.75} />;
  if (sectionKey === 'competitors') return <TrendingUp className={className} strokeWidth={1.75} />;
  return <ShoppingBag className={className} strokeWidth={1.75} />;
}

/**
 * Multi-level hierarchical My Brand & Products partial context menu.
 * Triggered by typing `@` in the composer OR hovering/clicking `+ -> My Brand`.
 *
 * - Clicking a top-level section or product selects ALL context for that item.
 * - Hovering a section/product reveals its dynamic sub-contexts (and 3rd-level
 *   competitor sub-headings such as Positioning, Strengths, Weaknesses, Ad angles).
 */
export default function BrandContextMenu({
  tree,
  query = '',
  brandFullActive = false,
  selectedRefIds = new Set(),
  onToggleFullBrand,
  onSelectRef,
  onConnectAccount,
  onOpenBrandKit,
}) {
  const [hoveredL1, setHoveredL1] = useState(null); // { kind: 'section' | 'product', item }
  const [hoveredL2, setHoveredL2] = useState(null); // e.g. competitor subpage with level-3 children

  const sections = useMemo(() => (Array.isArray(tree?.sections) ? tree.sections : []), [tree?.sections]);
  const products = useMemo(() => (Array.isArray(tree?.products) ? tree.products : []), [tree?.products]);

  const q = String(query || '').trim().toLowerCase();

  const filteredSections = useMemo(() => {
    if (!q) return sections;
    return sections.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        (s.children || []).some(
          (c) =>
            c.label.toLowerCase().includes(q) ||
            (c.children || []).some((gc) => gc.label.toLowerCase().includes(q)),
        ),
    );
  }, [sections, q]);

  const filteredProducts = useMemo(() => {
    if (!q) return products;
    return products.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        (p.children || []).some((c) => c.label.toLowerCase().includes(q)),
    );
  }, [products, q]);

  // Flat quick-match results when user types a specific sub-item after `@` (e.g. `@pricing` or `@tone`)
  const directSubMatches = useMemo(() => {
    if (!q) return [];
    const hits = [];
    for (const s of sections) {
      for (const c of s.children || []) {
        if (c.label.toLowerCase().includes(q)) hits.push(c);
        for (const gc of c.children || []) {
          if (gc.label.toLowerCase().includes(q)) hits.push(gc);
        }
      }
    }
    for (const p of products) {
      for (const c of p.children || []) {
        if (c.label.toLowerCase().includes(q)) hits.push(c);
      }
    }
    return hits.slice(0, 8);
  }, [sections, products, q]);

  const l2Items = hoveredL1?.item?.children || [];
  const l3Items = hoveredL2?.children || [];

  return (
    <div className="flex items-end gap-2">
      {/* LEVEL 1: My Brand + Sections + Products */}
      <div className="flex max-h-[396px] w-[274px] flex-col overflow-hidden rounded-[18px] border border-[#E6E6F0] bg-white shadow-[0_14px_38px_-10px_rgba(24,24,48,0.16)]">
        <div className="flex-1 overflow-y-auto p-1.5">
          {/* My Brand header */}
          <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
            <span className="text-[11px] font-medium text-[#8C8FA1]">My Brand</span>
            {onOpenBrandKit && (
              <button
                type="button"
                onClick={onOpenBrandKit}
                className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-[#5B45F2] hover:underline"
              >
                Edit <ExternalLink className="h-2.5 w-2.5" />
              </button>
            )}
          </div>

          {(!q || 'my brand'.includes(q) || (tree?.brandName || '').toLowerCase().includes(q)) && (
            <button
              type="button"
              onMouseEnter={() => {
                setHoveredL1(null);
                setHoveredL2(null);
              }}
              onClick={() => onToggleFullBrand?.()}
              className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] font-medium transition ${
                brandFullActive ? 'bg-[#F4F3FF] text-[#5B45F2]' : 'text-[#1F212C] hover:bg-[#F5F5FA]'
              }`}
            >
              <SwatchBook className="h-3.5 w-3.5 shrink-0 opacity-75" strokeWidth={1.75} />
              <span className="flex-1 truncate">My Brand</span>
              {brandFullActive && <Check className="h-3.5 w-3.5 shrink-0 text-[#5B45F2]" />}
            </button>
          )}

          {filteredSections.map((sec) => {
            const hasChildren = (sec.children || []).length > 0;
            const isHovered = hoveredL1?.kind === 'section' && hoveredL1.item.id === sec.id;
            const isSelected = selectedRefIds.has(sec.id);
            return (
              <button
                key={sec.id}
                type="button"
                onMouseEnter={() => {
                  setHoveredL1(hasChildren ? { kind: 'section', item: sec } : null);
                  setHoveredL2(null);
                }}
                onClick={() => onSelectRef?.(sec)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] transition ${
                  isSelected
                    ? 'bg-[#F4F3FF] font-semibold text-[#5B45F2]'
                    : isHovered
                      ? 'bg-[#F5F5FA] font-medium text-[#171821]'
                      : 'text-[#282A35] hover:bg-[#F5F5FA]'
                }`}
              >
                <SectionIcon sectionKey={sec.key} className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="flex-1 truncate">{sec.label}</span>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#5B45F2]" />}
                {hasChildren && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
              </button>
            );
          })}

          {/* Products group */}
          {filteredProducts.length > 0 && (
            <>
              <div className="px-2.5 pb-1 pt-3 text-[11px] font-medium text-[#8C8FA1]">Products</div>
              {filteredProducts.map((prod) => {
                const hasChildren = (prod.children || []).length > 0;
                const isHovered = hoveredL1?.kind === 'product' && hoveredL1.item.id === prod.id;
                const isSelected = selectedRefIds.has(prod.id);
                return (
                  <button
                    key={prod.id}
                    type="button"
                    onMouseEnter={() => {
                      setHoveredL1(hasChildren ? { kind: 'product', item: prod } : null);
                      setHoveredL2(null);
                    }}
                    onClick={() => onSelectRef?.(prod)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] transition ${
                      isSelected
                        ? 'bg-[#F4F3FF] font-semibold text-[#5B45F2]'
                        : isHovered
                          ? 'bg-[#F5F5FA] font-medium text-[#171821]'
                          : 'text-[#282A35] hover:bg-[#F5F5FA]'
                    }`}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#E7E7F1] bg-[#F6F6FB] text-[10px] font-semibold text-[#5B45F2]">
                      {prod.imageUrl ? (
                        <img src={prod.imageUrl} alt={prod.label} className="h-full w-full object-cover" />
                      ) : (
                        prod.label.charAt(0).toUpperCase()
                      )}
                    </span>
                    <span className="flex-1 truncate">{prod.label}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#5B45F2]" />}
                    {hasChildren && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
                  </button>
                );
              })}
            </>
          )}

          {/* Direct sub-item matches when filtering with @query */}
          {q && directSubMatches.length > 0 && (
            <>
              <div className="px-2.5 pb-1 pt-3 text-[11px] font-medium text-[#8C8FA1]">Matching sections</div>
              {directSubMatches.map((hit) => {
                const isSelected = selectedRefIds.has(hit.id);
                return (
                  <button
                    key={hit.id}
                    type="button"
                    onClick={() => onSelectRef?.(hit)}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12.5px] transition ${
                      isSelected ? 'bg-[#F4F3FF] font-semibold text-[#5B45F2]' : 'text-[#282A35] hover:bg-[#F5F5FA]'
                    }`}
                  >
                    <ShoppingBag className="h-3 w-3 shrink-0 opacity-60" />
                    <span className="flex-1 truncate">{hit.path || hit.label}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#5B45F2]" />}
                  </button>
                );
              })}
            </>
          )}

          {!tree?.configured && products.length === 0 && (
            <div className="px-3 py-3 text-xs text-zinc-400">
              My Brand belum diisi. Isi dulu di halaman My Brand untuk pakai partial context.
            </div>
          )}
        </div>

        {/* Bottom footer matching screenshot: "+ Connect an ad account" */}
        <div className="border-t border-[#EFEFF5] bg-white p-1.5">
          <button
            type="button"
            onClick={() => onConnectAccount?.()}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-[#525568] transition hover:bg-[#F5F5FA] hover:text-[#171821]"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span>Connect an ad account</span>
          </button>
        </div>
      </div>

      {/* LEVEL 2: Sub-sections of hovered Brand section OR hovered Product */}
      {hoveredL1 && l2Items.length > 0 && (
        <div className="max-h-[340px] w-[228px] overflow-y-auto rounded-[18px] border border-[#E6E6F0] bg-white p-1.5 shadow-[0_14px_38px_-10px_rgba(24,24,48,0.16)]">
          {l2Items.map((child) => {
            const hasGrandchildren = (child.children || []).length > 0;
            const isSelected = selectedRefIds.has(child.id);
            const isHovered = hoveredL2?.id === child.id;
            return (
              <button
                key={child.id}
                type="button"
                onMouseEnter={() => setHoveredL2(hasGrandchildren ? child : null)}
                onClick={() => onSelectRef?.(child)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] transition ${
                  isSelected
                    ? 'bg-[#F4F3FF] font-semibold text-[#5B45F2]'
                    : isHovered
                      ? 'bg-[#F5F5FA] font-medium text-[#171821]'
                      : 'text-[#282A35] hover:bg-[#F5F5FA]'
                }`}
              >
                {hoveredL1.kind === 'product' ? (
                  <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-[#8C8FA1]" strokeWidth={1.7} />
                ) : (
                  <SectionIcon sectionKey={hoveredL1.item.key} className="h-3.5 w-3.5 shrink-0 text-[#8C8FA1]" />
                )}
                <span className="flex-1 truncate">{child.label}</span>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#5B45F2]" />}
                {hasGrandchildren && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
              </button>
            );
          })}
        </div>
      )}

      {/* LEVEL 3: Dynamic sub-headings of a Competitor subpage (e.g. Optimum Nutrition -> Positioning, Strengths, Weaknesses, Ad angles) */}
      {hoveredL2 && l3Items.length > 0 && (
        <div className="max-h-[300px] w-[216px] overflow-y-auto rounded-[18px] border border-[#E6E6F0] bg-white p-1.5 shadow-[0_14px_38px_-10px_rgba(24,24,48,0.16)]">
          <div className="px-2.5 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-wider text-[#8C8FA1]">
            {hoveredL2.label}
          </div>
          {l3Items.map((gc) => {
            const isSelected = selectedRefIds.has(gc.id);
            return (
              <button
                key={gc.id}
                type="button"
                onClick={() => onSelectRef?.(gc)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition ${
                  isSelected
                    ? 'bg-[#F4F3FF] font-semibold text-[#5B45F2]'
                    : 'text-[#282A35] hover:bg-[#F5F5FA]'
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5 shrink-0 text-[#8C8FA1]" strokeWidth={1.7} />
                <span className="flex-1 truncate">{gc.label}</span>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#5B45F2]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
