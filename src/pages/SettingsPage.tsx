import { useState, useEffect } from 'react';
import { getLlmSettings, updateLlmSettings, LLMSettings } from '../lib/tauri';

export default function SettingsPage() {
    const [settings, setSettings] = useState<LLMSettings>({ mode: 'local', model_path: '', api_key: '' });

    useEffect(() => {
        getLlmSettings().then(setSettings).catch(console.error);
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await updateLlmSettings(settings.mode, settings.model_path, settings.api_key);
            alert('Settings saved!');
        } catch (error) {
            console.error('Failed to save settings', error);
            alert('Failed to save settings: ' + error);
        }
    };

    return (
        <div>
            <h1>Settings</h1>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '400px' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>Mode:</label>
                    <select value={settings.mode} onChange={e => setSettings({ ...settings, mode: e.target.value })} style={{ width: '100%', padding: '0.5rem' }}>
                        <option value="local">Local GGUF</option>
                        <option value="cloud">Cloud API</option>
                    </select>
                </div>

                {settings.mode === 'local' && (
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Model Path (GGUF):</label>
                        <input
                            value={settings.model_path || ''}
                            onChange={e => setSettings({ ...settings, model_path: e.target.value })}
                            style={{ width: '100%', padding: '0.5rem' }}
                        />
                    </div>
                )}

                {settings.mode === 'cloud' && (
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>API Key:</label>
                        <input
                            type="password"
                            value={settings.api_key || ''}
                            onChange={e => setSettings({ ...settings, api_key: e.target.value })}
                            style={{ width: '100%', padding: '0.5rem' }}
                        />
                    </div>
                )}

                <button type="submit" style={{ padding: '0.5rem' }}>Save Settings</button>
            </form>
        </div>
    );
}
