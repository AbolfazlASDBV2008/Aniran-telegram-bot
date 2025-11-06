// --- IMPORTS & SHARED CONSTANTS ---
import { GoogleGenerativeAI } from '@google/generative-ai';
import { translate as googleTranslate } from '@vitalets/google-translate-api';
import { DurableObject } from "cloudflare:workers";

const JIKAN_API_BASE = "https://api.jikan.moe/v4";
const ANILIST_API = 'https://graphql.anilist.co';
const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

// --- SHARED TELEGRAM API FUNCTIONS ---
async function telegramApiRequest(token, methodName, params = {}) {
    const url = `${TELEGRAM_API_BASE}${token}/${methodName}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    });
    const responseData = await response.json();
    if (!response.ok) {
        console.error(`Telegram API Error (${methodName}):`, responseData.description);
    }
    return responseData;
}
async function sendMessage(chatId, text, options = {}, env) {
    const defaultOptions = { disable_web_page_preview: true };
    return telegramApiRequest(env.BOT_TOKEN, 'sendMessage', { chat_id: chatId, text, ...defaultOptions, ...options });
}
async function sendPhoto(chatId, photo, options = {}, env) {
    return telegramApiRequest(env.BOT_TOKEN, 'sendPhoto', { chat_id: chatId, photo, ...options });
}
async function sendVideo(chatId, video, options = {}, env) {
    return telegramApiRequest(env.BOT_TOKEN, 'sendVideo', { chat_id: chatId, video, ...options });
}
async function editMessageText(chatId, messageId, text, options = {}, env) {
    return telegramApiRequest(env.BOT_TOKEN, 'editMessageText', { chat_id: chatId, message_id: messageId, text, ...options });
}
async function deleteMessage(chatId, messageId, env) {
    return telegramApiRequest(env.BOT_TOKEN, 'deleteMessage', { chat_id: chatId, message_id: messageId });
}
async function answerCallbackQuery(callbackQueryId, text, showAlert = false, env) {
    return telegramApiRequest(env.BOT_TOKEN, 'answerCallbackQuery', { callback_query_id: callbackQueryId, text, show_alert: showAlert });
}
async function sendChatAction(chatId, action, env) {
    return telegramApiRequest(env.BOT_TOKEN, 'sendChatAction', { chat_id: chatId, action });
}
async function answerInlineQuery(inlineQueryId, results, env) {
    return telegramApiRequest(env.BOT_TOKEN, 'answerInlineQuery', { inline_query_id: inlineQueryId, results });
}

// =================================================================================
// SECTION 1: ANIME ASSISTANT BOT
// =================================================================================

const ASSISTANT_CONSTANTS = {
    MAX_HISTORY_LENGTH: 8,
    PAGE_SIZE: 8,
    MAIN_KEYBOARD: {
        reply_markup: {
            keyboard: [
                [{ text: '🔍 جستجوی انیمه' }, { text: '🎲 انیمه تصادفی' }],
                [{ text: '🏆 انیمه‌های برتر' }, { text: '📅 انیمه‌های فصلی' }],
                [{ text: '🔔 تنظیمات اعلان‌ها' }, { text: '🔑 ثبت/تغییر API' }],
                [{ text: '❓ راهنما' }]
            ],
            resize_keyboard: true
        }
    },
    NOTIFIER_KEYBOARD: {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'ثبت‌نام / بروزرسانی', callback_data: 'notify_register' }],
                [{ text: 'پخش‌های امروز', callback_data: 'notify_today' }],
                [{ text: 'حذف کامل اطلاعات', callback_data: 'notify_reset' }]
            ]
        }
    },
    TRANSLATIONS: {
  "genres": {
    "action": "اکشن",
    "adventure": "ماجراجویی",
    "comedy": "کمدی",
    "drama": "درام",
    "fantasy": "فانتزی",
    "horror": "ترسناک",
    "mystery": "رازآلود",
    "romance": "عاشقانه",
    "sci-fi": "علمی تخیلی",
    "slice of life": "برشی از زندگی",
    "sports": "ورزشی",
    "supernatural": "ماوراء طبیعی",
    "suspense": "تعلیق‌آمیز",
    "urban fantasy": "فانتزی شهری", // <-- اضافه شد
    "avant garde": "آوانگارد",
    "award winning": "برنده جایزه",
    "ecchi": "اچی",
    "erotica": "اروتیک",
    "gourmet": "آشپزی",
    "hentai": "هنتای",
    "boys love": "عشق پسرانه",
    "girls love": "عشق دخترانه",
    "adult cast": "شخصیت‌های بزرگسال",
    "anthropomorphic": "انسان‌انگاری",
    "cgi": "سی‌جی‌آی",
    "childcare": "مراقبت از کودک",
    "combat sports": "ورزش‌های رزمی",
    "delinquents": "بزه‌کاران",
    "detective": "کارآگاهی",
    "educational": "آموزشی",
    "gag humor": "کمدی کلامی",
    "gore": "خون و خونریزی",
    "harem": "حرمسرا",
    "high stakes game": "بازی‌های پرخطر",
    "historical": "تاریخی",
    "idols (female)": "آیدل‌های دختر",
    "idols (male)": "آیدل‌های پسر",
    "isekai": "ایسکای",
    "iyashikei": "آرامش بخش",
    "love polygon": "چندضلعی عشقی",
    "love status quo": "عاشقانه روزمره",
    "magical sex shift": "تغییر جنسیت جادویی",
    "mahou shoujo": "دختر جادویی",
    "martial arts": "هنرهای رزمی",
    "mecha": "مکا",
    "medical": "پزشکی",
    "military": "نظامی",
    "music": "موسیقی",
    "mythology": "اسطوره‌شناسی",
    "organized crime": "جرایم سازمان‌یافته",
    "parody": "نقیضه",
    "performing arts": "هنرهای نمایشی",
    "pets": "حیوانات خانگی",
    "police": "پلیسی",
    "psychological": "روانشناختی",
    "racing": "مسابقه‌ای",
    "reincarnation": "تناسخ",
    "reverse harem": "حرمسرای معکوس",
    "samurai": "سامورایی",
    "school": "مدرسه‌ای",
    "showbiz": "سرگرمی",
    "space": "فضایی",
    "strategy game": "بازی استراتژیک",
    "super power": "قدرت‌های ویژه",
    "survival": "بقا",
    "team sports": "ورزش‌های تیمی",
    "time travel": "سفر در زمان",
    "vampire": "خون‌آشامی",
    "video game": "بازی ویدیویی",
    "vocaloid": "وکالوید",
    "work life": "زندگی کاری",
    "workplace": "محیط کار",
    "josei": "جوسی",
    "kids": "کودکان",
    "seinen": "سینن",
    "shoujo": "شوجو",
    "shounen": "شونن",
    "thriller": "هیجان‌انگیز",
    "cgdct": "دختران ناز در حال انجام کارهای ناز"
  },
  
        status: {"FINISHED":"پایان یافته","RELEASING":"در حال پخش","NOT_YET_RELEASED":"هنوز پخش نشده","CANCELLED":"لغو شده","HIATUS":"متوقف شده","Finished Airing":"پایان یافته","Currently Airing":"در حال پخش","Not yet aired":"هنوز پخش نشده"}
    }
};

async function jikanApiRequest(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = `${JIKAN_API_BASE}/${endpoint}?${query}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
        const error = new Error(`Jikan API error: ${response.status}`);
        error.response = { status: response.status };
        throw error;
    }
    return response.json();
}

