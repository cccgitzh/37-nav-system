import { warmUpGenericCache } from './_cache.js';
import { checkAuth } from './_auth.js';

async function warmUpCatCache(env) {
    return warmUpGenericCache(env, "SELECT * FROM categories ORDER BY sort_order ASC, id ASC", "all_categories_data", "cat");
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
    if (!checkAuth(context.request, context.env)) return new Response("Unauthorized", { status: 401 });
    
    const { name } = await context.request.json();
    await context.env.DB.prepare("INSERT INTO categories (name) VALUES (?)").bind(name).run();
    await warmUpCatCache(context.env);
    return new Response(JSON.stringify({ success: true }));
}

export async function onRequestPut(context) {
    if (!checkAuth(context.request, context.env)) return new Response("Unauthorized", { status: 401 });

    const data = await context.request.json();
    if (Array.isArray(data)) {
        if (data.length > 0) {
            const chunkSize = 50;
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
    
    await warmUpCatCache(context.env);
    return new Response(JSON.stringify({ success: true }));
}

export async function onRequestDelete(context) {
    if (!checkAuth(context.request, context.env)) return new Response("Unauthorized", { status: 401 });

    const { id } = await context.request.json();
    await context.env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
    await warmUpCatCache(context.env);
    return new Response(JSON.stringify({ success: true }));
}