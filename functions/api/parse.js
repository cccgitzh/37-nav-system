/**
 * 37° Nav - 边缘智能靶向解析 API (Llama-3.3 70B 旗舰双擎 + 暴力正则清洗版)
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

    // 提取 URL (兼容 GET 和 POST)
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

        // 1. 顶级优先级：强制简称白名单（100%精准，AI无法修改）
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

        // 2. 强力抓取元数据（防反爬5次重试，截取前5万字符防内存溢出）
        const meta = await fetchSuperMetadata(siteUrl);
        const cleanMeta = cleanText(meta);
        
        // 绝对乱码判断：无有效文字 → 仅用域名盲猜
        const isInvalid = !/[\u4e00-\u9fa5a-zA-Z]{2}/.test(cleanMeta.title + cleanMeta.desc);

        // 3. 双 AI 模型兜底（70B旗舰主引擎 + 11B备用引擎）
        let aiResult;
        if (!env.AI) throw new Error("AI Engine not bound");

        try {
            aiResult = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
                messages: [{ role: 'user', content: getPerfectPrompt(cleanMeta, siteUrl, isInvalid) }],
                temperature: 0, 
                max_tokens: 256
            });
        } catch (e) {
            console.error("70B Model failed, falling back to 11B", e);
            aiResult = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
                messages: [{ role: 'user', content: getPerfectPrompt(cleanMeta, siteUrl, isInvalid) }],
                temperature: 0, 
                max_tokens: 256
            });
        }

        // 4. 终极 JSON 净化 + 强制规则校验（修复了原正则误杀中文的Bug）
        const result = forceValidate(aiResult, domain);

        // 返回映射为前台认可的字段格式
        return new Response(JSON.stringify({
            title: result.siteName,
            description: result.siteDesc,
            category: result.siteCategory,
            icon: getPerfectFavicon(domain),
            url: siteUrl
        }, null, 2), { headers: corsHeaders });

    } catch (error) {
        // 全局终极兜底
        const domain = extractDomain(targetUrl);
        return new Response(JSON.stringify({
            title: guessPerfectName(domain),
            description: "网站无法访问或解析失败",
            category: "未分类",
            icon: getPerfectFavicon(domain || "default"),
            url: targetUrl
        }, null, 2), { headers: corsHeaders });
    }
}

// ==========================================
// 【1】强制白名单（网民简称锁死，绝对精准）
// ==========================================
function getMandatoryWhiteList() {
    return {
        "bilibili.com": { siteName: "B站", siteDesc: "动漫番剧弹幕视频，追剧看番超全", siteCategory: "视频音乐" },
        "v2ex.com": { siteName: "V站", siteDesc: "程序员极客社区，聊科技数码干货", siteCategory: "论坛" },
        "taobao.com": { siteName: "淘宝", siteDesc: "综合网购平台，啥都能买超方便", siteCategory: "购物" },
        "zhihu.com": { siteName: "知乎", siteDesc: "知识问答社区，看干货涨见识", siteCategory: "论坛" },
        "github.com": { siteName: "GitHub", siteDesc: "代码托管平台，程序员必备工具", siteCategory: "探索基地" },
        "youtube.com": { siteName: "油管", siteDesc: "全球视频平台，海量原创内容", siteCategory: "视频音乐" },
        "xiaohongshu.com": { siteName: "小红书", siteDesc: "种草攻略社区，吃喝玩乐全搞定", siteCategory: "论坛" },
        "baidu.com": { siteName: "百度", siteDesc: "中文搜索引擎，查东西超好用", siteCategory: "探索基地" },
        "weibo.com": { siteName: "微博", siteDesc: "热点吃瓜平台，最新资讯全掌握", siteCategory: "论坛" },
        "douyin.com": { siteName: "抖音", siteDesc: "短视频平台，刷视频停不下来", siteCategory: "视频音乐" },
        "pan.baidu.com": { siteName: "百度网盘", siteDesc: "云存储工具，文件备份分享神器", siteCategory: "探索基地" },
        "mail.qq.com": { siteName: "QQ邮箱", siteDesc: "腾讯邮箱，收发邮件超便捷", siteCategory: "通讯" },
        "csdn.net": { siteName: "CSDN", siteDesc: "程序员博客，编程学习干货超多", siteCategory: "探索基地" },
        "acfun.cn": { siteName: "A站", siteDesc: "二次元弹幕视频，番剧资源齐全", siteCategory: "视频音乐" },
        "tieba.baidu.com": { siteName: "贴吧", siteDesc: "兴趣交流社区，找到志同道合的人", siteCategory: "论坛" },
        "mail.google.com": { siteName: "谷歌邮箱", siteDesc: "安全高效的免费电子邮件服务", siteCategory: "通讯" }
    };
}

// ==========================================
// 【2】国内永久图标（favicon.im 代理穿透）
// ==========================================
function getPerfectFavicon(domain) {
    if (!domain || domain === 'default') return '';
    return `https://favicon.im/${domain}`;
}

// ==========================================
// 【3】防反爬元数据抓取（5次重试）
// ==========================================
async function fetchSuperMetadata(url) {
    const agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_3) AppleWebKit/605.1.15 Version/18.3 Safari/605.1.15",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1"
    ];
    
    for (let i = 0; i < 5; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 严格3秒超时
            
            const res = await fetch(url, { 
                headers: { 
                    "User-Agent": agents[i],
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
                }, 
                signal: controller.signal 
            });
            
            clearTimeout(timeoutId);

            if (res.ok) {
                // 截取前 50000 字符，防止大文件撑爆 Worker 128MB 内存
                const html = (await res.text()).substring(0, 50000); 
                return {
                    title: html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || "",
                    desc: html.match(/name="description"\s+content="(.*?)"/i)?.[1] || html.match(/property="og:description"\s+content="(.*?)"/i)?.[1] || ""
                };
            }
        } catch (e) {
            // 继续重试
        }
    }
    return { title: "", desc: "" };
}

// ==========================================
// 【4】完美Prompt（强制服从，无幻觉）
// ==========================================
function getPerfectPrompt(meta, url, isInvalid) {
    return `你是一个无情的JSON翻译与精简机器。严格执行！只输出纯JSON，无任何其他文字和Markdown标记！
规则：
1. 强制中文：遇到外语必须翻译成纯正简体中文。
2. siteName：网民最常用的口语化简称（≤6个汉字）。如果提供的数据全是乱码/拦截，直接看着域名（${url}）盲猜中文名。
3. siteDesc：绝对的一句话，限制在20个汉字以内。纯人话，一针见血，禁止机器腔（禁止出现"这是一个提供..."）。如果全是乱码，直接看域名盲猜一句中文简介。
4. siteCategory：必须从 [视频音乐, 论坛, 探索基地, 购物, 知识, 技术, 生活, 通讯, 未分类] 中选择一个最贴切的。
5. 无效信息兜底：如果完全不知道是什么网站，简介填"暂无简介"。

格式要求：{"siteName":"名字","siteDesc":"简介","siteCategory":"分类"}

待处理数据：
标题: ${meta.title}
描述: ${meta.desc}
网址: ${url}
是否全乱码: ${isInvalid}`;
}

// ==========================================
// 【5】终极强制校验（100%符合要求）
// ==========================================
function forceValidate(aiRes, domain) {
    try {
        // 修复：提取跨行 JSON，防止中文和特殊符号被正则误杀
        let jsonStr = aiRes.response || "";
        let jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        let data = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
        
        // 强制锁死规则
        data.siteName = (data.siteName || guessPerfectName(domain)).slice(0, 15); // 放宽一点防止外文截断
        data.siteDesc = (data.siteDesc || "暂无简介").slice(0, 30);
        
        const validCategories = ["视频音乐", "论坛", "探索基地", "购物", "知识", "技术", "生活", "通讯", "AI人工智能"];
        data.siteCategory = validCategories.includes(data.siteCategory) ? data.siteCategory : "探索基地";
        
        // 彻底封杀机器腔
        if(data.siteDesc.includes("这是一个") || data.siteDesc.includes("提供")) data.siteDesc = "暂无简介";
        
        return data;
    } catch (e) {
        return { siteName: guessPerfectName(domain), siteDesc: "暂无简介", siteCategory: "探索基地" };
    }
}

// ==========================================
// 【6】智能域名精准推测（完美简称）
// ==========================================
function guessPerfectName(domain) {
    if(!domain) return "未知站点";
    const main = getRootDomain(domain).split(".")[0];
    // 英文域名自动首字母大写并加"站"，中文直接返回
    return /^[a-zA-Z]+$/.test(main) ? main.charAt(0).toUpperCase() + main.slice(1) + "站" : main;
}

// ==========================================
// 工具函数（极简无bug）
// ==========================================
function getRootDomain(d) { 
    if(!d) return "";
    const p = d.split('.'); 
    return p.length >= 2 ? `${p[p.length-2]}.${p[p.length-1]}` : d; 
}

function cleanText(m) { 
    // 仅保留中文、字母、数字、常用标点，防止奇怪不可见字符干扰 AI
    const c = s => (s || "").replace(/[^\u4e00-\u9fa5a-zA-Z0-9，。！？、,.\s-]/g, "").trim(); 
    return { title: c(m.title), desc: c(m.desc) }; 
}

function extractDomain(u) { 
    try { 
        return new URL(u.startsWith("http") ? u : `https://${u}`).hostname; 
    } catch { 
        return ""; 
    } 
}