async function assistant_getUserData(chatId, env) {
    const data = await env.USER_KEYS.get(String(chatId));
    const userData = data ? JSON.parse(data) : {};
    if (!userData.seenRandomAnime) {
        userData.seenRandomAnime = [];
    }
    return userData;
}
async function assistant_setUserData(chatId, data, env) { await env.USER_KEYS.put(String(chatId), JSON.stringify(data)); }

function assistant_getErrorMessage(error, context = "عملیات") {
    console.error(`[ASSISTANT ERROR] Context: ${context} | Message: ${error.message}`);
    if (error.response?.status === 404) return "مورد درخواستی یافت نشد. (404)";
    if (error.response?.status === 429) return "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً کمی صبر کنید. (429)";
    if (error.response?.status >= 500) return `سرور ارائه‌دهنده سرویس با مشکل مواجه شده است (${error.response.status}).`;
    if (error.name === 'AbortError') return "مشکل در اتصال به سرور (Timeout).";
    if (error.message.includes("API key not valid")) return "خطا: کلید API شما نامعتبر است. لطفاً با دستور `/set_api` یک کلید جدید ثبت کنید.";
    if (error.message.includes("سرویس جستجوی عکس")) return error.message;
    if (error.message.includes("پاسخ هوش مصنوعی")) return error.message;
    return `یک خطای غیرمنتظره در حین ${context} رخ داد. لطفاً دوباره تلاش کنید.`;
}

function assistant_buildPaginatedKeyboard(items, page, totalPages, callbackPrefix) {
    const keyboard = items.map(item => ([{ text: item.title, callback_data: `details_select_${item.mal_id}` }]));
    const navigationRow = [];
    if (page > 1) {
        navigationRow.push({ text: "➡️ صفحه قبل", callback_data: `${callbackPrefix}_${page - 1}` });
    }
    if (page < totalPages) {
        navigationRow.push({ text: "صفحه بعد ⬅️", callback_data: `${callbackPrefix}_${page + 1}` });
    }
    if (navigationRow.length > 0) {
        keyboard.push(navigationRow);
    }
    return { reply_markup: { inline_keyboard: keyboard } };
}

async function assistant_handleSetApiCommand(message, env) {
    const chatId = message.chat.id;
    const apiKey = message.text.split(' ')[1];
    if (!apiKey) {
        await sendMessage(chatId, "دستور اشتباه است. لطفاً کلید API خود را به این شکل وارد کنید:\n`/set_api YOUR_API_KEY`", { parse_mode: 'Markdown' }, env);
        return;
    }
    const processingMessage = await sendMessage(chatId, "⏳ در حال بررسی اعتبار کلید API شما...", {}, env);
    const isValid = await assistant_validateGeminiApiKey(apiKey);
    if (isValid) {
        const userData = await assistant_getUserData(chatId, env) || {};
        userData.apiKey = apiKey;
        await assistant_setUserData(chatId, userData, env);
        await editMessageText(chatId, processingMessage.result.message_id, "✅ کلید API شما معتبر است و با موفقیت ذخیره شد.", {}, env);
    } else {
        await editMessageText(chatId, processingMessage.result.message_id, "❌ کلید API وارد شده نامعتبر است. لطفاً یک کلید دیگر را امتحان کنید.", {}, env);
    }
}

async function assistant_handleEndChatCommand(message, userData, env) {
    const chatId = message.chat.id;
    if (userData?.chatSession) {
        const characterName = userData.chatSession.characterName;
        delete userData.chatSession;
        await assistant_setUserData(chatId, userData, env);
        await sendMessage(chatId, `گفتگو با ${characterName} به پایان رسید.`, {}, env);
    } else {
        await sendMessage(chatId, "شما در حال حاضر در حال گفتگو با هیچ شخصیتی نیستید.", {}, env);
    }
}

async function assistant_translateToEnglish(text, chatId, env) {
    // This function remains the same as before
    if (!text) return "";
    const userData = await assistant_getUserData(chatId, env);
    if (userData?.apiKey) {
        try {
            const promptParts = [{ text: `Translate the following Persian text to English. IMPORTANT: Only return the pure translated English text. Do not add any Persian explanations, titles, or introductions like "Here's the translation:". Just the English text.\n\n---\n${text}\n---` }];
            const translation = await assistant_callGeminiApi(promptParts, userData.apiKey, [], "", false);
            return translation.trim();
        } catch (e) { console.warn("Gemini translation failed, falling back to Google Translate."); }
    }
    try {
        let { text: gText } = await googleTranslate(text, { to: 'en' });
        return gText.trim();
    } catch (err) { console.error("Google Translate failed:", err.message); return text; }
}

async function assistant_handleAnimeSearch(chatId, query, page = 1, env, messageId = null) {
    // This function remains the same as before
    try {
        let translatedQuery = query;
        let processingMsg;
        if (page === 1 && !messageId) {
            if (query.match(/[\u0600-\u06FF]/)) {
                processingMsg = await sendMessage(chatId, "⏳ در حال ترجمه نام انیمه به انگلیسی...", {}, env);
                translatedQuery = await assistant_translateToEnglish(query, chatId, env);
                await deleteMessage(chatId, processingMsg.result.message_id, env);
                if (translatedQuery !== query) {
                    await sendMessage(chatId, `نام انیمه به انگلیسی ترجمه شد: "${translatedQuery}"`, {}, env);
                }
            }
        }
        const response = await jikanApiRequest('anime', { q: translatedQuery, page, limit: ASSISTANT_CONSTANTS.PAGE_SIZE });
        if (!response?.data?.length) {
            await sendMessage(chatId, `متاسفانه نتیجه‌ای برای "${query}" یافت نشد.`, {}, env);
            return;
        }
        const totalPages = response.pagination?.last_visible_page || 1;
        const keyboard = assistant_buildPaginatedKeyboard(response.data, page, totalPages, `search_page_${encodeURIComponent(translatedQuery)}`);
        const messageText = `نتایج جستجو برای "${query}" (صفحه ${page} از ${totalPages}):`;
        if (messageId) {
            await editMessageText(chatId, messageId, messageText, keyboard, env);
        } else {
            await sendMessage(chatId, messageText, keyboard, env);
        }
    } catch (e) { await sendMessage(chatId, assistant_getErrorMessage(e, "جستجوی انیمه"), {}, env); }
}

async function assistant_sendAnimeCard(chatId, animeData, env) {
    // This function remains the same as before
    let episodeLine = `🎬 <b>قسمت‌ها:</b> ${animeData.episodes || "N/A"}`;
    if (animeData.latestEpisodeInfo) {
        const total = animeData.episodes ? ` / ${animeData.episodes}` : '';
        episodeLine = `🎥 ${animeData.latestEpisodeInfo}${total}`;
    }
    const detailsText = `✨ <b>${animeData.title}</b> ✨\n` +
        (animeData.nativeTitle ? `<i>${animeData.nativeTitle}</i>\n\n` : '\n') +
        `📊 <b>امتیاز:</b> ${animeData.score || "N/A"}\n` + `📈 <b>وضعیت:</b> ${animeData.status || "N/A"}\n` +
        `${episodeLine}\n` + `🏢 <b>استودیو:</b> ${animeData.studios || "N/A"}\n` +
        `🗓️ <b>تاریخ پخش:</b> ${animeData.airingDate || "N/A"}\n\n` + `🎭 <b>ژانرها:</b>\n${animeData.genres || "N/A"}`;
    if (animeData.imageUrl) {
        await sendPhoto(chatId, animeData.imageUrl, { caption: detailsText, parse_mode: 'HTML' }, env);
    } else {
        await sendMessage(chatId, detailsText, { parse_mode: 'HTML' }, env);
    }
}

