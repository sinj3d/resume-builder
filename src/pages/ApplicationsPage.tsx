import { useState, useEffect, useMemo } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
    listApplications, createApplication, updateApplication, deleteApplication,
    Application, ApplicationStatus, APPLICATION_STATUSES,
    listCoverLetters, CoverLetter,
    listArchetypes, Archetype,
} from '../lib/tauri';
import {
    ClipboardList, Plus, Trash2, Edit2, ArrowLeft, Check, X, ExternalLink,
    FileText, Building2, CheckCircle2,
} from 'lucide-react';

const STATUS_STYLES: Record<ApplicationStatus, string> = {
    wishlist: 'bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-300',
    applied: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
    interviewing: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    offer: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
    wishlist: 'Wishlist',
    applied: 'Applied',
    interviewing: 'Interviewing',
    offer: 'Offer',
    rejected: 'Rejected',
};

const EMPTY_FORM = {
    company: '',
    role_title: '',
    url: '',
    status: 'applied' as ApplicationStatus,
    applied_at: new Date().toISOString().slice(0, 10),
    notes: '',
    archetype_id: 0,
};

export default function ApplicationsPage() {
    const [applications, setApplications] = useState<Application[]>([]);
    const [archetypes, setArchetypes] = useState<Archetype[]>([]);
    const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');
    const [view, setView] = useState<'list' | 'form'>('list');
    const [editingApp, setEditingApp] = useState<Application | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [error, setError] = useState<string | null>(null);
    const [notification, setNotification] = useState<string | null>(null);

    // "View letter" modal
    const [viewingApp, setViewingApp] = useState<Application | null>(null);
    const [letters, setLetters] = useState<CoverLetter[] | null>(null);

    useEffect(() => {
        loadApplications();
        listArchetypes().then(setArchetypes).catch(console.error);
    }, []);

    useEffect(() => {
        if (notification) {
            const t = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(t);
        }
    }, [notification]);

    useEffect(() => {
        if (error) {
            const t = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(t);
        }
    }, [error]);

    const loadApplications = () => listApplications().then(setApplications).catch(console.error);

    const filtered = useMemo(
        () => statusFilter === 'all' ? applications : applications.filter(a => a.status === statusFilter),
        [applications, statusFilter],
    );

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setEditingApp(null);
    };

    const startCreate = () => {
        resetForm();
        setView('form');
    };

    const startEdit = (app: Application) => {
        setEditingApp(app);
        setForm({
            company: app.company,
            role_title: app.role_title,
            url: app.url || '',
            status: app.status,
            applied_at: app.applied_at || '',
            notes: app.notes || '',
            archetype_id: app.archetype_id || 0,
        });
        setView('form');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingApp) {
                await updateApplication({
                    id: editingApp.id,
                    company: form.company,
                    role_title: form.role_title,
                    url: form.url || null,
                    status: form.status,
                    applied_at: form.applied_at || null,
                    notes: form.notes || null,
                });
                setNotification('Application updated!');
            } else {
                await createApplication({
                    company: form.company,
                    role_title: form.role_title,
                    url: form.url || null,
                    status: form.status,
                    applied_at: form.applied_at || null,
                    notes: form.notes || null,
                    archetype_id: form.archetype_id || null,
                });
                setNotification('Application tracked!');
            }
            resetForm();
            setView('list');
            loadApplications();
        } catch (err) {
            setError(String(err));
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await deleteApplication(id);
            loadApplications();
        } catch (err) {
            setError(String(err));
        }
    };

    const handleStatusChange = async (app: Application, status: ApplicationStatus) => {
        try {
            await updateApplication({ id: app.id, status });
            loadApplications();
        } catch (err) {
            setError(String(err));
        }
    };

    const openViewLetter = (app: Application) => {
        setViewingApp(app);
        if (letters === null) {
            listCoverLetters().then(setLetters).catch(() => setLetters([]));
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
        return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
    };

    const viewingLetter = viewingApp?.cover_letter_id != null && letters
        ? letters.find(l => l.id === viewingApp.cover_letter_id) || null
        : undefined;

    return (
        <div className="flex flex-col h-full gap-6 relative">
            <div className="flex items-center justify-between shrink-0">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 flex items-center gap-3">
                    <ClipboardList className="text-blue-500" /> Applications
                </h1>

                {view === 'list' ? (
                    <button
                        onClick={startCreate}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors shadow-sm"
                    >
                        <Plus size={18} /> Add Application
                    </button>
                ) : (
                    <button
                        onClick={() => { resetForm(); setView('list'); }}
                        className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg font-semibold transition-colors border border-slate-200 dark:border-slate-700 shadow-sm"
                    >
                        <ArrowLeft size={18} /> Back to List
                    </button>
                )}
            </div>

            {notification && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-4 py-2 rounded-full border border-emerald-200 dark:border-emerald-800 shadow-lg flex items-center gap-2 animate-in slide-in-from-top-4 fade-in duration-300">
                    <CheckCircle2 size={16} />
                    <span className="text-sm font-semibold">{notification}</span>
                </div>
            )}
            {error && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-4 py-2 rounded-full border border-red-200 dark:border-red-800 shadow-lg flex items-center gap-2 animate-in slide-in-from-top-4 fade-in duration-300">
                    <span className="text-sm font-semibold">Error: {error}</span>
                </div>
            )}

            {view === 'form' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm max-w-2xl animate-in fade-in zoom-in-95 duration-200">
                    <h2 className="text-xl font-bold mb-6 text-slate-800 dark:text-slate-200">
                        {editingApp ? 'Edit Application' : 'Track New Application'}
                    </h2>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-left">Company</label>
                                <input className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="e.g. Acme Corp"
                                    value={form.company}
                                    onChange={e => setForm({ ...form, company: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-left">Role Title</label>
                                <input className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="e.g. Software Engineer II"
                                    value={form.role_title}
                                    onChange={e => setForm({ ...form, role_title: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-left">Job Posting URL</label>
                                <input className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="https://..."
                                    value={form.url}
                                    onChange={e => setForm({ ...form, url: e.target.value })}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-left">Status</label>
                                <select
                                    className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    value={form.status}
                                    onChange={e => setForm({ ...form, status: e.target.value as ApplicationStatus })}
                                >
                                    {APPLICATION_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-left">Date Applied</label>
                                <input
                                    type="date"
                                    className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    value={form.applied_at}
                                    onChange={e => setForm({ ...form, applied_at: e.target.value })}
                                />
                            </div>
                            {!editingApp && (
                                <div className="flex flex-col gap-1.5 md:col-span-2">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-left">Archetype (optional)</label>
                                    <select
                                        className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        value={form.archetype_id}
                                        onChange={e => setForm({ ...form, archetype_id: Number(e.target.value) })}
                                    >
                                        <option value={0}>None</option>
                                        {archetypes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-left">Notes</label>
                                <textarea
                                    className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-y min-h-[80px]"
                                    placeholder="Recruiter contact, interview notes, follow-up dates..."
                                    value={form.notes}
                                    onChange={e => setForm({ ...form, notes: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                            <button type="submit" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors shadow-md">
                                {editingApp ? <Check size={18} /> : <Plus size={18} />}
                                {editingApp ? 'Update Application' : 'Save Application'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {view === 'list' && (
                <>
                    <div className="flex flex-wrap gap-2 shrink-0">
                        <button
                            onClick={() => setStatusFilter('all')}
                            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                                statusFilter === 'all'
                                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                            }`}
                        >
                            All ({applications.length})
                        </button>
                        {APPLICATION_STATUSES.map(s => {
                            const count = applications.filter(a => a.status === s).length;
                            return (
                                <button
                                    key={s}
                                    onClick={() => setStatusFilter(s)}
                                    className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                                        statusFilter === s ? STATUS_STYLES[s] + ' ring-2 ring-offset-1 ring-current' : STATUS_STYLES[s] + ' opacity-60 hover:opacity-100'
                                    }`}
                                >
                                    {STATUS_LABELS[s]} ({count})
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-2 pb-6">
                        {filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500 bg-white/50 dark:bg-slate-800/20 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl h-64">
                                <ClipboardList size={48} className="opacity-20 mb-4" />
                                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No applications yet</h3>
                                <p className="max-w-xs mt-1">Track a job application manually, or hit "Track application" after generating a cover letter.</p>
                            </div>
                        ) : (
                            filtered.map(app => (
                                <div key={app.id} className="shrink-0 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 flex items-center gap-4 transition-all hover:shadow-md animate-in fade-in duration-300 slide-in-from-bottom-2">
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0 text-slate-400">
                                        <Building2 size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate">{app.role_title}</h3>
                                            {app.url && (
                                                <button
                                                    onClick={() => openUrl(app.url!).catch(console.error)}
                                                    className="text-slate-400 hover:text-blue-600 transition-colors shrink-0"
                                                    title="Open job posting"
                                                >
                                                    <ExternalLink size={14} />
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{app.company} · Applied {formatDate(app.applied_at)}</p>
                                    </div>

                                    <select
                                        value={app.status}
                                        onChange={e => handleStatusChange(app, e.target.value as ApplicationStatus)}
                                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border-0 outline-none cursor-pointer shrink-0 ${STATUS_STYLES[app.status]}`}
                                    >
                                        {APPLICATION_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                                    </select>

                                    {app.cover_letter_id != null && (
                                        <button
                                            onClick={() => openViewLetter(app)}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors shrink-0"
                                            title="View cover letter"
                                        >
                                            <FileText size={18} />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => startEdit(app)}
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors shrink-0"
                                        title="Edit"
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(app.id)}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
                                        title="Delete"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}

            {/* View letter modal */}
            {viewingApp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setViewingApp(null)}>
                    <div
                        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-lg w-full mx-4 max-h-[80vh] flex flex-col animate-in zoom-in-95 fade-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <FileText size={18} className="text-blue-500" /> Cover Letter — {viewingApp.company}
                            </h3>
                            <button onClick={() => setViewingApp(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            {letters === null ? (
                                <p className="text-sm text-slate-500 italic">Loading...</p>
                            ) : viewingLetter === null ? (
                                <p className="text-sm text-slate-500 italic">This letter no longer exists — it may have been deleted from History.</p>
                            ) : (
                                <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                                    {viewingLetter!.content}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
