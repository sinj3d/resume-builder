import { useState, useEffect, useMemo } from 'react';
import { 
    listExperiences, createExperience, deleteExperience, Experience, 
    listBullets, createBullet, deleteBullet, updateBullet, BulletPoint 
} from '../lib/tauri';
import { Plus, Trash2, ChevronDown, ChevronUp, Edit2, Check, CheckCircle2, Briefcase, ArrowLeft } from 'lucide-react';

export default function ExperiencesPage() {
    const [experiences, setExperiences] = useState<Experience[]>([]);
    const [expandedExpId, setExpandedExpId] = useState<number | null>(null);
    const [bullets, setBullets] = useState<Record<number, BulletPoint[]>>({});
    
    // View state
    const [view, setView] = useState<'list' | 'create'>('list');
    const [notification, setNotification] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [expForm, setExpForm] = useState({ title: '', org: '', start_date: '', end_date: '', category: '' });
    const [isCurrentJob, setIsCurrentJob] = useState(false);
    const [customCategory, setCustomCategory] = useState('');
    
    // Bullet state
    const [newBulletContent, setNewBulletContent] = useState('');
    const [editingBulletId, setEditingBulletId] = useState<number | null>(null);
    const [editBulletContent, setEditBulletContent] = useState('');

    useEffect(() => {
        loadExperiences();
    }, []);

    // Clear notification after 3 seconds
    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    // Clear error after 5 seconds
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const loadExperiences = async () => {
        try {
            const data = await listExperiences();
            setExperiences(data);
        } catch (error) {
            console.error('Failed to load experiences', error);
        }
    };

    const loadBullets = async (expId: number) => {
        try {
            const data = await listBullets(expId);
            setBullets(prev => ({ ...prev, [expId]: data }));
        } catch (error) {
            console.error(`Failed to load bullets for exp ${expId}`, error);
        }
    };

    const toggleExpand = (expId: number) => {
        if (expandedExpId === expId) {
            setExpandedExpId(null);
        } else {
            setExpandedExpId(expId);
            if (!bullets[expId]) {
                loadBullets(expId);
            }
        }
    };

    const handleCreateExp = async (e: React.FormEvent) => {
        e.preventDefault();
        
        let finalCategory = expForm.category;
        if (finalCategory === 'Other') {
            finalCategory = customCategory;
        }

        let finalEndDate = expForm.end_date;
        if (isCurrentJob) {
            finalEndDate = 'Present';
        }

        try {
            await createExperience(expForm.title, expForm.org, expForm.start_date, finalEndDate, finalCategory);
            setExpForm({ title: '', org: '', start_date: '', end_date: '', category: '' });
            setIsCurrentJob(false);
            setCustomCategory('');
            
            await loadExperiences();
            setNotification('Experience successfully added!');
            setError(null);
            setView('list');
        } catch (err: any) {
            console.error('Failed to create experience', err);
            setError(typeof err === 'string' ? err : err.message || JSON.stringify(err));
        }
    };

    const handleCreateBullet = async (expId: number, e: React.FormEvent) => {
        e.preventDefault();
        if (!newBulletContent.trim()) return;
        try {
            await createBullet(expId, newBulletContent);
            setNewBulletContent('');
            loadBullets(expId);
        } catch (error) {
            console.error('Failed to create bullet', error);
        }
    };

    const handleUpdateBullet = async (expId: number, bulletId: number, order: number) => {
        if (!editBulletContent.trim()) return;
        try {
            await updateBullet(bulletId, editBulletContent, order);
            setEditingBulletId(null);
            loadBullets(expId);
        } catch (error) {
            console.error('Failed to update bullet', error);
        }
    };

    // Calculate unique categories for the dropdown
    const availableCategories = useMemo(() => {
        const defaults = ['Professional Experience', 'Education', 'Project', 'Leadership', 'Volunteer'];
        const existing = experiences.map(e => e.category);
        return Array.from(new Set([...defaults, ...existing]));
    }, [experiences]);

    // Format YYYY-MM to something nicer if needed, or leave it as is if it's Present
    const displayDate = (dateStr: string) => {
        if (!dateStr) return '';
        if (dateStr.toLowerCase() === 'present') return 'Present';
        
        // Try parsing YYYY-MM
        const [year, month] = dateStr.split('-');
        if (year && month) {
            const date = new Date(parseInt(year), parseInt(month) - 1);
            return date.toLocaleDateString('default', { month: 'short', year: 'numeric' });
        }
        return dateStr;
    };

    return (
        <div className="flex flex-col h-full gap-6 relative">
            
            {/* Header Area */}
            <div className="flex items-center justify-between shrink-0">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 flex items-center gap-3">
                    <Briefcase className="text-blue-500" /> Experiences
                </h1>

                {view === 'list' ? (
                    <button 
                        onClick={() => setView('create')}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors shadow-sm"
                    >
                        <Plus size={18} /> Add Experience
                    </button>
                ) : (
                    <button 
                        onClick={() => setView('list')}
                        className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg font-semibold transition-colors border border-slate-200 dark:border-slate-700 shadow-sm"
                    >
                        <ArrowLeft size={18} /> Back to List
                    </button>
                )}
            </div>

            {/* Notification Toast */}
            {notification && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-4 py-2 rounded-full border border-emerald-200 dark:border-emerald-800 shadow-lg flex items-center gap-2 animate-in slide-in-from-top-4 fade-in duration-300">
                    <CheckCircle2 size={16} />
                    <span className="text-sm font-semibold">{notification}</span>
                </div>
            )}

            {/* Error Toast */}
            {error && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-4 py-2 rounded-full border border-red-200 dark:border-red-800 shadow-lg flex items-center gap-2 animate-in slide-in-from-top-4 fade-in duration-300">
                    <span className="text-sm font-semibold">Error: {error}</span>
                </div>
            )}

            {view === 'create' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm max-w-3xl animate-in fade-in zoom-in-95 duration-200">
                    <h2 className="text-xl font-bold mb-6 text-slate-800 dark:text-slate-200">New Experience Details</h2>
                    
                    <form onSubmit={handleCreateExp} className="flex flex-col gap-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-left">Role Title</label>
                                <input className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="e.g. Software Engineer" 
                                    value={expForm.title} 
                                    onChange={e => setExpForm({ ...expForm, title: e.target.value })} 
                                    required 
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-left">Organization / Company</label>
                                <input className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="e.g. Acme Corp" 
                                    value={expForm.org} 
                                    onChange={e => setExpForm({ ...expForm, org: e.target.value })} 
                                    required 
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-left">Start Date</label>
                                <input 
                                    type="month"
                                    className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    value={expForm.start_date} 
                                    onChange={e => setExpForm({ ...expForm, start_date: e.target.value })} 
                                    required 
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-left">End Date</label>
                                    <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300">
                                        <input 
                                            type="checkbox" 
                                            checked={isCurrentJob} 
                                            onChange={e => setIsCurrentJob(e.target.checked)} 
                                            className="rounded text-blue-600 focus:ring-blue-500 bg-slate-100 border-slate-300"
                                        />
                                        I currently work here
                                    </label>
                                </div>
                                <input 
                                    type="month"
                                    disabled={isCurrentJob}
                                    className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    value={isCurrentJob ? '' : expForm.end_date} 
                                    onChange={e => setExpForm({ ...expForm, end_date: e.target.value })} 
                                    required={!isCurrentJob} 
                                />
                            </div>

                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-left">Category</label>
                                <div className="flex gap-3">
                                    <select 
                                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        value={expForm.category}
                                        onChange={e => setExpForm({ ...expForm, category: e.target.value })}
                                        required
                                    >
                                        <option value="" disabled>Select a category...</option>
                                        {availableCategories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                        <option value="Other">Other (Type custom...)</option>
                                    </select>

                                    {expForm.category === 'Other' && (
                                        <input className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all animate-in fade-in slide-in-from-left-2"
                                            placeholder="Enter custom category" 
                                            value={customCategory} 
                                            onChange={e => setCustomCategory(e.target.value)} 
                                            required 
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex justify-end mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                            <button type="submit" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors shadow-md">
                                <Plus size={18} /> Save Experience
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Experience List */}
            {view === 'list' && (
                <div className="flex flex-col gap-4 flex-1 overflow-y-auto pr-2 pb-6">
                    {experiences.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500 bg-white/50 dark:bg-slate-800/20 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl h-64">
                            <Briefcase size={48} className="opacity-20 mb-4" />
                            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No experiences yet</h3>
                            <p className="max-w-xs mt-1">Click the "Add Experience" button above to get started, or upload a resume from the Onboarding tab.</p>
                        </div>
                    ) : (
                        experiences.map(exp => (
                            <div key={exp.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-all hover:shadow-md animate-in fade-in duration-300 slide-in-from-bottom-2">
                                {/* Header */}
                                <div 
                                    className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-750"
                                    onClick={() => toggleExpand(exp.id)}
                                >
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{exp.title} <span className="text-slate-500 font-normal">at {exp.org}</span></h3>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-0.5 rounded text-xs font-semibold">{exp.category}</span>
                                            <span className="text-sm text-slate-500 dark:text-slate-400">
                                                {displayDate(exp.start_date)} - {displayDate(exp.end_date)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); deleteExperience(exp.id).then(loadExperiences); }}
                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                            title="Delete Experience"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                        <div className="p-1 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-400">
                                            {expandedExpId === exp.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Content (Bullets) */}
                                {expandedExpId === exp.id && (
                                    <div className="p-5 pt-0 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20">
                                        <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mt-4 mb-3 uppercase tracking-wider flex justify-between items-center">
                                            <span>Bullet Points</span>
                                            <span className="text-xs bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded text-slate-500 font-normal">
                                                {bullets[exp.id]?.length || 0} items
                                            </span>
                                        </h4>
                                        
                                        <ul className="flex flex-col gap-2 mb-4">
                                            {bullets[exp.id]?.map(bullet => (
                                                <li key={bullet.id} className="flex items-start gap-3 group bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                                                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                                    {editingBulletId === bullet.id ? (
                                                        <div className="flex-1 flex gap-2">
                                                            <input 
                                                                autoFocus
                                                                className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-900 border border-blue-400 dark:border-blue-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner"
                                                                value={editBulletContent}
                                                                onChange={(e) => setEditBulletContent(e.target.value)}
                                                                onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateBullet(exp.id, bullet.id, bullet.sort_order); }}
                                                            />
                                                            <button 
                                                                onClick={() => handleUpdateBullet(exp.id, bullet.id, bullet.sort_order)} 
                                                                className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-800 px-3 py-1.5 rounded font-medium transition-colors flex items-center gap-1"
                                                            >
                                                                <Check size={16}/> Save
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex-1 text-slate-700 dark:text-slate-300 text-sm leading-relaxed">
                                                            {bullet.content}
                                                        </div>
                                                    )}
                                                    
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0 bg-slate-50 dark:bg-slate-800/80 rounded-lg p-0.5 border border-slate-100 dark:border-slate-700">
                                                        <button 
                                                            onClick={() => { setEditingBulletId(bullet.id); setEditBulletContent(bullet.content); }} 
                                                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Edit2 size={14}/>
                                                        </button>
                                                        <button 
                                                            onClick={() => deleteBullet(bullet.id).then(() => loadBullets(exp.id))} 
                                                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={14}/>
                                                        </button>
                                                    </div>
                                                </li>
                                            ))}
                                            {(!bullets[exp.id] || bullets[exp.id].length === 0) && (
                                                <div className="text-center p-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                                                    <p className="text-sm text-slate-500 italic">No bullet points yet. Add accomplishments below.</p>
                                                </div>
                                            )}
                                        </ul>

                                        <form onSubmit={(e) => handleCreateBullet(exp.id, e)} className="flex gap-2">
                                            <input 
                                                className="flex-1 px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                placeholder="Describe a measurable achievement or responsibility..." 
                                                value={newBulletContent} 
                                                onChange={e => setNewBulletContent(e.target.value)} 
                                            />
                                            <button type="submit" className="px-5 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-200 dark:hover:bg-white text-white dark:text-slate-900 text-sm font-semibold rounded-lg transition-colors shrink-0 shadow-sm flex items-center gap-2">
                                                <Plus size={16}/> Add Bullet
                                            </button>
                                        </form>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