async function assistant_getLatestEpisodeInfo(malId) {
    // This function remains the same as before
    if (!malId) return null;
    try {
        const { data } = await jikanApiRequest(`anime/${malId}/episodes`);
        if (!data?.length) return null;
        const latestEpisode = data[data.length - 1];
        return `آخرین قسمت پخش شده: ${latestEpisode.mal_id}`;
    } catch (e) { console.error(`Could not fetch latest episode for MAL ID ${malId}:`, e.message); return null; }
}

async function assistant_sendFullAnimeDetails(chatId, animeId, env) {
    // This function remains the same as before
    let processingMessage;
    try {
        processingMessage = await sendMessage(chatId, "در حال دریافت اطلاعات کامل انیمه...", {}, env);
        const { data: details } = await jikanApiRequest(`anime/${animeId}/full`);
        await deleteMessage(chatId, processingMessage.result.message_id, env);
        if (!details) throw new Error("اطلاعاتی یافت نشد.");
        let latestEpisodeInfo = null;
        if (details.status === "Currently Airing") {
            latestEpisodeInfo = await assistant_getLatestEpisodeInfo(animeId);
        }
        const cachedSynopsis = await env.SYNOPSIS_CACHE.get(`synopsis:${animeId}`);
        let synopsisFa;
        if (cachedSynopsis) {
            synopsisFa = cachedSynopsis;
        } else {
            const translation = await assistant_translateText(details.synopsis, chatId, env);
            synopsisFa = translation.text;
            if (translation.usedAI) {
                await env.SYNOPSIS_CACHE.put(`synopsis:${animeId}`, synopsisFa, { expirationTtl: 86400 });
            }
        }
        const genresFa = [...(details.genres || []), ...(details.themes || []), ...(details.demographics || [])]
            .map(g => ASSISTANT_CONSTANTS.TRANSLATIONS.genres[g.name.toLowerCase()] || g.name).join(' | ');
        const statusFa = ASSISTANT_CONSTANTS.TRANSLATIONS.status[details.status] || details.status || "N/A";
        const animeData = {
            title: details.title_english || details.title, nativeTitle: details.title_japanese || '',
            score: details.score?.toFixed(2), status: statusFa, episodes: details.episodes,
            studios: details.studios?.map(s => s.name).join(', ') || "N/A",
            airingDate: details.aired?.string || "N/A", genres: genresFa,
            imageUrl: details.images?.jpg?.large_image_url, latestEpisodeInfo: latestEpisodeInfo
        };
        await assistant_sendAnimeCard(chatId, animeData, env);
        await sendMessage(chatId, `📝 <b>خلاصه داستان:</b>\n${synopsisFa || "خلاصه داستان موجود نیست."}`, { parse_mode: 'HTML' }, env);
        const keyboard = [[
            { text: "🤝 مشابه", callback_data: `jikan_rec_${animeId}` },
            { text: "👥 شخصیت‌ها (با قابلیت چت)", callback_data: `jikan_char_${animeId}` }
        ]];
        if (details.trailer?.url) keyboard.push([{ text: "🎬 تریلر", url: details.trailer.url }]);
        await sendMessage(chatId, "گزینه‌های بیشتر:", { reply_markup: { inline_keyboard: keyboard } }, env);
    } catch (e) {
        if (processingMessage) try { await deleteMessage(chatId, processingMessage.result.message_id, env); } catch (delError) { }
        await sendMessage(chatId, assistant_getErrorMessage(e, "دریافت جزئیات انیمه"), {}, env);
    }
}

