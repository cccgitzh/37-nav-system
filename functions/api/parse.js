/**
 * 37° Nav - 边缘智能靶向解析 API (企业级架构重构版)
 * 特性：KV缓存 / 二级域名精准切割 / 128KB内存防护 / 俗称本土化 / 双擎AI防幻觉
 */

import { whitelist } from './_whitelist.js';

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

        const promptPayload = getPerfectPrompt(cleanMeta, domain, isInvalid);

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
        "dash.cloudflare.com": { siteName: "CF 控制台", siteDesc: "全球领先的边缘计算与 CDN 管理平台", siteCategory: "探索基地" },
        "claude.ai": { siteName: "Claude", siteDesc: "Anthropic 开发的高智能 AI 助手", siteCategory: "AI人工智能" },
        "duckduckgo.com": { siteName: "DuckDuckGo", siteDesc: "不追踪用户的隐私保护搜索引擎", siteCategory: "探索基地" },
        "wikipedia.org": { siteName: "维基百科", siteDesc: "自由的百科全书，人类知识的基石", siteCategory: "知识" },
        "reddit.com": { siteName: "Reddit", siteDesc: "全球最大的综合性兴趣社区", siteCategory: "论坛" },
        "netflix.com": { siteName: "网飞", siteDesc: "全球领先的流媒体点播平台", siteCategory: "视频音乐" }
    };
}

// ==========================================
// 【3 & 8. 图标获取防盗链解决方案】
// 使用 favicon.im，它内置了 Google Favicon 和 DuckDuckGo 引擎的瀑布流回退，并完美解决 CORS 和 防盗链问题。
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
            const timeoutId = setTimeout(() => controller.abort(), 4500); 
            
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
                // 使用 Cloudflare 原生 HTMLRewriter，无视任何属性排序错乱
                let extracted = { title: '', desc: '', iconUrl: '' };

                // 针对非 UTF-8 编码进行预处理 (Cloudflare HTMLRewriter 仅支持 UTF-8)
                let responseToTransform = res;
                if (charset !== "utf-8" && charset !== "utf8") {
                    try {
                        const buffer = await res.arrayBuffer();
                        const decoder = new TextDecoder(charset);
                        const decodedText = decoder.decode(buffer);
                        responseToTransform = new Response(decodedText, {
                            headers: res.headers
                        });
                    } catch (e) {
                        // 解码失败则降级使用原始响应
                    }
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
                    // 额外提取link标签中的favicon
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
        } catch (e) {
            // 超时或失败则进入下一次重试
        }
    }
    return { title: "", desc: "" };
}

// ==========================================
// 【2 & 6. 严苛的指令下达 Prompt】
// ==========================================
<<<<<<< HEAD
function getPerfectPrompt(meta, domain, isInvalid) {
    const isGithubIo = domain.endsWith('github.io');
=======
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

// ==========================================
// 【5. 格式化映射与防机器化清洗】
// ==========================================
export function forceValidate(aiRes, domain) {
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
export function guessPerfectName(domain) {
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

export function cleanText(m) {
    const c = s => (s || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim(); 
    return { title: c(m.title), desc: c(m.desc) }; 
}

function extractDomain(u) { 
    try { return new URL(u.startsWith("http") ? u : `https://${u}`).hostname; } 
    catch { return ""; } 
}