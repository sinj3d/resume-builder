import { useState, useEffect } from 'react';
import { getLlmSettings, updateLlmSettings, LLMSettings } from '../lib/tauri';
import { autoCheckEnabled, setAutoCheck, checkAndPromptForUpdate } from '../lib/updater';
import { Cpu, Cloud, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Download } from 'lucide-react';
import { PageHeader, Button, Card } from '../components/ui';

const inputCls = "w-full px-3 py-2 bg-paper dark:bg-charcoal-inset border border-paper-border dark:border-charcoal-border rounded text-sm text-ink dark:text-cream placeholder:text-ink-faint dark:placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sienna/30 focus:border-sienna transition-all";
const labelCls = "text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-muted dark:text-cream-muted";

export default function SettingsPage() {
    const [settings, setSettings] = useState<LLMSettings>({ mode: 'local', gguf_path: '', cloud_model: 'gemini-2.5-flash' });
    // The API key is returned masked by the backend, so we never bind it directly.
    // A blank input means "keep the saved key".
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [hasSavedKey, setHasSavedKey] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [autoCheck, setAutoCheckState] = useState(autoCheckEnabled());
    const [checkingUpdate, setCheckingUpdate] = useState(false);
    const [updateResult, setUpdateResult] = useState<string | null>(null);

    const handleAutoCheckToggle = (enabled: boolean) => {
        setAutoCheckState(enabled);
        setAutoCheck(enabled);
    };

    const handleCheckNow = async () => {
        setCheckingUpdate(true);
        setUpdateResult(null);
        try {
            const outcome = await checkAndPromptForUpdate();
            setUpdateResult(
                outcome === 'none' ? "You're up to date." :
                outcome === 'declined' ? 'Update available — install skipped.' :
                'Updated — relaunching...'
            );
        } catch (err) {
            // No updater-enabled release yet, or offline — not a real error to surface.
            setUpdateResult("Couldn't check for updates (offline, or no release available yet).");
        } finally {
            setCheckingUpdate(false);
        }
    };

    useEffect(() => {
        getLlmSettings()
            .then(s => {
                setSettings({ ...s, gguf_path: s.gguf_path || '', cloud_model: s.cloud_model || 'gemini-2.5-flash' });
                setHasSavedKey(!!s.api_key);
            })
            .catch(e => setError(String(e)));
    }, []);

    useEffect(() => {
        if (saved) {
            const t = setTimeout(() => setSaved(false), 2500);
            return () => clearTimeout(t);
        }
    }, [saved]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        try {
            await updateLlmSettings(
                settings.mode,
                settings.gguf_path || undefined,
                apiKeyInput || undefined, // blank ⇒ backend keeps the existing key
                settings.cloud_model || undefined,
            );
            if (apiKeyInput) setHasSavedKey(true);
            setApiKeyInput('');
            setSaved(true);
        } catch (err) {
            setError(String(err));
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pt-4">
            <PageHeader title="Settings" />

            {/* Local-parsing assurance */}
            <div className="flex gap-3 rounded border border-[#3d6b35]/30 bg-[#3d6b35]/5 p-4 dark:border-[#6fae62]/30 dark:bg-[#6fae62]/5">
                <ShieldCheck className="shrink-0 text-[#3d6b35] dark:text-[#6fae62]" />
                <div className="text-sm text-[#3d6b35] dark:text-[#6fae62]">
                    <b>Resume import runs entirely on-device.</b> PDF parsing uses a dedicated local model that downloads once and never contacts the cloud. The setting below only affects <b>cover-letter generation</b>.
                </div>
            </div>

            {error && (
                <div className="flex gap-3 rounded border border-[#a1453a]/30 bg-[#a1453a]/5 p-3 text-[#a1453a] dark:border-[#d97567]/30 dark:bg-[#d97567]/5 dark:text-[#d97567]">
                    <AlertCircle className="shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            <form
                onSubmit={handleSave}
                className="flex flex-col gap-6 rounded border border-paper-border bg-paper-card p-6 dark:border-charcoal-border dark:bg-charcoal-card"
            >
                <div className="flex flex-col gap-2">
                    <label className={labelCls}>Cover-letter model</label>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setSettings({ ...settings, mode: 'local' })}
                            className={`flex items-center gap-2 rounded border px-4 py-3 text-sm font-semibold transition-all ${
                                settings.mode === 'local'
                                    ? 'border-sienna bg-[rgba(138,61,34,.05)] text-sienna dark:border-sienna-dark dark:bg-[rgba(217,140,95,.08)] dark:text-sienna-dark'
                                    : 'border-paper-border text-ink-muted-2 hover:bg-paper-inset dark:border-charcoal-border dark:text-cream-muted dark:hover:bg-charcoal-inset'
                            }`}
                        >
                            <Cpu size={18} /> Local (GGUF)
                        </button>
                        <button
                            type="button"
                            onClick={() => setSettings({ ...settings, mode: 'cloud' })}
                            className={`flex items-center gap-2 rounded border px-4 py-3 text-sm font-semibold transition-all ${
                                settings.mode === 'cloud'
                                    ? 'border-sienna bg-[rgba(138,61,34,.05)] text-sienna dark:border-sienna-dark dark:bg-[rgba(217,140,95,.08)] dark:text-sienna-dark'
                                    : 'border-paper-border text-ink-muted-2 hover:bg-paper-inset dark:border-charcoal-border dark:text-cream-muted dark:hover:bg-charcoal-inset'
                            }`}
                        >
                            <Cloud size={18} /> Cloud (Gemini)
                        </button>
                    </div>
                </div>

                {settings.mode === 'local' && (
                    <div className="flex flex-col gap-2">
                        <label className={labelCls}>Model path (GGUF)</label>
                        <input
                            value={settings.gguf_path || ''}
                            onChange={e => setSettings({ ...settings, gguf_path: e.target.value })}
                            placeholder="C:\models\your-model.gguf"
                            className={inputCls}
                        />
                        <p className="text-xs text-ink-faint dark:text-cream-faint">Path to a local GGUF chat model used for cover letters.</p>
                    </div>
                )}

                {settings.mode === 'cloud' && (
                    <>
                        <div className="flex flex-col gap-2">
                            <label className={labelCls}>Cloud model</label>
                            <input
                                value={settings.cloud_model || ''}
                                onChange={e => setSettings({ ...settings, cloud_model: e.target.value })}
                                placeholder="gemini-2.5-flash"
                                className={inputCls}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className={labelCls}>API key</label>
                            <input
                                type="password"
                                value={apiKeyInput}
                                onChange={e => setApiKeyInput(e.target.value)}
                                placeholder={hasSavedKey ? '•••••••• (saved — leave blank to keep)' : 'Paste your Gemini API key'}
                                className={inputCls}
                            />
                        </div>
                    </>
                )}

                <div className="flex items-center gap-3">
                    <Button type="submit" variant="accent">Save settings</Button>
                    {saved && (
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-[#3d6b35] dark:text-[#6fae62]">
                            <CheckCircle2 size={16} /> Saved
                        </span>
                    )}
                </div>
            </form>

            <Card className="flex flex-col gap-4 p-6">
                <div className="flex items-center gap-2">
                    <RefreshCw size={18} className="text-sienna dark:text-sienna-dark" />
                    <h2 className="font-serif text-lg font-semibold text-ink dark:text-cream">Updates</h2>
                </div>

                <label className="flex cursor-pointer items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-ink dark:text-cream">Check for updates on launch</p>
                        <p className="text-xs text-ink-faint dark:text-cream-faint">Prompts before downloading — nothing installs without your say-so.</p>
                    </div>
                    <input
                        type="checkbox"
                        checked={autoCheck}
                        onChange={e => handleAutoCheckToggle(e.target.checked)}
                        className="h-5 w-5 shrink-0 accent-sienna"
                    />
                </label>

                <div className="flex items-center gap-3 border-t border-paper-inset-border pt-4 dark:border-charcoal-inset-border">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCheckNow}
                        disabled={checkingUpdate}
                    >
                        <Download size={15} /> {checkingUpdate ? 'Checking...' : 'Check now'}
                    </Button>
                    {updateResult && (
                        <span className="text-xs text-ink-muted dark:text-cream-muted">{updateResult}</span>
                    )}
                </div>
            </Card>
        </div>
    );
}
