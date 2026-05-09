/**
 * 37° Nav - 边缘智能靶向解析 API (HTMLRewriter 引擎重构版)
 * 架构适配：Cloudflare Pages Functions
 * 最后更新：2026-05-10
 * 优化内容：解决Git冲突、整合双分支特性、优化favicon获取、增强错误处理
 */

export async function onRequest(context) {
    const { request, env } = context;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    // 提取 URL
    let targetUrl = new URL(request.url).searchParams.get('url');
    if (!targetUrl && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        targetUrl = body.url;
    }

    try {
        if (!targetUrl) throw new Error("Missing URL");
        
        // 标准化网址
        const siteUrl = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
        const domain = new URL(siteUrl).hostname;
        const rootDomain = getRootDomain(domain);

        // 1. 顶级优先级：强制简称白名单
        const whiteList = getMandatoryWhiteList();
        if (whiteList[domain] || whiteList[rootDomain]) {
            const data = whiteList[domain] || whiteList[rootDomain];
            return new Response(JSON.stringify({
                title: data.siteName,
                description: data.siteDesc,
                category: data.siteCategory,
                icon: getPerfectFavicon(domain),
                url: siteUrl
            }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // 2. 启用真正的 DOM 解析引擎抓取元数据（彻底告别正则失效）
        const meta = await fetchSuperMetadata(siteUrl);
        const cleanMeta = cleanText(meta);
        
        // 增强型无效内容检测（整合双分支逻辑）
        const combinedText = cleanMeta.title + cleanMeta.desc;
        const isAntiBot = /(robot|captcha|verify|check|security|验证|人机|机器人)/i.test(combinedText);
        const isInvalid = isAntiBot || !/[a-zA-Z\u4e00-\u9fa5]{2}/.test(combinedText) || 
                         (combinedText.length < 15 && !/[\u4e00-\u9fa5]/.test(combinedText));

        // 智能图标选择：优先使用网站自身图标，降级到favicon.im
        let finalIcon = getPerfectFavicon(domain);
        if (meta.iconUrl) {
            try {
                finalIcon = new URL(meta.iconUrl, siteUrl).href;
            } catch (e) {
                // 解析失败，使用默认favicon.im
            }
        }

        // 3. 双擎 AI 深度解析与翻译
        let aiResult;
        if (!env.AI) throw new Error("AI Engine not bound");

        try {
            aiResult = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
                messages: [{ role: 'user', content: getPerfectPrompt(cleanMeta, siteUrl, isInvalid) }],
                temperature: 0, 
                max_tokens: 256
            });
        } catch (e) {
            console.warn("70B 引擎过载，极速切换至 8B", e);
            aiResult = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                messages: [{ role: 'user', content: getPerfectPrompt(cleanMeta, siteUrl, isInvalid) }],
                temperature: 0, 
                max_tokens: 256
            });
        }

        // 4. 终极 JSON 净化与提取
        const result = forceValidate(aiResult, domain);

        return new Response(JSON.stringify({
            title: result.siteName,
            description: result.siteDesc,
            category: result.siteCategory,
            icon: finalIcon,
            url: siteUrl
        }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error("解析失败:", error);
        const domain = extractDomain(targetUrl);
        return new Response(JSON.stringify({
            title: guessPerfectName(domain),
            description: "网站防爬虫或解析失败",
            category: "探索基地",
            icon: getPerfectFavicon(domain || "default"),
            url: targetUrl
        }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
}

// ==========================================
// 【1】强制白名单
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
// 【2】Favicon 智能获取（基于favicon.im官方文档优化）
// ==========================================
function getPerfectFavicon(domain) {
    if (!domain || domain === 'default') {
        // 默认图标：使用favicon.im的默认回退
        return 'https://favicon.im/default';
    }
    // 使用favicon.im服务，自动搜索最佳图标位置
    // 如需更大尺寸，可添加 ?larger=true 参数
    return `https://favicon.im/${domain}`;
}

// ==========================================
// 【3】跨洋防反爬元数据抓取 (全面升级 HTMLRewriter 引擎)
// ==========================================
async function fetchSuperMetadata(url) {
    const agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0"
    ];
    
    for (let i = 0; i < 3; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4500); 
            
            const res = await fetch(url, { 
                headers: { 
                    "User-Agent": agents[i],
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
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
                    .on('title', {
                        text(text) { extracted.title += text.text; }
                    })
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
                    })
                    // 额外提取link标签中的favicon
                    .on('link[rel*="icon"]', {
                        element(el) {
                            const href = el.getAttribute('href');
                            if (href && !extracted.iconUrl) {
                                extracted.iconUrl = href;
                            }
                        }
                    });

                await rewriter.transform(res).text();
                return extracted;
            }
        } catch (e) {
            // 继续重试
        }
    }
    return { title: "", desc: "", iconUrl: "" };
}

// ==========================================
// 【4】翻译指令锁死 Prompt（整合双分支最佳实践）
// ==========================================
function getPerfectPrompt(meta, url, isInvalid) {
    const isLackingInfo = isInvalid || !meta.desc || meta.desc.trim().length < 5;
    
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
// 【5】终极强制校验（整合双分支逻辑）
// ==========================================
function forceValidate(aiRes, domain) {
    try {
        let jsonStr = aiRes.response || "";

        // 尝试修复被截断或带有奇怪字符的JSON
        let jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found");

        let data;
        try {
            data = JSON.parse(jsonMatch[0]);
        } catch(e) {
            // 如果解析失败，尝试去掉可能的尾部垃圾字符
            let cleanStr = jsonMatch[0].replace(/}[^}]*$/, '}');
            data = JSON.parse(cleanStr);
        }
        
        data.siteName = (data.siteName || guessPerfectName(domain)).slice(0, 20); 
        data.siteDesc = (data.siteDesc || "暂无简介").slice(0, 50);

        // 强制替换AI偷懒输出的"暂无简介"
        if (data.siteDesc === "暂无简介") {
            data.siteDesc = `访问 ${guessPerfectName(domain)} 的官方站点`;
        }
        
        // 移除机器腔前缀
        if(data.siteDesc.startsWith("这是一个") || data.siteDesc.startsWith("这是一款")) {
            data.siteDesc = data.siteDesc.replace(/^这是(一个|一款)/, "");
        }
        
        // 验证分类有效性
        const validCategories = ["视频音乐", "论坛", "探索基地", "购物", "知识", "技术", "生活", "通讯", "AI人工智能"];
        data.siteCategory = validCategories.includes(data.siteCategory) ? data.siteCategory : "探索基地";
        
        return data;
    } catch (e) {
        console.error("AI结果解析失败:", e);
        return { 
            siteName: guessPerfectName(domain), 
            siteDesc: `访问 ${guessPerfectName(domain)} 的官方站点`, 
            siteCategory: "探索基地" 
        };
    }
}

// ==========================================
// 【6】首字母大写盲猜兜底
// ==========================================
function guessPerfectName(domain) {
    if(!domain) return "未知站点";
    const main = getRootDomain(domain).split(".")[0];
    return main.charAt(0).toUpperCase() + main.slice(1);
}

export function getRootDomain(d) {
    if(!d) return "";
    const p = d.split('.'); 
    return p.length >= 2 ? `${p[p.length-2]}.${p[p.length-1]}` : d; 
}

function cleanText(m) { 
    const c = s => (s || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim(); 
    return { title: c(m.title), desc: c(m.desc) }; 
}

function extractDomain(u) { 
    try { return new URL(u.startsWith("http") ? u : `https://${u}`).hostname; } 
    catch { return ""; } 
}