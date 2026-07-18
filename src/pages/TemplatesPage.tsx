import { useState, useEffect } from 'react';
import {
    listCoverLetterTemplates, createCoverLetterTemplate,
    updateCoverLetterTemplate, deleteCoverLetterTemplate,
    CoverLetterTemplate,
} from '../lib/tauri';
import { LayoutTemplate, Plus, Trash2, Save, AlertCircle, Check, FileText } from 'lucide-react';

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
        <div className="flex flex-col h-full gap-6">
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 flex items-center gap-3">
                <LayoutTemplate className="text-blue-500" /> Cover Letter Templates
            </h1>

            <div className="flex flex-col lg:flex-row gap-6 h-full min-h-0">

                {/* Template list */}
                <div className="flex flex-col w-full lg:w-1/3 min-w-[280px] min-h-0 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div className="p-3 px-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20 flex items-center gap-2 shrink-0">
                        <FileText size={16} className="text-slate-500" />
                        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Templates</h2>
                        <button
                            onClick={startNew}
                            className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                            <Plus size={13} /> New
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto flex flex-col">
                        {templates.length === 0 ? (
                            <p className="text-xs text-slate-400 italic p-4 text-center">No templates yet. Create one to guide the letter's structure.</p>
                        ) : (
                            templates.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => selectTemplate(t)}
                                    className={`shrink-0 text-left px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 group transition-colors ${
                                        selectedId === t.id
                                        ? 'bg-blue-50 dark:bg-blue-900/20'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate">{t.name}</span>
                                        <span className="flex items-center gap-1 shrink-0">
                                            {t.is_builtin && (
                                                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
                                                    Built-in
                                                </span>
                                            )}
                                            <span
                                                role="button"
                                                onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                                                className={`p-1 transition-all ${
                                                    confirmDeleteId === t.id
                                                    ? 'text-red-500'
                                                    : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500'
                                                }`}
                                                title={confirmDeleteId === t.id ? 'Click again to confirm' : 'Delete'}
                                            >
                                                <Trash2 size={13} />
                                            </span>
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                                        {t.content}
                                    </p>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Editor */}
                <div className="flex flex-col gap-4 w-full lg:w-2/3 min-h-0">
                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl flex gap-3 border border-red-200 dark:border-red-800">
                            <AlertCircle className="shrink-0" />
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    )}

                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col flex-1 min-h-0 p-5 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Template Name</label>
                            <input
                                type="text"
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="e.g. Startup — short and direct"
                                value={name}
                                onChange={e => setName(e.target.value)}
                            />
                        </div>

                        <div className="flex flex-col flex-1 min-h-0">
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Template Content</label>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                Describe the letter's structure section by section: paragraph order, what each covers, length, and tone.
                                Use [bracketed placeholders] for things the letter should fill in. The generator follows this structure
                                but never invents experience to satisfy it.
                            </p>
                            <textarea
                                className="w-full flex-1 min-h-[260px] p-3 text-sm font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
                                placeholder={"Structure: ...\n\nDear [Hiring Manager],\n\nParagraph 1: ...\n\nSincerely,\n[Name]\n\nTone: ... Length: ..."}
                                value={content}
                                onChange={e => setContent(e.target.value)}
                            />
                        </div>

                        <button
                            onClick={handleSave}
                            className="self-end flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md"
                        >
                            {saved
                                ? <><Check size={16} /> Saved</>
                                : <><Save size={16} /> {selectedId === null ? 'Create Template' : 'Save Changes'}</>}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
