/**
 * 37° Nav - 边缘智能靶向解析 API (Qwen-14B + 极限一句话简介版)
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

        // 星图秒开知识库（同样精简了这里的自带描述，保持极简风）
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

        // 防爬虫检测
        const wafKeywords = ['just a moment', 'attention required', 'enable javascript', '验证码', 'cloudflare', 'security check'];
        const isBlocked = fetchResponse.status !== 200 || wafKeywords.some(kw => extracted.bodyText.toLowerCase().includes(kw) || finalTitleRaw.toLowerCase().includes(kw));
        
        if (isBlocked || extracted.bodyText.length < 20) {
            extracted.bodyText = "WAF_BLOCKED_OR_EMPTY"; 
        }

        // 默认兜底描述，强行切断到最大 20 个字符
        let rawDesc = extracted.ogDesc || extracted.desc || '';
        let fallbackDesc = rawDesc.length > 20 ? rawDesc.substring(0, 20) + '...' : rawDesc;

        if (!env.AI) {
            return new Response(JSON.stringify({ title: finalTitleRaw, icon: finalIcon, description: fallbackDesc || '未检测到 AI 算力。' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        let aiResult = { title: finalTitleRaw, description: fallbackDesc };

        try {
            // 【终极 Prompt 升级：正反面对比教化 + 物理字数锁死】
            const aiResponse = await env.AI.run('@cf/qwen/qwen1.5-14b-chat-awq', { 
                messages: [
                    { role: 'system', content: `你是一个极客导航站的智能AI。你需要根据网页数据或域名，输出纯净的中文网站名称和极简简介。
核心规则：
1. 强制中文化与简称：优先使用国内网民通用称呼！如 "Google Drive" 输出 "谷歌云盘"，"Gmail" 输出 "谷歌邮箱"。
2. 极限字数限制（最重要）：简介必须是【绝对的一句话总结】，严格限制在 15 个汉字以内！不准出现标点符号分割的多句话。
【反面错误示例】："Google的云端硬盘。可以存储、访问和共享文件。免费15GB。" (包含多句话，太啰嗦，错误)
【正面正确示例】："安全可靠的云端存储服务" (极简单句，正确)
3. 知识库盲猜兜底：如果 TEXT 提示被拦截或为空，你必须忽略源码，直接根据 DOMAIN 自己写出中文名和极简中文简介！
4. 强制返回纯 JSON，禁止包含任何 Markdown 符号或多余解释。格式：{"title": "中文名", "description": "极简中文简介"}` },
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