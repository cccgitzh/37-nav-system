import { warmUpGenericCache } from './_cache.js';
import { checkAuth } from './_auth.js';

async function warmUpCache(env) {
    // 加入 LIMIT 防御，避免长期运行撑爆内存
    return warmUpGenericCache(env, "SELECT * FROM links ORDER BY id DESC LIMIT 1500", "all_links_data", "v");
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
    if (!checkAuth(context.request, context.env)) return new Response("Unauthorized", { status: 401 });

    const { title, url, description, category, icon, color_theme } = await context.request.json();
    const dbResult = await context.env.DB.prepare(
        "INSERT INTO links (title, url, description, category, icon, color_theme) VALUES (?, ?, ?, ?, ?, ?) RETURNING id"
    ).bind(title, url, description, category, icon, color_theme).first();
    
    if (context.env.AI && context.env.VECTOR_INDEX) {
        const textToVectorize = `${title} - ${description}`;
        const { data: embeddings } = await context.env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [textToVectorize] });
        context.waitUntil(context.env.VECTOR_INDEX.upsert([{ id: dbResult.id.toString(), values: embeddings[0] }]));
    }
    
    await warmUpCache(context.env);
    return new Response(JSON.stringify({ success: true }));
}

export async function onRequestPut(context) {
    if (!checkAuth(context.request, context.env)) return new Response("Unauthorized", { status: 401 });

    const { id, title, url, description, category, icon, color_theme } = await context.request.json();
    await context.env.DB.prepare(
        "UPDATE links SET title=?, url=?, description=?, category=?, icon=?, color_theme=? WHERE id=?"
    ).bind(title, url, description, category, icon, color_theme, id).run();

    if (context.env.AI && context.env.VECTOR_INDEX) {
        const textToVectorize = `${title} - ${description}`;
        const { data: embeddings } = await context.env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [textToVectorize] });
        context.waitUntil(context.env.VECTOR_INDEX.upsert([{ id: id.toString(), values: embeddings[0] }]));
    }
    
    await warmUpCache(context.env);
    return new Response(JSON.stringify({ success: true }));
}

export async function onRequestDelete(context) {
    if (!checkAuth(context.request, context.env)) return new Response("Unauthorized", { status: 401 });

    const { id } = await context.request.json();
    await context.env.DB.prepare("DELETE FROM links WHERE id = ?").bind(id).run();
    if (context.env.VECTOR_INDEX) {
        context.waitUntil(context.env.VECTOR_INDEX.deleteByIds([id.toString()]));
    }
    
    await warmUpCache(context.env);
    return new Response(JSON.stringify({ success: true }));
}