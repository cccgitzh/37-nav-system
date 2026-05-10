var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/categories.js
async function warmUpCatCache(env) {
  const { results } = await env.DB.prepare("SELECT * FROM categories ORDER BY sort_order ASC, id ASC").all();
  const jsonString = JSON.stringify(results);
  const etag = '"cat-' + Date.now().toString(36) + '"';
  await env.KV_CACHE.put("all_categories_data", jsonString, { metadata: { etag } });
  return { jsonString, etag };
}
__name(warmUpCatCache, "warmUpCatCache");
async function onRequestGet(context) {
  const clientETag = context.request.headers.get("If-None-Match");
  let { value, metadata } = await context.env.KV_CACHE.getWithMetadata("all_categories_data");
  let currentETag = metadata?.etag;
  if (!value) {
    const fresh = await warmUpCatCache(context.env);
    value = fresh.jsonString;
    currentETag = fresh.etag;
  }
  if (clientETag && clientETag === currentETag) {
    return new Response(null, { status: 304, headers: { "ETag": currentETag, "Cache-Control": "public, max-age=0, must-revalidate" } });
  }
  return new Response(value, {
    headers: { "Content-Type": "application/json", "ETag": currentETag, "Cache-Control": "public, max-age=0, must-revalidate" }
  });
}
__name(onRequestGet, "onRequestGet");
async function onRequestPost(context) {
  const { name } = await context.request.json();
  await context.env.DB.prepare("INSERT INTO categories (name) VALUES (?)").bind(name).run();
  await warmUpCatCache(context.env);
  return new Response(JSON.stringify({ success: true }));
}
__name(onRequestPost, "onRequestPost");
async function onRequestPut(context) {
  const data = await context.request.json();
  if (Array.isArray(data)) {
    const statements = data.map((item, index) => context.env.DB.prepare("UPDATE categories SET sort_order = ? WHERE id = ?").bind(index, item.id));
    await context.env.DB.batch(statements);
  } else {
    const { id, name } = data;
    await context.env.DB.prepare("UPDATE categories SET name = ? WHERE id = ?").bind(name, id).run();
  }
  await warmUpCatCache(context.env);
  return new Response(JSON.stringify({ success: true }));
}
__name(onRequestPut, "onRequestPut");
async function onRequestDelete(context) {
  const { id } = await context.request.json();
  await context.env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
  await warmUpCatCache(context.env);
  return new Response(JSON.stringify({ success: true }));
}
__name(onRequestDelete, "onRequestDelete");

// api/nodes.js
async function warmUpCache(env) {
  const { results } = await env.DB.prepare("SELECT * FROM links ORDER BY id DESC").all();
  const jsonString = JSON.stringify(results);
  const etag = '"v-' + Date.now().toString(36) + '"';
  await env.KV_CACHE.put("all_links_data", jsonString, { metadata: { etag } });
  return { jsonString, etag };
}
__name(warmUpCache, "warmUpCache");
async function onRequestGet2(context) {
  const clientETag = context.request.headers.get("If-None-Match");
  let { value, metadata } = await context.env.KV_CACHE.getWithMetadata("all_links_data");
  let currentETag = metadata?.etag;
  if (!value) {
    const fresh = await warmUpCache(context.env);
    value = fresh.jsonString;
    currentETag = fresh.etag;
  }
  if (clientETag && clientETag === currentETag) {
    return new Response(null, {
      status: 304,
      headers: { "ETag": currentETag, "Cache-Control": "public, max-age=0, must-revalidate", "X-Edge-Engine": "37-NAV" }
    });
  }
  return new Response(value, {
    headers: { "Content-Type": "application/json", "ETag": currentETag, "Cache-Control": "public, max-age=0, must-revalidate", "X-Edge-Engine": "37-NAV" }
  });
}
__name(onRequestGet2, "onRequestGet");
async function onRequestPost2(context) {
  const { title, url, description, category, icon, color_theme } = await context.request.json();
  const dbResult = await context.env.DB.prepare(
    "INSERT INTO links (title, url, description, category, icon, color_theme) VALUES (?, ?, ?, ?, ?, ?) RETURNING id"
  ).bind(title, url, description, category, icon, color_theme).first();
  if (context.env.AI && context.env.VECTOR_INDEX) {
    const textToVectorize = `${title} - ${description}`;
    const { data: embeddings } = await context.env.AI.run("@cf/baai/bge-small-en-v1.5", { text: [textToVectorize] });
    context.waitUntil(context.env.VECTOR_INDEX.upsert([{ id: dbResult.id.toString(), values: embeddings[0] }]));
  }
  await warmUpCache(context.env);
  return new Response(JSON.stringify({ success: true }));
}
__name(onRequestPost2, "onRequestPost");
async function onRequestPut2(context) {
  const { id, title, url, description, category, icon, color_theme } = await context.request.json();
  await context.env.DB.prepare(
    "UPDATE links SET title=?, url=?, description=?, category=?, icon=?, color_theme=? WHERE id=?"
  ).bind(title, url, description, category, icon, color_theme, id).run();
  if (context.env.AI && context.env.VECTOR_INDEX) {
    const textToVectorize = `${title} - ${description}`;
    const { data: embeddings } = await context.env.AI.run("@cf/baai/bge-small-en-v1.5", { text: [textToVectorize] });
    context.waitUntil(context.env.VECTOR_INDEX.upsert([{ id: id.toString(), values: embeddings[0] }]));
  }
  await warmUpCache(context.env);
  return new Response(JSON.stringify({ success: true }));
}
__name(onRequestPut2, "onRequestPut");
async function onRequestDelete2(context) {
  const { id } = await context.request.json();
  await context.env.DB.prepare("DELETE FROM links WHERE id = ?").bind(id).run();
  if (context.env.VECTOR_INDEX) {
    context.waitUntil(context.env.VECTOR_INDEX.deleteByIds([id.toString()]));
  }
  await warmUpCache(context.env);
  return new Response(JSON.stringify({ success: true }));
}
__name(onRequestDelete2, "onRequestDelete");

