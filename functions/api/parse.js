import { whitelist } from './_whitelist.js';

export async function onRequest(context) {
    const { request, env } = context;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    let rawUrl = new URL(request.url).searchParams.get('url');
    if (!rawUrl && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        rawUrl = body.url;
    }

    try {
        if (!rawUrl) throw new Error("Missing URL");
        
        let siteUrl = rawUrl.trim().replace(/\/$/, "");
        if (!siteUrl.startsWith('http')) siteUrl = `https://${siteUrl}`;
        
        const urlObj = new URL(siteUrl);
        let domain = urlObj.hostname.replace(/^www\./i, '');
        if (domain === '') domain = urlObj.hostname;

        const isLocalIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.|localhost|\.onion)/.test(domain);
        if (isLocalIP) {
            return new Response(JSON.stringify({
                title: domain,
                description: "本地网络或特殊星体节点，已启用直连。",
                icon: "",
                category: "探索基地"
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        if (env.NAV_KV) {
            const cachedData = await env.NAV_KV.get(`nav_cache_${domain}`, "json");
            if (cachedData) {
                return new Response(JSON.stringify(cachedData), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        const knownSites = getMandatoryWhiteList();
        if (knownSites[domain]) {
            const result = {
                title: knownSites[domain].name,
                description: knownSites[domain].desc,
                icon: getPerfectFavicon(domain),
                category: knownSites[domain].category || "探索基地"
            };
            if (env.NAV_KV) await env.NAV_KV.put(`nav_cache_${domain}`, JSON.stringify(result), { expirationTtl: 2592000 });
            return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        const meta = await fetchSuperMetadata(siteUrl);
        const cleanMeta = cleanText(meta);
        
        const combinedText = cleanMeta.title + cleanMeta.desc;
        const isAntiBot = /(robot|captcha|verify|check|security|验证|人机|机器人)/i.test(combinedText);
        const isInvalid = isAntiBot || !/[a-zA-Z\u4e00-\u9fa5]{2}/.test(combinedText) || 
                         (combinedText.length < 15 && !/[\u4e00-\u9fa5]/.test(combinedText));

        let finalIcon = getPerfectFavicon(domain);
        if (meta.iconUrl) {
            try {
                finalIcon = new URL(meta.iconUrl, siteUrl).href;
            } catch (e) {}
        }

        let aiResult;
        if (!env.AI) throw new Error("AI Engine not bound");

        const promptPayload = getPerfectPrompt(cleanMeta, siteUrl, isInvalid);

        try {
            aiResult = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
                messages: [{ role: 'user', content: promptPayload }],
                temperature: 0, 
                max_tokens: 256
            });
        } catch (e) {
            aiResult = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                messages: [{ role: 'user', content: promptPayload }],
                temperature: 0, 
                max_tokens: 256
            });
        }

        const finalData = forceValidate(aiResult, domain);
        finalData.icon = finalIcon;
        finalData.url = siteUrl;

        if (env.NAV_KV && finalData.description !== "暂无介绍") {
            await env.NAV_KV.put(`nav_cache_${domain}`, JSON.stringify(finalData), { expirationTtl: 2592000 });
        } else if (env.NAV_KV) {
            await env.NAV_KV.put(`nav_cache_${domain}`, JSON.stringify(finalData), { expirationTtl: 3600 });
        }

        return new Response(JSON.stringify(finalData), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } catch (error) {
        let domain = "未知站点";
        try { domain = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`).hostname; } catch(e){}
        
        return new Response(JSON.stringify({
            title: guessPerfectName(domain),
            description: "暂无介绍",
            icon: getPerfectFavicon(domain || "default"),
            category: "探索基地"
        }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
}

function getMandatoryWhiteList() {
    return {
        "bilibili.com": { name: "B站", desc: "动漫番剧弹幕视频，追剧看番超全", category: "视频音乐" },
        "v2ex.com": { name: "V站", desc: "程序员极客社区，聊科技数码干货", category: "论坛" },
        "taobao.com": { name: "淘宝", desc: "综合网购平台，啥都能买超方便", category: "购物" },
        "zhihu.com": { name: "知乎", desc: "知识问答社区，看干货涨见识", category: "论坛" },
        "github.com": { name: "GitHub", desc: "全球最大开源代码托管与协作平台", category: "探索基地" },
        "youtube.com": { name: "油管", desc: "全球最大的流媒体视频分享生态", category: "视频音乐" },
        "xiaohongshu.com": { name: "小红书", desc: "种草攻略社区，吃喝玩乐全搞定", category: "论坛" },
        "baidu.com": { name: "百度", desc: "中文搜索引擎，查东西超好用", category: "探索基地" },
        "weibo.com": { name: "微博", desc: "热点吃瓜平台，最新资讯全掌握", category: "论坛" },
        "douyin.com": { name: "抖音", desc: "短视频平台，刷视频停不下来", category: "视频音乐" },
        "pan.baidu.com": { name: "百度网盘", desc: "云存储工具，文件备份分享神器", category: "探索基地" },
        "mail.qq.com": { name: "QQ邮箱", desc: "腾讯邮箱，收发邮件超便捷", category: "通讯" },
        "csdn.net": { name: "CSDN", desc: "程序员博客，编程学习干货超多", category: "探索基地" },
        "acfun.cn": { name: "A站", desc: "二次元弹幕视频，番剧资源齐全", category: "视频音乐" },
        "tieba.baidu.com": { name: "贴吧", desc: "兴趣交流社区，找到志同道合的人", category: "论坛" },
        "mail.google.com": { name: "谷歌邮箱", desc: "安全高效的免费电子邮件服务", category: "通讯" },
        "gemini.google.com": { name: "Gemini", desc: "Google 旗下原生多模态人工智能大模型", category: "AI人工智能" },
        "chatgpt.com": { name: "ChatGPT", desc: "OpenAI 旗下的现象级 AI 聊天机器人", category: "AI人工智能" },
        "dash.cloudflare.com": { name: "CF 控制台", desc: "全球领先的边缘计算与 CDN 管理平台", category: "探索基地" },
        "claude.ai": { name: "Claude", desc: "Anthropic 开发的高智能 AI 助手", category: "AI人工智能" },
        "duckduckgo.com": { name: "DuckDuckGo", desc: "不追踪用户的隐私保护搜索引擎", category: "探索基地" },
        "wikipedia.org": { name: "维基百科", desc: "自由的百科全书，人类知识的基石", category: "知识" },
        "reddit.com": { name: "Reddit", desc: "全球最大的综合性兴趣社区", category: "论坛" },
        "netflix.com": { name: "网飞", desc: "全球领先的流媒体点播平台", category: "视频音乐" }
    };
}

function getPerfectFavicon(domain) {
    if (!domain || domain === 'default') {
        return 'https://favicon.im/default';
    }
    return `https://favicon.im/${domain}`;
}

async function fetchSuperMetadata(url) {
    const agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
    ];
    
    for (let i = 0; i < 2; i++) {
        try {
            const res = await fetch(url, { 
                headers: { 
                    "User-Agent": agents[i],
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9",
                    "Cache-Control": "no-cache"
                }, 
                redirect: "follow",
                signal: AbortSignal.timeout(4500)
            });

            if (res.ok) {
                let extracted = { title: '', desc: '', iconUrl: '' };

                const contentType = res.headers.get("content-type") || "";
                const charsetMatch = contentType.match(/charset=([^;]+)/i);
                const charset = charsetMatch ? charsetMatch[1].toLowerCase() : "utf-8";

                let responseToTransform = res;
                if (charset !== "utf-8" && charset !== "utf8") {
                    try {
                        const buffer = await res.arrayBuffer();
                        const decoder = new TextDecoder(charset);
                        const decodedText = decoder.decode(buffer);
                        responseToTransform = new Response(decodedText, {
                            headers: res.headers
                        });
                    } catch (e) {}
                }

                const rewriter = new HTMLRewriter()
                    .on('title', {
                        text(text) { extracted.title += text.text; }
                    })
                    .on('meta', {
                        element(el) {
                            const name = (el.getAttribute('name') || '').toLowerCase();
                            const prop = (el.getAttribute('property') || '').toLowerCase();
                            const content = el.getAttribute('content') || '';
                            
                            if ((name === 'description' || name === 'keywords' || prop === 'og:description' || prop === 'twitter:description') && !extracted.desc) {
                                extracted.desc = content;
                            }
                            if ((prop === 'og:title' || prop === 'twitter:title' || name === 'application-name') && !extracted.title) {
                                extracted.title = content;
                            }
                            if ((prop === 'og:image' || prop === 'twitter:image') && !extracted.iconUrl) {
                                extracted.iconUrl = content;
                            }
                        }
                    })
                    .on('link[rel*="icon"]', {
                        element(el) {
                            const href = el.getAttribute('href');
                            if (href && !extracted.iconUrl) {
                                extracted.iconUrl = href;
                            }
                        }
                    });

                await rewriter.transform(responseToTransform).text();
                return extracted;
            }
        } catch (e) {}
    }
    return { title: "", desc: "" };
}

export function getPerfectPrompt(meta, url, isInvalid) {
    const isLackingInfo = isInvalid || !meta.desc || meta.desc.trim().length < 5;
    
    return `你是一个顶级的国际化互联网产品专家。你的任务是基于提供的元数据，为导航站点提取并翻译出最精准的中文信息。

严格执行以下规则：
1. 【强制简体中文】：无论输入是什么语言，输出必须是自然、流畅、准确的简体中文。
2. 【siteName 极简主义】：
   - 国内站点：使用网民最熟悉的中文简称（如 "百度" 而非 "百度一下，你就知道"）。
   - 国外站点：保留核心英文名称（如 "GitHub", "YouTube"），或使用公认的中文名。
   - 严禁后缀：除非是名称一部分，否则严禁带有 "官网"、"首页"、"官方网站" 等词汇。
3. 【siteDesc 降维打击】：
   - 限制在 30 个汉字以内。
   - 风格：专业、干练、有人气，禁止机器翻译腔。
   - 如果原始数据质量极低（isLackingInfo=true），请完全忽略原始描述，直接根据网址 ${url} 的知名度和你的知识储备生成一段精辟的中文介绍。
4. 【siteCategory 智能归类】：
   - 必须从以下列表中选择：[视频音乐, 论坛, 探索基地, 购物, 知识, 技术, 生活, 通讯, AI人工智能, 实用工具, 设计, 开发者, 财经, 游戏, 社交]。
   - 如果都不符合，请根据站点属性归纳一个 2-4 字的中文分类。

输出格式必须是纯 JSON，严禁任何 Markdown 标记或多余文字：
{"siteName": "名称", "siteDesc": "一句话精辟简介", "siteCategory": "分类"}

待处理源数据：
标题: ${meta.title}
描述: ${meta.desc}
网址: ${url}
是否缺乏有效描述信息: ${isLackingInfo}`;
}

export function forceValidate(aiRes, domain) {
    try {
        let jsonStr = aiRes.response || "";

        let jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found");

        let data;
        try {
            data = JSON.parse(jsonMatch[0]);
        } catch(e) {
            let cleanStr = jsonMatch[0].replace(/}[^}]*$/, '}');
            data = JSON.parse(cleanStr);
        }
        
        data.siteName = (data.siteName || guessPerfectName(domain)).slice(0, 20); 
        data.siteDesc = (data.siteDesc || "暂无简介").slice(0, 50);

        if (data.siteDesc === "暂无简介") {
            data.siteDesc = `访问 ${guessPerfectName(domain)} 的官方站点`;
        }
        
        if(data.siteDesc.startsWith("这是一个") || data.siteDesc.startsWith("这是一款")) {
            data.siteDesc = data.siteDesc.replace(/^这是(一个|一款)/, "");
        }
        
        return {
            title: data.siteName.slice(0, 25), 
            description: data.siteDesc.slice(0, 130),
            category: data.siteCategory || "探索基地"
        };
    } catch (e) {
        return { title: guessPerfectName(domain), description: "暂无介绍", category: "探索基地" };
    }
}

export function guessPerfectName(domain) {
    if(!domain) return "未知站点";
    const main = getRootDomain(domain).split(".")[0];
    return main.charAt(0).toUpperCase() + main.slice(1);
}

export function getRootDomain(d) {
    if(!d) return "";
    const p = d.split('.'); 
    if (p.length < 2) return d;

    const doubleSuffixes = ['com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn'];
    const lastTwo = `${p[p.length-2]}.${p[p.length-1]}`.toLowerCase();

    if (doubleSuffixes.includes(lastTwo) && p.length >= 3) {
        return `${p[p.length-3]}.${lastTwo}`;
    }

    return `${p[p.length-2]}.${p[p.length-1]}`;
}

export function cleanText(m) {
    const c = s => (s || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim(); 
    return { title: c(m.title), desc: c(m.desc) }; 
}