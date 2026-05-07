// functions/api/nodes.js
// 统一处理网站节点的 增(POST) 删(DELETE) 改(PUT) 查(GET)

export async function onRequestGet(context) {
    const cacheKey = "all_links_data";
    const cachedData = await context.env.KV_CACHE.get(cacheKey);
    if (cachedData) return new Response(cachedData, { headers: { "content-type": "application/json" } });

    const { results } = await context.env.DB.prepare("SELECT * FROM links ORDER BY id DESC").all();
    const jsonString = JSON.stringify(results);
    await context.env.KV_CACHE.put(cacheKey, jsonString);
    return new Response(jsonString, { headers: { "content-type": "application/json" } });
}

export async function onRequestPost(context) {
    const { title, url, description, category, icon, color_theme } = await context.request.json();
    const dbResult = await context.env.DB.prepare(
        "INSERT INTO links (title, url, description, category, icon, color_theme) VALUES (?, ?, ?, ?, ?, ?) RETURNING id"
    ).bind(title, url, description, category, icon, color_theme).first();
    
    // AI 向量化
    if (context.env.AI && context.env.VECTOR_INDEX) {
        const textToVectorize = `${title} - ${description}`;
        const { data: embeddings } = await context.env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [textToVectorize] });
        await context.env.VECTOR_INDEX.upsert([{ id: dbResult.id.toString(), values: embeddings[0] }]);
    }
    await context.env.KV_CACHE.delete("all_links_data");
    return new Response(JSON.stringify({ success: true }));
}

export async function onRequestPut(context) {
    const { id, title, url, description, category, icon, color_theme } = await context.request.json();
    await context.env.DB.prepare(
        "UPDATE links SET title=?, url=?, description=?, category=?, icon=?, color_theme=? WHERE id=?"
    ).bind(title, url, description, category, icon, color_theme, id).run();

    // 更新 AI 向量库
    if (context.env.AI && context.env.VECTOR_INDEX) {
        const textToVectorize = `${title} - ${description}`;
        const { data: embeddings } = await context.env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [textToVectorize] });
        await context.env.VECTOR_INDEX.upsert([{ id: id.toString(), values: embeddings[0] }]);
    }
    await context.env.KV_CACHE.delete("all_links_data");
    return new Response(JSON.stringify({ success: true }));
}

export async function onRequestDelete(context) {
    const { id } = await context.request.json();
    await context.env.DB.prepare("DELETE FROM links WHERE id = ?").bind(id).run();
    if (context.env.VECTOR_INDEX) {
        await context.env.VECTOR_INDEX.deleteByIds([id.toString()]);
    }
    await context.env.KV_CACHE.delete("all_links_data");
    return new Response(JSON.stringify({ success: true }));
}