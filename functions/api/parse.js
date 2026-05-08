/**
 * 37° Nav - 边缘智能靶向解析 API (完美极速降维版)
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

        // 缩短网页抓取超时时间至 3 秒，给 AI 留下充足的思考时间
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

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

        let extracted = { title: '', ogTitle: '', desc: '', ogDesc: '', bodyText: '', appleIcon: '', icon: '', shortcutIcon: '' };

        if (fetchResponse.status === 200) {
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
                // 仅抓取极少量的 Body 作为最后兜底，防止内存溢出
                .on('body', { text(text) { if (extracted.bodyText.length < 300) extracted.bodyText += text.text + ' '; } });

            await rewriter.transform(fetchResponse).text();
        }

        const finalTitleRaw = (extracted.ogTitle || extracted.title).trim() || domain;
        let finalIcon = extracted.appleIcon || extracted.icon || extracted.shortcutIcon;
        if (finalIcon) {
            try { finalIcon = new URL(finalIcon, targetUrl).href; } 
            catch (e) { finalIcon = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(targetUrl)}&size=128`; }
        } else {
            finalIcon = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(targetUrl)}&size=128`;
        }

        // 【极致降维提取】：如果存在 Meta 描述，就绝不给 AI 看啰嗦的正文
        let rawDesc = (extracted.ogDesc || extracted.desc || '').trim();
        let safeAIInput = rawDesc ? rawDesc.substring(0, 300) : extracted.bodyText.replace(/\s+/g, ' ').trim().substring(0, 300);

        // 如果没有 AI 绑定，或者出现极端断网，优雅回退原文，不再附加乱七八糟的提示
        let fallbackDesc = rawDesc || '暂无特征数据';
        let aiResult = { title: finalTitleRaw, description: fallbackDesc };

        if (!env.AI) {
            return new Response(JSON.stringify({ title: finalTitleRaw, icon: finalIcon, description: fallbackDesc }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        try {
            // 【极速翻译引擎】：更换为高并发的 Llama-3.1，配以无敌的翻译和强制输出规则
            const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { 
                messages: [
                    { role: 'system', content: `你是一个专业的网页元数据翻译与精简引擎。
严格指令：
1. 强制中文翻译：无论用户输入的是英文、日文还是任何语言，你必须将其翻译并总结为纯正的【简体中文】。
2. 精炼核心名：从 TITLE 中提炼最精简的品牌名。如 "Tailscale | Secure Connectivity..." 只保留 "Tailscale"。
3. 一句话中文简介：严格将描述翻译并压缩成一句话，限15个汉字以内。绝对禁止照搬英文，绝对禁止包含省略号。
4. 格式锁死：只允许输出 JSON，严禁 Markdown(如\`\`\`json)。格式：{"title": "中文品牌名", "description": "中文一句话介绍"}` },
                    { role: 'user', content: `DOMAIN: ${domain}\nTITLE: ${finalTitleRaw}\nINFO: ${safeAIInput || 'No Info'}` }
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
            console.error("AI 引擎异常:", e);
            // 发生异常时，变量 aiResult 自动回退为原生英文描述，不再附加 [AI解析超时] 恶心人
        }

        return new Response(JSON.stringify({
            title: aiResult.title || finalTitleRaw,
            icon: finalIcon,
            description: aiResult.description || fallbackDesc
        }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } catch (globalError) {
        return new Response(JSON.stringify({ title: "解析异常", icon: "", description: "引擎遇到未知错误。" }), { status: 200, headers: corsHeaders });
    }
}