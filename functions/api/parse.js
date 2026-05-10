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
        // 谷歌系子域名精准切割
        "mail.google.com": { name: "谷歌邮箱 (Gmail)", desc: "安全高效的免费电子邮件服务。" },
        "drive.google.com": { name: "谷歌云盘 (Google Drive)", desc: "谷歌提供的云端文件存储与协作平台。" },
        "docs.google.com": { name: "Google 文档", desc: "在线文档编辑与团队协作工具。" },
        "analytics.google.com": { name: "Google Analytics", desc: "网站流量统计与核心数据分析工具。" },
        "gemini.google.com": { name: "Gemini", desc: "Google 旗下原生多模态人工智能大模型。", category: "AI人工智能" },
        // 苹果系子域名
        "developer.apple.com": { name: "苹果开发者中心", desc: "Apple 官方开发者资源、文档与应用管理平台。" },
        // 国内外大站本土化俗称
        "bilibili.com": { name: "B站", desc: "国内知名的年轻世代弹幕视频社区。", category: "视频音乐" },
        "youtube.com": { name: "油管 (YouTube)", desc: "全球最大的流媒体视频分享生态。", category: "视频音乐" },
        "twitter.com": { name: "推特 (X)", desc: "全球实时社交与资讯网络。" },
        "x.com": { name: "推特 (X)", desc: "全球实时社交与资讯网络。" },
        "instagram.com": { name: "ins (照片墙)", desc: "全球知名的图片与短视频生活分享平台。" },
        "facebook.com": { name: "脸书 (FB)", desc: "全球最大的综合性社交网络平台。" },
        "weibo.com": { name: "微博", desc: "随时随地发现新鲜事，热点资讯吃瓜平台。" },
        "zhihu.com": { name: "知乎", desc: "高质量中文问答社区与创作者聚集地。" },
        "github.com": { name: "GitHub", desc: "全球最大的开源代码托管与协作平台。" }
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
                // 【10. 资源耗尽防护】只读取前 128KB (131072 bytes) 的流数据，不下载全站
                const reader = res.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let htmlStr = "";
                let bytesRead = 0;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done || bytesRead > 131072) break;
                    htmlStr += decoder.decode(value, { stream: true });
                    bytesRead += value.length;
                }
                reader.releaseLock();

                // 使用原生 HTMLRewriter 提取，无视所有混淆的属性排序
                let extracted = { title: '', desc: '' };
                const rewriter = new HTMLRewriter()
                    .on('title', { text(text) { extracted.title += text.text; } })
                    .on('meta', {
                        element(el) {
                            const name = (el.getAttribute('name') || '').toLowerCase();
                            const prop = (el.getAttribute('property') || '').toLowerCase();
                            const content = el.getAttribute('content') || '';
                            if ((name === 'description' || prop === 'og:description') && !extracted.desc) extracted.desc = content;
                            if (prop === 'og:title' && !extracted.title) extracted.title = content;
                        }
                    });

                await rewriter.transform(new Response(htmlStr)).text();
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
    
    return `你是一个部署在边缘节点的智能网站信息提取器。你需要输出纯 JSON。
【核心规则】：
1. 提取名称 (name)：
   - 提取该网站最核心的品牌名。优先使用中国大陆的本土化俗称（如 Facebook 叫 脸书/FB）。
   - 【极其重要】：如果遇到类似 \`analytics.google.com\` 这样的大厂二级域名，必须精确识别出子产品名（Google Analytics），绝对不能笼统叫 Google。
   - 如果是 \`${domain}\` 且以 github.io 结尾，识别为“XXX的 GitHub Pages”。
   - 如果网页全是乱码或反爬虫验证，直接根据域名 \`${domain}\` 的拼音/英文在你的知识库里盲猜品牌名！绝对不要加"站"字！
2. 提取介绍 (description)：
   - 使用简体中文提炼一段 50~120 字的简介，说明核心功能或定位。
   - 对境外网站，必须完全中文化，避免直接返回大段英文。避免使用“这是一个提供...”之类的机器语。
   - 如果网页被防火墙拦截，强行根据 \`${domain}\` 的知名度在知识库中自己写一段中文介绍。如果不认识该域名，填写"暂无介绍"。
3. 严格 JSON 输出：{"name": "网站名称", "description": "简体中文介绍"}。不要任何 Markdown 标记。

源数据：
域名: ${domain}
爬取标题: ${meta.title}
爬取描述: ${meta.desc}
是否被反爬拦截: ${isInvalid}`;
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
    if(!domain) return "未知网站";
    let main = domain.split(".")[0];
    if (domain.includes('github.io')) main = domain.replace('.github.io', '') + ' 的博客';
    return main.charAt(0).toUpperCase() + main.slice(1);
}

function getRootDomain(d) { 
    if(!d) return "";
    const p = d.split('.'); 
    return p.length >= 2 ? `${p[p.length-2]}.${p[p.length-1]}` : d; 
}

function cleanText(m) { 
    const c = s => (s || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim(); 
    return { title: c(m.title), desc: c(m.desc) }; 
}