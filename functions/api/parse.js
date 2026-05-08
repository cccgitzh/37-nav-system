/**
 * 37° Nav - 边缘智能靶向解析 API (Qwen-7B 极速版 + 强制中文翻译防坠毁)
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

        const isLocalIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.|localhost)/.test(domain);

        // 星图秒开知识库
        const knownSites = {
            'github.com': { title: 'GitHub', icon: 'https://github.githubassets.com/favicons/favicon.svg', description: '全球最大开源代码托管中枢。' },
            'x.com': { title: '推特 (X)', icon: 'https://abs.twimg.com/favicons/twitter.3.ico', description: '全球实时社交与资讯网络。' },
            'twitter.com': { title: '推特 (X)', icon: 'https://abs.twimg.com/favicons/twitter.3.ico', description: '全球实时社交与资讯网络。' },
            'youtube.com': { title: '油管 (YouTube)', icon: 'https://www.youtube.com/s/desktop/10c128fa/img/favicon_144x144.png', description: '全球最大的流媒体视频生态。' },
            'bilibili.com': { title: 'B站 (Bilibili)', icon: 'https://www.bilibili.com/favicon.ico', description: '国内年轻人的弹幕视频社区。' },
            'v2ex.com': { title: 'V站 (V2EX)', icon: 'https://www.v2ex.com/favicon.ico', description: '程序员与创意工作者的极客社区。' },
            'nodeseek.com': { title: 'NodeSeek', icon: 'https://www.nodeseek.com/favicon.ico', description: '全球主机玩家与极客交流地。' },
            'mail.google.com': { title: '谷歌邮箱 (Gmail)', icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico', description: '安全高效的免费电子邮件服务。' },
            'dash.cloudflare.com': { title: 'CF 控制台', icon: 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://cloudflare.com&size=128', description: '全球领先的边缘计算与CDN平台。' }
        };
        if (knownSites[domain]) return new Response(JSON.stringify(knownSites[domain]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        if (isLocalIP) {
            return new Response(JSON.stringify({
                title: domain,
                icon: "", 
                description: '🏠 本地星体节点，已启用直连。'
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
            fetchResponse = { status: 504 }; 
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

        const wafKeywords = ['just a moment', 'attention required', 'enable javascript', '验证码', 'cloudflare', 'security check'];
        const isBlocked = fetchResponse.status !== 200 || wafKeywords.some(kw => extracted.bodyText.toLowerCase().includes(kw) || finalTitleRaw.toLowerCase().includes(kw));
        
        if (isBlocked || extracted.bodyText.length < 20) {
            extracted.bodyText = "WAF_BLOCKED_OR_EMPTY"; 
        }

        let rawDesc = extracted.ogDesc || extracted.desc || '';

        if (!env.AI) {
            return new Response(JSON.stringify({ title: finalTitleRaw, icon: finalIcon, description: rawDesc.substring(0, 100) || '未检测到 AI 算力。' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        // 明确的崩溃警告兜底，如果你看到了这个，说明 Cloudflare 的 AI 节点挂了
        let aiResult = { title: finalTitleRaw, description: `[AI解析超时] 原文: ${rawDesc.substring(0, 40)}` };

        try {
            // 【换装轻量极速引擎：Qwen-7B，并注入强制翻译指令】
            const aiResponse = await env.AI.run('@cf/qwen/qwen1.5-7b-chat-awq', { 
                messages: [
                    { role: 'system', content: `你是一个极客导航站的翻译与总结AI。无论目标网页是英文、日文还是火星文，你都必须将其理解后，重新撰写为纯正的简体中文！
核心死命令：
1. 强制中文翻译：绝不允许照搬英文描述！必须翻译并用自己的话总结成中文。如果遇到 "Tailscale"，标题可保留英文，但简介必须是全中文（如：安全好用的虚拟局域网与零信任内网穿透平台）。
2. 一句话提炼：简介必须严格限制在 15 个汉字以内，绝对禁止多句话拼接，绝不准包含省略号！
3. 知识库盲猜：如果 TEXT 提示被拦截或为空，立刻忽略源码，仅根据 DOMAIN 域名，直接盲猜出它的中文名和极简中文功能介绍。
4. 格式锁死：强制只返回纯 JSON，禁止携带Markdown代码块(\`\`\`json)或解释。格式：{"title": "中文名称", "description": "一句全中文极简总结"}` },
                    { role: 'user', content: `[待解析数据]
DOMAIN: ${domain}
TITLE: ${finalTitleRaw}
DESC: ${rawDesc}
H1: ${extracted.h1}
TEXT: ${extracted.bodyText}`.substring(0, 1800) }
                ] 
            });

            let responseText = aiResponse.response || '';
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.title && parsed.title.length < 30) aiResult.title = parsed.title;
                if (parsed.description && parsed.description.trim().length > 0) aiResult.description = parsed.description;
            }
        } catch (e) {
            console.error("Qwen 7B 引擎超时或崩溃:", e);
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