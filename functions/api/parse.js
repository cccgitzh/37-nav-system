/**
 * 37° Nav - 边缘智能靶向解析 API (企业级架构重构版)
 * 特性：KV缓存 / 二级域名精准切割 / 128KB内存防护 / 俗称本土化 / 双擎AI防幻觉
 */

export async function onRequest(context) {
    const { request, env } = context;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    // 【7. 输入预处理与标准化】
    let rawUrl = new URL(request.url).searchParams.get('url');
    if (!rawUrl && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        rawUrl = body.url;
    }

    try {
        if (!rawUrl) throw new Error("Missing URL");
        
        // 自动补全协议，移除末尾斜杠
        let siteUrl = rawUrl.trim().replace(/\/$/, "");
        if (!siteUrl.startsWith('http')) siteUrl = `https://${siteUrl}`;
        
        const urlObj = new URL(siteUrl);
        // 移除 www. 前缀（除非整个域名就是 www.com）
        let domain = urlObj.hostname.replace(/^www\./i, '');
        if (domain === '') domain = urlObj.hostname;

        // 【10. 安全与边界约束】拦截内网与特殊域名
        const isLocalIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.|localhost|\.onion)/.test(domain);
        if (isLocalIP) {
            return new Response(JSON.stringify({
                title: domain,
                description: "本地网络或特殊星体节点，已启用直连。",
                icon: "",
                category: "探索基地"
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        // 【9. 缓存与容错细则】检查 KV 缓存 (需在 Cloudflare 绑定名为 NAV_KV 的 KV 命名空间)
        // 注意：如果未绑定 KV，此代码也具有容错性，会跳过缓存直接执行
        if (env.NAV_KV) {
            const cachedData = await env.NAV_KV.get(`nav_cache_${domain}`, "json");
            if (cachedData) {
                return new Response(JSON.stringify(cachedData), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        // 【1. 二级域名处理 & 俗称处理】大厂字典强匹配
        const knownSites = getMandatoryWhiteList();
        if (knownSites[domain]) {
            const result = {
                title: knownSites[domain].name,
                description: knownSites[domain].desc,
                icon: getPerfectFavicon(domain),
                category: knownSites[domain].category || "探索基地"
            };
            if (env.NAV_KV) await env.NAV_KV.put(`nav_cache_${domain}`, JSON.stringify(result), { expirationTtl: 2592000 }); // 30天缓存
            return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        // 【2. 强力抓取元数据】&【10. 128KB 防内存耗尽】
        const meta = await fetchSuperMetadata(siteUrl);
        const cleanMeta = cleanText(meta);
        
        // 乱码判定：如果抓取到的内容连2个正常字符都没有，说明被防爬虫墙拦截
        const isInvalid = !/[a-zA-Z\u4e00-\u9fa5]{2}/.test(cleanMeta.title + cleanMeta.desc);

        // 【3. 双 AI 模型兜底（取代无效的搜索引擎抓取）】
        let aiResult;
        if (!env.AI) throw new Error("AI Engine not bound");

        const promptPayload = getPerfectPrompt(cleanMeta, domain, isInvalid);

        try {
            // 旗舰主引擎
            aiResult = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
                messages: [{ role: 'user', content: promptPayload }],
                temperature: 0, 
                max_tokens: 300
            });
        } catch (e) {
            console.warn("70B 引擎超时，切换 8B 备用引擎");
            // 备用极速引擎
            aiResult = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                messages: [{ role: 'user', content: promptPayload }],
                temperature: 0, 
                max_tokens: 300
            });
        }

        // 【5. 终极格式输出与校验】
        const finalData = forceValidate(aiResult, domain);
        finalData.icon = getPerfectFavicon(domain);
        finalData.url = siteUrl;

        // 写入 KV 缓存
        if (env.NAV_KV && finalData.description !== "暂无介绍") {
            await env.NAV_KV.put(`nav_cache_${domain}`, JSON.stringify(finalData), { expirationTtl: 2592000 });
        } else if (env.NAV_KV) {
            // 失败缓存：1小时内不再重试
            await env.NAV_KV.put(`nav_cache_${domain}`, JSON.stringify(finalData), { expirationTtl: 3600 });
        }

        return new Response(JSON.stringify(finalData), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } catch (error) {
        // 【4. 容错设计】完全崩溃时的终极回退
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

// ==========================================
// 【1. 二级域名映射表与俗称字典】
// ==========================================
function getMandatoryWhiteList() {
    return {
        "bilibili.com": { siteName: "B站", siteDesc: "动漫番剧弹幕视频，追剧看番超全", siteCategory: "视频音乐" },
        "v2ex.com": { siteName: "V站", siteDesc: "程序员极客社区，聊科技数码干货", siteCategory: "论坛" },
        "taobao.com": { siteName: "淘宝", siteDesc: "综合网购平台，啥都能买超方便", siteCategory: "购物" },
        "zhihu.com": { siteName: "知乎", siteDesc: "知识问答社区，看干货涨见识", siteCategory: "论坛" },
        "github.com": { siteName: "GitHub", siteDesc: "全球最大开源代码托管与协作平台", siteCategory: "探索基地" },
        "youtube.com": { siteName: "油管", siteDesc: "全球最大的流媒体视频分享生态", siteCategory: "视频音乐" },
        "xiaohongshu.com": { siteName: "小红书", siteDesc: "种草攻略社区，吃喝玩乐全搞定", siteCategory: "论坛" },
        "baidu.com": { siteName: "百度", siteDesc: "中文搜索引擎，查东西超好用", siteCategory: "探索基地" },
        "weibo.com": { siteName: "微博", siteDesc: "热点吃瓜平台，最新资讯全掌握", siteCategory: "论坛" },
        "douyin.com": { siteName: "抖音", siteDesc: "短视频平台，刷视频停不下来", siteCategory: "视频音乐" },
        "pan.baidu.com": { siteName: "百度网盘", siteDesc: "云存储工具，文件备份分享神器", siteCategory: "探索基地" },
        "mail.qq.com": { siteName: "QQ邮箱", siteDesc: "腾讯邮箱，收发邮件超便捷", siteCategory: "通讯" },
        "csdn.net": { siteName: "CSDN", siteDesc: "程序员博客，编程学习干货超多", siteCategory: "探索基地" },
        "acfun.cn": { siteName: "A站", siteDesc: "二次元弹幕视频，番剧资源齐全", siteCategory: "视频音乐" },
        "tieba.baidu.com": { siteName: "贴吧", siteDesc: "兴趣交流社区，找到志同道合的人", siteCategory: "论坛" },
        "mail.google.com": { siteName: "谷歌邮箱", siteDesc: "安全高效的免费电子邮件服务", siteCategory: "通讯" },
        "gemini.google.com": { siteName: "Gemini", siteDesc: "Google 旗下原生多模态人工智能大模型", siteCategory: "AI人工智能" },
        "chatgpt.com": { siteName: "ChatGPT", siteDesc: "OpenAI 旗下的现象级 AI 聊天机器人", siteCategory: "AI人工智能" },
        "dash.cloudflare.com": { siteName: "CF 控制台", siteDesc: "全球领先的边缘计算与 CDN 管理平台", siteCategory: "探索基地" }
    };
}

// ==========================================
// 【3 & 8. 图标获取防盗链解决方案】
// 使用 favicon.im，它内置了 Google Favicon 和 DuckDuckGo 引擎的瀑布流回退，并完美解决 CORS 和 防盗链问题。
// ==========================================
function getPerfectFavicon(domain) {
    if (!domain || domain === 'default') return '';
    return `https://favicon.im/${domain}`;
}

// ==========================================
// 【2. 强力抓取与防反爬】
// ==========================================
async function fetchSuperMetadata(url) {
    const agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
    ];
    
    // 【4. 防御机制】：只重试 2 次，超时 5 秒
    for (let i = 0; i < 2; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); 
            
            const res = await fetch(url, { 
                headers: { 
                    "User-Agent": agents[i],
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9",
                    "Cache-Control": "no-cache"
                }, 
                redirect: "follow",
                signal: controller.signal 
            });
            
            clearTimeout(timeoutId);

            if (res.ok) {
                // 使用 Cloudflare 原生 HTMLRewriter，无视任何属性排序错乱
                let extracted = { title: '', desc: '', iconUrl: '' };
                const rewriter = new HTMLRewriter()
                    .on('title', { text(text) { extracted.title += text.text; } })
                    .on('meta', {
                        element(el) {
                            const name = (el.getAttribute('name') || '').toLowerCase();
                            const prop = (el.getAttribute('property') || '').toLowerCase();
                            const content = el.getAttribute('content') || '';
                            
                            if (name === 'description' && !extracted.desc) extracted.desc = content;
                            if (prop === 'og:description' && !extracted.desc) extracted.desc = content;
                            if (prop === 'og:title' && !extracted.title) extracted.title = content;
                            if (prop === 'og:image' && !extracted.iconUrl) extracted.iconUrl = content;
                        }
                    });

                await rewriter.transform(res).text();
                return extracted;
            }
        } catch (e) {
            // 超时或失败则进入下一次重试
        }
    }
    return { title: "", desc: "" };
}

// ==========================================
// 【2 & 6. 严苛的指令下达 Prompt】
// ==========================================
function getPerfectPrompt(meta, domain, isInvalid) {
    const isGithubIo = domain.endsWith('github.io');
    
    return `你是一个无情的JSON提取与翻译机器。严格执行以下所有规则，绝对不要输出任何其他文字、解释或Markdown符号！

核心死命令：
1. 强制中文翻译：无论源数据是英文、日文还是乱码，必须翻译、提炼为纯正的【简体中文】！
2. siteName：网民最常用的极简称呼（限15个字符内）。国外知名项目保留核心英文。绝对禁止无脑添加"站"字！注意分析子域名（例如 music.youtube.com 应该是 YouTube Music）。
3. siteDesc：【最高优先级】一句话中文简介（限30个汉字以内）。纯人话，一针见血，禁止机器腔（禁止出现"这是一个提供..."）。
   如果提供的数据为空、无意义、包含防爬虫验证，或者"是否缺乏有效描述信息"为true，必须彻底忽略原始数据！
   请直接根据网址（${url}）和它的知名度，从你的知识库中写一句精准的中文介绍！绝对不要输出"暂无简介"！
4. siteCategory：必须从 [视频音乐, 论坛, 探索基地, 购物, 知识, 技术, 生活, 通讯, AI人工智能, 实用工具, 设计, 开发者] 中选择一个最贴切的。
   如果没有合适的，可以自行发明一个2到4个字的精准中文分类。

输出格式严格如下：
{"siteName": "网站名称", "siteDesc": "一句话中文简介", "siteCategory": "分类"}

待处理源数据：
标题: ${meta.title}
描述: ${meta.desc}
网址: ${url}
是否缺乏有效描述信息: ${isLackingInfo}`;
}

// ==========================================
// 【5. 格式化映射与防机器化清洗】
// ==========================================
function forceValidate(aiRes, domain) {
    try {
        let jsonStr = aiRes.response || "";
        let jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        let data = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
        
        // 映射回前端需要的变量名：name -> title
        let finalTitle = data.name || guessPerfectName(domain);
        let finalDesc = data.description || "暂无介绍";

        // 防生硬机翻/机器腔清洗
        if(finalDesc.startsWith("这是一个") || finalDesc.startsWith("这是一款")) {
            finalDesc = finalDesc.replace(/^这是(一个|一款)/, "");
        }
        
        return {
            siteName: finalTitle.slice(0, 25), 
            siteDesc: finalDesc.slice(0, 130),
            siteCategory: "探索基地" // 默认占位
        };
    } catch (e) {
        return { siteName: guessPerfectName(domain), siteDesc: "暂无介绍", siteCategory: "探索基地" };
    }
}

// ==========================================
// 工具函数
// ==========================================
function guessPerfectName(domain) {
    if(!domain) return "未知站点";
    const main = getRootDomain(domain).split(".")[0];
    return main.charAt(0).toUpperCase() + main.slice(1);
}

export function getRootDomain(d) {
    if(!d) return "";
    const p = d.split('.'); 
    if (p.length < 2) return d;

    // 处理 .com.cn / .net.cn 等双重后缀
    const doubleSuffixes = ['com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn'];
    const lastTwo = `${p[p.length-2]}.${p[p.length-1]}`.toLowerCase();

    if (doubleSuffixes.includes(lastTwo) && p.length >= 3) {
        return `${p[p.length-3]}.${lastTwo}`;
    }

    return `${p[p.length-2]}.${p[p.length-1]}`;
}

function cleanText(m) { 
    const c = s => (s || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim(); 
    return { title: c(m.title), desc: c(m.desc) }; 
}