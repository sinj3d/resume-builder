import { useState, useEffect } from 'react';
import { getLlmSettings, updateLlmSettings, LLMSettings } from '../lib/tauri';
import { Settings as SettingsIcon, Cpu, Cloud, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SettingsPage() {
    const [settings, setSettings] = useState<LLMSettings>({ mode: 'local', gguf_path: '', cloud_model: 'gemini-2.5-flash' });
    // The API key is returned masked by the backend, so we never bind it directly.
    // A blank input means "keep the saved key".
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [hasSavedKey, setHasSavedKey] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
        <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full pt-4">
            <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 flex items-center gap-3">
                    <SettingsIcon className="text-blue-500" /> Settings
                </h1>
            </div>

            {/* Local-parsing assurance */}
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex gap-3">
                <ShieldCheck className="text-emerald-500 shrink-0" />
                <div className="text-sm text-emerald-800 dark:text-emerald-300">
                    <b>Resume import runs entirely on-device.</b> PDF parsing uses a dedicated local model that downloads once and never contacts the cloud. The setting below only affects <b>cover-letter generation</b>.
                </div>
            </div>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl flex gap-3 border border-red-200 dark:border-red-800">
                    <AlertCircle className="shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            <form onSubmit={handleSave} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Cover-letter model</label>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setSettings({ ...settings, mode: 'local' })}
                            className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${
                                settings.mode === 'local'
                                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                            }`}
                        >
                            <Cpu size={18} /> Local (GGUF)
                        </button>
                        <button
                            type="button"
                            onClick={() => setSettings({ ...settings, mode: 'cloud' })}
                            className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${
                                settings.mode === 'cloud'
                                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                            }`}
                        >
                            <Cloud size={18} /> Cloud (Gemini)
                        </button>
                    </div>
                </div>

                {settings.mode === 'local' && (
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Model path (GGUF)</label>
                        <input
                            value={settings.gguf_path || ''}
                            onChange={e => setSettings({ ...settings, gguf_path: e.target.value })}
                            placeholder="C:\models\your-model.gguf"
                            className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <p className="text-xs text-slate-400">Path to a local GGUF chat model used for cover letters.</p>
                    </div>
                )}

                {settings.mode === 'cloud' && (
                    <>
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Cloud model</label>
                            <input
                                value={settings.cloud_model || ''}
                                onChange={e => setSettings({ ...settings, cloud_model: e.target.value })}
                                placeholder="gemini-2.5-flash"
                                className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">API key</label>
                            <input
                                type="password"
                                value={apiKeyInput}
                                onChange={e => setApiKeyInput(e.target.value)}
                                placeholder={hasSavedKey ? '•••••••• (saved — leave blank to keep)' : 'Paste your Gemini API key'}
                                className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </>
                )}

                <div className="flex items-center gap-3">
                    <button
                        type="submit"
                        className="px-5 py-2.5 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md transition-all"
                    >
                        Save Settings
                    </button>
                    {saved && (
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 size={16} /> Saved
                        </span>
                    )}
                </div>
            </form>
        </div>
    );
}
