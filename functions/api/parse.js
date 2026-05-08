/**
 * 37° Nav - 边缘智能靶向解析 API (Llama-3.1 终极调教版)
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
        let domain = targetUrlObj.hostname.replace(/^www\./, '');
        const domainParts = domain.split('.');
        const rootDomain = domainParts.length > 2 ? domainParts.slice(-2).join('.') : domain;

        // 【屏蔽内网】判断是否为局域网 IP
        const isLocalIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.|localhost)/.test(domain);

        const knownSites = {
            'github.com': { title: 'GitHub', icon: 'https://github.githubassets.com/favicons/favicon.svg', description: '全球最大的开源代码托管与版本控制中枢。' },
            'x.com': { title: 'X (Twitter)', icon: 'https://abs.twimg.com/favicons/twitter.3.ico', description: '全球实时资讯与社交互动网络。' },
            'youtube.com': { title: 'YouTube', icon: 'https://www.youtube.com/s/desktop/10c128fa/img/favicon_144x144.png', description: '全球最大的流媒体视频分享与创作者生态。' }
        };
        if (knownSites[domain]) return new Response(JSON.stringify(knownSites[domain]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        if (isLocalIP) {
            return new Response(JSON.stringify({
                title: domain,
                icon: "", 
                description: '🏠 局域网星体节点，已启用本地直连穿透。'
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
                description: '⚠️ 目标星体响应超时或拒绝访问。'
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        // 【增强抓取】：加入 h1 和 keywords 嗅探，应对没正文的 Vue/React 网站
        let extracted = { title: '', ogTitle: '', desc: '', ogDesc: '', keywords: '', h1: '', bodyText: '', appleIcon: '', icon: '', shortcutIcon: '' };

        const rewriter = new HTMLRewriter()
            .on('title', { text(text) { extracted.title += text.text; } })
            .on('h1', { text(text) { extracted.h1 += text.text + ' '; } })
            .on('meta', {
                element(el) {
                    const name = (el.getAttribute('name') || '').toLowerCase();
                    const prop = (el.getAttribute('property') || '').toLowerCase();
                    const content = el.getAttribute('content') || '';
                    if (name === 'description') extracted.desc = content;
                    if (name === 'keywords') extracted.keywords = content;
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
            .on('body', { text(text) { if (extracted.bodyText.length < 3000) extracted.bodyText += text.text + ' '; } });

        await rewriter.transform(fetchResponse).text();
        extracted.bodyText = extracted.bodyText.replace(/\s+/g, ' ').trim();
        const finalTitleRaw = (extracted.ogTitle || extracted.title).trim() || domain;
        const rawDesc = extracted.ogDesc || extracted.desc || '';

        // 图标回溯算法
        let finalIcon = extracted.appleIcon || extracted.icon || extracted.shortcutIcon;
        if (finalIcon) {
            try { finalIcon = new URL(finalIcon, targetUrl).href; } 
            catch (e) { finalIcon = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(targetUrl)}&size=128`; }
        } else {
            finalIcon = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(targetUrl)}&size=128`;
        }

        // 本地逻辑降级处理（防爬虫拦截）
        const wafKeywords = ['just a moment', 'attention required', 'enable javascript', '验证码', 'cloudflare', 'security check'];
        if (wafKeywords.some(kw => extracted.bodyText.toLowerCase().includes(kw) || finalTitleRaw.toLowerCase().includes(kw)) || fetchResponse.status === 403) {
            return new Response(JSON.stringify({ 
                title: domain.charAt(0).toUpperCase() + domain.slice(1), 
                icon: finalIcon, 
                description: '⚠️ 防爬虫屏障激活，请手动覆写节点特征。' 
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        if (!env.AI) {
            return new Response(JSON.stringify({ title: finalTitleRaw, icon: finalIcon, description: rawDesc.substring(0, 150) || '未检测到 AI 算力。' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        let aiResult = { title: finalTitleRaw, description: rawDesc.substring(0, 100) };

        try {
            // 【终极 AI 调教】：Few-Shot 提示词工程，教 AI 做人
            const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { 
                messages: [
                    { role: 'system', content: `你是一个最顶级的极客导航网站编辑。你需要从杂乱的网页源码文本中提取出干净的品牌名和一句话简介。
绝对规则：
1. Title：必须极度精简！剔除所有的口号、副标题和后缀。例如，如果原标题是"V2EX - 真正好玩的极客社区 - Powered by PB3"，你只能输出"V2EX"。
2. Description：用一句简短的简体中文人话概括网站功能（不超过30个字）。不能包含"这是一个提供..."的废话。
3. 如果内容是乱码或完全无关（如 "You need to enable JS"），根据 url 域名凭常识编一个。
4. 必须且只能输出严格的 JSON，不能有任何其他多余字符或 Markdown 标记。` },
                    { role: 'user', content: `[参考示例]
TITLE: 百度一下，你就知道
DESC: 百度是全球最大的中文搜索引擎、致力于让网民更便捷地获取信息，找到所求。
JSON: {"title": "百度", "description": "全球最大的中文搜索引擎。"}

[你的任务]
TITLE: ${finalTitleRaw}
DESC: ${rawDesc}
H1: ${extracted.h1}
TEXT: ${extracted.bodyText}`.substring(0, 2000) }
                ] 
            });

            // 暴力提取 JSON
            const jsonMatch = (aiResponse.response || '').match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                // AI 生成如果太扯淡，降级使用原生抓取的数据
                if (parsed.title && parsed.title.length < 30) aiResult.title = parsed.title;
                if (parsed.description) aiResult.description = parsed.description;
            }
        } catch (e) {
            console.error("AI 提取异常:", e);
        }

        return new Response(JSON.stringify({
            title: aiResult.title || finalTitleRaw,
            icon: finalIcon,
            description: aiResult.description || '暂无特征数据'
        }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } catch (globalError) {
        return new Response(JSON.stringify({ title: "解析异常", icon: "", description: "引擎遇到未知错误。" }), { status: 200, headers: corsHeaders });
    }
}