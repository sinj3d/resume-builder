import { useState } from 'react';
import { updateBio, Bio } from '../lib/tauri';
import { Button, Card } from '../components/ui';

interface Step3ProfileProps {
    onDone: () => void;
}

const FIELDS: { key: keyof Bio; label: string; placeholder: string }[] = [
    { key: 'name', label: 'Full name', placeholder: 'e.g. Maya Okonkwo' },
    { key: 'location', label: 'Location', placeholder: 'e.g. Seattle, WA' },
    { key: 'email', label: 'Email', placeholder: 'e.g. maya@example.com' },
    { key: 'phone', label: 'Phone', placeholder: 'e.g. (555) 010-2244' },
    { key: 'linkedin', label: 'LinkedIn', placeholder: 'e.g. in/mayaokonkwo' },
    { key: 'github', label: 'GitHub', placeholder: 'e.g. github.com/mokonkwo' },
];

const inputCls = "w-full px-3 py-2.5 bg-paper dark:bg-charcoal-inset border border-paper-border dark:border-charcoal-border rounded text-sm text-ink dark:text-cream placeholder:text-ink-faint dark:placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sienna/30 focus:border-sienna transition-all";
const labelCls = "text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-muted dark:text-cream-muted";

export default function Step3Profile({ onDone }: Step3ProfileProps) {
    const [form, setForm] = useState<Partial<Bio>>({});
    const [saving, setSaving] = useState(false);

    const handleFinish = async () => {
        setSaving(true);
        try {
            await updateBio({
                name: form.name || undefined,
                location: form.location || undefined,
                email: form.email || undefined,
                phone: form.phone || undefined,
                linkedin: form.linkedin || undefined,
                github: form.github || undefined,
            });
        } catch (err) {
            console.error('Failed to save profile', err);
        } finally {
            setSaving(false);
            onDone();
        }
    };

    return (
        <div className="flex w-full max-w-2xl flex-col items-center gap-9">
            <div className="text-center">
                <h1 className="font-serif text-[36px] font-semibold tracking-[-0.015em] text-ink dark:text-cream">
                    And who is this record about?
                </h1>
                <p className="mt-2 font-serif text-base italic text-ink-muted dark:text-cream-muted">
                    These details become the header of every resume and letter. All optional — add them later in Profile.
                </p>
            </div>

            <Card className="w-full p-9 shadow-sm">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    {FIELDS.map(f => (
                        <div key={f.key} className="flex flex-col gap-1.5">
                            <label className={labelCls}>{f.label}</label>
                            <input
                                className={inputCls}
                                placeholder={f.placeholder}
                                value={form[f.key] || ''}
                                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                            />
                        </div>
                    ))}
                </div>

                <div className="mt-7 flex items-center justify-between border-t border-paper-inset-border pt-5 dark:border-charcoal-inset-border">
                    <button
                        onClick={onDone}
                        className="text-sm text-ink-muted hover:text-ink dark:text-cream-muted dark:hover:text-cream"
                    >
                        Skip for now
                    </button>
                    <Button variant="accent" onClick={handleFinish} disabled={saving}>
                        {saving ? 'Saving…' : 'Finish — take me to my record'}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
