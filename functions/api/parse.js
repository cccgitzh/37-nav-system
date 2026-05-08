/**
 * 37° Nav - 边缘智能靶向解析 API (Llama-3.1 + 内网穿透容错版)
 */

export async function onRequest(context) {
    const request = context.request;
    const env = context.env;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const url = new URL(request.url);
        let targetUrl = url.searchParams.get('url');

        if (!targetUrl && request.method === 'POST') {
            const body = await request.json().catch(() => ({}));
            targetUrl = body.url;
        }

        if (!targetUrl) return new Response(JSON.stringify({ error: "Missing URL" }), { status: 400, headers: corsHeaders });
        if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;
        
        const targetUrlObj = new URL(targetUrl);
        let domain = targetUrlObj.hostname.replace(/^www\./, '');
        const domainParts = domain.split('.');
        const rootDomain = domainParts.length > 2 ? domainParts.slice(-2).join('.') : domain;

        // 【新增】判断是否为局域网 IP 或 Localhost
        const isLocalIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.|localhost)/.test(domain);

        const knownSites = {
            'github.com': { title: 'GitHub', icon: 'https://github.githubassets.com/favicons/favicon.svg', description: '全球最大的开源代码托管与版本控制中枢。' },
            'x.com': { title: 'X (Twitter)', icon: 'https://abs.twimg.com/favicons/twitter.3.ico', description: '全球实时资讯与社交互动网络。' }
        };
        if (knownSites[domain]) return new Response(JSON.stringify(knownSites[domain]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        // 如果是内网 IP，边缘服务器直接放弃请求网页（因为连不上），直接返回前端要求进行“本地直连穿透”
        if (isLocalIP) {
            return new Response(JSON.stringify({
                title: domain,
                icon: "", // 留空，触发前端本地 /favicon.ico 穿透
                description: '🏠 局域网/本地星体节点，已切换为本地浏览器直连模式。'
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        let fetchResponse;
        try {
            fetchResponse = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
                },
                signal: controller.signal,
                redirect: 'follow'
            });
            clearTimeout(timeoutId);
        } catch (e) {
            clearTimeout(timeoutId);
            return new Response(JSON.stringify({
                title: domain.charAt(0).toUpperCase() + domain.slice(1),
                icon: `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(targetUrl)}&size=128`, 
                description: '⚠️ 目标星体响应超时，强制熔断。'
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        let extracted = { title: '', ogTitle: '', desc: '', ogDesc: '', bodyText: '', appleIcon: '', icon: '', shortcutIcon: '' };

        const rewriter = new HTMLRewriter()
            .on('title', { text(text) { extracted.title += text.text; } })
            .on('meta', {
                element(el) {
                    const name = (el.getAttribute('name') || '').toLowerCase();
                    const prop = (el.getAttribute('property') || '').toLowerCase();
                    const content = el.getAttribute('content') || '';
                    if (name === 'description') extracted.desc = content;
                    if (prop === 'og:description') extracted.ogDesc = content;
                    if (prop === 'og:title') extracted.ogTitle = content;
                }
            })
            .on('link', {
                element(el) {
                    const rel = (el.getAttribute('rel') || '').toLowerCase();
                    const href = el.getAttribute('href') || '';
                    if (!href) return;
                    if (rel === 'apple-touch-icon' || rel === 'apple-touch-icon-precomposed') extracted.appleIcon = href;
                    else if (rel === 'icon') extracted.icon = href;
                    else if (rel === 'shortcut icon') extracted.shortcutIcon = href;
                }
            })
            .on('body', { text(text) { if (extracted.bodyText.length < 5000) extracted.bodyText += text.text + ' '; } });

        await rewriter.transform(fetchResponse).text();
        extracted.bodyText = extracted.bodyText.replace(/\s+/g, ' ').trim();
        const finalTitleRaw = (extracted.ogTitle || extracted.title).trim() || domain;

        let finalIcon = extracted.appleIcon || extracted.icon || extracted.shortcutIcon;
        if (finalIcon) {
            try { finalIcon = new URL(finalIcon, targetUrl).href; } 
            catch (e) { finalIcon = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(targetUrl)}&size=128`; }
        } else {
            finalIcon = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(targetUrl)}&size=128`;
        }

        if (!env.AI) {
            return new Response(JSON.stringify({ title: finalTitleRaw, icon: finalIcon, description: (extracted.ogDesc || extracted.desc).substring(0, 150) || '未检测到 AI 算力。' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        let rawDesc = extracted.ogDesc || extracted.desc || '';
        let aiResult = { title: finalTitleRaw, description: rawDesc.substring(0, 100) };

        try {
            const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { 
                messages: [
                    { role: 'system', content: `你是一个精通网页元数据的极客。请分析用户提供的网页源码并提取核心信息。
限制指令：
1. 只能使用简体中文输出。
2. 提炼网站核心用途，一针见血，绝不废话，不需要包含“这是一个提供...”之类的字眼。
3. 只能输出纯JSON格式，严禁包含Markdown代码块、换行符或额外解释。
4. 严格按照格式：{"title": "精简名称", "description": "高度浓缩中文介绍"}。` },
                    { role: 'user', content: `TITLE: ${finalTitleRaw}\nDESC: ${rawDesc}\nTEXT: ${extracted.bodyText}`.substring(0, 1500) }
                ] 
            });
            const jsonMatch = (aiResponse.response || '').match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.title) aiResult.title = parsed.title;
                if (parsed.description) aiResult.description = parsed.description;
            }
        } catch (e) {}

        return new Response(JSON.stringify({
            title: aiResult.title || finalTitleRaw,
            icon: finalIcon,
            description: aiResult.description || '暂无简介'
        }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } catch (globalError) {
        return new Response(JSON.stringify({ title: "解析异常", icon: "", description: "系统异常。" }), { status: 200, headers: corsHeaders });
    }
}