/**
 * 37° Nav - 边缘智能靶向解析 API (严谨方形图标版)
 * 架构：Cloudflare Pages + HTMLRewriter + Workers AI
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
        const domain = targetUrlObj.hostname.replace(/^www\./, '');

        // 知识库短路
        const knownSites = {
            'github.com': { title: 'GitHub', icon: 'https://github.githubassets.com/favicons/favicon.svg', description: '全球最大的开源代码托管与版本控制中枢。' },
            'x.com': { title: 'X (Twitter)', icon: 'https://abs.twimg.com/favicons/twitter.3.ico', description: '全球实时资讯与社交互动网络。' },
            'youtube.com': { title: 'YouTube', icon: 'https://www.youtube.com/s/desktop/10c128fa/img/favicon_144x144.png', description: '全球最大的流媒体视频分享与创作者生态。' }
        };
        if (knownSites[domain]) return new Response(JSON.stringify(knownSites[domain]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        let fetchResponse;
        try {
            fetchResponse = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                },
                signal: controller.signal,
                redirect: 'follow'
            });
            clearTimeout(timeoutId);
        } catch (e) {
            clearTimeout(timeoutId);
            return new Response(JSON.stringify({
                title: domain.charAt(0).toUpperCase() + domain.slice(1),
                icon: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`, 
                description: '⚠️ 目标星体响应超时或拒绝连接，强制熔断。'
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
                    // 【核心修复】严格只抓取方形图标，彻底抛弃可能导致长方形的 og:image
                    if (rel === 'apple-touch-icon' || rel === 'apple-touch-icon-precomposed') extracted.appleIcon = href;
                    else if (rel === 'icon') extracted.icon = href;
                    else if (rel === 'shortcut icon') extracted.shortcutIcon = href;
                }
            })
            .on('body', { text(text) { if (extracted.bodyText.length < 5000) extracted.bodyText += text.text + ' '; } });

        await rewriter.transform(fetchResponse).text();

        extracted.bodyText = extracted.bodyText.replace(/\s+/g, ' ').trim();
        const finalTitleRaw = (extracted.ogTitle || extracted.title).trim() || domain;

        // 【严格验证逻辑】
        let finalIcon = extracted.appleIcon || extracted.icon || extracted.shortcutIcon;
        if (finalIcon) {
            try {
                finalIcon = new URL(finalIcon, targetUrl).href;
            } catch (e) {
                // 如果解析出的 URL 是坏的，使用 Google 128px 纯方形图标接口兜底
                finalIcon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
            }
        } else {
            // 如果没抓到标准 Icon，直接用 Google 接口兜底
            finalIcon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
        }

        const wafKeywords = ['just a moment', 'attention required', '验证码', 'cloudflare', 'security check'];
        if (wafKeywords.some(kw => extracted.bodyText.toLowerCase().includes(kw) || finalTitleRaw.toLowerCase().includes(kw)) || fetchResponse.status === 403) {
            return new Response(JSON.stringify({ title: domain, icon: finalIcon, description: '⚠️ 目标星体开启了反爬虫屏障，请手动录入特征。' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        if (!env.AI) {
            return new Response(JSON.stringify({ title: finalTitleRaw, icon: finalIcon, description: (extracted.ogDesc || extracted.desc).substring(0, 150) || '未检测到 AI 算力。' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        let rawDesc = extracted.ogDesc || extracted.desc || '';
        let aiResult = { title: finalTitleRaw, description: rawDesc.substring(0, 100) };

        try {
            const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', { 
                messages: [
                    { role: 'system', content: `你是一个资深网民。请根据网页内容，一针见血总结网站用途，拒绝废话。强制返回严谨的JSON格式：{"title": "精简名称", "description": "中文总结"}` },
                    { role: 'user', content: `标题: ${finalTitleRaw}\n描述: ${rawDesc}\n正文: ${extracted.bodyText}`.substring(0, 1200) }
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
        return new Response(JSON.stringify({ title: "解析崩溃", icon: "", description: "系统异常。" }), { status: 200, headers: corsHeaders });
    }
}