/**
 * 37° Nav - 边缘智能靶向解析 API (Pages Functions 版)
 * 架构：Cloudflare Pages + HTMLRewriter + Workers AI
 */

export async function onRequest(context) {
    // 从 context 中解构出 request 和 env，完美适配你之前的核心逻辑
    const request = context.request;
    const env = context.env;

    // 0. CORS 跨域与预检请求处理
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // 获取目标 URL
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

        // === 第二层：星图知识库短路 ===
        const knownSites = {
            'github.com': { title: 'GitHub', icon: 'fa-brands fa-github', description: '全球最大的开源代码托管与版本控制中枢。' },
            'x.com': { title: 'X (Twitter)', icon: 'fa-brands fa-twitter', description: '全球实时资讯与社交互动网络。' },
            'chatgpt.com': { title: 'ChatGPT', icon: 'fa-solid fa-robot', description: 'OpenAI 旗下领先的通用人工智能对话助手。' },
            'youtube.com': { title: 'YouTube', icon: 'fa-brands fa-youtube', description: '全球最大的流媒体视频分享与创作者生态。' },
            'cloudflare.com': { title: 'Cloudflare', icon: 'fa-solid fa-cloud', description: '全球领先的边缘计算与网络安全防护基建。' }
        };

        if (knownSites[domain]) {
            return new Response(JSON.stringify(knownSites[domain]), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // === 第一层：先遣探测与防反制 ===
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5秒熔断

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
                icon: 'fa-solid fa-link', 
                description: '⚠️ 目标星体响应超时或拒绝连接，强制熔断。'
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        // === 第三层：边缘流式剥离 ===
        let extracted = { title: '', ogTitle: '', desc: '', ogDesc: '', bodyText: '' };

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
            .on('body', { 
                text(text) { 
                    if (extracted.bodyText.length < 5000) { extracted.bodyText += text.text + ' '; }
                } 
            });

        await rewriter.transform(fetchResponse).text();

        extracted.bodyText = extracted.bodyText.replace(/\s+/g, ' ').trim();
        const finalTitleRaw = (extracted.ogTitle || extracted.title).trim() || domain;

        // === 第四层：护盾感知与降级兜底 ===
        const wafKeywords = ['just a moment', 'attention required', '验证码', 'cloudflare', 'security check'];
        const bodyLower = extracted.bodyText.toLowerCase();
        const titleLower = finalTitleRaw.toLowerCase();
        const isWafDetected = wafKeywords.some(kw => bodyLower.includes(kw) || titleLower.includes(kw));

        if (isWafDetected || fetchResponse.status === 403 || fetchResponse.status === 503) {
            return new Response(JSON.stringify({
                title: domain.charAt(0).toUpperCase() + domain.slice(1),
                icon: 'fa-solid fa-shield-halved',
                description: '⚠️ 目标星体开启了反爬虫屏障，请手动录入特征。'
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        // === 第五层：大语言模型总结 ===
        if (!env.AI) {
            return new Response(JSON.stringify({
                title: finalTitleRaw,
                icon: 'fa-solid fa-globe',
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

        // 终极输出 (统一返回 FontAwesome 图标以契合你的星际 UI)
        return new Response(JSON.stringify({
            title: aiResult.title || finalTitleRaw,
            icon: 'fa-solid fa-rocket',
            description: aiResult.description || '暂无简介'
        }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } catch (globalError) {
        return new Response(JSON.stringify({
            title: "节点解析崩溃",
            icon: "fa-solid fa-bug",
            description: "⚠️ 目标星体解析引发系统级异常，请手动录入特征。"
        }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
}