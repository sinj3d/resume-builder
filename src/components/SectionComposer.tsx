import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { GripVertical, Layers, Pencil, Check, SplitSquareHorizontal, Tag } from 'lucide-react';
import { SectionDef } from '../lib/tauri';

/// One section per category, in the order the backend returned them.
export function defaultSectionsFromCategories(categories: string[]): SectionDef[] {
    return categories.map(cat => ({
        id: crypto.randomUUID(),
        heading: cat,
        categories: [cat],
    }));
}

/// Align saved sections with the categories that actually exist right now:
/// stale categories are dropped (their section too, once empty) and uncovered
/// categories are appended as their own sections — mirrors the backend
/// reconciliation in inject_template so the composer and the PDF agree.
export function reconcileSections(saved: SectionDef[], categories: string[]): SectionDef[] {
    const existing = new Set(categories);
    const kept: SectionDef[] = saved
        .map(s => ({ ...s, categories: s.categories.filter(c => existing.has(c)) }))
        .filter(s => s.categories.length > 0);

    const covered = new Set(kept.flatMap(s => s.categories));
    const uncovered = categories.filter(c => !covered.has(c));
    return [...kept, ...defaultSectionsFromCategories(uncovered)];
}

interface Props {
    sections: SectionDef[];
    onChange: (next: SectionDef[]) => void;
}

/**
 * Section composer: reorder section cards by dragging, merge by dragging a
 * category chip onto another card (or into the "New section" zone to separate
 * it back out), split a merged card with the split button, rename headings
 * inline.
 */
