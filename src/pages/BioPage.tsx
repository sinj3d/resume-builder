import { useState, useEffect } from 'react';
import { getBio, updateBio, Bio, Skill, createSkill, listSkills, deleteSkill } from '../lib/tauri';
import { UserCircle, Save, CheckCircle2, Trash2, Plus } from 'lucide-react';

export default function BioPage() {
    const [bioForm, setBioForm] = useState<Bio>({
        name: '',
        email: '',
        phone: '',
        location: '',
        linkedin: '',
        github: '',
        website: ''
    });
    const [notification, setNotification] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Skills state
    const [skills, setSkills] = useState<Skill[]>([]);
    const [newSkillCategory, setNewSkillCategory] = useState('');
    const [newSkillName, setNewSkillName] = useState('');

    useEffect(() => {
        loadBio();
        loadSkills();
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

    const loadBio = async () => {
        try {
            const data = await getBio();
            setBioForm({
                name: data.name || '',
                email: data.email || '',
                phone: data.phone || '',
                location: data.location || '',
                linkedin: data.linkedin || '',
                github: data.github || '',
                website: data.website || ''
            });
        } catch (err: any) {
            console.error('Failed to load bio', err);
        }
    };

    const loadSkills = async () => {
        try {
            const data = await listSkills();
            setSkills(data);
        } catch (err: any) {
            console.error('Failed to load skills', err);
        }
    };

    const handleAddSkill = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSkillCategory.trim() || !newSkillName.trim()) return;
        try {
            await createSkill(newSkillCategory.trim(), newSkillName.trim());
            setNewSkillName('');
            await loadSkills();
        } catch (err: any) {
            setError(typeof err === 'string' ? err : err.message || JSON.stringify(err));
        }
    };

    const handleDeleteSkill = async (id: number) => {
        try {
            await deleteSkill(id);
            await loadSkills();
        } catch (err: any) {
            setError(typeof err === 'string' ? err : err.message || JSON.stringify(err));
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await updateBio({
                name: bioForm.name || undefined,
                email: bioForm.email || undefined,
                phone: bioForm.phone || undefined,
                location: bioForm.location || undefined,
                linkedin: bioForm.linkedin || undefined,
                github: bioForm.github || undefined,
                website: bioForm.website || undefined,
            });
            setNotification('Biographical information saved successfully!');
            setError(null);
        } catch (err: any) {
            console.error('Failed to save bio', err);
            setError(typeof err === 'string' ? err : err.message || JSON.stringify(err));
        }
    };

    const handleChange = (field: keyof Bio) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setBioForm(prev => ({ ...prev, [field]: e.target.value }));
    };

    return (
        <div className="flex flex-col h-full gap-6 relative">
            <div className="flex items-center justify-between shrink-0">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 flex items-center gap-3">
                    <UserCircle className="text-blue-500" /> Profiler
                </h1>
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

            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm max-w-3xl flex-1 overflow-y-auto w-full mx-auto md:mx-0">
                <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
                    Enter your personal and contact details. These will be injected as the header section of your generated resumes and cover letters.
                </p>

                <form onSubmit={handleSave} className="flex flex-col gap-8">
                    {/* Personal Details Section */}
                    <div className="flex flex-col gap-4">
                        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2">
                            Personal Details
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Full Name</label>
                                <input
                                    className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="e.g. John Doe"
                                    value={bioForm.name}
                                    onChange={handleChange('name')}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Location</label>
                                <input
                                    className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="e.g. San Francisco, CA"
                                    value={bioForm.location}
                                    onChange={handleChange('location')}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Contact Information Section */}
                    <div className="flex flex-col gap-4">
                        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2">
                            Contact Information
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Email Address</label>
                                <input
                                    type="email"
                                    className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="e.g. john.doe@example.com"
                                    value={bioForm.email}
                                    onChange={handleChange('email')}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Phone Number</label>
                                <input
                                    type="tel"
                                    className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="e.g. (555) 123-4567"
                                    value={bioForm.phone}
                                    onChange={handleChange('phone')}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Social Links Section */}
                    <div className="flex flex-col gap-4">
                        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2">
                            Social Links
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">LinkedIn Username / URL</label>
                                <input
                                    className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="e.g. linkedin.com/in/johndoe"
                                    value={bioForm.linkedin}
                                    onChange={handleChange('linkedin')}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">GitHub Username</label>
                                <input
                                    className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="e.g. github.com/johndoe"
                                    value={bioForm.github}
                                    onChange={handleChange('github')}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Personal Website</label>
                                <input
                                    type="url"
                                    className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="e.g. https://johndoe.com"
                                    value={bioForm.website}
                                    onChange={handleChange('website')}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                        <button type="submit" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-8 rounded-lg transition-colors shadow-md">
                            <Save size={18} /> Save Details
                        </button>
                    </div>
                </form>
            </div>

            {/* Skills Section */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm max-w-3xl flex-1 w-full mx-auto md:mx-0">
                <form onSubmit={handleAddSkill} className="flex flex-col gap-4 mb-8">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2">
                        Professional Skills
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">
                        Add quantifiable skills, grouped by category (e.g. Languages, Frameworks, Tools). These will be injected into your generated resume.
                    </p>
                    <div className="flex gap-4 items-end">
                        <div className="flex flex-col gap-1.5 flex-1">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Category</label>
                            <input
                                className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="e.g. Frontend Frameworks"
                                value={newSkillCategory}
                                onChange={(e) => setNewSkillCategory(e.target.value)}
                                list="existing-categories"
                            />
                            <datalist id="existing-categories">
                                {Array.from(new Set(skills.map(s => s.category))).sort().map(cat => (
                                    <option key={cat} value={cat} />
                                ))}
                            </datalist>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Skill Name</label>
                            <input
                                className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="e.g. React.js"
                                value={newSkillName}
                                onChange={(e) => setNewSkillName(e.target.value)}
                            />
                        </div>
                        <button type="submit" disabled={!newSkillCategory.trim() || !newSkillName.trim()} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:opacity-50 text-white font-semibold py-2 px-6 rounded-lg transition-colors flex items-center gap-2">
                            <Plus size={18} /> Add
                        </button>
                    </div>
                </form>

                {/* List Grouped Skills */}
                <div className="flex flex-col gap-6">
                    {Array.from(new Set(skills.map(s => s.category))).sort().map(category => (
                        <div key={category} className="flex flex-col gap-3">
                            <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-md">{category}</h3>
                            <div className="flex flex-wrap gap-2">
                                {skills.filter(s => s.category === category).map(skill => (
                                    <div key={skill.id} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700/50 px-3 py-1.5 rounded-full text-sm">
                                        <span>{skill.name}</span>
                                        <button
                                            onClick={() => handleDeleteSkill(skill.id)}
                                            className="text-slate-400 hover:text-red-500 transition-colors"
                                            title="Delete skill"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    {skills.length === 0 && (
                        <div className="text-center text-slate-500 dark:text-slate-400 py-4 italic text-sm border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                            No skills added yet. They will appear here.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
