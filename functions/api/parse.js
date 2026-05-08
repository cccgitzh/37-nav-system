/**
 * 37° Nav - 边缘智能靶向解析 API (Qwen-14B + 主观总结提炼版)
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

        // 星图秒开知识库
        const knownSites = {
            'github.com': { title: 'GitHub', icon: 'https://github.githubassets.com/favicons/favicon.svg', description: '全球最大开源代码托管中枢。' },
            'x.com': { title: '推特 (X)', icon: 'https://abs.twimg.com/favicons/twitter.3.ico', description: '全球实时社交与资讯网络。' },
            'twitter.com': { title: '推特 (X)', icon: 'https://abs.twimg.com/favicons/twitter.3.ico', description: '全球实时社交与资讯网络。' },
            'youtube.com': { title: '油管 (YouTube)', icon: 'https://www.youtube.com/s/desktop/10c128fa/img/favicon_144x144.png', description: '全球最大的流媒体视频生态。' },
            'bilibili.com': { title: 'B站 (Bilibili)', icon: 'https://www.bilibili.com/favicon.ico', description: '国内年轻人的弹幕视频社区。' },
            'v2ex.com': { title: 'V站 (V2EX)', icon: 'https://www.v2ex.com/favicon.ico', description: '程序员与创意工作者的极客社区。' },
            'nodeseek.com': { title: 'NodeSeek', icon: 'https://www.nodeseek.com/favicon.ico', description: '全球主机玩家与极客交流地。' },
            'mail.google.com': { title: '谷歌邮箱 (Gmail)', icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico', description: '安全高效的免费电子邮件服务。' }
        };
        if (knownSites[domain]) return new Response(JSON.stringify(knownSites[domain]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        // 内网直连穿透逻辑
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

        // 【核心修复】彻底废除了物理截断 + '...'，保持原文本交由前台 CSS 截断，或供 AI 重新阅读
        let rawDesc = extracted.ogDesc || extracted.desc || '';

        if (!env.AI) {
            // 没有 AI 算力时，直接返回提取的原文描述，最大长度截取防崩溃，无省略号
            return new Response(JSON.stringify({ title: finalTitleRaw, icon: finalIcon, description: rawDesc.substring(0, 100) || '未检测到 AI 算力。' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        let aiResult = { title: finalTitleRaw, description: rawDesc.substring(0, 100) };

        try {
            // 【终极 AI 重新总结协议】：强制要求 AI “用自己的话” 撰写完整中文短句
            const aiResponse = await env.AI.run('@cf/qwen/qwen1.5-14b-chat-awq', { 
                messages: [
                    { role: 'system', content: `你是一个极客导航站的智能AI编辑。你需要根据网页数据，自己思考并编写纯净的中文网站名称和极简简介。
核心规则：
1. 强制中文化与简称：优先使用国内网民通用称呼！如 "Google Drive" 输出 "谷歌云盘"，"Gmail" 输出 "谷歌邮箱"。
2. 主观提炼（最重要）：你必须用自己的话，把冗长的介绍或英文【重新总结】成一句完整的中文！绝对禁止生硬地截断长句！绝对不能出现省略号！
【反面错误示例】："A service navigation hub..." (英文未翻译且被机械截断，错误)
【反面错误示例】："Google的云端硬盘。免费15GB..." (多句话拼接且没写完，错误)
【正面正确示例】："专为主机玩家打造的交流社区" (完全由你自己总结的一句连贯中文，正确)
3. 盲猜兜底：如果 TEXT 提示被拦截或为空，必须忽略源码，直接根据 DOMAIN 自己盲猜写出中文名和完整短句！
4. 强制返回纯 JSON，禁止包含任何 Markdown 符号或多余解释。格式：{"title": "中文名", "description": "你总结的中文完整短句"}` },
                    { role: 'user', content: `[待解析数据]
DOMAIN: ${domain}
TITLE: ${finalTitleRaw}
DESC: ${rawDesc}
H1: ${extracted.h1}
TEXT: ${extracted.bodyText}`.substring(0, 2000) }
                ] 
            });

            // 提取净化 JSON
            let responseText = aiResponse.response || '';
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.title && parsed.title.length < 30) aiResult.title = parsed.title;
                // 如果 AI 生成了非空的简介，则覆盖默认简介
                if (parsed.description && parsed.description.trim().length > 0) aiResult.description = parsed.description;
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