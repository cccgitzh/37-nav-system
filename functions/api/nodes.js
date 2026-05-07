// functions/api/nodes.js
// 搭载主动强同步预热 (Strict Cache Warming) 与 ETag 短路引擎

async function warmUpCache(env) {
    const { results } = await env.DB.prepare("SELECT * FROM links ORDER BY id DESC").all();
    const jsonString = JSON.stringify(results);
    const etag = '"v-' + Date.now().toString(36) + '"';
    await env.KV_CACHE.put("all_links_data", jsonString, { metadata: { etag } });
    return { jsonString, etag };
}

export async function onRequestGet(context) {
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

export async function onRequestPost(context) {
    const { title, url, description, category, icon, color_theme } = await context.request.json();
    const dbResult = await context.env.DB.prepare(
        "INSERT INTO links (title, url, description, category, icon, color_theme) VALUES (?, ?, ?, ?, ?, ?) RETURNING id"
    ).bind(title, url, description, category, icon, color_theme).first();
    
    if (context.env.AI && context.env.VECTOR_INDEX) {
        const textToVectorize = `${title} - ${description}`;
        const { data: embeddings } = await context.env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [textToVectorize] });
        context.waitUntil(context.env.VECTOR_INDEX.upsert([{ id: dbResult.id.toString(), values: embeddings[0] }]));
    }
    
    // 【核心修复】：强同步 await，确保 KV 缓存写完再返回给前台，消除刷新延迟
    await warmUpCache(context.env);
    
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
    
    // 【核心修复】：强同步 await
    await warmUpCache(context.env);
    
    return new Response(JSON.stringify({ success: true }));
}

export async function onRequestDelete(context) {
    const { id } = await context.request.json();
    await context.env.DB.prepare("DELETE FROM links WHERE id = ?").bind(id).run();
    if (context.env.VECTOR_INDEX) {
        context.waitUntil(context.env.VECTOR_INDEX.deleteByIds([id.toString()]));
    }
    
    // 【核心修复】：强同步 await
    await warmUpCache(context.env);
    
    return new Response(JSON.stringify({ success: true }));
}