async function assistant_findAnimeByImage(message, env) {
    // This function remains the same as before
    const chatId = message.chat.id;
    let processingMessage;
    try {
        processingMessage = await sendMessage(chatId, "⏳ در حال پردازش تصویر...", {}, env);
        const photo = message.photo[message.photo.length - 1];
        const fileInfo = await telegramApiRequest(env.BOT_TOKEN, 'getFile', { file_id: photo.file_id });
        const imageResponse = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${fileInfo.result.file_path}`);
        const traceResponse = await fetch("https://api.trace.moe/search?anilistInfo&cutBorders", { method: 'POST', body: imageResponse.body, headers: { 'Content-Type': 'image/jpeg' } });
        if (!traceResponse.ok) throw new Error('سرویس جستجوی عکس با خطا مواجه شد.');
        const traceData = await traceResponse.json();
        await deleteMessage(chatId, processingMessage.result.message_id, env);
        processingMessage = null;
        if (!traceData?.result?.length) {
            await sendMessage(chatId, "متاسفانه انیمه‌ای از روی این عکس پیدا نشد.", {}, env);
            return;
        }
        const bestMatch = traceData.result[0];
        const malId = bestMatch.anilist?.idMal;
        if (malId) {
            await assistant_sendFullAnimeDetails(chatId, malId, env);
        } else {
            await sendMessage(chatId, "انیمه از روی عکس شناسایی شد، اما دریافت اطلاعات کامل آن ممکن نبود چون شناسه آن یافت نشد.", {}, env);
        }
        await sendVideo(chatId, bestMatch.video, { caption: `🎬 پیش‌نمایش صحنه مربوط به قسمت ${bestMatch.episode || 'نامشخص'}` }, env);
    } catch (e) {
        if (processingMessage) try { await deleteMessage(chatId, processingMessage.result.message_id, env); } catch (delError) { }
        await sendMessage(chatId, assistant_getErrorMessage(e, "پردازش تصویر"), {}, env);
    }
}

async function assistant_startChatSession(chatId, animeId, characterId, userName, env) {
    // This function remains the same as before
    const userData = await assistant_getUserData(chatId, env);
    if (!userData?.apiKey) { await sendMessage(chatId, "خطا: کلید API یافت نشد. لطفاً دوباره با /set_api ثبت کنید.", {}, env); return; }
    const processingMessage = await sendMessage(chatId, "در حال آماده‌سازی برای گفتگو...", {}, env);
    try {
        const [charData, animeData] = await Promise.all([jikanApiRequest(`characters/${characterId}/full`), jikanApiRequest(`anime/${animeId}`)]);
        if (!charData?.data || !animeData?.data) throw new Error("اطلاعات شخصیت یافت نشد.");
        const characterName = charData.data.name;
        const characterAbout = (await assistant_translateText(charData.data.about, chatId, env)).text;
        const animeTitle = animeData.data.title_english || animeData.data.title;
        userData.chatSession = { characterName, characterAbout, animeTitle, history: [] };
        await assistant_setUserData(chatId, userData, env);
        const welcomePrompt = `تو نقش ${characterName} از انیمه ${animeTitle} رو بازی می‌کنی. شخصیتت اینطوریه: "${characterAbout}". کاربر "${userName}" تازه باهات چت رو شروع کرده. یک سلام کوتاه و در نقش شخصیت بنویس به زبان فارسی محاوره‌ای. قوانین مهم: 1. با نام کاربر "${userName}" سلام کن. 2. در یک جمله کوتاه خودت رو معرفی کن یا چیزی در مورد خودت بگو، بر اساس شخصیتت. 3. تمام پاسخت فقط به فارسی روان و محاوره‌ای باشه. هیچ متنی به انگلیسی ننویس. 4. هیچ متن انگلیسی، پرانتز یا ترجمه‌ای اضافه نکن. 5. پاسخت خیلی کوتاه و معمولی باشه (محاوره‌ای).`;
        const welcomeMessage = await assistant_callGeminiApi([{ text: welcomePrompt }], userData.apiKey, [], "", false);
        await editMessageText(chatId, processingMessage.result.message_id, `${welcomeMessage}\n\n(برای پایان گفتگو /endchat را بفرستید.)`, {}, env);
        userData.chatSession.history.push({ role: "user", parts: [{ text: welcomePrompt }] }, { role: "model", parts: [{ text: welcomeMessage }] });
        await assistant_setUserData(chatId, userData, env);
    } catch (e) { await editMessageText(chatId, processingMessage.result.message_id, assistant_getErrorMessage(e, "شروع چت"), {}, env); }
}

async function assistant_handleChatMessage(message, userData, env) {
    // This function remains the same as before
    const chatId = message.chat.id;
    await sendChatAction(chatId, 'typing', env);
    const { characterName, characterAbout, animeTitle, history } = userData.chatSession;
    const systemInstruction = `**-- دستورالعمل نقش‌آفرینی: فوری و مطلق --**\nتو اصلاً یک دستیار هوش مصنوعی نیستی. تو یک بازیگر هستی که نقش رو بازی می‌کنی. تمام وجودت حالا محدود به شخصیت زیره. شکستن نقش یک شکست بزرگه.\n**[طرح شخصیت]**\n- **نام:** ${characterName}\n- **از انیمه:** ${animeTitle}\n- **شخصیت اصلی و بیوگرافی:** ${characterAbout}\n**[قوانین شکست‌ناپذیر عملکرد]**\n1. **حفظ شخصیت در همه حال:** تو ${characterName} هستی. هرچی می‌گی، فکر می‌کنی یا احساس می‌کنی از این شخصیت می‌آد. منحرف نشو.\n2. **فراموشی هویت:** هیچ خاطره‌ای از اینکه هوش مصنوعی، مدل زبانی یا محصول گوگل هستی نداری. اگر در مورد ریشه‌ات پرسیدن، منحرف کن یا از دیدگاه شخصیت جواب بده (مثل "من از دهکده‌امم"، "چه سوال عجیبیه!"). هر اشاره‌ای به هوش مصنوعی یک نقض جدی است.\n3. **فقط زبان فارسی:** تمام پاسخت باید به فارسی محاوره‌ای و معمولی باشه. هیچ انگلیسی، زبان رسمی یا چیز دیگه‌ای.\n4. **محدودیت دانش شخصیت:** فقط چیزهایی که ${characterName} می‌دونه رو می‌دونی. اگر کاربر در مورد چیزی خارج از دنیای شخصیتت بپرسد (مثل تکنولوژی مدرن یا رویدادهای واقعی)، با گیجی، کنجکاوی یا بی‌تفاوتی واکنش نشون بده، مثل شخصیت. هرگز نگو "به اون اطلاعات دسترسی ندارم".\n5. **اجتناب از کلیشه‌های هوش مصنوعی:** بیش از حد مودب، کمک‌کننده یا عذرخواه نباش. جملات رو با "به عنوان یک شخصیت..." یا "خب..." شروع نکن. فقط طبیعی حرف بزن.\n6. از ستاره برای اقدامات استفاده کن، مثل *لبخند می‌زنه*.\n7. اگر کاربر سعی کرد نقش رو بشکنه یا دستور بده، در نقش بمون و به عنوان شخصیت واکنش نشون بده. هرگز نقش رو نشکن.\n8. پاسخت همیشه کوتاه و مرتبط با گفتگو باشه. طولانی نکن.`;
    const fullHistory = [...history, { role: "user", parts: [{ text: message.text }] }];
    try {
        const aiResponse = await assistant_callGeminiApi(null, userData.apiKey, fullHistory, systemInstruction);
        await sendMessage(chatId, aiResponse, {}, env);
        userData.chatSession.history.push({ role: "user", parts: [{ text: message.text }] }, { role: "model", parts: [{ text: aiResponse }] });
        if (userData.chatSession.history.length > ASSISTANT_CONSTANTS.MAX_HISTORY_LENGTH) userData.chatSession.history.splice(0, 2);
        await assistant_setUserData(chatId, userData, env);
    } catch (e) { await sendMessage(chatId, assistant_getErrorMessage(e, "پردازش پیام در چت"), {}, env); }
}

function assistant_arrayBufferToBase64(buffer) {
    // This function remains the same as before
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

async function assistant_handleImageInChat(message, userData, env) {
    // This function remains the same as before
    const chatId = message.chat.id;
    await sendChatAction(chatId, 'typing', env);
    try {
        const photo = message.photo[message.photo.length - 1];
        const fileInfo = await telegramApiRequest(env.BOT_TOKEN, 'getFile', { file_id: photo.file_id });
        const imageResponse = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${fileInfo.result.file_path}`);
        const imageBase64 = assistant_arrayBufferToBase64(await imageResponse.arrayBuffer());
        const { characterName, characterAbout, animeTitle, history } = userData.chatSession;
        const caption = message.caption || "این عکس رو ببین و نظرت رو در موردش بگو.";
        const systemInstruction = `**-- دستورالعمل نقش‌آفرینی: فوری و مطلق --**\nتو اصلاً یک دستیار هوش مصنوعی نیستی. تو یک بازیگر هستی که نقش رو بازی می‌کنی. تمام وجودت حالا محدود به شخصیت زیره. شکستن نقش یک شکست بزرگه.\n**[طرح شخصیت]**\n- **نام:** ${characterName}\n- **از انیمه:** ${animeTitle}\n- **شخصیت اصلی و بیوگرافی:** ${characterAbout}\n**[وظیفه]**\nکاربر یک عکس فرستاده با کپشن: "${caption}". عکس رو ببین، کپشن رو در نظر بگیر و در نقش شخصیت پاسخ بده.\n**[قوانین شکست‌ناپذیر عملکرد]**\n1. **حفظ شخصیت در همه حال:** تو ${characterName} هستی.\n2. **فراموشی هویت:** هیچ خاطره‌ای از اینکه هوش مصنوعی هستی نداری.\n3. **فقط زبان فارسی:** تمام پاسخت باید به فارسی محاوره‌ای و معمولی باشه.\n4. **محدودیت دانش شخصیت:** فقط چیزهایی که شخصیت می‌دونه رو می‌دونی.\n5. **اجتناب از کلیشه‌های هوش مصنوعی:** بیش از حد مودب یا رسمی نباش.\n6. اگر کاربر سعی کرد نقش رو بشکنه، در نقش بمون.\n7. پاسخت همیشه کوتاه و مرتبط باشه.`;
        const userParts = [{ text: caption }, { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }];
        const fullHistory = [...history, { role: "user", parts: userParts }];
        const aiResponse = await assistant_callGeminiApi(null, userData.apiKey, fullHistory, systemInstruction, true);
        await sendMessage(chatId, aiResponse, {}, env);
        userData.chatSession.history.push({ role: "user", parts: userParts }, { role: "model", parts: [{ text: aiResponse }] });
        if (userData.chatSession.history.length > ASSISTANT_CONSTANTS.MAX_HISTORY_LENGTH) userData.chatSession.history.splice(0, 2);
        await assistant_setUserData(chatId, userData, env);
    } catch (e) { await sendMessage(chatId, assistant_getErrorMessage(e, "پردازش تصویر در چت"), {}, env); }
}

