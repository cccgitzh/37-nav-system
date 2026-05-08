/**
 * 37° Nav - 边缘智能靶向解析 API (通义千问 Qwen-14B 极客网感特化版)
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

        // 判断是否为局域网/本地 IP
        const isLocalIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.|localhost)/.test(domain);

        // 【星图知识库：加入常用大站的绝对简称】
        const knownSites = {
            'github.com': { title: 'GitHub', icon: 'https://github.githubassets.com/favicons/favicon.svg', description: '全球最大开源代码托管与程序员交友社区。' },
            'x.com': { title: '推特 (X)', icon: 'https://abs.twimg.com/favicons/twitter.3.ico', description: '全球实时社交与资讯吃瓜网络。' },
            'twitter.com': { title: '推特 (X)', icon: 'https://abs.twimg.com/favicons/twitter.3.ico', description: '全球实时社交与资讯吃瓜网络。' },
            'youtube.com': { title: '油管 (YouTube)', icon: 'https://www.youtube.com/s/desktop/10c128fa/img/favicon_144x144.png', description: '全球最大的流媒体视频分享生态。' },
            'bilibili.com': { title: 'B站', icon: 'https://www.bilibili.com/favicon.ico', description: '国内最大的年轻人弹幕视频网站。' },
            'v2ex.com': { title: 'V站 (V2EX)', icon: 'https://www.v2ex.com/favicon.ico', description: '创意工作者与程序员的极客交流社区。' },
            'nodeseek.com': { title: 'NodeSeek', icon: 'https://www.nodeseek.com/favicon.ico', description: '极客与开发者交流社区，全球主机玩家(MJJ)聚集地。' }
        };
        if (knownSites[domain]) return new Response(JSON.stringify(knownSites[domain]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        // 内网直连穿透逻辑
        if (isLocalIP) {
            return new Response(JSON.stringify({
                title: domain,
                icon: "", 
                description: '🏠 局域网/本地星体节点，已切换为本地直连模式。'
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
                description: '⚠️ 目标星体响应超时或拒绝连接。'
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        let extracted = { title: '', ogTitle: '', desc: '', ogDesc: '', h1: '', bodyText: '', appleIcon: '', icon: '', shortcutIcon: '' };

        const rewriter = new HTMLRewriter()
            .on('title', { text(text) { extracted.title += text.text; } })
            .on('h1', { text(text) { extracted.h1 += text.text + ' '; } })
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
            .on('body', { text(text) { if (extracted.bodyText.length < 3000) extracted.bodyText += text.text + ' '; } });

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

        const wafKeywords = ['just a moment', 'attention required', 'enable javascript', '验证码', 'cloudflare', 'security check'];
        if (wafKeywords.some(kw => extracted.bodyText.toLowerCase().includes(kw) || finalTitleRaw.toLowerCase().includes(kw)) || fetchResponse.status === 403) {
            return new Response(JSON.stringify({ 
                title: domain.charAt(0).toUpperCase() + domain.slice(1), 
                icon: finalIcon, 
                description: '⚠️ 防爬虫屏障激活，请手动覆写节点特征。' 
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        if (!env.AI) {
            return new Response(JSON.stringify({ title: finalTitleRaw, icon: finalIcon, description: (extracted.ogDesc || extracted.desc).substring(0, 150) || '未检测到 AI 算力。' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        let rawDesc = extracted.ogDesc || extracted.desc || '';
        let aiResult = { title: finalTitleRaw, description: rawDesc.substring(0, 100) };

        try {
            // 【网感特化 Prompt】：强制 Qwen 扮演资深网民，使用接地气的简称
            const aiResponse = await env.AI.run('@cf/qwen/qwen1.5-14b-chat-awq', { 
                messages: [
                    { role: 'system', content: `你是一个混迹中文互联网多年的资深极客。你需要从杂乱的网页源码中提取最精简的网站名称和介绍。
绝对规则：
1. 名称提取：必须使用【网民最常用、最口语化的简称】！例如：看到“哔哩哔哩 (゜-゜)つロ 干杯~”必须输出“B站”，看到“V2EX”输出“V站”，看见“淘宝网”输出“淘宝”。彻底剔除官方宣传口号。
2. 简介提取：用极客/网民的口吻，一针见血地总结核心功能，限30字内。绝对不要用“这是一个提供...的网站”这种机器人口吻，要说人话。
3. 如果内容是纯乱码或报错代码，请只根据 URL 推测网站名称，简介输出“暂无有效数据”。
4. 必须且只能输出严格的纯JSON格式，严禁带有Markdown代码块(如\`\`\`json)、换行符或多余解释。
格式要求：{"title": "网民常用简称", "description": "接地气的简介"}` },
                    { role: 'user', content: `[待解析数据]
TITLE: ${finalTitleRaw}
DESC: ${rawDesc}
H1: ${extracted.h1}
TEXT: ${extracted.bodyText}`.substring(0, 2000) }
                ] 
            });

            // 严谨正则提取 JSON，防止大模型抽风附带闲聊
            let responseText = aiResponse.response || '';
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.title && parsed.title.length < 25) aiResult.title = parsed.title;
                if (parsed.description) aiResult.description = parsed.description;
            }
        } catch (e) {
            console.error("Qwen 引擎处理异常:", e);
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