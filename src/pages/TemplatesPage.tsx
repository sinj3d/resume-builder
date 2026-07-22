import { useState, useEffect } from 'react';
import {
    listCoverLetterTemplates, createCoverLetterTemplate,
    updateCoverLetterTemplate, deleteCoverLetterTemplate,
    CoverLetterTemplate,
} from '../lib/tauri';
import { Plus, Trash2, Save, AlertCircle, Check } from 'lucide-react';
import { PageHeader, Button, Card } from '../components/ui';

const inputCls = "w-full px-3 py-2 bg-paper dark:bg-charcoal-inset border border-paper-border dark:border-charcoal-border rounded text-sm text-ink dark:text-cream placeholder:text-ink-faint dark:placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sienna/30 focus:border-sienna transition-all";
const labelCls = "text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-muted dark:text-cream-muted";

/**
 * Manage cover letter templates: structural guides the generator is conditioned
 * on. Builtins ship with the app but are just as editable/deletable as
 * user-submitted ones; templates saved here also feed the local fine-tuning
 * dataset (see training/README.md).
 */
export default function TemplatesPage() {
    const [templates, setTemplates] = useState<CoverLetterTemplate[]>([]);
    // null = composing a new template
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [name, setName] = useState('');
    const [content, setContent] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

    useEffect(() => { loadTemplates(); }, []);

    const loadTemplates = () => listCoverLetterTemplates().then(setTemplates).catch(e => setError(String(e)));

    const startNew = () => {
        setSelectedId(null);
        setName('');
        setContent('');
        setError(null);
    };

    const selectTemplate = (t: CoverLetterTemplate) => {
        setSelectedId(t.id);
        setName(t.name);
        setContent(t.content);
        setError(null);
        setConfirmDeleteId(null);
    };

    const handleSave = async () => {
        setError(null);
        try {
            if (selectedId === null) {
                const id = await createCoverLetterTemplate(name, content);
                setSelectedId(id);
            } else {
                await updateCoverLetterTemplate(selectedId, name, content);
            }
            await loadTemplates();
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            setError(String(err));
        }
    };

    const handleDelete = async (id: number) => {
        if (confirmDeleteId !== id) {
            setConfirmDeleteId(id);
            setTimeout(() => setConfirmDeleteId(current => (current === id ? null : current)), 3000);
            return;
        }
        setConfirmDeleteId(null);
        try {
            await deleteCoverLetterTemplate(id);
            if (selectedId === id) startNew();
            await loadTemplates();
        } catch (err) {
            setError(String(err));
        }
    };

    return (
        <div className="flex h-full flex-col gap-6">
            <PageHeader title="Cover Letter Templates" />

            <div className="flex h-full min-h-0 flex-col gap-6 lg:flex-row">

                {/* Template list */}
                <Card className="flex min-h-0 w-full min-w-[280px] flex-col overflow-hidden lg:w-1/3">
                    <div className="flex shrink-0 items-center gap-2 border-b border-paper-inset-border bg-paper-inset px-4 py-3 dark:border-charcoal-inset-border dark:bg-charcoal-inset">
                        <span className={labelCls}>Templates</span>
                        <Button size="sm" className="ml-auto" onClick={startNew}>
                            <Plus size={13} /> New
                        </Button>
                    </div>
                    <div className="flex flex-1 flex-col overflow-y-auto">
                        {templates.length === 0 ? (
                            <p className="p-4 text-center text-xs italic text-ink-muted dark:text-cream-muted">No templates yet. Create one to guide the letter's structure.</p>
                        ) : (
                            templates.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => selectTemplate(t)}
                                    className={`group shrink-0 border-b border-paper-inset-border px-4 py-3 text-left transition-colors dark:border-charcoal-inset-border ${
                                        selectedId === t.id
                                            ? 'bg-paper-inset dark:bg-charcoal-inset'
                                            : 'hover:bg-paper-inset/60 dark:hover:bg-charcoal-inset/60'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate text-sm font-semibold text-ink dark:text-cream">{t.name}</span>
                                        <span className="flex shrink-0 items-center gap-1.5">
                                            {t.is_builtin && (
                                                <span className="rounded-full border border-sienna px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sienna dark:border-sienna-dark dark:text-sienna-dark">
                                                    Built-in
                                                </span>
                                            )}
                                            <span
                                                role="button"
                                                onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                                                className={`p-1 transition-all ${
                                                    confirmDeleteId === t.id
                                                        ? 'text-[#a1453a] dark:text-[#d97567]'
                                                        : 'text-ink-faint opacity-0 hover:text-[#a1453a] group-hover:opacity-100 dark:text-cream-faint dark:hover:text-[#d97567]'
                                                }`}
                                                title={confirmDeleteId === t.id ? 'Click again to confirm' : 'Delete'}
                                            >
                                                <Trash2 size={13} />
                                            </span>
                                        </span>
                                    </div>
                                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted dark:text-cream-muted">
                                        {t.content}
                                    </p>
                                </button>
                            ))
                        )}
                    </div>
                </Card>

                {/* Editor */}
                <div className="flex min-h-0 w-full flex-col gap-4 lg:w-2/3">
                    {error && (
                        <div className="flex gap-3 rounded border border-[#a1453a]/30 bg-[#a1453a]/5 p-4 text-[#a1453a] dark:border-[#d97567]/30 dark:bg-[#d97567]/5 dark:text-[#d97567]">
                            <AlertCircle className="shrink-0" />
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    )}

                    <Card className="flex min-h-0 flex-1 flex-col gap-4 p-5">
                        <div>
                            <label className={labelCls}>Template name</label>
                            <input
                                type="text"
                                className={`mt-1.5 ${inputCls}`}
                                placeholder="e.g. Startup — short and direct"
                                value={name}
                                onChange={e => setName(e.target.value)}
                            />
                        </div>

                        <div className="flex min-h-0 flex-1 flex-col">
                            <label className={labelCls}>Template content</label>
                            <p className="mb-2 mt-1.5 text-xs text-ink-muted dark:text-cream-muted">
                                Describe the letter's structure section by section: paragraph order, what each covers, length, and tone.
                                Use [bracketed placeholders] for things the letter should fill in. The generator follows this structure
                                but never invents experience to satisfy it.
                            </p>
                            <textarea
                                className={`${inputCls} min-h-[260px] flex-1 resize-none font-mono`}
                                placeholder={"Structure: ...\n\nDear [Hiring Manager],\n\nParagraph 1: ...\n\nSincerely,\n[Name]\n\nTone: ... Length: ..."}
                                value={content}
                                onChange={e => setContent(e.target.value)}
                            />
                        </div>

                        <Button onClick={handleSave} variant="accent" className="self-end">
                            {saved
                                ? <><Check size={16} /> Saved</>
                                : <><Save size={16} /> {selectedId === null ? 'Create template' : 'Save changes'}</>}
                        </Button>
                    </Card>
                </div>

            </div>
        </div>
    );
}
