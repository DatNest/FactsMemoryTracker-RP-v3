/*
 * Facts Memory Tracker RP v3 — clean-room rewrite.
 * Uses SillyTavern Connection Manager profiles directly and never switches
 * the globally active connection. Per-chat memory profile selection is stored
 * in chat metadata and therefore follows the chat automatically.
 */

(() => {
    'use strict';

    const MODULE = 'facts_memory_tracker_rp_v3';
    const VERSION = 5;
    const INJECTION_KEY = `${MODULE}_memory`;
    const PANEL_ID = 'fmt3_memory_panel';
    const SETTINGS_ID = 'fmt3_settings_root';
    const BUBBLE_ID = 'fmt3_bubble';
    const PROFILE_MEMORY_PREFIX = `${MODULE}:profile-memory:`;

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


    const DEFAULT_CURATION_PROMPT = `КАТЕГОРИЙНЫЙ АТОМАРНЫЙ РЕЖИМ ПАМЯТИ.

Память — не пересказ чата и не свалка «Событий». Сначала определи ТИП изменения, потом запиши один короткий атомарный факт в самую специфичную категорию.

БАЗОВЫЙ ПРИНЦИП:
— Лорбук, карточка персонажа и уже сохранённая память = baseline.
— Не дублируй baseline.
— Сохраняй только новую дельту сыгранной истории.
— Одна запись = одно утверждение / одно изменение / одна единица знания.
— Не склеивай несколько независимых нюансов в один абзац.
— text должен быть тезисным: обычно 6–18 слов, максимум одна короткая фраза.
— Если факт можно естественно разделить на два самостоятельных факта — раздели.

КАТЕГОРИИ И ИХ НАЗНАЧЕНИЕ:

characters — 👤 ПЕРСОНАЖИ
Только НОВЫЕ устойчивые факты о самом персонаже, которых не было в baseline: новая работа, навык, привычка, собственность, травма, статус, объективно установленная черта.
Не используй characters для уже известной биографии, которую персонаж просто рассказал другим.

secrets — 🔒 СЕКРЕТЫ
Объективная правда сюжета, которую знает сюжет/читатель, но не знают все персонажи. knownBy содержит только реально знающих.
Пример: «Кларк — человек в капюшоне.» knownBy=["Кларк"].
Если секрет раскрывается новому персонажу — UPDATE knownBy; при значимом самом раскрытии можно дополнительно создать knowledge.

flashbacks — 🌀 ПРОШЛОЕ
Факты о прошлом персонажей, которые стали известны в текущей истории. Здесь важно не только ЧТО было в прошлом, но и КТО теперь это знает.
Если Несс рассказывает Кларку важный эпизод своего прошлого — это flashbacks, а не characters и не events.

relationships — 🤝 ОТНОШЕНИЯ
Только устойчивое изменение связи между конкретными персонажами в хронологии: сближение, охлаждение, новый уровень доверия, конфликт, примирение, переход статуса отношений.
Не сохраняй мимолётное настроение как изменение отношений.

promises — 📌 ОБЕЩАНИЯ
Обещания, договорённости, границы, обязательства, условия и нарушенные обещания.
Каждое самостоятельное обязательство — отдельная запись.

knowledge — 🧠 ЛИЧНЫЕ ЗНАНИЯ
Кто что впервые узнал, от кого или каким способом, если это не относится точнее к flashbacks/secrets/promises/relationships.
Формулируй: «X узнал от Y, что...», «X увидел...», «X обнаружил...», «X услышал от Y...». 
Не сохраняй заново сам базовый факт.

threads — ⚠️ СЮЖЕТНЫЕ НИТИ
Незавершённые угрозы, цели, задачи, загадки, важные версии расследования, гипотезы и направления поиска.
Если гипотеза принадлежит конкретному персонажу — сохраняй автора точно.

 events — 📅 СОБЫТИЯ
Только значимое объективно произошедшее изменение мира, которое НЕ подходит ни в одну специализированную категорию выше.
EVENTS — ПОСЛЕДНИЙ ВАРИАНТ, а не категория по умолчанию.
Если запись подходит в relationships, promises, secrets, flashbacks, knowledge, threads или characters — запрещено класть её в events.

ПРИОРИТЕТ КАТЕГОРИЗАЦИИ:
1) promises
2) relationships
3) secrets
4) flashbacks
5) threads
6) knowledge
7) characters
8) events — только остаток

ПЕРЕДАЧА ЗНАНИЯ:
— Уже существующий лорный факт, впервые сообщённый другому персонажу, сохраняй как изменение знания, а не как повтор факта.
ПРАВИЛЬНО: «Несс узнала от Кларка, что он родом из Смолвилла.»
НЕПРАВИЛЬНО: «Кларк родом из Смолвилла.»
— Если речь о прошлом персонажа, предпочитай flashbacks.
— Если речь о скрытой объективной правде, предпочитай secrets + UPDATE knownBy.
— Не добавляй персонажа в knownBy просто потому, что он присутствовал в сцене.

ГИПОТЕЗЫ И АВТОРСТВО:
— Набор улик не превращает версию в факт.
— Если гипотезу прямо сформулировал Кларк, автором является Кларк, даже если данные принёс Джимми.
— Слушатели идут в knownBy, но не становятся авторами.
— Формулируй: «Кларк предположил...», «Джимми подозревает...», «Несс связала X с Y...». 
— Важная незавершённая гипотеза обычно category=threads.
— Если версия позже подтверждена/опровергнута — UPDATE существующую запись.

ПРИЧИННОСТЬ:
Не превращай последовательность событий в доказанную причинность.
Не используй «вызвало», «привело к», «из-за этого», «вынудило», если связь прямо не установлена текстом.
Разделяй наблюдаемый факт, гипотезу и прогноз на отдельные атомарные записи, если каждый из них стоит помнить.

АТОМАРНОСТЬ:
ПЛОХО: «Катер нашли пустым, Кларк связал это со скачками и предупредил о больницах.»
ХОРОШО:
— «Береговая охрана нашла катер Лесли пустым.» [events]
— «Кларк связал скачки напряжения с украденным модулем.» [threads]
— «Кларк предупредил о риске для больничной автоматики.» [threads]

Не объединяй два независимых долгосрочных факта только потому, что они появились в одном пакете.

ХРОНОЛОГИЯ:
Для каждого факта укажи inGameDate, inGameTime и location, если они прямо установлены или однозначно следуют из сцены.
Не выдумывай дату/время/место. Если неизвестно — пустая строка.
Если в сцене указаны дата/время/локация, используй их для всех относящихся к этой сцене фактов.

ЦЕННОСТЬ:
Перед сохранением спроси: «Если этот атомарный факт забыть через 30–50 сообщений, сломается ли непрерывность, знание персонажей, отношения, обязательство или сюжетная нить?» Если нет — не сохраняй.

ВАЖНОСТЬ:
HIGH — редко: крупный секрет, необратимый сдвиг отношений/статуса, центральная угроза, решение с долгими последствиями.
MEDIUM — нормальный уровень для большинства полезных фактов.
LOW — второстепенная, но потенциально полезная деталь.
Не ставь HIGH просто потому, что сцена драматичная или публичная.

РАБОТА С ПАМЯТЬЮ:
NEW — новое устойчивое атомарное знание/событие/состояние.
UPDATE — существующий факт существенно изменился, подтвердился, опровергнут или расширился knownBy.
DUPLICATE — смысл уже сохранён.
CONTRADICTS — новое сыгранное утверждение прямо противоречит памяти, и нельзя понять, что заменить.
Для UPDATE/DUPLICATE/CONTRADICTS укажи targetId.

Если новых значимых фактов нет — верни {"items":[]}.
Не заполняй лимит ради количества.

ПОРЯДОК ВЫВОДА:
Сначала специализированные категории и долгосрочно полезные атомарные факты. events используй только как fallback.`;

    const DEFAULT_MAX_NEW_ITEMS_NORMAL = 6;
    const DEFAULT_MAX_NEW_ITEMS_BACKFILL = 5;

    const LEGACY_INJECTION_TEMPLATE = `[ПАМЯТЬ СЫГРАННОЙ ИСТОРИИ]\nНиже находятся сохранённые факты, уже установленные в сыгранной истории. Используй их для непрерывности сюжета, персонажей, отношений и последствий прошлых событий.\n\n{{FACTS}}\n\nПРАВИЛА:\n— Факт истории НЕ является автоматически знанием каждого персонажа. Учитывай поле «знают».\n— Не раскрывай секреты персонажам только потому, что они находятся в памяти.\n— Не заставляй персонажей вспоминать факты без естественной причины.\n— Более новые явно сыгранные события имеют приоритет над устаревшими.\n— Не достраивай отсутствующие детали и не превращай догадки в факты.\n— Несс управляется пользователем: не придумывай за неё новые мысли, чувства, решения, согласие или действия.\n— Не упоминай существование этого блока памяти в ролевом ответе.\n[/ПАМЯТЬ СЫГРАННОЙ ИСТОРИИ]`;

    const DEFAULT_INJECTION_TEMPLATE = `[ПАМЯТЬ СЫГРАННОЙ ИСТОРИИ]

[АКТУАЛЬНОЕ СОСТОЯНИЕ — ИСТИНА НА СЕЙЧАС]
{{CURRENT}}

[РЕЛЕВАНТНАЯ ПАМЯТЬ — ПОДНЯТА ПО ТРИГГЕРАМ ТЕКУЩЕЙ СЦЕНЫ]
{{RELEVANT}}

[НЕДАВНИЕ ИЗМЕНЕНИЯ — БЛИЖНИЙ КОНТЕКСТ]
{{RECENT}}

ПРАВИЛА ИСПОЛЬЗОВАНИЯ:
— Блок «АКТУАЛЬНОЕ СОСТОЯНИЕ» имеет приоритет над историческим контекстом. Если прошлое описывает старое состояние, считай его контекстом того времени, а не текущей правдой.
— «РЕЛЕВАНТНАЯ ПАМЯТЬ» может содержать старые события и прежние версии состояний; учитывай их только как прошлый контекст.
— Факт истории НЕ является автоматически знанием каждого персонажа. Учитывай поле «знают».
— Не раскрывай секреты персонажам только потому, что они присутствуют в памяти.
— Не заставляй персонажей вспоминать старый факт без естественной связи с текущей сценой.
— Не достраивай отсутствующие детали и не превращай гипотезы в подтверждённые факты.
— Несс управляется пользователем: не придумывай за неё новые мысли, чувства, решения, согласие или действия.
— Не упоминай существование этого блока памяти в ролевом ответе.
[/ПАМЯТЬ СЫГРАННОЙ ИСТОРИИ]`;

    const DEFAULT_CURRENT_TOKEN_BUDGET = 700;
    const DEFAULT_RELEVANT_TOKEN_BUDGET = 700;
    const DEFAULT_RECENT_TOKEN_BUDGET = 300;
    const DEFAULT_RETRIEVAL_MESSAGE_COUNT = 4;

    const LIFECYCLE_SCANNER_NOTE = `СОСТОЯНИЕ ФАКТА ДЛЯ ЖИВОЙ ПАМЯТИ:
Для каждого NEW/UPDATE по возможности добавляй fact.state.
Допустимые значения зависят от категории:
— threads: open | resolved | abandoned
— promises: active | fulfilled | broken | cancelled
— relationships: current | historical
— characters: current | historical
— secrets: active | revealed | historical
— knowledge: current | historical
— events: historical
— flashbacks: historical
Если сомневаешься, используй естественный текущий статус: threads=open, promises=active, relationships=current, characters=current, secrets=active, knowledge=current, events/flashbacks=historical.
Когда прежнее текущее состояние заменяется новым, предпочитай UPDATE существующей записи. Старую версию расширение сохранит в revisions как исторический контекст.`;

    const DEFAULT_SCANNER_PROMPT = `Ты — сканер дельты ролевой истории. Следуй правилам курации выше и верни только структурированные атомарные изменения.

ИСТОЧНИКИ:
1) АКТИВНЫЙ ЛОРБУК — baseline, не дублировать.
2) СУЩЕСТВУЮЩАЯ ПАМЯТЬ — не дублировать; использовать ID для UPDATE/DUPLICATE/CONTRADICTS.
3) НОВЫЕ СООБЩЕНИЯ — единственный источник новых items.

КРИТИЧНО:
— Сначала выбери самую специфичную category, только потом формулируй text.
— events — fallback, а не категория по умолчанию.
— Одна запись = один семантический атом.
— text короткий: обычно 6–18 слов; не пиши абзацы и длинные сводки.
— Не склеивай несколько действий союзами «и / а затем / после чего», если их можно хранить отдельно.
— Для knownBy указывай только тех, кто действительно знает содержание.
— Для гипотез точно сохраняй автора.
— Для inGameDate/inGameTime/location используй только явно установленный или однозначный контекст сцены; иначе "".
— sourceIndexes должны указывать сообщения, где атомарный факт реально установлен.
— Не выводи markdown и пояснения.

Верни ТОЛЬКО валидный JSON:
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
        "inGameDate": "23 сентября",
        "inGameTime": "14:16",
        "location": "Daily Planet",
        "state": "open|active|current|historical|resolved|fulfilled|broken|cancelled|revealed|abandoned",
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
        maxNewItemsNormal: DEFAULT_MAX_NEW_ITEMS_NORMAL,
        maxNewItemsBackfill: DEFAULT_MAX_NEW_ITEMS_BACKFILL,
        promptSchemaVersion: 2,
        curationPrompt: DEFAULT_CURATION_PROMPT,
        injectEnabled: true,
        minImportance: 'medium',
        maxInjectedFacts: 30, // legacy compatibility; v3.2 uses token budgets below
        injectionSchemaVersion: 2,
        currentTokenBudget: DEFAULT_CURRENT_TOKEN_BUDGET,
        relevantTokenBudget: DEFAULT_RELEVANT_TOKEN_BUDGET,
        recentTokenBudget: DEFAULT_RECENT_TOKEN_BUDGET,
        retrievalMessageCount: DEFAULT_RETRIEVAL_MESSAGE_COUNT,
        autoMarker: false,
        autoFlashback: false,
        autoFlashbackChance: 0,
        scannerPrompt: DEFAULT_SCANNER_PROMPT,
        injectionTemplate: DEFAULT_INJECTION_TEMPLATE,
        // Persistent memory belongs to the MEMORY PROFILE, not to a chat.
        facts: [],
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
    let selectedFactIds = new Set();

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
        for (const profile of s.profiles) normalizeProfile(profile);
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
            // Legacy <= 3.0.5 storage. Live memory is profile-scoped now.
            facts: [],
            legacyFactsMigratedToProfile: false,
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
        if (!Array.isArray(state.facts)) state.facts = []; // legacy <= 3.0.5 only
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
        const profile = g.profiles.find(p => p.id === st.memoryProfileId)
            || g.profiles.find(p => p.id === g.defaultProfileId)
            || g.profiles[0];
        return profile ? normalizeProfile(profile) : null;
    }

    function normalizeProfile(profile) {
        const previousPromptSchemaVersion = Number(profile?.promptSchemaVersion || 0);
        const previousInjectionSchemaVersion = Number(profile?.injectionSchemaVersion || 0);
        const previousInjectionTemplate = String(profile?.injectionTemplate || '');
        const normalized = mergeDefaults(profile, DEFAULT_PROFILE());
        if (previousPromptSchemaVersion < 2) {
            normalized.curationPrompt = DEFAULT_CURATION_PROMPT;
            normalized.scannerPrompt = DEFAULT_SCANNER_PROMPT;
            normalized.maxNewItemsNormal = DEFAULT_MAX_NEW_ITEMS_NORMAL;
            normalized.maxNewItemsBackfill = DEFAULT_MAX_NEW_ITEMS_BACKFILL;
            normalized.promptSchemaVersion = 2;
        }
        if (previousInjectionSchemaVersion < 2) {
            normalized.currentTokenBudget = DEFAULT_CURRENT_TOKEN_BUDGET;
            normalized.relevantTokenBudget = DEFAULT_RELEVANT_TOKEN_BUDGET;
            normalized.recentTokenBudget = DEFAULT_RECENT_TOKEN_BUDGET;
            normalized.retrievalMessageCount = DEFAULT_RETRIEVAL_MESSAGE_COUNT;
            if (!previousInjectionTemplate || previousInjectionTemplate === LEGACY_INJECTION_TEMPLATE || previousInjectionTemplate.includes('{{FACTS}}')) {
                normalized.injectionTemplate = DEFAULT_INJECTION_TEMPLATE;
            }
            normalized.injectionSchemaVersion = 2;
        }
        if (!Array.isArray(normalized.facts)) normalized.facts = [];
        return normalized;
    }

    function profileFacts() {
        const profile = memoryProfile();
        if (!profile) return [];
        if (!Array.isArray(profile.facts)) profile.facts = [];
        return profile.facts;
    }

    function profileMemoryKey(profileId) {
        return `${PROFILE_MEMORY_PREFIX}${profileId}`;
    }

    function localForageStore() {
        return window.SillyTavern?.libs?.localforage || null;
    }

    function localStorageBackupKey(profileId) {
        return `${profileMemoryKey(profileId)}:backup`;
    }

    async function loadProfileMemory(profile) {
        if (!profile?.id) return [];
        normalizeProfile(profile);
        let stored = null;

        const store = localForageStore();
        if (store?.getItem) {
            try {
                stored = await store.getItem(profileMemoryKey(profile.id));
            } catch (error) {
                console.warn('[FMT3] Could not read profile memory from localforage', error);
            }
        }

        if (!Array.isArray(stored)) {
            try {
                const backup = window.localStorage?.getItem(localStorageBackupKey(profile.id));
                if (backup) {
                    const parsed = JSON.parse(backup);
                    if (Array.isArray(parsed)) stored = parsed;
                }
            } catch (error) {
                console.warn('[FMT3] Could not read profile memory backup', error);
            }
        }

        if (Array.isArray(stored)) {
            profile.facts = stored.map(f => normalizeFact(f));
            return profile.facts;
        }

        // First run after migration: seed durable storage from legacy settings data.
        profile.facts = Array.isArray(profile.facts) ? profile.facts.map(f => normalizeFact(f)) : [];
        if (profile.facts.length) await persistProfileMemory(profile);
        return profile.facts;
    }

    async function persistProfileMemory(profile) {
        if (!profile?.id) return;
        normalizeProfile(profile);
        profile.updatedAt = Date.now();
        const snapshot = deepClone(profile.facts || []);

        // Keep a mirror in extension settings for backwards compatibility/export.
        profile.facts = snapshot;
        saveGlobal();

        const store = localForageStore();
        if (store?.setItem) {
            try {
                await store.setItem(profileMemoryKey(profile.id), snapshot);
            } catch (error) {
                console.error('[FMT3] Could not persist profile memory to localforage', error);
            }
        }

        // Small emergency backup. Ignore quota failures; IndexedDB/localforage remains primary.
        try {
            window.localStorage?.setItem(localStorageBackupKey(profile.id), JSON.stringify(snapshot));
        } catch (_) { /* quota or privacy mode */ }
    }

    async function removePersistedProfileMemory(profileId) {
        if (!profileId) return;
        const store = localForageStore();
        if (store?.removeItem) {
            try { await store.removeItem(profileMemoryKey(profileId)); } catch (_) { /* noop */ }
        }
        try { window.localStorage?.removeItem(localStorageBackupKey(profileId)); } catch (_) { /* noop */ }
    }

    function saveProfileMemory() {
        const profile = memoryProfile();
        if (!profile) return Promise.resolve();
        return persistProfileMemory(profile);
    }

    async function migrateLegacyChatFactsToProfileIfSafe() {
        const st = chatState();
        const profile = memoryProfile();
        if (!st || !profile || st.legacyFactsMigratedToProfile) return;
        const legacy = Array.isArray(st.facts) ? st.facts : [];
        // Conservative migration: only seed an EMPTY selected profile from this chat.
        // Never merge a legacy chat into an already populated profile.
        if (legacy.length && profile.facts.length === 0) {
            profile.facts = legacy.map(f => normalizeFact(f));
            await saveProfileMemory();
        }
        st.legacyFactsMigratedToProfile = true;
        await saveChatState();
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

    function normalizeShortText(value, max = 120) {
        return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
    }

    function normalizeFactText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 260);
    }

    function defaultFactState(category) {
        const map = {
            characters: 'current',
            events: 'historical',
            secrets: 'active',
            flashbacks: 'historical',
            relationships: 'current',
            promises: 'active',
            knowledge: 'current',
            threads: 'open',
        };
        return map[normalizeCategory(category)] || 'current';
    }

    function normalizeFactState(category, value) {
        const cat = normalizeCategory(category);
        const v = String(value || '').toLowerCase().trim();
        const allowed = {
            characters: ['current', 'historical'],
            events: ['historical'],
            secrets: ['active', 'revealed', 'historical'],
            flashbacks: ['historical'],
            relationships: ['current', 'historical'],
            promises: ['active', 'fulfilled', 'broken', 'cancelled'],
            knowledge: ['current', 'historical'],
            threads: ['open', 'resolved', 'abandoned'],
        };
        return allowed[cat]?.includes(v) ? v : defaultFactState(cat);
    }

    function normalizeFact(raw = {}, sourceFallback = []) {
        const now = Date.now();
        return {
            id: raw.id || cryptoRandomId('fact'),
            text: normalizeFactText(raw.text),
            category: normalizeCategory(raw.category),
            importance: normalizeImportance(raw.importance),
            subjects: normalizeStringArray(raw.subjects),
            knownBy: normalizeStringArray(raw.knownBy),
            confidence: Number.isFinite(Number(raw.confidence)) ? Math.max(0, Math.min(1, Number(raw.confidence))) : 1,
            inGameDate: normalizeShortText(raw.inGameDate || raw.gameDate || '', 80),
            inGameTime: normalizeShortText(raw.inGameTime || raw.gameTime || '', 40),
            location: normalizeShortText(raw.location || '', 140),
            state: normalizeFactState(raw.category, raw.state),
            sourceChatIds: normalizeStringArray(raw.sourceChatIds || (raw.sourceChatId ? [raw.sourceChatId] : [])),
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
        return profileFacts().filter(f => f.status === 'active' && f.enabled !== false);
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
            const when = [f.inGameDate, f.inGameTime].filter(Boolean).join(' '); const where = f.location ? ` @ ${f.location}` : ''; return `${f.id} | ${f.category} | ${f.importance} | state=${f.state || defaultFactState(f.category)} | ${when}${where} | знают: ${known} | ${f.text}`;
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

    async function scanChunk(start, end, { updateCursor = true, quiet = false, backfill = false } = {}) {
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
        const normalNewLimit = Math.max(0, Math.min(20, Number(profile.maxNewItemsNormal ?? DEFAULT_MAX_NEW_ITEMS_NORMAL)));
        const backfillNewLimit = Math.max(0, Math.min(20, Number(profile.maxNewItemsBackfill ?? DEFAULT_MAX_NEW_ITEMS_BACKFILL)));
        const modeNote = backfill
            ? `РЕЖИМ: BACKFILL / ВЕСЬ ЧАТ. Это ретроспективное заполнение памяти. Максимум ${backfillNewLimit} действительно долговечных NEW-фактов на этот пакет. Не делай сводку: сохраняй отдельные атомарные изменения по правильным категориям.`
            : `РЕЖИМ: ИНКРЕМЕНТАЛЬНЫЙ. Максимум ${normalNewLimit} действительно долговечных NEW-фактов на этот пакет. Сохраняй атомарно и по специализированным категориям; нормальный результат может быть 0–4.`;
        const userPrompt = `${modeNote}\n\nАКТИВНЫЙ ЛОРБУК / БАЗОВЫЕ ФАКТЫ (REFERENCE ONLY; НЕ СОХРАНЯЙ ИХ ПОВТОРНО):\n${loreReference}\n\nСУЩЕСТВУЮЩАЯ ПАМЯТЬ (ID нужны для UPDATE/DUPLICATE/CONTRADICTS):\n${formatExistingFactsForScanner()}\n\nНОВЫЕ СООБЩЕНИЯ ДЛЯ СКАНА (${start}–${end}):\n${transcript}`;
        const scannerSystemPrompt = `${profile.curationPrompt || DEFAULT_CURATION_PROMPT}\n\n${profile.scannerPrompt || DEFAULT_SCANNER_PROMPT}\n\n${LIFECYCLE_SCANNER_NOTE}`;
        let raw;
        try {
            raw = await callProfile([
                { role: 'system', content: scannerSystemPrompt },
                { role: 'user', content: userPrompt },
            ], profile.maxOutputTokens || 4096, { response_format: { type: 'json_object' } });
        } catch (error) {
            // Some providers/models do not support response_format. Retry once without it.
            const msg = deepestErrorMessage(error).toLowerCase();
            const looksLikeFormatSupport = msg.includes('response_format') || msg.includes('structured') || msg.includes('json_object') || msg.includes('unsupported');
            if (!looksLikeFormatSupport) throw error;
            raw = await callProfile([
                { role: 'system', content: scannerSystemPrompt },
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
        const result = applyScannerItems(items, Array.from({ length: Math.max(0, end - start + 1) }, (_, n) => start + n), { newLimit: backfill ? backfillNewLimit : normalNewLimit });
        if (result.added || result.updated || result.conflicts) await saveProfileMemory();

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

    function applyScannerItems(items, sourceFallback, { newLimit = DEFAULT_MAX_NEW_ITEMS_NORMAL } = {}) {
        const facts = profileFacts();
        const byId = new Map(facts.map(f => [f.id, f]));
        let added = 0, updated = 0, conflicts = 0;
        let acceptedNew = 0;

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
                    inGameDate: target.inGameDate,
                    inGameTime: target.inGameTime,
                    location: target.location,
                    state: target.state,
                    sourceChatIds: target.sourceChatIds,
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
                target.inGameDate = next.inGameDate || target.inGameDate || '';
                target.inGameTime = next.inGameTime || target.inGameTime || '';
                target.location = next.location || target.location || '';
                target.state = Object.prototype.hasOwnProperty.call(rawFact, 'state')
                    ? normalizeFactState(next.category, rawFact.state)
                    : (previous.category !== next.category ? defaultFactState(next.category) : (target.state || defaultFactState(next.category)));
                target.sourceChatIds = [...new Set([...(target.sourceChatIds || []), ...normalizeStringArray(next.sourceChatIds || []), currentChatIdentity()])];
                target.sourceMessageIndexes = [...new Set([...(target.sourceMessageIndexes || []), ...(next.sourceMessageIndexes || [])])];
                target.status = 'active';
                target.enabled = true;
                target.updatedAt = Date.now();
                updated++;
                continue;
            }

            if (action === 'CONTRADICTS') {
                const f = normalizeFact(rawFact, sourceFallback);
                f.sourceChatIds = [...new Set([...(f.sourceChatIds || []), currentChatIdentity()])];
                f.status = 'conflict';
                f.enabled = false;
                f.contradicts = targetId;
                facts.push(f);
                byId.set(f.id, f);
                conflicts++;
                continue;
            }

            const candidate = normalizeFact(rawFact, sourceFallback);
            candidate.sourceChatIds = [...new Set([...(candidate.sourceChatIds || []), currentChatIdentity()])];
            const exact = facts.find(f => factTextKey(f.text) === factTextKey(candidate.text) && f.status === 'active');
            if (exact) continue;
            if (acceptedNew >= Math.max(0, Number(newLimit) || 0)) continue;
            facts.push(candidate);
            byId.set(candidate.id, candidate);
            added++;
            acceptedNew++;
        }
        return { added, updated, conflicts };
    }

    async function scanPending({ manual = true, backfill = false } = {}) {
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
                const r = await scanChunk(cursor, end, { updateCursor: true, quiet: true, backfill });
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
        await scanPending({ manual: true, backfill: true });
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

    const MEMORY_STOPWORDS = new Set(`и а но или что это как для при на в во с со к ко от до из у по за над под о об про не ни же бы был была были есть его ее её их он она они мы вы ты я мне тебе ему ей нам вам им этот эта эти того уже еще ещё только когда где кто чем который которая которые потому поэтому тут там сюда туда после перед между через если то ли да нет очень просто потом сейчас сегодня вчера завтра снова опять также такой такая такие свой свою свои себя себе чтобы либо`.split(/\s+/));

    function approxTokenCount(text) {
        const value = String(text || '');
        return value ? Math.max(1, Math.ceil(value.length / 3.2)) : 0;
    }

    function lexicalUnits(text) {
        const words = String(text || '').toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) || [];
        const out = new Set();
        for (const raw of words) {
            const w = raw.replace(/^[-_]+|[-_]+$/g, '');
            if (!w || MEMORY_STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
            out.add(w);
            // Very light prefix matching makes Russian inflections less brittle without a stemmer.
            if (w.length >= 6) out.add(`~${w.slice(0, 5)}`);
        }
        return out;
    }

    function recentSceneText(messageCount) {
        const chat = ctx()?.chat || [];
        const n = Math.max(1, Math.min(12, Number(messageCount || DEFAULT_RETRIEVAL_MESSAGE_COUNT)));
        return chat.slice(-n).map(m => `${m?.name || ''}: ${String(m?.mes || '')}`).join('\n');
    }

    function factNewestMessageIndex(f) {
        const list = Array.isArray(f?.sourceMessageIndexes) ? f.sourceMessageIndexes.filter(Number.isInteger) : [];
        return list.length ? Math.max(...list) : -1;
    }

    function formatMemoryFactLine(f, { historical = false } = {}) {
        const known = f.knownBy?.length ? f.knownBy.join(', ') : 'не установлено';
        const when = [f.inGameDate, f.inGameTime].filter(Boolean).join(' ');
        const where = f.location ? ` @ ${f.location}` : '';
        const stamp = when || where ? `[${when}${where}]` : '';
        const state = f.state ? `[${f.state}]` : '';
        const history = historical ? '[РАНЬШЕ]' : '';
        return `- ${history}[${CATEGORIES[f.category]?.short || f.category}]${state}${stamp}[знают: ${known}] ${f.text}`;
    }

    function isCurrentStateFact(f) {
        if (!f || f.status !== 'active' || f.enabled === false) return false;
        const state = f.state || defaultFactState(f.category);
        switch (f.category) {
            case 'threads': return state === 'open';
            case 'promises': return state === 'active';
            case 'relationships': return state === 'current';
            case 'secrets': return state === 'active';
            case 'characters': return state === 'current';
            default: return false;
        }
    }

    function buildHistoricalRevisionCandidates(facts) {
        const out = [];
        for (const f of facts) {
            const revisions = Array.isArray(f.revisions) ? f.revisions : [];
            revisions.forEach((rev, i) => {
                if (!rev?.text) return;
                out.push({
                    ...f,
                    ...rev,
                    id: `${f.id}:revision:${i}`,
                    parentFactId: f.id,
                    state: rev.state || 'historical',
                    isRevision: true,
                    status: 'active',
                    enabled: true,
                });
            });
        }
        return out;
    }

    function relevanceScore(f, queryText, queryUnits) {
        if (!f?.text) return -Infinity;
        const factText = `${f.text} ${(f.subjects || []).join(' ')} ${(f.knownBy || []).join(' ')} ${f.location || ''}`;
        const factUnits = lexicalUnits(factText);
        let score = 0;
        for (const u of factUnits) if (queryUnits.has(u)) score += u.startsWith('~') ? 0.8 : 1.2;

        const queryLower = String(queryText || '').toLowerCase();
        for (const subject of f.subjects || []) {
            const name = String(subject || '').toLowerCase().trim();
            if (name && queryLower.includes(name)) score += 7;
            else for (const u of lexicalUnits(name)) if (queryUnits.has(u)) score += 2.2;
        }
        for (const knower of f.knownBy || []) {
            const name = String(knower || '').toLowerCase().trim();
            if (name && queryLower.includes(name)) score += 1.5;
        }
        for (const u of lexicalUnits(f.location || '')) if (queryUnits.has(u)) score += 1.2;

        if (f.category === 'threads' && (f.state || 'open') === 'open') score += 1.2;
        if (f.category === 'promises' && (f.state || 'active') === 'active') score += 1;
        if (f.category === 'secrets') score += 0.8;
        if (f.importance === 'high') score += 1;
        else if (f.importance === 'medium') score += 0.35;
        if (f.isRevision) score -= 1.2;
        if ((f.sourceChatIds || []).includes(currentChatIdentity())) score += 0.4;
        return score;
    }

    function takeWithinTokenBudget(candidates, budget, formatter) {
        const limit = Math.max(0, Number(budget || 0));
        const items = [];
        const lines = [];
        let tokens = 0;
        if (!limit) return { items, text: '- (не выбрано)', tokens };
        for (const item of candidates) {
            const line = formatter(item);
            const cost = approxTokenCount(line);
            if (tokens + cost > limit) continue;
            items.push(item);
            lines.push(line);
            tokens += cost;
        }
        return { items, text: lines.length ? lines.join('\n') : '- (нет подходящих фактов)', tokens };
    }

    function buildMemoryPlan() {
        const p = memoryProfile();
        const facts = profileFacts().filter(f => f.status === 'active' && f.enabled !== false);
        if (!p) {
            const empty = { items: [], text: '- (нет)', tokens: 0 };
            return { current: empty, relevant: empty, recent: empty, totalTokens: 0 };
        }
        const minRank = importanceRank(p.minImportance || 'medium');
        const eligible = facts.filter(f => importanceRank(f.importance) >= minRank);

        // Current truth is small and always-on: open threads, active promises/secrets,
        // current relationship states and current durable character-state facts.
        const categoryPriority = { promises: 0, secrets: 1, threads: 2, relationships: 3, characters: 4 };
        const currentCandidates = eligible
            .filter(isCurrentStateFact)
            .sort((a, b) => (categoryPriority[a.category] ?? 9) - (categoryPriority[b.category] ?? 9)
                || importanceRank(b.importance) - importanceRank(a.importance)
                || factNewestMessageIndex(b) - factNewestMessageIndex(a)
                || b.updatedAt - a.updatedAt);
        const current = takeWithinTokenBudget(currentCandidates, p.currentTokenBudget, f => formatMemoryFactLine(f));
        const usedIds = new Set(current.items.map(f => f.id));

        // Recent context is strictly from the currently open chat, not every chat sharing the profile.
        const currentChat = currentChatIdentity();
        const recentCandidates = eligible
            .filter(f => !usedIds.has(f.id) && (f.sourceChatIds || []).includes(currentChat))
            .sort((a, b) => factNewestMessageIndex(b) - factNewestMessageIndex(a) || b.updatedAt - a.updatedAt);
        const recent = takeWithinTokenBudget(recentCandidates, p.recentTokenBudget, f => formatMemoryFactLine(f));
        recent.items.forEach(f => usedIds.add(f.id));

        // Relevant old memory is retrieved locally from the last few RP messages.
        const queryText = recentSceneText(p.retrievalMessageCount);
        const queryUnits = lexicalUnits(queryText);
        const temporalCue = /(помн|раньше|тогда|прошл|вчера|когда-то|впервые)/iu.test(queryText);
        const history = buildHistoricalRevisionCandidates(eligible);
        const relevantCandidates = [...eligible, ...history]
            .filter(f => !usedIds.has(f.id))
            .map(f => ({ f, score: relevanceScore(f, queryText, queryUnits) }))
            .filter(x => x.score >= (temporalCue ? 1.8 : 2.6))
            .sort((a, b) => b.score - a.score
                || factNewestMessageIndex(b.f) - factNewestMessageIndex(a.f)
                || b.f.updatedAt - a.f.updatedAt)
            .map(x => x.f);
        const relevant = takeWithinTokenBudget(relevantCandidates, p.relevantTokenBudget, f => formatMemoryFactLine(f, { historical: !!f.isRevision || !isCurrentStateFact(f) }));

        return {
            current,
            relevant,
            recent,
            queryText,
            totalTokens: current.tokens + relevant.tokens + recent.tokens,
        };
    }

    function buildInjection() {
        const p = memoryProfile();
        const st = chatState();
        if (!p?.injectEnabled || !st) return '';
        const plan = buildMemoryPlan();
        let template = String(p.injectionTemplate || DEFAULT_INJECTION_TEMPLATE);
        if (template.includes('{{FACTS}}') && !template.includes('{{CURRENT}}')) {
            template = template.replace('{{FACTS}}', `[АКТУАЛЬНОЕ СОСТОЯНИЕ]\n${plan.current.text}\n\n[РЕЛЕВАНТНАЯ ПАМЯТЬ]\n${plan.relevant.text}\n\n[НЕДАВНИЕ ИЗМЕНЕНИЯ]\n${plan.recent.text}`);
        } else {
            template = template
                .replaceAll('{{CURRENT}}', plan.current.text)
                .replaceAll('{{RELEVANT}}', plan.relevant.text)
                .replaceAll('{{RECENT}}', plan.recent.text);
        }
        let injection = template;
        if (st.pendingFlashbackFactId) {
            const f = profileFacts().find(x => x.id === st.pendingFlashbackFactId);
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
        const facts = profileFacts();
        let match;
        let added = 0;
        while ((match = regex.exec(raw))) {
            const text = String(match[1] || '').trim();
            if (!text) continue;
            if (facts.some(f => factTextKey(f.text) === factTextKey(text))) continue;
            facts.push(normalizeFact({
                text,
                category: normalizeCategory(match[2]),
                importance: 'medium',
                confidence: 1,
                sourceIndexes: [(ctx()?.chat || []).length - 1],
                sourceChatIds: [currentChatIdentity()],
            }));
            added++;
        }
        if (added) {
            saveProfileMemory().catch(error => console.error('[FMT3] Failed to persist marker facts', error));
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
            refreshInjection();
            await maybeAutoFlashback();
        });
        if (et.GENERATION_STARTED) es.on(et.GENERATION_STARTED, () => {
            // Rebuild trigger-based retrieval against the latest user message immediately before generation.
            refreshInjection();
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
        selectedFactIds.clear();
        chatState();
        await loadProfileMemory(memoryProfile());
        await migrateLegacyChatFactsToProfileIfSafe();
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
                <div class="fmt3-grid2">
                  <label>Макс. NEW / пакет<input id="fmt3_max_new_normal" type="number" min="0" max="20"></label>
                  <label>Макс. NEW / весь чат<input id="fmt3_max_new_backfill" type="number" min="0" max="20"></label>
                </div>
                <div class="fmt3-hint">Эти лимиты и правила курации ниже можно менять без обновления файлов расширения.</div>
                <div class="fmt3-row fmt3-wrap">
                  <button id="fmt3_rescan_recent" class="menu_button">↻ Последний пакет</button>
                  <button id="fmt3_reset_cursor" class="menu_button">Сброс курсора</button>
                </div>
                <div id="fmt3_scan_state" class="fmt3-hint"></div>
              </div>
            </details>

            <details class="fmt3-section">
              <summary class="fmt3-section-title">💉 ИНЪЕКЦИЯ / УМНАЯ ПАМЯТЬ</summary>
              <div class="fmt3-section-body">
                <div class="fmt3-grid2">
                  <label>Важность ≥
                    <select id="fmt3_min_importance"><option value="high">High</option><option value="medium">Medium+</option><option value="low">Все</option></select>
                  </label>
                  <label>Сообщений для триггеров<input id="fmt3_retrieval_messages" type="number" min="1" max="12"></label>
                </div>
                <div class="fmt3-grid4">
                  <label>Актуальное, ток.<input id="fmt3_current_tokens" type="number" min="0" max="4000" step="50"></label>
                  <label>Релевантное, ток.<input id="fmt3_relevant_tokens" type="number" min="0" max="6000" step="50"></label>
                  <label>Недавнее, ток.<input id="fmt3_recent_tokens" type="number" min="0" max="3000" step="50"></label>
                  <label>Итого ориентир<input id="fmt3_total_memory_tokens" type="text" readonly></label>
                </div>
                <div class="fmt3-hint">Каждый ход всегда получает компактное актуальное состояние; старые факты поднимаются локально по именам и темам последних сообщений; ещё небольшой бюджет отводится самым свежим изменениям. Дополнительный AI-запрос для retrieval не используется.</div>
                <details class="fmt3-advanced"><summary>Шаблон {{CURRENT}} / {{RELEVANT}} / {{RECENT}}</summary><textarea id="fmt3_injection_template" rows="16"></textarea></details>
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
              <summary class="fmt3-section-title">🎛 ПРАВИЛА КУРАЦИИ</summary>
              <div class="fmt3-section-body">
                <div class="fmt3-hint">Это главный поведенческий промпт памяти. Будущую точность, причинность, важность и правила гипотез правь здесь — без замены файлов.</div>
                <textarea id="fmt3_curation_prompt" rows="18"></textarea>
                <div class="fmt3-row"><button id="fmt3_reset_curation_prompt" class="menu_button">↺ Сбросить правила по умолчанию</button></div>
              </div>
            </details>

            <details class="fmt3-section fmt3-advanced">
              <summary class="fmt3-section-title">🧠 ПРОМПТ СКАНЕРА / ФОРМАТ</summary>
              <div class="fmt3-section-body">
                <div class="fmt3-hint">Здесь задача извлечения и JSON-схема. Обычно менять не нужно.</div>
                <textarea id="fmt3_scanner_prompt" rows="15"></textarea>
                <div class="fmt3-row"><button id="fmt3_reset_scanner_prompt" class="menu_button">↺ Сбросить промпт сканера</button></div>
              </div>
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
              <select id="fmt3_fact_scope" title="Какие записи показывать"><option value="chat">Этот чат</option><option value="profile">Весь профиль</option></select>
              <select id="fmt3_view_mode" title="Вид памяти"><option value="categories">По разделам</option><option value="chronology">Хронология</option></select>
            </div>

            <select id="fmt3_fact_category" class="fmt3-hidden" aria-hidden="true">
              <option value="all">Все категории</option>
              ${Object.entries(CATEGORIES).map(([k,v]) => `<option value="${k}">${escapeHtml(v.label)}</option>`).join('')}
            </select>

            <div id="fmt3_category_strip" class="fmt3-category-strip">
              <button class="fmt3-category-pill" data-category="all" data-selected="true">Все</button>
              ${Object.entries(CATEGORIES).map(([k,v]) => `<button class="fmt3-category-pill" data-category="${k}" title="${escapeHtml(v.short)}">${escapeHtml(v.label.split(' ')[0])}</button>`).join('')}
            </div>

            <div id="fmt3_bulk_bar" class="fmt3-bulk-bar">
              <div class="fmt3-bulk-select">
                <button id="fmt3_bulk_select_all" type="button">☑ Всё профиля</button>
                <button id="fmt3_bulk_clear" type="button">Снять</button>
                <span id="fmt3_bulk_count">0 выбрано</span>
              </div>
              <div id="fmt3_bulk_actions" class="fmt3-bulk-actions">
                <select id="fmt3_bulk_importance" title="Изменить важность выбранных">
                  <option value="">Важность…</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                </select>
                <select id="fmt3_bulk_category" title="Изменить категорию выбранных">
                  <option value="">Категория…</option>
                  ${Object.entries(CATEGORIES).map(([k,v]) => `<option value="${k}">${escapeHtml(v.label)}</option>`).join('')}
                </select>
                <button id="fmt3_bulk_enable" type="button" title="Включить выбранные">● Вкл</button>
                <button id="fmt3_bulk_disable" type="button" title="Выключить выбранные">○ Выкл</button>
                <button id="fmt3_bulk_delete" type="button" class="fmt3-bulk-danger" title="Удалить выбранные">🗑 Удалить</button>
              </div>
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
        panel.querySelector('#fmt3_fact_scope').addEventListener('change', renderFactsGrid);
        panel.querySelector('#fmt3_view_mode').addEventListener('change', renderFactsGrid);
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
        panel.querySelector('#fmt3_bulk_select_all').addEventListener('click', bulkSelectAllProfile);
        panel.querySelector('#fmt3_bulk_clear').addEventListener('click', bulkClearSelection);
        panel.querySelector('#fmt3_bulk_enable').addEventListener('click', () => bulkSetEnabled(true));
        panel.querySelector('#fmt3_bulk_disable').addEventListener('click', () => bulkSetEnabled(false));
        panel.querySelector('#fmt3_bulk_delete').addEventListener('click', bulkDeleteSelected);
        panel.querySelector('#fmt3_bulk_importance').addEventListener('change', event => bulkSetImportance(event.target.value));
        panel.querySelector('#fmt3_bulk_category').addEventListener('change', event => bulkSetCategory(event.target.value));
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
        document.getElementById('fmt3_chat_binding').textContent = `Чат: ${ctx()?.chatId || 'не определён'} · память хранится в профиле «${p.name}» (${profileFacts().length} фактов). Чаты с этим профилем используют эту же память.`;
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
        document.getElementById('fmt3_max_new_normal').value = p.maxNewItemsNormal ?? DEFAULT_MAX_NEW_ITEMS_NORMAL;
        document.getElementById('fmt3_max_new_backfill').value = p.maxNewItemsBackfill ?? DEFAULT_MAX_NEW_ITEMS_BACKFILL;
        document.getElementById('fmt3_auto_marker').checked = !!p.autoMarker;
        document.getElementById('fmt3_inject_enabled').checked = !!p.injectEnabled;
        document.getElementById('fmt3_min_importance').value = p.minImportance;
        document.getElementById('fmt3_retrieval_messages').value = p.retrievalMessageCount ?? DEFAULT_RETRIEVAL_MESSAGE_COUNT;
        document.getElementById('fmt3_current_tokens').value = p.currentTokenBudget ?? DEFAULT_CURRENT_TOKEN_BUDGET;
        document.getElementById('fmt3_relevant_tokens').value = p.relevantTokenBudget ?? DEFAULT_RELEVANT_TOKEN_BUDGET;
        document.getElementById('fmt3_recent_tokens').value = p.recentTokenBudget ?? DEFAULT_RECENT_TOKEN_BUDGET;
        const totalMemoryTokens = document.getElementById('fmt3_total_memory_tokens');
        if (totalMemoryTokens) totalMemoryTokens.value = String(Number(p.currentTokenBudget || 0) + Number(p.relevantTokenBudget || 0) + Number(p.recentTokenBudget || 0));
        document.getElementById('fmt3_injection_template').value = p.injectionTemplate;
        document.getElementById('fmt3_auto_flashback').checked = !!p.autoFlashback;
        document.getElementById('fmt3_flashback_chance').value = p.autoFlashbackChance;
        document.getElementById('fmt3_curation_prompt').value = p.curationPrompt || DEFAULT_CURATION_PROMPT;
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
        const count = profileFacts().filter(f => f.status === 'active' && f.enabled !== false).length || 0;
        const n = document.getElementById('fmt3_bubble_count');
        if (n) n.textContent = String(count);
    }

    function pruneSelectedFactsToCurrentProfile() {
        const valid = new Set(profileFacts().map(f => f.id));
        selectedFactIds = new Set([...selectedFactIds].filter(id => valid.has(id)));
    }

    function selectedProfileFacts() {
        pruneSelectedFactsToCurrentProfile();
        return profileFacts().filter(f => selectedFactIds.has(f.id));
    }

    function updateBulkToolbar() {
        pruneSelectedFactsToCurrentProfile();
        const count = selectedFactIds.size;
        const profileCount = profileFacts().length;
        const counter = document.getElementById('fmt3_bulk_count');
        if (counter) counter.textContent = `${count} выбрано`;
        const selectAll = document.getElementById('fmt3_bulk_select_all');
        if (selectAll) {
            selectAll.textContent = `☑ Всё профиля (${profileCount})`;
            selectAll.disabled = profileCount === 0;
        }
        const actions = document.getElementById('fmt3_bulk_actions');
        if (actions) actions.dataset.active = String(count > 0);
        for (const id of ['fmt3_bulk_clear','fmt3_bulk_enable','fmt3_bulk_disable','fmt3_bulk_delete','fmt3_bulk_importance','fmt3_bulk_category']) {
            const el = document.getElementById(id);
            if (el) el.disabled = count === 0;
        }
    }

    function bulkSelectAllProfile() {
        selectedFactIds = new Set(profileFacts().map(f => f.id));
        renderFactsGrid();
    }

    function bulkClearSelection() {
        selectedFactIds.clear();
        renderFactsGrid();
    }

    async function bulkSetEnabled(enabled) {
        const selected = selectedProfileFacts();
        if (!selected.length) return;
        const now = Date.now();
        for (const fact of selected) {
            fact.enabled = !!enabled;
            fact.updatedAt = now;
        }
        await saveProfileMemory();
        renderAll();
    }

    async function bulkSetImportance(value) {
        const select = document.getElementById('fmt3_bulk_importance');
        if (!value) return;
        const selected = selectedProfileFacts();
        if (!selected.length) { if (select) select.value = ''; return; }
        const normalized = normalizeImportance(value);
        const now = Date.now();
        for (const fact of selected) {
            fact.importance = normalized;
            fact.updatedAt = now;
        }
        await saveProfileMemory();
        if (select) select.value = '';
        renderAll();
    }

    async function bulkSetCategory(value) {
        const select = document.getElementById('fmt3_bulk_category');
        if (!value) return;
        const selected = selectedProfileFacts();
        if (!selected.length) { if (select) select.value = ''; return; }
        const normalized = normalizeCategory(value);
        const now = Date.now();
        for (const fact of selected) {
            fact.category = normalized;
            fact.updatedAt = now;
        }
        await saveProfileMemory();
        if (select) select.value = '';
        renderAll();
    }

    async function bulkDeleteSelected() {
        const selected = selectedProfileFacts();
        if (!selected.length) return;
        if (!window.confirm(`Удалить выбранные факты (${selected.length}) только из профиля «${memoryProfile()?.name || ''}»?`)) return;
        const ids = new Set(selected.map(f => f.id));
        const facts = profileFacts();
        for (let i = facts.length - 1; i >= 0; i--) {
            if (ids.has(facts[i].id)) facts.splice(i, 1);
        }
        selectedFactIds.clear();
        await saveProfileMemory();
        renderAll();
    }

    function factChronologyKey(f) {
        const date = String(f.inGameDate || '').toLowerCase();
        const time = String(f.inGameTime || '99:99');
        const idx = Math.min(...((f.sourceMessageIndexes || []).length ? f.sourceMessageIndexes : [999999]));
        return `${date}|${time}|${String(idx).padStart(8, '0')}`;
    }

    function renderFactCard(f, { showCategory = true, showDate = true } = {}) {
        const known = f.knownBy?.length ? f.knownBy.join(', ') : 'не установлено';
        const subjects = f.subjects?.length ? f.subjects.join(', ') : '—';
        const stampBits = [];
        if (showDate && f.inGameDate) stampBits.push(f.inGameDate);
        if (f.inGameTime) stampBits.push(f.inGameTime);
        if (f.location) stampBits.push(f.location);
        const stamp = stampBits.join(' · ');
        return `<article class="fmt3-fact-card fmt3-fact-compact" data-id="${escapeHtml(f.id)}" data-status="${escapeHtml(f.status)}" data-selected="${selectedFactIds.has(f.id)}">
            <div class="fmt3-fact-compact-main">
              <label class="fmt3-fact-select-wrap" title="Выбрать"><input class="fmt3-fact-select" type="checkbox" data-id="${escapeHtml(f.id)}" ${selectedFactIds.has(f.id) ? 'checked' : ''}></label>
              ${showCategory ? `<span class="fmt3-cat fmt3-cat-icon" title="${escapeHtml(CATEGORIES[f.category]?.short || f.category)}">${escapeHtml((CATEGORIES[f.category]?.label || '•').split(' ')[0])}</span>` : ''}
              <div class="fmt3-fact-compact-copy">
                ${stamp ? `<div class="fmt3-fact-stamp">${escapeHtml(stamp)}</div>` : ''}
                <div class="fmt3-fact-text">${escapeHtml(f.text)}</div>
              </div>
              <select class="fmt3-fact-importance" data-action="importance" title="Важность">
                <option value="high" ${f.importance === 'high' ? 'selected' : ''}>High</option>
                <option value="medium" ${f.importance === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="low" ${f.importance === 'low' ? 'selected' : ''}>Low</option>
              </select>
            </div>
            <details class="fmt3-fact-details">
              <summary>детали</summary>
              <div class="fmt3-fact-detail-body">
                <div class="fmt3-fact-meta">Раздел: ${escapeHtml(CATEGORIES[f.category]?.label || f.category)}</div>
                <div class="fmt3-fact-meta">Состояние: ${escapeHtml(f.state || defaultFactState(f.category))}</div>
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
              </div>
            </details>
          </article>`;
    }

    function renderFactsGrid() {
        const grid = document.getElementById('fmt3_fact_grid');
        if (!grid) return;
        const st = chatState();
        if (!st) return;
        const profile = memoryProfile();
        const profileAllFacts = profileFacts();
        pruneSelectedFactsToCurrentProfile();
        const search = String(document.getElementById('fmt3_fact_search')?.value || '').toLowerCase().trim();
        const category = document.getElementById('fmt3_fact_category')?.value || 'all';
        const status = document.getElementById('fmt3_fact_status')?.value || 'active';
        const scope = document.getElementById('fmt3_fact_scope')?.value || 'chat';
        const viewMode = document.getElementById('fmt3_view_mode')?.value || 'categories';
        const currentChat = currentChatIdentity();
        let facts = [...profileAllFacts];
        if (scope === 'chat') facts = facts.filter(f => (f.sourceChatIds || []).includes(currentChat));
        facts = facts.filter(f => (category === 'all' || f.category === category) && (status === 'all' || f.status === status));
        if (search) facts = facts.filter(f => `${f.text} ${(f.subjects || []).join(' ')} ${(f.knownBy || []).join(' ')} ${f.location || ''} ${f.inGameDate || ''}`.toLowerCase().includes(search));

        const subtitle = document.getElementById('fmt3_panel_subtitle');
        const activeCount = profileAllFacts.filter(f => f.status === 'active' && f.enabled !== false).length;
        if (subtitle) subtitle.textContent = `${profile?.name || ''} · ${profileAllFacts.length} фактов · ${activeCount} активных`;

        const injectionLine = document.getElementById('fmt3_panel_injection');
        if (injectionLine) {
            const p = memoryProfile();
            const plan = buildMemoryPlan();
            const injected = plan.current.items.length + plan.relevant.items.length + plan.recent.items.length;
            injectionLine.dataset.on = String(!!p?.injectEnabled && injected > 0);
            injectionLine.textContent = p?.injectEnabled
                ? (injected
                    ? `Инъекция: актуальное ${plan.current.items.length} · релевантное ${plan.relevant.items.length} · недавнее ${plan.recent.items.length} · ~${plan.totalTokens} ток.`
                    : 'Инъекция пуста — нет подходящих фактов выше порога')
                : 'Инъекция выключена';
        }

        if (!facts.length) {
            grid.innerHTML = '<div class="fmt3-empty">В этом представлении фактов пока нет.</div>';
            updateBulkToolbar();
            return;
        }

        if (viewMode === 'chronology') {
            const groups = new Map();
            for (const f of facts) {
                const key = f.inGameDate || 'Без даты';
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(f);
            }
            const ordered = [...groups.entries()].sort((a, b) => {
                const ai = Math.min(...a[1].flatMap(f => f.sourceMessageIndexes || [999999]));
                const bi = Math.min(...b[1].flatMap(f => f.sourceMessageIndexes || [999999]));
                return ai - bi;
            });
            grid.innerHTML = ordered.map(([date, list]) => {
                list.sort((a, b) => factChronologyKey(a).localeCompare(factChronologyKey(b), 'ru'));
                return `<section class="fmt3-memory-group"><div class="fmt3-memory-group-title">${escapeHtml(date)} <span>${list.length}</span></div><div class="fmt3-memory-list">${list.map(f => renderFactCard(f, { showCategory: true, showDate: false })).join('')}</div></section>`;
            }).join('');
        } else {
            const keys = category === 'all' ? Object.keys(CATEGORIES) : [category];
            grid.innerHTML = keys.map(key => {
                const list = facts.filter(f => f.category === key).sort((a,b) => factChronologyKey(a).localeCompare(factChronologyKey(b), 'ru'));
                if (!list.length) return '';
                return `<section class="fmt3-memory-group" data-category="${escapeHtml(key)}"><div class="fmt3-memory-group-title">${escapeHtml(CATEGORIES[key]?.label || key)} <span>${list.length}</span></div><div class="fmt3-memory-list">${list.map(f => renderFactCard(f, { showCategory: false, showDate: true })).join('')}</div></section>`;
            }).join('');
        }
        updateBulkToolbar();
    }

    async function handleFactGridClick(event) {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const card = button.closest('.fmt3-fact-card');
        const id = card?.dataset.id;
        const st = chatState();
        const facts = profileFacts();
        const fact = facts.find(f => f.id === id);
        if (!fact) return;
        const action = button.dataset.action;

        if (action === 'delete') {
            if (!window.confirm('Удалить этот факт?')) return;
            const idx = facts.findIndex(f => f.id === id);
            if (idx >= 0) facts.splice(idx, 1);
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
        await saveProfileMemory();
        await saveChatState();
        renderAll();
    }

    async function handleFactGridChange(event) {
        const el = event.target;
        if (el.matches('input.fmt3-fact-select')) {
            const id = String(el.dataset.id || '');
            if (id) {
                if (el.checked) selectedFactIds.add(id);
                else selectedFactIds.delete(id);
                el.closest('.fmt3-fact-card')?.setAttribute('data-selected', String(el.checked));
                updateBulkToolbar();
            }
            return;
        }
        if (!el.matches('select[data-action="importance"]')) return;
        const id = el.closest('.fmt3-fact-card')?.dataset.id;
        const fact = profileFacts().find(f => f.id === id);
        if (!fact) return;
        fact.importance = normalizeImportance(el.value);
        fact.updatedAt = Date.now();
        await saveProfileMemory();
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
            selectedFactIds.clear();
            st.memoryProfileId = e.target.value;
            const g = globalSettings();
            if (byId('fmt3_bind_scope').checked) g.scopeBindings[currentScopeKey()] = e.target.value;
            saveGlobal();
            await saveChatState();
            await loadProfileMemory(memoryProfile());
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
            selectedFactIds.clear();
            chatState().memoryProfileId = p.id;
            saveGlobal(); await saveChatState(); await persistProfileMemory(p); renderAll();
        });

        byId('fmt3_profile_clone').addEventListener('click', async () => {
            const src = memoryProfile();
            const g = globalSettings();
            const p = deepClone(src);
            p.id = cryptoRandomId('profile');
            p.name = `${src.name} — копия`;
            g.profiles.push(p);
            chatState().memoryProfileId = p.id;
            saveGlobal(); await saveChatState(); await persistProfileMemory(p); renderAll();
        });

        byId('fmt3_profile_delete').addEventListener('click', async () => {
            const g = globalSettings();
            const p = memoryProfile();
            if (g.profiles.length <= 1) return toast('warning', 'Нельзя удалить единственный профиль.');
            if (!window.confirm(`Удалить профиль «${p.name}» вместе с его памятью (${profileFacts().length} фактов)?`)) return;
            g.profiles = g.profiles.filter(x => x.id !== p.id);
            await removePersistedProfileMemory(p.id);
            if (g.defaultProfileId === p.id) g.defaultProfileId = g.profiles[0].id;
            for (const [k, v] of Object.entries(g.scopeBindings)) if (v === p.id) delete g.scopeBindings[k];
            selectedFactIds.clear();
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
        byId('fmt3_max_new_normal').addEventListener('change', e => updateCurrentProfile('maxNewItemsNormal', Math.max(0, Math.min(20, Number(e.target.value)))));
        byId('fmt3_max_new_backfill').addEventListener('change', e => updateCurrentProfile('maxNewItemsBackfill', Math.max(0, Math.min(20, Number(e.target.value)))));
        byId('fmt3_auto_marker').addEventListener('change', e => updateCurrentProfile('autoMarker', e.target.checked));
        byId('fmt3_inject_enabled').addEventListener('change', e => updateCurrentProfile('injectEnabled', e.target.checked, true));
        byId('fmt3_min_importance').addEventListener('change', e => updateCurrentProfile('minImportance', e.target.value, true));
        byId('fmt3_retrieval_messages').addEventListener('change', e => updateCurrentProfile('retrievalMessageCount', Math.max(1, Math.min(12, Number(e.target.value))), true));
        byId('fmt3_current_tokens').addEventListener('change', e => updateCurrentProfile('currentTokenBudget', Math.max(0, Number(e.target.value)), true));
        byId('fmt3_relevant_tokens').addEventListener('change', e => updateCurrentProfile('relevantTokenBudget', Math.max(0, Number(e.target.value)), true));
        byId('fmt3_recent_tokens').addEventListener('change', e => updateCurrentProfile('recentTokenBudget', Math.max(0, Number(e.target.value)), true));
        byId('fmt3_injection_template').addEventListener('change', e => updateCurrentProfile('injectionTemplate', e.target.value, true));
        byId('fmt3_auto_flashback').addEventListener('change', e => updateCurrentProfile('autoFlashback', e.target.checked));
        byId('fmt3_flashback_chance').addEventListener('change', e => updateCurrentProfile('autoFlashbackChance', Number(e.target.value)));
        byId('fmt3_curation_prompt').addEventListener('change', e => updateCurrentProfile('curationPrompt', e.target.value));
        byId('fmt3_scanner_prompt').addEventListener('change', e => updateCurrentProfile('scannerPrompt', e.target.value));
        byId('fmt3_reset_curation_prompt').addEventListener('click', () => {
            if (!window.confirm('Сбросить правила курации этого профиля к встроенному шаблону?')) return;
            updateCurrentProfile('curationPrompt', DEFAULT_CURATION_PROMPT);
        });
        byId('fmt3_reset_scanner_prompt').addEventListener('click', () => {
            if (!window.confirm('Сбросить промпт сканера этого профиля к встроенному шаблону?')) return;
            updateCurrentProfile('scannerPrompt', DEFAULT_SCANNER_PROMPT);
        });

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
        const profile = memoryProfile();
        const payload = {
            format: 'FactsMemoryTracker-RP-v3',
            version: VERSION,
            scope: 'memory-profile',
            chatId: ctx()?.chatId || '',
            profileId: profile?.id || '',
            profileName: profile?.name || '',
            exportedAt: new Date().toISOString(),
            facts: deepClone(profileFacts()),
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
            const incoming = Array.isArray(raw) ? raw : (raw.facts || raw.state?.facts || []);
            if (!Array.isArray(incoming)) throw new Error('В файле не найден массив facts');
            const facts = profileFacts();
            const existing = new Set(facts.map(f => factTextKey(f.text)));
            let added = 0;
            for (const item of incoming) {
                const fact = normalizeFact(item);
                if (!fact.text || existing.has(factTextKey(fact.text))) continue;
                facts.push(fact);
                existing.add(factTextKey(fact.text));
                added++;
            }
            await saveProfileMemory();
            renderAll();
            toast('success', `Импортировано ${added} новых фактов.`);
        } catch (error) {
            toast('error', `Импорт не удался: ${deepestErrorMessage(error)}`);
        }
    }

    async function initialRender() {
        renderSettingsHtml();
        renderBubble();
        renderMemoryPanelShell();
        chatState();
        const g = globalSettings();
        for (const profile of (g?.profiles || [])) await loadProfileMemory(profile);
        await migrateLegacyChatFactsToProfileIfSafe();
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
        await initialRender();
        refreshInjection();
        console.log('[FMT3] Facts Memory Tracker RP v3.0.9 initialized');
    }

    // SillyTavern loads third-party scripts after the page exists, but APP_READY is safer.
    const boot = () => window.setTimeout(init, 0);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
