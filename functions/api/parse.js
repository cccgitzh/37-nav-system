/**
 * 37° Nav - 边缘智能靶向解析 API (Qwen-14B + 强制中文化 + 知识库盲猜穿透版)
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

        // 星图秒开知识库（高频大站直接短路，省去 AI 耗时）
        const knownSites = {
            'github.com': { title: 'GitHub', icon: 'https://github.githubassets.com/favicons/favicon.svg', description: '全球最大的开源代码托管与程序员社区。' },
            'x.com': { title: '推特 (X)', icon: 'https://abs.twimg.com/favicons/twitter.3.ico', description: '全球实时社交与资讯网络。' },
            'twitter.com': { title: '推特 (X)', icon: 'https://abs.twimg.com/favicons/twitter.3.ico', description: '全球实时社交与资讯网络。' },
            'youtube.com': { title: '油管 (YouTube)', icon: 'https://www.youtube.com/s/desktop/10c128fa/img/favicon_144x144.png', description: '全球最大的流媒体视频生态。' },
            'bilibili.com': { title: 'B站 (Bilibili)', icon: 'https://www.bilibili.com/favicon.ico', description: '国内最大的年轻人弹幕视频网站。' },
            'v2ex.com': { title: 'V站 (V2EX)', icon: 'https://www.v2ex.com/favicon.ico', description: '创意工作者与程序员的极客社区。' },
            'nodeseek.com': { title: 'NodeSeek', icon: 'https://www.nodeseek.com/favicon.ico', description: '极客与开发者交流社区，全球主机玩家聚集地。' },
            'mail.google.com': { title: '谷歌邮箱 (Gmail)', icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico', description: 'Google 提供的免费、安全且高度集成的电子邮件服务。' }
        };
        if (knownSites[domain]) return new Response(JSON.stringify(knownSites[domain]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        // 内网直连穿透逻辑
        if (isLocalIP) {
            return new Response(JSON.stringify({
                title: domain,
                icon: "", 
                description: '🏠 局域网/本地星体节点，已启用本地直连。'
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
            fetchResponse = { status: 504 }; // 标记为超时，交由 AI 盲猜
        }

        let extracted = { title: '', ogTitle: '', desc: '', ogDesc: '', h1: '', bodyText: '', appleIcon: '', icon: '', shortcutIcon: '' };

        if (fetchResponse.status === 200) {
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
        }

        extracted.bodyText = extracted.bodyText.replace(/\s+/g, ' ').trim();
        const finalTitleRaw = (extracted.ogTitle || extracted.title).trim() || domain;

        let finalIcon = extracted.appleIcon || extracted.icon || extracted.shortcutIcon;
        if (finalIcon) {
            try { finalIcon = new URL(finalIcon, targetUrl).href; } 
            catch (e) { finalIcon = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(targetUrl)}&size=128`; }
        } else {
            finalIcon = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(targetUrl)}&size=128`;
        }

        // 【重构】：检测到防爬虫或页面为空时，不再提前报错返回！
        // 而是将内容标记为 WAF_BLOCKED，逼迫 AI 使用内置常识进行“盲猜”。
        const wafKeywords = ['just a moment', 'attention required', 'enable javascript', '验证码', 'cloudflare', 'security check'];
        const isBlocked = fetchResponse.status !== 200 || wafKeywords.some(kw => extracted.bodyText.toLowerCase().includes(kw) || finalTitleRaw.toLowerCase().includes(kw));
        
        if (isBlocked || extracted.bodyText.length < 20) {
            extracted.bodyText = "WAF_BLOCKED_OR_EMPTY"; 
        }

        if (!env.AI) {
            return new Response(JSON.stringify({ title: finalTitleRaw, icon: finalIcon, description: (extracted.ogDesc || extracted.desc).substring(0, 150) || '未检测到 AI 算力。' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        let rawDesc = extracted.ogDesc || extracted.desc || '';
        let aiResult = { title: finalTitleRaw, description: rawDesc.substring(0, 100) };

        try {
            // 【究极 Prompt 洗脑】：强制本土化中文 + 强制域名盲猜
            const aiResponse = await env.AI.run('@cf/qwen/qwen1.5-14b-chat-awq', { 
                messages: [
                    { role: 'system', content: `你是一个极客导航站的智能AI。你需要根据网页数据或域名，输出纯净的中文网站名称和简介。
核心规则：
1. 强制中文化与口语化：优先使用国内网民的通用称呼！遇到 "Gmail" 必须输出 "谷歌邮箱"，"Google Drive" 输出 "谷歌云盘"，"Instagram" 输出 "推特/Ins" 等。绝对不要照搬长串的英文。
2. 全中文简介：一针见血总结核心功能，限制在 30 字以内，说人话。
3. 知识库兜底（最重要）：如果 TEXT 是 "WAF_BLOCKED_OR_EMPTY" 或者纯乱码，这说明我们的爬虫被拦截了。此时你【必须】忽略源码，直接看着 DOMAIN（域名），调用你的大模型知识库，自己写出这个域名的中文名和中文简介！绝对不允许输出“暂无数据”或“防爬虫”。
4. 强制返回纯 JSON，禁止任何 Markdown 符号(如\`\`\`json)或多余解释。格式：{"title": "中文名", "description": "中文简介"}` },
                    { role: 'user', content: `[待解析数据]
DOMAIN: ${domain}
TITLE: ${finalTitleRaw}
DESC: ${rawDesc}
H1: ${extracted.h1}
TEXT: ${extracted.bodyText}`.substring(0, 2000) }
                ] 
            });

            // 暴力提取并净化 JSON
            let responseText = aiResponse.response || '';
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.title && parsed.title.length < 30) aiResult.title = parsed.title;
                if (parsed.description) aiResult.description = parsed.description;
            }
        } catch (e) {
            console.error("Qwen 引擎提取异常:", e);
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