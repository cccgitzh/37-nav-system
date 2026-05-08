/**
 * 37° Nav - 边缘智能靶向解析 API (跨洋无损抓取 + 旗舰翻译版)
 * 架构适配：Cloudflare Pages Functions
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
            }, null, 2), { headers: corsHeaders });
        }

        // 2. 强力抓取元数据（修复了跨洋请求限制）
        const meta = await fetchSuperMetadata(siteUrl);
        
        // 修复了致命的正则Bug，现在能完美保留所有的外文单词和标点
        const cleanMeta = cleanText(meta);
        
        // 如果清洗后连2个字母都没有，说明被彻底拦截或网页为空
        const isInvalid = !/[a-zA-Z\u4e00-\u9fa5]{2}/.test(cleanMeta.title + cleanMeta.desc);

        // 3. 双 AI 模型兜底翻译与提炼
        let aiResult;
        if (!env.AI) throw new Error("AI Engine not bound");

        try {
            // 主引擎：Llama 3.3 70B 旗舰版
            aiResult = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
                messages: [{ role: 'user', content: getPerfectPrompt(cleanMeta, siteUrl, isInvalid) }],
                temperature: 0, 
                max_tokens: 256
            });
        } catch (e) {
            console.warn("70B 引擎过载，极速切换至 8B 翻译引擎", e);
            // 备用引擎：Llama 3.1 8B 极速版（更稳定）
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
            icon: getPerfectFavicon(domain),
            url: siteUrl
        }, null, 2), { headers: corsHeaders });

    } catch (error) {
        const domain = extractDomain(targetUrl);
        return new Response(JSON.stringify({
            title: guessPerfectName(domain),
            description: "网站防爬虫或解析失败",
            category: "未分类",
            icon: getPerfectFavicon(domain || "default"),
            url: targetUrl
        }, null, 2), { headers: corsHeaders });
    }
}

// ==========================================
// 【1】强制白名单（网民简称锁死）
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
// 【2】国内永久图标（favicon.im 代理）
// ==========================================
function getPerfectFavicon(domain) {
    if (!domain || domain === 'default') return '';
    return `https://favicon.im/${domain}`;
}

// ==========================================
// 【3】跨洋防反爬元数据抓取
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
            // 【修复】放宽到 4.5秒，给跨国握手留足时间
            const timeoutId = setTimeout(() => controller.abort(), 4500); 
            
            const res = await fetch(url, { 
                headers: { 
                    "User-Agent": agents[i],
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
                    "Cache-Control": "no-cache"
                }, 
                redirect: "follow", // 【修复】必须跟随重定向，否则国外很多网站直接报301空网页
                signal: controller.signal 
            });
            
            clearTimeout(timeoutId);

            if (res.ok) {
                const html = (await res.text()).substring(0, 50000); 
                return {
                    title: html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1] || html.match(/property="og:title"\s+content="(.*?)"/is)?.[1] || "",
                    desc: html.match(/name="description"\s+content="(.*?)"/is)?.[1] || html.match(/property="og:description"\s+content="(.*?)"/is)?.[1] || ""
                };
            }
        } catch (e) {
            // 继续重试
        }
    }
    return { title: "", desc: "" };
}

// ==========================================
// 【4】翻译指令锁死 Prompt
// ==========================================
function getPerfectPrompt(meta, url, isInvalid) {
    return `你是一个无情的JSON翻译与精简机器。严格执行！只输出纯JSON，无任何其他文字和Markdown标记！
核心死命令：
1. 强制中文翻译：无论源数据是英文、日文还是乱码，你必须将其翻译、提炼为纯正的【简体中文】！绝对禁止照搬大段英文！
2. siteName：网民最常用的极简称呼（限15个字符内）。如果是国外知名项目，保留核心英文（如 Tailscale, Vercel）。如果数据全是乱码，直接看域名盲猜！【绝对禁止无脑添加“站”字！】
3. siteDesc：绝对的一句话中文，限30个汉字以内。纯人话，一针见血，禁止机器腔（禁止出现"这是一个提供..."）。如果全是乱码，直接根据域名盲猜一句中文简介。
4. siteCategory：必须从 [视频音乐, 论坛, 探索基地, 购物, 知识, 技术, 生活, 通讯, AI人工智能, 未分类] 中选择一个最贴切的。

格式要求：{"siteName":"名字","siteDesc":"中文简介","siteCategory":"分类"}

待处理源数据：
标题: ${meta.title}
描述: ${meta.desc}
网址: ${url}
是否全乱码: ${isInvalid}`;
}

// ==========================================
// 【5】终极强制校验
// ==========================================
function forceValidate(aiRes, domain) {
    try {
        let jsonStr = aiRes.response || "";
        let jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        let data = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
        
        data.siteName = (data.siteName || guessPerfectName(domain)).slice(0, 20); 
        data.siteDesc = (data.siteDesc || "暂无简介").slice(0, 40);
        
        const validCategories = ["视频音乐", "论坛", "探索基地", "购物", "知识", "技术", "生活", "通讯", "AI人工智能"];
        data.siteCategory = validCategories.includes(data.siteCategory) ? data.siteCategory : "探索基地";
        
        if(data.siteDesc.includes("这是一个") || data.siteDesc.includes("提供")) data.siteDesc = "暂无简介";
        
        return data;
    } catch (e) {
        return { siteName: guessPerfectName(domain), siteDesc: "暂无简介", siteCategory: "探索基地" };
    }
}

// ==========================================
// 【6】首字母大写盲猜兜底（无脑去“站”）
// ==========================================
function guessPerfectName(domain) {
    if(!domain) return "未知站点";
    const main = getRootDomain(domain).split(".")[0];
    return main.charAt(0).toUpperCase() + main.slice(1);
}

function getRootDomain(d) { 
    if(!d) return "";
    const p = d.split('.'); 
    return p.length >= 2 ? `${p[p.length-2]}.${p[p.length-1]}` : d; 
}

// 【修复】：取消变态正则，只清理换行符和多余空格，完美保留原汁原味的外文结构供 AI 翻译
function cleanText(m) { 
    const c = s => (s || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim(); 
    return { title: c(m.title), desc: c(m.desc) }; 
}

function extractDomain(u) { 
    try { return new URL(u.startsWith("http") ? u : `https://${u}`).hostname; } 
    catch { return ""; } 
}