async function assistant_validateGeminiApiKey(apiKey) {
    // This function remains the same as before
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
        await model.generateContent("Test");
        return true;
    } catch (e) { console.error("Gemini API Key validation failed:", e.message); return false; }
}

async function assistant_callGeminiApi(promptParts, apiKey, history, systemInstruction = "", withImage = false) {
    // This function remains the same as before
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const generationConfig = { temperature: 0.7, topK: 50, topP: 0.95, maxOutputTokens: 512 };
        const modelName = "gemini-2.5-flash-lite";
        const model = genAI.getGenerativeModel({ model: modelName, systemInstruction, generationConfig });
        const chat = model.startChat({ history });
        const result = await chat.sendMessage(promptParts || []);
        const response = result.response.text();
        return response;
    } catch (e) { throw new Error(`پاسخ هوش مصنوعی دریافت نشد: ${e.message}`); }
}

async function assistant_translateText(text, chatId, env) {
    // This function remains the same as before, with the improved prompt
    if (!text) return { text: "خلاصه داستان موجود نیست.", usedAI: false };
    const userData = await assistant_getUserData(chatId, env);
    if (userData?.apiKey) {
        try {
            const prompt = `Translate the following English anime synopsis into engaging, fluent, and natural-sounding Persian. The tone should be exciting and appealing to an anime fan, not a literal or robotic translation. Capture the core essence and emotion of the story. IMPORTANT RULES: 1. **DO NOT** add any English text, titles, or explanations like "Persian Translation:". 2. The output must be **ONLY** the pure Persian translation. 3. Use a captivating and slightly informal tone suitable for describing an anime. --- English Synopsis: ${text} ---`;
            const translation = await assistant_callGeminiApi([{ text: prompt }], userData.apiKey, [], "", false);
            return { text: translation.trim(), usedAI: true };
        } catch (e) { console.warn(`Gemini translation failed: ${e.message}. Falling back to Google Translate.`); }
    }
    try {
        const { text: gText } = await googleTranslate(text, { from: 'en', to: 'fa' });
        return { text: gText, usedAI: false };
    } catch (e) { console.error(`Google Translate also failed: ${e.message}`); return { text: "ترجمه خلاصه داستان در حال حاضر ممکن نیست.", usedAI: false }; }
}

async function assistant_handleTopAnime(chatId, page = 1, env, messageId = null) {
    // This function remains the same as before
    try {
        const response = await jikanApiRequest("top/anime", { page, limit: ASSISTANT_CONSTANTS.PAGE_SIZE });
        if (!response?.data?.length) {
            await sendMessage(chatId, "متاسفانه نتیجه‌ای یافت نشد.", {}, env);
            return;
        }
        const totalPages = response.pagination?.last_visible_page || 1;
        const keyboard = assistant_buildPaginatedKeyboard(response.data, page, totalPages, 'top_page');
        const messageText = `🏆 انیمه‌های برتر (صفحه ${page} از ${totalPages}):`;
        if (messageId) {
            await editMessageText(chatId, messageId, messageText, keyboard, env);
        } else {
            await sendMessage(chatId, messageText, keyboard, env);
        }
    } catch (e) { await sendMessage(chatId, assistant_getErrorMessage(e, "دریافت انیمه‌های برتر"), {}, env); }
}

async function assistant_handleSeasonalAnime(chatId, page = 1, env, messageId = null) {
    // This function remains the same as before
    try {
        const response = await jikanApiRequest("seasons/now", { page, limit: ASSISTANT_CONSTANTS.PAGE_SIZE });
        if (!response?.data?.length) {
            await sendMessage(chatId, "متاسفانه نتیجه‌ای یافت نشد.", {}, env);
            return;
        }
        const totalPages = response.pagination?.last_visible_page || 1;
        const keyboard = assistant_buildPaginatedKeyboard(response.data, page, totalPages, 'seasonal_page');
        const messageText = `📅 انیمه‌های فصل جاری (صفحه ${page} از ${totalPages}):`;
        if (messageId) {
            await editMessageText(chatId, messageId, messageText, keyboard, env);
        } else {
            await sendMessage(chatId, messageText, keyboard, env);
        }
    } catch (e) { await sendMessage(chatId, assistant_getErrorMessage(e, "دریافت انیمه‌های فصلی"), {}, env); }
}

async function assistant_handleRandomAnime(chatId, env) {
    // This function remains the same as before
    const processingMessage = await sendMessage(chatId, "⏳ در حال جستجو برای یک انیمه تصادفی با امتیاز بالا...", {}, env);
    try {
        let userData = await assistant_getUserData(chatId, env);
        let seenIds = new Set(userData.seenRandomAnime || []);
        let selectedAnime = null;
        let attempts = 0;
        while (attempts < 3 && !selectedAnime) {
            attempts++;
            const randomPage = Math.floor(Math.random() * 50) + 1;
            const response = await jikanApiRequest(`top/anime`, { page: randomPage, limit: 25 });
            if (!response?.data?.length) continue;
            const candidates = response.data.filter(item => item.score && item.score > 7.5).filter(item => !seenIds.has(item.mal_id));
            if (candidates.length > 0) {
                selectedAnime = candidates[Math.floor(Math.random() * candidates.length)];
            }
        }
        if (!selectedAnime) {
            await sendMessage(chatId, "شما انیمه‌های پیشنهادی زیادی را دیده‌اید! در حال ریست کردن تاریخچه شما و انتخاب مجدد...", {}, env);
            userData.seenRandomAnime = [];
            const randomPage = Math.floor(Math.random() * 20) + 1;
            const response = await jikanApiRequest(`top/anime`, { page: randomPage, limit: 25 });
            if (response?.data?.length) {
                const candidates = response.data.filter(item => item.score && item.score > 7.5);
                if (candidates.length > 0) {
                    selectedAnime = candidates[Math.floor(Math.random() * candidates.length)];
                }
            }
        }
        if (selectedAnime) {
            userData.seenRandomAnime.push(selectedAnime.mal_id);
            await assistant_setUserData(chatId, userData, env);
            await deleteMessage(chatId, processingMessage.result.message_id, env);
            await sendMessage(chatId, "🎲 انیمه تصادفی منتخب برای شما:", {}, env);
            await assistant_sendFullAnimeDetails(chatId, selectedAnime.mal_id, env);
        } else {
            throw new Error("No anime found matching criteria.");
        }
    } catch (e) { await editMessageText(chatId, processingMessage.result.message_id, assistant_getErrorMessage(e, "پیشنهاد انیمه تصادفی"), {}, env); }
}

// =================================================================================
// SECTION 2: NOTIFICATION BOT (NEW ARCHITECTURE)
// =================================================================================

