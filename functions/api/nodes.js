// functions/api/nodes.js
// 【升级】搭载主动预热 (Cache Warming) 与 ETag 短路引擎

// 核心预热算法：从 DB 拉取最新数据，打上指纹，注入 KV
async function warmUpCache(env) {
    const { results } = await env.DB.prepare("SELECT * FROM links ORDER BY id DESC").all();
    const jsonString = JSON.stringify(results);
    const etag = '"v-' + Date.now().toString(36) + '"'; // 生成基于时间戳的指纹
    
    // 带有元数据（指纹）的 KV 写入
    await env.KV_CACHE.put("all_links_data", jsonString, { metadata: { etag } });
    return { jsonString, etag };
}

export async function onRequestGet(context) {
    // 获取客户端传来的指纹
    const clientETag = context.request.headers.get("If-None-Match");
    
    // 从 KV 边缘节点极速提取数据与指纹元数据
    let { value, metadata } = await context.env.KV_CACHE.getWithMetadata("all_links_data");
    let currentETag = metadata?.etag;

    // 兜底机制：如果 KV 意外丢失，触发一次实时预热
    if (!value) {
        const fresh = await warmUpCache(context.env);
        value = fresh.jsonString;
        currentETag = fresh.etag;
    }

    // 【极致性能短路】：指纹一致，直接返回 304，传输体积 0 字节
    if (clientETag && clientETag === currentETag) {
        return new Response(null, { 
            status: 304, 
            headers: { 
                "ETag": currentETag, 
                "Cache-Control": "public, max-age=0, must-revalidate",
                "X-Edge-Engine": "37-NAV-QUANTUM"
            } 
        });
    }

    // 返回完整数据与最新指纹
    return new Response(value, {
        headers: {
            "Content-Type": "application/json",
            "ETag": currentETag,
            "Cache-Control": "public, max-age=0, must-revalidate",
            "X-Edge-Engine": "37-NAV-QUANTUM"
        }
    });
}

export async function onRequestPost(context) {
    const { title, url, description, category, icon, color_theme } = await context.request.json();
    const dbResult = await context.env.DB.prepare(
        "INSERT INTO links (title, url, description, category, icon, color_theme) VALUES (?, ?, ?, ?, ?, ?) RETURNING id"
    ).bind(title, url, description, category, icon, color_theme).first();
    
    if (context.env.AI && context.env.VECTOR_INDEX) {
        const textToVectorize = `${title} - ${description}`;
        const { data: embeddings } = await context.env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [textToVectorize] });
        // 向量写入耗时较长，同样丢入后台任务
        context.waitUntil(context.env.VECTOR_INDEX.upsert([{ id: dbResult.id.toString(), values: embeddings[0] }]));
    }
    
    // 【核心巨变】：不再执行 delete() 造成击穿，而是使用 waitUntil 开启后台幽灵任务主动预热
    context.waitUntil(warmUpCache(context.env));
    
    return new Response(JSON.stringify({ success: true }));
}

export async function onRequestPut(context) {
    const { id, title, url, description, category, icon, color_theme } = await context.request.json();
    await context.env.DB.prepare(
        "UPDATE links SET title=?, url=?, description=?, category=?, icon=?, color_theme=? WHERE id=?"
    ).bind(title, url, description, category, icon, color_theme, id).run();

    if (context.env.AI && context.env.VECTOR_INDEX) {
        const textToVectorize = `${title} - ${description}`;
        const { data: embeddings } = await context.env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [textToVectorize] });
        context.waitUntil(context.env.VECTOR_INDEX.upsert([{ id: id.toString(), values: embeddings[0] }]));
    }
    
    context.waitUntil(warmUpCache(context.env));
    return new Response(JSON.stringify({ success: true }));
}

export async function onRequestDelete(context) {
    const { id } = await context.request.json();
    await context.env.DB.prepare("DELETE FROM links WHERE id = ?").bind(id).run();
    if (context.env.VECTOR_INDEX) {
        context.waitUntil(context.env.VECTOR_INDEX.deleteByIds([id.toString()]));
    }
    context.waitUntil(warmUpCache(context.env));
    return new Response(JSON.stringify({ success: true }));
}