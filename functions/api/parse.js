/**
 * 37° Nav - 边缘智能靶向解析 API (高清图标解禁版)
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

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const url = new URL(request.url);
        let targetUrl = url.searchParams.get('url');

        if (!targetUrl && request.method === 'POST') {
            const body = await request.json().catch(() => ({}));
            targetUrl = body.url;
        }

        if (!targetUrl) {
            return new Response(JSON.stringify({ error: "Missing target URL" }), { 
                status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
            });
        }

        if (!targetUrl.startsWith('http')) {
            targetUrl = 'https://' + targetUrl;
        }
        const targetUrlObj = new URL(targetUrl);
        const domain = targetUrlObj.hostname.replace(/^www\./, '');

        // === 第二层：星图知识库短路 (已全部升级为真实高清图标) ===
        const knownSites = {
            'github.com': { title: 'GitHub', icon: 'https://github.githubassets.com/favicons/favicon.svg', description: '全球最大的开源代码托管与版本控制中枢。' },
            'x.com': { title: 'X (Twitter)', icon: 'https://abs.twimg.com/favicons/twitter.3.ico', description: '全球实时资讯与社交互动网络。' },
            'chatgpt.com': { title: 'ChatGPT', icon: 'https://cdn.oaistatic.com/_next/static/media/favicon-32x32.be48395e.png', description: 'OpenAI 旗下领先的通用人工智能对话助手。' },
            'youtube.com': { title: 'YouTube', icon: 'https://www.youtube.com/s/desktop/10c128fa/img/favicon_144x144.png', description: '全球最大的流媒体视频分享与创作者生态。' },
            'cloudflare.com': { title: 'Cloudflare', icon: 'https://www.cloudflare.com/favicon.ico', description: '全球领先的边缘计算与网络安全防护基建。' },
            'nodeseek.com': { title: 'NodeSeek', icon: 'https://www.nodeseek.com/static/favicon.png', description: '极客和开发者的交流社区，主机玩家聚集地。' }
        };

        if (knownSites[domain]) {
            return new Response(JSON.stringify(knownSites[domain]), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // === 第一层：先遣探测 ===
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

        // === 第三层：边缘流式剥离 ===
        let extracted = { title: '', ogTitle: '', desc: '', ogDesc: '', bodyText: '', appleIcon: '', ogImage: '', icon: '', shortcutIcon: '' };

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
                    if (prop === 'og:image') extracted.ogImage = content;
                }
            })
            .on('link', {
                element(el) {
                    const rel = (el.getAttribute('rel') || '').toLowerCase();
                    const href = el.getAttribute('href') || '';
                    if (!href) return;
                    if (rel === 'apple-touch-icon') extracted.appleIcon = href;
                    else if (rel === 'icon') extracted.icon = href;
                    else if (rel === 'shortcut icon') extracted.shortcutIcon = href;
                }
            })
            .on('body', { 
                text(text) { 
                    if (extracted.bodyText.length < 5000) { extracted.bodyText += text.text + ' '; }
                } 
            });

        await rewriter.transform(fetchResponse).text();

        extracted.bodyText = extracted.bodyText.replace(/\s+/g, ' ').trim();
        const finalTitleRaw = (extracted.ogTitle || extracted.title).trim() || domain;

        // 【核心提取】处理真实的高清图标路径
        let finalIcon = extracted.appleIcon || extracted.ogImage || extracted.icon || extracted.shortcutIcon;
        if (finalIcon) {
            try {
                finalIcon = new URL(finalIcon, targetUrl).href;
            } catch (e) {
                finalIcon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
            }
        } else {
            finalIcon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
        }

        // === 第四层：护盾感知 ===
        const wafKeywords = ['just a moment', 'attention required', '验证码', 'cloudflare', 'security check'];
        const bodyLower = extracted.bodyText.toLowerCase();
        const titleLower = finalTitleRaw.toLowerCase();
        const isWafDetected = wafKeywords.some(kw => bodyLower.includes(kw) || titleLower.includes(kw));

        if (isWafDetected || fetchResponse.status === 403 || fetchResponse.status === 503) {
            return new Response(JSON.stringify({
                title: domain.charAt(0).toUpperCase() + domain.slice(1),
                icon: finalIcon,
                description: '⚠️ 目标星体开启了反爬虫屏障，请手动录入特征。'
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        // === 第五层：大语言模型 ===
        if (!env.AI) {
            return new Response(JSON.stringify({
                title: finalTitleRaw,
                icon: finalIcon,
                description: (extracted.ogDesc || extracted.desc).substring(0, 150) || '未检测到 AI 算力节点，基础解析完成。'
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        let rawDesc = extracted.ogDesc || extracted.desc || '';
        const promptContent = `标题: ${finalTitleRaw}\n网站Meta描述: ${rawDesc}\n正文片段: ${extracted.bodyText}`.substring(0, 1200);
        let aiResult = { title: finalTitleRaw, description: rawDesc.substring(0, 100) };

        try {
            const messages = [
                {
                    role: 'system',
                    content: `你是一个有10年经验的中国资深网民。请根据网页标题和内容，一针见血总结网站用途，拒绝废话。强制返回严谨的JSON格式：{"title": "精简名称", "description": "中文总结"}`
                },
                { role: 'user', content: promptContent }
            ];

            const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', { messages });
            const responseText = aiResponse.response || '';
            
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.title) aiResult.title = parsed.title;
                if (parsed.description) aiResult.description = parsed.description;
            }
        } catch (aiError) {
            aiResult.description = rawDesc.substring(0, 150) || '⚠️ AI 语义压缩异常，提取基础描述。';
        }

        // 返回最终数据
        return new Response(JSON.stringify({
            title: aiResult.title || finalTitleRaw,
            icon: finalIcon, // 输出真实图片网址
            description: aiResult.description || '暂无简介'
        }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } catch (globalError) {
        return new Response(JSON.stringify({
            title: "节点解析崩溃",
            icon: "https://icons.duckduckgo.com/ip3/error.ico",
            description: "⚠️ 目标星体解析引发系统级异常，请手动录入特征。"
        }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
}