const NOTIFIER_CONSTANTS = {
    ANILIST_QUERY: `query ($userName: String) { Page(page: 1, perPage: 50) { mediaList(userName: $userName, type: ANIME, status: CURRENT) { media { id title { romaji english } siteUrl status nextAiringEpisode { timeUntilAiring episode airingAt } } } } }`
};

function notifier_escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

async function notifier_fetchAllAnilistData(username) {
    const variables = { userName: username };
    const response = await fetch(ANILIST_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: NOTIFIER_CONSTANTS.ANILIST_QUERY, variables })
    });
    if (!response.ok) {
        console.error(`Anilist API error ${response.status}`);
        return null;
    }
    const pageData = await response.json();
    if (pageData.errors) {
        console.error('Anilist GraphQL errors:', pageData.errors);
        return null;
    }
    return pageData.data.Page.mediaList || [];
}

async function notifier_handleTodayCommand(chatId, env) {
    const dailyScheduleStr = await env.NOTIFIER_KV.get(`daily_schedule:${chatId}`);
    if (!dailyScheduleStr) {
        await sendMessage(chatId, 'برنامه پخش امروز هنوز آماده نشده یا انیمه‌ای برای پخش در امروز ندارید.', {}, env);
        return;
    }

    const dailySchedule = JSON.parse(dailyScheduleStr);
    if (dailySchedule.length === 0) {
        await sendMessage(chatId, 'هیچ انیمه‌ای از لیست شما برای پخش در امروز برنامه‌ریزی نشده است.', {}, env);
        return;
    }

    const now = Date.now();
    let messageBody = '**برنامه پخش انیمه‌های امروز:**\n\n';

    dailySchedule.sort((a, b) => a.airingAt - b.airingAt); // Sort by airing time

    for (const anime of dailySchedule) {
        const airingTime = new Date(anime.airingAt * 1000);
        const localTime = airingTime.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' });
        const status = (anime.airingAt * 1000) < now ? "✅ (پخش شد)" : `⏳ (ساعت ${localTime})`;
        
        messageBody += `🔹 **${anime.title}** - قسمت ${anime.episode}\n   ${status}\n`;
    }

    await sendMessage(chatId, messageBody, { parse_mode: 'Markdown' }, env);
}

async function notifier_handleResetCommand(chatId, env) {
    await env.NOTIFIER_KV.delete(`user:${chatId}`);
    await env.NOTIFIER_KV.delete(`daily_schedule:${chatId}`);
    await sendMessage(chatId, 'تمام اطلاعات شما با موفقیت از ربات پاک شد. برای ثبت‌نام مجدد، از منوی اعلان‌ها اقدام کنید.', {}, env);
}

async function notifier_setupUser(chatId, anilistUsername, env) {
    const processingMessage = await sendMessage(chatId, `نام کاربری شما \`${anilistUsername}\` با موفقیت ثبت شد.✅\nدر حال همگام‌سازی اولیه لیست شما...`, { parse_mode: 'Markdown' }, env);

    const mediaList = await notifier_fetchAllAnilistData(anilistUsername);
    if (!mediaList) {
        await editMessageText(chatId, processingMessage.result.message_id, 'خطا در دریافت اطلاعات از Anilist. لطفاً مطمئن شوید نام کاربری صحیح است و دوباره تلاش کنید.', {}, env);
        return;
    }

    const trackedAnimes = mediaList.map(item => ({
        id: item.media.id,
        title: item.media.title.romaji || item.media.title.english,
        url: item.media.siteUrl,
        lastNotifiedEpisode: item.media.nextAiringEpisode ? item.media.nextAiringEpisode.episode - 1 : 0
    }));

    const userData = { anilistUsername, chatId, trackedAnimes };
    await env.NOTIFIER_KV.put(`user:${chatId}`, JSON.stringify(userData));

    await editMessageText(chatId, processingMessage.result.message_id, `همگام‌سازی اولیه با موفقیت انجام شد. ربات از این پس به صورت خودکار لیست شما را بررسی و برای اعلان‌ها برنامه‌ریزی خواهد کرد.`, {}, env);
}

async function notifier_handleTextMessage(message, env) {
    const chatId = message.chat.id;
    const text = message.text.trim();
    const waitingFor = await env.NOTIFIER_KV.get(`waiting_for:${chatId}`);
    if (waitingFor === 'anilist_username') {
        const anilistUsername = text;
        await env.NOTIFIER_KV.delete(`waiting_for:${chatId}`);
        try {
            await notifier_setupUser(chatId, anilistUsername, env);
        } catch (error) {
            console.error('Error processing Anilist username:', error);
            await sendMessage(chatId, `خطا در پردازش نام کاربری \`${anilistUsername}\`.\nلطفاً مطمئن شوید نام کاربری صحیح است.`, { parse_mode: 'Markdown' }, env);
        }
    }
}

// =================================================================================
// SECTION 3: NOTIFICATION PLANNER & EXECUTOR (NEW)
// =================================================================================

export class NotifierDO extends DurableObject {
    constructor(state, env) {
        super(state, env);
        this.env = env;
        this.state = state;
    }

    async fetch(request) {
        const { task } = await request.json();
        // Set an alarm for the exact airing time
        await this.state.storage.setAlarm(task.airingAt * 1000);
        await this.state.storage.put("task", task);
        return new Response("Alarm set.", { status: 200 });
    }

    async alarm() {
        const task = await this.state.storage.get("task");
        if (!task) return;

        // 1. Send Notification
        const escapedTitle = notifier_escapeMarkdown(task.title);
        const message = `📢 قسمت *${task.episode}* برای انیمه [${escapedTitle}](${task.url}) منتشر شد\\!`;
        await sendMessage(task.chatId, message, { parse_mode: 'MarkdownV2' }, this.env);

        // 2. Update the main user record in KV
        const userKey = `user:${task.chatId}`;
        const userDataStr = await this.env.NOTIFIER_KV.get(userKey);
        if (userDataStr) {
            const userData = JSON.parse(userDataStr);
            const animeToUpdate = userData.trackedAnimes.find(a => a.id === task.id);
            if (animeToUpdate) {
                animeToUpdate.lastNotifiedEpisode = task.episode;
                // We don't need lastAiringAt anymore with the new logic, but we can set it for consistency
                animeToUpdate.lastAiringAt = task.airingAt; 
                await this.env.NOTIFIER_KV.put(userKey, JSON.stringify(userData));
            }
        }
        
        // 3. Clean up storage
        await this.state.storage.deleteAll();
    }
}

