// functions/api/categories.js
// 搭载主动强同步预热 (Strict Cache Warming) 与 ETag 短路引擎

async function warmUpCatCache(env) {
    const { results } = await env.DB.prepare("SELECT * FROM categories ORDER BY sort_order ASC, id ASC").all();
    const jsonString = JSON.stringify(results);
    const etag = '"cat-' + Date.now().toString(36) + '"';
    await env.KV_CACHE.put("all_categories_data", jsonString, { metadata: { etag } });
    return { jsonString, etag };
}

export async function onRequestGet(context) {
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

export async function onRequestPost(context) {
    const { name } = await context.request.json();
    await context.env.DB.prepare("INSERT INTO categories (name) VALUES (?)").bind(name).run();
    
    // 【核心修复】：强同步 await
    await warmUpCatCache(context.env);
    return new Response(JSON.stringify({ success: true }));
}

export async function onRequestPut(context) {
    const data = await context.request.json();
    if (Array.isArray(data)) {
        if (data.length > 0) {
            const chunkSize = 50; // Cloudflare D1 maximum bound parameters limit is 100 per query. We use 2 params per item.
            const statements = [];

            for (let i = 0, len = data.length; i < len; i += chunkSize) {
                const chunk = data.slice(i, i + chunkSize);
                const placeholders = [];
                const params = [];

                for (let j = 0, chunkLen = chunk.length; j < chunkLen; j++) {
                    placeholders.push(`(?, ?)`);
                    params.push(chunk[j].id, i + j);
                }

                const sql = `WITH updated(id, sort_order) AS (VALUES ${placeholders.join(', ')}) UPDATE categories SET sort_order = updated.sort_order FROM updated WHERE categories.id = updated.id`;
                statements.push(context.env.DB.prepare(sql).bind(...params));
            }

            if (statements.length > 0) {
                await context.env.DB.batch(statements);
            }
        }
    } else {
        const { id, name } = data;
        await context.env.DB.prepare("UPDATE categories SET name = ? WHERE id = ?").bind(name, id).run();
    }
    
    // 【核心修复】：强同步 await
    await warmUpCatCache(context.env);
    return new Response(JSON.stringify({ success: true }));
}

export async function onRequestDelete(context) {
    const { id } = await context.request.json();
    await context.env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
    
    // 【核心修复】：强同步 await
    await warmUpCatCache(context.env);
    return new Response(JSON.stringify({ success: true }));
}