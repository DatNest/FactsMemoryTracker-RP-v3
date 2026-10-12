/*
 * Facts Memory Tracker RP v3 — clean-room rewrite.
 * Uses SillyTavern Connection Manager profiles directly and never switches
 * the globally active connection. Per-chat memory profile selection is stored
 * in chat metadata and therefore follows the chat automatically.
 */

(() => {
    'use strict';

    const MODULE = 'facts_memory_tracker_rp_v3';
    const VERSION = 3;
    const INJECTION_KEY = `${MODULE}_memory`;
    const PANEL_ID = 'fmt3_memory_panel';
    const SETTINGS_ID = 'fmt3_settings_root';
    const BUBBLE_ID = 'fmt3_bubble';

    const CATEGORIES = {
        characters: { label: '👤 Персонажи', short: 'Персонажи' },
        events: { label: '📅 События', short: 'События' },
        secrets: { label: '🔒 Секреты', short: 'Секреты' },
        flashbacks: { label: '🌀 Прошлое', short: 'Прошлое' },
        relationships: { label: '🤝 Отношения', short: 'Отношения' },
        promises: { label: '📌 Обещания', short: 'Обещания' },
        knowledge: { label: '🧠 Личные знания', short: 'Знания' },
        threads: { label: '⚠️ Сюжетные нити', short: 'Нити' },
    };

    const IMPORTANCE = {
        high: { label: 'High', rank: 3 },
        medium: { label: 'Medium', rank: 2 },
        low: { label: 'Low', rank: 1 },
    };

    const DEFAULT_INJECTION_TEMPLATE = `[ПАМЯТЬ СЫГРАННОЙ ИСТОРИИ]\nНиже находятся сохранённые факты, уже установленные в сыгранной истории. Используй их для непрерывности сюжета, персонажей, отношений и последствий прошлых событий.\n\n{{FACTS}}\n\nПРАВИЛА:\n— Факт истории НЕ является автоматически знанием каждого персонажа. Учитывай поле «знают».\n— Не раскрывай секреты персонажам только потому, что они находятся в памяти.\n— Не заставляй персонажей вспоминать факты без естественной причины.\n— Более новые явно сыгранные события имеют приоритет над устаревшими.\n— Не достраивай отсутствующие детали и не превращай догадки в факты.\n— Несс управляется пользователем: не придумывай за неё новые мысли, чувства, решения, согласие или действия.\n— Не упоминай существование этого блока памяти в ролевом ответе.\n[/ПАМЯТЬ СЫГРАННОЙ ИСТОРИИ]`;

    const DEFAULT_SCANNER_PROMPT = `Ты — куратор ДЕЛЬТЫ непрерывности ролевой истории. Твоя задача НЕ пересказывать сообщения и НЕ создавать вторую копию лорбука. Сохраняй только то, что стало НОВЫМ вследствие сыгранной сцены.

У тебя есть три источника:
1) АКТИВНЫЙ ЛОРБУК / БАЗОВЫЕ ФАКТЫ — уже известный авторский канон. НЕ сохраняй его повторно.
2) СУЩЕСТВУЮЩАЯ ПАМЯТЬ — уже сохранённые последствия сыгранных сцен. НЕ дублируй её.
3) НОВЫЕ СООБЩЕНИЯ — только здесь ищи изменения и новые последствия.

ГЛАВНЫЙ ПРИНЦИП:
Память должна отвечать на вопрос «что НОВОГО установила эта сцена по сравнению с уже существующим лором и памятью?», а не «какие факты вообще встретились в тексте?».

СОХРАНЯЙ:
- новое событие, реально произошедшее в сцене, если оно может иметь последствия;
- новое решение, обещание, договорённость, границу или конфликт;
- новое изменение отношений или устойчивого состояния;
- новый секрет/открытие, которого не было в базовом лоре или памяти;
- незавершённую сюжетную нить, возникшую именно в этой сцене;
- ПЕРЕДАЧУ ЗНАНИЯ: если персонаж впервые узнал уже существующий лорный факт от другого персонажа или наблюдением, сохраняй НЕ сам базовый факт, а событие знания.

КАК ПИСАТЬ ПЕРЕДАЧУ ЗНАНИЯ:
ПЛОХО: «Кларк родом из Смолвилля.»
ХОРОШО: «Несс узнала от Кларка, что он родом из Смолвилля.»
ПЛОХО: «Кларк и Джимми знакомы с колледжа.»
ХОРОШО: «Несс узнала, что Кларк и Джимми знакомы со студенческих лет.»
ПЛОХО: «У Несс три кота.»
ХОРОШО: «Кларк и Джимми узнали от Несс, что у неё три кота.»
Для таких записей используй category="knowledge" и knownBy только для персонажей, которые действительно получили/уже имели это знание в сцене.

НЕ СОХРАНЯЙ:
- любую биографию, внешность, происхождение, работу, привычки, отношения или прошлое, если это уже присутствует в АКТИВНОМ ЛОРБУКЕ;
- простое повторение канона в диалоге;
- экспозицию/саммари старой истории без нового изменения;
- факт только потому, что персонаж его произнёс;
- бытовые микродействия без долгосрочного значения;
- предположения, намёки и вероятности как объективную истину;
- красивую авторскую формулировку вместо реально установленного события;
- повтор уже существующей памяти.

КРИТИЧНО:
1. ЛОРБУК — это BASELINE. Его содержимое никогда не должно появляться как NEW само по себе.
2. Если лорный факт впервые становится знанием другого персонажа, сохраняй именно «кто узнал что и от кого/как», а не исходный лорный факт.
3. Если лорный факт просто упомянут тем, кто и так его знает, не сохраняй ничего.
4. Если базовый факт приводит к НОВОМУ последствию/решению, сохраняй последствие/решение, а не базовый факт.
5. Если повествование говорит «кажется», «возможно», персонаж предполагает или ошибается — не превращай это в объективный факт.
6. Различай объективный факт мира и знание персонажей. knownBy содержит только тех, кто действительно знает информацию после этой сцены.
7. Не исправляй историю знаниями из канона извне. Используй только присланный активный лорбук, сыгранный текст и существующую память.
8. Если новый факт обновляет старый — UPDATE. Если повторяет — DUPLICATE. Если прямо противоречит старому и из текста нельзя определить, какая версия верна — CONTRADICTS.
9. Для UPDATE/DUPLICATE/CONTRADICTS укажи targetId существующего факта.
10. text — кратко, конкретно, от третьего лица, без анализа.
11. За один скан возвращай не более 12 items. Если НОВЫХ фактов нет — верни {"items":[]}.
12. Выводи компактный JSON. Никогда не вставляй буквальные переносы строк, табы или управляющие символы внутрь строковых значений.

Верни ТОЛЬКО валидный JSON без markdown и без пояснений в формате:
{
  "items": [
    {
      "action": "NEW|UPDATE|DUPLICATE|CONTRADICTS",
      "targetId": null,
      "fact": {
        "text": "...",
        "category": "characters|events|secrets|flashbacks|relationships|promises|knowledge|threads",
        "importance": "high|medium|low",
        "subjects": ["имя"],
        "knownBy": ["имя"],
        "confidence": 1,
        "sourceIndexes": [12, 13]
      }
    }
  ]
}`;

    const DEFAULT_PROFILE = () => ({
        id: cryptoRandomId('profile'),
        name: 'По умолчанию',
        connectionProfileId: '',
        autoScan: true,
        autoScanEvery: 12,
        batchSize: 12,
        overlap: 2,
        maxOutputTokens: 4096,
        injectEnabled: true,
        minImportance: 'medium',
        maxInjectedFacts: 30,
        autoMarker: false,
        autoFlashback: false,
        autoFlashbackChance: 0,
        scannerPrompt: DEFAULT_SCANNER_PROMPT,
        injectionTemplate: DEFAULT_INJECTION_TEMPLATE,
    });

    const DEFAULT_GLOBAL = () => {
        const p = DEFAULT_PROFILE();
        return {
            version: VERSION,
            defaultProfileId: p.id,
            profiles: [p],
            scopeBindings: {},
            widgetEnabled: true,
            widgetScale: 100,
        };
    };

    let scanLock = false;
    let initialized = false;
    let lastKnownChatIdentity = '';

    function ctx() {
        return window.SillyTavern?.getContext?.();
    }

    function toast(type, message, title = 'FMT') {
        const t = window.toastr;
        if (t && typeof t[type] === 'function') t[type](message, title);
        else console[type === 'error' ? 'error' : 'log'](`[${title}] ${message}`);
    }

    function cryptoRandomId(prefix = 'id') {
        try {
            if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID()}`;
        } catch (_) { /* noop */ }
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function deepClone(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    function mergeDefaults(target, defaults) {
        if (!target || typeof target !== 'object') return deepClone(defaults);
        for (const [key, value] of Object.entries(defaults)) {
            if (!(key in target)) target[key] = deepClone(value);
            else if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
                mergeDefaults(target[key], value);
            }
        }
        return target;
    }

    function globalSettings() {
        const c = ctx();
        if (!c) return null;
        c.extensionSettings[MODULE] = mergeDefaults(c.extensionSettings[MODULE], DEFAULT_GLOBAL());
        const s = c.extensionSettings[MODULE];
        if (!Array.isArray(s.profiles) || !s.profiles.length) {
            const p = DEFAULT_PROFILE();
            s.profiles = [p];
            s.defaultProfileId = p.id;
        }
        return s;
    }

    function saveGlobal() {
        ctx()?.saveSettingsDebounced?.();
    }

    function currentScopeKey() {
        const c = ctx();
        if (!c) return 'unknown';
        if (c.groupId !== undefined && c.groupId !== null && c.groupId !== '') return `group:${c.groupId}`;
        const ch = c.characters?.[c.characterId];
        const stable = ch?.avatar || ch?.name || c.characterId || 'none';
        return `character:${stable}`;
    }

    function currentChatIdentity() {
        const c = ctx();
        if (!c) return 'unknown';
        return `${currentScopeKey()}::${c.chatId || 'chat'}`;
    }

    function defaultChatState() {
        return {
            version: VERSION,
            memoryProfileId: '',
            facts: [],
            lastScannedMessageIndex: -1,
            scanDirty: false,
            pendingFlashbackFactId: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    function chatState() {
        const c = ctx();
        if (!c?.chatMetadata) return null;
        if (!c.chatMetadata[MODULE]) {
            c.chatMetadata[MODULE] = defaultChatState();
            // Не запускаем дорогой бэкфилл старого чата автоматически.
            // Старую историю пользователь может явно обработать кнопкой «Весь чат».
            c.chatMetadata[MODULE].lastScannedMessageIndex = (c.chat || []).length - 1;
        } else {
            c.chatMetadata[MODULE] = mergeDefaults(c.chatMetadata[MODULE], defaultChatState());
        }
        const state = c.chatMetadata[MODULE];
        if (!state.memoryProfileId) {
            const g = globalSettings();
            state.memoryProfileId = g?.scopeBindings?.[currentScopeKey()] || g?.defaultProfileId || g?.profiles?.[0]?.id || '';
        }
        if (!Array.isArray(state.facts)) state.facts = [];
        return state;
    }

    async function saveChatState() {
        const state = chatState();
        if (state) state.updatedAt = Date.now();
        try {
            await ctx()?.saveMetadata?.();
        } catch (error) {
            console.warn('[FMT3] Could not save chat metadata', error);
        }
    }

    function memoryProfile() {
        const g = globalSettings();
        const st = chatState();
        if (!g || !st) return null;
        return g.profiles.find(p => p.id === st.memoryProfileId)
            || g.profiles.find(p => p.id === g.defaultProfileId)
            || g.profiles[0];
    }

    function normalizeProfile(profile) {
        return mergeDefaults(profile, DEFAULT_PROFILE());
    }

    function importanceRank(value) {
        return IMPORTANCE[value]?.rank || 1;
    }

    function normalizeImportance(value) {
        const v = String(value || '').toLowerCase();
        if (['high', 'высокая', 'высокий'].includes(v)) return 'high';
        if (['low', 'низкая', 'низкий'].includes(v)) return 'low';
        return 'medium';
    }

    function normalizeCategory(value) {
        const v = String(value || '').toLowerCase().trim();
        if (CATEGORIES[v]) return v;
        const aliases = {
            character: 'characters', персонажи: 'characters', персонаж: 'characters',
            event: 'events', события: 'events', событие: 'events',
            secret: 'secrets', секреты: 'secrets', секрет: 'secrets',
            flashback: 'flashbacks', прошлое: 'flashbacks', воспоминания: 'flashbacks',
            relationship: 'relationships', отношения: 'relationships',
            promise: 'promises', обещания: 'promises', договоренности: 'promises', договорённости: 'promises',
            knowledge: 'knowledge', знания: 'knowledge',
            thread: 'threads', threads: 'threads', нити: 'threads',
        };
        return aliases[v] || 'events';
    }

    function normalizeStringArray(value) {
        if (!Array.isArray(value)) return [];
        return [...new Set(value.map(x => String(x || '').trim()).filter(Boolean))].slice(0, 30);
    }

    function normalizeFact(raw = {}, sourceFallback = []) {
        const now = Date.now();
        return {
            id: raw.id || cryptoRandomId('fact'),
            text: String(raw.text || '').trim().slice(0, 600),
            category: normalizeCategory(raw.category),
            importance: normalizeImportance(raw.importance),
            subjects: normalizeStringArray(raw.subjects),
            knownBy: normalizeStringArray(raw.knownBy),
            confidence: Number.isFinite(Number(raw.confidence)) ? Math.max(0, Math.min(1, Number(raw.confidence))) : 1,
            sourceMessageIndexes: Array.isArray(raw.sourceMessageIndexes)
                ? raw.sourceMessageIndexes.map(Number).filter(Number.isInteger)
                : Array.isArray(raw.sourceIndexes)
                    ? raw.sourceIndexes.map(Number).filter(Number.isInteger)
                    : sourceFallback,
            status: raw.status || 'active',
            enabled: raw.enabled !== false,
            contradicts: raw.contradicts || '',
            revisions: Array.isArray(raw.revisions) ? raw.revisions : [],
            createdAt: Number(raw.createdAt) || now,
            updatedAt: Number(raw.updatedAt) || now,
        };
    }

    function activeFacts() {
        const st = chatState();
        return (st?.facts || []).filter(f => f.status === 'active' && f.enabled !== false);
    }

    function factTextKey(text) {
        return String(text || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.,!?;:—–-]/g, '').trim();
    }

    function getSupportedConnectionProfiles() {
        const c = ctx();
        try {
            const profiles = c?.ConnectionManagerRequestService?.getSupportedProfiles?.();
            return Array.isArray(profiles) ? profiles : [];
        } catch (error) {
            console.warn('[FMT3] Connection Manager profiles unavailable', error);
            return [];
        }
    }

    function connectionProfileId(profile) {
        return String(profile?.id ?? profile?.profileId ?? profile?.name ?? '');
    }

    function connectionProfileLabel(profile) {
        const name = profile?.name || profile?.id || 'Без имени';
        const model = profile?.model ? ` · ${profile.model}` : '';
        return `${name}${model}`;
    }

    async function callProfile(messages, maxTokens, overridePayload = {}) {
        const profile = memoryProfile();
        if (!profile?.connectionProfileId) throw new Error('Не выбран профиль подключения SillyTavern');
        const service = ctx()?.ConnectionManagerRequestService;
        if (!service?.sendRequest) throw new Error('Connection Manager недоступен в этой версии SillyTavern');

        const selected = service.getProfile?.(profile.connectionProfileId);
        if (selected && service.isProfileSupported && !service.isProfileSupported(selected)) {
            throw new Error('Выбранный Connection Profile не поддерживается для генерации');
        }

        const tokenBudget = Number(maxTokens || profile.maxOutputTokens || 4096);
        const result = await service.sendRequest(
            profile.connectionProfileId,
            messages,
            tokenBudget,
            {
                stream: false,
                extractData: true,
                includePreset: false,
                includeInstruct: true,
            },
            overridePayload || {},
        );

        const text = extractResponseText(result);
        if (!String(text || '').trim() && typeof result?.reasoning === 'string' && result.reasoning.trim()) {
            throw new Error(`Модель вернула только reasoning без финального ответа (лимит: ${tokenBudget} токенов). Увеличь «Max tokens» или выбери модель без длинного reasoning.`);
        }
        return text;
    }

    function extractResponseText(data) {
        if (typeof data === 'string') return data;
        if (!data) return '';
        if (typeof data.content === 'string') return data.content;
        if (typeof data.assistantText === 'string') return data.assistantText;
        if (typeof data.message?.content === 'string') return data.message.content;
        if (typeof data.choices?.[0]?.message?.content === 'string') return data.choices[0].message.content;
        if (typeof data.choices?.[0]?.text === 'string') return data.choices[0].text;
        if (data.data) return extractResponseText(data.data);
        return '';
    }

    async function testConnectionProfile() {
        const p = memoryProfile();
        if (!p?.connectionProfileId) {
            toast('warning', 'Сначала выбери существующий Connection Profile.');
            return;
        }
        setStatus('Проверяю подключение…', 'busy');
        try {
            const text = await callProfile([
                { role: 'system', content: 'Верни только JSON. Никакого markdown.' },
                { role: 'user', content: 'Ответь строго так: {"ok":true}' },
            ], 1024, { response_format: { type: 'json_object' } });
            const parsed = parseJsonLoose(text);
            if (parsed?.ok === true) {
                setStatus('✓ Профиль отвечает и возвращает JSON', 'ok');
                toast('success', 'Профиль подключения работает и возвращает JSON.');
            } else {
                setStatus('Профиль отвечает, но JSON-тест не пройден', 'warn');
                toast('warning', `Профиль ответил, но не ожидаемым JSON: ${String(text).slice(0, 140)}`);
            }
        } catch (error) {
            const detail = deepestErrorMessage(error);
            setStatus(`Ошибка: ${detail}`, 'error');
            toast('error', detail);
        }
    }

    function deepestErrorMessage(error) {
        let cur = error;
        let last = '';
        for (let i = 0; i < 6 && cur; i++) {
            if (cur.message) last = cur.message;
            cur = cur.cause;
        }
        return last || String(error || 'Неизвестная ошибка');
    }

    function escapeRawControlsInsideJsonStrings(input) {
        let out = '';
        let inString = false;
        let escaped = false;
        for (let i = 0; i < input.length; i++) {
            const ch = input[i];
            if (!inString) {
                out += ch;
                if (ch === '"') inString = true;
                continue;
            }
            if (escaped) {
                out += ch;
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                out += ch;
                escaped = true;
                continue;
            }
            if (ch === '"') {
                out += ch;
                inString = false;
                continue;
            }
            if (ch === '\n') { out += '\\n'; continue; }
            if (ch === '\r') { out += '\\r'; continue; }
            if (ch === '\t') { out += '\\t'; continue; }
            const code = ch.charCodeAt(0);
            if (code >= 0 && code < 0x20) {
                out += `\\u${code.toString(16).padStart(4, '0')}`;
                continue;
            }
            out += ch;
        }
        return out;
    }

    function repairJsonCandidate(input) {
        let s = String(input || '')
            .replace(/^\uFEFF/, '')
            .replace(/\u00A0/g, ' ')
            .trim();

        s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        s = s.replace(/^json\s*/i, '').trim();
        s = escapeRawControlsInsideJsonStrings(s);
        // Common model slip: trailing commas before closing braces/brackets.
        s = s.replace(/,\s*([}\]])/g, '$1');
        return s;
    }

    function tryParseJsonCandidate(candidate) {
        const repaired = repairJsonCandidate(candidate);
        try { return JSON.parse(repaired); } catch (_) { return null; }
    }

    function extractBalancedJsonCandidate(input, openChar, closeChar) {
        const s = String(input || '');
        const start = s.indexOf(openChar);
        if (start < 0) return '';
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = start; i < s.length; i++) {
            const ch = s[i];
            if (inString) {
                if (escaped) { escaped = false; continue; }
                if (ch === '\\') { escaped = true; continue; }
                if (ch === '"') inString = false;
                continue;
            }
            if (ch === '"') { inString = true; continue; }
            if (ch === openChar) depth++;
            if (ch === closeChar) {
                depth--;
                if (depth === 0) return s.slice(start, i + 1);
            }
        }
        return '';
    }

    function parseJsonLoose(text) {
        if (typeof text !== 'string' || !text.trim()) throw new Error('Модель вернула пустой ответ');
        const raw = text.trim();

        const direct = tryParseJsonCandidate(raw);
        if (direct !== null) return direct;

        const objectCandidate = extractBalancedJsonCandidate(raw, '{', '}');
        if (objectCandidate) {
            const parsed = tryParseJsonCandidate(objectCandidate);
            if (parsed !== null) return parsed;
        }

        const arrayCandidate = extractBalancedJsonCandidate(raw, '[', ']');
        if (arrayCandidate) {
            const parsed = tryParseJsonCandidate(arrayCandidate);
            if (parsed !== null) return parsed;
        }

        const opens = (raw.match(/[\[{]/g) || []).length;
        const closes = (raw.match(/[\]}]/g) || []).length;
        if (opens > closes) {
            throw new Error(`JSON-ответ модели, похоже, оборван до закрывающих скобок. Увеличь «Max tokens» или уменьши размер пакета. Начало ответа: ${raw.slice(0, 150)}`);
        }
        throw new Error(`Модель вернула невалидный JSON даже после безопасного ремонта: ${raw.slice(0, 180)}`);
    }

    function formatExistingFactsForScanner(limit = 70) {
        const facts = activeFacts()
            .sort((a, b) => importanceRank(b.importance) - importanceRank(a.importance) || b.updatedAt - a.updatedAt)
            .slice(0, limit);
        if (!facts.length) return '(память пока пуста)';
        return facts.map(f => {
            const known = f.knownBy?.length ? f.knownBy.join(', ') : 'не установлено';
            return `${f.id} | ${f.category} | ${f.importance} | знают: ${known} | ${f.text}`;
        }).join('\n');
    }

    function messageText(message, index) {
        if (!message || message.is_system) return '';
        const raw = String(message.mes ?? message.message ?? '').trim();
        if (!raw) return '';
        const speaker = String(message.name || (message.is_user ? 'Пользователь' : 'Персонаж')).trim();
        return `[${index}] ${speaker}: ${raw}`;
    }

    function collectMessages(start, end) {
        const chat = ctx()?.chat || [];
        const out = [];
        for (let i = Math.max(0, start); i <= Math.min(end, chat.length - 1); i++) {
            const t = messageText(chat[i], i);
            if (t) out.push(t);
        }
        return out.join('\n\n');
    }


    function collectMessageLines(start, end) {
        const chat = ctx()?.chat || [];
        const out = [];
        for (let i = Math.max(0, start); i <= Math.min(end, chat.length - 1); i++) {
            const t = messageText(chat[i], i);
            if (t) out.push(t);
        }
        return out;
    }

    async function getActiveLoreReference(start, end) {
        const c = ctx();
        if (!c?.getWorldInfoPrompt) return '(активный лорбук недоступен через API SillyTavern)';
        try {
            const lines = collectMessageLines(start, end);
            if (!lines.length) return '(для этого пакета активный лорбук не найден)';
            const result = await c.getWorldInfoPrompt(lines, Number(c.maxContext || 32768), true);
            const combined = String(
                result?.worldInfoString
                || [result?.worldInfoBefore, result?.worldInfoAfter].filter(Boolean).join('\n\n')
                || ''
            ).trim();
            if (!combined) return '(для этого пакета ни одна запись лорбука не активировалась)';
            // Reference only. Cap it so a huge lore activation cannot dominate a cheap scanner request.
            return combined.slice(0, 50000);
        } catch (error) {
            console.warn('[FMT3] Could not build active lore reference', error);
            return '(не удалось получить активный лорбук; используй строгий режим дельты и не сохраняй экспозицию как факт)';
        }
    }

    async function scanChunk(start, end, { updateCursor = true, quiet = false } = {}) {
        const profile = memoryProfile();
        const st = chatState();
        if (!profile || !st) return { added: 0, updated: 0, conflicts: 0 };
        const transcript = collectMessages(start, end);
        if (!transcript.trim()) {
            if (updateCursor) {
                st.lastScannedMessageIndex = Math.max(st.lastScannedMessageIndex, end);
                await saveChatState();
            }
            return { added: 0, updated: 0, conflicts: 0 };
        }

        const loreReference = await getActiveLoreReference(start, end);
        const userPrompt = `АКТИВНЫЙ ЛОРБУК / БАЗОВЫЕ ФАКТЫ (REFERENCE ONLY; НЕ СОХРАНЯЙ ИХ ПОВТОРНО):\n${loreReference}\n\nСУЩЕСТВУЮЩАЯ ПАМЯТЬ (ID нужны для UPDATE/DUPLICATE/CONTRADICTS):\n${formatExistingFactsForScanner()}\n\nНОВЫЕ СООБЩЕНИЯ ДЛЯ СКАНА (${start}–${end}):\n${transcript}`;
        let raw;
        try {
            raw = await callProfile([
                { role: 'system', content: profile.scannerPrompt || DEFAULT_SCANNER_PROMPT },
                { role: 'user', content: userPrompt },
            ], profile.maxOutputTokens || 4096, { response_format: { type: 'json_object' } });
        } catch (error) {
            // Some providers/models do not support response_format. Retry once without it.
            const msg = deepestErrorMessage(error).toLowerCase();
            const looksLikeFormatSupport = msg.includes('response_format') || msg.includes('structured') || msg.includes('json_object') || msg.includes('unsupported');
            if (!looksLikeFormatSupport) throw error;
            raw = await callProfile([
                { role: 'system', content: profile.scannerPrompt || DEFAULT_SCANNER_PROMPT },
                { role: 'user', content: userPrompt },
            ], profile.maxOutputTokens || 4096);
        }

        let parsed;
        try {
            parsed = parseJsonLoose(raw);
        } catch (firstParseError) {
            // One cheap syntax-only repair pass. It is instructed not to change facts.
            const repairedRaw = await callProfile([
                { role: 'system', content: 'Ты форматтер JSON. Исправь только синтаксис переданного JSON. Не добавляй, не удаляй и не меняй смысл фактов. Верни только валидный JSON без markdown.' },
                { role: 'user', content: String(raw || '').slice(0, 24000) },
            ], Math.min(Number(profile.maxOutputTokens || 4096), 4096), { response_format: { type: 'json_object' } });
            try {
                parsed = parseJsonLoose(repairedRaw);
            } catch (_) {
                throw firstParseError;
            }
        }
        const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : []);
        const result = applyScannerItems(items, Array.from({ length: Math.max(0, end - start + 1) }, (_, n) => start + n));

        if (updateCursor) {
            st.lastScannedMessageIndex = Math.max(st.lastScannedMessageIndex, end);
            st.scanDirty = false;
        }
        await saveChatState();
        refreshInjection();
        renderAll();
        if (!quiet) toast('success', `Скан готов: +${result.added}, обновлено ${result.updated}, конфликтов ${result.conflicts}.`);
        return result;
    }

    function applyScannerItems(items, sourceFallback) {
        const st = chatState();
        const facts = st?.facts || [];
        const byId = new Map(facts.map(f => [f.id, f]));
        let added = 0, updated = 0, conflicts = 0;

        for (const item of items || []) {
            const action = String(item?.action || 'NEW').toUpperCase();
            const targetId = String(item?.targetId || '');
            const rawFact = item?.fact || item || {};
            if (!String(rawFact.text || '').trim()) continue;

            if (action === 'DUPLICATE') continue;

            if (action === 'UPDATE' && targetId && byId.has(targetId)) {
                const target = byId.get(targetId);
                const previous = deepClone({
                    text: target.text,
                    category: target.category,
                    importance: target.importance,
                    subjects: target.subjects,
                    knownBy: target.knownBy,
                    confidence: target.confidence,
                    sourceMessageIndexes: target.sourceMessageIndexes,
                    updatedAt: target.updatedAt,
                });
                target.revisions = Array.isArray(target.revisions) ? target.revisions : [];
                target.revisions.push(previous);
                const next = normalizeFact(rawFact, sourceFallback);
                target.text = next.text;
                target.category = next.category;
                target.importance = next.importance;
                target.subjects = next.subjects;
                target.knownBy = next.knownBy;
                target.confidence = next.confidence;
                target.sourceMessageIndexes = [...new Set([...(target.sourceMessageIndexes || []), ...(next.sourceMessageIndexes || [])])];
                target.status = 'active';
                target.enabled = true;
                target.updatedAt = Date.now();
                updated++;
                continue;
            }

            if (action === 'CONTRADICTS') {
                const f = normalizeFact(rawFact, sourceFallback);
                f.status = 'conflict';
                f.enabled = false;
                f.contradicts = targetId;
                facts.push(f);
                byId.set(f.id, f);
                conflicts++;
                continue;
            }

            const candidate = normalizeFact(rawFact, sourceFallback);
            const exact = facts.find(f => factTextKey(f.text) === factTextKey(candidate.text) && f.status === 'active');
            if (exact) continue;
            facts.push(candidate);
            byId.set(candidate.id, candidate);
            added++;
        }
        return { added, updated, conflicts };
    }

    async function scanPending({ manual = true } = {}) {
        if (scanLock) {
            if (manual) toast('info', 'Скан уже идёт.');
            return;
        }
        const c = ctx();
        const st = chatState();
        const p = memoryProfile();
        if (!c || !st || !p) return;
        if (!p.connectionProfileId) {
            toast('warning', 'Для профиля памяти не выбран Connection Profile SillyTavern.');
            return;
        }
        const finalIndex = (c.chat || []).length - 1;
        if (finalIndex < 0) return;

        let start = Math.max(0, st.lastScannedMessageIndex + 1 - Math.max(0, Number(p.overlap || 0)));
        if (st.lastScannedMessageIndex >= finalIndex && manual) {
            start = Math.max(0, finalIndex - Number(p.batchSize || 12) + 1);
        } else if (st.lastScannedMessageIndex >= finalIndex) {
            return;
        }

        scanLock = true;
        setStatus('Сканирую новые сообщения…', 'busy');
        try {
            const batch = Math.max(4, Number(p.batchSize || 12));
            let cursor = start;
            let totals = { added: 0, updated: 0, conflicts: 0 };
            while (cursor <= finalIndex) {
                const end = Math.min(finalIndex, cursor + batch - 1);
                setStatus(`Скан ${cursor}–${end} из ${finalIndex}`, 'busy');
                const r = await scanChunk(cursor, end, { updateCursor: true, quiet: true });
                totals.added += r.added;
                totals.updated += r.updated;
                totals.conflicts += r.conflicts;
                if (end >= finalIndex) break;
                cursor = Math.max(cursor + 1, end + 1 - Math.max(0, Number(p.overlap || 0)));
            }
            setStatus(`✓ Готово · +${totals.added}, ~${totals.updated}, ⚠${totals.conflicts}`, 'ok');
            if (manual) toast('success', `Скан готов: +${totals.added}, обновлено ${totals.updated}, конфликтов ${totals.conflicts}.`);
        } catch (error) {
            const detail = deepestErrorMessage(error);
            console.error('[FMT3] Scan failed', error);
            setStatus(`Ошибка скана: ${detail}`, 'error');
            if (manual) toast('error', detail);
        } finally {
            scanLock = false;
        }
    }

    async function rescanRecent() {
        if (scanLock) return;
        const p = memoryProfile();
        const chat = ctx()?.chat || [];
        const end = chat.length - 1;
        const start = Math.max(0, end - Math.max(4, Number(p?.batchSize || 12)) + 1);
        scanLock = true;
        setStatus(`Перескан ${start}–${end}…`, 'busy');
        try {
            await scanChunk(start, end, { updateCursor: false, quiet: true });
            setStatus('✓ Последний диапазон пересканирован', 'ok');
            toast('success', 'Последний диапазон пересканирован.');
        } catch (error) {
            setStatus(`Ошибка: ${deepestErrorMessage(error)}`, 'error');
            toast('error', deepestErrorMessage(error));
        } finally {
            scanLock = false;
        }
    }

    async function scanWholeChat() {
        if (scanLock) return;
        const ok = window.confirm('Просканировать весь текущий чат по частям? Это может сделать много API-запросов.');
        if (!ok) return;
        const st = chatState();
        if (!st) return;
        st.lastScannedMessageIndex = -1;
        await saveChatState();
        await scanPending({ manual: true });
    }

    async function resetScanCursor() {
        const st = chatState();
        if (!st) return;
        st.lastScannedMessageIndex = -1;
        st.scanDirty = true;
        await saveChatState();
        renderAll();
        toast('info', 'Курсор сканирования сброшен. Существующие факты не удалены.');
    }

    function buildInjection() {
        const p = memoryProfile();
        const st = chatState();
        if (!p?.injectEnabled || !st) return '';
        const minRank = importanceRank(p.minImportance || 'medium');
        const selected = (st.facts || [])
            .filter(f => f.status === 'active' && f.enabled !== false && importanceRank(f.importance) >= minRank)
            .sort((a, b) => importanceRank(b.importance) - importanceRank(a.importance) || b.updatedAt - a.updatedAt)
            .slice(0, Math.max(1, Number(p.maxInjectedFacts || 30)));

        const factLines = selected.length
            ? selected.map(f => {
                const known = f.knownBy?.length ? f.knownBy.join(', ') : 'не установлено';
                return `- [${String(f.importance).toUpperCase()}][${CATEGORIES[f.category]?.short || f.category}][знают: ${known}] ${f.text}`;
            }).join('\n')
            : '- (нет активных фактов выше выбранного порога)';

        let injection = String(p.injectionTemplate || DEFAULT_INJECTION_TEMPLATE).replace('{{FACTS}}', factLines);
        if (st.pendingFlashbackFactId) {
            const f = st.facts.find(x => x.id === st.pendingFlashbackFactId);
            if (f) {
                injection += `\n\n[ОДНОРАЗОВЫЙ ФЛЕШБЕК]\nЕсли это естественно для текущей сцены и персонаж действительно знает этот факт, мягко дай ему эмоционально вспомнить или учесть: ${f.text}\nНе ломай сцену и не раскрывай чужое скрытое знание.\n[/ОДНОРАЗОВЫЙ ФЛЕШБЕК]`;
            }
        }
        return injection;
    }

    function refreshInjection() {
        const c = ctx();
        if (!c?.setExtensionPrompt) return;
        const value = buildInjection();
        try {
            c.setExtensionPrompt(INJECTION_KEY, value, 0, 0, false);
        } catch (error) {
            console.warn('[FMT3] Injection update failed', error);
        }
    }

    function parseFactMarkersFromMessage(message) {
        const p = memoryProfile();
        if (!p?.autoMarker) return;
        const raw = String(message?.mes || '');
        if (!raw.includes('[FACT:')) return;
        const regex = /\[FACT:\s*(.*?)\s*\|\s*([^\]]+)\]/gsi;
        const st = chatState();
        let match;
        let added = 0;
        while ((match = regex.exec(raw))) {
            const text = String(match[1] || '').trim();
            if (!text) continue;
            if (st.facts.some(f => factTextKey(f.text) === factTextKey(text))) continue;
            st.facts.push(normalizeFact({
                text,
                category: normalizeCategory(match[2]),
                importance: 'medium',
                confidence: 1,
                sourceIndexes: [(ctx()?.chat || []).length - 1],
            }));
            added++;
        }
        if (added) {
            saveChatState();
            refreshInjection();
            renderAll();
        }
    }

    async function maybeAutoScan() {
        const p = memoryProfile();
        const st = chatState();
        const chat = ctx()?.chat || [];
        if (!p?.autoScan || !st || scanLock) return;
        const newCount = (chat.length - 1) - st.lastScannedMessageIndex;
        if (newCount >= Math.max(1, Number(p.autoScanEvery || 12))) {
            await scanPending({ manual: false });
        }
    }

    async function maybeAutoFlashback() {
        const p = memoryProfile();
        const st = chatState();
        if (!p?.autoFlashback || !st || st.pendingFlashbackFactId) return;
        const chance = Math.max(0, Math.min(100, Number(p.autoFlashbackChance || 0)));
        if (!chance || Math.random() * 100 >= chance) return;
        const pool = activeFacts().filter(f => ['characters', 'relationships', 'events', 'flashbacks'].includes(f.category));
        if (!pool.length) return;
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        st.pendingFlashbackFactId = chosen.id;
        await saveChatState();
        refreshInjection();
        renderAll();
    }

    async function consumeFlashbackAfterReply() {
        const st = chatState();
        if (!st?.pendingFlashbackFactId) return;
        st.pendingFlashbackFactId = '';
        await saveChatState();
        refreshInjection();
        renderAll();
    }

    function installEvents() {
        const c = ctx();
        if (!c?.eventSource || !c?.eventTypes) return;
        const es = c.eventSource;
        const et = c.eventTypes;

        if (et.CHAT_CHANGED) es.on(et.CHAT_CHANGED, async () => {
            await onChatChanged();
        });
        if (et.MESSAGE_SENT) es.on(et.MESSAGE_SENT, async () => {
            await maybeAutoFlashback();
        });
        if (et.MESSAGE_RECEIVED) es.on(et.MESSAGE_RECEIVED, async () => {
            const chat = ctx()?.chat || [];
            parseFactMarkersFromMessage(chat[chat.length - 1]);
            await consumeFlashbackAfterReply();
            window.setTimeout(() => maybeAutoScan(), 500);
        });
        const dirtyEvents = ['MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED'];
        for (const key of dirtyEvents) {
            if (!et[key]) continue;
            es.on(et[key], async () => {
                const st = chatState();
                if (!st) return;
                st.scanDirty = true;
                const p = memoryProfile();
                const chatLen = (ctx()?.chat || []).length;
                st.lastScannedMessageIndex = Math.min(
                    st.lastScannedMessageIndex,
                    Math.max(-1, chatLen - Math.max(4, Number(p?.batchSize || 12)) - 1),
                );
                await saveChatState();
                renderAll();
            });
        }
    }

    async function onChatChanged() {
        lastKnownChatIdentity = currentChatIdentity();
        chatState();
        refreshInjection();
        refreshConnectionProfilesUI();
        renderAll();
    }

    function renderSettingsHtml() {
        if (document.getElementById(SETTINGS_ID)) return;
        const host = document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings');
        if (!host) return;
        const root = document.createElement('div');
        root.id = SETTINGS_ID;
        root.className = 'fmt3-settings';
        root.innerHTML = `
        <div class="inline-drawer">
          <div class="inline-drawer-toggle inline-drawer-header">
            <b>🧠 Память фактов</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
          </div>
          <div class="inline-drawer-content">

            <section class="fmt3-section">
              <div class="fmt3-section-title">⚙ ОСНОВНОЕ</div>
              <div class="fmt3-section-body">
                <div class="fmt3-grid2">
                  <label class="fmt3-check"><input id="fmt3_inject_enabled" type="checkbox"> Инъекция в промпт</label>
                  <label class="fmt3-check"><input id="fmt3_widget_enabled" type="checkbox"> Виджет 🧠</label>
                </div>
                <div class="fmt3-slider-row">
                  <span>Размер виджета:</span>
                  <input id="fmt3_widget_scale" type="range" min="60" max="160" step="5">
                  <b id="fmt3_widget_scale_value">100%</b>
                </div>
                <div class="fmt3-main-actions">
                  <button id="fmt3_open_memory" class="menu_button">📂 Трекер</button>
                  <button id="fmt3_scan_pending" class="menu_button">🔍 Скан</button>
                  <button id="fmt3_scan_all" class="menu_button">📚 Весь чат</button>
                </div>
              </div>
            </section>

            <details class="fmt3-section" open>
              <summary class="fmt3-section-title">🗂 ПРОФИЛЬ ПАМЯТИ</summary>
              <div class="fmt3-section-body">
                <div class="fmt3-row">
                  <select id="fmt3_memory_profile"></select>
                  <button id="fmt3_profile_new" class="menu_button" title="Новый профиль">＋</button>
                  <button id="fmt3_profile_clone" class="menu_button" title="Клонировать">⧉</button>
                  <button id="fmt3_profile_delete" class="menu_button" title="Удалить">🗑</button>
                </div>
                <label class="fmt3-check"><input id="fmt3_bind_scope" type="checkbox"> Автоматически использовать этот профиль в новых чатах персонажа / группы</label>
                <div class="fmt3-hint" id="fmt3_chat_binding"></div>
              </div>
            </details>

            <details class="fmt3-section" open>
              <summary class="fmt3-section-title">🔍 СКАНИРОВАНИЕ</summary>
              <div class="fmt3-section-body">
                <div class="fmt3-grid2">
                  <label class="fmt3-check"><input id="fmt3_auto_scan" type="checkbox"> Авто-скан</label>
                  <label class="fmt3-check"><input id="fmt3_auto_marker" type="checkbox"> Авто-маркер [FACT:]</label>
                </div>
                <div class="fmt3-grid4">
                  <label>Каждые<input id="fmt3_auto_every" type="number" min="1" max="100"></label>
                  <label>Пакет<input id="fmt3_batch_size" type="number" min="4" max="50"></label>
                  <label>Перекрытие<input id="fmt3_overlap" type="number" min="0" max="10"></label>
                  <label>Max tokens<input id="fmt3_max_tokens" type="number" min="256" max="16384" step="256"></label>
                </div>
                <div class="fmt3-row fmt3-wrap">
                  <button id="fmt3_rescan_recent" class="menu_button">↻ Последний пакет</button>
                  <button id="fmt3_reset_cursor" class="menu_button">Сброс курсора</button>
                </div>
                <div id="fmt3_scan_state" class="fmt3-hint"></div>
              </div>
            </details>

            <details class="fmt3-section">
              <summary class="fmt3-section-title">💉 ИНЪЕКЦИЯ</summary>
              <div class="fmt3-section-body">
                <div class="fmt3-grid2">
                  <label>Важность ≥
                    <select id="fmt3_min_importance"><option value="high">High</option><option value="medium">Medium+</option><option value="low">Все</option></select>
                  </label>
                  <label>Макс. фактов<input id="fmt3_max_facts" type="number" min="1" max="200"></label>
                </div>
                <details class="fmt3-advanced"><summary>Шаблон промпта {{FACTS}}</summary><textarea id="fmt3_injection_template" rows="9"></textarea></details>
              </div>
            </details>

            <details class="fmt3-section">
              <summary class="fmt3-section-title">⚡ ФЛЕШБЕК</summary>
              <div class="fmt3-section-body">
                <label class="fmt3-check"><input id="fmt3_auto_flashback" type="checkbox"> Автоматический флешбек</label>
                <label>Авто-шанс %<input id="fmt3_flashback_chance" type="number" min="0" max="100"></label>
                <div class="fmt3-hint">Ручной флешбек запускается прямо из карточки факта.</div>
              </div>
            </details>

            <details class="fmt3-section" open>
              <summary class="fmt3-section-title">🪶 ПОДКЛЮЧЕНИЕ</summary>
              <div class="fmt3-section-body">
                <div class="fmt3-row">
                  <select id="fmt3_connection_profile"></select>
                  <button id="fmt3_connections_refresh" class="menu_button" title="Обновить список">↻</button>
                </div>
                <div class="fmt3-row">
                  <button id="fmt3_test_connection" class="menu_button">🪶 Тест соединения</button>
                  <span id="fmt3_connection_status" class="fmt3-status"></span>
                </div>
                <div class="fmt3-hint">Используется уже сохранённый Connection Profile SillyTavern. Основное подключение RP не переключается.</div>
              </div>
            </details>

            <details class="fmt3-section fmt3-advanced">
              <summary class="fmt3-section-title">🧠 ПРОМПТ СКАНЕРА</summary>
              <div class="fmt3-section-body"><textarea id="fmt3_scanner_prompt" rows="15"></textarea></div>
            </details>

            <section class="fmt3-section">
              <div class="fmt3-section-body">
                <div class="fmt3-row fmt3-wrap">
                  <button id="fmt3_export" class="menu_button">⬇ Экспорт</button>
                  <button id="fmt3_import" class="menu_button">⬆ Импорт</button>
                  <input id="fmt3_import_file" type="file" accept="application/json,.json" hidden>
                </div>
              </div>
            </section>
          </div>
        </div>`;
        host.appendChild(root);
        bindSettingsEvents();
    }

    function renderBubble() {
        if (document.getElementById(BUBBLE_ID)) return;
        const bubble = document.createElement('button');
        bubble.id = BUBBLE_ID;
        bubble.className = 'fmt3-bubble';
        bubble.type = 'button';
        bubble.innerHTML = '<span class="fmt3-bubble-brain">🧠</span><b id="fmt3_bubble_count">0</b>';
        bubble.title = 'Память фактов';
        bubble.addEventListener('click', toggleMemoryPanel);
        document.body.appendChild(bubble);
    }

    function renderMemoryPanelShell() {
        if (document.getElementById(PANEL_ID)) return;
        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.className = 'fmt3-panel fmt3-hidden';
        panel.innerHTML = `
          <div class="fmt3-panel-head">
            <div>
              <div class="fmt3-panel-title-row"><span>🧠</span><span class="fmt3-panel-title">Память фактов</span></div>
              <div id="fmt3_panel_subtitle" class="fmt3-panel-subline"></div>
              <div id="fmt3_panel_injection" class="fmt3-panel-injection"></div>
            </div>
            <button id="fmt3_panel_close" class="fmt3-icon-btn" title="Закрыть">×</button>
          </div>

          <div class="fmt3-panel-body">
            <div class="fmt3-panel-tools">
              <input id="fmt3_fact_search" type="search" placeholder="Поиск по фактам…">
              <select id="fmt3_fact_status"><option value="active">Активные</option><option value="conflict">Конфликты</option><option value="all">Все</option></select>
            </div>

            <select id="fmt3_fact_category" class="fmt3-hidden" aria-hidden="true">
              <option value="all">Все категории</option>
              ${Object.entries(CATEGORIES).map(([k,v]) => `<option value="${k}">${escapeHtml(v.label)}</option>`).join('')}
            </select>

            <div id="fmt3_category_strip" class="fmt3-category-strip">
              <button class="fmt3-category-pill" data-category="all" data-selected="true">Все</button>
              ${Object.entries(CATEGORIES).map(([k,v]) => `<button class="fmt3-category-pill" data-category="${k}" title="${escapeHtml(v.short)}">${escapeHtml(v.label.split(' ')[0])}</button>`).join('')}
            </div>

            <div class="fmt3-panel-divider"></div>
            <div id="fmt3_fact_grid" class="fmt3-fact-grid"></div>
          </div>

          <div class="fmt3-panel-footer">
            <button id="fmt3_panel_scan" class="fmt3-footer-scan">🔍 Скан</button>
            <button id="fmt3_panel_rescan" class="fmt3-footer-rescan">↻ Пакет</button>
            <button id="fmt3_panel_scanall" class="fmt3-footer-all">📚 Весь чат</button>
            <button id="fmt3_panel_export" title="Экспорт">⬇</button>
            <button id="fmt3_panel_import" title="Импорт">⬆</button>
            <button id="fmt3_panel_close_bottom" class="fmt3-footer-close">Закрыть</button>
          </div>`;
        document.body.appendChild(panel);

        panel.querySelector('#fmt3_panel_close').addEventListener('click', () => panel.classList.add('fmt3-hidden'));
        panel.querySelector('#fmt3_panel_close_bottom').addEventListener('click', () => panel.classList.add('fmt3-hidden'));
        panel.querySelector('#fmt3_fact_search').addEventListener('input', renderFactsGrid);
        panel.querySelector('#fmt3_fact_status').addEventListener('change', renderFactsGrid);
        panel.querySelector('#fmt3_fact_category').addEventListener('change', renderFactsGrid);
        panel.querySelector('#fmt3_category_strip').addEventListener('click', event => {
            const button = event.target.closest('button[data-category]');
            if (!button) return;
            const value = button.dataset.category || 'all';
            const select = panel.querySelector('#fmt3_fact_category');
            if (select) select.value = value;
            panel.querySelectorAll('.fmt3-category-pill').forEach(x => x.dataset.selected = String(x === button));
            renderFactsGrid();
        });
        panel.querySelector('#fmt3_fact_grid').addEventListener('click', handleFactGridClick);
        panel.querySelector('#fmt3_fact_grid').addEventListener('change', handleFactGridChange);
        panel.querySelector('#fmt3_panel_scan').addEventListener('click', () => scanPending({ manual: true }));
        panel.querySelector('#fmt3_panel_rescan').addEventListener('click', rescanRecent);
        panel.querySelector('#fmt3_panel_scanall').addEventListener('click', scanWholeChat);
        panel.querySelector('#fmt3_panel_export').addEventListener('click', exportMemory);
        panel.querySelector('#fmt3_panel_import').addEventListener('click', () => document.getElementById('fmt3_import_file')?.click());
    }

    function toggleMemoryPanel() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        panel.classList.toggle('fmt3-hidden');
        if (!panel.classList.contains('fmt3-hidden')) renderFactsGrid();
    }

    function setStatus(text, kind = '') {
        const el = document.getElementById('fmt3_connection_status');
        if (el) {
            el.textContent = text;
            el.dataset.kind = kind;
        }
    }

    function refreshConnectionProfilesUI() {
        const select = document.getElementById('fmt3_connection_profile');
        if (!select) return;
        const current = memoryProfile()?.connectionProfileId || '';
        let profiles = [];
        try { profiles = getSupportedConnectionProfiles(); } catch (_) { profiles = []; }
        select.innerHTML = '<option value="">— выбери Connection Profile —</option>' + profiles.map(p => {
            const id = connectionProfileId(p);
            return `<option value="${escapeHtml(id)}">${escapeHtml(connectionProfileLabel(p))}</option>`;
        }).join('');
        select.value = current;
        if (current && select.value !== current) {
            const opt = document.createElement('option');
            opt.value = current;
            opt.textContent = `⚠ Недоступен: ${current}`;
            select.appendChild(opt);
            select.value = current;
        }
    }

    function renderAll() {
        renderSettingsValues();
        renderFactsGrid();
        updateBubble();
        refreshInjection();
    }

    function renderSettingsValues() {
        const root = document.getElementById(SETTINGS_ID);
        if (!root) return;
        const g = globalSettings();
        const st = chatState();
        const p = memoryProfile();
        if (!g || !st || !p) return;

        const profileSelect = document.getElementById('fmt3_memory_profile');
        profileSelect.innerHTML = g.profiles.map(x => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}</option>`).join('');
        profileSelect.value = p.id;

        document.getElementById('fmt3_bind_scope').checked = g.scopeBindings[currentScopeKey()] === p.id;
        document.getElementById('fmt3_chat_binding').textContent = `Чат: ${ctx()?.chatId || 'не определён'} · профиль меняется автоматически вместе с чатом.`;
        const widgetEnabled = document.getElementById('fmt3_widget_enabled');
        const widgetScale = document.getElementById('fmt3_widget_scale');
        const widgetScaleValue = document.getElementById('fmt3_widget_scale_value');
        if (widgetEnabled) widgetEnabled.checked = g.widgetEnabled !== false;
        if (widgetScale) widgetScale.value = Number(g.widgetScale || 100);
        if (widgetScaleValue) widgetScaleValue.textContent = `${Number(g.widgetScale || 100)}%`;
        document.getElementById('fmt3_auto_scan').checked = !!p.autoScan;
        document.getElementById('fmt3_auto_every').value = p.autoScanEvery;
        document.getElementById('fmt3_batch_size').value = p.batchSize;
        document.getElementById('fmt3_overlap').value = p.overlap;
        document.getElementById('fmt3_max_tokens').value = p.maxOutputTokens;
        document.getElementById('fmt3_auto_marker').checked = !!p.autoMarker;
        document.getElementById('fmt3_inject_enabled').checked = !!p.injectEnabled;
        document.getElementById('fmt3_min_importance').value = p.minImportance;
        document.getElementById('fmt3_max_facts').value = p.maxInjectedFacts;
        document.getElementById('fmt3_injection_template').value = p.injectionTemplate;
        document.getElementById('fmt3_auto_flashback').checked = !!p.autoFlashback;
        document.getElementById('fmt3_flashback_chance').value = p.autoFlashbackChance;
        document.getElementById('fmt3_scanner_prompt').value = p.scannerPrompt;
        document.getElementById('fmt3_scan_state').textContent = `Последнее обработанное сообщение: ${st.lastScannedMessageIndex} / ${(ctx()?.chat || []).length - 1}${st.scanDirty ? ' · ⚠ история редактировалась, хвост будет пересканирован' : ''}`;
        refreshConnectionProfilesUI();
    }

    function updateBubble() {
        const g = globalSettings();
        const b = document.getElementById(BUBBLE_ID);
        if (!b) return;
        b.style.display = g?.widgetEnabled === false ? 'none' : '';
        b.style.setProperty('--fmt3-scale', `${Number(g?.widgetScale || 100) / 100}`);
        const count = chatState()?.facts?.filter(f => f.status === 'active' && f.enabled !== false).length || 0;
        const n = document.getElementById('fmt3_bubble_count');
        if (n) n.textContent = String(count);
    }

    function renderFactsGrid() {
        const grid = document.getElementById('fmt3_fact_grid');
        if (!grid) return;
        const st = chatState();
        if (!st) return;
        const search = String(document.getElementById('fmt3_fact_search')?.value || '').toLowerCase().trim();
        const category = document.getElementById('fmt3_fact_category')?.value || 'all';
        const status = document.getElementById('fmt3_fact_status')?.value || 'active';
        let facts = [...st.facts];
        facts = facts.filter(f => (category === 'all' || f.category === category) && (status === 'all' || f.status === status));
        if (search) facts = facts.filter(f => `${f.text} ${(f.subjects || []).join(' ')} ${(f.knownBy || []).join(' ')}`.toLowerCase().includes(search));
        facts.sort((a, b) => importanceRank(b.importance) - importanceRank(a.importance) || b.updatedAt - a.updatedAt);

        const subtitle = document.getElementById('fmt3_panel_subtitle');
        const activeCount = st.facts.filter(f => f.status === 'active' && f.enabled !== false).length;
        if (subtitle) subtitle.textContent = `${memoryProfile()?.name || ''} · ${st.facts.length} фактов · ${activeCount} активных`;

        const injectionLine = document.getElementById('fmt3_panel_injection');
        if (injectionLine) {
            const p = memoryProfile();
            const minRank = importanceRank(p?.minImportance || 'medium');
            const injected = st.facts.filter(f => f.status === 'active' && f.enabled !== false && importanceRank(f.importance) >= minRank).slice(0, Number(p?.maxInjectedFacts || 30)).length;
            injectionLine.dataset.on = String(!!p?.injectEnabled && injected > 0);
            injectionLine.textContent = p?.injectEnabled
                ? (injected ? `Инъекция активна · в промпт попадёт до ${injected} фактов` : 'Инъекция пуста — нет активных фактов выше порога')
                : 'Инъекция выключена';
        }

        if (!facts.length) {
            grid.innerHTML = '<div class="fmt3-empty">Нажмите 🔍 Скан — AI извлечёт важное из истории чата.</div>';
            return;
        }
        grid.innerHTML = facts.map(f => {
            const known = f.knownBy?.length ? f.knownBy.join(', ') : 'не установлено';
            const subjects = f.subjects?.length ? f.subjects.join(', ') : '—';
            return `<article class="fmt3-fact-card" data-id="${escapeHtml(f.id)}" data-status="${escapeHtml(f.status)}">
                <div class="fmt3-fact-top">
                  <span class="fmt3-cat">${escapeHtml(CATEGORIES[f.category]?.label || f.category)}</span>
                  <select class="fmt3-fact-importance" data-action="importance">
                    <option value="high" ${f.importance === 'high' ? 'selected' : ''}>High</option>
                    <option value="medium" ${f.importance === 'medium' ? 'selected' : ''}>Medium</option>
                    <option value="low" ${f.importance === 'low' ? 'selected' : ''}>Low</option>
                  </select>
                </div>
                <div class="fmt3-fact-text">${escapeHtml(f.text)}</div>
                <div class="fmt3-fact-meta">Знают: ${escapeHtml(known)}</div>
                <div class="fmt3-fact-meta">Участники: ${escapeHtml(subjects)}</div>
                ${f.status === 'conflict' ? `<div class="fmt3-conflict">⚠ Конфликтует с ${escapeHtml(f.contradicts || 'неизвестным фактом')}</div>` : ''}
                <div class="fmt3-fact-actions">
                  <button data-action="flashback" title="Флешбек">🌀</button>
                  <button data-action="edit" title="Редактировать">✏️</button>
                  <button data-action="knowledge" title="Кто знает">🧠</button>
                  <button data-action="toggle" title="Вкл/выкл">${f.enabled === false ? '○' : '●'}</button>
                  <button data-action="delete" title="Удалить">🗑</button>
                </div>
              </article>`;
        }).join('');
    }

    async function handleFactGridClick(event) {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const card = button.closest('.fmt3-fact-card');
        const id = card?.dataset.id;
        const st = chatState();
        const fact = st?.facts?.find(f => f.id === id);
        if (!fact) return;
        const action = button.dataset.action;

        if (action === 'delete') {
            if (!window.confirm('Удалить этот факт?')) return;
            st.facts = st.facts.filter(f => f.id !== id);
        } else if (action === 'toggle') {
            fact.enabled = fact.enabled === false;
            fact.updatedAt = Date.now();
        } else if (action === 'edit') {
            const value = window.prompt('Текст факта:', fact.text);
            if (value === null || !value.trim()) return;
            fact.revisions = Array.isArray(fact.revisions) ? fact.revisions : [];
            fact.revisions.push({ text: fact.text, updatedAt: fact.updatedAt });
            fact.text = value.trim();
            fact.updatedAt = Date.now();
        } else if (action === 'knowledge') {
            const value = window.prompt('Кто знает этот факт? Имена через запятую. Пусто = не установлено.', (fact.knownBy || []).join(', '));
            if (value === null) return;
            fact.knownBy = value.split(',').map(x => x.trim()).filter(Boolean);
            fact.updatedAt = Date.now();
        } else if (action === 'flashback') {
            st.pendingFlashbackFactId = fact.id;
            toast('success', 'Факт будет предложен как мягкий флешбек в следующем ответе.');
        }
        await saveChatState();
        renderAll();
    }

    async function handleFactGridChange(event) {
        const el = event.target;
        if (!el.matches('select[data-action="importance"]')) return;
        const id = el.closest('.fmt3-fact-card')?.dataset.id;
        const fact = chatState()?.facts?.find(f => f.id === id);
        if (!fact) return;
        fact.importance = normalizeImportance(el.value);
        fact.updatedAt = Date.now();
        await saveChatState();
        renderAll();
    }

    function bindSettingsEvents() {
        const byId = id => document.getElementById(id);

        byId('fmt3_widget_enabled')?.addEventListener('change', e => {
            const g = globalSettings();
            g.widgetEnabled = !!e.target.checked;
            saveGlobal();
            updateBubble();
        });
        byId('fmt3_widget_scale')?.addEventListener('input', e => {
            const g = globalSettings();
            g.widgetScale = Number(e.target.value || 100);
            const out = byId('fmt3_widget_scale_value');
            if (out) out.textContent = `${g.widgetScale}%`;
            saveGlobal();
            updateBubble();
        });

        byId('fmt3_memory_profile').addEventListener('change', async e => {
            const st = chatState();
            if (!st) return;
            st.memoryProfileId = e.target.value;
            const g = globalSettings();
            if (byId('fmt3_bind_scope').checked) g.scopeBindings[currentScopeKey()] = e.target.value;
            saveGlobal();
            await saveChatState();
            setStatus('', '');
            renderAll();
        });

        byId('fmt3_bind_scope').addEventListener('change', e => {
            const g = globalSettings();
            const p = memoryProfile();
            if (e.target.checked) g.scopeBindings[currentScopeKey()] = p.id;
            else if (g.scopeBindings[currentScopeKey()] === p.id) delete g.scopeBindings[currentScopeKey()];
            saveGlobal();
            renderSettingsValues();
        });

        byId('fmt3_profile_new').addEventListener('click', async () => {
            const name = window.prompt('Название нового профиля памяти:', 'Новый профиль');
            if (!name?.trim()) return;
            const g = globalSettings();
            const p = DEFAULT_PROFILE();
            p.name = name.trim();
            g.profiles.push(p);
            chatState().memoryProfileId = p.id;
            saveGlobal(); await saveChatState(); renderAll();
        });

        byId('fmt3_profile_clone').addEventListener('click', async () => {
            const src = memoryProfile();
            const g = globalSettings();
            const p = deepClone(src);
            p.id = cryptoRandomId('profile');
            p.name = `${src.name} — копия`;
            g.profiles.push(p);
            chatState().memoryProfileId = p.id;
            saveGlobal(); await saveChatState(); renderAll();
        });

        byId('fmt3_profile_delete').addEventListener('click', async () => {
            const g = globalSettings();
            const p = memoryProfile();
            if (g.profiles.length <= 1) return toast('warning', 'Нельзя удалить единственный профиль.');
            if (!window.confirm(`Удалить профиль «${p.name}»? Факты чата не удалятся.`)) return;
            g.profiles = g.profiles.filter(x => x.id !== p.id);
            if (g.defaultProfileId === p.id) g.defaultProfileId = g.profiles[0].id;
            for (const [k, v] of Object.entries(g.scopeBindings)) if (v === p.id) delete g.scopeBindings[k];
            chatState().memoryProfileId = g.defaultProfileId;
            saveGlobal(); await saveChatState(); renderAll();
        });

        byId('fmt3_connections_refresh').addEventListener('click', refreshConnectionProfilesUI);
        byId('fmt3_test_connection').addEventListener('click', testConnectionProfile);
        byId('fmt3_connection_profile').addEventListener('change', e => updateCurrentProfile('connectionProfileId', e.target.value));
        byId('fmt3_auto_scan').addEventListener('change', e => updateCurrentProfile('autoScan', e.target.checked));
        byId('fmt3_auto_every').addEventListener('change', e => updateCurrentProfile('autoScanEvery', Number(e.target.value)));
        byId('fmt3_batch_size').addEventListener('change', e => updateCurrentProfile('batchSize', Number(e.target.value)));
        byId('fmt3_overlap').addEventListener('change', e => updateCurrentProfile('overlap', Number(e.target.value)));
        byId('fmt3_max_tokens').addEventListener('change', e => updateCurrentProfile('maxOutputTokens', Number(e.target.value)));
        byId('fmt3_auto_marker').addEventListener('change', e => updateCurrentProfile('autoMarker', e.target.checked));
        byId('fmt3_inject_enabled').addEventListener('change', e => updateCurrentProfile('injectEnabled', e.target.checked, true));
        byId('fmt3_min_importance').addEventListener('change', e => updateCurrentProfile('minImportance', e.target.value, true));
        byId('fmt3_max_facts').addEventListener('change', e => updateCurrentProfile('maxInjectedFacts', Number(e.target.value), true));
        byId('fmt3_injection_template').addEventListener('change', e => updateCurrentProfile('injectionTemplate', e.target.value, true));
        byId('fmt3_auto_flashback').addEventListener('change', e => updateCurrentProfile('autoFlashback', e.target.checked));
        byId('fmt3_flashback_chance').addEventListener('change', e => updateCurrentProfile('autoFlashbackChance', Number(e.target.value)));
        byId('fmt3_scanner_prompt').addEventListener('change', e => updateCurrentProfile('scannerPrompt', e.target.value));

        byId('fmt3_scan_pending').addEventListener('click', () => scanPending({ manual: true }));
        byId('fmt3_rescan_recent').addEventListener('click', rescanRecent);
        byId('fmt3_scan_all').addEventListener('click', scanWholeChat);
        byId('fmt3_reset_cursor').addEventListener('click', resetScanCursor);
        byId('fmt3_open_memory').addEventListener('click', toggleMemoryPanel);
        byId('fmt3_export').addEventListener('click', exportMemory);
        byId('fmt3_import').addEventListener('click', () => byId('fmt3_import_file').click());
        byId('fmt3_import_file').addEventListener('change', importMemoryFile);
    }

    function updateCurrentProfile(key, value, updateInjection = false) {
        const p = memoryProfile();
        if (!p) return;
        p[key] = value;
        saveGlobal();
        if (updateInjection) refreshInjection();
        renderSettingsValues();
    }

    function exportMemory() {
        const payload = {
            format: 'FactsMemoryTracker-RP-v3',
            version: VERSION,
            chatId: ctx()?.chatId || '',
            profileName: memoryProfile()?.name || '',
            exportedAt: new Date().toISOString(),
            state: deepClone(chatState()),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fmt-memory-${String(ctx()?.chatId || 'chat').replace(/[^a-zа-я0-9_-]+/gi, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function importMemoryFile(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            const raw = JSON.parse(await file.text());
            const incoming = Array.isArray(raw) ? raw : (raw.state?.facts || raw.facts || []);
            if (!Array.isArray(incoming)) throw new Error('В файле не найден массив facts');
            const st = chatState();
            const existing = new Set(st.facts.map(f => factTextKey(f.text)));
            let added = 0;
            for (const item of incoming) {
                const fact = normalizeFact(item);
                if (!fact.text || existing.has(factTextKey(fact.text))) continue;
                st.facts.push(fact);
                existing.add(factTextKey(fact.text));
                added++;
            }
            await saveChatState();
            renderAll();
            toast('success', `Импортировано ${added} новых фактов.`);
        } catch (error) {
            toast('error', `Импорт не удался: ${deepestErrorMessage(error)}`);
        }
    }

    function initialRender() {
        renderSettingsHtml();
        renderBubble();
        renderMemoryPanelShell();
        chatState();
        refreshConnectionProfilesUI();
        renderAll();
    }

    async function init() {
        if (initialized) return;
        initialized = true;
        const c = ctx();
        if (!c) {
            console.error('[FMT3] SillyTavern context not available');
            return;
        }
        globalSettings();
        lastKnownChatIdentity = currentChatIdentity();
        installEvents();
        initialRender();
        refreshInjection();
        console.log('[FMT3] Facts Memory Tracker RP v3 initialized');
    }

    // SillyTavern loads third-party scripts after the page exists, but APP_READY is safer.
    const boot = () => window.setTimeout(init, 0);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