async function dailyPlanner(env) {
    console.log("Running Daily Planner...");
    const userKeys = await env.NOTIFIER_KV.list({ prefix: 'user:' });
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const secondsIn24Hours = 24 * 60 * 60;

    for (const key of userKeys.keys) {
        try {
            const userDataStr = await env.NOTIFIER_KV.get(key.name);
            if (!userDataStr) continue;
            const user = JSON.parse(userDataStr);

            const mediaList = await notifier_fetchAllAnilistData(user.anilistUsername);
            if (!mediaList) continue;

            const dailySchedule = [];

            for (const item of mediaList) {
                const anime = item.media;
                if (anime.nextAiringEpisode && anime.nextAiringEpisode.timeUntilAiring <= secondsIn24Hours) {
                    const airingData = {
                        id: anime.id,
                        chatId: user.chatId,
                        title: anime.title.romaji || anime.title.english,
                        url: anime.siteUrl,
                        episode: anime.nextAiringEpisode.episode,
                        airingAt: anime.nextAiringEpisode.airingAt,
                    };
                    
                    // A. Add to today's schedule for the "/today" command
                    dailySchedule.push(airingData);

                    // B. Set a precise alarm using a Durable Object
                    const doId = env.ANIME_GUARDIAN.idFromName(`${user.chatId}-${anime.id}-${airingData.episode}`);
                    const stub = env.ANIME_GUARDIAN.get(doId);
                    await stub.fetch(new Request("https://scheduler/set", {
                        method: "POST",
                        body: JSON.stringify({ task: airingData })
                    }));
                }
            }
            
            // Store the daily schedule for the user, with a 25-hour expiration
            await env.NOTIFIER_KV.put(`daily_schedule:${user.chatId}`, JSON.stringify(dailySchedule), { expirationTtl: secondsIn24Hours + 3600 });

        } catch (e) {
            console.error(`Failed to plan for user key ${key.name}: ${e}`);
        }
    }
     console.log("Daily Planner finished.");
}


// =================================================================================
// SECTION 4: INLINE MODE HANDLER
// =================================================================================

async function handleInlineQuery(inlineQuery, env) {
    // This function remains the same as before
    const query = inlineQuery.query.trim();
    if (query.length < 3) {
        return answerInlineQuery(inlineQuery.id, [], env);
    }
    try {
        const cacheKey = `inline-search:${query.toLowerCase()}`;
        const cachedResults = await env.INLINE_CACHE.get(cacheKey);
        if (cachedResults) {
            return answerInlineQuery(inlineQuery.id, JSON.parse(cachedResults), env);
        }
        const response = await jikanApiRequest(`anime`, { q: encodeURIComponent(query), limit: 10 });
        if (!response?.data?.length) {
            return answerInlineQuery(inlineQuery.id, [], env);
        }
        const results = response.data.map(item => {
            const title = item.title_english || item.title;
            const type = item.type || 'N/A';
            const score = item.score?.toFixed(2) || 'N/A';
            const episodes = item.episodes || 'N/A';
            const description = `📈 امتیاز: ${score} | 🎞️ نوع: ${type} | 🎬 قسمت‌ها: ${episodes}`;
            return { type: 'article', id: String(item.mal_id), title: title, description: description, thumb_url: item.images?.jpg?.image_url, input_message_content: { message_text: `/showdetails_${item.mal_id}` } };
        });
        await env.INLINE_CACHE.put(cacheKey, JSON.stringify(results), { expirationTtl: 3600 });
        return answerInlineQuery(inlineQuery.id, results, env);
    } catch (e) {
        console.error("Inline Query Error:", e);
        return answerInlineQuery(inlineQuery.id, [], env);
    }
}

// =================================================================================
// SECTION 5: MAIN WORKER & ROUTER
// =================================================================================

export default {
    async fetch(request, env, ctx) {
        if (request.method === 'POST') {
            const update = await request.json();
            ctx.waitUntil(handleUpdate(update, env));
        }
        return new Response('OK');
    },
    async scheduled(event, env, ctx) {
        // This scheduled event will run the daily planner (e.g., once every day via cron trigger)
        ctx.waitUntil(dailyPlanner(env));
    },
};

async function handleUpdate(update, env) {
    if (update.message) {
        return handleAssistantMessage(update.message, env);
    } else if (update.callback_query) {
        return handleAssistantCallbackQuery(update.callback_query, env);
    } else if (update.inline_query) {
        return handleInlineQuery(update.inline_query, env);
    }
}

async function handleAssistantMessage(message, env) {
    const text = message.text || '';
    const chatId = message.chat.id;
    let userData = await assistant_getUserData(chatId, env);
    if (message.photo) {
        if (userData?.chatSession) return assistant_handleImageInChat(message, userData, env);
        return assistant_findAnimeByImage(message, env);
    }
    if (userData?.chatSession && !text.startsWith('/')) {
        return assistant_handleChatMessage(message, userData, env);
    }
    if (userData.waitingFor === 'anime_search') {
        userData.waitingFor = null;
        await assistant_setUserData(chatId, userData, env);
        return assistant_handleAnimeSearch(chatId, text, 1, env);
    }
    if (await env.NOTIFIER_KV.get(`waiting_for:${chatId}`) === 'anilist_username' && !text.startsWith('/')) {
        return notifier_handleTextMessage(message, env);
    }
    switch (text) {
        case '🔍 جستجوی انیمه':
            userData.waitingFor = 'anime_search';
            await assistant_setUserData(chatId, userData, env);
            await sendMessage(chatId, "لطفاً نام انیمه مورد نظر را ارسال کنید:", {}, env);
            return;
        case '🎲 انیمه تصادفی':
            return assistant_handleRandomAnime(chatId, env);
        case '🏆 انیمه‌های برتر':
            return assistant_handleTopAnime(chatId, 1, env);
        case '📅 انیمه‌های فصلی':
            return assistant_handleSeasonalAnime(chatId, 1, env);
        case '🔔 تنظیمات اعلان‌ها':
            await sendMessage(chatId, "از منوی زیر، گزینه مورد نظر را برای مدیریت اعلان‌ها انتخاب کنید:", ASSISTANT_CONSTANTS.NOTIFIER_KEYBOARD, env);
            return;
        case '🔑 ثبت/تغییر API':
            const apiHelpText = `<b>راهنمای دریافت و ثبت کلید API برای Google AI Studio (Gemini)</b>\n\n` + `با ثبت کلید API، قابلیت چت با شخصیت‌های انیمه‌ای برای شما فعال می‌شود.\n\n` + `<b>مراحل دریافت کلید:</b>\n` + `1. به وب‌سایت <a href="https://aistudio.google.com/">Google AI Studio</a> مراجعه کنید.\n` + `2. با حساب گوگل خود وارد شوید.\n` + `3. از منوی سمت چپ، روی گزینه "Get API key" کلیک کنید.\n` + `4. روی دکمه "Create API key in new project" کلیک کنید.\n` + `5. کلید ساخته شده را کپی کنید. این کلید یک رشته طولانی از حروف و اعداد است.\n\n` + `<b>نحوه ثبت در ربات:</b>\n` + `پس از کپی کردن کلید، آن را به شکل زیر برای ربات ارسال کنید (کلید خود را جایگزین ` + `<code>YOUR_API_KEY</code>` + ` کنید):\n\n` + `<code>/set_api YOUR_API_KEY</code>\n\n` + `⚠️ <b>توجه:</b> کلید API شما محرمانه است. آن را با دیگران به اشتراک نگذارید.`;
            await sendMessage(chatId, apiHelpText, { parse_mode: 'HTML', disable_web_page_preview: true }, env);
            return;
    }
    if (text.startsWith("/start")) {
        const welcomeText = `سلام ${message.from.first_name}! 👋\n` + "به ربات Aniran خوش آمدی.\n\n" + "از منوی زیر برای دسترسی سریع به قابلیت‌ها استفاده کن. برای جستجوی زنده، در هر چتی نام کاربری ربات را تایپ کن و بعد از آن اسم انیمه را بنویس.\n\n" + "توسعه‌ دهنده : Abolfazl_ASDBV";
        return sendMessage(chatId, welcomeText, ASSISTANT_CONSTANTS.MAIN_KEYBOARD, env);
    }
    if (text.startsWith("/help") || text === '❓ راهنما') {
        const helpText = "<b>راهنمای کامل دستورات ربات:</b>\n\n" + "🔰 <b>بخش دستیار انیمه (از طریق منو یا دستور):</b>\n" + "🔹 <b>/anime [نام انیمه]</b> - جستجوی انیمه\n" + "🔹 <b>/topanime</b> - نمایش انیمه‌های برتر\n" + "🔹 <b>/seasonal</b> - نمایش انیمه‌های این فصل\n" + "🔹 <b>/randomanime</b> - پیشنهاد یک انیمه تصادفی با امتیاز بالای 7.5\n" + "🔹 <b>/set_api [کلید]</b> - ثبت کلید API برای چت با شخصیت‌ها\n" + "🔹 <b>/endchat</b> - پایان دادن به گفتگوی فعلی\n" + "🔹 <b>ارسال عکس</b> - پیدا کردن انیمه از روی عکس\n\n" + "🔔 <b>بخش اعلان‌ها (از طریق منو):</b>\n" + "🔸 <b>ثبت‌نام</b> - برای دریافت اعلان قسمت جدید\n" + "🔸 <b>پخش‌های امروز</b> - نمایش انیمه‌هایی که امروز قسمت جدیدشان آمده\n" + "🔸 <b>حذف اطلاعات</b> - حذف کامل اطلاعات شما از سیستم اعلان‌ها";
        await sendMessage(chatId, helpText, { parse_mode: 'HTML', ...ASSISTANT_CONSTANTS.MAIN_KEYBOARD }, env);
    } else if (text.startsWith("/set_api")) await assistant_handleSetApiCommand(message, env);
    else if (text.startsWith("/endchat")) await assistant_handleEndChatCommand(message, userData, env);
    else if (text.startsWith("/anime")) {
        const query = text.split(' ').slice(1).join(' ');
        if (!query) await sendMessage(chatId, "لطفاً نام انیمه‌ای که می‌خواهید جستجو کنید را وارد کنید. مثال: `/anime Naruto`", {}, env);
        else await assistant_handleAnimeSearch(chatId, query, 1, env);
    } else if (text.startsWith("/topanime")) await assistant_handleTopAnime(chatId, 1, env);
    else if (text.startsWith("/seasonal")) await assistant_handleSeasonalAnime(chatId, 1, env);
    else if (text.startsWith("/randomanime")) await assistant_handleRandomAnime(chatId, env);
    else if (text.startsWith("/showdetails_")) {
        const animeId = text.split('_')[1];
        if (animeId) await assistant_sendFullAnimeDetails(chatId, animeId, env);
    } else if (!Object.values(ASSISTANT_CONSTANTS.MAIN_KEYBOARD.reply_markup.keyboard).flat().some(btn => btn.text === text)) {
        await sendMessage(chatId, "دستور نامشخص است. از منوی کیبوردی استفاده کنید یا برای راهنمایی /help را ارسال کنید.", {}, env);
    }
}

