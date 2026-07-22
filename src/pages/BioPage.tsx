import { useState, useEffect } from 'react';
import { getBio, updateBio, Bio, Skill, createSkill, listSkills, deleteSkill } from '../lib/tauri';
import { Trash2, Plus } from 'lucide-react';
import { PageHeader, Button, Card, Toast } from '../components/ui';

const inputCls = "w-full px-3 py-2 bg-paper dark:bg-charcoal-inset border border-paper-border dark:border-charcoal-border rounded text-sm text-ink dark:text-cream placeholder:text-ink-faint dark:placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sienna/30 focus:border-sienna transition-all";
const labelCls = "text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-muted dark:text-cream-muted";
const sectionTitleCls = "font-serif text-lg font-semibold text-ink dark:text-cream border-b border-paper-inset-border dark:border-charcoal-inset-border pb-2";

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
        <div className="relative flex h-full flex-col gap-6">
            <PageHeader title="Profile" subtitle="These details become the header of every resume and letter." />

            <Toast message={notification} variant="success" />
            <Toast message={error} variant="error" />

            {/* Two columns across the full width so everything (including Save)
                is visible without scrolling. */}
            <div className="grid flex-1 min-h-0 grid-cols-1 items-stretch gap-6 xl:grid-cols-2">
                <Card className="flex w-full flex-col overflow-y-auto p-6 pt-4">
                    <p className="mb-4 text-sm text-ink-muted dark:text-cream-muted">
                        Enter your personal and contact details. These will be injected as the header section of your generated resumes and cover letters.
                    </p>

                    <form onSubmit={handleSave} className="flex flex-1 flex-col gap-5">
                        {/* Personal Details Section */}
                        <div className="flex flex-col gap-4">
                            <h2 className={sectionTitleCls}>Personal Details</h2>
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                <div className="flex flex-col gap-1.5">
                                    <label className={labelCls}>Full name</label>
                                    <input
                                        className={inputCls}
                                        placeholder="e.g. John Doe"
                                        value={bioForm.name}
                                        onChange={handleChange('name')}
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className={labelCls}>Location</label>
                                    <input
                                        className={inputCls}
                                        placeholder="e.g. San Francisco, CA"
                                        value={bioForm.location}
                                        onChange={handleChange('location')}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Contact Information Section */}
                        <div className="flex flex-col gap-4">
                            <h2 className={sectionTitleCls}>Contact Information</h2>
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                <div className="flex flex-col gap-1.5">
                                    <label className={labelCls}>Email address</label>
                                    <input
                                        type="email"
                                        className={inputCls}
                                        placeholder="e.g. john.doe@example.com"
                                        value={bioForm.email}
                                        onChange={handleChange('email')}
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className={labelCls}>Phone number</label>
                                    <input
                                        type="tel"
                                        className={inputCls}
                                        placeholder="e.g. (555) 123-4567"
                                        value={bioForm.phone}
                                        onChange={handleChange('phone')}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Social Links Section */}
                        <div className="flex flex-col gap-4">
                            <h2 className={sectionTitleCls}>Social Links</h2>
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                <div className="flex flex-col gap-1.5">
                                    <label className={labelCls}>LinkedIn username / URL</label>
                                    <input
                                        className={inputCls}
                                        placeholder="e.g. linkedin.com/in/johndoe"
                                        value={bioForm.linkedin}
                                        onChange={handleChange('linkedin')}
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className={labelCls}>GitHub username</label>
                                    <input
                                        className={inputCls}
                                        placeholder="e.g. github.com/johndoe"
                                        value={bioForm.github}
                                        onChange={handleChange('github')}
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5 md:col-span-2">
                                    <label className={labelCls}>Personal website</label>
                                    <input
                                        type="url"
                                        className={inputCls}
                                        placeholder="e.g. https://johndoe.com"
                                        value={bioForm.website}
                                        onChange={handleChange('website')}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="sticky bottom-0 mt-auto flex justify-end border-t border-paper-inset-border bg-paper-card pt-4 dark:border-charcoal-inset-border dark:bg-charcoal-card">
                            <Button type="submit" variant="accent">Save details</Button>
                        </div>
                    </form>
                </Card>

                {/* Skills Section */}
                <Card className="w-full overflow-y-auto p-6 pt-4">
                    <form onSubmit={handleAddSkill} className="mb-8 flex flex-col gap-4">
                        <h2 className={sectionTitleCls}>Professional Skills</h2>
                        <p className="text-sm text-ink-muted dark:text-cream-muted">
                            Add quantifiable skills, grouped by category (e.g. Languages, Frameworks, Tools). These will be injected into your generated resume.
                        </p>
                        <div className="flex items-end gap-4">
                            <div className="flex flex-1 flex-col gap-1.5">
                                <label className={labelCls}>Category</label>
                                <input
                                    className={inputCls}
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
                            <div className="flex flex-1 flex-col gap-1.5">
                                <label className={labelCls}>Skill name</label>
                                <input
                                    className={inputCls}
                                    placeholder="e.g. React.js"
                                    value={newSkillName}
                                    onChange={(e) => setNewSkillName(e.target.value)}
                                />
                            </div>
                            <Button type="submit" variant="outline" strong disabled={!newSkillCategory.trim() || !newSkillName.trim()}>
                                <Plus size={16} /> Add
                            </Button>
                        </div>
                    </form>

                    {/* List Grouped Skills */}
                    <div className="flex flex-col gap-6">
                        {Array.from(new Set(skills.map(s => s.category))).sort().map(category => (
                            <div key={category} className="flex flex-col gap-3">
                                <h3 className="text-sm font-semibold text-ink dark:text-cream">{category}</h3>
                                <div className="flex flex-wrap gap-2">
                                    {skills.filter(s => s.category === category).map(skill => (
                                        <div key={skill.id} className="flex items-center gap-2 rounded-full border border-paper-border bg-paper-inset px-3 py-1.5 text-sm text-ink dark:border-charcoal-border dark:bg-charcoal-inset dark:text-cream">
                                            <span>{skill.name}</span>
                                            <button
                                                onClick={() => handleDeleteSkill(skill.id)}
                                                className="text-ink-faint transition-colors hover:text-sienna dark:text-cream-faint dark:hover:text-sienna-dark"
                                                title="Delete skill"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {skills.length === 0 && (
                            <div className="rounded border-2 border-dashed border-paper-border py-4 text-center text-sm italic text-ink-muted dark:border-charcoal-border dark:text-cream-muted">
                                No skills added yet. They will appear here.
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}