// api/parse.js
async function onRequest(context) {
  const { request, env } = context;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let targetUrl = new URL(request.url).searchParams.get("url");
  if (!targetUrl && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    targetUrl = body.url;
  }
  try {
    if (!targetUrl) throw new Error("Missing URL");
    const siteUrl = targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`;
    const domain = new URL(siteUrl).hostname;
    const rootDomain = getRootDomain(domain);
    const whiteList = getMandatoryWhiteList();
    if (whiteList[domain] || whiteList[rootDomain]) {
      const data = whiteList[domain] || whiteList[rootDomain];
      return new Response(JSON.stringify({
        title: data.siteName,
        description: data.siteDesc,
        category: data.siteCategory,
        icon: getPerfectFavicon(domain),
        url: siteUrl
      }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const meta = await fetchSuperMetadata(siteUrl);
    const cleanMeta = cleanText(meta);
    const combinedText = cleanMeta.title + cleanMeta.desc;
    const isAntiBot = /(robot|captcha|verify|check|security|验证|人机|机器人)/i.test(combinedText);
    const isInvalid = isAntiBot || !/[a-zA-Z\u4e00-\u9fa5]{2}/.test(combinedText) || combinedText.length < 15 && !/[\u4e00-\u9fa5]/.test(combinedText);
    let finalIcon = getPerfectFavicon(domain);
    if (meta.iconUrl) {
      try {
        finalIcon = new URL(meta.iconUrl, siteUrl).href;
      } catch (e) {
      }
    }
    let aiResult;
    if (!env.AI) throw new Error("AI Engine not bound");
    try {
      aiResult = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [{ role: "user", content: getPerfectPrompt(cleanMeta, siteUrl, isInvalid) }],
        temperature: 0,
        max_tokens: 256
      });
    } catch (e) {
      console.warn("70B \u5F15\u64CE\u8FC7\u8F7D\uFF0C\u6781\u901F\u5207\u6362\u81F3 8B", e);
      aiResult = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [{ role: "user", content: getPerfectPrompt(cleanMeta, siteUrl, isInvalid) }],
        temperature: 0,
        max_tokens: 256
      });
    }
    const result = forceValidate(aiResult, domain);
    return new Response(JSON.stringify({
      title: result.siteName,
      description: result.siteDesc,
      category: result.siteCategory,
      icon: finalIcon,
      url: siteUrl
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("\u89E3\u6790\u5931\u8D25:", error);
    const domain = extractDomain(targetUrl);
    return new Response(JSON.stringify({
      title: guessPerfectName(domain),
      description: "\u7F51\u7AD9\u9632\u722C\u866B\u6216\u89E3\u6790\u5931\u8D25",
      category: "\u63A2\u7D22\u57FA\u5730",
      icon: getPerfectFavicon(domain || "default"),
      url: targetUrl
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}
__name(onRequest, "onRequest");
function getMandatoryWhiteList() {
  return {
    "bilibili.com": { siteName: "B\u7AD9", siteDesc: "\u52A8\u6F2B\u756A\u5267\u5F39\u5E55\u89C6\u9891\uFF0C\u8FFD\u5267\u770B\u756A\u8D85\u5168", siteCategory: "\u89C6\u9891\u97F3\u4E50" },
    "v2ex.com": { siteName: "V\u7AD9", siteDesc: "\u7A0B\u5E8F\u5458\u6781\u5BA2\u793E\u533A\uFF0C\u804A\u79D1\u6280\u6570\u7801\u5E72\u8D27", siteCategory: "\u8BBA\u575B" },
    "taobao.com": { siteName: "\u6DD8\u5B9D", siteDesc: "\u7EFC\u5408\u7F51\u8D2D\u5E73\u53F0\uFF0C\u5565\u90FD\u80FD\u4E70\u8D85\u65B9\u4FBF", siteCategory: "\u8D2D\u7269" },
    "zhihu.com": { siteName: "\u77E5\u4E4E", siteDesc: "\u77E5\u8BC6\u95EE\u7B54\u793E\u533A\uFF0C\u770B\u5E72\u8D27\u6DA8\u89C1\u8BC6", siteCategory: "\u8BBA\u575B" },
    "github.com": { siteName: "GitHub", siteDesc: "\u5168\u7403\u6700\u5927\u5F00\u6E90\u4EE3\u7801\u6258\u7BA1\u4E0E\u534F\u4F5C\u5E73\u53F0", siteCategory: "\u63A2\u7D22\u57FA\u5730" },
    "youtube.com": { siteName: "\u6CB9\u7BA1", siteDesc: "\u5168\u7403\u6700\u5927\u7684\u6D41\u5A92\u4F53\u89C6\u9891\u5206\u4EAB\u751F\u6001", siteCategory: "\u89C6\u9891\u97F3\u4E50" },
    "xiaohongshu.com": { siteName: "\u5C0F\u7EA2\u4E66", siteDesc: "\u79CD\u8349\u653B\u7565\u793E\u533A\uFF0C\u5403\u559D\u73A9\u4E50\u5168\u641E\u5B9A", siteCategory: "\u8BBA\u575B" },
    "baidu.com": { siteName: "\u767E\u5EA6", siteDesc: "\u4E2D\u6587\u641C\u7D22\u5F15\u64CE\uFF0C\u67E5\u4E1C\u897F\u8D85\u597D\u7528", siteCategory: "\u63A2\u7D22\u57FA\u5730" },
    "weibo.com": { siteName: "\u5FAE\u535A", siteDesc: "\u70ED\u70B9\u5403\u74DC\u5E73\u53F0\uFF0C\u6700\u65B0\u8D44\u8BAF\u5168\u638C\u63E1", siteCategory: "\u8BBA\u575B" },
    "douyin.com": { siteName: "\u6296\u97F3", siteDesc: "\u77ED\u89C6\u9891\u5E73\u53F0\uFF0C\u5237\u89C6\u9891\u505C\u4E0D\u4E0B\u6765", siteCategory: "\u89C6\u9891\u97F3\u4E50" },
    "pan.baidu.com": { siteName: "\u767E\u5EA6\u7F51\u76D8", siteDesc: "\u4E91\u5B58\u50A8\u5DE5\u5177\uFF0C\u6587\u4EF6\u5907\u4EFD\u5206\u4EAB\u795E\u5668", siteCategory: "\u63A2\u7D22\u57FA\u5730" },
    "mail.qq.com": { siteName: "QQ\u90AE\u7BB1", siteDesc: "\u817E\u8BAF\u90AE\u7BB1\uFF0C\u6536\u53D1\u90AE\u4EF6\u8D85\u4FBF\u6377", siteCategory: "\u901A\u8BAF" },
    "csdn.net": { siteName: "CSDN", siteDesc: "\u7A0B\u5E8F\u5458\u535A\u5BA2\uFF0C\u7F16\u7A0B\u5B66\u4E60\u5E72\u8D27\u8D85\u591A", siteCategory: "\u63A2\u7D22\u57FA\u5730" },
    "acfun.cn": { siteName: "A\u7AD9", siteDesc: "\u4E8C\u6B21\u5143\u5F39\u5E55\u89C6\u9891\uFF0C\u756A\u5267\u8D44\u6E90\u9F50\u5168", siteCategory: "\u89C6\u9891\u97F3\u4E50" },
    "tieba.baidu.com": { siteName: "\u8D34\u5427", siteDesc: "\u5174\u8DA3\u4EA4\u6D41\u793E\u533A\uFF0C\u627E\u5230\u5FD7\u540C\u9053\u5408\u7684\u4EBA", siteCategory: "\u8BBA\u575B" },
    "mail.google.com": { siteName: "\u8C37\u6B4C\u90AE\u7BB1", siteDesc: "\u5B89\u5168\u9AD8\u6548\u7684\u514D\u8D39\u7535\u5B50\u90AE\u4EF6\u670D\u52A1", siteCategory: "\u901A\u8BAF" },
    "gemini.google.com": { siteName: "Gemini", siteDesc: "Google \u65D7\u4E0B\u539F\u751F\u591A\u6A21\u6001\u4EBA\u5DE5\u667A\u80FD\u5927\u6A21\u578B", siteCategory: "AI\u4EBA\u5DE5\u667A\u80FD" },
    "chatgpt.com": { siteName: "ChatGPT", siteDesc: "OpenAI \u65D7\u4E0B\u7684\u73B0\u8C61\u7EA7 AI \u804A\u5929\u673A\u5668\u4EBA", siteCategory: "AI\u4EBA\u5DE5\u667A\u80FD" },
    "dash.cloudflare.com": { siteName: "CF \u63A7\u5236\u53F0", siteDesc: "\u5168\u7403\u9886\u5148\u7684\u8FB9\u7F18\u8BA1\u7B97\u4E0E CDN \u7BA1\u7406\u5E73\u53F0", siteCategory: "\u63A2\u7D22\u57FA\u5730" },
    "claude.ai": { siteName: "Claude", siteDesc: "Anthropic \u5F00\u53D1\u7684\u9AD8\u667A\u80FD AI \u52A9\u624B", siteCategory: "AI\u4EBA\u5DE5\u667A\u80FD" },
    "duckduckgo.com": { siteName: "DuckDuckGo", siteDesc: "\u4E0D\u8FFD\u8E2A\u7528\u6237\u7684\u9690\u79C1\u4FDD\u62A4\u641C\u7D22\u5F15\u64CE", siteCategory: "\u63A2\u7D22\u57FA\u5730" },
    "wikipedia.org": { siteName: "\u7EF4\u57FA\u767E\u79D1", siteDesc: "\u81EA\u7531\u7684\u767E\u79D1\u5168\u4E66\uFF0C\u4EBA\u7C7B\u77E5\u8BC6\u7684\u57FA\u77F3", siteCategory: "\u77E5\u8BC6" },
    "reddit.com": { siteName: "Reddit", siteDesc: "\u5168\u7403\u6700\u5927\u7684\u7EFC\u5408\u6027\u5174\u8DA3\u793E\u533A", siteCategory: "\u8BBA\u575B" },
    "netflix.com": { siteName: "\u7F51\u98DE", siteDesc: "\u5168\u7403\u9886\u5148\u7684\u6D41\u5A92\u4F53\u70B9\u64AD\u5E73\u53F0", siteCategory: "\u89C6\u9891\u97F3\u4E50" }
  };
}
__name(getMandatoryWhiteList, "getMandatoryWhiteList");
function getPerfectFavicon(domain) {
  if (!domain || domain === "default") {
    return "https://favicon.im/default";
  }
  return `https://favicon.im/${domain}`;
}
__name(getPerfectFavicon, "getPerfectFavicon");
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
        const contentType = res.headers.get("Content-Type") || "";
        const charsetMatch = contentType.match(/charset=([^;]+)/i);
        const charset = charsetMatch ? charsetMatch[1].trim().toLowerCase() : "utf-8";
        let extracted = { title: "", desc: "", iconUrl: "" };
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
          }
        }
        const rewriter = new HTMLRewriter().on("title", {
          text(text) {
            extracted.title += text.text;
          }
        }).on("meta", {
          element(el) {
            const name = (el.getAttribute("name") || "").toLowerCase();
            const prop = (el.getAttribute("property") || "").toLowerCase();
            const content = el.getAttribute("content") || "";
            if ((name === "description" || name === "keywords" || prop === "og:description" || prop === "twitter:description") && !extracted.desc) {
              extracted.desc = content;
            }
            if ((prop === "og:title" || prop === "twitter:title" || name === "application-name") && !extracted.title) {
              extracted.title = content;
            }
            if ((prop === "og:image" || prop === "twitter:image") && !extracted.iconUrl) {
              extracted.iconUrl = content;
            }
          }
        }).on('link[rel*="icon"]', {
          element(el) {
            const href = el.getAttribute("href");
            if (href && !extracted.iconUrl) {
              extracted.iconUrl = href;
            }
          }
        });
        await rewriter.transform(responseToTransform).text();
        return extracted;
      }
    } catch (e) {
    }
  }
  return { title: "", desc: "", iconUrl: "" };
}
__name(fetchSuperMetadata, "fetchSuperMetadata");
function getPerfectPrompt(meta, url, isInvalid) {
  const isLackingInfo = isInvalid || !meta.desc || meta.desc.trim().length < 5;
  return `\u4F60\u662F\u4E00\u4E2A\u9876\u7EA7\u7684\u56FD\u9645\u5316\u4E92\u8054\u7F51\u4EA7\u54C1\u4E13\u5BB6\u3002\u4F60\u7684\u4EFB\u52A1\u662F\u57FA\u4E8E\u63D0\u4F9B\u7684\u5143\u6570\u636E\uFF0C\u4E3A\u5BFC\u822A\u7AD9\u70B9\u63D0\u53D6\u5E76\u7FFB\u8BD1\u51FA\u6700\u7CBE\u51C6\u7684\u4E2D\u6587\u4FE1\u606F\u3002

\u4E25\u683C\u6267\u884C\u4EE5\u4E0B\u89C4\u5219\uFF1A
1. \u3010\u5F3A\u5236\u7B80\u4F53\u4E2D\u6587\u3011\uFF1A\u65E0\u8BBA\u8F93\u5165\u662F\u4EC0\u4E48\u8BED\u8A00\uFF0C\u8F93\u51FA\u5FC5\u987B\u662F\u81EA\u7136\u3001\u6D41\u7545\u3001\u51C6\u786E\u7684\u7B80\u4F53\u4E2D\u6587\u3002
2. \u3010siteName \u6781\u7B80\u4E3B\u4E49\u3011\uFF1A
   - \u56FD\u5185\u7AD9\u70B9\uFF1A\u4F7F\u7528\u7F51\u6C11\u6700\u719F\u6089\u7684\u4E2D\u6587\u7B80\u79F0\uFF08\u5982 "\u767E\u5EA6" \u800C\u975E "\u767E\u5EA6\u4E00\u4E0B\uFF0C\u4F60\u5C31\u77E5\u9053"\uFF09\u3002
   - \u56FD\u5916\u7AD9\u70B9\uFF1A\u4FDD\u7559\u6838\u5FC3\u82F1\u6587\u540D\u79F0\uFF08\u5982 "GitHub", "YouTube"\uFF09\uFF0C\u6216\u4F7F\u7528\u516C\u8BA4\u7684\u4E2D\u6587\u540D\u3002
   - \u4E25\u7981\u540E\u7F00\uFF1A\u9664\u975E\u662F\u540D\u79F0\u4E00\u90E8\u5206\uFF0C\u5426\u5219\u4E25\u7981\u5E26\u6709 "\u5B98\u7F51"\u3001"\u9996\u9875"\u3001"\u5B98\u65B9\u7F51\u7AD9" \u7B49\u8BCD\u6C47\u3002
3. \u3010siteDesc \u964D\u7EF4\u6253\u51FB\u3011\uFF1A
   - \u9650\u5236\u5728 30 \u4E2A\u6C49\u5B57\u4EE5\u5185\u3002
   - \u98CE\u683C\uFF1A\u4E13\u4E1A\u3001\u5E72\u7EC3\u3001\u6709\u4EBA\u6C14\uFF0C\u7981\u6B62\u673A\u5668\u7FFB\u8BD1\u8154\u3002
   - \u5982\u679C\u539F\u59CB\u6570\u636E\u8D28\u91CF\u6781\u4F4E\uFF08isLackingInfo=true\uFF09\uFF0C\u8BF7\u5B8C\u5168\u5FFD\u7565\u539F\u59CB\u63CF\u8FF0\uFF0C\u76F4\u63A5\u6839\u636E\u7F51\u5740 ${url} \u7684\u77E5\u540D\u5EA6\u548C\u4F60\u7684\u77E5\u8BC6\u50A8\u5907\u751F\u6210\u4E00\u6BB5\u7CBE\u8F9F\u7684\u4E2D\u6587\u4ECB\u7ECD\u3002
4. \u3010siteCategory \u667A\u80FD\u5F52\u7C7B\u3011\uFF1A
   - \u5FC5\u987B\u4ECE\u4EE5\u4E0B\u5217\u8868\u4E2D\u9009\u62E9\uFF1A[\u89C6\u9891\u97F3\u4E50, \u8BBA\u575B, \u63A2\u7D22\u57FA\u5730, \u8D2D\u7269, \u77E5\u8BC6, \u6280\u672F, \u751F\u6D3B, \u901A\u8BAF, AI\u4EBA\u5DE5\u667A\u80FD, \u5B9E\u7528\u5DE5\u5177, \u8BBE\u8BA1, \u5F00\u53D1\u8005, \u8D22\u7ECF, \u6E38\u620F, \u793E\u4EA4]\u3002
   - \u5982\u679C\u90FD\u4E0D\u7B26\u5408\uFF0C\u8BF7\u6839\u636E\u7AD9\u70B9\u5C5E\u6027\u5F52\u7EB3\u4E00\u4E2A 2-4 \u5B57\u7684\u4E2D\u6587\u5206\u7C7B\u3002

\u8F93\u51FA\u683C\u5F0F\u5FC5\u987B\u662F\u7EAF JSON\uFF0C\u4E25\u7981\u4EFB\u4F55 Markdown \u6807\u8BB0\u6216\u591A\u4F59\u6587\u5B57\uFF1A
{"siteName": "\u540D\u79F0", "siteDesc": "\u4E00\u53E5\u8BDD\u7CBE\u8F9F\u7B80\u4ECB", "siteCategory": "\u5206\u7C7B"}

\u5F85\u5904\u7406\u6E90\u6570\u636E\uFF1A
\u6807\u9898: ${meta.title}
\u63CF\u8FF0: ${meta.desc}
\u7F51\u5740: ${url}
\u662F\u5426\u7F3A\u4E4F\u6709\u6548\u63CF\u8FF0\u4FE1\u606F: ${isLackingInfo}`;
}
__name(getPerfectPrompt, "getPerfectPrompt");
function forceValidate(aiRes, domain) {
  try {
    let jsonStr = aiRes.response || "";
    let jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    let data;
    try {
      data = JSON.parse(jsonMatch[0]);
    } catch (e) {
      let cleanStr = jsonMatch[0].replace(/}[^}]*$/, "}");
      data = JSON.parse(cleanStr);
    }
    data.siteName = (data.siteName || guessPerfectName(domain)).slice(0, 20);
    data.siteDesc = (data.siteDesc || "\u6682\u65E0\u7B80\u4ECB").slice(0, 50);
    if (data.siteDesc === "\u6682\u65E0\u7B80\u4ECB") {
      data.siteDesc = `\u8BBF\u95EE ${guessPerfectName(domain)} \u7684\u5B98\u65B9\u7AD9\u70B9`;
    }
    if (data.siteDesc.startsWith("\u8FD9\u662F\u4E00\u4E2A") || data.siteDesc.startsWith("\u8FD9\u662F\u4E00\u6B3E")) {
      data.siteDesc = data.siteDesc.replace(/^这是(一个|一款)/, "");
    }
    const validCategories = ["\u89C6\u9891\u97F3\u4E50", "\u8BBA\u575B", "\u63A2\u7D22\u57FA\u5730", "\u8D2D\u7269", "\u77E5\u8BC6", "\u6280\u672F", "\u751F\u6D3B", "\u901A\u8BAF", "AI\u4EBA\u5DE5\u667A\u80FD"];
    data.siteCategory = validCategories.includes(data.siteCategory) ? data.siteCategory : "\u63A2\u7D22\u57FA\u5730";
    return data;
  } catch (e) {
    console.error("AI\u7ED3\u679C\u89E3\u6790\u5931\u8D25:", e);
    return {
      siteName: guessPerfectName(domain),
      siteDesc: `\u8BBF\u95EE ${guessPerfectName(domain)} \u7684\u5B98\u65B9\u7AD9\u70B9`,
      siteCategory: "\u63A2\u7D22\u57FA\u5730"
    };
  }
}
__name(forceValidate, "forceValidate");
function guessPerfectName(domain) {
  if (!domain) return "\u672A\u77E5\u7AD9\u70B9";
  const parts = domain.split(".").filter((p) => !["www", "m", "mobile", "mail"].includes(p.toLowerCase()));
  if (parts.length >= 2) {
    const tldParts = ["com", "net", "org", "edu", "gov", "cn", "me", "io", "cc", "tv", "ai", "app", "dev", "info", "xyz"];
    let significantParts = [];
    for (let i = 0; i < parts.length; i++) {
      if (tldParts.includes(parts[i].toLowerCase())) break;
      significantParts.push(parts[i]);
    }
    if (significantParts.length > 0) {
      return significantParts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    }
  }
  const main = getRootDomain(domain).split(".")[0];
  return main.charAt(0).toUpperCase() + main.slice(1);
}
__name(guessPerfectName, "guessPerfectName");
function getRootDomain(d) {
  if (!d) return "";
  const p = d.split(".");
  if (p.length < 2) return d;
  const doubleSuffixes = ["com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn"];
  const lastTwo = `${p[p.length - 2]}.${p[p.length - 1]}`.toLowerCase();
  if (doubleSuffixes.includes(lastTwo) && p.length >= 3) {
    return `${p[p.length - 3]}.${lastTwo}`;
  }
  return `${p[p.length - 2]}.${p[p.length - 1]}`;
}
__name(getRootDomain, "getRootDomain");
function cleanText(m) {
  const c = /* @__PURE__ */ __name((s) => (s || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim(), "c");
  return { title: c(m.title), desc: c(m.desc) };
}
__name(cleanText, "cleanText");
function extractDomain(u) {
  try {
    return new URL(u.startsWith("http") ? u : `https://${u}`).hostname;
  } catch {
    return "";
  }
}
__name(extractDomain, "extractDomain");

// api/search.js
async function onRequest2(context) {
  try {
    const url = new URL(context.request.url);
    const query = url.searchParams.get("q");
    if (!query) return new Response("\u7F3A\u5C11\u641C\u7D22\u8BCD", { status: 400 });
    const { data: embeddings } = await context.env.AI.run("@cf/baai/bge-small-en-v1.5", {
      text: [query]
    });
    const vector = embeddings[0];
    const vectorResults = await context.env.VECTOR_INDEX.query(vector, { topK: 6 });
    if (vectorResults.matches.length === 0) {
      return new Response(JSON.stringify([]), { headers: { "content-type": "application/json;charset=UTF-8" } });
    }
    const matchedIds = vectorResults.matches.map((match2) => match2.id);
    const placeholders = matchedIds.map(() => "?").join(",");
    const stmt = `SELECT * FROM links WHERE id IN (${placeholders})`;
    const { results } = await context.env.DB.prepare(stmt).bind(...matchedIds).all();
    return new Response(JSON.stringify(results), {
      headers: { "content-type": "application/json;charset=UTF-8" }
    });
  } catch (error) {
    return new Response("Search Error", { status: 500 });
  }
}
__name(onRequest2, "onRequest");

// ../.wrangler/tmp/pages-XjN3c4/functionsRoutes-0.5203048261122631.mjs
var routes = [
  {
    routePath: "/api/categories",
    mountPath: "/api",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete]
  },
  {
    routePath: "/api/categories",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/categories",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/categories",
    mountPath: "/api",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut]
  },
  {
    routePath: "/api/nodes",
    mountPath: "/api",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete2]
  },
  {
    routePath: "/api/nodes",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/nodes",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/nodes",
    mountPath: "/api",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut2]
  },
  {
    routePath: "/api/parse",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/api/search",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  }
];

// ../../home/jules/.npm/_npx/32026684e21afda6/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../home/jules/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");

// ../../home/jules/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../home/jules/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// ../.wrangler/tmp/bundle-bwk7Nr/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;

// ../../home/jules/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// ../.wrangler/tmp/bundle-bwk7Nr/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=functionsWorker-0.16067865040496798.mjs.map