export default function SectionComposer({ sections, onChange }: Props) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editHeading, setEditHeading] = useState('');

    const commitHeading = (id: string) => {
        if (editHeading.trim()) {
            onChange(sections.map(s => (s.id === id ? { ...s, heading: editHeading.trim() } : s)));
        }
        setEditingId(null);
    };

    const splitSection = (id: string) => {
        const next: SectionDef[] = [];
        for (const s of sections) {
            if (s.id === id && s.categories.length > 1) {
                next.push(...s.categories.map(cat => ({
                    id: crypto.randomUUID(),
                    heading: cat,
                    categories: [cat],
                })));
            } else {
                next.push(s);
            }
        }
        onChange(next);
    };

    const onDragEnd = (result: DropResult) => {
        const { source, destination, type } = result;
        if (!destination) return;

        if (type === 'SECTION') {
            const next = Array.from(sections);
            const [moved] = next.splice(source.index, 1);
            next.splice(destination.index, 0, moved);
            onChange(next);
            return;
        }

        // type === 'CATEGORY': move a chip between cards (merge) or into the
        // "new section" zone (separate).
        const fromId = source.droppableId.replace('cats-', '');
        const from = sections.find(s => s.id === fromId);
        if (!from) return;
        const cat = from.categories[source.index];
        if (cat === undefined) return;

        let next = sections.map(s =>
            s.id === fromId ? { ...s, categories: s.categories.filter((_, i) => i !== source.index) } : s
        );

        if (destination.droppableId === 'new-section') {
            next.push({ id: crypto.randomUUID(), heading: cat, categories: [cat] });
        } else {
            const toId = destination.droppableId.replace('cats-', '');
            if (toId === fromId) {
                // Reorder within the same card.
                next = sections.map(s => {
                    if (s.id !== fromId) return s;
                    const cats = Array.from(s.categories);
                    const [moved] = cats.splice(source.index, 1);
                    cats.splice(destination.index, 0, moved);
                    return { ...s, categories: cats };
                });
                onChange(next);
                return;
            }
            next = next.map(s => {
                if (s.id !== toId) return s;
                const cats = Array.from(s.categories);
                cats.splice(destination.index, 0, cat);
                return { ...s, categories: cats };
            });
        }

        // Drop sections that lost their last category.
        onChange(next.filter(s => s.categories.length > 0));
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
                <Layers size={16} className="text-slate-500" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Sections</span>
                <span className="text-xs text-slate-400 ml-1">
                    — drag cards to reorder · drag a category chip onto another card to merge
                </span>
            </div>

            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="sections" direction="horizontal" type="SECTION">
                    {(provided) => (
                        <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className="flex flex-wrap items-stretch gap-3"
                        >
                            {sections.map((section, index) => (
                                <Draggable key={section.id} draggableId={section.id} index={index}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            className={`flex flex-col gap-2 p-3 rounded-lg border min-w-[160px] transition-colors ${
                                                snapshot.isDragging
                                                    ? 'bg-blue-50 dark:bg-blue-900/40 border-blue-400 shadow-lg'
                                                    : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700'
                                            }`}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <span {...provided.dragHandleProps} className="cursor-grab text-slate-400">
                                                    <GripVertical size={14} />
                                                </span>
                                                <span className="text-xs font-semibold text-slate-400">{index + 1}.</span>
                                                {editingId === section.id ? (
                                                    <span className="flex items-center gap-1">
                                                        <input
                                                            autoFocus
                                                            className="w-32 px-1.5 py-0.5 text-sm bg-white dark:bg-slate-900 border border-blue-400 rounded outline-none"
                                                            value={editHeading}
                                                            onChange={e => setEditHeading(e.target.value)}
                                                            onKeyDown={e => { if (e.key === 'Enter') commitHeading(section.id); }}
                                                            onBlur={() => commitHeading(section.id)}
                                                        />
                                                        <button
                                                            onMouseDown={e => e.preventDefault()}
                                                            onClick={() => commitHeading(section.id)}
                                                            className="text-emerald-600"
                                                        >
                                                            <Check size={14} />
                                                        </button>
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                                            {section.heading}
                                                        </span>
                                                        <button
                                                            onClick={() => { setEditingId(section.id); setEditHeading(section.heading); }}
                                                            className="text-slate-400 hover:text-blue-600"
                                                            title="Rename section"
                                                        >
                                                            <Pencil size={12} />
                                                        </button>
                                                        {section.categories.length > 1 && (
                                                            <button
                                                                onClick={() => splitSection(section.id)}
                                                                className="text-slate-400 hover:text-amber-600"
                                                                title="Split into one section per category"
                                                            >
                                                                <SplitSquareHorizontal size={13} />
                                                            </button>
                                                        )}
                                                    </span>
                                                )}
                                            </div>

                                            <Droppable droppableId={`cats-${section.id}`} direction="horizontal" type="CATEGORY">
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.droppableProps}
                                                        className={`flex flex-wrap gap-1.5 min-h-[28px] p-1 rounded ${
                                                            snapshot.isDraggingOver ? 'bg-blue-100/60 dark:bg-blue-900/30' : ''
                                                        }`}
                                                    >
                                                        {section.categories.map((cat, catIndex) => (
                                                            <Draggable key={`${section.id}::${cat}`} draggableId={`${section.id}::${cat}`} index={catIndex}>
                                                                {(provided, snapshot) => (
                                                                    <span
                                                                        ref={provided.innerRef}
                                                                        {...provided.draggableProps}
                                                                        {...provided.dragHandleProps}
                                                                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border select-none ${
                                                                            snapshot.isDragging
                                                                                ? 'bg-blue-200 dark:bg-blue-800 border-blue-400 shadow'
                                                                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                                                                        }`}
                                                                    >
                                                                        <Tag size={10} className="opacity-50" />
                                                                        {cat}
                                                                    </span>
                                                                )}
                                                            </Draggable>
                                                        ))}
                                                        {provided.placeholder}
                                                    </div>
                                                )}
                                            </Droppable>
                                        </div>
                                    )}
                                </Draggable>
                            ))}
                            {provided.placeholder}

                            <Droppable droppableId="new-section" direction="horizontal" type="CATEGORY">
                                {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className={`flex items-center justify-center px-4 rounded-lg border-2 border-dashed text-xs font-medium min-w-[120px] min-h-[64px] ${
                                            snapshot.isDraggingOver
                                                ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600'
                                                : 'border-slate-300 dark:border-slate-700 text-slate-400'
                                        }`}
                                    >
                                        <span>Drop a category here to separate it</span>
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        </div>
    );
}