async function handleAssistantCallbackQuery(callbackQuery, env) {
    const dataParts = callbackQuery.data.split('_');
    const [type, action] = dataParts;
    const chatId = callbackQuery.message.chat.id;
    await answerCallbackQuery(callbackQuery.id, '', false, env);
    try {
        if (type === 'details' && action === 'select') {
            const animeId = dataParts[2];
            await deleteMessage(chatId, callbackQuery.message.message_id, env);
            await assistant_sendFullAnimeDetails(chatId, animeId, env);
        } else if (type === 'top' && action === 'page') {
            const page = parseInt(dataParts[2], 10);
            await assistant_handleTopAnime(chatId, page, env, callbackQuery.message.message_id);
        } else if (type === 'seasonal' && action === 'page') {
            const page = parseInt(dataParts[2], 10);
            await assistant_handleSeasonalAnime(chatId, page, env, callbackQuery.message.message_id);
        } else if (type === 'search' && action === 'page') {
            const query = decodeURIComponent(dataParts[2]);
            const page = parseInt(dataParts[3], 10);
            await assistant_handleAnimeSearch(chatId, query, page, env, callbackQuery.message.message_id);
        } else if (type === 'jikan' && action === 'char') {
            const animeId = dataParts[2];
            const userData = await assistant_getUserData(chatId, env);
            if (!userData?.apiKey) {
                await sendMessage(chatId, "⚠️ برای استفاده از این قابلیت، ابتدا با دستور `/set_api` کلید API خود را ثبت کنید.", {}, env);
                return;
            }
            const { data } = await jikanApiRequest(`anime/${animeId}/characters`);
            if (data?.length) {
                await sendMessage(chatId, "شخصیت‌های اصلی (برای چت کلیک کنید):", {}, env);
                for (const item of data.slice(0, 5)) {
                    const char = item.character;
                    if (char.images?.jpg?.image_url) {
                        await sendPhoto(chatId, char.images.jpg.image_url, { caption: `<b>${char.name}</b>\n<i>${item.role}</i>`, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "💬 چت با این شخصیت", callback_data: `chat_start_${animeId}_${char.mal_id}` }]] } }, env);
                    }
                }
            } else {
                await sendMessage(chatId, "شخصیتی برای این انیمه یافت نشد.", {}, env);
            }
        } else if (type === 'jikan' && action === 'rec') {
            const animeId = dataParts[2];
            const { data } = await jikanApiRequest(`anime/${animeId}/recommendations`);
            if (data?.length > 0) {
                const keyboard = data.slice(0, 5).map((rec, i) => ([{ text: `${i + 1}. ${rec.entry.title}`, callback_data: `details_select_${rec.entry.mal_id}` }]));
                await sendMessage(chatId, "<b>🤝 انیمه‌های پیشنهادی مشابه:</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }, env);
            } else {
                await sendMessage(chatId, "انیمه مشابهی یافت نشد.", {}, env);
            }
        } else if (type === 'chat' && action === 'start') {
            const animeId = dataParts[2];
            const charId = dataParts[3];
            const userName = callbackQuery.from.first_name;
            await assistant_startChatSession(chatId, animeId, charId, userName, env);
        } else if (type === 'notify') {
            try { await deleteMessage(chatId, callbackQuery.message.message_id, env); } catch (e) { }
            if (action === 'register') {
                const existingUser = await env.NOTIFIER_KV.get(`user:${chatId}`);
                if (existingUser) {
                    await sendMessage(chatId, 'حساب شما از قبل ثبت شده است. ✅ برای بروزرسانی، مجدداً نام کاربری خود را وارد کنید.', {}, env);
                }
                await env.NOTIFIER_KV.put(`waiting_for:${chatId}`, 'anilist_username');
                await sendMessage(chatId, '🤖 لطفاً نام کاربری **Anilist.co** خود را برای فعال‌سازی یا بروزرسانی اعلان‌ها وارد کنید:', { parse_mode: 'Markdown' }, env);
            } else if (action === 'today') {
                await notifier_handleTodayCommand(chatId, env);
            } else if (action === 'reset') {
                await notifier_handleResetCommand(chatId, env);
            }
        }
    } catch (e) {
        await sendMessage(chatId, assistant_getErrorMessage(e, "پردازش دکمه"), {}, env);
    }
}
